//! Licensing for the desktop runner. Network use is limited to the license
//! API (ids + device hash only). User form data never goes through here.
//!
//! Honest limits: offline licensing cannot be tamper-proof. A determined
//! user with a debugger can patch the binary. This raises the bar
//! (signed licenses, device binding, rollback detection), nothing more.

use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const PUBKEY_B64: &str = include_str!("../license_pubkey.b64");
const CLOCK_SKEW_SECS: i64 = 300;
const VERIFY_EVERY_SECS: i64 = 12 * 3600;

/// Appended to the executable by tools/inject_spec.py (or the web download).
#[derive(Deserialize, Clone)]
pub struct Bundle {
    pub spec: String,
    #[serde(default)]
    pub app_name: Option<String>,
    #[serde(default)]
    pub app_id: Option<String>,
    #[serde(default)]
    pub license_id: Option<String>,
    #[serde(default)]
    pub api_url: Option<String>,
    #[serde(default)]
    pub platform_url: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct Payload {
    pub lid: String,
    pub aid: String,
    pub dev: Option<String>,
    pub iat: Option<i64>,
    pub exp: Option<i64>,
    pub issued: i64,
    pub status: String,
    pub grace_days: f64,
}

#[derive(Deserialize, Serialize, Default)]
struct Local {
    token: String,
    last_seen: i64,
    last_verified: i64,
}

#[derive(Serialize, Clone)]
pub struct Status {
    /// ok | dev | expired | revoked | clock | offline_required | activation_failed
    pub state: String,
    pub message: String,
    pub expires_at: Option<i64>,
    pub activated_at: Option<i64>,
    pub platform_url: Option<String>,
    pub app_name: Option<String>,
}

fn status(state: &str, msg: &str, b: Option<&Bundle>, p: Option<&Payload>) -> Status {
    Status {
        state: state.into(),
        message: msg.into(),
        expires_at: p.and_then(|p| p.exp),
        activated_at: p.and_then(|p| p.iat),
        platform_url: b.and_then(|b| b.platform_url.clone()),
        app_name: b.and_then(|b| b.app_name.clone()),
    }
}

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn verify_token(token: &str) -> Result<Payload, String> {
    let (p, s) = token.split_once('.').ok_or("malformed license")?;
    let raw = B64.decode(p).map_err(|_| "malformed license")?;
    let sig = B64.decode(s).map_err(|_| "malformed license")?;
    let pk: [u8; 32] = B64
        .decode(PUBKEY_B64.trim())
        .map_err(|_| "bad embedded key")?
        .try_into()
        .map_err(|_| "bad embedded key")?;
    let vk = VerifyingKey::from_bytes(&pk).map_err(|_| "bad embedded key")?;
    let sig = Signature::from_slice(&sig).map_err(|_| "malformed license")?;
    vk.verify(&raw, &sig).map_err(|_| "license signature invalid")?;
    serde_json::from_slice(&raw).map_err(|_| "malformed license".to_string())
}

fn device_id(app_id: &str) -> Result<String, String> {
    let m = machine_uid::get().map_err(|e| format!("cannot read machine id: {e}"))?;
    let mut h = Sha256::new();
    h.update(b"uiforge-device-v1:");
    h.update(m.as_bytes());
    h.update(b":");
    h.update(app_id.as_bytes());
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

enum Api {
    Token(String),
    Denied(String), // server answered with a definite refusal
    Unreachable,    // offline / timeout / 5xx
}

fn call(api: &str, path: &str, body: serde_json::Value) -> Api {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(4))
        .timeout(Duration::from_secs(10))
        .build();
    match agent.post(&format!("{}{}", api.trim_end_matches('/'), path)).send_json(body) {
        Ok(r) => match r.into_json::<serde_json::Value>() {
            Ok(v) => match v.get("token").and_then(|t| t.as_str()) {
                Some(t) => Api::Token(t.to_string()),
                None => Api::Unreachable,
            },
            Err(_) => Api::Unreachable,
        },
        Err(ureq::Error::Status(c, r)) if (400..500).contains(&c) && c != 429 => {
            let d = r.into_json::<serde_json::Value>().ok()
                .and_then(|v| v.get("detail").and_then(|d| d.as_str()).map(String::from))
                .unwrap_or_else(|| format!("server refused ({c})"));
            Api::Denied(d)
        }
        Err(_) => Api::Unreachable,
    }
}

fn load(path: &PathBuf) -> Option<Local> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

fn save(path: &PathBuf, l: &Local) {
    if let Some(d) = path.parent() {
        let _ = fs::create_dir_all(d);
    }
    if let Ok(t) = serde_json::to_vec(l) {
        let tmp = path.with_extension("tmp");
        if fs::write(&tmp, t).is_ok() {
            let _ = fs::rename(&tmp, path);
        }
    }
}

/// Full check at startup. `dir` is the app data dir (never wiped here).
pub fn check(dir: &PathBuf, bundle: &Bundle) -> Status {
    let (Some(aid), Some(lid), Some(api)) = (&bundle.app_id, &bundle.license_id, &bundle.api_url) else {
        return status("dev", "unlicensed build", Some(bundle), None);
    };
    let dev = match device_id(aid) {
        Ok(d) => d,
        Err(e) => return status("activation_failed", &e, Some(bundle), None),
    };
    let path = dir.join("license.json");
    let n = now();
    let mut local = load(&path);

    // 1. first activation (needs internet once)
    if local.is_none() {
        match call(api, "/api/licenses/activate", serde_json::json!({"license_id": lid, "app_id": aid, "device_id": dev})) {
            Api::Token(t) => match verify_token(&t) {
                Ok(_) => {
                    local = Some(Local { token: t, last_seen: n, last_verified: n });
                }
                Err(e) => return status("activation_failed", &e, Some(bundle), None),
            },
            Api::Denied(d) => return status("activation_failed", &d, Some(bundle), None),
            Api::Unreachable => {
                return status("activation_failed", "Internet connection is required for the first activation.", Some(bundle), None)
            }
        }
    }
    let mut local = local.unwrap();

    // 2. signature + binding
    let mut p = match verify_token(&local.token) {
        Ok(p) => p,
        Err(e) => return status("activation_failed", &e, Some(bundle), None),
    };
    if &p.lid != lid || &p.aid != aid || p.dev.as_deref() != Some(dev.as_str()) {
        return status("activation_failed", "License does not belong to this app or device.", Some(bundle), None);
    }

    // 3. clock rollback
    if n + CLOCK_SKEW_SECS < local.last_seen || n + CLOCK_SKEW_SECS < p.issued {
        return status("clock", "System clock appears to have been set back. Fix the date/time and restart.", Some(bundle), Some(&p));
    }

    // 4. periodic online verification (silent when offline)
    if n - local.last_verified >= VERIFY_EVERY_SECS || p.status != "active" {
        match call(api, "/api/licenses/verify", serde_json::json!({"license_id": lid, "device_id": dev})) {
            Api::Token(t) => {
                if let Ok(np) = verify_token(&t) {
                    if &np.lid == lid {
                        local.token = t;
                        local.last_verified = n;
                        p = np;
                    }
                }
            }
            Api::Denied(d) => return status("activation_failed", &d, Some(bundle), Some(&p)),
            Api::Unreachable => {}
        }
    }

    // 5. offline grace
    let grace = (p.grace_days * 86400.0) as i64;
    local.last_seen = local.last_seen.max(n);
    save(&path, &local);
    if p.status == "revoked" {
        return status("revoked", "This license has been revoked.", Some(bundle), Some(&p));
    }
    if let Some(exp) = p.exp {
        if n >= exp {
            return status("expired", "Your 30-day license has expired.", Some(bundle), Some(&p));
        }
    }
    if n - local.last_verified > grace {
        return status("offline_required", "Please connect to the internet once to re-verify the license.", Some(bundle), Some(&p));
    }
    status("ok", "", Some(bundle), Some(&p))
}

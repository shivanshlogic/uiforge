//! UIForge desktop runner.
//!
//! Commands exposed to the webview (nothing else, no fs/shell/http plugins):
//!   license_check, get_embedded_spec, save_submission, open_platform
//! The UI spec is only released and Execute only writes while the license
//! is valid, so the gate is enforced in Rust, not just in the page.
//!
//! Bundle trailer appended to the exe / AppImage:
//!   [bundle JSON UTF-8][u64 LE length][8-byte magic "UIFGSPEC"]
//! Appending invalidates an Authenticode signature, so sign after appending.

mod license;

use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::Mutex;

use license::{Bundle, Status};
use serde_json::{json, Value};
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

const MAGIC: &[u8; 8] = b"UIFGSPEC";
const MAX_BUNDLE_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Default)]
struct Gate {
    /// None = not checked yet. Some(None) = dev/unlicensed. Some(Some(exp)) = licensed until exp.
    allowed: Option<Option<i64>>,
}

fn self_path() -> Option<PathBuf> {
    // Inside an AppImage current_exe() is the inner binary; the bundle is
    // appended to the AppImage file itself, which $APPIMAGE points at.
    if let Some(p) = std::env::var_os("APPIMAGE") {
        return Some(PathBuf::from(p));
    }
    std::env::current_exe().ok()
}

fn read_bundle() -> Option<Bundle> {
    let mut f = File::open(self_path()?).ok()?;
    let total = f.metadata().ok()?.len();
    if total < 16 {
        return None;
    }
    f.seek(SeekFrom::End(-16)).ok()?;
    let mut tail = [0u8; 16];
    f.read_exact(&mut tail).ok()?;
    if &tail[8..] != MAGIC {
        return None;
    }
    let len = u64::from_le_bytes(tail[..8].try_into().ok()?);
    if len == 0 || len > MAX_BUNDLE_BYTES || len + 16 > total {
        return None;
    }
    f.seek(SeekFrom::End(-16 - len as i64)).ok()?;
    let mut buf = vec![0u8; len as usize];
    f.read_exact(&mut buf).ok()?;
    serde_json::from_slice(&buf).ok()
}

fn is_valid(g: &Gate) -> bool {
    match g.allowed {
        Some(None) => true,
        Some(Some(exp)) => license::now() < exp,
        None => false,
    }
}

#[tauri::command]
async fn license_check(app: tauri::AppHandle, gate: State<'_, Mutex<Gate>>) -> Result<Status, String> {
    let Some(bundle) = read_bundle() else {
        // plain runner with no bundle = same as the public web app (upload a spec)
        gate.lock().unwrap().allowed = Some(None);
        return Ok(Status { state: "dev".into(), message: "no bundle".into(), expires_at: None, activated_at: None, platform_url: None, app_name: None });
    };
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let st = tauri::async_runtime::spawn_blocking(move || license::check(&dir, &bundle))
        .await
        .map_err(|e| e.to_string())?;
    gate.lock().unwrap().allowed = match st.state.as_str() {
        "ok" => Some(st.expires_at),
        "dev" => Some(None),
        _ => None,
    };
    Ok(st)
}

#[tauri::command]
fn get_embedded_spec(gate: State<'_, Mutex<Gate>>) -> Option<String> {
    if !is_valid(&gate.lock().unwrap()) {
        return None;
    }
    read_bundle().map(|b| b.spec)
}

#[tauri::command]
fn open_platform(app: tauri::AppHandle) -> Result<(), String> {
    // Only ever opens the platform URL baked into this app. JS cannot pick the URL.
    let url = read_bundle().and_then(|b| b.platform_url).ok_or("no platform url")?;
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("bad url".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_submission(app: tauri::AppHandle, gate: State<'_, Mutex<Gate>>, payload: Value) -> Value {
    if !is_valid(&gate.lock().unwrap()) {
        return json!({ "success": false, "message": "License is not active." });
    }
    if !payload.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
        return json!({ "success": false, "message": "No data received." });
    }
    let dir = match app.path().app_data_dir() {
        Ok(d) => d.join("output"),
        Err(e) => return json!({ "success": false, "message": format!("No data dir: {e}") }),
    };
    if let Err(e) = fs::create_dir_all(&dir) {
        return json!({ "success": false, "message": format!("Could not create {}: {e}", dir.display()) });
    }
    let secs = license::now();
    let mut path = dir.join(format!("submission-{secs}.json"));
    let mut n = 1;
    while path.exists() {
        path = dir.join(format!("submission-{secs}-{n}.json"));
        n += 1;
    }
    let text = serde_json::to_string_pretty(&payload).unwrap_or_default();
    match fs::write(&path, text) {
        Ok(_) => {
            let p = path.display().to_string();
            json!({ "success": true, "message": format!("Saved to {p}"), "savedTo": p })
        }
        Err(e) => json!({ "success": false, "message": format!("Could not save: {e}") }),
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(Gate::default()))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![license_check, get_embedded_spec, save_submission, open_platform])
        .run(tauri::generate_context!())
        .expect("error while running UIForge app");
}

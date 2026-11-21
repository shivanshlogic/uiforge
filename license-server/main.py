"""UIForge license service (FastAPI + SQLite).

Receives ONLY license/app metadata: app name, ids, device hash, timestamps.
Never user form data, file paths or local DB content.

Env:
  LICENSE_PRIVATE_KEY_FILE  default keys/private.pem
  LICENSE_DB                default licenses.db
  LICENSE_ADMIN_TOKEN       required for revoke (X-Admin-Token header)
  LICENSE_TERM_SECONDS      default 2592000 (30 days)
  LICENSE_GRACE_DAYS        default 7 (offline grace before online re-verify)
  CORS_ORIGINS              comma list, e.g. https://ui-automation.chipdesignonline.com
"""
from __future__ import annotations

import base64, hmac, json, os, sqlite3, threading, time, uuid
from collections import defaultdict, deque
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

HERE = Path(__file__).resolve().parent
TERM = int(os.environ.get("LICENSE_TERM_SECONDS", 30 * 86400))
GRACE_DAYS = float(os.environ.get("LICENSE_GRACE_DAYS", 7))
ADMIN_TOKEN = os.environ.get("LICENSE_ADMIN_TOKEN", "")
DB_PATH = os.environ.get("LICENSE_DB", str(HERE / "licenses.db"))
KEY_PATH = Path(os.environ.get("LICENSE_PRIVATE_KEY_FILE", HERE / "keys" / "private.pem"))

_key = serialization.load_pem_private_key(KEY_PATH.read_bytes(), password=None)
_db = sqlite3.connect(DB_PATH, check_same_thread=False)
_db.row_factory = sqlite3.Row
_lock = threading.Lock()
with _lock:
    _db.executescript("""
    CREATE TABLE IF NOT EXISTS generated_apps(
      app_id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS licenses(
      license_id TEXT PRIMARY KEY, app_id TEXT NOT NULL REFERENCES generated_apps(app_id),
      created_at INTEGER NOT NULL, activated_at INTEGER, expires_at INTEGER,
      device_id TEXT, revoked_at INTEGER);
    CREATE TABLE IF NOT EXISTS device_activations(
      license_id TEXT, device_id TEXT, first_seen INTEGER, last_verified INTEGER,
      PRIMARY KEY(license_id, device_id));
    CREATE TABLE IF NOT EXISTS license_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT, license_id TEXT, event TEXT, at INTEGER, detail TEXT);
    """)
    _db.commit()


def now() -> int:
    return int(time.time())


def event(lid: str, ev: str, detail: str = "") -> None:
    _db.execute("INSERT INTO license_events(license_id,event,at,detail) VALUES(?,?,?,?)", (lid, ev, now(), detail))


def b64(b: bytes) -> str:
    return base64.b64encode(b).decode()


def sign(row: sqlite3.Row) -> str:
    """token = b64(payload JSON bytes) + '.' + b64(Ed25519 signature of those exact bytes)."""
    status = "revoked" if row["revoked_at"] else "active"
    payload = {
        "lid": row["license_id"], "aid": row["app_id"], "dev": row["device_id"],
        "iat": row["activated_at"], "exp": row["expires_at"],
        "issued": now(), "status": status, "grace_days": GRACE_DAYS,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return b64(raw) + "." + b64(_key.sign(raw))


def require_admin(tok: str | None) -> None:
    if not ADMIN_TOKEN or not tok or not hmac.compare_digest(tok, ADMIN_TOKEN):
        raise HTTPException(401, "admin token required")


# crude per-IP limiter for the open app-creation endpoint (put it behind your auth in production)
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(ip: str, limit: int = 20, window: int = 60) -> None:
    q = _hits[ip]
    t = time.time()
    while q and q[0] < t - window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "too many requests")
    q.append(t)


app = FastAPI(title="UIForge License Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(",") if o.strip()],
    allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-Admin-Token"],
)


class NewApp(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class Activate(BaseModel):
    license_id: str = Field(max_length=64)
    app_id: str = Field(max_length=64)
    device_id: str = Field(min_length=16, max_length=128)


class Verify(BaseModel):
    license_id: str = Field(max_length=64)
    device_id: str = Field(min_length=16, max_length=128)


def get_license(lid: str) -> sqlite3.Row:
    row = _db.execute("SELECT * FROM licenses WHERE license_id=?", (lid,)).fetchone()
    if not row:
        raise HTTPException(404, "unknown license")
    return row


@app.post("/api/apps")
def create_app(body: NewApp, request: Request):
    rate_limit(request.client.host if request.client else "?")
    aid, lid = str(uuid.uuid4()), str(uuid.uuid4())
    with _lock:
        _db.execute("INSERT INTO generated_apps VALUES(?,?,?)", (aid, body.name, now()))
        _db.execute("INSERT INTO licenses(license_id,app_id,created_at) VALUES(?,?,?)", (lid, aid, now()))
        event(lid, "created", body.name)
        _db.commit()
    return {"app_id": aid, "license_id": lid}


@app.post("/api/licenses/activate")
def activate(body: Activate):
    with _lock:
        row = get_license(body.license_id)
        if row["app_id"] != body.app_id:
            raise HTTPException(404, "unknown license")
        if row["revoked_at"]:
            event(body.license_id, "activate_denied_revoked"); _db.commit()
            return {"status": "revoked", "token": sign(row)}
        if row["activated_at"] is None:  # the 30 days start HERE, on first successful activation
            t = now()
            _db.execute("UPDATE licenses SET activated_at=?, expires_at=?, device_id=? WHERE license_id=?",
                        (t, t + TERM, body.device_id, body.license_id))
            _db.execute("INSERT INTO device_activations VALUES(?,?,?,?)", (body.license_id, body.device_id, t, t))
            event(body.license_id, "activated", body.device_id[:12])
            _db.commit()
            row = get_license(body.license_id)
        elif row["device_id"] != body.device_id:
            event(body.license_id, "activate_denied_other_device", body.device_id[:12]); _db.commit()
            raise HTTPException(409, "license already activated on another device")
        # same device re-activating (e.g. local state wiped): same dates, never extended
        return {"status": "revoked" if row["revoked_at"] else "active", "token": sign(row)}


@app.post("/api/licenses/verify")
def verify(body: Verify):
    with _lock:
        row = get_license(body.license_id)
        if row["activated_at"] is None or row["device_id"] != body.device_id:
            raise HTTPException(409, "not activated on this device")
        _db.execute("UPDATE device_activations SET last_verified=? WHERE license_id=? AND device_id=?",
                    (now(), body.license_id, body.device_id))
        event(body.license_id, "verified"); _db.commit()
        status = "revoked" if row["revoked_at"] else ("expired" if row["expires_at"] <= now() else "active")
        return {"status": status, "token": sign(row)}


@app.get("/api/licenses/{license_id}")
def license_status(license_id: str):
    """Public status by (unguessable UUID) id. No device id or secrets returned."""
    row = get_license(license_id)
    status = ("revoked" if row["revoked_at"] else "not_activated" if row["activated_at"] is None
              else "expired" if row["expires_at"] <= now() else "active")
    return {"license_id": license_id, "app_id": row["app_id"], "status": status,
            "activated_at": row["activated_at"], "expires_at": row["expires_at"]}


@app.post("/api/licenses/{license_id}/revoke")
def revoke(license_id: str, x_admin_token: str | None = Header(default=None)):
    require_admin(x_admin_token)
    with _lock:
        get_license(license_id)
        _db.execute("UPDATE licenses SET revoked_at=? WHERE license_id=?", (now(), license_id))
        event(license_id, "revoked"); _db.commit()
    return {"license_id": license_id, "status": "revoked"}

import base64, importlib, json, os, sys, tempfile, time
from pathlib import Path
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

@pytest.fixture()
def env():
    d = Path(tempfile.mkdtemp())
    k = Ed25519PrivateKey.generate()
    (d / "p.pem").write_bytes(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    os.environ.update(LICENSE_PRIVATE_KEY_FILE=str(d / "p.pem"), LICENSE_DB=str(d / "t.db"), LICENSE_ADMIN_TOKEN="adm", LICENSE_TERM_SECONDS="3600")
    sys.path.insert(0, str(Path(__file__).parent))
    sys.modules.pop("main", None)
    import main
    from fastapi.testclient import TestClient
    return TestClient(main.app), k.public_key()

DEV = "d" * 32

def payload(tok, pub):
    p, s = tok.split(".")
    raw = base64.b64decode(p)
    pub.verify(base64.b64decode(s), raw)  # raises if bad
    return json.loads(raw)

def test_lifecycle(env):
    c, pub = env
    r = c.post("/api/apps", json={"name": "X"}).json()
    ids = {"license_id": r["license_id"], "app_id": r["app_id"]}
    assert c.get(f"/api/licenses/{ids['license_id']}").json()["status"] == "not_activated"
    time.sleep(0.01)
    a = c.post("/api/licenses/activate", json={**ids, "device_id": DEV}).json()
    p = payload(a["token"], pub)
    assert p["exp"] - p["iat"] == 3600 and p["dev"] == DEV
    # re-activate same device: dates unchanged; other device: 409
    p2 = payload(c.post("/api/licenses/activate", json={**ids, "device_id": DEV}).json()["token"], pub)
    assert p2["iat"] == p["iat"] and p2["exp"] == p["exp"]
    assert c.post("/api/licenses/activate", json={**ids, "device_id": "e" * 32}).status_code == 409
    assert c.post("/api/licenses/verify", json={"license_id": ids["license_id"], "device_id": DEV}).json()["status"] == "active"
    # revoke needs admin
    assert c.post(f"/api/licenses/{ids['license_id']}/revoke").status_code == 401
    assert c.post(f"/api/licenses/{ids['license_id']}/revoke", headers={"X-Admin-Token": "adm"}).status_code == 200
    v = c.post("/api/licenses/verify", json={"license_id": ids["license_id"], "device_id": DEV}).json()
    assert v["status"] == "revoked" and payload(v["token"], pub)["status"] == "revoked"
    # tampered token fails verification
    p_, s_ = v["token"].split(".")
    bad = base64.b64encode(base64.b64decode(p_).replace(b"revoked", b"active_")).decode() + "." + s_
    with pytest.raises(Exception):
        payload(bad, pub)

"""One-time: python keygen.py
Writes keys/private.pem (STAYS ON THE SERVER, never commit/ship it) and
../online-server/src-tauri/license_pubkey.b64 (embedded into the desktop
runner at build time). Re-running refuses to overwrite an existing key."""
import base64, sys
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

here = Path(__file__).resolve().parent
priv_path = here / "keys" / "private.pem"
pub_path = here.parent / "online-server" / "src-tauri" / "license_pubkey.b64"
if priv_path.exists():
    sys.exit(f"{priv_path} already exists; refusing to overwrite")
priv_path.parent.mkdir(exist_ok=True)
k = Ed25519PrivateKey.generate()
priv_path.write_bytes(k.private_bytes(
    serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
priv_path.chmod(0o600)
raw = k.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
pub_path.write_text(base64.b64encode(raw).decode())
print("private key:", priv_path, "\npublic key :", pub_path, "\nRebuild the runner so it embeds the new public key.")

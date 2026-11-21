fn main() {
    if !std::path::Path::new("license_pubkey.b64").exists() {
        panic!("src-tauri/license_pubkey.b64 missing: run `python license-server/keygen.py` first");
    }
    println!("cargo:rerun-if-changed=license_pubkey.b64");
    tauri_build::build()
}

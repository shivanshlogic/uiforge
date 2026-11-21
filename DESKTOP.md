# Desktop app + license (add-on)

Setup once
1. `cd license-server && pip install -r requirements.txt && python keygen.py`
   (private key stays in `license-server/keys/`, public key goes to `online-server/src-tauri/license_pubkey.b64`; commit the public one)
2. Run service: `LICENSE_ADMIN_TOKEN=<secret> CORS_ORIGINS=https://<your-site> uvicorn main:app --port 9000`
   (HTTPS + reverse proxy in production; protect `POST /api/apps` with your login)
3. Build runners: GitHub Actions `build-runner` (Windows). Linux: `cd online-server && npx tauri build --no-bundle`.
   Put results in `online-server/public/runners/` as `uiforge-runner-windows.exe` and `uiforge-runner-linux`, then `npm run build`.
4. Set `VITE_LICENSE_API_URL=https://<license-service>` when building the site.

Flow: upload .txt -> "Download Desktop App" -> site registers app+license (metadata only), appends spec+ids to the runner in the browser, downloads. First launch activates (30 days start then). Revoke: `POST /api/licenses/{id}/revoke` with `X-Admin-Token`.

CLI packaging (no browser): `tools/inject_spec.py`.

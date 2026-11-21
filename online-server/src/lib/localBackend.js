/**
 * Fixed address of the LOCAL BACKEND -- a completely separate app the
 * visitor runs on their OWN machine (see ../local-backend/), not this
 * site. Every Browse/Execute call goes here directly from the browser --
 * this site (wherever it's hosted) is never involved in that request at
 * all, not even as a relay. Change the port here (and to match in
 * local-backend/app.py's --port default) if you need a different one.
 */
export const LOCAL_BACKEND_URL = 'http://127.0.0.1:8765'

/** True when running inside the Tauri desktop app (withGlobalTauri). In
 * that case Browse/Execute use native Tauri commands and the Python
 * local backend is not involved at all. The web version is unchanged. */
export const isTauri = () => typeof window !== 'undefined' && !!window.__TAURI__

/** Desktop only. Startup license check (activation / expiry / revocation). */
export async function licenseCheck() {
  return window.__TAURI__.core.invoke('license_check')
}

/** The UI spec (.txt) embedded in the desktop executable, or null. The
 * Rust side only releases it while the license is valid. */
export async function getEmbeddedSpec() {
  if (!isTauri()) return null
  return window.__TAURI__.core.invoke('get_embedded_spec')
}

/**
 * Friendly wrapper around fetch() for calls to the local backend: turns
 * "connection refused" (the backend app isn't running) into a clear
 * message instead of a cryptic network error.
 */
export async function fetchLocal(path, options) {
  let resp
  try {
    resp = await fetch(LOCAL_BACKEND_URL + path, options)
  } catch (err) {
    throw new Error(
      `Could not reach the Local Backend at ${LOCAL_BACKEND_URL}. ` +
        `Make sure it is running on your computer, then try again.`
    )
  }
  return resp
}

/** GET {LOCAL_BACKEND}/select-gds -- opens a REAL native OS file dialog
 * on the user's machine (PowerShell/osascript/zenity, see
 * local-backend/native_dialog.py) and returns the absolute path chosen.
 * Returns {path: null, error: null} if cancelled, or
 * {path: null, error: "..."} if no native dialog tool exists on that
 * machine -- callers should show `error` under the Browse button rather
 * than treat it as a connectivity failure. */
export async function pickFile() {
  if (isTauri()) {
    const path = await window.__TAURI__.dialog.open({ multiple: false, directory: false })
    return { path: path || null, error: null }
  }
  const resp = await fetchLocal('/select-gds')
  return resp.json()
}

/** POST {LOCAL_BACKEND}/execute with the page's current field values,
 * sent directly as the JSON body -- e.g. {"gds": "...", "script": "..."}
 * for a page whose Input fields use explicit ids `gds`/`script`. The
 * backend saves this to output/ and returns the FULL absolute path it
 * used, in `savedTo` -- browser-side saving can't report a real path at
 * all (browsers hide it deliberately), which is exactly why this goes
 * through the local backend instead of a client-only save. */
export async function executeLocal(payload) {
  if (isTauri()) return window.__TAURI__.core.invoke('save_submission', { payload })
  const resp = await fetchLocal('/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return resp.json()
}

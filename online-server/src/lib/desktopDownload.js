// Web-only: turns the already-parsed spec into a downloadable desktop app.
// Flow: register app+license on the license service (metadata only) ->
// fetch the prebuilt portable runner (static file) -> append the bundle
// -> save. The spec text and nothing else is embedded; no user data exists
// at this point and none is sent anywhere.
export const LICENSE_API_URL = import.meta.env.VITE_LICENSE_API_URL || 'http://127.0.0.1:9000'

export const RUNNERS = {
  windows: { url: '/runners/uiforge-runner-windows.exe', ext: '.exe', label: 'Windows (.exe)' },
  linux: { url: '/runners/uiforge-runner-linux', ext: '-linux', label: 'Linux (portable binary)' },
}

const MAGIC = new TextEncoder().encode('UIFGSPEC')

export async function registerApp(name) {
  const r = await fetch(LICENSE_API_URL + '/api/apps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).catch(() => {
    throw new Error('License service is not reachable. Please try again later.')
  })
  if (!r.ok) throw new Error(`License service refused the request (${r.status}).`)
  return r.json() // {app_id, license_id}
}

export async function licenseStatus(licenseId) {
  const r = await fetch(`${LICENSE_API_URL}/api/licenses/${encodeURIComponent(licenseId)}`)
  if (!r.ok) throw new Error(`Status unavailable (${r.status}).`)
  return r.json()
}

export function buildDownload(runnerBytes, bundle) {
  const data = new TextEncoder().encode(JSON.stringify(bundle))
  const trailer = new Uint8Array(data.length + 16)
  trailer.set(data, 0)
  new DataView(trailer.buffer).setBigUint64(data.length, BigInt(data.length), true)
  trailer.set(MAGIC, data.length + 8)
  return new Blob([runnerBytes, trailer], { type: 'application/octet-stream' })
}

export async function createDesktopApp({ os, specText, name }) {
  const runner = RUNNERS[os]
  const resp = await fetch(runner.url)
  const ct = resp.headers.get('content-type') || ''
  if (!resp.ok || ct.includes('text/html')) {
    throw new Error(`The ${runner.label} runner has not been published on this site yet.`)
  }
  const runnerBytes = await resp.arrayBuffer()
  const ids = await registerApp(name)
  const bundle = {
    v: 1,
    spec: specText,
    app_name: name,
    app_id: ids.app_id,
    license_id: ids.license_id,
    api_url: LICENSE_API_URL,
    platform_url: window.location.origin,
  }
  const safe = name.replace(/[^A-Za-z0-9_-]+/g, '') || 'GeneratedUI'
  const blob = buildDownload(runnerBytes, bundle)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safe + runner.ext
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return ids
}

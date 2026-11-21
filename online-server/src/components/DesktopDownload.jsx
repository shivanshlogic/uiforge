import { useState } from 'react'
import { Button } from './ui/primitives.jsx'
import { RUNNERS, createDesktopApp, licenseStatus } from '../lib/desktopDownload.js'

const fmt = (t) => (t ? new Date(t * 1000).toLocaleString() : '-')

function detectOs() {
  return /windows/i.test(navigator.userAgent) ? 'windows' : 'linux'
}

export default function DesktopDownload({ spec, specText }) {
  const [os, setOs] = useState(detectOs)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null) // {app_id, license_id}
  const [lic, setLic] = useState(null)

  const name = spec.pageName || spec.pageTitle || 'GeneratedUI'

  async function onDownload() {
    setBusy(true); setError(null); setLic(null)
    try {
      const ids = await createDesktopApp({ os, specText, name })
      setInfo(ids)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function refresh() {
    try { setLic(await licenseStatus(info.license_id)) } catch (e) { setError(e.message) }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 pt-6">
      <div className="rounded-md border border-white/15 bg-white/5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-white">Desktop application</span>
          <select
            value={os}
            onChange={(e) => setOs(e.target.value)}
            className="rounded-md border border-white/25 bg-black px-2 py-1.5 text-sm text-white"
          >
            {Object.entries(RUNNERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <Button variant="primary" disabled={busy} onClick={onDownload}>
            {busy ? 'Preparing...' : 'Download Desktop App'}
          </Button>
          <span className="text-xs text-white/50">
            Runs offline, data stays on your computer. 30-day license starts on first launch.
          </span>
        </div>
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        {info && (
          <div className="mt-3 text-sm text-white/80">
            <p>Downloaded. License ID: <code className="text-white">{info.license_id}</code></p>
            <div className="mt-1 flex items-center gap-3">
              <Button size="sm" onClick={refresh}>Check license status</Button>
              {lic && (
                <span>
                  Status: <b className="text-white">{lic.status.replace('_', ' ')}</b>
                  {' '}| Activated: {fmt(lic.activated_at)} | Expires: {fmt(lic.expires_at)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

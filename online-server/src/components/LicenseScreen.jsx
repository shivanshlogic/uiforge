import { getEmbeddedSpec } from '../lib/localBackend.js'

const TITLES = {
  expired: 'Your license has expired',
  revoked: 'This license was revoked',
  clock: 'System clock problem',
  offline_required: 'Online check required',
  activation_failed: 'Could not activate',
}

// Desktop only. Your data is never deleted when access is blocked.
export default function LicenseScreen({ lic, onRetry }) {
  const exp = lic.expires_at ? new Date(lic.expires_at * 1000).toLocaleString() : null
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <h1 className="text-2xl font-bold text-white">{TITLES[lic.state] || 'License problem'}</h1>
      <p className="max-w-md text-sm text-white/70">{lic.message}</p>
      {exp && lic.state === 'expired' && <p className="text-xs text-white/50">Expired on {exp}</p>}
      <p className="max-w-md text-xs text-white/50">Your saved data is untouched and stays on this computer.</p>
      <div className="mt-2 flex gap-3">
        {lic.platform_url && (
          <button
            className="rounded-md border border-green-600 bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
            onClick={() => window.__TAURI__.core.invoke('open_platform')}
          >
            Get a new license
          </button>
        )}
        <button
          className="rounded-md border border-white/25 px-4 py-2 text-sm text-white hover:bg-white/10"
          onClick={onRetry}
        >
          Try again
        </button>
      </div>
    </div>
  )
}

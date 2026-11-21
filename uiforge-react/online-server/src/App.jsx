import { useRef, useState } from 'react'
import AppShellNavbar from './components/AppShellNavbar.jsx'
import GeneratedPage from './components/GeneratedPage.jsx'
import { parseGridTxt, GridParseError } from './lib/gridParser.js'
import { buildSpec, GridGenerationError } from './lib/buildSpec.js'

export default function App() {
  const [spec, setSpec] = useState(null)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  function handleUploadClick() {
    fileInputRef.current?.click()
  }

  function handleFileChosen(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same filename later
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseGridTxt(reader.result)
        const nextSpec = buildSpec(parsed)
        setSpec(nextSpec)
        setError(null)
      } catch (err) {
        if (err instanceof GridParseError || err instanceof GridGenerationError) {
          setError(err.message)
        } else {
          setError(String(err))
        }
      }
    }
    reader.onerror = () => setError('Could not read file: ' + reader.error)
    reader.readAsText(file)
  }

  return (
    <div className="min-h-screen bg-black">
      <AppShellNavbar onUploadClick={handleUploadClick} />
      {/* A completely standard, invisible native file input -- the
          browser's own "Open" dialog, nothing custom. Its content never
          leaves the browser tab: parseGridTxt/buildSpec run entirely
          client-side (see src/lib/), so there's no server anywhere in
          this flow at all -- this whole app can be a static export. */}
      <input ref={fileInputRef} type="file" accept=".txt" onChange={handleFileChosen} style={{ display: 'none' }} />

      {error && (
        <div className="mx-auto mt-6 max-w-2xl rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {spec ? (
        <GeneratedPage spec={spec} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-white/40">
          <p className="text-sm">No file loaded yet.</p>
          <p className="text-xs">Click the upload icon above to pick a .txt requirement file.</p>
        </div>
      )}
    </div>
  )
}

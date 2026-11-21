/**
 * Saves the Execute payload as a JSON file straight from the browser --
 * the local Python backend is NOT involved in this at all, unlike
 * Browse (which needs it to get a real filesystem path -- see
 * localBackend.js). This is the opposite case: we already HAVE all the
 * data (the form values), we just need to let the user write it
 * wherever they want, and a browser can do that entirely on its own.
 *
 * Two paths, in order of preference:
 *
 * 1. window.showSaveFilePicker() -- the File System Access API. Opens a
 *    REAL native "Save As" dialog (the OS's own file picker -- Explorer
 *    on Windows, Finder on macOS, GTK/KDE's picker on Linux) and lets
 *    the user choose any folder + filename. Only in Chromium browsers
 *    (Chrome, Edge, Opera) on ANY OS, including Linux -- Firefox and
 *    Safari don't implement it yet.
 *
 * 2. Plain <a download> + Blob -- works in every browser everywhere,
 *    but always goes to the browser's configured Downloads location; it
 *    cannot show a folder picker itself.
 *
 * The picker path (1) is tried first and (2) is the automatic fallback
 * whenever (1) isn't available.
 */
export async function saveExecutePayload(payload, suggestedName = 'submission.json') {
  const json = JSON.stringify(payload, null, 2)

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(json)
      await writable.close()
      return { success: true, message: `Saved as "${handle.name}".` }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        // User closed the dialog without picking a location -- not an
        // error, just nothing to report back as a failure.
        return { success: false, message: null }
      }
      throw err
    }
  }

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = suggestedName
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
  return {
    success: true,
    message: `This browser can't show a Save As dialog, so "${suggestedName}" was sent to your Downloads folder instead.`,
  }
}

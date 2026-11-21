import { useState, useCallback, useEffect } from 'react'
import FieldRenderer from './FieldRenderer.jsx'
import { executeLocal } from '../lib/localBackend.js'

/**
 * Renders an entire generated page straight from the data spec (see
 * lib/buildSpec.js) -- no JSX text, no compile step, no eval(). One
 * `values` state object holds every field's current value, keyed by
 * component id (this includes the active-tab name too, keyed by the
 * TABS component's own id -- so it behaves like any other field); Execute
 * reads exactly the ids in spec.dataFieldIds out of it. `values` is wiped
 * back to {} every time `spec` changes (see the effect below) -- so
 * switching to a different uploaded file always starts completely blank,
 * never carrying over a previous file's values.
 *
 * If the page has a TABS line, `spec.tabsComponent` is set and the tab
 * bar renders here as its OWN element, ABOVE the content box -- real
 * page-level navigation, not a grid cell sitting inside the box like
 * every other component. The box below it then shows ONLY the currently
 * active tab's own components (spec.tabGroups[activeTab]), in that tab's
 * own independent row/col grid. Any OTHER root-level components (rare,
 * but possible if a page mixes untabbed content with tabs) still render
 * in their own box first, exactly like a page with no tabs at all.
 */
export default function GeneratedPage({ spec }) {
  const [values, setValues] = useState({})

  // Every time a NEW file is uploaded, App.jsx builds a brand new `spec`
  // object (buildSpec always returns a fresh object, never reuses the
  // old one) -- so `spec` here is a new reference each time, whether or
  // not this is the very first file or the fifth one. Reacting to that
  // by wiping `values` unconditionally means old field values from a
  // previous file can NEVER leak into a newly loaded one, even if both
  // files happen to reuse the same variable name (e.g. both using
  // `filePath`) -- there's simply nothing left over to leak.
  useEffect(() => {
    setValues({})
  }, [spec])

  const setFieldValue = useCallback((id, val) => {
    setValues((prev) => ({ ...prev, [id]: val }))
  }, [])

  // Lets the user upload a small text file that just LISTS the variable
  // names they want (e.g. "input1id, textareaid" or one per line) --
  // NOT a data file itself. We read it client-side, pull exactly those
  // ids' current values out of `values`, and send only that small
  // subset to the SAME /execute endpoint the Execute button already
  // uses. The backend doesn't need to know or care that this is a
  // subset rather than a full submission -- it just saves whatever JSON
  // it's given into output/ and hands back the full absolute path,
  // which we show in the alert.
  const handleIdsFileUpload = useCallback(
    async (e) => {
      const file = e.target.files && e.target.files[0]
      e.target.value = '' // so choosing the same file again still fires onChange
      if (!file) return

      const text = await file.text()
      const ids = text
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)

      if (ids.length === 0) {
        alert('That file has no ids in it. List the variable names you want, separated by commas or new lines.')
        return
      }

      const subset = {}
      for (const id of ids) subset[id] = values[id]

      try {
        const data = await executeLocal(subset)
        alert(data.message || (data.success ? 'Saved.' : 'Could not save -- is the local backend running?'))
      } catch (err) {
        alert(err.message || String(err))
      }
    },
    [values]
  )

  const executePayload = {}
  for (const id of spec.dataFieldIds) executePayload[id] = values[id]

  const tabsComp = spec.tabsComponent
  const tabNames = tabsComp ? (tabsComp.props.tabs || '').split(',').map((s) => s.trim()).filter(Boolean) : []
  const activeTab = tabsComp ? values[tabsComp.id] || tabNames[0] || '' : null
  const activeGroup = tabsComp ? spec.tabGroups[activeTab] : null

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {(spec.pageTitle || spec.description) && (
        <div className="mb-6">
          {spec.pageTitle && <h1 className="text-2xl font-bold tracking-tight text-white">{spec.pageTitle}</h1>}
          {spec.description && <p className="mt-1 text-sm text-white/50">{spec.description}</p>}
        </div>
      )}

      {/* Any untabbed root components render first, in their own normal
          box -- exactly like a page with no TABS line at all. */}
      {spec.components.length > 0 && (
        <div className="mb-6 overflow-x-auto rounded-lg border border-white/12 bg-[#0A0A0A] p-6">
          <div
            className="box-border grid gap-x-6 gap-y-4 p-2"
            style={{
              gridTemplateColumns: `repeat(${spec.cols}, max-content)`,
              gridTemplateRows: `repeat(${spec.rows}, auto)`,
            }}
          >
            {spec.components.map((comp) => (
              <div key={comp.id} style={{ gridRow: comp.row + 1, gridColumn: comp.col + 1 }} className="flex items-center">
                <FieldRenderer
                  comp={comp}
                  value={values[comp.id]}
                  onChange={(v) => setFieldValue(comp.id, v)}
                  allValues={executePayload}
                  onFillTarget={setFieldValue}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {tabsComp && (
        <>
          {/* GLOBAL tab bar -- sits ABOVE the box, spanning full width,
              not inside it. This is what makes it real navigation rather
              than just another catalog widget. */}
          <div className="flex gap-1 border-b border-white/12">
            {tabNames.map((t) => (
              <button
                key={t}
                onClick={() => setFieldValue(tabsComp.id, t)}
                className={
                  '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ' +
                  (t === activeTab
                    ? 'border-green-500 text-green-400'
                    : 'border-transparent text-white/50 hover:text-white')
                }
              >
                {t}
              </button>
            ))}
          </div>

          {/* The box shows ONLY the active tab's own components, in that
              tab's own independent row/col grid. */}
          <div className="overflow-x-auto rounded-b-lg border border-t-0 border-white/12 bg-[#0A0A0A] p-6">
            {activeGroup && activeGroup.components.length > 0 ? (
              <div
                className="box-border grid gap-x-6 gap-y-4 p-2"
                style={{
                  gridTemplateColumns: `repeat(${activeGroup.cols}, max-content)`,
                  gridTemplateRows: `repeat(${activeGroup.rows}, auto)`,
                }}
              >
                {activeGroup.components.map((comp) => (
                  <div key={comp.id} style={{ gridRow: comp.row + 1, gridColumn: comp.col + 1 }} className="flex items-center">
                    <FieldRenderer
                      comp={comp}
                      value={values[comp.id]}
                      onChange={(v) => setFieldValue(comp.id, v)}
                      allValues={executePayload}
                      onFillTarget={setFieldValue}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/40">This tab has no components yet.</p>
            )}
          </div>
        </>
      )}

      {/* Independent of the generated form itself -- lets the user
          upload a small file that just names which fields they want,
          and saves only those fields' current values to output/. See
          handleIdsFileUpload above. */}
      <div className="mt-6 border-t border-white/10 pt-6">
        <label className="mb-2 block text-sm font-medium text-white/70">Extract specific fields</label>
        <input
          type="file"
          accept=".txt,.csv"
          onChange={handleIdsFileUpload}
          className="text-sm text-white/70 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white/80 hover:file:bg-white/20"
        />
      </div>
    </div>
  )
}

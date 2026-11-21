// Fixed chrome -- always mounted, NOT a catalog component, appears on
// every screen. The upload button now calls a prop function instead of
// window.uiforgeLoadFile (there's no global-script shell anymore -- this
// is App.jsx's own onUploadClick handler, passed down normally).
export default function AppShellNavbar({ onUploadClick }) {
  return (
    <nav className="flex items-center justify-between border-b border-white/10 bg-green-800 px-6 py-4">
      <div className="flex items-center gap-3">
        <span className="font-display text-lg font-bold text-white">LogicKnots</span>
        <button
          title="Upload a .txt requirement file"
          onClick={onUploadClick}
          className="flex items-center justify-center rounded-md p-1.5 text-white/80 hover:bg-white/15 hover:text-white transition-colors"
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1={12} y1={3} x2={12} y2={15} />
          </svg>
        </button>
      </div>
      <span className="font-display text-lg font-semibold text-white/90">UI Automation</span>
      <div className="flex items-center justify-center rounded-full bg-white/15 font-medium text-white h-7 w-7 text-xs">US</div>
    </nav>
  )
}

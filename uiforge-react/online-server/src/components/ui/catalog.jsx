// Ported directly from assets/ui_components.js -- same markup/classes.
import { useState } from 'react'

export function Navbar({ brand = 'App', links = [] }) {
  return (
    <nav className="flex items-center justify-between rounded-md border border-white/15 bg-black px-5 py-3">
      <span className="text-base font-bold text-green-400">{brand}</span>
      <div className="flex items-center gap-5">
        {links.map((l) => (
          <a key={l.href || l.label} href={l.href || '#'} className="text-sm text-white/60 hover:text-white transition-colors">
            {l.label}
          </a>
        ))}
      </div>
    </nav>
  )
}

export function LabeledInput({ label, placeholder, type = 'text', value, onChange, disabled = false, size }) {
  return (
    <div className="inline-flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-white/70">{label}</label>}
      <input
        type={type}
        placeholder={placeholder}
        size={size}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="rounded-md border border-white/20 bg-black px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:opacity-40"
      />
    </div>
  )
}

export function CardBlock({ title, text }) {
  return (
    <div className="rounded-md border border-white/15 bg-black p-4">
      {title && <h4 className="mb-1 text-sm font-semibold text-white">{title}</h4>}
      {text && <p className="text-sm text-white/60">{text}</p>}
    </div>
  )
}

export function LinkText({ text, href = '#' }) {
  return (
    <a href={href} className="text-sm font-medium text-green-400 underline underline-offset-2 hover:text-green-300">
      {text}
    </a>
  )
}

export function Slider({ min = 0, max = 100, value, onChange, label }) {
  return (
    <div className="w-48">
      {label && (
        <div className="mb-1 flex justify-between text-xs text-white/60">
          <span>{label}</span>
          <span>{value}</span>
        </div>
      )}
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange?.(Number(e.target.value))} className="w-full accent-green-500" />
    </div>
  )
}

export function Tabs({ tabs = [], active, onChange }) {
  return (
    <div className="inline-block">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => onChange?.(t)}
            className={
              'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ' +
              (t === active ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-white/20 text-white/70 hover:border-white/40 hover:text-white')
            }
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mt-2 text-sm text-white/50">{active ? active + ' content goes here.' : ''}</div>
    </div>
  )
}

export function Pagination({ page = 1, totalPages = 1, onChange }) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
  return (
    <div className="flex items-center gap-1">
      <button disabled={page <= 1} onClick={() => onChange?.(page - 1)} className="rounded-md px-2 py-1 text-sm text-white/60 hover:bg-white/10 disabled:opacity-30">
        ‹
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onChange?.(p)}
          className={'h-7 w-7 rounded-md border text-sm ' + (p === page ? 'border-green-500 bg-green-500/15 text-green-400' : 'border-white/15 text-white/70 hover:border-white/30')}
        >
          {p}
        </button>
      ))}
      <button disabled={page >= totalPages} onClick={() => onChange?.(page + 1)} className="rounded-md px-2 py-1 text-sm text-white/60 hover:bg-white/10 disabled:opacity-30">
        ›
      </button>
    </div>
  )
}

export function PaginationField({ totalPages = 5 }) {
  const [page, setPage] = useState(1)
  return <Pagination page={page} totalPages={totalPages} onChange={setPage} />
}

export function Accordion({ items = [] }) {
  const [openIndex, setOpenIndex] = useState(null)
  return (
    <div className="divide-y divide-white/10 rounded-md border border-white/15">
      {items.map((item, i) => (
        <div key={item.title}>
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-white hover:bg-white/5"
          >
            {item.title}
            <span className={openIndex === i ? 'text-green-500' : 'text-white/40'}>{openIndex === i ? '\u2212' : '+'}</span>
          </button>
          {openIndex === i && <div className="px-4 pb-3 text-sm text-white/60">{item.content}</div>}
        </div>
      ))}
    </div>
  )
}

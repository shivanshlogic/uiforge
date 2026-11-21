// Ported directly from assets/ui_components.js -- same markup, same
// Tailwind classes, just written as real JSX instead of React.createElement
// calls baked into a template string. Nothing about how these look or
// behave changed.
import { useState, useRef, useEffect } from 'react'

function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function Button({ variant = 'default', size = 'md', disabled = false, onClick, type = 'button', className = '', children }) {
  const variants = {
    default: 'bg-transparent border border-white/25 text-white hover:border-green-500 hover:text-green-400',
    primary: 'bg-green-600 border border-green-600 text-white hover:bg-green-500',
    outline: 'border border-white/25 text-white hover:bg-white/10',
    ghost: 'text-white hover:bg-white/10',
    destructive: 'bg-red-600 border border-red-600 text-white hover:bg-red-500',
  }
  const sizes = { sm: 'text-sm px-3 py-1.5', md: 'text-sm px-4 py-2', lg: 'text-base px-5 py-2.5' }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant] || variants.default,
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  )
}

export function Input({ type = 'text', placeholder, value, onChange, onBlur, disabled = false, className = '', hasError = false, ...rest }) {
  // No w-full on purpose: an input's natural width should follow its own
  // content (placeholder length via the native "size" attribute, passed
  // through **rest below), not stretch to fill whatever column width a
  // parent grid happens to hand it.
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
      className={cn(
        'rounded-md border bg-black px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:ring-1 disabled:opacity-40',
        hasError
          ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
          : 'border-white/20 focus:border-green-500 focus:ring-green-500',
        className
      )}
      {...rest}
    />
  )
}

export function Textarea({ placeholder, value, onChange, rows = 3, cols, disabled = false, className = '' }) {
  return (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={rows}
      cols={cols}
      disabled={disabled}
      className={cn(
        'rounded-md border border-white/20 bg-black px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:opacity-40',
        className
      )}
    />
  )
}

export function Checkbox({ checked, onChange, label, disabled = false }) {
  return (
    <label className={cn('flex items-center gap-2 text-sm text-white', disabled ? 'opacity-40' : 'cursor-pointer')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} className="sr-only" />
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
          checked ? 'border-green-500 bg-green-500/10' : 'border-white/30 bg-black'
        )}
      >
        {checked && (
          <svg viewBox="0 0 16 16" className="h-3 w-3 text-green-500" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label}
    </label>
  )
}

export function RadioGroup({ name, options = [], value, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm text-white">
          <input type="radio" name={name} value={opt.value} checked={value === opt.value} onChange={() => onChange?.(opt.value)} className="sr-only" />
          <span
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
              value === opt.value ? 'border-green-500' : 'border-white/30'
            )}
          >
            {value === opt.value && <span className="h-2 w-2 rounded-full bg-green-500" />}
          </span>
          {opt.label}
        </label>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <label className="flex items-center gap-2 text-sm text-white">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ' + (checked ? 'bg-green-600' : 'bg-white/15')}
      >
        <span className={'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ' + (checked ? 'translate-x-4' : 'translate-x-0')} />
      </button>
      {label}
    </label>
  )
}

export function Select({ options = [], value, onChange, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      className="rounded-md border border-white/20 bg-black px-3 py-2 text-sm text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** Same TXT format as a plain dropdown (comma-separated options) -- the
 * difference is purely in what the user can pick: more than one option
 * at once, shown as a checkbox list under a button that summarizes the
 * current selection. `values` is always an array (possibly empty). */
export function MultiSelect({ options = [], values = [], onChange, placeholder = 'Select...' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggle(val) {
    onChange(values.includes(val) ? values.filter((v) => v !== val) : [...values, val])
  }

  // Show the full list in the hover tooltip (title=), but keep the
  // button label itself short: just the first pick, plus "..." once a
  // second one is added -- showing every selected value in the button
  // gets unreadable fast as more get picked.
  const fullList = values.join(', ')
  const summary = values.length === 0 ? placeholder : values.length === 1 ? values[0] : `${values[0]}...`

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-[9rem] items-center justify-between gap-2 rounded-md border border-white/20 bg-black px-3 py-2 text-sm text-white outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
      >
        <span className="truncate text-left" title={fullList || placeholder}>
          {summary}
        </span>
        <span className="text-white/40">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-max min-w-[9rem] overflow-y-auto rounded-md border border-white/15 bg-[#111827] p-1 shadow-lg">
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-sm text-white hover:bg-white/10"
            >
              <input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)} className="accent-green-500" />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function Badge({ variant = 'default', children }) {
  const variants = {
    default: 'bg-white/10 text-white',
    success: 'bg-green-500/15 text-green-400',
    warning: 'bg-amber-500/15 text-amber-400',
    danger: 'bg-red-500/15 text-red-400',
  }
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variants[variant] || variants.default)}>{children}</span>
}

export function Alert({ variant = 'info', title, children }) {
  const variants = {
    info: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    success: 'bg-green-500/10 text-green-300 border-green-500/30',
    warning: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    danger: 'bg-red-500/10 text-red-300 border-red-500/30',
  }
  return (
    <div className={cn('rounded-md border px-4 py-3 text-sm', variants[variant] || variants.info)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <p className="mt-0.5 opacity-90">{children}</p>}
    </div>
  )
}

const AVATAR_SIZES = { sm: 'h-7 w-7 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-base' }
function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('')
}
export function Avatar({ src, name = '', size = 'md' }) {
  if (src) return <img src={src} alt={name} className={cn('rounded-full object-cover', AVATAR_SIZES[size])} />
  return (
    <div className={cn('flex items-center justify-center rounded-full border border-green-500/30 bg-green-500/15 font-medium text-green-400', AVATAR_SIZES[size])}>
      {initials(name)}
    </div>
  )
}

export function Progress({ value = 0, label }) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className="w-48">
      {label && <p className="mb-1 text-xs text-white/60">{label}</p>}
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: clamped + '%' }} />
      </div>
    </div>
  )
}

const SPINNER_SIZES = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-9 w-9 border-[3px]' }
export function Spinner({ size = 'md' }) {
  return <div className={cn('animate-spin rounded-full border-white/15 border-t-green-500', SPINNER_SIZES[size])} />
}

export function Divider({ label }) {
  if (!label) return <hr className="border-white/15" />
  return (
    <div className="flex items-center gap-3 text-xs text-white/40">
      <hr className="flex-1 border-white/15" />
      {label}
      <hr className="flex-1 border-white/15" />
    </div>
  )
}

export function Tooltip({ text, children }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span className="cursor-default border-b border-dashed border-white/30 text-white">{children}</span>
      {show && (
        <span className="absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/15 bg-black px-2 py-1 text-xs text-white shadow-lg">
          {text}
        </span>
      )}
    </span>
  )
}

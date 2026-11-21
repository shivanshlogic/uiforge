/**
 * Central place that decides two kinds of "smart" behavior driven purely
 * by what the user typed in the .txt file (ported from field_behaviors.py):
 *
 * 1. INPUT validation type (`INPUT = <type> | <placeholder>`) decides
 *    which native <input type=...> and validation rule get attached.
 * 2. BUTTON action is decided by keyword-matching the button's own label
 *    (case-insensitive) -- "browse" opens a file picker (against the
 *    LOCAL BACKEND), "execute"/"run" calls the local backend's real
 *    operation with the page's data. Everything else stays a plain button.
 */

export const VALIDATION_TYPES = {
  text: { htmlType: 'text', check: (v) => v.trim().length > 0, message: 'This field is required' },
  path: { htmlType: 'text', check: (v) => v.trim().length > 0, message: 'Please enter a path' },
  email: {
    htmlType: 'email',
    check: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    message: 'Enter a valid email address',
  },
  number: { htmlType: 'number', check: (v) => v !== '' && !isNaN(Number(v)), message: 'Enter a valid number' },
  password: { htmlType: 'password', check: (v) => v.length >= 6, message: 'Minimum 6 characters' },
  url: { htmlType: 'url', check: (v) => /^https?:\/\/.+/.test(v), message: 'Enter a valid URL' },
}

export function resolveValidation(validationType) {
  if (!validationType) return VALIDATION_TYPES.text
  return VALIDATION_TYPES[validationType.toLowerCase()] || VALIDATION_TYPES.text
}

const BROWSE_RE = /\b(browse|choose file|select file)\b/i
const EXECUTE_RE = /\b(execute|run)\b/i

/** @returns {'browse' | 'execute' | 'none'} */
export function resolveButtonAction(label) {
  if (BROWSE_RE.test(label)) return 'browse'
  if (EXECUTE_RE.test(label)) return 'execute'
  return 'none'
}

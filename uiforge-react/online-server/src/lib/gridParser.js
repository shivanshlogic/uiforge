/**
 * The ONLY supported grid requirement-file format (ported line-for-line
 * from core/grid_parser.py, extended for two newer features -- see below
 * -- and running entirely in the browser, no server involved in parsing
 * at all):
 *
 *     PAGE: FileRunner            (optional)
 *     DESCRIPTION: Pick a file    (optional)
 *
 *     LABEL = Enter path (0,0)
 *     INPUT = Enter file path | path (0,1) | filePath
 *     BUTTON = browse (0,2) | browseBtn
 *     DROPDOWN = file1, file2, file3, file4 (1,1) | fileChoice
 *     BUTTON = execute (1,2) | executeBtn
 *
 * Rules a non-technical person needs to learn:
 * 1. `TYPE = value (row, col)` -- one component per line, position always
 *    in parentheses. Row/col start at 0.
 * 2. Comma `,` inside the value means "this is a list" (dropdown/radio
 *    options, tab names, accordion sections).
 * 3. Pipe `|` inside the value means "this component needs two pieces of
 *    text" (e.g. INPUT's placeholder + validation type). Text/label
 *    always comes first, exactly like every other component. Quotes
 *    around the value are optional.
 *
 * --- Feature: variable name (id) -- REQUIRED on every component except LABEL ---
 * Every component -- other than LABEL -- MUST end with one more
 * `| <variableName>` after the position. This is the exact key that
 * component's value will use in the Execute payload (for components
 * that actually hold a value -- Input, Dropdown, Checkbox, etc.); for
 * purely decorative components (Button, Badge, Divider...) it's still
 * required, just so every line in the file follows the one format and
 * nothing silently auto-names itself:
 *
 *     INPUT = Enter name | name (Overview: 0,1) | userName
 *     DROPDOWN = file1, file2, file3, file4 (Overview: 0,2) | fileChoice
 *     BUTTON = Save (Overview: 0,3) | saveBtn
 *
 * LABEL is the one exception -- it never appears in the payload, so it
 * has no variable name and never takes a trailing `| ...`:
 *
 *     LABEL = Name (Overview: 0,0)
 *
 * Leaving the variable name off any other component is a parse error.
 * Every variable name must also be unique across the whole page.
 *
 * --- Feature: tabs ---
 * A TABS line defines an ordered set of tab names as its value (comma
 * list, same as a Dropdown's options):
 *
 *     TABS = Overview, Details, Settings (4,0)
 *
 * Any OTHER component can then say which tab it belongs to by prefixing
 * its position with `<TabName>: `:
 *
 *     LABEL = Name (Overview: 0,0)
 *     INPUT = Enter name | name (Overview: 0,1) | userName
 *     TEXTAREA = Extra notes (Details: 0,0) | notes
 *
 * Row/col for a tab-scoped component are relative to THAT TAB's own
 * mini-grid, completely separate from the page's root grid and from
 * every other tab's mini-grid -- so `(Overview: 0,0)` and
 * `(Details: 0,0)` don't collide even though both say row 0, col 0.
 * A component with no `TabName:` prefix belongs to the page's root grid
 * (this is also where the TABS line itself lives, positioned like any
 * other root component).
 */

export class GridParseError extends Error {}

// Groups: 1 type, 2 value, 3 tab name (optional), 4 row, 5 col,
// 6 variable name -- optional in the regex itself (so LABEL can omit it),
// but enforced as required for every other TYPE right after the match.
const COMPONENT_LINE =
  /^([A-Za-z_]+)\s*=\s*(.*?)\s*\(\s*(?:([^:()]+):\s*)?(\d+)\s*,\s*(\d+)\s*\)\s*(?:\|\s*(\S.*?)\s*)?$/
const META_LINE = /^(PAGE|DESCRIPTION)\s*:\s*(.*)$/i

/**
 * @param {string} text
 * @returns {{pageName: string, pageTitle: string, description: string, rows: number, cols: number, components: Array, tabNames: string[]}}
 */
export function parseGridTxt(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) {
    throw new GridParseError('Requirement file is empty.')
  }

  let pageName = null
  let description = ''
  const components = []
  const usedIds = new Set()
  let tabNames = [] // order comes from the TABS line's own comma list

  for (const line of lines) {
    const metaMatch = line.match(META_LINE)
    if (metaMatch) {
      const key = metaMatch[1].toUpperCase()
      if (key === 'PAGE') pageName = metaMatch[2].trim()
      else description = metaMatch[2].trim()
      continue
    }

    const m = line.match(COMPONENT_LINE)
    if (!m) {
      throw new GridParseError(`Line doesn't match "TYPE = value (row, col)": '${line}'`)
    }

    const compType = m[1].toUpperCase()
    let value = m[2].trim()
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    const tab = m[3] ? m[3].trim() : null
    const row = parseInt(m[4], 10)
    const col = parseInt(m[5], 10)
    const explicitId = m[6] ? m[6].trim() : null

    if (compType === 'TABS') {
      tabNames = tabNames.concat(
        value.split(',').map((s) => s.trim()).filter(Boolean)
      )
    }

    // Every component except LABEL must carry an explicit variable
    // name -- that's the whole point of this rule: no auto-guessed ids,
    // so the payload key is always exactly what's written in the file.
    if (compType !== 'LABEL' && !explicitId) {
      const where = tab ? `tab '${tab}', ` : ''
      throw new GridParseError(
        `${compType} at ${where}row ${row}, col ${col} is missing a variable name. ` +
          `Every component except LABEL must end with "| <variableName>", e.g. ` +
          `${compType} = ${value} (${tab ? tab + ': ' : ''}${row},${col}) | myVariableName`
      )
    }

    const props = valueToProps(compType, value)
    const id = resolveId(explicitId, props, compType, usedIds)
    components.push({ type: compType, tab, row, col, id, props })
  }

  if (components.length === 0) {
    throw new GridParseError('No component lines found.')
  }

  // Any component naming a tab must refer to one the TABS line actually
  // declared -- otherwise it would render nowhere, silently.
  for (const c of components) {
    if (c.tab !== null && !tabNames.includes(c.tab)) {
      throw new GridParseError(
        tabNames.length === 0
          ? `Component references tab '${c.tab}', but no TABS line defines any tabs.`
          : `Component references unknown tab '${c.tab}'. Defined tabs: ${tabNames.join(', ')}`
      )
    }
  }

  // Cell collisions are scoped -- (0,0) in "Overview" and (0,0) in
  // "Details" are different cells, and both are different from root (0,0).
  const seenCells = new Set()
  for (const c of components) {
    const key = `${c.tab ?? '__root__'}|${c.row}|${c.col}`
    if (seenCells.has(key)) {
      const where = c.tab ? `tab '${c.tab}'` : 'the root grid'
      throw new GridParseError(
        `Two components both target row ${c.row}, col ${c.col} in ${where} -- each spot can only hold one component.`
      )
    }
    seenCells.add(key)
  }

  const rootComponents = components.filter((c) => c.tab === null)
  const rows = rootComponents.length ? Math.max(...rootComponents.map((c) => c.row)) + 1 : 0
  const cols = rootComponents.length ? Math.max(...rootComponents.map((c) => c.col)) + 1 : 0

  return {
    pageName: pageName ? toPascal(pageName) : 'GeneratedGrid',
    pageTitle: pageName || '',
    description,
    rows,
    cols,
    components,
    tabNames,
  }
}

function pipeParts(value, n) {
  const parts = value.split('|').map((p) => p.trim())
  while (parts.length < n) parts.push('')
  return parts
}

function valueToProps(compType, value) {
  switch (compType) {
    case 'LABEL':
      return { text: value }
    case 'INPUT': {
      // `INPUT = <placeholder> | <validationType>` -- placeholder (the
      // text) comes first, just like every other component's value, and
      // the validation type comes second. No `|` -> just a placeholder,
      // no validation.
      if (value.includes('|')) {
        const [placeholder, validation] = pipeParts(value, 2)
        return { validation, placeholder }
      }
      return { placeholder: value }
    }
    case 'TEXTAREA':
      return { placeholder: value }
    case 'BUTTON':
    case 'CHECKBOX':
    case 'SWITCH':
    case 'BADGE':
      return { label: value }
    case 'AVATAR':
      return { name: value }
    case 'DIVIDER':
      return value ? { label: value } : {}
    case 'SPINNER':
      return value ? { size: value } : {}
    case 'DROPDOWN':
    case 'SELECT':
    case 'MULTISELECT':
    case 'RADIO':
    case 'RADIOGROUP':
      return { options: value }
    case 'TABS':
      return { tabs: value }
    case 'ACCORDION':
      return { items: value }
    case 'PAGINATION':
      return { pages: value }
    case 'ALERT': {
      const [title, message] = pipeParts(value, 2)
      return message ? { title, message } : { title: 'Note', message: title }
    }
    case 'PROGRESS': {
      const [val, label] = pipeParts(value, 2)
      return { value: val, label }
    }
    case 'SLIDER': {
      const [val, label] = pipeParts(value, 2)
      return { value: val, label }
    }
    case 'NAVBAR': {
      const [brand, links] = pipeParts(value, 2)
      return { brand, links }
    }
    case 'CARD': {
      const [title, text] = pipeParts(value, 2)
      return { title, text }
    }
    case 'LINK': {
      const [text, href] = pipeParts(value, 2)
      return { text, href: href || '#' }
    }
    case 'TOOLTIP': {
      const [trigger, text] = pipeParts(value, 2)
      return { trigger, text }
    }
    case 'LABELINPUT': {
      const [label, placeholder] = pipeParts(value, 2)
      return { label, placeholder }
    }
    default:
      // Unknown TYPE -- let fieldTypes.js's resolveType() check produce
      // the "Unsupported TYPE" error with the full supported list.
      return { text: value, label: value }
  }
}

/** Explicit variable name wins if given (and must be unique) -- required
 * for every component except LABEL, which is the only type still
 * allowed to auto-derive its id from its own text. */
function resolveId(explicitId, props, compType, usedIds) {
  if (explicitId) {
    if (usedIds.has(explicitId)) {
      throw new GridParseError(`Duplicate id '${explicitId}' -- ids must be unique across the whole page.`)
    }
    usedIds.add(explicitId)
    return explicitId
  }
  const source = props.label || props.text || props.placeholder || props.title || props.name || compType
  const base = slugifyCamel(source) || compType.toLowerCase()
  let candidate = base
  let n = 2
  while (usedIds.has(candidate)) {
    candidate = `${base}${n}`
    n += 1
  }
  usedIds.add(candidate)
  return candidate
}

function slugifyCamel(s) {
  const words = s.trim().split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = words[0].toLowerCase()
  const rest = words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('')
  return first + rest
}

function toPascal(s) {
  return s.split(/[\s_-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('')
}

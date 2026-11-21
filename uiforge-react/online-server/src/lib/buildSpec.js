import { TYPE_ALIASES, GRID_SUPPORTED_TYPES, DATA_FIELD_TYPES } from './fieldTypes.js'
import { resolveButtonAction } from './fieldBehaviors.js'

export class GridGenerationError extends Error {}

/**
 * Takes the raw parsed grid (from gridParser.js) and returns an enriched
 * DATA spec -- never JSX text, never eval(). GeneratedPage.jsx renders
 * straight from this via a plain switch statement in FieldRenderer.jsx.
 *
 * This is the direct replacement for grid_code_generator.py's
 * generate_grid_component_code(), which used to return a JSX STRING. The
 * things resolved up front here (once, not per-render) are:
 *   1. Which catalog component each TYPE maps to, and whether it's even
 *      supported (TYPE_ALIASES / GRID_SUPPORTED_TYPES).
 *   2. For a "Browse" button, WHICH Input in the same row -- AND same
 *      tab (or same root, if it's not in any tab) -- it should fill.
 *   3. Splitting the flat component list into the page's ROOT grid
 *      (spec.components) and one mini-grid per tab (spec.tabGroups).
 *   4. Pulling the TABS component itself OUT of the root grid entirely
 *      -- see `tabsComponent` below for why.
 * Everything else (option-list parsing, char-width sizing, validation
 * rule lookup) is cheap enough to do live in FieldRenderer at render time
 * instead, so it's not duplicated here.
 */
export function buildSpec(parsedGrid) {
  const allComponents = parsedGrid.components.map((comp) => {
    const resolvedType = TYPE_ALIASES[comp.type.toUpperCase()]
    if (!resolvedType) {
      throw new GridGenerationError(
        `Unsupported TYPE '${comp.type}'. Supported: ${GRID_SUPPORTED_TYPES.join(', ')}`
      )
    }
    return { ...comp, resolvedType }
  })

  // Resolve each "browse" Button's target Input once, up front -- same
  // closest-column-in-same-row search grid_code_generator.py's
  // _find_row_companion() did, now also scoped to the same tab (or the
  // same root grid) so a Button in "Details" can't accidentally target
  // an Input that's actually sitting in "Overview".
  for (const comp of allComponents) {
    if (comp.resolvedType === 'Button') {
      comp.buttonAction = resolveButtonActionFor(comp)
      if (comp.buttonAction === 'browse') {
        comp.browseTargetId = findRowCompanion(allComponents, comp, ['Input'])
      }
    }
  }

  // Execute always collects EVERY data field on the whole page, not just
  // whichever tab happens to be showing right now -- same all-fields
  // philosophy the original payload_expr used, just spanning tabs too.
  const dataFieldIds = allComponents.filter((c) => DATA_FIELD_TYPES.has(c.resolvedType)).map((c) => c.id)

  let rootComponents = allComponents.filter((c) => c.tab === null)

  // A TABS line is PAGE-LEVEL NAVIGATION, not a grid cell like every
  // other component -- pull it out of the root grid entirely here.
  // GeneratedPage.jsx renders it as its own bar ABOVE the content box,
  // spanning the full width, with the box below showing ONLY the
  // currently active tab's components -- not as one item sitting inside
  // the box alongside everything else (that's what made it feel like
  // "just another catalog widget" instead of real navigation).
  const tabsComponents = rootComponents.filter((c) => c.resolvedType === 'Tabs')
  if (tabsComponents.length > 1) {
    throw new GridGenerationError('Only one TABS line is supported per page.')
  }
  const tabsComponent = tabsComponents[0] || null
  if (tabsComponent) {
    rootComponents = rootComponents.filter((c) => c !== tabsComponent)
  }

  const tabGroups = {}
  for (const tabName of parsedGrid.tabNames) {
    const groupComponents = allComponents.filter((c) => c.tab === tabName)
    const rows = groupComponents.length ? Math.max(...groupComponents.map((c) => c.row)) + 1 : 0
    const cols = groupComponents.length ? Math.max(...groupComponents.map((c) => c.col)) + 1 : 0
    tabGroups[tabName] = { rows, cols, components: groupComponents }
  }

  // Root grid dimensions are recomputed AFTER pulling TABS out -- using
  // the original (pre-extraction) size would leave a visible empty gap
  // where TABS used to sit (e.g. row 4 in the docs example), even though
  // TABS no longer occupies a cell there at all.
  const rows = rootComponents.length ? Math.max(...rootComponents.map((c) => c.row)) + 1 : 0
  const cols = rootComponents.length ? Math.max(...rootComponents.map((c) => c.col)) + 1 : 0

  return {
    pageName: parsedGrid.pageName,
    pageTitle: parsedGrid.pageTitle,
    description: parsedGrid.description,
    rows,
    cols,
    components: rootComponents,
    tabsComponent,
    tabGroups,
    dataFieldIds,
  }
}

function resolveButtonActionFor(comp) {
  const label = comp.props.label || comp.props.text || 'Button'
  return resolveButtonAction(label)
}

function findRowCompanion(allComponents, selfComp, preferredResolvedTypes) {
  const sameRow = allComponents.filter(
    (c) => c !== selfComp && c.row === selfComp.row && c.tab === selfComp.tab
  )
  for (const wantedType of preferredResolvedTypes) {
    const candidates = sameRow
      .filter((c) => c.resolvedType === wantedType)
      .sort((a, b) => Math.abs(a.col - selfComp.col) - Math.abs(b.col - selfComp.col))
    if (candidates.length > 0) return candidates[0].id
  }
  return null
}

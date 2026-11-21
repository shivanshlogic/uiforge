# UIForge -- React (Option B: data-driven, no eval) + Local Backend

Two separate apps, same architecture as before, just with the online
half now a **real Vite + React project** instead of Python/FastAPI --
and using the "proper React" pattern (Option B) discussed: the `.txt`
spec is parsed into a plain DATA object, and ONE generic component
renders it. No JSX text generation, no Babel-in-browser, no `eval()`
anywhere in this app.

```
online-server/   -> a Vite + React app. `npm run build` produces dist/ --
                     plain static files, deployable ANYWHERE (Netlify,
                     Vercel, GitHub Pages, Cloudflare Pages, S3...).
                     No backend, no server process, at all.

local-backend/   -> still Python/FastAPI, still what the end user runs
                     on their OWN machine for real file-browsing and
                     Execute. Deliberately minimal -- 4 files, 2
                     endpoints (GET /select-gds, POST /execute). See its
                     own README.md.
```

## Why online-server needs no backend anymore

Parsing the `.txt` file and turning it into UI never touched the local
filesystem or ran any code -- it was always just TEXT IN, UI OUT. That
transformation now happens **entirely in the browser**
(`src/lib/gridParser.js` + `src/lib/buildSpec.js`, direct ports of the
old `core/grid_parser.py` + the data-producing half of
`grid_code_generator.py`). Uploading a `.txt` file reads it with
`FileReader`, parses it client-side, and renders it client-side --
nothing is ever sent anywhere for that step. There's no `/api/generate`
endpoint anymore because there's no server to have one.

## Why this is "real React" (Option B), not just React-flavored

The old approach generated a JSX **source-code string** and ran it
through Babel Standalone in the browser at runtime (`eval()`). This
version never generates code at all:

```
.txt file
   │  parseGridTxt()          (src/lib/gridParser.js)
   ▼
parsed grid  (rows/cols/components -- plain data)
   │  buildSpec()             (src/lib/buildSpec.js)
   ▼
spec  (adds resolvedType, browseTargetId, dataFieldIds -- still just data)
   │  <GeneratedPage spec={spec} />
   ▼
React elements, rendered by <FieldRenderer comp={...} .../>'s plain
switch statement (src/components/FieldRenderer.jsx)
```

No `eval`, no runtime JSX compiler bundled (removes ~2.4MB of Babel
Standalone from the old build), and every field type is just a `case` in
a `switch` -- normal, debuggable React you can inspect in DevTools like
any other app.

## The local-backend half is untouched, on purpose

Browse and Execute still work exactly like before -- both go straight
from the browser to `window.LOCAL_BACKEND_URL` (`http://127.0.0.1:8765`
by default, set in `src/lib/localBackend.js`), a completely separate app
the end user runs on their own machine. This site (wherever it's hosted)
is never in that request path. See the top-level architecture notes from
before for the full data-flow diagram and the CORS security reasoning --
none of that changed.

## The `.txt` format: tabs and explicit ids

Two features on top of the original `TYPE = value (row, col)` format,
both optional -- see `src/lib/gridParser.js`'s own header comment for the
full detail, and `public/samples/tabs-and-explicit-ids-test.txt` for a
working example:

**Tabs** -- a `TABS` line declares an ordered set of tab names; any other
component can then say which tab it belongs to by prefixing its position
with `<TabName>: `:

```
TABS = Overview, Details, Settings (4,0)
LABEL = "Name" (Overview: 0,0)
INPUT = name | Enter name (Overview: 0,1)
TEXTAREA = Extra notes (Details: 0,0)
```

Each tab gets its OWN row/col grid, completely separate from the page's
root grid and from every other tab -- `(Overview: 0,0)` and
`(Details: 0,0)` don't collide. A component with no `TabName:` prefix
sits in the page's root grid (positioned independently of tabs -- the
`TABS` line's OWN position, e.g. `(4,0)` above, is only there to satisfy
the file format; it's not actually used for layout, see below).

**Tabs are real page-level navigation, not a grid cell.** The tab bar
renders as its own strip ABOVE the content box, spanning the full width
-- not as one item sitting inside the box alongside other components.
The box below it shows ONLY the currently active tab's own components;
switching tabs swaps the box's entire contents. (If a page mixes
untabbed root components with a TABS line, those untabbed components get
their own box first, rendered exactly as if there were no tabs at all --
see `buildSpec.js`'s `tabsComponent` extraction and
`GeneratedPage.jsx`'s layout for the detail.)

Switching tabs never loses what was typed in another tab -- there's one
shared values object for the whole page, tab-scoped or not. Execute's
payload always includes every data field on the WHOLE page, not just
whichever tab is currently showing.

**Explicit ids** -- every component normally gets an id auto-derived from
its own label text. To pin a specific id instead (so it doesn't shift if
the label text changes later), add one more `| <id>` AFTER the position:

```
INPUT = name | Enter name (Overview: 0,1) | userNameInput
DROPDOWN = Light, Dark, Auto (Settings: 0,1) | themeDropdown
```

Ids (explicit or auto-derived) must still be unique across the whole
page -- a duplicate explicit id is a parse error, not a silent rename.

## Run it locally

Terminal 1 -- the online app:
```bash
cd online-server
npm install
npm run dev              # http://127.0.0.1:5173 by default
```

Terminal 2 -- the local backend:
```bash
cd local-backend
pip install -r requirements.txt
python app.py             # http://127.0.0.1:8765
```

Open the online app's URL, upload a `.txt` file from `online-server/public/samples/`,
and try its Browse/Execute buttons.

**Note on CORS during local dev:** `local-backend/app.py`'s
`ALLOWED_ORIGINS` defaults to `http://127.0.0.1:8000` /
`http://localhost:8000`. Vite's dev server defaults to port 5173, so
either run `npm run dev -- --port 8000`, or add 5173 to
`ALLOWED_ORIGINS` for local testing (then set it back to your real
deployed domain before shipping).

## Deploying for real

```bash
cd online-server
npm run build
```

`dist/` is the entire deployable app -- upload it to any static host.
That's it, no server to run, no Python, no uvicorn for this half.

Before shipping:
1. `online-server/src/lib/localBackend.js` -- confirm `LOCAL_BACKEND_URL`
   matches the port your `local-backend/` distribution uses.
2. `local-backend/app.py` -- set `ALLOWED_ORIGINS` to your real deployed
   domain (this hasn't changed from before -- see `local-backend/README.md`).

## Project layout

```
online-server/
  index.html                the single HTML page Vite mounts into
  vite.config.js
  tailwind.config.js / postcss.config.js   real Tailwind build (content-scanned, not a stale snapshot)
  package.json
  src/
    main.jsx                 mounts <App/>
    App.jsx                  upload handling (native <input type="file">), placeholder, top-level layout
    index.css                 @tailwind directives
    lib/
      gridParser.js           .txt text -> parsed grid (port of grid_parser.py)
      fieldTypes.js            TYPE_ALIASES / DATA_FIELD_TYPES (port of part of grid_code_generator.py)
      buildSpec.js             parsed grid -> enriched DATA spec (resolvedType, browseTargetId, dataFieldIds)
      fieldBehaviors.js        INPUT validation rules + BUTTON action keywords (port of field_behaviors.py)
      localBackend.js          LOCAL_BACKEND_URL + fetchLocal/browseDirectory/executeLocal helpers
    components/
      AppShellNavbar.jsx        top navbar + upload button
      GeneratedPage.jsx         lays spec.components out on a CSS grid, owns all field state, renders the global tab bar + active tab's box when spec.tabsComponent is set
      FieldRenderer.jsx         the generic per-component-type switch -- the actual "code generator" now (TABS itself is handled by GeneratedPage, not this switch)
      ui/
        primitives.jsx           Button, Input, Textarea, Checkbox, Switch, Select, RadioGroup, Badge, Alert, Avatar, Progress, Spinner, Divider, Tooltip
        catalog.jsx               Navbar, LabeledInput, CardBlock, LinkText, Slider, Tabs, Pagination, PaginationField, Accordion
  public/samples/             example .txt specs to try uploading

local-backend/                minimal Python/FastAPI app: GET /select-gds, POST /execute -- see its own README.md
```

## What was actually tested

Every piece here was run for real, not just written:
- `npm run build` succeeds, producing a static `dist/` (~168KB JS +
  ~16KB CSS gzipped, no Babel bundled).
- `gridParser.js` + `buildSpec.js` were run directly in Node against all
  three original sample `.txt` files -- output (resolved types, ids,
  Browse target resolution, `dataFieldIds`) matches the old Python
  version exactly.
- Tabs + explicit ids: parsed the exact tabbed example from this
  project's own design discussion directly in Node, confirmed correct
  per-tab grouping/sizing and exact explicit ids (not auto-derived
  ones); confirmed parse errors for an unknown tab reference, a
  duplicate explicit id, and a same-tab cell collision, while
  confirming the SAME cell in two DIFFERENT tabs is correctly allowed;
  confirmed the TABS component itself is fully extracted out of the
  root grid (`spec.components` has 0 items when TABS is the only root
  component); then a full Playwright pass -- uploaded the tabbed
  sample, confirmed the tab bar renders as its own strip ABOVE the
  content box (not inside it as a grid cell), typed into a field on one
  tab, switched through all three tabs, switched back, and confirmed
  the typed value was still there; also re-ran the ORIGINAL non-tabbed
  sample afterward and confirmed no phantom tab bar appears and nothing
  else regressed.
- A full browser (Playwright/Chromium) end-to-end pass: opened the app,
  uploaded a `.txt` file, confirmed the UI rendered, and clicked Execute
  (a real request to `local-backend`'s `/execute`, which returned
  `{"success": true}` and showed the resulting alert) -- against both the
  dev server AND the production static build.
- **The native Browse dialog (Linux, the primary target) was tested
  against real `zenity`, not just mocked:** installed `zenity` +
  `Xvfb` (a real virtual X display) in the build sandbox and confirmed,
  through the actual running `local-backend` server over real HTTP --
  - a genuine Cancel click (simulated via a real Escape keypress sent to
    the actual dialog window) returns `{"path": null, "error": null}`,
    no error;
  - **no display at all** (`DISPLAY`/`WAYLAND_DISPLAY` unset -- the
    common "SSH without `-X`" or headless-container case) returns a
    clear, specific error instead of silently doing nothing -- this
    matters because zenity/kdialog give the EXACT SAME exit code for
    "no display" as for "user clicked Cancel", so this project
    specifically tells the two apart (see `native_dialog.py`);
  - a **stale/broken `DISPLAY`** (set, but pointing at a dead X session)
    is also caught and reported distinctly, not confused with a cancel;
  - the packaged **PyInstaller Linux binary** (not just `python app.py`)
    was built and re-tested for both the no-display and real-dialog
    cases, confirming the subprocess-based dialog launch still works
    once bundled;
  - the frontend's Browse button correctly shows whichever of the above
    messages happened right under the button, with no crash, confirmed
    via the same Playwright pass.


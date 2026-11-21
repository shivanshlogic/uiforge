# UIForge -- Local Backend (give this to your end users)

Runs on the END USER's OWN computer. This is what the generated UI (which
was served by your online server) actually talks to for Browse and
Execute -- your online server is never involved in that part.

Deliberately minimal -- 3 real files, nothing else:

```
app.py              entry point -- sets CORS (ALLOWED_ORIGINS!), runs on 127.0.0.1:<port>
server.py           the two endpoints: GET /select-gds, POST /execute
native_dialog.py    opens a real native OS file dialog (this is what makes /select-gds work at all)
```

## First: set who's allowed to call this

Open `app.py` and set `ALLOWED_ORIGINS` to your real deployed online
server's URL:

```python
ALLOWED_ORIGINS = [
    "https://my-ui-generator.com",   # <- your real domain
]
```

**This matters for real security, not just tidiness.** While this app is
running, it's listening on `127.0.0.1:8765`. If `ALLOWED_ORIGINS` were
wildcarded (`"*"`), then ANY website open in ANY other browser tab on the
user's machine -- not just your UI -- could also send requests here,
including to `/execute`. Restricting it to your specific domain means the
browser itself blocks requests from anywhere else before they even reach
this app (this is what CORS is for). Do this before you distribute the
packaged app.

## Run it

```bash
pip install -r requirements.txt
python app.py
```

Leave this running in the background while the user uses the generated
UI in their browser (at your online server's URL). It has no UI of its
own to open -- there's nothing to look at here, it's just listening.

## The two endpoints

```javascript
// Browse button -> real native OS file dialog -> real absolute path
const response = await fetch("http://127.0.0.1:8765/select-gds");
const { path } = await response.json();

// Execute button -> for now, just saves the payload as its own JSON
// file under output/ -- see "Where your real logic goes" below
await fetch("http://127.0.0.1:8765/execute", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ gds: gdsPath, script: scriptPath }),
});
```

Right now, `POST /execute` just writes whatever JSON body it receives
into its own timestamped file under `output/` (created automatically
on first use) -- e.g. `output/submission-2026-01-15T10-30-00.json`
containing exactly `{"gds": "...", "script": "..."}`. Nothing more than
that for now.

This is exactly what the generated UI's Browse/Execute buttons send (see
the online server's `src/lib/localBackend.js`) -- nothing more elaborate
happens on either side. `/execute`'s body shape depends entirely on your
`.txt` spec's field ids (see the explicit-id syntax in the top-level
README) -- name a field `gds` and `script` there to get exactly this
shape.

## Why `/select-gds` can't just be a plain `<input type="file">`

A browser's own file input can NEVER expose a real filesystem path to
JavaScript -- every browser deliberately hides it (you'd only ever get a
bare filename like `input.gds`, never `C:\Projects\Chip\input.gds`). This
isn't fixable from either side -- it's why `/select-gds` has to open the
dialog itself, server-side, via `native_dialog.py`:

| Platform | How it opens | Needs installing? |
|---|---|---|
| Windows | PowerShell's `System.Windows.Forms.OpenFileDialog` | No -- ships with Windows |
| macOS | `osascript`'s `choose file` | No -- ships with macOS |
| Linux (primary target) | `zenity`, falling back to `kdialog` | Only if neither is already on the system |

```bash
# Debian/Ubuntu
sudo apt install zenity

# Fedora
sudo dnf install zenity

# Arch
sudo pacman -S zenity
```

**To fix the dialog opening BEHIND the browser window**, also install
`xdotool` (preferred) or `wmctrl` -- `native_dialog.py` uses whichever
one is present to actively find the dialog's window right after it
opens and force it to the front:

```bash
# Debian/Ubuntu
sudo apt install xdotool

# Fedora
sudo dnf install xdotool

# Arch
sudo pacman -S xdotool
```

Without `xdotool`/`wmctrl`, the dialog still opens and still works --
it just may not automatically come to the front on window managers with
focus-stealing prevention turned on (common on GNOME/KDE); the user
would need to alt-tab or click the taskbar to find it.

`app.py` checks for both of these at STARTUP (not just when Browse is
clicked) and prints a clear warning to the console immediately if
`zenity`/`kdialog` is missing, if no graphical display is detected at
all, or if `xdotool`/`wmctrl` is missing -- catch this before your users
do.

**Common Linux gotcha -- headless/SSH sessions:** zenity and kdialog are
GUI apps; they need a real desktop session (X11 or Wayland) to run. Over
plain SSH (no `-X`), inside a container, or on a server with no desktop
installed, there's no display available at all. `native_dialog.py`
specifically detects this (`DISPLAY`/`WAYLAND_DISPLAY` not set) and
returns a clear, actionable error -- reconnect with `ssh -X`, or run this
on the machine's actual desktop -- shown as an alert when Browse is
clicked, never a crash and never a silent no-op. (Without this check, a
missing display looks EXACTLY like the user clicking Cancel to both
zenity and kdialog -- same exit code -- so this project specifically
tells the two apart instead of leaving Browse silently doing nothing.)

## Where your real logic goes

`server.py`'s `execute()` function -- it currently just saves the payload
as a JSON file under `output/`. Replace that body with whatever your
Execute button actually needs to do (run a script, call a local tool,
read/write files at the paths in `payload`, etc). `payload` is a plain
dict of whatever the generated page's Execute button sent -- it can only
ever supply DATA, never choose which code runs, so it stays safe
regardless of what a `.txt` spec defines on the online server's side.

## Packaging as a distributable app for your end users

Same PyInstaller approach as any local Python app -- build ON the OS
you're targeting (PyInstaller doesn't cross-compile: build on Linux for a
Linux binary, on Windows for a `.exe`, on macOS for a `.app`/binary).

```bash
pip install pyinstaller
```

`--onedir` is recommended over `--onefile` -- no self-extraction step, so
it starts faster and more consistently (see the top-level project's notes
on this if you're curious about the numbers):

**Linux (primary target):**
```bash
pyinstaller app.py --onedir --name uiforge-local-backend
```

**Important: `zenity`/`kdialog` is NOT bundled by PyInstaller.** The
packaged binary calls out to whatever's already installed on the *end
user's* machine (see `native_dialog.py`) -- it doesn't get bundled into
the build the way Python packages do, because it's a full external GUI
application, not a Python import. Confirm your target users' machines
have `zenity` or `kdialog` (true by default on most desktop Linux
distros), or document the one-line install command from this file's
section above.

Give end users the resulting `dist/uiforge-local-backend/` folder (zip
it, or package it as a `.deb`/AppImage/Flatpak if you want a more
integrated install experience). They run the binary inside once from a
terminal, leave it running, then open your online server's URL in their
browser as normal. A `.desktop` file that launches it from an app menu
is a nice touch if your users aren't comfortable with a terminal:

```ini
[Desktop Entry]
Type=Application
Name=UIForge Local Backend
Exec=/path/to/dist/uiforge-local-backend/uiforge-local-backend
Terminal=true
```

(`Terminal=true` matters here -- see the note below on why this app
should stay visible, not hidden.)

**Windows:**
```powershell
pyinstaller app.py --onedir --name uiforge-local-backend
```

**macOS:**
```bash
pyinstaller app.py --onedir --name uiforge-local-backend
```

### Keep it visible -- don't hide the console/terminal

This app has no window of its own -- the console/terminal IS its only
UI. Don't suppress it (e.g. Windows' `--noconsole`, or launching it
detached with output redirected to nowhere on Linux/macOS): without it,
the user has no way to tell it's running, see the "Allowed to be called
from" confirmation, the Browse prerequisite check printed at startup
(zenity/kdialog found? display detected?), or notice if it crashes. If
you want something less terminal-y for end users, a minimal system-tray
icon (e.g. via `pystray`, which works on Linux/Windows/macOS) is a better
fit than hiding output entirely.

"""
LOCAL BACKEND -- runs on the END USER's OWN machine, never deployed
anywhere. Two endpoints, nothing else:

    GET  /select-gds  -- opens a REAL native OS "Open File" dialog
                          (PowerShell on Windows, osascript on macOS,
                          zenity/kdialog on Linux -- see native_dialog.py)
                          and returns the ABSOLUTE PATH the user picked.
                          A browser's own <input type="file"> can NEVER
                          give JavaScript a real filesystem path -- that
                          is a deliberate security restriction in every
                          browser, not something fixable from either side
                          of this app. Opening the dialog SERVER-side
                          (here) is the only way to get a real path at
                          all, which is why this endpoint exists.

    POST /execute     -- for now, just saves whatever the generated page
                          sent as its request body into its own JSON
                          file under output/ -- e.g.
                          {"gds": "...", "script": "..."}, whatever field
                          ids the .txt spec defines. Replace the body of
                          execute() below once you know what the real
                          operation needs to do with that payload -- the
                          payload itself is always just DATA (never a
                          command to run), so it stays safe regardless of
                          what a .txt spec on the online server defines.
                          Returns the FULL absolute path the file was
                          saved to, so the frontend can show the user
                          exactly where to find it.

The generated UI's JavaScript, even though the PAGE was served by the
online server, calls THIS app directly at http://127.0.0.1:8765 (or
whatever port you set) -- the online server is never in that request
path, never sees the payload, never sees a path.

CORS is configured deliberately narrow (see ALLOWED_ORIGINS in app.py):
only the specific online-server origin(s) you list may call this API
from a browser. Without that restriction, ANY website open in ANY other
tab on the user's machine could also send requests here while this app
is running.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, Request

from native_dialog import pick_file, NativeDialogUnavailable

app = FastAPI(title="UIForge -- Local Backend")

# PyInstaller --onefile packages extract themselves into a TEMPORARY
# folder at runtime (e.g. C:\Users\<user>\AppData\Local\Temp\_MEIxxxxx
# on Windows, /tmp/_MEIxxxxx on Linux) and __file__ points INSIDE that
# temp folder, not next to the .exe -- and that temp folder is deleted
# the moment the exe closes. Saving output/ there would mean every
# submission silently vanishes as soon as the user closes the app. When
# frozen (sys.frozen is set by PyInstaller), sys.executable is the real,
# permanent path to the .exe itself, so we anchor output/ next to THAT
# instead. Running as a plain script (python server.py) is unaffected --
# sys.frozen simply isn't set, so it falls back to __file__ as before.
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).resolve().parent
else:
    BASE_DIR = Path(__file__).resolve().parent

OUTPUT_DIR = BASE_DIR / "output"


@app.get("/select-gds")
def select_gds() -> Dict[str, Any]:
    """Returns {"path": "<absolute path>"} once the user picks a file, or
    {"path": None} if they cancel. {"path": None, "error": "..."} if no
    native dialog tool exists on this machine at all (e.g. a headless
    Linux box with neither zenity nor kdialog) -- the frontend shows
    `error` under the Browse button instead of crashing."""
    try:
        path = pick_file()
        return {"path": path, "error": None}
    except NativeDialogUnavailable as e:
        return {"path": None, "error": str(e)}


@app.post("/execute")
async def execute(request: Request) -> Dict[str, Any]:
    """Saves the raw JSON body the generated page sent -- e.g.
    {"gds": "C:\\Projects\\input.gds", "script": "C:\\Projects\\script.py"}
    -- into its own timestamped file under output/. Nothing more than
    that for now; swap this out once the real operation is known."""
    payload: Dict[str, Any] = await request.json()
    if not payload:
        return {"success": False, "message": "No data received."}

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"submission-{time.strftime('%Y-%m-%dT%H-%M-%S')}.json"
    saved_path = OUTPUT_DIR / filename
    saved_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    full_path = str(saved_path.resolve())

    return {
        "success": True,
        "message": f"Saved to {full_path}",
        "savedTo": full_path,
    }

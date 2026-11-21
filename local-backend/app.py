"""
Entry point for the LOCAL BACKEND -- what the end user actually runs on
their own machine (as `python app.py`, or as the packaged
LocalBackend.exe once you PyInstaller it -- see README.md).

Unlike the online server, this does NOT open a browser tab -- it has no
page of its own to show. The user opens YOUR online server's URL in
their browser as usual; that page's JavaScript is what talks to this
app, silently, at http://127.0.0.1:<port>.

--- IMPORTANT: set ALLOWED_ORIGINS below before you ship this ---
This is the single setting that keeps this app from being callable by
ANY random website the user happens to have open. List the exact
origin(s) of your deployed online server here (scheme + host + port,
no trailing slash, no wildcard paths). Example:

    ALLOWED_ORIGINS = ["https://my-ui-generator.com"]

Leaving this as "*" (allow-all) would let ANY page in ANY other browser
tab silently call this app's /api/execute while it's running -- CORS is
the only thing stopping that, so it needs to be this specific, not a
wildcard.
"""
from __future__ import annotations

import argparse

import uvicorn
from fastapi.middleware.cors import CORSMiddleware

from server import app

# EDIT THIS before distributing the packaged app -- see module docstring.
ALLOWED_ORIGINS = [
    "http://127.0.0.1:8000",  # the online server, for local development
    "http://localhost:8000",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "https://ui-automation.chipdesignonline.com",  # deployed frontend -- NO trailing slash
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the UIForge local backend.")
    parser.add_argument(
        "--port",
        type=int,
        default=8765,
        help="Must match window.UIFORGE_LOCAL_BACKEND in the online server's core/html_builder.py",
    )
    parser.add_argument("--debug", action="store_true", help="Verbose server logs")
    args = parser.parse_args()

    print(f"UIForge Local Backend running at http://127.0.0.1:{args.port}")
    print("Leave this window open while you use the generated UI in your browser. Ctrl+C to stop.")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="debug" if args.debug else "warning")


if __name__ == "__main__":
    main()

"""
Opens a native OS "Open File" dialog and returns the chosen path. Runs on
the LOCAL BACKEND -- the end user's own machine -- never on the online
server.

    Windows -> PowerShell's built-in System.Windows.Forms.OpenFileDialog
    Linux   -> zenity, falling back to kdialog

If neither tool is available on Linux, pick_file() raises
NativeDialogUnavailable with a clear message instead of crashing --
server.py turns that into a normal JSON response, and the frontend shows
it as an alert so the user can type the path manually instead.
"""
from __future__ import annotations

import platform
import shutil
import subprocess
from typing import Optional


class NativeDialogUnavailable(Exception):
    """Raised when no native file-dialog tool could be found or run."""


def pick_file() -> Optional[str]:
    """Returns the chosen absolute path, or None if the user cancelled."""
    system = platform.system()
    if system == "Windows":
        return _pick_windows()
    if system == "Linux":
        return _pick_linux()
    raise NativeDialogUnavailable(f"No native file dialog support for platform: {system}")


def _run(cmd: list[str], timeout: float = 300.0) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as e:
        raise NativeDialogUnavailable(f"Could not find '{cmd[0]}': {e}") from e
    except (OSError, subprocess.SubprocessError) as e:
        raise NativeDialogUnavailable(f"Could not launch '{cmd[0]}': {e}") from e


def _pick_windows() -> Optional[str]:
    # System.Windows.Forms is part of the .NET Framework that ships with
    # every Windows install -- PowerShell can use it with no extra setup.
    script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "$f = New-Object System.Windows.Forms.OpenFileDialog; "
        "$f.Filter = 'All files (*.*)|*.*'; "
        "$f.Title = 'Select a file'; "
        "if ($f.ShowDialog() -eq 'OK') { Write-Output $f.FileName }"
    )
    result = _run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script])
    path = result.stdout.strip()
    if not path and result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise NativeDialogUnavailable(stderr or "PowerShell file dialog failed.")
    return path or None  # empty output, exit 0 -- user cancelled


def _pick_linux() -> Optional[str]:
    tool = shutil.which("zenity") or shutil.which("kdialog")
    if not tool:
        raise NativeDialogUnavailable(
            "No native file dialog tool found (looked for 'zenity' and 'kdialog'). "
            "Install one -- e.g. `sudo apt install zenity` (Debian/Ubuntu), "
            "`sudo dnf install zenity` (Fedora), or `sudo pacman -S zenity` (Arch) -- "
            "or type the path directly into the field instead."
        )

    is_zenity = tool.endswith("zenity")
    cmd = [tool, "--file-selection", "--title=Select a file"] if is_zenity else [tool, "--getopenfilename"]
    result = _run(cmd)

    if result.returncode != 0:
        return None  # a genuine Cancel click / dialog closed by the user

    return result.stdout.strip() or None

if __name__ == "__main__":
    try:
        path = pick_file()

        if path:
            print("Selected file:")
            print(path)
        else:
            print("No file selected.")
            
    except NativeDialogUnavailable as e:
        print("ERROR:")
        print(e)
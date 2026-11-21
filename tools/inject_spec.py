#!/usr/bin/env python3
"""Append a UIForge bundle (spec + license ids) to a prebuilt runner.

usage: inject_spec.py RUNNER OUT SPEC.txt [--name N --app-id A --license-id L
                                           --api-url URL --platform-url URL]

Without the license ids the runner behaves as an unlicensed dev build.
Layout appended: [bundle JSON UTF-8][u64 LE length][b"UIFGSPEC"].
"""
import argparse, json, shutil, struct, sys
from pathlib import Path

MAGIC = b"UIFGSPEC"
MAX = 4 * 1024 * 1024

ap = argparse.ArgumentParser()
ap.add_argument("runner"); ap.add_argument("out"); ap.add_argument("spec")
ap.add_argument("--name"); ap.add_argument("--app-id"); ap.add_argument("--license-id")
ap.add_argument("--api-url"); ap.add_argument("--platform-url")
a = ap.parse_args()

spec = Path(a.spec).read_text(encoding="utf-8")
if not spec.strip():
    sys.exit("spec is empty")
bundle = {"v": 1, "spec": spec, "app_name": a.name, "app_id": a.app_id,
          "license_id": a.license_id, "api_url": a.api_url, "platform_url": a.platform_url}
data = json.dumps({k: v for k, v in bundle.items() if v is not None}).encode()
if len(data) > MAX:
    sys.exit("bundle larger than 4 MB")
if Path(a.runner).read_bytes()[-8:] == MAGIC:
    sys.exit("runner already has a bundle appended; use a clean runner")
shutil.copyfile(a.runner, a.out)
with open(a.out, "ab") as f:
    f.write(data + struct.pack("<Q", len(data)) + MAGIC)
Path(a.out).chmod(0o755)

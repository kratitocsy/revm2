#!/usr/bin/env python3
"""Builds the two extension zips in downloads/.

  wynko-extension.zip        - for "Load unpacked" installs. Manifest as-is,
                               so the pinned "key" keeps the same extension ID.
  wynko-extension-store.zip  - for uploading to the Chrome Web Store. The Store
                               rejects a manifest with "key" (it assigns its own
                               ID), and the local dev-server addresses have no
                               business in a public build. The desktop app's
                               bridge on 127.0.0.1:47552 stays.

Run from anywhere: python3 extension/build-zips.py
"""
import json
import zipfile
from pathlib import Path

EXT = Path(__file__).resolve().parent
OUT = EXT.parent / "downloads"

# Repo-only files that aren't part of the extension itself.
SKIP = {"README.md", "package.json", "build-zips.py"}

DESKTOP_BRIDGE = "http://127.0.0.1:47552/*"


def is_dev_address(pattern):
    return pattern != DESKTOP_BRIDGE and ("localhost" in pattern or "127.0.0.1" in pattern)


def store_manifest(manifest):
    m = json.loads(json.dumps(manifest))
    m.pop("key", None)
    m["host_permissions"] = [p for p in m["host_permissions"] if not is_dev_address(p)]
    ec = m.get("externally_connectable", {})
    ec["matches"] = [p for p in ec.get("matches", []) if not is_dev_address(p)]
    return m


def files():
    for path in sorted(EXT.rglob("*")):
        rel = path.relative_to(EXT).as_posix()
        if path.is_dir() or rel in SKIP or rel.endswith(".test.js") or "node_modules" in rel:
            continue
        yield path, rel


def build(name, manifest):
    target = OUT / name
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
        for path, rel in files():
            if rel == "manifest.json":
                z.writestr(rel, json.dumps(manifest, indent=2) + "\n")
            else:
                z.write(path, rel)
    print(f"wrote {target.relative_to(EXT.parent)}")


manifest = json.loads((EXT / "manifest.json").read_text())
build("wynko-extension.zip", manifest)
build("wynko-extension-store.zip", store_manifest(manifest))

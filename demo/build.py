#!/usr/bin/env python3
"""Build a static, offline-data-only Tide showcase for GitHub Pages.

This transforms a *copy* of private/; the production app is never modified.
Run: python3 demo/build.py --output _site
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "demo"

POSES = (
    "desktop",
    "folded-portrait",
    "folded-landscape",
    "unfolded-portrait",
    "unfolded-landscape",
    "split-left",
    "split-right",
)


def replace_one(source: str, original: str, replacement: str, label: str) -> str:
    count = source.count(original)
    if count != 1:
        raise RuntimeError(f"Demo compatibility check failed for {label}: expected 1 match, got {count}")
    return source.replace(original, replacement, 1)


def make_preview_script(source: str) -> str:
    # Derived demo copy only. Keep the real qBittorrent client untouched.
    init = """  const __allowedPreviewPoses = new Set(%s);
  let __previewPose = new URLSearchParams(location.search).get('pose') || 'desktop';
  if (!__allowedPreviewPoses.has(__previewPose)) __previewPose='desktop';
  // Explicitly disable all application fetch() calls in this public copy.
  // Static CSS, script and icon downloads do not go through window.fetch.
  window.fetch = () => Promise.reject(new Error('This is an offline-data-only demo.'));
""" % repr(list(POSES)).replace("'", '"')
    source = replace_one(source, "  'use strict';\n", "  'use strict';\n" + init, "demo bootstrap")

    source = replace_one(
        source,
        "  function detectDuoSplitSide(){\n",
        """  function detectDuoSplitSide(){
    // A desktop browser cannot expose Duo safe areas. Simulate only inside
    // this generated demo copy; production continues to use real insets.
    if (__previewPose==='split-left') return 'left';
    if (__previewPose==='split-right') return 'right';
""",
        "Split View side override",
    )

    source = replace_one(
        source,
        """  const syncDeviceGeometry = () => {
    const standalone=window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone===true;
    const fine=window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;""",
        """  const syncDeviceGeometry = () => {
    // Simulated display capabilities are only used in the generated demo.
    const standalone=__previewPose!=='desktop';
    const fine=__previewPose==='desktop';""",
        "device pose override",
    )

    source = replace_one(
        source,
        """  syncDeviceGeometry();
  // Split View can move between halves with unchanged viewport dimensions.""",
        """  syncDeviceGeometry();
  // Change device pose without reloading, preserving mock torrent changes.
  window.addEventListener('message', event=>{
    if(event.source!==window.parent || event.origin!==window.location.origin) return;
    if(event.data?.type!=='tide-demo-set-pose' || !__allowedPreviewPoses.has(event.data.pose)) return;
    __previewPose=event.data.pose;
    syncDeviceGeometry();
  });
  // Split View can move between halves with unchanged viewport dimensions.""",
        "live pose switching",
    )

    source = replace_one(
        source,
        "  const demo = location.protocol === 'file:' || new URLSearchParams(location.search).get('demo') === '1';",
        "  const demo = true; // Public generated demo copy: always use fake data.",
        "force demo mode",
    )
    if "tide-demo-set-pose" not in source or "const demo = true;" not in source:
        raise RuntimeError("Demo runtime was not fully patched")
    return source


def build(output: Path) -> None:
    output = output.resolve()
    if output in (ROOT, DEMO, ROOT / "private", ROOT / "public"):
        raise RuntimeError("Refusing to overwrite source directories")
    output.mkdir(parents=True, exist_ok=True)
    app = output / "app"
    if app.exists():
        shutil.rmtree(app)
    shutil.copytree(ROOT / "private", app)

    scripts = sorted((app / "js").glob("tide-v*.js"))
    if len(scripts) != 1:
        raise RuntimeError(f"Expected exactly one versioned Tide script, found {len(scripts)}")
    script = scripts[0]
    script.write_text(make_preview_script(script.read_text(encoding="utf-8")), encoding="utf-8")

    app_index = app / "index.html"
    index = app_index.read_text(encoding="utf-8")
    index = replace_one(index, "<title>Tide</title>", "<title>Tide · Interactive Demo</title>", "page title")
    index = index.replace('<link rel="manifest" href="manifest.json">', "")
    # Defense in depth: the preview must never contact a qBittorrent API.
    csp = ('<meta http-equiv="Content-Security-Policy" '
           'content="default-src \'self\' data: blob:; connect-src \'none\'; '
           'img-src \'self\' data: blob:; script-src \'self\'; '
           'style-src \'self\' \'unsafe-inline\'; '
           'object-src \'none\'; form-action \'none\'; base-uri \'self\'">')
    index = replace_one(index, '<meta charset="utf-8">', '<meta charset="utf-8">\n  '+csp, "demo-only CSP")
    app_index.write_text(index, encoding="utf-8")

    for name in ("index.html", "showcase.css", "showcase.js"):
        shutil.copy2(DEMO / name, output / name)
    version = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
    showcase = (output / "index.html").read_text(encoding="utf-8")
    showcase = re.sub(r'<span id="demoVersion">[^<]+</span>',
                      f'<span id="demoVersion">v{version}</span>', showcase, count=1)
    (output / "index.html").write_text(showcase, encoding="utf-8")
    (output / ".nojekyll").write_text("", encoding="utf-8")

    # The build output contains a public static demo, not qBittorrent config.
    assert (output / "app" / "icon.png").exists()
    assert (output / "app" / "css").is_dir()
    assert (output / "index.html").exists()
    print(f"Built Tide demo at {output}")


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--output", type=Path, default=ROOT / "_site")
    build(cli.parse_args().output)

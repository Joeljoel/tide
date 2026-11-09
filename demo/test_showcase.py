#!/usr/bin/env python3
"""Browser smoke test and screenshots of the generated GitHub Pages demo."""
from __future__ import annotations

import argparse
import functools
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright, expect


def run(site: Path, snapshots: Path) -> None:
    snapshots.mkdir(parents=True, exist_ok=True)
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(site))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    poses = []

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1480, "height": 960},
                device_scale_factor=1,
                reduced_motion="reduce",
            )
            page = context.new_page()
            page.goto(url, wait_until="load", timeout=30000)
            demo = page.frame_locator("#tidePreview")
            expect(demo.locator(".torrent-card").first).to_be_visible(timeout=20000)

            # Before any device changes, verify the real Tide form uses
            # isolated, prefilled, fake magnet data and inserts a sample.
            before = demo.locator(".torrent-card").count()
            demo.locator(".desktop-add").click()
            magnet = demo.locator("#magnetInput")
            expect(magnet).to_have_value(
                "magnet:?xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567&dn=Tide+Demo+Collection"
            )
            expect(demo.locator("#torrentFile")).to_be_disabled()
            demo.locator("#addForm button[type=submit]").click()
            expect(demo.locator(".torrent-card")).to_have_count(before + 1, timeout=20000)
            expect(demo.locator(".torrent-card").filter(has_text="Tide Demo Collection")).to_have_count(1)

            def capture(pose: str) -> None:
                expect(page.locator("#deviceFrame")).to_have_attribute("data-pose", pose)
                page.wait_for_function(
                    """pose => document.querySelector('#tidePreview')
                      ?.contentDocument?.body?.dataset.tideDemoPose === pose""",
                    arg=pose,
                    timeout=10000,
                )
                if pose == "split-left":
                    expect(demo.locator("body")).to_have_class(
                        re.compile(r"\btide-split-left\b"), timeout=10000
                    )
                if pose == "split-right":
                    expect(demo.locator("body")).to_have_class(
                        re.compile(r"\btide-split-right\b"), timeout=10000
                    )
                page.screenshot(
                    path=str(snapshots / f"{pose}.png"),
                    full_page=True,
                    animations="disabled",
                )
                poses.append(pose)

            capture("desktop")
            page.locator("#duoBtn").click()
            capture("folded-portrait")  # Duo always begins folded portrait
            page.locator("#rotateBtn").click()
            capture("folded-landscape")
            page.locator("#foldBtn").click()
            capture("unfolded-landscape")  # Unfold resets orientation
            page.locator("#rotateBtn").click()
            capture("unfolded-portrait")
            page.locator("#foldBtn").click()
            capture("folded-portrait")  # Fold resets orientation
            page.locator("#foldBtn").click()
            capture("unfolded-landscape")
            expect(page.locator("#splitBtn")).to_be_visible()
            page.locator("#splitBtn").click()
            capture("split-left")
            expect(page.locator("#shiftBtn")).to_be_visible()
            page.locator("#shiftBtn").click()
            capture("split-right")
            # Home image files are intentionally withheld until user approval.
            # The review build must render its obvious placeholder instead.
            assert "Home Screen" in page.locator("#homePanel").evaluate(
                "el => getComputedStyle(el, '::after').content"
            )
            assert page.locator(".status-camera img").count() == 0
            assert page.locator("#deviceFrame").evaluate(
                "el => !!el.querySelector('.status-camera')"
            )

            # The public showcase should never expose the removed footer.
            assert page.locator("#demoVersion").count() == 0
            assert page.get_by_text("Fake torrents and settings").count() == 0
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

    assert len(poses) == 9, poses
    print("Passed browser checks for:", ", ".join(poses))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("site", type=Path)
    parser.add_argument("snapshots", type=Path)
    args = parser.parse_args()
    run(args.site.resolve(), args.snapshots.resolve())

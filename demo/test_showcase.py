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
                camera = page.locator(".status-camera")
                if pose.startswith("folded-"):
                    expect(camera).to_be_visible()
                    camera_box = camera.bounding_box()
                    screen = page.locator("#deviceScreen").bounding_box()
                    scale = screen["width"] / (466 if pose == "folded-portrait" else 678)
                    cx = camera_box["x"] + camera_box["width"] / 2
                    cy = camera_box["y"] + camera_box["height"] / 2
                    assert abs((screen["x"] + screen["width"] - cx) / scale - 48) < 1
                    edge = cy - screen["y"] if pose == "folded-portrait" else screen["y"] + screen["height"] - cy
                    assert abs(edge / scale - 48) < 1
                    if pose == "folded-landscape":
                        expect(demo.locator("body")).to_have_class(
                            re.compile(r"\btide-folded-camera-bottom-right\b")
                        )
                        search = demo.locator('#actionRail [data-action="search"]').bounding_box()
                        assert search["y"] + search["height"] < camera_box["y"]
                else:
                    expect(camera).to_be_hidden()
                status = page.locator(".status-indicators")
                connectivity_top = {
                    "folded-portrait": 109,
                    "unfolded-landscape": 66,
                    "unfolded-portrait": 27,
                    "split-right": 66,
                }
                if pose.startswith("partially-folded-"):
                    # The screen is now truly divided into independent 3D
                    # planes, and the farther plane is perspective-transformed.
                    flap = page.locator("#foldFlap")
                    expect(flap).to_be_visible()
                    transform = flap.evaluate("el => getComputedStyle(el).transform")
                    assert transform.startswith("matrix3d("), transform
                    clip = page.locator("#deviceScreen").evaluate(
                        "el => getComputedStyle(el).clipPath"
                    )
                    assert clip.startswith("inset(") and "50%" in clip, clip
                    expect(page.locator("#tideFoldPreview")).to_be_visible()
                    if pose.endswith("portrait"):
                        expect(status).to_be_visible()
                    else:
                        expect(page.locator(".fold-flap-status")).to_be_visible()
                        expect(page.locator(".fold-flap-status img")).to_be_visible()
                elif pose in connectivity_top:
                    expect(status).to_be_visible()
                    location = status.locator(".status-location")
                    if pose == "folded-portrait":
                        expect(location).to_be_hidden()
                    else:
                        expect(location).to_be_visible()
                    gauge = status.locator(".status-connectivity")
                    expect(gauge).to_be_visible()
                    assert gauge.evaluate("el => el.complete && el.naturalWidth > 0")
                    screen_el = page.locator("#deviceScreen")
                    screen = screen_el.bounding_box()
                    scale = screen["width"] / screen_el.evaluate("el => el.offsetWidth")
                    box = gauge.bounding_box()
                    assert abs((box["y"] - screen["y"]) / scale - connectivity_top[pose]) < 1
                    right_inset = screen["x"] + screen["width"] - box["x"] - box["width"]
                    assert abs(right_inset / scale - 27) < 1
                    assert abs(box["width"] / scale - 42) < 1
                    clock = status.locator(".status-time").bounding_box()
                    if pose in ("unfolded-portrait", "partially-folded-portrait"):
                        assert clock["x"] + clock["width"] < box["x"]
                    else:
                        assert clock["y"] + clock["height"] < box["y"]
                else:
                    expect(status).to_be_hidden()
                if pose.startswith("split-"):
                    panes = page.locator(".duo-panel")
                    left, right = sorted((pane.bounding_box() for pane in panes.all()), key=lambda box: box["x"])
                    screen = page.locator("#deviceScreen").bounding_box()
                    assert abs(left["x"] - screen["x"]) < 1
                    assert abs(right["x"] + right["width"] - screen["x"] - screen["width"]) < 1
                    scale = screen["width"] / 951
                    divider = right["x"] - left["x"] - left["width"]
                    assert abs(divider / scale - 13) < 1
                    handle = page.locator(".split-handle")
                    expect(handle).to_be_visible()
                    grip = handle.bounding_box()
                    assert abs(grip["x"] + grip["width"] / 2 - screen["x"] - screen["width"] / 2) < 1
                    visible_side = "right" if pose == "split-left" else "left"
                    hidden_side = "left" if visible_side == "right" else "right"
                    home = page.locator(f".home-{visible_side}")
                    expect(home).to_be_visible()
                    expect(page.locator(f".home-{hidden_side}")).to_be_hidden()
                    assert home.evaluate("el => el.naturalWidth === 1010 && el.naturalHeight === 1440")
                    assert left["y"] == right["y"] == screen["y"]
                    assert left["height"] == right["height"] == screen["height"]
                page.screenshot(
                    path=str(snapshots / f"{pose}.png"),
                    full_page=True,
                    animations="disabled",
                )
                poses.append(pose)

            capture("desktop")
            page.locator("#duoBtn").click()
            capture("folded-portrait")  # Duo always begins folded portrait
            expect(page.locator("#foldedBtn")).to_have_attribute("aria-checked", "true")
            page.locator("#unfoldedBtn").focus()
            page.keyboard.press("ArrowLeft")
            expect(page.locator("#partialBtn")).to_have_attribute("aria-checked", "true")
            page.locator("#foldedBtn").click()
            expect(page.locator("#foldedBtn")).to_have_attribute("aria-checked", "true")
            page.locator("#rotateBtn").click()
            capture("folded-landscape")
            page.locator("#unfoldedBtn").click()
            capture("unfolded-landscape")  # Orientation stays landscape
            page.locator("#rotateBtn").click()
            capture("unfolded-portrait")

            # One posture toggle uses Rotate to choose book vs laptop pose.
            page.locator("#partialBtn").click()
            capture("partially-folded-portrait")
            expect(demo.locator("body")).to_have_class(
                re.compile("tide-posture-folded-portrait"), timeout=10000
            )
            expect(demo.locator(".torrent-card").first).to_be_visible()
            # Compact Details normally hides the list. In the laptop pose both
            # list and lower Details must remain interactive and visible.
            demo.locator(".torrent-card").first.evaluate("el => el.click()")
            demo.locator('[data-action="detail"]').first.evaluate("el => el.click()")
            expect(demo.locator("#detailPanel.mobile-open")).to_be_visible()
            expect(demo.locator(".torrent-card").first).to_be_visible()
            assert demo.locator(".list-panel").evaluate(
                "el => getComputedStyle(el).visibility"
            ) == "visible"
            demo.locator('[data-action="close-detail"]').first.evaluate("el => el.click()")

            page.locator("#rotateBtn").click()
            capture("partially-folded-landscape")
            expect(demo.locator("body")).to_have_class(
                re.compile("tide-posture-folded-landscape"), timeout=10000
            )
            grid = demo.locator("#torrentList").evaluate(
                "el => getComputedStyle(el).gridTemplateColumns"
            )
            assert len(grid.split()) == 2, grid
            # The settings dialog should sit entirely on the right pane.
            demo.locator('.header-settings-button').evaluate("el => el.click()")
            expect(demo.locator(".tide-settings-dialog")).to_be_visible()
            modal_left = demo.locator(".tide-settings-dialog").evaluate(
                "el => el.getBoundingClientRect().left"
            )
            assert modal_left > 951 / 2, modal_left
            demo.locator('[data-action="dismiss"]').first.evaluate("el => el.click()")

            page.locator("#unfoldedBtn").click()
            capture("unfolded-landscape")
            page.locator("#rotateBtn").click()
            capture("unfolded-portrait")
            page.locator("#foldedBtn").click()
            capture("folded-portrait")
            page.locator("#unfoldedBtn").click()
            capture("unfolded-portrait")
            page.locator("#rotateBtn").click()
            capture("unfolded-landscape")
            expect(page.locator("#splitBtn")).to_be_visible()
            page.locator("#splitBtn").click()
            capture("split-left")
            expect(page.locator("#shiftBtn")).to_be_visible()
            page.locator("#shiftBtn").click()
            capture("split-right")
            page.locator("#splitBtn").click()
            page.locator("#rotateBtn").click()
            capture("unfolded-portrait")

            # Exercise the animated path at a narrow width, where independently
            # fitting each pose would give a different scale.
            page.set_viewport_size({"width": 640, "height": 840})
            page.emulate_media(reduced_motion="no-preference")
            frame = page.locator("#deviceFrame")
            page.locator("#desktopBtn").click()
            page.locator("#duoBtn").click()

            def animated_pose(button, pose):
                page.locator(f"#{button}").click()
                expect(frame).to_have_attribute("aria-busy", "true")
                expect(frame).to_have_attribute("data-pose", pose)
                expect(page.locator("#deviceFrame[aria-busy]")).to_have_count(0)
                return frame.bounding_box()

            folded_portrait = frame.bounding_box()
            folded_landscape = animated_pose("rotateBtn", "folded-landscape")
            unfolded_landscape = animated_pose("unfoldedBtn", "unfolded-landscape")
            unfolded_portrait = animated_pose("rotateBtn", "unfolded-portrait")
            for portrait, landscape in (
                (folded_portrait, folded_landscape),
                (unfolded_portrait, unfolded_landscape),
            ):
                assert abs(portrait["width"] - landscape["height"]) < 1
                assert abs(portrait["height"] - landscape["width"]) < 1
            assert abs(folded_portrait["height"] - unfolded_landscape["height"]) < 1
            assert abs(2 * folded_portrait["width"] / unfolded_landscape["width"] - 1) < .02
            animated_pose("foldedBtn", "folded-portrait")
            animated_pose("unfoldedBtn", "unfolded-portrait")
            animated_pose("rotateBtn", "unfolded-landscape")
            animated_pose("splitBtn", "split-left")
            animated_pose("shiftBtn", "split-right")
            animated_pose("splitBtn", "unfolded-landscape")
            animated_pose("partialBtn", "partially-folded-landscape")
            animated_pose("rotateBtn", "partially-folded-portrait")
            animated_pose("unfoldedBtn", "unfolded-portrait")
            expect(demo.locator(".torrent-card").filter(has_text="Tide Demo Collection")).to_have_count(1)

            # The public showcase should never expose the removed footer.
            assert page.locator("#demoVersion").count() == 0
            assert page.get_by_text("Fake torrents and settings").count() == 0
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

    assert len(poses) == 15, poses
    print("Passed browser checks for:", ", ".join(poses))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("site", type=Path)
    parser.add_argument("snapshots", type=Path)
    args = parser.parse_args()
    run(args.site.resolve(), args.snapshots.resolve())

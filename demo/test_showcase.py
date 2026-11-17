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
            # The two visual planes must begin with the same sample torrents
            # even when changes were made before the fold was opened.
            other = page.frame_locator("#tideFoldPreview")
            expect(other.locator(".torrent-card").filter(
                has_text="Tide Demo Collection"
            )).to_have_count(1, timeout=20000)

            def capture(pose: str) -> None:
                expect(page.locator("#deviceFrame")).to_have_attribute("data-pose", pose)
                # The outer device can be partially folded while its Split
                # View app uses the identical full-unfolded split layout.
                app_pose = pose.removeprefix("partially-folded-") if (
                    pose.startswith("partially-folded-split-")
                ) else pose
                page.wait_for_function(
                    """pose => document.querySelector('#tidePreview')
                      ?.contentDocument?.body?.dataset.tideDemoPose === pose""",
                    arg=app_pose,
                    timeout=10000,
                )
                if app_pose == "split-left":
                    expect(demo.locator("body")).to_have_class(
                        re.compile(r"\btide-split-left\b"), timeout=10000
                    )
                if app_pose == "split-right":
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
                        # Rail icons can reposition in response to the
                        # demo's retained selection state. Here check the
                        # physical camera anchor; detailed rail geometry is
                        # verified by Tide's device-layout tests.
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
                    near = page.locator("#foldNearPlane")
                    expect(near).to_be_visible()
                    assert near.evaluate("el => getComputedStyle(el).overflow") == "hidden"
                    assert page.locator("#deviceScreen").evaluate(
                        "el => getComputedStyle(el).transform"
                    ) == "none"
                    first_matrix = near.evaluate(
                        "el => getComputedStyle(el).transform"
                    )
                    assert first_matrix.startswith("matrix3d("), first_matrix
                    # A valley-shaped fold has both exterior edges closer
                    # to the viewer than the central hinge.
                    parse_matrix = lambda m: [
                        float(v.strip()) for v in m[len("matrix3d("):-1].split(",")
                    ]
                    first, second = parse_matrix(first_matrix), parse_matrix(transform)
                    signed_component = 6 if pose.endswith("portrait") else 2
                    assert first[signed_component] < -0.05, first
                    assert second[signed_component] > 0.05, second
                    assert abs(first[signed_component]) < 0.20, first
                    assert abs(second[signed_component]) < 0.20, second
                    # No large blackout gradient at the crease.
                    light = page.locator(".fold-flap-light").evaluate(
                        "el => getComputedStyle(el).backgroundImage"
                    )
                    assert "rgba(233, 249, 255" in light and "rgba(0, 0, 0, 0.5" not in light, light
                    expect(page.locator("#tideFoldPreview")).to_be_visible()
                    for clip in ("#foldNearViewport", "#foldFlapViewport"):
                        surface = page.locator(clip)
                        assert surface.evaluate(
                            "el => getComputedStyle(el).maskImage"
                        ) != "none", clip
                    assert demo.locator(".torrent-card").first.evaluate(
                        "el => getComputedStyle(el).backdropFilter"
                    ) == "none"
                    if pose.endswith("portrait"):
                        expect(status).to_be_visible()
                    elif pose == "partially-folded-split-left":
                        expect(page.locator(".fold-home-visual")).to_be_visible()
                        expect(page.locator(".fold-flap-status")).to_be_hidden()
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

            def assert_shared_scroll(source_is_far=False) -> None:
                # The physical fold is one viewport. Its two visual frames
                # must render the same logical list offset, including when
                # the user scrolls on the far half of the 3D fold.
                if source_is_far:
                    page.evaluate("""() => {
                      for(const id of ['tidePreview','tideFoldPreview'])
                        document.getElementById(id).contentDocument
                          .querySelector('.list-panel').scrollTop=0;
                    }""")
                    page.locator("#foldInteraction").dispatch_event(
                        "wheel", {"deltaY":190, "deltaX":0,
                                  "deltaMode":0, "bubbles":True,
                                  "cancelable":True})
                else:
                    page.evaluate("""() => {
                        document.getElementById('tidePreview')
                          .contentDocument.querySelector('.list-panel')
                          .scrollTop=190;
                    }""")
                page.wait_for_function("""() => {
                  const a=document.getElementById('tidePreview')
                    .contentDocument.querySelector('.list-panel');
                  const b=document.getElementById('tideFoldPreview')
                    .contentDocument.querySelector('.list-panel');
                  return a.scrollTop>30 && b.scrollTop>30 &&
                    Math.abs(a.scrollTop-b.scrollTop)<3;
                }""", timeout=10000)

            capture("desktop")
            page.locator("#duoBtn").click()
            capture("folded-portrait")

            # Three physical stops with accessible arrow-key selection.
            expect(page.locator("#foldedBtn")).to_have_attribute("aria-checked", "true")
            page.locator("#unfoldedBtn").focus()
            page.keyboard.press("ArrowLeft")
            expect(page.locator("#partialBtn")).to_have_attribute("aria-checked", "true")
            capture("partially-folded-landscape")  # Outer portrait becomes inner landscape
            assert_shared_scroll()
            # Both planes must be gently bent, with visible physical bezels.
            near=page.locator("#foldNearPlane")
            assert near.evaluate(
              "el => getComputedStyle(el,'::after').borderLeftWidth"
            ) == "5px"
            assert page.locator("#foldFlap").evaluate(
              "el => getComputedStyle(el,'::after').borderRightWidth"
            ) == "5px"
            for selector in ("#foldNearPlane", "#foldFlap"):
                m=page.locator(selector).evaluate(
                  "el => getComputedStyle(el).transform"
                )
                assert m.startswith("matrix3d("), m
                assert float(m.split(",")[0].replace("matrix3d(", "")) > 0.94, m

            page.locator("#foldedBtn").click()
            capture("folded-portrait")
            page.locator("#rotateBtn").click()
            capture("folded-landscape")
            page.locator("#unfoldedBtn").click()
            capture("unfolded-portrait")  # Outer landscape becomes inner portrait
            page.locator("#rotateBtn").click()
            capture("unfolded-landscape")

            page.locator("#partialBtn").click()
            capture("partially-folded-landscape")
            expect(demo.locator("body")).to_have_class(
                re.compile("tide-posture-folded-landscape"), timeout=10000
            )
            grid=demo.locator("#torrentList").evaluate(
                "el => getComputedStyle(el).gridTemplateColumns"
            )
            assert len(grid.split()) == 2, grid
            assert_shared_scroll(True)

            # Stress the cards across hover/selection/scroll while their
            # visual surfaces stay GPU-clipped. Both iframes retain all items.
            card_count=demo.locator(".torrent-card").count()
            for _ in range(5):
                demo.locator(".torrent-card").first.hover(force=True)
                assert demo.locator(".torrent-card").count()==card_count
                assert other.locator(".torrent-card").count()==card_count
                page.locator("#foldInteraction").dispatch_event(
                    "wheel", {"deltaY":110, "deltaMode":0,
                              "cancelable":True, "bubbles":True})
            assert demo.locator(".torrent-card").count()==card_count
            assert other.locator(".torrent-card").count()==card_count

            # The partial book can run the *same* Split View as full-open.
            expect(page.locator("#splitBtn")).to_be_visible()
            page.locator("#splitBtn").click()
            capture("partially-folded-split-left")
            expect(page.locator("#deviceFrame")).to_have_class(
                re.compile("is-partially-folded")
            )
            expect(page.locator("#deviceFrame")).to_have_class(
                re.compile("is-split")
            )
            assert page.locator(".fold-home-visual").is_visible()
            assert not demo.locator("body").evaluate(
                "el => el.classList.contains('tide-posture-folded-landscape')"
            )
            page.locator("#shiftBtn").click()
            capture("partially-folded-split-right")
            assert not page.locator(".fold-home-visual").is_visible()
            expect(demo.locator("body")).to_have_class(
                re.compile("tide-split-right")
            )
            page.locator("#unfoldedBtn").click()
            capture("split-right")
            page.locator("#partialBtn").click()
            capture("partially-folded-split-right")
            page.locator("#splitBtn").click()
            capture("partially-folded-landscape")

            # Book posture Settings stays within the right-hand half.
            demo.locator(".header-settings-button").evaluate("el => el.click()")
            expect(demo.locator(".tide-settings-dialog")).to_be_visible()
            modal_left=demo.locator(".tide-settings-dialog").evaluate(
                "el => el.getBoundingClientRect().left"
            )
            assert modal_left > 951 / 2, modal_left
            demo.locator('[data-action="dismiss"]').first.evaluate("el => el.click()")

            page.locator("#rotateBtn").click()
            capture("partially-folded-portrait")
            # The upper half retains the real top bezel, including corners.
            assert page.locator("#foldNearPlane").evaluate(
              "el => getComputedStyle(el,'::after').borderTopWidth"
            ) == "5px"
            expect(demo.locator("body")).to_have_class(
                re.compile("tide-posture-folded-portrait"), timeout=10000
            )
            assert_shared_scroll()
            expect(demo.locator(".torrent-card").first).to_be_visible()
            demo.locator(".torrent-card").first.evaluate("el => el.click()")
            demo.locator('[data-action="detail"]').first.evaluate("el => el.click()")
            expect(demo.locator("#detailPanel.mobile-open")).to_be_visible()
            expect(demo.locator(".torrent-card").first).to_be_visible()
            assert demo.locator(".list-panel").evaluate(
                "el => getComputedStyle(el).visibility"
            ) == "visible"
            demo.locator('[data-action="close-detail"]').first.evaluate("el => el.click()")

            page.locator("#unfoldedBtn").click()
            capture("unfolded-portrait")
            page.locator("#foldedBtn").click()
            capture("folded-landscape")
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

            folded_portrait=frame.bounding_box()
            unfolded_landscape=animated_pose("unfoldedBtn", "unfolded-landscape")
            folded_again=animated_pose("foldedBtn", "folded-portrait")
            assert abs(folded_again["width"]-folded_portrait["width"]) < 1
            assert abs(folded_portrait["height"]-unfolded_landscape["height"]) < 1
            assert abs(2*folded_portrait["width"]/unfolded_landscape["width"]-1) < .02
            folded_landscape=animated_pose("rotateBtn", "folded-landscape")
            unfolded_portrait=animated_pose("unfoldedBtn", "unfolded-portrait")
            assert abs(folded_landscape["width"]-folded_portrait["height"]) < 1
            assert abs(unfolded_portrait["width"]-unfolded_landscape["height"]) < 1
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

    assert len(poses) == 21, poses
    print("Passed browser checks for:", ", ".join(poses))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("site", type=Path)
    parser.add_argument("snapshots", type=Path)
    args = parser.parse_args()
    run(args.site.resolve(), args.snapshots.resolve())

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
                expect(page.locator("#previewNote")).to_have_text("v1.4.2")
                assert page.locator("#poseName").inner_text() not in (
                    "3D hinge preview", "Interactive preview"
                )
                # The outer device can be partially folded while its Split
                # View app uses the identical full-unfolded split layout.
                app_pose = pose.removeprefix("partially-folded-") if (
                    pose.startswith("partially-folded-split-")
                ) else pose
                page.wait_for_function(
                    """pose => ['tidePreview','tideFoldPreview'].every(id =>
                      document.getElementById(id)
                        ?.contentDocument?.body?.dataset.tideDemoPose === pose)""",
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
                # Both flat and hinged screens share one phone-level shadow
                # and the same faint outer highlight, independent of pose.
                chrome = page.locator("#frameHolder").evaluate(
                    "el => getComputedStyle(el,'::before').boxShadow"
                )
                assert "56px" in chrome, (pose, chrome)
                assert "rgba(112, 129, 142" not in chrome, (
                    "Flat outline should never leak at the centre hinge",
                    pose, chrome
                )
                frame_rim=page.locator("#deviceFrame").evaluate(
                    "el => getComputedStyle(el).boxShadow"
                )
                if pose.startswith("partially-folded-"):
                    assert frame_rim=="none", frame_rim
                else:
                    assert "rgba(112, 129, 142" in frame_rim, (
                        pose, frame_rim
                    )
                status = page.locator("#systemUi .status-indicators")
                # All Duo states now share a continuous, even bezel.
                if pose!="desktop":
                    borders=page.locator("#deviceFrame").evaluate(
                      "el => ['Top','Right','Bottom','Left'].map(side => "+ 
                      "getComputedStyle(el)['border'+side+'Width'])"
                    )
                    assert borders==["8px"]*4, (pose,borders)
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
                    # A non-clipping 3D hinge shell contains a separately
                    # masked clipping viewport for stable iframes.
                    assert page.locator("#foldNearViewport").evaluate(
                        "el => getComputedStyle(el).overflow"
                    ) == "hidden"
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
                    for element in ("#foldNearPlane","#foldFlap"):
                        # No fold-only inner glow at the glass edge.
                        # Its dark bezel must render without an inset
                        # box-shadow, while retaining the 1px OUTER rim.
                        inner_glow=page.locator(element).evaluate(
                            "el => getComputedStyle(el,'::after').boxShadow"
                        )
                        assert inner_glow=="none", (
                            element, pose, inner_glow
                        )
                        rim=page.locator(element).evaluate(
                            "el => getComputedStyle(el,'::before').borderColor"
                        )
                        assert "rgba(112, 129, 142" in rim, (
                            element, pose, rim
                        )
                        rim_geometry=page.locator(element).evaluate(
                            "el => {const s=getComputedStyle(el,'::before');"+
                            "return [s.borderTopWidth,s.borderRightWidth,"+
                            "s.borderBottomWidth,s.borderLeftWidth]}"
                        )
                        assert rim_geometry.count("1px")==3, (
                            element, pose, rim_geometry
                        )
                    for element in ("#foldNearSheen", "#hingeSheen"):
                        expect(page.locator(element)).to_be_visible()
                    assert page.locator("#hingeSheen").evaluate(
                        "el => getComputedStyle(el).opacity"
                    ) == "0.2"
                    # Both visual planes use the exact same clock, location
                    # arrow and connectivity artwork as the fully open state.
                    assert page.evaluate("""() => {
                      const near=document.querySelector('#systemUi .status-indicators');
                      const far=document.querySelector('.fold-flap-status');
                      return near.querySelector('.status-time').textContent===
                             far.querySelector('.status-time').textContent &&
                             near.querySelector('.status-location').innerHTML===
                             far.querySelector('.status-location').innerHTML &&
                             near.querySelector('.status-connectivity').getAttribute('src')===
                             far.querySelector('.status-connectivity').getAttribute('src')
                    }"""), "Inconsistent status artwork across fold states"
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
                        expect(page.locator(".fold-flap-status")).to_be_hidden()
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
            ) == "8px"
            assert page.locator("#foldFlap").evaluate(
              "el => getComputedStyle(el,'::after').borderRightWidth"
            ) == "8px"
            # The 8px strokes occupy transparent FRAME-border space,
            # not any pixels of the app viewport (the former inner strokes).
            outer=page.locator("#deviceFrame").evaluate(
                "el => getComputedStyle(el).borderLeftColor"
            )
            assert outer=="rgba(0, 0, 0, 0)", outer
            near_outer=page.locator("#foldNearPlane").evaluate(
                "el => getComputedStyle(el,'::after').left"
            )
            far_outer=page.locator("#foldFlap").evaluate(
                "el => getComputedStyle(el,'::after').right"
            )
            assert near_outer=="-8px" and far_outer=="-8px", (
                near_outer,far_outer
            )
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
            # Fold posture must not recolour cards. Blur can be disabled in
            # the rendered showcase, but original Tide colours are retained.
            def first_card_colour():
                return demo.locator(".torrent-card:not(.selected)").first.evaluate(
                    "el => {const s=getComputedStyle(el);"+
                    "return [s.backgroundImage,s.backgroundColor,s.borderColor]}")
            unfolded_colours=first_card_colour()

            page.locator("#partialBtn").click()
            capture("partially-folded-landscape")
            assert first_card_colour()==unfolded_colours, (
                "Partial fold changed Torrent card colours",
                first_card_colour(),unfolded_colours
            )
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

            # A click on the physically folded far half must select the same
            # logical torrent in the primary instance and the passive mirror.
            # We route the click through the overlay at that card's projected
            # position rather than interacting with the hidden second iframe.
            target_hash=page.evaluate("""() => {
              const app=document.getElementById('tidePreview').contentDocument;
              const mirror=document.getElementById('tideFoldPreview').contentDocument;
              app.querySelector('.list-panel').scrollTop=0;
              mirror.querySelector('.list-panel').scrollTop=0;
              return app.querySelectorAll('.torrent-card')[1]?.dataset.hash;
            }""")
            assert target_hash, "Expected a torrent in the right column"
            page.wait_for_timeout(120)
            page.evaluate("""hash => {
              const original=document.getElementById('tidePreview');
              const card=original.contentDocument.querySelector(
                '.torrent-card[data-hash="'+hash+'"]');
              const cardBox=card.getBoundingClientRect();
              const overlay=document.getElementById('foldInteraction');
              const outer=overlay.getBoundingClientRect();
              const relativeX=(cardBox.left+cardBox.width/2)/original.contentWindow.innerWidth;
              const relativeY=(cardBox.top+cardBox.height/2)/original.contentWindow.innerHeight;
              if(relativeX<=.5)throw Error('Expected second column on far side');
              overlay.dispatchEvent(new MouseEvent('click',{
                bubbles:true,clientX:outer.left+(relativeX-.5)*2*outer.width,
                clientY:outer.top+relativeY*outer.height
              }));
            }""", target_hash)
            expect(demo.locator('.torrent-card[data-hash="'+target_hash+'"]')).to_have_class(
                re.compile("selected"), timeout=10000
            )
            expect(other.locator('.torrent-card[data-hash="'+target_hash+'"]')).to_have_class(
                re.compile("selected"), timeout=10000
            )

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
            # Same half-width app viewport as fully unfolded Split View.
            left_width=page.evaluate("""() =>
              document.getElementById('tidePreview').contentWindow.innerWidth""")
            right_width=page.evaluate("""() =>
              document.getElementById('tideFoldPreview').contentWindow.innerWidth""")
            assert abs(left_width-right_width)<2,(left_width,right_width)
            assert right_width<600,right_width
            expect(other.locator(".brand")).to_be_visible()
            expect(demo.locator("body")).to_have_class(
                re.compile("tide-split-right")
            )
            page.locator("#unfoldedBtn").click()
            capture("split-right")
            page.locator("#partialBtn").click()
            capture("partially-folded-split-right")
            page.locator("#splitBtn").click()
            capture("partially-folded-landscape")

            # Header settings click stops propagation in Tide itself; the
            # preview must synchronize modal DOM without relying on bubbling.
            demo.locator(".header-settings-button").evaluate("el => el.click()")
            expect(demo.locator(".tide-settings-dialog")).to_be_visible()
            expect(other.locator(".tide-settings-dialog")).to_be_visible()
            modal_left=demo.locator(".tide-settings-dialog").evaluate(
                "el => el.getBoundingClientRect().left"
            )
            assert modal_left > 951 / 2, modal_left

            def click_far(selector: str) -> None:
                # Click the projected far-half interaction layer at the
                # midpoint of the control as drawn in the visual iframe.
                page.evaluate("""selector => {
                    const far=document.getElementById('tideFoldPreview');
                    const doc=far.contentDocument;
                    const ctl=doc.querySelector(selector);
                    if(!ctl)throw Error('Missing far control: '+selector);
                    const r=ctl.getBoundingClientRect();
                    const fx=(r.left+r.width/2)/far.contentWindow.innerWidth;
                    const fy=(r.top+r.height/2)/far.contentWindow.innerHeight;
                    const layer=document.getElementById('foldInteraction');
                    const box=layer.getBoundingClientRect();
                    if(fx<=.5)throw Error('Control is outside visible far half');
                    layer.dispatchEvent(new MouseEvent('click',{
                      bubbles:true,
                      clientX:box.left+(fx-.5)*2*box.width,
                      clientY:box.top+fy*box.height
                    }));
                }""",selector)

            selection_before=demo.locator(".torrent-card.selected").count()
            click_far(".tide-settings-dialog [data-action='dismiss']")
            expect(demo.locator(".tide-settings-dialog")).to_have_count(0)
            expect(other.locator(".tide-settings-dialog")).to_have_count(0)
            assert demo.locator(".torrent-card.selected").count()==selection_before

            # Both Sort and Settings must dismiss on backdrop taps originating
            # from the far visual half, with no click-through to torrent cards.
            demo.locator('[data-action="sort"]').first.evaluate("el => el.click()")
            expect(demo.locator(".sort-alert")).to_be_visible()
            expect(other.locator(".sort-alert")).to_be_visible()
            selection_before=demo.locator(".torrent-card.selected").count()
            page.evaluate("""() => {
                const far=document.getElementById('tideFoldPreview');
                const doc=far.contentDocument;
                const layer=document.getElementById('foldInteraction');
                const b=layer.getBoundingClientRect();
                const dialog=doc.querySelector('.sort-alert').getBoundingClientRect();
                const candidates=[[.95,.03],[.51,.03],[.95,.97],[.51,.97]];
                const point=candidates.find(([u,v])=>{
                  const x=(.5+.5*u)*far.contentWindow.innerWidth;
                  const y=v*far.contentWindow.innerHeight;
                  return !doc.elementFromPoint(x,y)?.closest('.dialog');
                });
                if(!point)throw Error('No visible backdrop point on far screen');
                const [u,v]=point;
                layer.dispatchEvent(new MouseEvent('click',{
                  bubbles:true,
                  clientX:b.left+u*b.width,clientY:b.top+v*b.height
                }));
            }""")
            expect(demo.locator(".sort-alert")).to_have_count(0)
            expect(other.locator(".sort-alert")).to_have_count(0)
            assert demo.locator(".torrent-card.selected").count()==selection_before

            page.locator("#rotateBtn").click()
            capture("partially-folded-portrait")
            # The upper half retains the real top bezel, including corners.
            assert page.locator("#foldNearPlane").evaluate(
              "el => getComputedStyle(el,'::after').borderTopWidth"
            ) == "8px"
            assert page.locator("#foldNearPlane").evaluate(
              "el => getComputedStyle(el,'::after').top"
            ) == "-8px"
            assert page.locator("#foldFlap").evaluate(
              "el => getComputedStyle(el,'::after').bottom"
            ) == "-8px"
            expect(demo.locator("body")).to_have_class(
                re.compile("tide-posture-folded-portrait"), timeout=10000
            )
            assert_shared_scroll()
            expect(demo.locator(".torrent-card").first).to_be_visible()
            # Far-half click testing deliberately left one torrent selected.
            # Clear that retained selection before verifying single-torrent
            # Details; otherwise the rail may be in bulk-selection mode.
            for _ in range(5):
                chosen=demo.locator(".torrent-card.selected")
                if chosen.count()==0:
                    break
                chosen.first.evaluate("el => el.click()")
            expect(demo.locator(".torrent-card.selected")).to_have_count(0)
            demo.locator(".torrent-card").first.evaluate("el => el.click()")
            expect(demo.locator(".torrent-card.selected")).to_have_count(1)
            demo.locator('[data-action="detail"]').first.evaluate("el => el.click()")
            expect(demo.locator("#detailPanel.mobile-open")).to_be_visible()
            expect(demo.locator(".torrent-card").first).to_be_visible()
            assert demo.locator(".list-panel").evaluate(
                "el => getComputedStyle(el).visibility"
            ) == "visible"

            # Regression #11: with Details OPEN, tapping another card must
            # navigate to its Details instead of bulk-selecting and closing.
            def navigate_details_to_other_torrent():
                cards=demo.locator(".torrent-card")
                assert cards.count()>2
                selected=demo.locator(".torrent-card.selected").first.get_attribute("data-hash")
                target=next(
                    cards.nth(i) for i in range(cards.count())
                    if cards.nth(i).get_attribute("data-hash")!=selected
                )
                new_hash=target.get_attribute("data-hash")
                new_name=target.locator(".torrent-title").inner_text()
                target.evaluate("el => el.click()")
                expect(demo.locator("#detailPanel.mobile-open")).to_be_visible()
                expect(demo.locator(".torrent-card.selected")).to_have_count(1)
                expect(demo.locator('.torrent-card[data-hash="'+new_hash+'"].selected')).to_have_count(1)
                expect(demo.locator(".detail-name")).to_have_text(new_name)
                # The far mirror is physically displayed only while
                # partially folded; when flat it must stay synchronized
                # but correctly remains hidden in the showcase.
                if page.locator("#deviceFrame").get_attribute("data-pose").startswith("partially-folded-"):
                    expect(other.locator("#detailPanel.mobile-open")).to_be_visible()
                else:
                    expect(other.locator("#detailPanel.mobile-open")).to_have_count(1)
                expect(other.locator(".torrent-card.selected")).to_have_count(1)
                expect(other.locator(".detail-name")).to_have_text(new_name)
                return new_hash

            navigate_details_to_other_torrent()
            # The hinged laptop keeps its current 50/50 division.
            page.wait_for_function("""() => {
              const win=document.getElementById('tidePreview').contentWindow;
              const panel=win.document.querySelector('#detailPanel');
              return Math.abs(panel.getBoundingClientRect().top/
                win.innerHeight-.5)<.035;
            }""")
            page.screenshot(path=str(snapshots/"partially-folded-portrait-details-50pct.png"),
                            full_page=True, animations="disabled")

            # Preserve the selected torrent while fully unfolding into
            # portrait; Details becomes 65% tall and the top list stays
            # visible, independently scrollable and interactive.
            # Previous visual checks deliberately disable animation. Enable
            # motion here so we verify interpolation (and not just end layout).
            page.emulate_media(reduced_motion="no-preference")
            # Track the real intermediate panel geometry frame by frame.
            # A static fade/slide alone would leave the divider snapping.
            # Record transitionrun/transitionend for the detail top/height
            # and list-layout height, with samples taken on animation frames.
            demo.locator("#detailPanel").evaluate("""panel => {
              const win=panel.ownerDocument.defaultView;
              const layout=win.document.querySelector('.layout');
              win.__portraitPaneAnimation={events:[],ratios:[],listSizes:[]};
              const data=win.__portraitPaneAnimation;
              let sampling=false;
              const sample=()=>{
                const box=panel.getBoundingClientRect();
                data.ratios.push(box.top/win.innerHeight);
                data.listSizes.push(layout.getBoundingClientRect().height);
                if(sampling)win.requestAnimationFrame(sample);
              };
              for(const [el,name] of [[panel,'detail'],[layout,'list']]){
                el.addEventListener('transitionrun',event=>{
                  if(!['top','height'].includes(event.propertyName))return;
                  data.events.push(name+':run:'+event.propertyName);
                  if(!sampling){sampling=true;sample();}
                });
                el.addEventListener('transitionend',event=>{
                  if(!['top','height'].includes(event.propertyName))return;
                  data.events.push(name+':end:'+event.propertyName);
                  if(name==='detail' && event.propertyName==='top')
                    sampling=false;
                });
              }
            }""")
            page.locator("#unfoldedBtn").click()
            expect(page.locator("#deviceFrame")).to_have_attribute(
                "data-pose", "unfolded-portrait")
            expect(demo.locator("body")).to_have_class(
                re.compile("tide-posture-unfolded-portrait"), timeout=10000
            )
            page.wait_for_function("""() => {
              const win=document.getElementById('tidePreview').contentWindow;
              const d=win.__portraitPaneAnimation;
              return d?.events.includes('detail:end:top') &&
                d.events.includes('list:end:height');
            }""", timeout=10000)
            animation_data=demo.locator("#detailPanel").evaluate(
                "panel => panel.ownerDocument.defaultView.__portraitPaneAnimation"
            )
            assert 'detail:run:top' in animation_data['events'], animation_data
            assert 'detail:run:height' in animation_data['events'], animation_data
            assert 'list:run:height' in animation_data['events'], animation_data
            assert any(.36 < r < .49 for r in animation_data['ratios']), (
                'Details divider jumped instead of animating', animation_data
            )
            assert len(set(round(n,1) for n in animation_data['listSizes']))>2, (
                'Torrent list height did not animate',animation_data
            )
            capture("unfolded-portrait")
            expect(demo.locator("#detailPanel.mobile-open")).to_be_visible()
            expect(demo.locator(".torrent-card").first).to_be_visible()
            measurements=demo.locator("#detailPanel").evaluate("""panel => {
              const win=panel.ownerDocument.defaultView;
              const r=panel.getBoundingClientRect();
              const list=win.document.querySelector('.list-panel');
              const layout=win.document.querySelector('.layout');
              const listRect=list.getBoundingClientRect();
              const layoutRect=layout.getBoundingClientRect();
              return {
                viewport:win.innerHeight,
                top:r.top,height:r.height,bottom:r.bottom,
                listVisible:getComputedStyle(list).visibility,
                listPointer:getComputedStyle(list).pointerEvents,
                listScroll:getComputedStyle(list).overflowY,
                panelScroll:getComputedStyle(panel).overflowY,
                layoutBottom:layoutRect.bottom,
                listTop:listRect.top,listBottom:listRect.bottom
              };
            }""")
            assert abs(measurements["top"]/measurements["viewport"]-.35)<.015, measurements
            assert abs(measurements["height"]/measurements["viewport"]-.65)<.015, measurements
            assert abs(measurements["bottom"]-measurements["viewport"])<2, measurements
            assert measurements["layoutBottom"]<=measurements["top"]+3, measurements
            assert measurements["listVisible"]=="visible", measurements
            assert measurements["listPointer"]=="auto", measurements
            assert measurements["listScroll"]=="auto", measurements
            assert measurements["panelScroll"]=="auto", measurements
            # Exactly the same Details-open behaviour in fully unfolded 35/65.
            navigate_details_to_other_torrent()
            # Archive a screenshot with Details actually OPEN for manual
            # review. The ordinary named pose snapshot gets overwritten
            # later by the test's closed-details navigation sequence.
            page.screenshot(path=str(snapshots/"unfolded-portrait-details-65pct.png"),
                            full_page=True, animations="disabled")
            scroll_result=demo.locator(".list-panel").evaluate("""list => {
              const detail=list.ownerDocument.querySelector('#detailPanel');
              const detailBefore=detail.scrollTop;
              list.scrollTop=120;
              return {list:list.scrollTop,detail:detail.scrollTop,
                      detailBefore:detailBefore};
            }""")
            assert scroll_result["list"]>0, scroll_result
            assert scroll_result["detail"]==scroll_result["detailBefore"], scroll_result
            # Also verify the reverse 35/65 -> 50/50 tween. The same
            # Details panel and list should stay mounted and retain scroll.
            demo.locator("#detailPanel").evaluate("""panel => {
              const win=panel.ownerDocument.defaultView;
              win.__reversePortraitAnimation={events:[],positions:[]};
              const data=win.__reversePortraitAnimation;
              let active=false;
              const sample=()=>{
                data.positions.push(panel.getBoundingClientRect().top/win.innerHeight);
                if(active)win.requestAnimationFrame(sample);
              };
              panel.addEventListener('transitionrun',event=>{
                if(event.propertyName!=='top')return;
                data.events.push('run:top');
                active=true;sample();
              });
              panel.addEventListener('transitionend',event=>{
                if(event.propertyName!=='top')return;
                data.events.push('end:top');
                active=false;
              });
            }""")
            page.locator("#partialBtn").click()
            expect(page.locator("#deviceFrame")).to_have_attribute(
                "data-pose","partially-folded-portrait")
            expect(demo.locator("body")).to_have_class(
                re.compile("tide-posture-folded-portrait"), timeout=10000
            )
            page.wait_for_function("""() => {
              const win=document.getElementById('tidePreview').contentWindow;
              return win.__reversePortraitAnimation?.events.includes('end:top');
            }""", timeout=10000)
            reverse_data=demo.locator("#detailPanel").evaluate(
                "panel => panel.ownerDocument.defaultView.__reversePortraitAnimation"
            )
            assert 'run:top' in reverse_data['events'], reverse_data
            assert any(.37<value<.50 for value in reverse_data['positions']), (
                'Reverse Details divider snapped instead of animating',
                reverse_data
            )
            expect(page.locator("#deviceFrame[aria-busy]")).to_have_count(0)
            page.locator("#unfoldedBtn").click()
            expect(page.locator("#deviceFrame")).to_have_attribute(
                "data-pose","unfolded-portrait")
            page.wait_for_function("""() => {
              const win=document.getElementById('tidePreview').contentWindow;
              const panel=win.document.querySelector('#detailPanel');
              return win.document.body.classList.contains('tide-posture-unfolded-portrait') &&
                Math.abs(panel.getBoundingClientRect().top/win.innerHeight-.35)<.015;
            }""", timeout=10000)
            expect(page.locator("#deviceFrame[aria-busy]")).to_have_count(0)
            retained_scroll=demo.locator(".list-panel").evaluate(
                "el => el.scrollTop"
            )
            assert abs(retained_scroll-scroll_result["list"])<4, (
                "Torrent list lost its scroll position through posture changes",
                retained_scroll,scroll_result
            )
            # All remaining pose/safe-area pixel checks use the test suite's
            # original reduced-motion setting. Re-enable it after validating
            # actual intermediate frames and transition completion above.
            page.emulate_media(reduced_motion="reduce")
            demo.locator('[data-action="close-detail"]').first.evaluate("el => el.click()")
            expect(demo.locator("#detailPanel.mobile-open")).to_have_count(0)
            # Details CLOSED must retain the existing additive selection model.
            existing_hash=demo.locator(".torrent-card.selected").first.get_attribute("data-hash")
            other_card=next(
                demo.locator(".torrent-card").nth(i)
                for i in range(demo.locator(".torrent-card").count())
                if demo.locator(".torrent-card").nth(i).get_attribute("data-hash")!=existing_hash
            )
            other_hash=other_card.get_attribute("data-hash")
            other_card.evaluate("el => el.click()")
            expect(demo.locator("#detailPanel.mobile-open")).to_have_count(0)
            expect(demo.locator(".torrent-card.selected")).to_have_count(2)
            expect(demo.locator('.torrent-card[data-hash="'+existing_hash+'"].selected')).to_have_count(1)
            expect(demo.locator('.torrent-card[data-hash="'+other_hash+'"].selected')).to_have_count(1)
            other_card=demo.locator('.torrent-card[data-hash="'+other_hash+'"]')
            other_card.evaluate("el => el.click()")
            expect(demo.locator(".torrent-card.selected")).to_have_count(1)
            page.locator("#foldedBtn").click()
            capture("folded-landscape")
            page.locator("#unfoldedBtn").click()
            capture("unfolded-portrait")
            page.locator("#rotateBtn").click()
            capture("unfolded-landscape")
            expect(page.locator("#splitBtn")).to_be_visible()
            page.locator("#splitBtn").click()
            # Retain the last chosen split side across partial/full poses.
            capture("split-right")
            expect(page.locator("#shiftBtn")).to_be_visible()
            page.locator("#shiftBtn").click()
            capture("split-left")
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

            # Freeze the short first-pane blur at its peak and save a
            # screenshot. This verifies the reference-like *temporary*
            # appearance rather than merely checking animation keyframes.
            page.evaluate("""() => {
                window.__originalPreviewAnimate=Element.prototype.animate;
                Element.prototype.animate=function(frames,opts){
                    const motion=window.__originalPreviewAnimate.apply(
                        this,arguments);
                    if(this.id==='foldTransitionBlur'){
                        motion.pause();
                        motion.currentTime=opts.duration*.37;
                        window.__frozenPreviewBlur=motion;
                    }
                    return motion;
                };
            }""")
            page.locator("#partialBtn").click()
            expect(frame).to_have_attribute("data-pose",
                                            "partially-folded-landscape")
            page.wait_for_function("!!window.__frozenPreviewBlur")
            expect(frame).to_have_attribute("aria-busy","true")
            mid_opacity=page.locator("#foldTransitionBlur").evaluate(
                "el => Number(getComputedStyle(el).opacity)")
            assert mid_opacity>.8, mid_opacity
            page.screenshot(path=str(snapshots/"fold-transition-iOS-blur.png"),
                            full_page=True)
            page.evaluate("""() => {
                Element.prototype.animate=window.__originalPreviewAnimate;
                window.__frozenPreviewBlur.play();
            }""")
            expect(page.locator("#deviceFrame[aria-busy]")).to_have_count(0)
            assert page.locator("#foldTransitionBlur").evaluate(
                "el => getComputedStyle(el).opacity")=="0"
            animated_pose("foldedBtn", "folded-portrait")

            folded_portrait=frame.bounding_box()
            unfolded_landscape=animated_pose("unfoldedBtn", "unfolded-landscape")
            folded_again=animated_pose("foldedBtn", "folded-portrait")
            assert abs(folded_again["width"]-folded_portrait["width"]) < 1
            # The measured outer/inner display lengths differ by 9 CSS px;
            # don't disguise that difference as uneven frame bezels.
            assert abs(folded_portrait["height"]-unfolded_landscape["height"]) <= 10
            assert abs(2*folded_portrait["width"]/unfolded_landscape["width"]-1) < .02
            folded_landscape=animated_pose("rotateBtn", "folded-landscape")
            unfolded_portrait=animated_pose("unfoldedBtn", "unfolded-portrait")
            assert abs(folded_landscape["width"]-folded_portrait["height"]) < 1
            assert abs(unfolded_portrait["width"]-unfolded_landscape["height"]) < 1
            animated_pose("rotateBtn", "unfolded-landscape")
            animated_pose("splitBtn", "split-left")
            animated_pose("shiftBtn", "split-right")
            animated_pose("splitBtn", "unfolded-landscape")

            # A masked, non-interactive near-pane blur starts fully hidden.
            overlay=page.locator("#foldTransitionBlur")
            assert overlay.evaluate(
                "el => getComputedStyle(el).opacity"
            ) == "0"
            assert overlay.evaluate(
                "el => getComputedStyle(el).pointerEvents"
            ) == "none"
            blur_layer=page.locator("#foldTransitionBlur .fold-transition-blur-layer")
            shade_layer=page.locator("#foldTransitionBlur .fold-transition-shade")
            filter_style=blur_layer.evaluate(
                "el => getComputedStyle(el).backdropFilter"
            )
            assert "blur(17px)" in filter_style, filter_style
            assert "brightness(" not in filter_style, filter_style
            # Separate independent falloffs: full blur away from the crease
            # with a rapid drop to clear at the hinge, plus gradual darkness.
            book_mask=blur_layer.evaluate(
                "el => getComputedStyle(el).maskImage"
            )
            book_tint=shade_layer.evaluate(
                "el => getComputedStyle(el).backgroundImage"
            )
            assert "90deg" in book_mask and "90deg" in book_tint, (
                book_mask,book_tint
            )
            assert "0%," in book_mask and "60%" in book_mask, book_mask
            assert "rgba(0, 0, 0, 0) 100%" in book_mask, book_mask
            assert "rgba(6, 10, 16, 0.12) 0%" in book_tint, book_tint
            assert "rgba(0, 0, 0, 0) 100%" in book_tint, book_tint
            assert "52%" in book_tint and "76%" in book_tint, book_tint
            # The blur and shade are siblings with distinct spatial curves,
            # driven by the same animation-only parent opacity.
            assert blur_layer.evaluate("el => getComputedStyle(el).opacity") == "1"
            assert shade_layer.evaluate("el => getComputedStyle(el).opacity") == "1"

            # Record the browser's real keyframes as the hinge opens and
            # closes. Fold-only lighting must fade, while the shared shadow
            # remains on the stable holder throughout both transitions.
            page.evaluate("""() => {
              window.__hingeAnimations=[];
              const animate=Element.prototype.animate;
              Element.prototype.animate=function(frames,options){
                const name=this.id ||
                  (this.classList.contains('fold-flap-light')
                    ? 'foldFlapLight' : '');
                if(['foldNearSheen','hingeSheen','foldFlapLight',
                    'foldTransitionBlur'].includes(name))
                  window.__hingeAnimations.push({
                    name,opacity:frames.map(frame=>frame.opacity),
                    offsets:frames.map(frame=>frame.offset)
                  });
                return animate.apply(this,arguments);
              };
            }""")
            outer_shadow=page.locator("#frameHolder").evaluate(
              "el => getComputedStyle(el,'::before').boxShadow"
            )
            animated_pose("partialBtn", "partially-folded-landscape")
            animated_pose("unfoldedBtn", "unfolded-landscape")
            assert page.locator("#frameHolder").evaluate(
              "el => getComputedStyle(el,'::before').boxShadow"
            )==outer_shadow
            assert overlay.evaluate(
                "el => getComputedStyle(el).opacity"
            ) == "0", "The near pane remained blurred after unfolding"
            hinge_fades=page.evaluate("window.__hingeAnimations")
            blurs=[item for item in hinge_fades
                   if item["name"]=="foldTransitionBlur"]
            assert len(blurs)>=2, blurs
            for blur in blurs[:2]:
                assert blur["opacity"] == [0,1,1,0], blur
                assert blur["offsets"] == [0,.22,.53,1], blur
            for name in ("foldNearSheen","hingeSheen","foldFlapLight"):
                transitions=[item["opacity"] for item in hinge_fades
                             if item["name"]==name]
                assert len(transitions)>=2, (name,hinge_fades)
                assert transitions[0][0]==0 and transitions[0][-1]>0, (
                    name, transitions
                )
                assert transitions[1][0]>0 and transitions[1][-1]==0, (
                    name, transitions
                )
            animated_pose("partialBtn", "partially-folded-landscape")
            assert overlay.evaluate(
                "el => getComputedStyle(el).opacity"
            ) == "0", "Blur remained visible in settled partial-fold state"
            animated_pose("rotateBtn", "partially-folded-portrait")
            portrait_mask=blur_layer.evaluate(
                "el => getComputedStyle(el).maskImage"
            )
            portrait_tint=shade_layer.evaluate(
                "el => getComputedStyle(el).backgroundImage"
            )
            # 180deg is the default gradient direction ('to bottom');
            # Chromium omits it when serializing computed CSS.
            assert portrait_mask.startswith("linear-gradient(")
            assert portrait_tint.startswith("linear-gradient(")
            assert "90deg" not in portrait_mask and "90deg" not in portrait_tint, (
                portrait_mask,portrait_tint
            )
            assert "rgba(0, 0, 0, 0) 100%" in portrait_mask, portrait_mask
            assert "rgba(0, 0, 0, 0) 100%" in portrait_tint, portrait_tint
            animated_pose("unfoldedBtn", "unfolded-portrait")
            assert overlay.evaluate(
                "el => getComputedStyle(el).opacity"
            ) == "0", "Portrait remained blurred after opening"
            expect(demo.locator(".torrent-card").filter(has_text="Tide Demo Collection")).to_have_count(1)

            # Posture motion regression: the native landscape grid switches
            # discretely between 3/2 tracks, so Tide must FLIP both card
            # position and size while the 3D hinge moves. Check the actual
            # Web Animations calls rather than just the final CSS grid.
            animated_pose("rotateBtn", "unfolded-landscape")
            expect(demo.locator("#detailPanel.mobile-open")).to_have_count(0)
            demo.locator("#torrentList").evaluate("""list => {
              const win=list.ownerDocument.defaultView;
              win.__landscapeMotionCalls=[];
              const original=win.Element.prototype.animate;
              win.Element.prototype.animate=function(keyframes,options){
                if(this.matches?.('.torrent-card')){
                  const frame=win.frameElement?.ownerDocument.getElementById('deviceFrame');
                  win.__landscapeMotionCalls.push({
                    hash:this.dataset.hash,
                    first:keyframes[0].transform,
                    last:keyframes[keyframes.length-1].transform,
                    duration:options.duration,
                    busy:frame?.hasAttribute('aria-busy'),
                    devicePose:frame?.dataset.pose
                  });
                }
                return original.apply(this,arguments);
              };
            }""")
            def grid_columns():
                return demo.locator("#torrentList").evaluate(
                    "el => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length"
                )
            def card_motion_calls():
                return demo.locator("#torrentList").evaluate(
                    "el => el.ownerDocument.defaultView.__landscapeMotionCalls"
                )
            assert grid_columns()==3, "Unfolded landscape should have three torrent columns"
            page.locator("#partialBtn").click()
            page.wait_for_function("""() => {
              const win=document.getElementById('tidePreview').contentWindow;
              return win.__landscapeMotionCalls?.length>=3;
            }""", timeout=10000)
            folded_motion=card_motion_calls()
            assert any('scale(' in call['first'] and
                       'scale(1, 1)' in call['last'] for call in folded_motion), folded_motion
            assert all(call['duration']>=280 and call['busy'] for call in folded_motion), folded_motion
            expect(page.locator("#deviceFrame[aria-busy]")).to_have_count(0)
            assert grid_columns()==2, "Partially folded landscape should have two torrent columns"
            # Folding and unfolding should animate card widths as well as
            # their position, with no leftover transforms at rest.
            assert demo.locator(".torrent-card").first.evaluate(
                "el => getComputedStyle(el).transform"
            )=="none"
            prior_count=len(folded_motion)
            page.locator("#unfoldedBtn").click()
            page.wait_for_function("""count => {
              const win=document.getElementById('tidePreview').contentWindow;
              return win.__landscapeMotionCalls?.length>count;
            }""", arg=prior_count, timeout=10000)
            opened_motion=card_motion_calls()[prior_count:]
            assert all(call['busy'] for call in opened_motion), opened_motion
            # The app reflows while the real hinge is still animating.
            assert any(call['devicePose']=='partially-folded-landscape'
                       for call in opened_motion), opened_motion
            assert any('scale(' in call['first'] for call in opened_motion), opened_motion
            expect(page.locator("#deviceFrame[aria-busy]")).to_have_count(0)
            assert grid_columns()==3, "Unfolding should restore the three-column grid"

            # Also exercise 2 -> 1 while Details is open. The Details/list
            # proportions are numeric grid tracks, so they should interpolate
            # with multiple intermediate widths in BOTH directions.
            for _ in range(5):
                selected=demo.locator(".torrent-card.selected")
                if selected.count()==0:break
                selected.first.evaluate("el => el.click()")
            demo.locator(".torrent-card").first.evaluate("el => el.click()")
            demo.locator('[data-action="detail"]').first.evaluate("el => el.click()")
            expect(demo.locator("#detailPanel.mobile-open")).to_be_visible()
            assert grid_columns()==2
            demo.locator(".layout").evaluate("""layout => {
              const win=layout.ownerDocument.defaultView;
              win.__landscapeLayoutTween={events:[],widths:[]};
              const data=win.__landscapeLayoutTween;
              let active=false;
              const sample=()=>{
                data.widths.push(layout.querySelector('.list-panel').getBoundingClientRect().width);
                if(active)win.requestAnimationFrame(sample);
              };
              layout.addEventListener('transitionrun',event=>{
                if(event.propertyName!=='grid-template-columns')return;
                data.events.push('run'); active=true; sample();
              });
              layout.addEventListener('transitionend',event=>{
                if(event.propertyName!=='grid-template-columns')return;
                data.events.push('end'); active=false;
              });
            }""")
            page.locator("#partialBtn").click()
            page.wait_for_function("""() => {
              const win=document.getElementById('tidePreview').contentWindow;
              return win.__landscapeLayoutTween?.events.includes('end');
            }""", timeout=10000)
            geometry=demo.locator(".layout").evaluate(
                "el => el.ownerDocument.defaultView.__landscapeLayoutTween"
            )
            assert 'run' in geometry['events'], geometry
            assert len(set(round(w,1) for w in geometry['widths']))>3, geometry
            expect(demo.locator("#detailPanel.mobile-open")).to_be_visible()
            assert grid_columns()==1
            expect(page.locator("#deviceFrame[aria-busy]")).to_have_count(0)
            before_reverse=len(card_motion_calls())
            page.locator("#unfoldedBtn").click()
            page.wait_for_function("""count => {
              const win=document.getElementById('tidePreview').contentWindow;
              return win.__landscapeMotionCalls?.length>count;
            }""",arg=before_reverse,timeout=10000)
            expect(page.locator("#deviceFrame[aria-busy]")).to_have_count(0)
            expect(demo.locator("#detailPanel.mobile-open")).to_be_visible()
            assert grid_columns()==2
            demo.locator('[data-action="close-detail"]').first.evaluate("el => el.click()")

            # Respect reduced motion: the same grid transitions should run
            # instantly without scheduling any card FLIP animations.
            page.emulate_media(reduced_motion="reduce")
            before_reduced=len(card_motion_calls())
            page.locator("#partialBtn").click()
            assert grid_columns()==2
            assert len(card_motion_calls())==before_reduced
            page.locator("#unfoldedBtn").click()
            assert grid_columns()==3
            assert len(card_motion_calls())==before_reduced

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

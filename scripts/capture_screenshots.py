#!/usr/bin/env python3
"""Capture Tide UI screenshots with simulated, openly distributable demo entries."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
PAGE=ROOT/"private"/"index.html"
DEST=ROOT/"screenshots"
DEST.mkdir(exist_ok=True)
CONFIGS=(("duo-folded",466,945,True,False),
         ("duo-unfolded-landscape",1194,790,True,True),
         ("desktop",1610,920,False,True))

def capture():
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True)
        for name,width,height,mobile,details in CONFIGS:
            context=browser.new_context(
                viewport={"width":width,"height":height},
                screen={"width":width,"height":height},
                is_mobile=mobile,has_touch=mobile,device_scale_factor=1,
                reduced_motion="reduce"
            )
            page=context.new_page()
            page.goto(PAGE.resolve().as_uri(),wait_until="load")
            page.locator(".torrent-card").first.wait_for(timeout=15000)
            assert page.locator(".torrent-card").count()==8, "Expected 8 legal demo torrents"
            for title in page.locator(".torrent-title").all_inner_texts():
                assert not any(word in title.lower() for word in (
                    "the.odyssey","angel.dust","cinephiles","ettv","yify"
                )), "Unexpected demo torrent: "+title
            if details:
                page.locator(".torrent-card").first.click()
                selector=('#actionRail [data-action="detail"]' if mobile
                          else '#desktopSelectionBar [data-action="detail"]')
                page.locator(selector).click()
                page.locator(".detail-name").wait_for(timeout=15000)
            png=DEST/(name+".png")
            page.screenshot(path=str(png),full_page=False,animations="disabled")
            image=Image.open(png).convert("RGB")
            max_width=466 if name=="duo-folded" else (960 if mobile else 1207)
            if image.width>max_width:
                image=image.resize((max_width,round(image.height*max_width/image.width)),Image.Resampling.LANCZOS)
            image.save(DEST/(name+".webp"),"WEBP",quality=34,method=6)
            png.unlink()
            print("Captured",name)
            context.close()
        browser.close()

if __name__=="__main__":
    capture()

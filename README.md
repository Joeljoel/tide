# Tide

A mobile-first alternative qBittorrent WebUI, adapting to the iPhone Duo and desktop.

## Install

Download this repo and use the folder containing `private/` and `public/` as the **Alternative Web UI** directory in qBittorrent’s Web UI settings.

## Status

Early development (v0.18). Tap the Tide logo for version information and qBittorrent session/lifetime transfer stats. Tide checks `version.json` on the public `main` branch for updates; it never requests torrent data from GitHub.

## WebKit viewport experiment

v0.18 removes `viewport-fit=cover` to test a documented iOS 26 standalone-PWA issue where the physical bottom strip equals the status-bar height. It also removes the prior speculative 82px expansion. This may reposition the header relative to the system clock and should be checked on a physical Duo. `?viewport=1` still shows Tide's viewport diagnostic values.

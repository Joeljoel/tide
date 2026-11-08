# Tide

A mobile-first alternative qBittorrent WebUI, adapting to the iPhone Duo and desktop.

## Install

Download the project and use the folder containing `private/` and `public/` as the **Alternative Web UI** directory in qBittorrent’s Web UI settings.

## Status

Early development (v0.19). Tap the Tide logo for version information and qBittorrent session/lifetime transfer statistics. Tide compares against `version.json` on the public `main` branch for updates.

## Device layout

v0.19 restores the v0.17 `viewport-fit=cover` and original safe-area geometry. This puts the header and the right-hand Duo controls back in their earlier positions, at the cost of possibly restoring the unfolded-portrait bottom gap. `?viewport=1` displays diagnostic measurements.

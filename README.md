# Tide

Mobile-first qBittorrent alternative WebUI with adaptive iPhone Duo and desktop controls.

## Install

Download the source and configure its folder as qBittorrent's **Alternative Web UI** directory under Web UI settings. Keep your existing WebUI available as a fallback.

## Status

Early development — v0.17. Full documentation and screenshots to follow. The WebUI uses qBittorrent's same-origin Web API. Add `/private/?demo=1` to preview sample data when testing outside an authenticated server.

## Known issue

Some standalone iOS PWAs report a shorter web viewport in unfolded portrait. Tide includes a height fallback and a `?viewport=1` diagnostic, but may be unable to draw into space withheld by WebKit.

- Split Details: filters stay above both panes; clicking another torrent replaces the focused selection.
- Portrait bottom extension is experimental because WebKit may clip the viewport outside CSS control.

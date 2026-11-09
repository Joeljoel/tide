<p align="center">
  <img src="private/icon-512.png" width="96" height="96" alt="Tide app icon">
</p>

<h1 align="center">tide.</h1>

<p align="center">
  A touch-first alternative WebUI for <a href="https://www.qbittorrent.org/">qBittorrent</a>, designed for the <strong>iPhone Duo</strong> and compatible with desktop browsers.
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.2.1--beta.1-293a46?style=flat-square">
</p>

<p align="center">
  <img src="screenshots/tide-iphone-duo.jpg" alt="Tide on a folded iPhone Duo" width="1100">
</p>

Tide is intended to be used as a Progressive Web App (PWA) on iPhone.

## v1.2.1-beta.1 — Unfolded rotation-height fix

This draft patch addresses the bottom gap after changing orientation on the Duo's **full inner display**, in both unfolded landscape and unfolded portrait.

Device diagnostics measured a 587px `100dvh` against 669px `100vh`/`100lvh` after rotation. Setting the document root, body and shell to `100vh` eliminated the gap on the actual Duo. This beta reproduces that measured approach in **standalone full-inner view only**, leaving outer-screen, inner Split View, desktop and keyboard input behaviour unchanged.

Test landscape → portrait → landscape repeatedly, then test unfolded portrait directly. Check torrent scrolling, action rail, settings, and keyboard input before approving the patch. This build is **not yet released**; stable remains v1.2.0.

## Split View control placement (v1.2.0)

Tide automatically adapts its floating controls to either side of the iPhone Duo's inner Split View. When Tide is
running in the **left half** of the unfolded inner display, the floating
action rail moves to the left edge and the torrent list/detail view reserves
a left gutter for those controls.
The header logo, transfer speeds and Settings button now follow the same
content inset, keeping the entire top row aligned above the torrent cards. Search and contextual action buttons use
the same left edge. The **right half**, folded and full-screen layouts keep
the existing right-side controls.

The experiment uses the measurements confirmed in the Duo Window Test:
a portrait-shaped, ~469 × 669 CSS px web window with a landscape device
orientation, and horizontal safe areas near **0 / 0** (left half) versus
**0 / 84** (right half). Tide rechecks the safe-area values every 400 ms
because iOS might not emit resize events when Split View windows move.
Unknown readings fall back to the existing right-edge layout.

Released in **Tide v1.2.0**. The unfolded rotation-height fix is being tested as v1.2.1-beta.1 in draft PR #3.

## Screenshots

### iPhone Duo

<p align="center">
  <img src="screenshots/duo-folded.jpg" width="32%" alt="Tide on the folded iPhone Duo">
  &nbsp;&nbsp;
  <img src="screenshots/duo-unfolded-landscape.jpg" width="64%" alt="Tide on the unfolded iPhone Duo in landscape">
</p>

### Desktop

![Tide desktop torrent manager with Details panel](screenshots/desktop.webp)

## Features

- **Adaptive layout:** Compact cards and edge controls when the Duo is folded, expanded list and details when unfolded, and multi-column layouts on desktop.
- **Torrent information:** Status, speed, progress, downloaded/remaining/total size, ETA, and availability.
- **Torrent controls:** Add magnet links or `.torrent` files; search, filter, sort, pause, resume, and remove torrents.
- **Bulk actions:** Select multiple torrents to pause, resume, or remove, with confirmation before deletion.
- **File browser:** Browse nested folders and files with individual sizes and progress.

## Installation

### qBittorrent

1. Download the [latest stable release](https://github.com/Joeljoel/tide/releases/latest) (Source code ZIP) and extract it on the computer running qBittorrent.
2. In qBittorrent, open **Tools → Options → Web UI** and enable **Use alternative Web UI**.
3. Set **Files location** to the extracted directory containing both `private/` and `public/`.
4. Apply the settings, open your qBittorrent WebUI address, and sign in with your existing credentials.

### iPhone PWA

1. Open your qBittorrent WebUI address in **Safari** and sign in.
2. Open **Share → Add to Home Screen**.
3. Enable **Open as Web App** if offered, then tap **Add**.
4. Launch Tide from the Home Screen.

For remote access, keep authentication enabled and use HTTPS or a VPN.

## Updating

Replace the Tide files in your configured alternative WebUI directory with the latest repository files, then reload the app. If the PWA shows a cached version, close and reopen it.

Use **Settings → About → Check updates** to check for newer stable versions on `main`. Updates are installed manually.

## Versioning

Tide follows [Semantic Versioning](https://semver.org/): major releases contain breaking changes, minor releases add features (for example `1.1.0`), and patch releases contain compatible fixes (`1.1.1`). Pre-release test builds use version suffixes such as `1.2.0`, `1.2.0`, and `1.2.0-rc.1` before the stable release.

## What's new in v1.2.0

- Automatic left/right inner Split View detection based on the device's orientation and browser safe-area insets.
- Edge controls on the **left** when Tide is in the left half, with matching left-side space for cards, detail content, search and the header.
- Edge controls remain on the **right** when Tide is in the right half; full-screen, folded and desktop layouts retain their existing behaviour.
- Live rechecking of the safe-area values when moving the same app window between halves.

## What's new in v1.1.0

- A Settings window with **Tide**, **qBittorrent**, and **About** tabs.
- Light, dark and system appearance options, plus qBittorrent preference controls with explicit Save changes.
- Version checking that understands SemVer, including pre-releases and stable versions.
- Unfolded Duo portrait Settings access in the bottom action row between Add and Refresh, with the original header Settings button in other layouts.
- Light-mode contrast improvements and clearance around iPhone Duo system indicators.

## Unfolded portrait Settings access

In unfolded portrait the Settings gear sits inside the bottom floating action row, directly **between Add and Refresh**. It uses the existing Settings action in the same touchable button rail as the other working controls. In selection/detail views Settings stays available within the contextual action row. The original header Settings gear is shown in folded, landscape and desktop views, and is hidden in unfolded portrait. No standalone floating Settings button or diagnostic overlay is used.

/* Tide iPhone Duo posture enhancement. Safari 27.1+ developer preview. */
(() => {
  'use strict';
  // Beta build marker for Settings > About; the stable 1.3.0 core remains intact.
  window.__TIDE_BUILD__ = '1.4.0-beta.1';

  const root = document.documentElement;
  const body = document.body;
  if (!root || !body || !window.matchMedia) return;

  const foldedQuery = window.matchMedia('(device-posture: folded)');
  const posture = navigator.devicePosture;
  let frame = 0;
  let initialized = false;

  // FLIP animation: only animate existing cards when posture actually changes.
  // Keeping the cards in the document preserves scroll positions and selection.
  function captureCards() {
    return Array.from(document.querySelectorAll('#torrentList .torrent-card')).slice(0, 50)
      .map(card => ({card, rect: card.getBoundingClientRect()}));
  }

  function animateCards(before) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const {card, rect} of before) {
      if (!card.isConnected || typeof card.animate !== 'function') continue;
      const next = card.getBoundingClientRect();
      const dx = rect.left - next.left, dy = rect.top - next.top;
      // Ignore measurements made during a major viewport rotation.
      if (!Number.isFinite(dx + dy) || Math.hypot(dx, dy) < 3 || Math.hypot(dx, dy) > 520) continue;
      card.animate([
        {transform: `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`, opacity: .86},
        {transform: 'translate3d(0, 0, 0)', opacity: 1}
      ], {duration: 260, easing: 'cubic-bezier(.22, 1, .36, 1)'});
    }
  }

  function segments() {
    try { return Array.from(window.viewport?.segments || []); }
    catch { return []; }
  }

  function isFolded() {
    // JavaScript is authoritative when available; the CSS query is a fallback.
    if (posture?.type === 'folded') return true;
    if (posture?.type === 'continuous') return false;
    return foldedQuery.matches;
  }

  function sync() {
    frame = 0;
    const touchDuo = /iPhone/i.test(navigator.userAgent) &&
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const folded = touchDuo && isFolded();
    const landscape = window.innerWidth > window.innerHeight;
    // Only the full inner screen should use a dual-pane layout. Keep outer
    // display and narrow Split View windows on their existing Tide layouts.
    const book = folded && landscape && window.innerWidth >= 850;
    const laptop = folded && !landscape && window.innerWidth >= 580;
    // Full inner screen only: keep the list visible above a 65%-height
    // Details sheet in portrait. Exclude the folded outer display and
    // narrow Split View windows; the laptop fold still has its 50/50 split.
    const openPortrait = touchDuo && !folded && !landscape &&
      window.innerWidth >= 600 && window.innerWidth <= 849;
    const postureChanged = body.classList.contains('tide-posture-folded-landscape') !== book ||
      body.classList.contains('tide-posture-folded-portrait') !== laptop ||
      body.classList.contains('tide-posture-unfolded-portrait') !== openPortrait;
    const before = initialized && postureChanged ? captureCards() : [];

    body.classList.toggle('tide-posture-folded-landscape', book);
    body.classList.toggle('tide-posture-folded-portrait', laptop);
    body.classList.toggle('tide-posture-unfolded-portrait', openPortrait);
    body.dataset.tidePosture = folded ? 'folded' : posture?.type === 'continuous' ? 'continuous' : 'unavailable';

    for (const name of ['--tide-fold-split-y', '--tide-fold-layout-top',
      '--tide-fold-left-column', '--tide-fold-right-column', '--tide-fold-column-gap']) {
      root.style.removeProperty(name);
    }

    const panes = segments().filter(s => Number.isFinite(s.left) && Number.isFinite(s.top) &&
      Number.isFinite(s.width) && Number.isFinite(s.height) && s.width > 0 && s.height > 0);

    if (book) {
      const list = document.getElementById('torrentList');
      const bounds = list?.getBoundingClientRect();
      if (bounds && bounds.width > 0) {
        const ordered = panes.slice().sort((a, b) => a.left - b.left);
        const twoHorizontal = ordered.length === 2 &&
          ordered[1].left >= ordered[0].right - 2 &&
          Math.abs(ordered[0].top - ordered[1].top) < 10;
        // Segment boundaries are preferable to an assumed screen midpoint.
        const hingeLeft = twoHorizontal ? ordered[0].right : window.innerWidth / 2;
        const hingeRight = twoHorizontal ? ordered[1].left : window.innerWidth / 2;
        const clearance = 22; // A touch-free margin on each side of the fold.
        const left = hingeLeft - clearance - bounds.left;
        const right = bounds.right - hingeRight - clearance;
        const gap = bounds.width - left - right;
        if (left >= 150 && right >= 150 && gap >= 36 && gap < bounds.width * 0.4) {
          root.style.setProperty('--tide-fold-left-column', left.toFixed(1) + 'px');
          root.style.setProperty('--tide-fold-right-column', right.toFixed(1) + 'px');
          root.style.setProperty('--tide-fold-column-gap', gap.toFixed(1) + 'px');
        }
      }
    }

    if (laptop) {
      const ordered = panes.slice().sort((a, b) => a.top - b.top);
      const twoVertical = ordered.length === 2 &&
        ordered[1].top >= ordered[0].bottom - 2 &&
        Math.abs(ordered[0].left - ordered[1].left) < 10;
      const splitY = twoVertical ? ordered[1].top : window.innerHeight / 2;
      if (splitY > 160 && splitY < window.innerHeight - 160) {
        root.style.setProperty('--tide-fold-split-y', splitY.toFixed(1) + 'px');
      }
      const layoutTop = document.querySelector('.layout')?.getBoundingClientRect().top;
      if (Number.isFinite(layoutTop)) {
        root.style.setProperty('--tide-fold-layout-top', Math.max(0, layoutTop).toFixed(1) + 'px');
      }
    }

    if (before.length) animateCards(before);
    initialized = true;
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(sync);
  }

  posture?.addEventListener?.('change', schedule);
  foldedQuery.addEventListener?.('change', schedule);
  window.addEventListener('resize', schedule, {passive: true});
  window.addEventListener('orientationchange', schedule, {passive: true});
  window.addEventListener('pageshow', schedule, {passive: true});
  window.visualViewport?.addEventListener?.('resize', schedule, {passive: true});
  window.addEventListener('focus', schedule, {passive: true});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  document.addEventListener('click', schedule, {passive: true});

  schedule();
})();

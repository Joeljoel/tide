/* Tide iPhone Duo posture enhancement. Safari 27.1+ developer preview. */
(() => {
  'use strict';
  // Beta build marker for Settings > About; the stable 1.3.0 core remains intact.
  window.__TIDE_BUILD__ = '1.4.1';

  const root = document.documentElement;
  const body = document.body;
  if (!root || !body || !window.matchMedia) return;

  const foldedQuery = window.matchMedia('(device-posture: folded)');
  const posture = navigator.devicePosture;
  let frame = 0;
  let initialized = false;

  // FLIP: both positions and dimensions must interpolate when the
  // landscape torrent grid changes from three columns to two (or back).
  // CSS cannot tween different track counts. Animate just visible cards;
  // the actual grid and scroll positions remain native and interactive.
  const activeCardMotions = new Map();
  function captureCards() {
    const pane = document.querySelector('.list-panel');
    const clip = pane?.getBoundingClientRect();
    const visibleTop = (clip?.top ?? 0) - 100;
    const visibleBottom = (clip?.bottom ?? window.innerHeight) + 100;
    return Array.from(document.querySelectorAll('#torrentList .torrent-card[data-hash]'))
      .slice(0, 80)
      .map(card => ({hash: card.dataset.hash, rect: card.getBoundingClientRect()}))
      .filter(({rect}) => rect.bottom > visibleTop && rect.top < visibleBottom);
  }

  function animateCards(before) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const current = new Map(Array.from(
      document.querySelectorAll('#torrentList .torrent-card[data-hash]'),
      card => [card.dataset.hash, card]
    ));
    for (const {hash, rect} of before) {
      const card = current.get(hash);
      if (!card || typeof card.animate !== 'function') continue;
      // Reversing a fold mid-flight should continue from the actual visible
      // position, not leave competing transforms on the same torrent card.
      activeCardMotions.get(hash)?.cancel();
      const next = card.getBoundingClientRect();
      if (!(next.width > 0 && next.height > 0)) continue;
      const dx = rect.left - next.left, dy = rect.top - next.top;
      const scaleX = rect.width / next.width, scaleY = rect.height / next.height;
      if (![dx, dy, scaleX, scaleY].every(Number.isFinite)) continue;
      // An orientation/viewport resize is not a fold tween: skip cards that
      // would have to fly across virtually the whole screen.
      if (Math.hypot(dx, dy) > Math.max(600, window.innerWidth * .9)) continue;
      if (Math.hypot(dx, dy) < 2 &&
          Math.abs(scaleX - 1) < .015 && Math.abs(scaleY - 1) < .015) continue;
      const motion = card.animate([
        {
          transformOrigin: '0 0',
          transform: `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`,
          opacity: .9
        },
        {transformOrigin: '0 0', transform: 'translate3d(0, 0, 0) scale(1, 1)', opacity: 1}
      ], {duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)'});
      activeCardMotions.set(hash, motion);
      const cleanup = () => {
        if (activeCardMotions.get(hash) === motion) activeCardMotions.delete(hash);
      };
      motion.addEventListener('finish', cleanup, {once: true});
      motion.addEventListener('cancel', cleanup, {once: true});
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

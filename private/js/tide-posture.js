/* Tide iPhone Duo posture enhancement. Safari 27.1+ developer preview. */
(() => {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  if (!root || !body || !window.matchMedia) return;

  const foldedQuery = window.matchMedia('(device-posture: folded)');
  const posture = navigator.devicePosture;
  let frame = 0;

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

    body.classList.toggle('tide-posture-folded-landscape', book);
    body.classList.toggle('tide-posture-folded-portrait', laptop);
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

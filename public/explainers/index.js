// ---------------------------------------------------------------------------
// How it works: the index's moving thumbnails.
//
// Each card on /how-it-works has a canvas naming the module that draws it
// (data-thumb). That module exports `thumb(ctx, w, h, t, colours)` and the
// list of tokens it wants as `colours`. The engine's Scene does the rest:
// sharp on every screen, asleep when the card is off screen or the tab is
// hidden, and still when the device or the site's setting asks for it.
// ---------------------------------------------------------------------------

import { Scene, readPalette, motionAllowed } from './engine.js';

// --- finding an explainer ---
//
// The search box matches every word typed against each card's data-search
// (its name, hook, description and section); a section chip narrows to
// that section, and pressing it again shows them all. Sections with nothing
// left are hidden, and the count says how many remain.

const input = document.getElementById('hiw-q');
const chips = [...document.querySelectorAll('.hiw-find .hiw-chip')];
const count = document.querySelector('.hiw-find-count');
let only = null;

function filter() {
  const words = (input?.value || '').toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const section of document.querySelectorAll('.hiw-group')) {
    let here = 0;
    for (const li of section.querySelectorAll('li[data-search]')) {
      const ok = (!only || section.dataset.group === only) && words.every((w) => li.dataset.search.includes(w));
      li.hidden = !ok;
      if (ok) here++;
    }
    section.hidden = here === 0;
    shown += here;
  }
  if (count) {
    const all = document.querySelectorAll('li[data-search]').length;
    count.textContent = shown === all ? '' : shown ? `${shown} of ${all} explainers` : 'No explainers match. Try another word.';
  }
}

input?.addEventListener('input', filter);
for (const chip of chips) {
  chip.addEventListener('click', () => {
    only = only === chip.dataset.group ? null : chip.dataset.group;
    for (const c of chips) c.setAttribute('aria-pressed', String(c.dataset.group === only));
    filter();
  });
}
// A search kept by the browser on going back is applied at once.
if (input?.value) filter();

for (const canvas of document.querySelectorAll('canvas[data-thumb]')) {
  import(canvas.dataset.thumb).then((mod) => {
    const holder = canvas.closest('.hiw-index') || document.documentElement;
    let colours = readPalette(holder, mod.colours || []);
    const scene = new Scene(canvas, (ctx, f) => {
      mod.thumb(ctx, f.w, f.h, f.t, colours);
      return motionAllowed();
    });
    const repaint = () => {
      colours = readPalette(holder, mod.colours || []);
      scene.invalidate();
    };
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaint);
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => scene.invalidate());
  });
}

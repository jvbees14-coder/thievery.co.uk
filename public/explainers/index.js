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

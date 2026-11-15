// Regression to the mean: the index card's picture. A cloud of people,
// first score across and second up, the top few lit and their second
// scores falling back towards the middle.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;
// A fixed cloud, so the picture does not change between visits.
const PTS = (() => {
  let s = 11;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const n = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(6.2832 * r());
  return Array.from({ length: 160 }, () => { const k = n(); return [k + n(), k + n()]; });
})();

export function thumb(ctx, w, h, t, col) {
  const X = (v) => w / 2 + (v / 4) * w * 0.42, Y = (v) => h / 2 - (v / 4) * h * 0.42;
  const lit = Math.floor(t / 2) % 2 === 1;
  for (const [a, b] of PTS) {
    const top = a > 1.8;
    ctx.beginPath();
    ctx.arc(X(a), Y(lit && top ? b : top ? a : b), Math.max(2, h * 0.018), 0, Math.PI * 2);
    ctx.fillStyle = top ? col.accent : alpha(col['hiw-ink-1'], 0.55);
    ctx.fill();
  }
}

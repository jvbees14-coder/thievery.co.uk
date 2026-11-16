// Why so much is bell-shaped: the index card's picture. Bars for the
// totals of more and more dice, settling into a bell.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const n = 1 + Math.floor((t * 0.8) % 8);
  let d = [1];
  for (let k = 0; k < n; k++) {
    const e = new Array(d.length + 6).fill(0);
    d.forEach((p, i) => { for (let j = 1; j <= 6; j++) e[i + j] += p / 6; });
    d = e;
  }
  const lo = n, hi = 6 * n, top = Math.max(...d) * 1.1;
  const bw = (w * 0.84) / (hi - lo + 1);
  for (let v = lo; v <= hi; v++) {
    const bh = (d[v] / top) * h * 0.8;
    ctx.fillStyle = alpha(col['hiw-ink-1'], 0.75);
    ctx.fillRect(w * 0.08 + (v - lo) * bw + bw * 0.1, h * 0.9 - bh, bw * 0.8, bh);
  }
}

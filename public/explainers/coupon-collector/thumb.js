// Collecting the full set: the index card's picture. An album of stickers
// filling quickly, then waiting on the last few gaps.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const cols = 8, rows = 5, n = cols * rows;
  const cell = Math.min((w * 0.86) / cols, (h * 0.86) / rows);
  const x0 = (w - cell * cols) / 2, y0 = (h - cell * rows) / 2;
  // The order stickers arrive in, fixed, and how far along we are.
  const order = Array.from({ length: n }, (_, i) => (i * 23 + 7) % n);
  const k = Math.floor(n * (1 - Math.exp(-((t % 9) * 0.45))));
  const have = new Set(order.slice(0, k));
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = have.has(i) ? col['hiw-ink-1'] : alpha(col['label-tertiary'], 0.18);
    ctx.beginPath();
    ctx.roundRect(x0 + (i % cols) * cell + 2, y0 + Math.floor(i / cols) * cell + 2, cell - 4, cell - 4, 3);
    ctx.fill();
  }
}

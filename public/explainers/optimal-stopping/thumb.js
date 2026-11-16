// When to stop looking: the index card's picture. Bars arriving one by
// one, the first few only looked at, then the first taller one taken.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

const ORDER = [4, 7, 2, 5, 3, 9, 10, 1, 6, 8];

export function thumb(ctx, w, h, t, col) {
  const n = ORDER.length, cw = (w * 0.84) / n, x0 = w * 0.08;
  const shown = Math.min(n, Math.floor(t * 2) % (n + 4));
  ctx.fillStyle = alpha(col['label-tertiary'], 0.12);
  ctx.fillRect(x0, h * 0.06, cw * 4, h * 0.88);
  for (let i = 0; i < shown; i++) {
    const v = ORDER[i], bh = (v / 10) * h * 0.8;
    ctx.fillStyle = i === 5 ? col.accent : i < 4 ? alpha(col['hiw-ink-1'], 0.5) : col['hiw-ink-1'];
    ctx.fillRect(x0 + i * cw + cw * 0.15, h * 0.92 - bh, cw * 0.7, bh);
  }
}

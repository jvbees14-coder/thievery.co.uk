// Benford's law: the index card's picture. Nine bars of first digits,
// falling from 1 to 9.

import { TOKENS } from '../shared/draw.js';
import { benford } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const slot = (w * 0.84) / 9, x0 = w * 0.08, base = h * 0.88;
  const grow = Math.min(1, (t % 6) / 1.5);
  for (let d = 1; d <= 9; d++) {
    const bh = (benford(d) / 0.32) * h * 0.72 * grow;
    ctx.fillStyle = d === 1 ? col.accent : col['hiw-ink-1'];
    ctx.fillRect(x0 + (d - 1) * slot + slot * 0.15, base - bh, slot * 0.7, bh);
  }
}

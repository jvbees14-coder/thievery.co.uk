// Why sunflowers spiral: the index card's picture. A seed head at the
// golden angle, growing outwards.

import { TOKENS } from '../shared/draw.js';
import { GOLDEN, seeds, drawHead } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const n = 40 + Math.floor(((t % 8) / 6) * 360);
  const R = Math.min(w, h) * 0.44 * Math.sqrt(Math.min(n, 400) / 400);
  drawHead(ctx, w / 2, h / 2, R, seeds(Math.min(n, 400), GOLDEN), col, (i) => (i % 21 % 2 ? col.accent : col.warning));
}

// Tides: the index card's picture. The Earth from above the North Pole,
// turning inside its two bulges of water, with the Moon going round.

import { TOKENS } from '../shared/draw.js';
import { angles, drawEarth, drawMoon } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const a = angles(t * 3);
  const R = Math.min(w, h) * 0.22;
  const cx = w * 0.42, cy = h / 2;
  drawEarth(ctx, cx, cy, R, col, a, { bulge: 1, sun: false });
  drawMoon(ctx, cx, cy, Math.min(w * 0.4, R * 2.6), a.moon, R * 0.25, col, a);
}

// Map projections: the index card's picture. The world gliding back and
// forth between Mercator and Equal Earth.

import { TOKENS } from '../shared/draw.js';
import { fitted, drawWorld, drawGrid } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const p = (Math.sin(t * 0.6) + 1) / 2;
  const e = p * p * (3 - 2 * p);
  const a = fitted('mercator', w, h, 8), b = fitted('equalEarth', w, h, 8);
  const to = (l, q) => {
    const p1 = a.to(l, q), p2 = b.to(l, q);
    return [p1[0] + (p2[0] - p1[0]) * e, p1[1] + (p2[1] - p1[1]) * e];
  };
  drawGrid(ctx, to, col, 82);
  drawWorld(ctx, to, col);
}

export function share(ctx, w, h, _t, col) {
  const to = fitted('equalEarth', w, h, 4).to;
  drawGrid(ctx, to, col);
  drawWorld(ctx, to, col);
}

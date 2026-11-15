// The lottery: the index card's picture. Fifty-nine balls, six drawn.

import { TOKENS } from '../shared/draw.js';
import { BALLS, draw6, drawBall } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  let s = Math.floor(t / 2) + 3;
  const drawn = new Set(draw6(() => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)));
  const cols = 10, cell = Math.min((w * 0.8) / cols, (h * 0.8) / 6), x0 = (w - cell * cols) / 2 + w * 0.04, y0 = (h - cell * 6) / 2;
  for (let n = 1; n <= BALLS; n++) {
    const i = n - 1;
    drawBall(ctx, x0 + (i % cols) * cell + cell / 2, y0 + Math.floor(i / cols) * cell + cell / 2, cell * 0.4, n, col, { drawn: drawn.has(n) });
  }
}

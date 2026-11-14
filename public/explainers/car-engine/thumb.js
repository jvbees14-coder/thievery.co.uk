// The car engine: the index card's picture. One cylinder going through
// its four strokes.

import { TOKENS } from '../shared/draw.js';
import { drawCylinder } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  drawCylinder(ctx, w / 2, h * 0.06, h * 0.9, (t * 200) % 720, col);
}

export function share(ctx, w, h, _t, col) {
  [0, 200, 370, 560].forEach((deg, i) => drawCylinder(ctx, w * (0.14 + i * 0.24), h * 0.12, h * 0.76, deg, col));
}

// How bicycle gears work: the index card's picture. A chainring, a chain
// and a sprocket on the back wheel, turning.

import { TOKENS } from '../shared/draw.js';
import { drawDrive } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  drawDrive(ctx, w, h, col, 50, 17, t * 1.5);
}

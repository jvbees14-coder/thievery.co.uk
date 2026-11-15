// The house edge: the index card's picture. A roulette wheel turning.

import { TOKENS } from '../shared/draw.js';
import { drawWheel } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const a = t * 0.6;
  drawWheel(ctx, w / 2, h / 2, Math.min(w, h) * 0.42, col, a, -a * 2.2);
}

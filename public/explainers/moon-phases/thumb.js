// The phases of the Moon: the index card's picture. A row of moons
// waxing and waning, the middle one changing.

import { TOKENS } from '../shared/draw.js';
import { SYNODIC, drawFace } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const n = 5, r = Math.min(w / (n * 2.6), h * 0.2), gap = (w - n * 2 * r) / (n + 1);
  const base = (t * 2) % SYNODIC;
  for (let i = 0; i < n; i++) {
    drawFace(ctx, gap + r + i * (2 * r + gap), h / 2, r, base + (i - 2) * 3.7, col);
  }
}

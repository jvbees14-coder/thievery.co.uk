// Card counting: the index card's picture. A hand of cards fanned out,
// each with its Hi-Lo tag, the next one dealt every second and a half.

import { TOKENS } from '../shared/draw.js';
import { newShoe, drawCard } from './art.js';

export const colours = TOKENS;

let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const shoe = newShoe(rand);

export function thumb(ctx, w, h, t, col) {
  const k = Math.floor(t / 1.5);
  const cw = Math.min(w / 6.5, h / 2.6);
  for (let i = 0; i < 5; i++) {
    const c = shoe[(k + i) % shoe.length];
    drawCard(ctx, w / 2 + (i - 2) * cw * 1.05, h * 0.42, cw, c, col, { tilt: (i - 2) * 0.06, tag: true });
  }
}

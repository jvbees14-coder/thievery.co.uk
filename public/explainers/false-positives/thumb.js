// False positives: the index card's picture. A crowd of dots, a few ill,
// with rings round the positive results, most of them on the well.

import { TOKENS } from '../shared/draw.js';
import { people, drawPeople } from './art.js';

export const colours = TOKENS;
const P = people(0.03, 0.9, 0.09).list;

export function thumb(ctx, w, h, t, col) {
  drawPeople(ctx, w * 0.06, h * 0.08, w * 0.88, h * 0.84, P, col, { onlyPositive: Math.floor(t / 2) % 2 === 1 });
}

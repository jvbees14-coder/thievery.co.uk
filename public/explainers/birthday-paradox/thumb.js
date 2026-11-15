// The birthday paradox: the index card's picture. Birthdays landing on a
// ring of the year until two share a day.

import { TOKENS } from '../shared/draw.js';
import { drawYear } from './art.js';

export const colours = TOKENS;

let seed = 5;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const days = Array.from({ length: 40 }, () => Math.floor(rand() * 365));

export function thumb(ctx, w, h, t, col) {
  const n = 2 + (Math.floor(t * 3) % 30);
  drawYear(ctx, w / 2, h / 2, Math.min(w, h) * 0.36, col, days.slice(0, n));
}

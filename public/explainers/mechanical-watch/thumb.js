// The mechanical watch: the index card's picture. The balance swinging
// and the escape wheel stepping, slowed down.

import { TOKENS } from '../shared/draw.js';
import { HZ, AMPLITUDE, TEETH, balance, escapeWheel } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const slow = t / 6;
  const theta = AMPLITUDE * Math.sin(2 * Math.PI * HZ * slow);
  const beats = Math.floor(slow * HZ * 2 + 0.5);
  const s = Math.min(w / 2.4, h / 1.3);
  escapeWheel(ctx, w * 0.3, h * 0.55, s * 0.3, beats * (Math.PI / TEETH), col);
  balance(ctx, w * 0.68, h * 0.45, s * 0.38, theta, col);
}

// The pin tumbler lock: the index card's picture. The right key slides in
// and out, lifting the pins to the shear line.

import { TOKENS } from '../shared/draw.js';
import { NEED, liftsFor, makeView, drawLock } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const p = (t % 5) / 5;
  const s = p < 0.45 ? p / 0.45 : p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
  const eased = s * s * (3 - 2 * s);
  drawLock(ctx, makeView(w, h), col, { lifts: liftsFor(NEED, eased), key: NEED, keyS: eased, turn: s > 0.99 ? 1 : 0 });
}

export function share(ctx, w, h, _t, col) {
  drawLock(ctx, makeView(w, h), col, { lifts: liftsFor(NEED, 1), key: NEED, keyS: 1, turn: 1 });
}

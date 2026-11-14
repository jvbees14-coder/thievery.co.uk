// Passwords: the index card's picture. A hash's 256 bits, flipping as a
// password is typed one letter at a time.

import { TOKENS } from '../shared/draw.js';
import { drawBits } from './art.js';

export const colours = TOKENS;

// Stand-in bits that change every second, so the thumbnail needs no
// waiting on the browser's hashing.
function bitsAt(n) {
  let s = 2166136261 ^ n;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0;
    out[i] = s & 255;
  }
  return out;
}

export function thumb(ctx, w, h, t, col) {
  const size = Math.min(w, h) * 0.8;
  const k = Math.floor(t);
  drawBits(ctx, (w - size) / 2, (h - size) / 2, size, bitsAt(k), bitsAt(k - 1), col, col['hiw-ink-1'], Math.max(0, 1 - (t - k) * 1.5));
}

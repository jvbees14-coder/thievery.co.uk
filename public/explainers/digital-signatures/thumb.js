// Signing without a pen: the index card's picture. A grid of fingerprint
// bits, half of them flipping whenever the message changes.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';
import { sha256, utf8 } from '../shared/sha.js';

export const colours = TOKENS;

const WORDS = ['Pay Sam £20.', 'Pay Sam £21.', 'Pay Sam £20!', 'Pay Pam £20.'];

export function thumb(ctx, w, h, t, col) {
  const hash = sha256(utf8(WORDS[Math.floor(t / 1.6) % WORDS.length]));
  const per = 16, rows = 8, c = Math.min((w * 0.86) / per, (h * 0.86) / rows);
  const x0 = (w - c * per) / 2, y0 = (h - c * rows) / 2;
  for (let i = 0; i < per * rows; i++) {
    const on = (hash[i >> 3] >> (7 - (i & 7))) & 1;
    ctx.fillStyle = on ? col['hiw-ink-1'] : alpha(col['label-tertiary'], 0.15);
    ctx.fillRect(x0 + (i % per) * c + 1, y0 + Math.floor(i / per) * c + 1, c - 2, c - 2);
  }
}

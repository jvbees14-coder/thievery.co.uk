// The one-time pad: the index card's picture. A message, a random key under
// it, and the letters that come out, the key changing as you watch.

import { TOKENS, label, setFace } from '../shared/draw.js';
import { add, randomKey, drawRows } from './art.js';

export const colours = TOKENS;
const MSG = 'ATTACKATDAWN';

export function thumb(ctx, w, h, t, col) {
  setFace(col['font-text']);
  let s = Math.floor(t / 1.5) + 1;
  const key = randomKey(MSG.length, () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296));
  drawRows(ctx, w * 0.05, h * 0.16, w * 0.9, [
    { name: '', text: MSG },
    { name: '', text: key, ink: col.accent },
    { name: '', text: add(MSG, key), ink: col['hiw-ink-1'] },
  ], col, label);
}

// How computers sort: the index card's picture. Bars being bubble-sorted,
// over and over.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';
import { bubble } from './art.js';

export const colours = TOKENS;
const START = [7, 3, 11, 1, 9, 5, 12, 2, 8, 4, 10, 6];
const FRAMES = (() => {
  const a = START.slice(), out = [{ a: a.slice(), ev: null }];
  for (const ev of bubble(a)) if (ev[0] !== 'done') out.push({ a: a.slice(), ev });
  return out;
})();

export function thumb(ctx, w, h, t, col) {
  const k = Math.floor(t * 6) % (FRAMES.length + 18);
  const fr = FRAMES[Math.min(k, FRAMES.length - 1)];
  const n = fr.a.length, bw = (w * 0.84) / n, x0 = w * 0.08, base = h * 0.86;
  fr.a.forEach((v, i) => {
    const bh = (v / n) * h * 0.72;
    const hot = fr.ev && (fr.ev[1] === i || fr.ev[2] === i);
    ctx.fillStyle = k >= FRAMES.length - 1 ? col.success : hot ? col.accent : alpha(col['hiw-ink-1'], 0.75);
    ctx.fillRect(x0 + i * bw + 1, base - bh, bw - 2, bh);
  });
}

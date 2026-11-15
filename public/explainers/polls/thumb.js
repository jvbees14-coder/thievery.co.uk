// How polls work: the index card's picture. A bell of poll results
// building up round the true figure.

import { TOKENS } from '../shared/draw.js';

export const colours = TOKENS;
const BINS = Array.from({ length: 21 }, (_, i) => Math.exp(-(((i - 10) / 4) ** 2) / 2));

export function thumb(ctx, w, h, t, col) {
  const grow = Math.min(1, (t % 6) / 2.5), bw = (w * 0.84) / BINS.length, base = h * 0.86;
  BINS.forEach((v, i) => {
    const bh = v * h * 0.7 * grow;
    ctx.fillStyle = i === 10 ? col.accent : col['hiw-ink-1'];
    ctx.fillRect(w * 0.08 + i * bw + 1, base - bh, bw - 2, bh);
  });
}

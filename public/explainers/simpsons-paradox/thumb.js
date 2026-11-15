// Simpson's paradox: the index card's picture. Two pairs of bars where A
// wins, and a third where, all together, B does.

import { TOKENS, box } from '../shared/draw.js';

export const colours = TOKENS;
const PAIRS = [[0.93, 0.87], [0.73, 0.69], [0.78, 0.83]];

export function thumb(ctx, w, h, t, col) {
  const slot = (w * 0.84) / 3, base = h * 0.86;
  const show = 1 + (Math.floor(t / 1.4) % 3);
  PAIRS.slice(0, show).forEach(([a, b], i) => {
    [[a, col['hiw-ink-1']], [b, col['hiw-ink-2']]].forEach(([v, c], k) => {
      const bh = v * h * 0.72;
      box(ctx, w * 0.08 + i * slot + slot * (0.12 + k * 0.4), base - bh, slot * 0.34, bh, 3);
      ctx.fillStyle = c;
      ctx.fill();
    });
  });
}

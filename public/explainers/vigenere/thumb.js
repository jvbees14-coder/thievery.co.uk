// The cipher that stood for 300 years: the index card's picture. English
// letter counts with their tall E, flattening as the keyword grows.

import { TOKENS } from '../shared/draw.js';
import { ENGLISH } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const k = (Math.sin(t * 0.7) + 1) / 2;
  const bw = (w * 0.86) / 26, x0 = w * 0.07;
  for (let i = 0; i < 26; i++) {
    const p = ENGLISH[i] * (1 - k) + (100 / 26) * k;
    const bh = (p / 13) * h * 0.8;
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fillRect(x0 + i * bw + 1, h * 0.9 - bh, bw - 2, bh);
  }
}

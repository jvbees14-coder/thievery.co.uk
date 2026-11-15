// Matching doctors to hospitals: the index card's picture. Two columns
// joined one to one, the pairs settling.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;
const FINAL = [2, 0, 4, 1, 5, 3];

export function thumb(ctx, w, h, t, col) {
  const n = 6, gap = (h * 0.84) / n, y = (i) => h * 0.08 + gap * (i + 0.5);
  const k = Math.floor(t / 0.6) % (n + 3);
  for (let i = 0; i < n; i++) {
    for (const [x, c] of [[w * 0.2, col['hiw-ink-1']], [w * 0.8, col['hiw-ink-4']]]) {
      ctx.beginPath();
      ctx.arc(x, y(i), gap * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = alpha(c, 0.6);
      ctx.fill();
    }
    if (i < k) {
      ctx.strokeStyle = col.success;
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      ctx.beginPath();
      ctx.moveTo(w * 0.2 + gap * 0.3, y(i));
      ctx.lineTo(w * 0.8 - gap * 0.3, y(FINAL[i]));
      ctx.stroke();
    }
  }
}

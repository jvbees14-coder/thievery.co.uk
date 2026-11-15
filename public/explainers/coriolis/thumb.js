// Why storms spin: the index card's picture. Air spiralling into a low,
// anticlockwise as in the northern hemisphere.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.45;
  for (let arm = 0; arm < 6; arm++) {
    ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.75);
    ctx.lineWidth = Math.max(1.5, h * 0.015);
    ctx.beginPath();
    for (let s = 0; s <= 1; s += 0.02) {
      const r = R * (1 - s * 0.9), a = (arm / 6) * Math.PI * 2 + s * 4 + t * 0.6;
      const x = cx + Math.cos(a) * r, y = cy - Math.sin(a) * r;
      s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = col.danger;
  ctx.fill();
}

// How ocean waves travel: the index card's picture. A swell rolling by,
// and floats going round in circles beneath it.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const surf = h * 0.4, k = (Math.PI * 2) / (w * 0.5), A = h * 0.07, sp = w * 0.12;
  ctx.fillStyle = alpha(col['focus-ring'], 0.2);
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 3) ctx.lineTo(x, surf - A * Math.cos(k * x - k * sp * t));
  ctx.lineTo(w, h);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    for (const z of [0, 0.15, 0.3]) {
      const x0 = w * (0.15 + i * 0.23), r = A * Math.exp(-z * 6), ph = k * x0 - k * sp * t;
      ctx.beginPath();
      ctx.arc(x0 + r * Math.sin(ph), surf + z * h - r * Math.cos(ph), Math.max(2.5, h * 0.025), 0, Math.PI * 2);
      ctx.fillStyle = col.accent;
      ctx.fill();
    }
  }
}

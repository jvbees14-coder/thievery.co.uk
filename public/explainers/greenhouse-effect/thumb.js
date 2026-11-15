// The greenhouse effect: the index card's picture. Sunlight down to the
// ground, infrared up, and some of it sent back down by a layer of air.

import { TOKENS, arrow } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const g = h * 0.82, a0 = h * 0.38, a1 = h * 0.52;
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fillRect(0, g, w, h - g);
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.14 + 0.06 * Math.sin(t));
  ctx.fillRect(0, a0, w, a1 - a0);
  const lw = Math.max(3, h * 0.05);
  const line = (x1, y1, x2, y2, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    arrow(ctx, x1 + (x2 - x1) * 0.97, y1 + (y2 - y1) * 0.97, x2, y2, c, 1, lw * 1.6);
  };
  line(w * 0.12, h * 0.08, w * 0.32, g - 4, col.accent);
  line(w * 0.6, g - 4, w * 0.6, a1, col.danger);
  line(w * 0.75, a1, w * 0.75, g - 4, col.warning);
  line(w * 0.86, a0, w * 0.86, h * 0.08, col.danger);
}

// I cut, you choose: the index card's picture. A cake, half chocolate and
// half vanilla, and a knife sliding along it.

import { TOKENS } from '../shared/draw.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const x0 = w * 0.1, x1 = w * 0.9, y = h * 0.35, ht = h * 0.3;
  ctx.fillStyle = col.ornament;
  ctx.fillRect(x0, y, (x1 - x0) / 2, ht);
  ctx.fillStyle = col.stock;
  ctx.fillRect((x0 + x1) / 2, y, (x1 - x0) / 2, ht);
  ctx.strokeStyle = col['separator-strong'];
  ctx.strokeRect(x0, y, x1 - x0, ht);
  const k = 0.15 + 0.7 * ((Math.sin(t * 0.8) + 1) / 2);
  ctx.strokeStyle = col.danger;
  ctx.lineWidth = Math.max(2, h * 0.025);
  ctx.beginPath();
  ctx.moveTo(x0 + k * (x1 - x0), y - h * 0.12);
  ctx.lineTo(x0 + k * (x1 - x0), y + ht + h * 0.12);
  ctx.stroke();
}

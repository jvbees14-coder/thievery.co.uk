// Why queues suddenly get long: the index card's picture. The wait
// against how busy the till is: flat for a long way, then a wall.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const X = (r) => w * 0.08 + r * w * 0.84, Y = (v) => h * 0.9 - (Math.min(v, 20) / 20) * h * 0.8;
  ctx.strokeStyle = alpha(col['label-tertiary'], 0.5);
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0));
  ctx.lineTo(X(1), Y(0));
  ctx.stroke();
  ctx.strokeStyle = col.danger;
  ctx.lineWidth = Math.max(2, h * 0.02);
  ctx.beginPath();
  for (let r = 0; r <= 0.96; r += 0.01) (r ? ctx.lineTo : ctx.moveTo).call(ctx, X(r), Y(r / (1 - r)));
  ctx.stroke();
  const r = 0.5 + 0.45 * ((Math.sin(t * 0.7) + 1) / 2);
  ctx.fillStyle = col.accent;
  ctx.beginPath();
  ctx.arc(X(r), Y(r / (1 - r)), Math.max(3, h * 0.035), 0, Math.PI * 2);
  ctx.fill();
}

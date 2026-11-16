// How much to bet: the index card's picture. The growth rate against the
// share staked, rising to a peak at 20% and falling below zero.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const g = (f) => 0.6 * Math.log(1 + f) + 0.4 * Math.log(1 - f);
  const X = (f) => w * 0.08 + (f / 0.55) * w * 0.84, Y = (v) => h * 0.45 - (v / 0.025) * h * 0.35;
  ctx.strokeStyle = alpha(col['label-tertiary'], 0.6);
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0));
  ctx.lineTo(X(0.55), Y(0));
  ctx.stroke();
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = Math.max(2, h * 0.02);
  ctx.beginPath();
  for (let f = 0; f <= 0.55; f += 0.01) (f ? ctx.lineTo : ctx.moveTo).call(ctx, X(f), Y(g(f)));
  ctx.stroke();
  const f = 0.2 + 0.15 * Math.sin(t * 0.8);
  ctx.fillStyle = col.danger;
  ctx.beginPath();
  ctx.arc(X(f), Y(g(f)), Math.max(4, h * 0.035), 0, Math.PI * 2);
  ctx.fill();
}

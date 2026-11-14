// Compound interest: the index card's picture. A curve bending upwards
// over a straight line, the gap between them filling in.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const years = 40, r = 0.07;
  const shown = Math.min(years, ((t * 6) % (years + 12)));
  const max = (1 + r) ** years;
  const X = (y) => w * 0.08 + (y / years) * w * 0.84, Y = (v) => h * 0.9 - (v / max) * h * 0.8;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(1));
  for (let y = 0; y <= shown; y += 0.5) ctx.lineTo(X(y), Y((1 + r) ** y));
  ctx.lineTo(X(shown), Y(1 + r * shown));
  ctx.lineTo(X(0), Y(1));
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.3);
  ctx.fill();
  ctx.beginPath();
  for (let y = 0; y <= shown; y += 0.5) (y ? ctx.lineTo(X(y), Y((1 + r) ** y)) : ctx.moveTo(X(y), Y(1)));
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(X(0), Y(1));
  ctx.lineTo(X(shown), Y(1 + r * shown));
  ctx.strokeStyle = col['hiw-ink-2'];
  ctx.lineWidth = 2;
  ctx.stroke();
}

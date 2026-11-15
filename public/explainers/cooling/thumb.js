// When to add the milk: the index card's picture. A cooling curve falling
// towards the room's temperature, steep at first and then shallow.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const k = 0.056, X = (m) => w * 0.08 + (m / 40) * w * 0.84, Y = (c) => h * 0.9 - (c / 100) * h * 0.8;
  ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.6);
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(X(0), Y(20));
  ctx.lineTo(X(40), Y(20));
  ctx.stroke();
  ctx.setLineDash([]);
  const upto = Math.min(40, (t % 6) * 10);
  ctx.strokeStyle = col.danger;
  ctx.lineWidth = Math.max(2, h * 0.02);
  ctx.beginPath();
  for (let m = 0; m <= upto; m += 0.5) (m ? ctx.lineTo : ctx.moveTo).call(ctx, X(m), Y(20 + 70 * Math.exp(-k * m)));
  ctx.stroke();
}

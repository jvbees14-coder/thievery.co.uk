// How hydraulics multiply force: the index card's picture. A thin piston
// pushed down and a wide one rising, joined by oil.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const base = h * 0.9, push = ((Math.sin(t) + 1) / 2) * h * 0.3;
  const xs = w * 0.22, xb = w * 0.65, sw = w * 0.07, bw = w * 0.34;
  ctx.fillStyle = alpha(col.warning, 0.55);
  ctx.fillRect(xs - sw / 2, base - h * 0.45 + push, sw, h * 0.45 - push);
  ctx.fillRect(xb - bw / 2, base - h * 0.35 - push * 0.15, bw, h * 0.35 + push * 0.15);
  ctx.fillRect(xs, base - h * 0.08, xb - xs, h * 0.08);
  ctx.fillStyle = col['label-secondary'];
  ctx.fillRect(xs - sw / 2, base - h * 0.45 + push - 6, sw, 6);
  ctx.fillRect(xb - bw / 2, base - h * 0.35 - push * 0.15 - 6, bw, 6);
}

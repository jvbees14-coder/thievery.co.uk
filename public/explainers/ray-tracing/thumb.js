// Drawing light backwards: the index card's picture. A shaded ball on a
// floor, its shadow swinging as the light moves round.

import { TOKENS, mix } from '../shared/draw.js';
import { alpha, TAU } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const a = 0.6 + Math.sin(t * 0.6) * 0.5;
  const cx = w / 2, cy = h * 0.52, R = Math.min(w, h) * 0.28;
  ctx.fillStyle = alpha(col.back, 0.55);
  ctx.beginPath();
  ctx.ellipse(cx - Math.cos(a) * R * 0.9, cy + R * 0.95, R * 1.1, R * 0.22, 0, 0, TAU);
  ctx.fill();
  const lx = cx + Math.cos(a) * R * 0.5, ly = cy - R * 0.45;
  const g = ctx.createRadialGradient(lx, ly, R * 0.05, cx, cy, R);
  g.addColorStop(0, mix(col['hiw-ink-1'], col.stock, 0.5));
  g.addColorStop(0.6, col['hiw-ink-1']);
  g.addColorStop(1, mix(col['hiw-ink-1'], col.back, 0.75));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
}

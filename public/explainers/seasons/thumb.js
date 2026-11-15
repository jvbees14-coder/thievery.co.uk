// Why there are seasons: the index card's picture. The Earth going round
// the Sun with its axis leaning the same way all year.

import { TOKENS, glow } from '../shared/draw.js';
import { alpha, TAU } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const cx = w / 2, cy = h / 2, rx = w * 0.36, ry = h * 0.26;
  ctx.strokeStyle = col.separator;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.stroke();
  glow(ctx, cx, cy, col.accent, h * 0.09, 2.2, 0.6);
  ctx.beginPath();
  ctx.arc(cx, cy, h * 0.09, 0, TAU);
  ctx.fillStyle = col.accent;
  ctx.fill();
  const a = Math.PI + t * 0.5, x = cx + Math.cos(a) * rx, y = cy - Math.sin(a) * ry, r = h * 0.07;
  const toSun = Math.atan2(cy - y, cx - x);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = col['hiw-ink-1'];
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, toSun + Math.PI / 2, toSun + 1.5 * Math.PI);
  ctx.closePath();
  ctx.fillStyle = alpha(col.back, 0.65);
  ctx.fill();
  const k = 0.409;
  ctx.strokeStyle = col.label;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - Math.sin(k) * r * 1.6, y + Math.cos(k) * r * 1.6);
  ctx.lineTo(x + Math.sin(k) * r * 1.6, y - Math.cos(k) * r * 1.6);
  ctx.stroke();
}

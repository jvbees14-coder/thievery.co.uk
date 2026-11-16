// Why eclipses are rare: the index card's picture. The Moon sliding across
// the Sun until only the glow round its edge is left. The share picture is
// the moment just before totality.

import { TOKENS } from '../shared/draw.js';
import { alpha, TAU } from '../engine.js';

export const colours = TOKENS;

function picture(ctx, w, h, k, col) {
  const R = Math.min(w, h) * 0.3, cx = w / 2, cy = h / 2;
  const cover = 1 - Math.abs(k);
  const glow = ctx.createRadialGradient(cx, cy, R, cx, cy, R * 1.6);
  glow.addColorStop(0, alpha(col['accent-strong'], 0.6 * cover ** 4));
  glow.addColorStop(1, alpha(col['accent-strong'], 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, col['accent-strong']);
  g.addColorStop(1, col.warning);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  ctx.fillStyle = col.back;
  ctx.beginPath();
  ctx.arc(cx + k * R * 2.2, cy, R * 1.02, 0, TAU);
  ctx.fill();
}

export function thumb(ctx, w, h, t, col) {
  picture(ctx, w, h, Math.sin(t * 0.5), col);
}

export function share(ctx, w, h, t, col) {
  picture(ctx, w, h, 0.06, col);
}

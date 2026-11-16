// Finding planets round other stars: the index card's picture. A planet
// crossing a star, and the dip it makes in the light.

import { TOKENS } from '../shared/draw.js';
import { alpha, TAU } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  picture(ctx, w, h, -1.8 + ((t * 0.5) % 1) * 3.6, col);
}

/** The share picture: the planet partway across, the dip half drawn. */
export function share(ctx, w, h, t, col) {
  picture(ctx, w, h, 0.35, col);
}

function picture(ctx, w, h, x, col) {
  const R = Math.min(w, h) * 0.24, cx = w / 2, cy = h * 0.36;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, col['accent-strong']);
  g.addColorStop(0.75, col.warning);
  g.addColorStop(1, alpha(col.warning, 0.6));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  ctx.fillStyle = col.back;
  ctx.beginPath();
  ctx.arc(cx + x * R, cy, R * 0.18, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = Math.max(2, h * 0.02);
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const xx = -1.8 + (3.6 * i) / 100;
    if (xx > x) break;
    const dip = Math.abs(xx) < 1 ? 1 : Math.abs(xx) < 1.18 ? (1.18 - Math.abs(xx)) / 0.18 : 0;
    (i ? ctx.lineTo : ctx.moveTo).call(ctx, w * 0.1 + (i / 100) * w * 0.8, h * 0.8 + dip * h * 0.1);
  }
  ctx.stroke();
}

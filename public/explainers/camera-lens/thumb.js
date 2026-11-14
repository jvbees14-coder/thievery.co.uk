// The camera lens: the index card's picture. Three rays from a subject
// through a lens, meeting at an upside-down image, the subject moving.

import { TOKENS, arrow } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const F = Math.min(w / 7, h / 2.8), cx = w / 2, cy = h * 0.55;
  const X = (x) => cx + x * F, Y = (y) => cy - y * F;
  const u = 2.2 + 0.6 * Math.sin(t * 0.7), ho = 0.7;
  const v = u / (u - 1), hi = -ho * (v / u);
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.3);
  ctx.beginPath();
  ctx.ellipse(cx, cy, F * 0.1, F * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  [[ho, col['hiw-ink-2']], [0, col['label-secondary']], [-ho / (u - 1), col['hiw-ink-3']]].forEach(([at, ink]) => {
    ctx.beginPath();
    ctx.moveTo(X(-u), Y(ho));
    ctx.lineTo(X(0), Y(at));
    ctx.lineTo(X(v), Y(hi));
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  arrow(ctx, X(-u), cy, X(-u), Y(ho), col.accent, 2.5, 8);
  arrow(ctx, X(v), cy, X(v), Y(hi), col['accent-strong'], 2.5, 8);
}

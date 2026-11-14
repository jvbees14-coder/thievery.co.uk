// Wing lift: the index card's picture. The air's paths round the wing,
// with the wing tilting gently up and down.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';
import { outline, streamlines } from './flow.js';

export const colours = TOKENS;
const SHAPE = outline(120);

export function thumb(ctx, w, h, t, col) {
  const deg = Math.round(6 + 4 * Math.sin(t * 0.5));
  const a = (deg * Math.PI) / 180;
  const s = Math.min(w / 7.2, h / 3.4), cx = w * 0.46, cy = h * 0.5;
  const c = Math.cos(-a), sn = Math.sin(-a);
  const to = (z) => [cx + (z[0] * c - z[1] * sn) * s, cy - (z[0] * sn + z[1] * c) * s];
  ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.7);
  ctx.lineWidth = 1;
  for (const line of streamlines(deg, 13)) {
    ctx.beginPath();
    line.forEach((z, i) => (i ? ctx.lineTo(...to(z)) : ctx.moveTo(...to(z))));
    ctx.stroke();
  }
  ctx.beginPath();
  SHAPE.forEach((z, i) => (i ? ctx.lineTo(...to(z)) : ctx.moveTo(...to(z))));
  ctx.closePath();
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fill();
  ctx.strokeStyle = col.label;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

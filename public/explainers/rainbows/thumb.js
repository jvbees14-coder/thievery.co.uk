// How a rainbow works: the index card's picture. A raindrop with white
// light going in and the colours fanning out (spread five times wider than
// it is, as in the scene, or it would be one line).

import { TOKENS } from '../shared/draw.js';
import { SPECTRUM, WATER, rayPath } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const R = Math.min(w, h) * 0.3, cx = w * 0.6, cy = h * 0.44;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = col['accent-tint'];
  ctx.fill();
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = 2;
  ctx.stroke();
  const b = 0.8 + 0.06 * Math.sin(t * 0.8);
  for (const c of SPECTRUM) {
    const { pts, dir } = rayPath(cx, cy, R, b, WATER + (c.n - WATER) * 5, 1);
    ctx.strokeStyle = col[c.token];
    ctx.lineWidth = Math.max(1.6, h * 0.008);
    ctx.beginPath();
    ctx.moveTo(0, pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    const e = pts[pts.length - 1];
    ctx.lineTo(e[0] + Math.cos(dir) * w, e[1] + Math.sin(dir) * w);
    ctx.stroke();
  }
}

// How long is a coastline?: the index card's picture. A Koch snowflake
// growing a step at a time.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

function koch(level) {
  let pts = [0, 1, 2].map((i) => [Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / 3), Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / 3)]);
  for (let l = 0; l < level; l++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], dx = (bx - ax) / 3, dy = (by - ay) / 3;
      const p1 = [ax + dx, ay + dy];
      next.push([ax, ay], p1, [p1[0] + dx * 0.5 + dy * 0.866, p1[1] + dy * 0.5 - dx * 0.866], [ax + 2 * dx, ay + 2 * dy]);
    }
    pts = next;
  }
  return pts;
}
const LEVELS = [0, 1, 2, 3, 4].map(koch);

export function thumb(ctx, w, h, t, col) {
  const pts = LEVELS[Math.floor(t / 1.2) % LEVELS.length], R = Math.min(w, h) * 0.44;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, w / 2 + x * R, h / 2 + 4 + y * R));
  ctx.closePath();
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.2);
  ctx.fill();
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

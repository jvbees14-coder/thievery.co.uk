// How errors fix themselves: the index card's picture. Three overlapping
// circles of checks, one lit where a bit went wrong.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const cx = w / 2, cy = h / 2 + h * 0.03, R = h * 0.28, d = R * 0.62;
  const centres = [[cx - d * 0.87, cy - d * 0.5], [cx + d * 0.87, cy - d * 0.5], [cx, cy + d]];
  const bad = Math.floor(t / 1.5) % 4;   // 0..2: one circle pair; 3: none
  const failing = [[0, 1], [0, 2], [1, 2], []][bad];
  centres.forEach(([x, y], i) => {
    const on = failing.includes(i);
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = alpha(on ? col.danger : col['hiw-ink-1'], on ? 0.25 : 0.08);
    ctx.fill();
    ctx.strokeStyle = on ? col.danger : alpha(col['hiw-ink-1'], 0.6);
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

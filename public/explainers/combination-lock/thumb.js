// How a safe's dial works: the index card's picture. Three wheels turning
// until their gates line up under the fence.

import { TOKENS } from '../shared/draw.js';
import { TAU } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const R = Math.min(w / 7.5, h * 0.3), y = h * 0.58;
  const k = Math.min(1, (t % 7) / 5);
  const ease = 1 - (1 - k) ** 3;
  [0.22, 0.5, 0.78].forEach((fx, i) => {
    const rot = (1 - ease) * (1.3 + i * 0.9) * TAU;
    ctx.save();
    ctx.translate(w * fx, y);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fillStyle = col['bg-elevated'];
    ctx.fill();
    ctx.strokeStyle = col['separator-strong'];
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.rotate(rot);
    ctx.fillStyle = col['hiw-scene-bg'];
    ctx.fillRect(-R * 0.13, -R - 2, R * 0.26, R * 0.24);
    ctx.restore();
  });
  ctx.fillStyle = k >= 1 ? col.success : col.accent;
  ctx.fillRect(w * 0.22 - R * 0.15, y - R - 12 + (k >= 1 ? R * 0.2 : 0), w * 0.56 + R * 0.3, Math.max(5, h * 0.05));
}

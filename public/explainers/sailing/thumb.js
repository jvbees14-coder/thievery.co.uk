// Sailing into the wind: the index card's picture. A boat zigzagging up
// towards a mark, into wind blowing down the card.

import { TOKENS, arrow } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  for (let i = 0; i < 3; i++) arrow(ctx, w * (0.2 + i * 0.3), h * 0.05, w * (0.2 + i * 0.3), h * 0.2, alpha(col['label-tertiary'], 0.7), 1.5, 6);
  const pts = [[0.5, 0.92], [0.7, 0.72], [0.35, 0.5], [0.65, 0.3], [0.5, 0.18]];
  const k = (t * 0.35) % 1;
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = Math.max(2, h * 0.02);
  ctx.beginPath();
  const n = pts.length - 1, upto = k * n;
  pts.forEach(([x, y], i) => {
    if (i > upto + 1) return;
    let px = x, py = y;
    if (i > upto) {
      const [ax, ay] = pts[i - 1];
      const u = upto - (i - 1);
      px = ax + (x - ax) * u;
      py = ay + (y - ay) * u;
    }
    (i ? ctx.lineTo : ctx.moveTo).call(ctx, px * w, py * h);
  });
  ctx.stroke();
  ctx.fillStyle = col.accent;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.14, Math.max(3, h * 0.04), 0, Math.PI * 2);
  ctx.fill();
}

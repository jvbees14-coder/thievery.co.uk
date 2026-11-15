// Secret sharing: the index card's picture. A curve through five shares,
// meeting the axis at the secret.

import { TOKENS } from '../shared/draw.js';
import { lagrange } from './art.js';

export const colours = TOKENS;
const PTS = [[0, 5], [1, 7.2], [2, 4.1], [3, 3.3]];

export function thumb(ctx, w, h, t, col) {
  const X = (x) => w * 0.12 + (x / 3.4) * w * 0.8, Y = (y) => h * 0.88 - (y / 9) * h * 0.76;
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(X(0), h * 0.1);
  ctx.lineTo(X(0), h * 0.9);
  ctx.stroke();
  const k = Math.min(4, 1 + Math.floor((t % 6) / 1.2));
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let x = 0; x <= 3.4; x += 0.05) {
    const y = lagrange(PTS, x);
    x ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y));
  }
  ctx.globalAlpha = k >= 4 ? 1 : 0.25;
  ctx.stroke();
  ctx.globalAlpha = 1;
  PTS.slice(1).forEach(([x, y], i) => {
    ctx.beginPath();
    ctx.arc(X(x), Y(y), Math.max(4, h * 0.035), 0, Math.PI * 2);
    ctx.fillStyle = i < k - 1 ? col['hiw-ink-1'] : col['bg-elevated-2'];
    ctx.fill();
  });
  ctx.beginPath();
  ctx.arc(X(0), Y(5), Math.max(5, h * 0.045), 0, Math.PI * 2);
  ctx.fillStyle = k >= 4 ? col.accent : col['bg-elevated-2'];
  ctx.fill();
}

// Why rockets are mostly fuel: the index card's picture. A rocket whose
// tank empties as its flame burns, the speed curve climbing beside it.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const k = (t % 6) / 5;
  const burn = Math.min(1, k);
  const x = w * 0.22, y = h * 0.1, wd = Math.min(w * 0.12, h * 0.16), ht = h * 0.62;
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + wd / 2, y + ht * 0.18);
  ctx.lineTo(x + wd / 2, y + ht);
  ctx.lineTo(x - wd / 2, y + ht);
  ctx.lineTo(x - wd / 2, y + ht * 0.18);
  ctx.fill();
  const fh = (ht * 0.8) * (1 - burn);
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.8);
  ctx.fillRect(x - wd / 2 + 2, y + ht - 2 - fh, wd - 4, fh);
  if (burn < 1) {
    ctx.fillStyle = alpha(col.warning, 0.85);
    ctx.beginPath();
    ctx.moveTo(x - wd * 0.3, y + ht);
    ctx.lineTo(x, y + ht + h * 0.2);
    ctx.lineTo(x + wd * 0.3, y + ht);
    ctx.fill();
  }
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = Math.max(2, h * 0.02);
  ctx.beginPath();
  for (let p = 0; p <= burn; p += 0.01) {
    const v = Math.log(1 / (1 - 0.9 * p)) / Math.log(10);
    (p ? ctx.lineTo : ctx.moveTo).call(ctx, w * 0.42 + p * w * 0.5, h * 0.88 - v * h * 0.75);
  }
  ctx.stroke();
}

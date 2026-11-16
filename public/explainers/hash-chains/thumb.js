// Why a chained ledger can't be quietly changed: the index card's picture.
// A row of pages linked one to the next, a break running down the chain.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const n = 4, pw = (w * 0.84) / n - 8, ph = h * 0.5, y = h * 0.25;
  const broken = Math.floor(t * 1.2) % 8;
  for (let i = 0; i < n; i++) {
    const x = w * 0.08 + i * (pw + 10.5);
    const bad = broken >= 2 && i >= 1 && i <= broken - 1;
    ctx.fillStyle = alpha(bad ? col.danger : col['label-tertiary'], bad ? 0.25 : 0.15);
    ctx.strokeStyle = bad ? col.danger : col['separator-strong'];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, pw, ph, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = col.accent;
    ctx.fillRect(x + pw * 0.15, y + ph * 0.75, pw * 0.7, Math.max(2, h * 0.03));
    if (i) {
      ctx.strokeStyle = bad ? col.danger : col['label-tertiary'];
      ctx.beginPath();
      ctx.moveTo(x - 10, y + ph * 0.78);
      ctx.lineTo(x, y + ph * 0.25);
      ctx.stroke();
    }
  }
}

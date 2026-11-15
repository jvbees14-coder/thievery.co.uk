// How computers add up: the index card's picture. An AND gate whose
// inputs flick on and off, lighting its output only when both are on.

import { TOKENS } from '../shared/draw.js';
import { drawGate } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const step = Math.floor(t / 1.1) % 4, a = step >> 1, b = step & 1, out = a & b;
  const s = Math.min(w * 0.3, h * 0.5), gx = w / 2 - s / 2, gy = h / 2;
  const line = (x0, y0, x1, on) => {
    ctx.strokeStyle = on ? col.accent : col['label-tertiary'];
    ctx.lineWidth = on ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.stroke();
  };
  line(w * 0.12, gy - s * 0.25, gx, a);
  line(w * 0.12, gy + s * 0.25, gx, b);
  const tip = drawGate(ctx, 'AND', gx, gy, s, col, out);
  line(tip, gy, w * 0.84, out);
  for (const [x, y, on, r] of [[w * 0.12, gy - s * 0.25, a, s * 0.1], [w * 0.12, gy + s * 0.25, b, s * 0.1], [w * 0.86, gy, out, s * 0.15]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = on ? col.accent : col['bg-elevated-2'];
    ctx.fill();
    ctx.strokeStyle = col.separator;
    ctx.stroke();
  }
}

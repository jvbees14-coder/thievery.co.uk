// Why noon isn't at twelve: the index card's picture. The analemma, the
// figure of eight the Sun traces at the same clock time all year.

import { TOKENS } from '../shared/draw.js';

export const colours = TOKENS;
const B = (d) => (2 * Math.PI * (d - 81)) / 365;
const eot = (d) => 9.87 * Math.sin(2 * B(d)) - 7.53 * Math.cos(B(d)) - 1.5 * Math.sin(B(d));
const dec = (d) => -23.44 * Math.cos((2 * Math.PI * (d + 10)) / 365);

export function thumb(ctx, w, h, t, col) {
  const k = (h * 0.8) / 50, cx = w / 2, cy = h / 2;
  const now = 1 + ((t * 30) % 365);
  for (let d = 1; d <= 365; d += 5) {
    ctx.beginPath();
    ctx.arc(cx - eot(d) * 0.25 * k, cy - dec(d) * k, Math.max(1.5, h * 0.012), 0, Math.PI * 2);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx - eot(now) * 0.25 * k, cy - dec(now) * k, Math.max(4, h * 0.04), 0, Math.PI * 2);
  ctx.fillStyle = col.accent;
  ctx.fill();
}

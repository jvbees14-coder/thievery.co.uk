// Levers and pulleys: the index card's picture. A block and tackle with
// four rope runs, the crate rising as the rope is pulled.

import { TOKENS, box } from '../shared/draw.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const n = 4, cx = w * 0.45, top = h * 0.12, r = h * 0.05;
  const lift = ((Math.sin(t * 0.8) + 1) / 2) * h * 0.18;
  const low = h * 0.55 - lift;
  const xs = Array.from({ length: n }, (_, i) => cx - 1.5 * r * 1.6 + i * r * 1.6);
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = Math.max(1.5, h * 0.012);
  xs.forEach((x) => { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, low); ctx.stroke(); });
  ctx.beginPath();
  ctx.moveTo(xs[n - 1], top);
  ctx.lineTo(w * 0.8, top);
  ctx.lineTo(w * 0.8, h * 0.6 + lift * 4);
  ctx.stroke();
  ctx.fillStyle = col['hiw-ink-1'];
  box(ctx, xs[0] - r, top - r, xs[n - 1] - xs[0] + 2 * r, r * 1.6, r * 0.5);
  ctx.fill();
  box(ctx, xs[0] - r, low - r * 0.2, xs[n - 1] - xs[0] + 2 * r, r * 1.6, r * 0.5);
  ctx.fill();
  box(ctx, cx - h * 0.13, low + r * 1.6, h * 0.26, h * 0.22, 4);
  ctx.fillStyle = col.warning;
  ctx.fill();
}

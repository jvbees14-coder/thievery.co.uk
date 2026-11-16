// How radio carries a voice: the index card's picture. A carrier whose
// height swells and shrinks with a slow voice, its outline traced in gold.

import { TOKENS } from '../shared/draw.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const env = (u) => 1 + 0.6 * Math.sin(u * Math.PI * 4 + t * 1.5);
  const y = h / 2, A = h * 0.22;
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = Math.max(1.5, h * 0.012);
  ctx.beginPath();
  for (let i = 0; i <= 400; i++) {
    const u = i / 400;
    (i ? ctx.lineTo : ctx.moveTo).call(ctx, w * 0.06 + u * w * 0.88, y - env(u) * A * Math.sin(u * Math.PI * 2 * 22));
  }
  ctx.stroke();
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = Math.max(2, h * 0.02);
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    (i ? ctx.lineTo : ctx.moveTo).call(ctx, w * 0.06 + u * w * 0.88, y - env(u) * A);
  }
  ctx.stroke();
}

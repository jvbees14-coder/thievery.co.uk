// Earthquakes: the index card's picture. A seismogram: a small P wave
// first, then the big S wave.

import { TOKENS } from '../shared/draw.js';
import { trace } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const span = 60, shown = Math.min(span, ((t % 7) / 5) * span);
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(w * 0.05, h / 2);
  ctx.lineTo(w * 0.95, h / 2);
  ctx.stroke();
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = Math.max(1.2, h * 0.012);
  ctx.beginPath();
  for (let s = 0; s <= shown; s += 0.05) {
    const x = w * 0.05 + (s / span) * w * 0.9, y = h / 2 - trace(s, 150) * h * 0.4;
    s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}

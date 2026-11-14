// The touchscreen: the index card's picture. A grid of wires with a
// finger's glow moving across it.

import { TOKENS, ramp } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const cols = 14, rows = 9;
  const cell = Math.min(w / (cols + 1), h / (rows + 1));
  const x0 = (w - cell * cols) / 2, y0 = (h - cell * rows) / 2;
  const fx = 6.5 + 4 * Math.sin(t * 0.6), fy = 4 + 2.5 * Math.sin(t * 0.9);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = Math.exp(-((c - fx) ** 2 + (r - fy) ** 2) / 1.4);
    if (v < 0.05) continue;
    ctx.fillStyle = alpha(ramp([col['hiw-ink-1'], col.accent, col['hiw-ink-2']], v), 0.2 + v * 0.7);
    ctx.fillRect(x0 + c * cell + 1, y0 + r * cell + 1, cell - 2, cell - 2);
  }
  ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.4);
  ctx.beginPath();
  for (let r = 0; r < rows; r++) {
    ctx.moveTo(x0, y0 + (r + 0.5) * cell);
    ctx.lineTo(x0 + cols * cell, y0 + (r + 0.5) * cell);
  }
  for (let c = 0; c < cols; c++) {
    ctx.moveTo(x0 + (c + 0.5) * cell, y0);
    ctx.lineTo(x0 + (c + 0.5) * cell, y0 + rows * cell);
  }
  ctx.stroke();
}

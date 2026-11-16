// Drawing the lines: the index card's picture. The same voters, the lines
// redrawn between rows and columns.

import { TOKENS } from '../shared/draw.js';
import { TAU } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const R = 5, C = 10;
  const cell = Math.min((w * 0.9) / C, (h * 0.86) / R);
  const x0 = (w - cell * C) / 2, y0 = (h - cell * R) / 2;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    ctx.beginPath();
    ctx.arc(x0 + (c + 0.5) * cell, y0 + (r + 0.5) * cell, cell * 0.3, 0, TAU);
    ctx.fillStyle = c < 6 ? col['hiw-ink-4'] : col['hiw-signal'];
    ctx.fill();
  }
  ctx.strokeStyle = col.label;
  ctx.lineWidth = Math.max(1.5, cell * 0.08);
  const rows = Math.floor(t / 2.5) % 2 === 0;
  for (let i = 1; i < (rows ? R : 5); i++) {
    ctx.beginPath();
    if (rows) { ctx.moveTo(x0, y0 + i * cell); ctx.lineTo(x0 + C * cell, y0 + i * cell); }
    else { ctx.moveTo(x0 + i * 2 * cell, y0); ctx.lineTo(x0 + i * 2 * cell, y0 + R * cell); }
    ctx.stroke();
  }
  ctx.strokeRect(x0, y0, C * cell, R * cell);
}

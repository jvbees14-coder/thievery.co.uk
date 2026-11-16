// The last digit that catches typos: the index card's picture. A row of
// digits, the last one picked out, and a tick or a cross as one changes.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

const GOOD = '79927398713', BAD = '79927938713';

export function thumb(ctx, w, h, t, col) {
  const bad = Math.floor(t / 1.8) % 2 === 1;
  const s = bad ? BAD : GOOD;
  const cell = (w * 0.88) / s.length, x0 = w * 0.06, y = h * 0.3;
  ctx.font = `700 ${Math.min(cell * 0.75, h * 0.2)}px ui-monospace, "SF Mono", Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [...s].forEach((c, i) => {
    const changed = bad && (i === 4 || i === 5);
    ctx.fillStyle = changed ? alpha(col.danger, 0.25) : alpha(col['label-tertiary'], 0.12);
    ctx.fillRect(x0 + i * cell + 1, y, cell - 2, h * 0.3);
    ctx.fillStyle = i === s.length - 1 ? col.accent : col.label;
    ctx.fillText(c, x0 + (i + 0.5) * cell, y + h * 0.15);
  });
  ctx.fillStyle = bad ? col.danger : col.success;
  ctx.fillRect(x0, h * 0.75, w * 0.88, Math.max(3, h * 0.04));
}

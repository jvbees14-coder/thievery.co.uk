// How diff finds what changed: the index card's picture. Lines of a file,
// some struck out in red and some added in green.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

const ROWS = [['=', 0.7], ['-', 0.6], ['+', 0.75], ['=', 0.5], ['+', 0.4], ['=', 0.65], ['-', 0.55]];

export function thumb(ctx, w, h, t, col) {
  const rowH = (h * 0.84) / ROWS.length, x0 = w * 0.08;
  const shown = Math.floor(t * 2.5) % (ROWS.length + 4);
  ROWS.forEach(([op, len], i) => {
    if (i > shown) return;
    const y = h * 0.08 + i * rowH;
    const tone = op === '-' ? col.danger : op === '+' ? col.success : null;
    if (tone) {
      ctx.fillStyle = alpha(tone, 0.2);
      ctx.fillRect(x0, y + 1, w * 0.84, rowH - 3);
    }
    ctx.fillStyle = tone || alpha(col['label-tertiary'], 0.8);
    ctx.fillRect(x0 + w * 0.06, y + rowH * 0.35, w * 0.7 * len, Math.max(2, rowH * 0.25));
  });
}

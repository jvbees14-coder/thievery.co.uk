// How noise-cancelling headphones work: the index card's picture. A wave
// and its upside-down twin, and the flat line they add up to.

import { TOKENS } from '../shared/draw.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const lw = Math.max(2, h * 0.02);
  const row = (y, sign, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let x = 0; x <= w * 0.84; x += 2) {
      const v = sign * Math.sin((x / w) * 14 + t * 3) * h * 0.1;
      (x ? ctx.lineTo : ctx.moveTo).call(ctx, w * 0.08 + x, y + v);
    }
    ctx.stroke();
  };
  row(h * 0.22, 1, col.danger);
  row(h * 0.5, -1, col['hiw-ink-1']);
  row(h * 0.8, 0, col.accent);
}

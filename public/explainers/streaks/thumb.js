// Why real chance is streaky: the index card's picture. A row of tosses
// with a long run picked out.

import { TOKENS } from '../shared/draw.js';
import { TAU } from '../engine.js';

export const colours = TOKENS;

const SEQ = [1, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 1];

export function thumb(ctx, w, h, t, col) {
  const per = 8, d = Math.min((w * 0.86) / per, (h * 0.86) / 4);
  const x0 = (w - d * per) / 2, y0 = (h - d * 4) / 2;
  const lit = Math.floor(t * 4) % (SEQ.length + 8);
  SEQ.forEach((v, i) => {
    if (i > lit) return;
    const x = x0 + (i % per) * d + d / 2, y = y0 + Math.floor(i / per) * d + d / 2;
    ctx.beginPath();
    ctx.arc(x, y, d * 0.38, 0, TAU);
    ctx.fillStyle = v ? col['hiw-ink-1'] : col['hiw-ink-2'];
    ctx.fill();
    if (i >= 5 && i <= 10) {
      ctx.strokeStyle = col.label;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}

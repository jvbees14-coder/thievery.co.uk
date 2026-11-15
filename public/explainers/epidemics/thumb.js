// How epidemics spread: the index card's picture. The three SIR curves,
// drawing themselves across the card.

import { TOKENS } from '../shared/draw.js';
import { sir } from './art.js';

export const colours = TOKENS;
const RUN = sir({ R0: 3, days: 120 });

export function thumb(ctx, w, h, t, col) {
  const upto = Math.min(120, Math.floor(((t % 6) / 4) * 120));
  const X = (d) => w * 0.08 + (d / 120) * w * 0.84, Y = (v) => h * 0.88 - v * h * 0.76;
  for (const [key, c, lw] of [['s', col['hiw-ink-1'], 2], ['r', col.success, 2], ['i', col.danger, 3]]) {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let d = 0; d <= upto; d++) {
      const p = [X(d), Y(RUN[d][key])];
      d ? ctx.lineTo(...p) : ctx.moveTo(...p);
    }
    ctx.stroke();
  }
}

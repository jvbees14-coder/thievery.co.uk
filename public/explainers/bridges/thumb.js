// How bridges stand up: the index card's picture. A truss with a load
// moving across it, its members coloured by stretch and squeeze.

import { TOKENS } from '../shared/draw.js';
import { warren, solve } from './art.js';

export const colours = TOKENS;
const T = warren(6, 0.9);

export function thumb(ctx, w, h, t, col) {
  const at = 1 + (Math.floor(t / 1.2) % 5);
  const { forces } = solve(T, at, 1);
  const big = Math.max(...forces.map(Math.abs));
  const unit = (w * 0.86) / 6, x0 = w * 0.07, base = h * 0.7;
  const P = ([x, y]) => [x0 + x * unit, base - y * unit];
  T.members.forEach(([a, b], k) => {
    const f = forces[k];
    ctx.strokeStyle = Math.abs(f) < 1e-6 ? col['label-tertiary'] : f > 0 ? col.danger : col['focus-ring'];
    ctx.lineWidth = 1 + (Math.abs(f) / big) * h * 0.04;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...P(T.nodes[a]));
    ctx.lineTo(...P(T.nodes[b]));
    ctx.stroke();
  });
  ctx.lineCap = 'butt';
}

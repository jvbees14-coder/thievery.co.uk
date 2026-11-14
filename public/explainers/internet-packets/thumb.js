// The internet: the index card's picture. Packets of light crossing a
// small network between two places, on different routes.

import { TOKENS, glow } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

const NODES = [[0.08, 0.5], [0.3, 0.25], [0.3, 0.75], [0.55, 0.4], [0.7, 0.2], [0.72, 0.75], [0.92, 0.5]];
const LINKS = [[0, 1], [0, 2], [1, 3], [2, 3], [1, 4], [3, 4], [3, 5], [2, 5], [4, 6], [5, 6]];
const ROUTES = [[0, 1, 4, 6], [0, 2, 5, 6], [0, 1, 3, 5, 6], [0, 2, 3, 4, 6]];

export function thumb(ctx, w, h, t, col) {
  const at = (i) => [NODES[i][0] * w, NODES[i][1] * h];
  ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.4);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const [a, b] of LINKS) {
    ctx.moveTo(...at(a));
    ctx.lineTo(...at(b));
  }
  ctx.stroke();
  for (let i = 0; i < NODES.length; i++) {
    ctx.beginPath();
    ctx.arc(...at(i), i === 0 || i === 6 ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = col['label-secondary'];
    ctx.fill();
  }
  ROUTES.forEach((r, k) => {
    const p = ((t * 0.35 + k * 0.27) % 1) * (r.length - 1);
    const i = Math.floor(p), f = p - i;
    const a = at(r[i]), b = at(r[Math.min(i + 1, r.length - 1)]);
    glow(ctx, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, col['accent-strong'], 3.5, 3, 0.6);
  });
}

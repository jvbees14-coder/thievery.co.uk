// Six degrees of separation: the index card's picture. A ring of people
// with a few shortcuts across it.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';
import { ring } from './art.js';

export const colours = TOKENS;
const G = ring(60, 2, 0.06, 4);

export function thumb(ctx, w, h, t, col) {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42, spin = t * 0.1;
  const P = (i) => [cx + Math.cos((i / 60) * Math.PI * 2 + spin) * R, cy + Math.sin((i / 60) * Math.PI * 2 + spin) * R];
  for (const e of G.edges) {
    ctx.strokeStyle = e.shortcut ? col.accent : alpha(col['label-tertiary'], 0.4);
    ctx.lineWidth = e.shortcut ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(...P(e[0]));
    ctx.lineTo(...P(e[1]));
    ctx.stroke();
  }
  for (let i = 0; i < 60; i++) {
    ctx.beginPath();
    ctx.arc(...P(i), Math.max(1.5, h * 0.012), 0, Math.PI * 2);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
  }
}

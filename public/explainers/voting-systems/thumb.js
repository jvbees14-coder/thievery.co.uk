// Voting systems: the index card's picture. Voters coloured by their
// favourite of three candidates, one candidate drifting about.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';
import { electorate } from './votes.js';

export const colours = TOKENS;
const V = electorate(900);
const INKS = ['hiw-ink-1', 'hiw-ink-2', 'accent'];

export function thumb(ctx, w, h, t, col) {
  const c = [{ x: 0.32, y: 0.45 }, { x: 0.68, y: 0.55 }, { x: 0.5 + 0.18 * Math.sin(t * 0.5), y: 0.3 + 0.15 * Math.cos(t * 0.4) }];
  const s = Math.min(w, h) * 0.9, x0 = (w - s) / 2, y0 = (h - s) / 2;
  for (const [x, y] of V) {
    let best = 0, bd = Infinity;
    c.forEach((k, i) => {
      const d = Math.hypot(k.x - x, k.y - y);
      if (d < bd) { bd = d; best = i; }
    });
    ctx.fillStyle = alpha(col[INKS[best]], 0.6);
    ctx.fillRect(x0 + x * s - 1.2, y0 + y * s - 1.2, 2.4, 2.4);
  }
  c.forEach((k, i) => {
    ctx.beginPath();
    ctx.arc(x0 + k.x * s, y0 + k.y * s, Math.max(5, s * 0.04), 0, Math.PI * 2);
    ctx.fillStyle = col[INKS[i]];
    ctx.fill();
  });
}

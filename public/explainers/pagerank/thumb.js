// How a search engine ranks pages: the index card's picture. Pages linked
// together, each sized by its rank, with a surfer hopping between them.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';
import { PAGES, LINKS, pagerank } from './art.js';

export const colours = TOKENS;
const RANK = pagerank();

export function thumb(ctx, w, h, t, col) {
  const pos = PAGES.map((p) => [w * 0.08 + p.x * w * 0.84, h * 0.08 + p.y * h * 0.84]);
  ctx.strokeStyle = alpha(col['label-tertiary'], 0.6);
  ctx.lineWidth = 1.2;
  LINKS.forEach((out, i) => out.forEach((j) => {
    ctx.beginPath();
    ctx.moveTo(...pos[i]);
    ctx.lineTo(...pos[j]);
    ctx.stroke();
  }));
  PAGES.forEach((_, i) => {
    ctx.beginPath();
    ctx.arc(...pos[i], 4 + Math.sqrt(RANK[i]) * h * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = alpha(col.accent, 0.85);
    ctx.fill();
  });
  // A surfer going Home → Shop → Home → News → Home ...
  const route = [0, 4, 0, 1, 0, 2];
  const k = Math.floor(t) % route.length, f = t % 1;
  const a = pos[route[k]], b = pos[route[(k + 1) % route.length]];
  ctx.beginPath();
  ctx.arc(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.max(3, h * 0.03), 0, Math.PI * 2);
  ctx.fillStyle = col['hiw-ink-1'];
  ctx.fill();
}

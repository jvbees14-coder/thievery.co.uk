// How a satnav finds a route: the index card's picture. A search spreading
// across a grid of walls, then the route drawn.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';
import { COLS, ROWS, WALL, makeGrid, search } from './art.js';

export const colours = TOKENS;
const G = makeGrid(5);
const R = search(G, 'astar');

export function thumb(ctx, w, h, t, col) {
  const cell = Math.min(w / COLS, h / ROWS), ox = (w - cell * COLS) / 2, oy = (h - cell * ROWS) / 2;
  const n = Math.floor(((t % 6) / 4) * R.order.length);
  G.g.forEach((row, r) => row.forEach((v, c) => {
    ctx.fillStyle = v === WALL ? col['label-tertiary'] : col['bg-elevated'];
    ctx.fillRect(ox + c * cell + 0.5, oy + r * cell + 0.5, cell - 1, cell - 1);
  }));
  for (let i = 0; i < Math.min(n, R.order.length); i++) {
    const [r, c] = R.order[i];
    ctx.fillStyle = alpha(col['hiw-ink-2'], 0.4);
    ctx.fillRect(ox + c * cell + 0.5, oy + r * cell + 0.5, cell - 1, cell - 1);
  }
  if (n >= R.order.length) {
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = Math.max(1.5, cell * 0.3);
    ctx.beginPath();
    R.path.forEach(([r, c], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, ox + (c + 0.5) * cell, oy + (r + 0.5) * cell));
    ctx.stroke();
  }
}

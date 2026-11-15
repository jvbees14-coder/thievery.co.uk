// The Game of Life: the index card's picture. Gliders crossing a grid.

import { TOKENS } from '../shared/draw.js';
import { PATTERNS, grid, place, step } from './art.js';

export const colours = TOKENS;
const G = grid(30, 20);
place(G, PATTERNS.glider, 2, 2);
place(G, PATTERNS.glider, 14, 9);
place(G, PATTERNS.blinker, 22, 4);
let shown = 0;

export function thumb(ctx, w, h, t, col) {
  const target = Math.floor(t * 6);
  while (shown < target) {
    step(G);
    shown++;
  }
  const cell = Math.min(w / G.w, h / G.h), ox = (w - cell * G.w) / 2, oy = (h - cell * G.h) / 2;
  ctx.fillStyle = col.accent;
  for (let i = 0; i < G.cells.length; i++) if (G.cells[i]) ctx.fillRect(ox + (i % G.w) * cell + 1, oy + Math.floor(i / G.w) * cell + 1, cell - 2, cell - 2);
}

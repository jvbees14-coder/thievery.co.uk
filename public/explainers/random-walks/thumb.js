// Random walks: the index card's picture. A wandering trail on a grid,
// growing a step at a time.

import { TOKENS } from '../shared/draw.js';

export const colours = TOKENS;
const PATH = (() => {
  let s = 5, x = 0, y = 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = [[0, 0]];
  for (let i = 0; i < 400; i++) {
    const k = Math.floor(r() * 4);
    if (k === 0) x++; else if (k === 1) x--; else if (k === 2) y++; else y--;
    out.push([x, y]);
  }
  return out;
})();

export function thumb(ctx, w, h, t, col) {
  const n = Math.min(PATH.length, 10 + Math.floor((t % 8) * 60));
  const cell = Math.min(w, h) / 34;
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = Math.max(1.2, cell * 0.25);
  ctx.beginPath();
  PATH.slice(0, n).forEach(([x, y], i) => (i ? ctx.lineTo(w / 2 + x * cell, h / 2 + y * cell) : ctx.moveTo(w / 2, h / 2)));
  ctx.stroke();
  const [x, y] = PATH[n - 1];
  ctx.beginPath();
  ctx.arc(w / 2 + x * cell, h / 2 + y * cell, cell * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = col.accent;
  ctx.fill();
}

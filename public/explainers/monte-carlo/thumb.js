// Finding π with random darts: the index card's picture. Darts in a
// square, coloured by whether they land inside the quarter circle.

import { TOKENS } from '../shared/draw.js';

export const colours = TOKENS;
const PTS = (() => {
  let s = 9;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: 600 }, () => [r(), r()]);
})();

export function thumb(ctx, w, h, t, col) {
  const size = Math.min(w, h) * 0.86, x0 = (w - size) / 2, y0 = (h - size) / 2;
  const n = Math.min(PTS.length, Math.floor((t % 8) * 120));
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x0, y0 + size, size, -Math.PI / 2, 0);
  ctx.stroke();
  for (let i = 0; i < n; i++) {
    const [x, y] = PTS[i];
    ctx.fillStyle = x * x + y * y <= 1 ? col['hiw-ink-1'] : col['hiw-ink-2'];
    ctx.fillRect(x0 + x * size - 1.5, y0 + size - y * size - 1.5, 3, 3);
  }
}

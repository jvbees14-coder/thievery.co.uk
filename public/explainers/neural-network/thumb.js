// How a neural network learns: the index card's picture. Two colours of
// points in a ring, and the region a trained network paints round them.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';
import { seeded, dataset, network, forward, train } from './art.js';

export const colours = TOKENS;
const PTS = dataset('circle', 80, seeded(2));
const NET = network(8, seeded(3));
for (let i = 0; i < 400; i++) train(NET, PTS, 1.0);

export function thumb(ctx, w, h, t, col) {
  const s = Math.min(w, h) * 0.86, x0 = (w - s) / 2, y0 = (h - s) / 2, n = 24, c = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const p = forward(NET, -1 + ((i + 0.5) / n) * 2, 1 - ((j + 0.5) / n) * 2).out;
    ctx.fillStyle = alpha(p > 0.5 ? col['hiw-ink-2'] : col['hiw-ink-1'], 0.1 + Math.abs(p - 0.5) * 0.3);
    ctx.fillRect(x0 + i * c, y0 + j * c, c + 0.5, c + 0.5);
  }
  PTS.forEach(([x, y, k], i) => {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2 + i);
    ctx.beginPath();
    ctx.arc(x0 + ((x + 1) / 2) * s, y0 + ((1 - y) / 2) * s, Math.max(2, s * 0.018) * (0.8 + 0.3 * pulse), 0, Math.PI * 2);
    ctx.fillStyle = k ? col['hiw-ink-2'] : col['hiw-ink-1'];
    ctx.fill();
  });
}

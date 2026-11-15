// How a microwave oven heats: the index card's picture. A plate on a
// turntable with a grid of hot spots turning under it.

import { TOKENS, mix } from '../shared/draw.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const R = Math.min(w, h) * 0.42, cx = w / 2, cy = h / 2, n = 22, cell = (2 * R) / n, a = t * 0.5;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const u = (i + 0.5) / n - 0.5, v = (j + 0.5) / n - 0.5;
    if (u * u + v * v > 0.25) continue;
    const x = u * Math.cos(a) - v * Math.sin(a), y = u * Math.sin(a) + v * Math.cos(a);
    const heat = (Math.cos(x * 15 + 0.6) * Math.cos(y * 15 + 1.1)) ** 2;
    ctx.fillStyle = mix(col['focus-ring'], col.danger, heat);
    ctx.fillRect(cx - R + i * cell, cy - R + j * cell, cell + 0.5, cell + 0.5);
  }
}

// How JPEG shrinks a photo: the index card's picture. The 64 patterns of
// the cosine transform, lighting up a few at a time.

import { TOKENS, mix } from '../shared/draw.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const ramp = Array.from({ length: 33 }, (_, i) => mix(col.back, col.stock, i / 32));
  const shade = (v) => ramp[Math.max(0, Math.min(32, Math.round(v * 32)))];
  const cell = Math.min(w * 0.9, h * 0.9) / 8;
  const x0 = (w - cell * 8) / 2, y0 = (h - cell * 8) / 2, k = cell / 8;
  const lit = Math.floor(t * 3) % 15;
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
    const on = u + v <= lit % 8;
    for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
      const val = Math.cos(((2 * px + 1) * u * Math.PI) / 16) * Math.cos(((2 * py + 1) * v * Math.PI) / 16);
      ctx.fillStyle = shade(on ? 0.5 + val * 0.45 : 0.15 + val * 0.1);
      ctx.fillRect(x0 + u * cell + px * k, y0 + v * cell + py * k, k + 0.3, k + 0.3);
    }
  }
}

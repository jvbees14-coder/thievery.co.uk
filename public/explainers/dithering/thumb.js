// Shades from black and white: the index card's picture. A lit ball drawn
// with only two colours, by error diffusion.

import { TOKENS } from '../shared/draw.js';

export const colours = TOKENS;
const W = 60, H = 40;
const OUT = (() => {
  const e = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - 23) / 13, dy = (y - 20) / 13, d2 = dx * dx + dy * dy;
    e[y * W + x] = d2 < 1 ? 0.08 + 0.9 * Math.max(0, -dx * 0.5 - dy * 0.6 + Math.sqrt(1 - d2) * 0.62) : 0.15 + 0.7 * (x / W);
  }
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, q = e[i] >= 0.5 ? 1 : 0, err = e[i] - q;
    out[i] = q;
    if (x + 1 < W) e[i + 1] += (err * 7) / 16;
    if (y + 1 < H) {
      if (x > 0) e[i + W - 1] += (err * 3) / 16;
      e[i + W] += (err * 5) / 16;
      if (x + 1 < W) e[i + W + 1] += err / 16;
    }
  }
  return out;
})();

export function thumb(ctx, w, h, t, col) {
  const cell = Math.min(w / W, h / H), ox = (w - cell * W) / 2, oy = (h - cell * H) / 2;
  ctx.fillStyle = col.back;
  ctx.fillRect(ox, oy, cell * W, cell * H);
  ctx.fillStyle = col.stock;
  for (let i = 0; i < OUT.length; i++) if (OUT[i]) ctx.fillRect(ox + (i % W) * cell, oy + Math.floor(i / W) * cell, cell + 0.3, cell + 0.3);
}

// Hiding a message in a picture: the index card's picture. The landscape,
// with its lowest layer of bits sweeping across it. Drawn at half
// resolution, so the card stays cheap to animate.

import { TOKENS, mix } from '../shared/draw.js';
import { picture, W, H } from './art.js';

export const colours = TOKENS;
const PIC = picture();

export function thumb(ctx, w, h, t, col) {
  const edge = ((t * 12) % (W + 20)) - 10;
  const cell = Math.min(w / W, h / H) * 2, x0 = (w - cell * (W / 2)) / 2, y0 = (h - cell * (H / 2)) / 2;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const v = PIC[y * W + x];
      ctx.fillStyle = mix(col.back, col.stock, x < edge ? v & 1 : v / 255);
      ctx.fillRect(x0 + (x / 2) * cell, y0 + (y / 2) * cell, cell + 0.4, cell + 0.4);
    }
  }
}

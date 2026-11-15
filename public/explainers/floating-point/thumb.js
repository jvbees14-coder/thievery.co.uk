// Why 0.1 + 0.2 isn't 0.3: the index card's picture. The binary digits of
// 0.1, repeating for ever.

import { TOKENS, box } from '../shared/draw.js';

export const colours = TOKENS;
const BITS = '000110011001100110011001100110011001100110011001'.split('').map(Number);

export function thumb(ctx, w, h, t, col) {
  const per = 12, cell = Math.min((w * 0.9) / per, (h * 0.8) / 4), x0 = (w - cell * per) / 2, y0 = (h - cell * 4) / 2;
  const n = Math.min(BITS.length, Math.floor((t % 8) * 9));
  for (let i = 0; i < n; i++) {
    box(ctx, x0 + (i % per) * cell + 1, y0 + Math.floor(i / per) * cell + 1, cell - 2, cell - 2, 2);
    ctx.fillStyle = BITS[i] ? col['hiw-ink-1'] : col['bg-elevated-2'];
    ctx.fill();
  }
}

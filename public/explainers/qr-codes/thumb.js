// QR codes: the index card's picture. A real code for this explainer's
// own address, its parts in colour, data filling in along its zigzag.

import { TOKENS } from '../shared/draw.js';
import { encode } from './qr.js';

export const colours = TOKENS;
const q = encode('https://thievery.co.uk/how-it-works/qr-codes', 'M');
const INK = { finder: 'accent', timing: 'hiw-ink-3', alignment: 'hiw-ink-4', format: 'hiw-ink-2', dark: 'hiw-ink-2', ecc: 'hiw-ink-1' };

export function thumb(ctx, w, h, t, col) {
  const n = q.size + 4;
  const cell = Math.floor((Math.min(w, h) * 0.9) / n);
  const x0 = Math.round((w - cell * n) / 2), y0 = Math.round((h - cell * n) / 2);
  const shown = ((t % 8) / 6) * (q.dataCount + q.eccCount) * 8;
  ctx.fillStyle = col.stock;
  ctx.fillRect(x0, y0, cell * n, cell * n);
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) {
    if (!q.modules[y][x]) continue;
    if (q.order[y][x] >= shown) continue;
    ctx.fillStyle = col[INK[q.kind[y][x]]] || col['stock-ink'];
    ctx.fillRect(x0 + (x + 2) * cell, y0 + (y + 2) * cell, cell, cell);
  }
}

export function share(ctx, w, h, _t, col) {
  thumb(ctx, w, h, 7, col);
}

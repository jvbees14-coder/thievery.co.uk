// Compression: the index card's picture. Bars of how often each letter
// appears, settling into a tree.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';
import { build } from './huffman.js';

export const colours = TOKENS;
const model = build('steal their cards before they steal yours');

export function thumb(ctx, w, h, t, col) {
  const k = Math.floor(t * 1.2) % (model.steps.length + 4);
  let pool = model.leaves.slice();
  for (let i = 0; i < Math.min(k, model.steps.length); i++) {
    const { a, b, node } = model.steps[i];
    pool = pool.filter((x) => x !== a && x !== b);
    pool.push(node);
  }
  const max = Math.max(...pool.map((n) => n.n));
  const bw = (w * 0.86) / pool.length;
  pool.forEach((n, i) => {
    const bh = (n.n / max) * h * 0.7;
    ctx.fillStyle = n.leaf ? alpha(col['hiw-ink-1'], 0.8) : col.accent;
    ctx.fillRect(w * 0.07 + i * bw + bw * 0.15, h * 0.85 - bh, bw * 0.7, bh);
  });
}

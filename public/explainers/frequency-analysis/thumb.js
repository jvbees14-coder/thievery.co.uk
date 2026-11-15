// Frequency analysis: the index card's picture. The bars of a message's
// letter counts, growing, with the tallest one marked E.

import { TOKENS, label, setFace } from '../shared/draw.js';
import { ENGLISH, BY_FREQ } from './text.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  setFace(col['font-text']);
  const n = 12, slot = (w * 0.8) / n, x0 = w * 0.1, base = h * 0.78;
  const grow = Math.min(1, (t % 5) / 1.5);
  for (let i = 0; i < n; i++) {
    const v = ENGLISH[BY_FREQ[i]] / 13;
    const bh = v * h * 0.6 * grow;
    ctx.fillStyle = i === 0 ? col.accent : col['hiw-ink-1'];
    ctx.fillRect(x0 + i * slot + slot * 0.15, base - bh, slot * 0.7, bh);
    label(ctx, BY_FREQ[i], x0 + i * slot + slot / 2, base + slot * 0.5, i === 0 ? col.accent : col['label-tertiary'], null, {
      size: Math.max(9, slot * 0.5),
      weight: 700,
      align: 'center',
      mono: true,
    });
  }
}

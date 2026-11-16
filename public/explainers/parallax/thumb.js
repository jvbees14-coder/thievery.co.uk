// Measuring the distance to the stars: the index card's picture. A near
// star swinging to and fro against a field of far ones.

import { TOKENS, glow } from '../shared/draw.js';

export const colours = TOKENS;

const FIELD = Array.from({ length: 24 }, (_, i) => [((i * 37) % 97) / 97, ((i * 59) % 89) / 89]);

export function thumb(ctx, w, h, t, col) {
  ctx.fillStyle = col.back;
  ctx.fillRect(0, 0, w, h);
  for (const [x, y] of FIELD) glow(ctx, x * w, y * h, col['label-secondary'], 1.2, 3, 0.3);
  glow(ctx, w / 2 + Math.cos(t * 1.2) * w * 0.18, h / 2, col.warning, Math.max(3, h * 0.04), 4, 0.7);
}

// How computers find things instantly: the index card's picture. A column
// of buckets, names dropping into them.

import { TOKENS, box } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;
const FILL = [2, 0, 1, 3, 1, 0, 2, 1];

export function thumb(ctx, w, h, t, col) {
  const rows = FILL.length, rh = (h * 0.84) / rows, y0 = h * 0.08, shown = (t * 3) % 14;
  let k = 0;
  FILL.forEach((n, i) => {
    const y = y0 + i * rh;
    box(ctx, w * 0.1, y + 2, w * 0.08, rh - 4, 3);
    ctx.fillStyle = col['bg-elevated-2'];
    ctx.fill();
    for (let j = 0; j < n; j++) {
      if (k++ > shown) return;
      box(ctx, w * 0.22 + j * w * 0.22, y + 3, w * 0.2, rh - 6, 3);
      ctx.fillStyle = n > 1 ? alpha(col.danger, 0.4) : alpha(col['hiw-ink-1'], 0.5);
      ctx.fill();
    }
  });
}

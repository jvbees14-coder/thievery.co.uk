// Why the sky is blue: the index card's picture. Rays of each colour
// crossing the air, the blue and violet scattered aside, the red going on.

import { TOKENS } from '../shared/draw.js';
import { COLOURS, scatter } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  COLOURS.forEach((c, i) => {
    const y = h * 0.2 + (i / (COLOURS.length - 1)) * h * 0.6;
    const share = scatter(c.nm) / scatter(400);
    ctx.strokeStyle = col[c.token];
    ctx.lineWidth = Math.max(2, h * 0.02);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w * 0.45, y);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.8, h * 0.02 * (1 - share * 0.85));
    ctx.beginPath();
    ctx.moveTo(w * 0.45, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    for (let j = 0; j < Math.round(share * 4); j++) {
      const a = ((j * 83 + i * 47 + t * 30) % 360) * (Math.PI / 180);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(w * 0.45 + j * w * 0.06, y);
      ctx.lineTo(w * 0.45 + j * w * 0.06 + Math.cos(a) * h * 0.12, y + Math.sin(a) * h * 0.12);
      ctx.stroke();
    }
  });
}

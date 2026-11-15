// How a heat pump works: the index card's picture. Refrigerant going round
// its loop, cold on the outdoor side and hot on the indoor side.

import { TOKENS, box, mix } from '../shared/draw.js';
import { clamp } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const x0 = w * 0.2, x1 = w * 0.8, y0 = h * 0.25, y1 = h * 0.75;
  ctx.strokeStyle = col.separator;
  ctx.lineWidth = Math.max(4, h * 0.04);
  box(ctx, x0, y0, x1 - x0, y1 - y0, h * 0.06);
  ctx.stroke();
  const W = x1 - x0, H = y1 - y0, P = 2 * (W + H);
  for (let i = 0; i < 40; i++) {
    let d = (((i / 40 + t * 0.06) % 1) * P);
    let x, y;
    if (d < W) [x, y] = [x0 + d, y0];
    else if ((d -= W) < H) [x, y] = [x1, y0 + d];
    else if ((d -= H) < W) [x, y] = [x1 - d, y1];
    else [x, y] = [x0, y1 - (d - W)];
    const f = clamp((x - x0) / W, 0, 1);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2.5, h * 0.025), 0, Math.PI * 2);
    ctx.fillStyle = mix(col['focus-ring'], col.danger, f);
    ctx.fill();
  }
}

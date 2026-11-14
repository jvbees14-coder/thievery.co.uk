// Sound: the index card's picture. A square wave being built from its
// odd harmonics, one more every second.

import { TOKENS } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const terms = 1 + (Math.floor(t) % 8);
  const y0 = h / 2, ah = h * 0.3;
  ctx.strokeStyle = alpha(col['label-secondary'], 0.3);
  ctx.beginPath();
  ctx.moveTo(0, y0);
  ctx.lineTo(w, y0);
  ctx.stroke();
  ctx.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const ph = (x / w) * 2 * Math.PI * 2;
    let v = 0;
    for (let n = 1; n <= 2 * terms - 1; n += 2) v += Math.sin(n * ph) / n;
    v /= Math.PI / 4;
    if (x) ctx.lineTo(x, y0 - v * ah);
    else ctx.moveTo(x, y0 - v * ah);
  }
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

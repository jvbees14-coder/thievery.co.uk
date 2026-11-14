// Public-key cryptography: the index card's picture. Two secret colours
// each mixed with a shared one, crossing in the open, and arriving at the
// same final colour on both sides.

import { TOKENS, mix } from '../shared/draw.js';

export const colours = TOKENS;

function pot(ctx, x, y, r, fill, col) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = col['separator-strong'];
  ctx.stroke();
}

export function thumb(ctx, w, h, t, col) {
  const p = Math.min(1, (t % 5) / 3);
  const e = p * p * (3 - 2 * p);
  const r = Math.min(w, h) * 0.11;
  const pub = col.stock, A = col['hiw-ink-1'], B = col['hiw-ink-2'];
  const mA = mix(pub, A, 0.5), mB = mix(pub, B, 0.5);
  pot(ctx, w / 2, h * 0.25, r, pub, col);
  pot(ctx, w * 0.2 + (w * 0.6) * e, h * 0.55, r * 0.85, mA, col);
  pot(ctx, w * 0.8 - (w * 0.6) * e, h * 0.55, r * 0.85, mB, col);
  if (p >= 1) {
    const s = mix(mA, B, 0.34);
    pot(ctx, w * 0.2, h * 0.8, r, s, col);
    pot(ctx, w * 0.8, h * 0.8, r, s, col);
  }
}

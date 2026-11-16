// Agreeing a secret in public: the index card's picture. Two secret
// colours, each mixed with a public one, meeting in the same shared colour.

import { TOKENS, mix } from '../shared/draw.js';
import { TAU } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const base = col['hiw-signal'], a = col['hiw-ink-2'], b = col['hiw-ink-1'];
  const fin = mix(mix(base, a, 0.5), b, 1 / 3);
  const r = Math.min(w, h) * 0.12;
  const k = (Math.sin(t * 0.9) + 1) / 2;
  const dot = (x, y, c, rr = r) => { ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fillStyle = c; ctx.fill(); };
  dot(w * 0.5, h * 0.22, base, r * 0.8);
  dot(w * 0.2, h * 0.5, a);
  dot(w * 0.8, h * 0.5, b);
  dot(w * 0.2 + (w * 0.3 - r * 0.6) * k, h * 0.8, fin);
  dot(w * 0.8 - (w * 0.3 - r * 0.6) * k, h * 0.8, fin);
}

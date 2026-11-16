// The six digits on your phone: the index card's picture. A code with the
// ring of its 30 seconds running down.

import { TOKENS } from '../shared/draw.js';
import { alpha, TAU } from '../engine.js';

export const colours = TOKENS;

const CODES = ['287 082', '081 804', '005 924', '279 037'];

export function thumb(ctx, w, h, t, col) {
  const left = 30 - ((t * 6) % 30);
  const code = CODES[Math.floor((t * 6) / 30) % CODES.length];
  ctx.font = `700 ${Math.min(w * 0.13, h * 0.24)}px ui-monospace, "SF Mono", Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = col.accent;
  ctx.fillText(code, w * 0.42, h * 0.5);
  const R = Math.min(w, h) * 0.13, cx = w * 0.84, cy = h * 0.5;
  ctx.lineWidth = Math.max(3, R * 0.25);
  ctx.strokeStyle = alpha(col['label-tertiary'], 0.3);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = left < 6 ? col.danger : col['hiw-ink-1'];
  ctx.beginPath();
  ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + (left / 30) * TAU);
  ctx.stroke();
}

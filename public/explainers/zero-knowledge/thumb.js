// Zero-knowledge proofs: the index card's picture. The ring-shaped cave
// with its locked door, and Peggy walking round it.

import { TOKENS } from '../shared/draw.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const cx = w / 2, cy = h * 0.45, R = Math.min(w, h) * 0.3;
  ctx.strokeStyle = col['bg-elevated-2'];
  ctx.lineWidth = Math.max(8, R * 0.22);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.moveTo(cx, cy + R);
  ctx.lineTo(cx, cy + R * 1.6);
  ctx.stroke();
  ctx.fillStyle = col.warning;
  ctx.fillRect(cx - 3, cy - R - ctx.lineWidth / 2, 6, ctx.lineWidth);
  const a = Math.PI / 2 + Math.sin(t * 0.9) * Math.PI * 0.85;
  ctx.beginPath();
  ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, Math.max(4, R * 0.1), 0, Math.PI * 2);
  ctx.fillStyle = col['hiw-ink-1'];
  ctx.fill();
}

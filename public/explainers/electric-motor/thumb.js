// How an electric motor works: the index card's picture. A coil turning
// between a north and a south pole.

import { TOKENS, box, label, setFace } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  setFace(col['font-text']);
  const pw = w * 0.14, ph = h * 0.62, y = (h - ph) / 2;
  box(ctx, w * 0.06, y, pw, ph, 6);
  ctx.fillStyle = alpha(col.danger, 0.75);
  ctx.fill();
  box(ctx, w * 0.94 - pw, y, pw, ph, 6);
  ctx.fillStyle = alpha(col['focus-ring'], 0.75);
  ctx.fill();
  label(ctx, 'N', w * 0.06 + pw / 2, h / 2, col.stock, null, { size: pw * 0.5, weight: 800, align: 'center' });
  label(ctx, 'S', w * 0.94 - pw / 2, h / 2, col.stock, null, { size: pw * 0.5, weight: 800, align: 'center' });
  const a = t * 1.6, span = h * 0.28, cx = w / 2, cy = h / 2;
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(a) * span, cy - Math.sin(a) * span);
  ctx.lineTo(cx - Math.cos(a) * span, cy + Math.sin(a) * span);
  ctx.stroke();
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.arc(cx + s * Math.cos(a) * span, cy - s * Math.sin(a) * span, h * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = col['bg-elevated-2'];
    ctx.fill();
    ctx.stroke();
  }
}

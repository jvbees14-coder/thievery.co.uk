// How solar panels work: the index card's picture. A tilted panel with
// sunlight falling on it, the Sun crossing the sky.

import { TOKENS, box } from '../shared/draw.js';
import { alpha } from '../engine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const a = Math.PI * (0.15 + 0.7 * ((Math.sin(t * 0.5) + 1) / 2));
  const sx = w / 2 - Math.cos(a) * w * 0.38, sy = h * 0.9 - Math.sin(a) * h * 0.7;
  ctx.beginPath();
  ctx.arc(sx, sy, h * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = col.accent;
  ctx.fill();
  // The panel: a grid of cells, tilted.
  ctx.save();
  ctx.translate(w / 2, h * 0.72);
  ctx.rotate(-0.35);
  const pw = w * 0.42, ph = h * 0.16;
  box(ctx, -pw / 2, -ph / 2, pw, ph, 3);
  ctx.fillStyle = col['hiw-ink-4'];
  ctx.fill();
  ctx.strokeStyle = alpha(col.label, 0.4);
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(-pw / 2 + (i * pw) / 6, -ph / 2);
    ctx.lineTo(-pw / 2 + (i * pw) / 6, ph / 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = alpha(col.accent, 0.5);
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(w / 2, h * 0.72);
  ctx.stroke();
  ctx.setLineDash([]);
}

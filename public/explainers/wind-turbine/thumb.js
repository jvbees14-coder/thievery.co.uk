// How a wind turbine works: the index card's picture. Three blades
// turning on a tower.

import { TOKENS } from '../shared/draw.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const cx = w / 2, cy = h * 0.38, R = Math.min(w, h) * 0.34;
  ctx.strokeStyle = col['separator-strong'];
  ctx.lineWidth = Math.max(3, h * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, h);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 1.2 + (i * Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.05);
    ctx.quadraticCurveTo(R * 0.5, -R * 0.1, R, 0);
    ctx.quadraticCurveTo(R * 0.5, R * 0.04, 0, R * 0.05);
    ctx.fillStyle = col.stock;
    ctx.fill();
    ctx.restore();
  }
}

// How flocks move without a leader: the index card's picture. A small
// flock wheeling round together. The birds sit on a sunflower spiral, which
// scatters them evenly without looking like rows.

import { TOKENS } from '../shared/draw.js';

export const colours = TOKENS;

const BIRDS = Array.from({ length: 34 }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / 34), a = i * 2.39996;
  return [Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.32];
});

export function thumb(ctx, w, h, t, col) {
  const a = t * 0.6;
  const cx = w / 2 + Math.cos(a) * w * 0.18, cy = h / 2 + Math.sin(a) * h * 0.18;
  const head = a + Math.PI / 2;
  const s = Math.max(0.7, Math.min(w, h) / 300);
  for (const [dx, dy] of BIRDS) {
    const x = cx + (dx * Math.cos(head) - dy * Math.sin(head)) * w * 0.45 + Math.sin(t * 2 + dx * 9) * 2;
    const y = cy + (dx * Math.sin(head) + dy * Math.cos(head)) * h * 0.45;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(head + dy * 0.4);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, 3.5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-5, -3.5);
    ctx.closePath();
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
    ctx.restore();
  }
}

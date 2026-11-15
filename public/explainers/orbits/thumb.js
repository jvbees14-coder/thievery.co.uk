// How orbits work: the index card's picture. Newton's cannon: shots fired
// faster and faster from a height, the last going all the way round.

import { TOKENS } from '../shared/draw.js';
import { R, fly } from './art.js';

export const colours = TOKENS;
const SHOTS = [5, 6.5, 7.3, 7.73].map((v) => fly(v, 300, 8000));

export function thumb(ctx, w, h, t, col, all = false) {
  const scale = (Math.min(w, h) * 0.4) / (R + 300), cx = w / 2, cy = h / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R * scale, 0, Math.PI * 2);
  ctx.fillStyle = col['hiw-ink-1'];
  ctx.fill();
  const shown = all ? SHOTS.length : Math.floor(t / 1.2) % (SHOTS.length + 1);
  SHOTS.slice(0, shown).forEach((s, i) => {
    ctx.strokeStyle = i === SHOTS.length - 1 ? col.accent : col.danger;
    ctx.lineWidth = Math.max(1.5, h * 0.012);
    ctx.beginPath();
    s.pts.forEach(([x, y], k) => (k ? ctx.lineTo(cx + x * scale, cy - y * scale) : ctx.moveTo(cx + x * scale, cy - y * scale)));
    ctx.stroke();
  });
}

/** The share picture: every shot at once. */
export function share(ctx, w, h, t, col) {
  thumb(ctx, w, h, t, col, true);
}

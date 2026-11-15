// Why traffic jams appear from nowhere: the index card's picture. Cars on a
// ring, bunched into a slow red knot that drifts backwards.

import { TOKENS, mix } from '../shared/draw.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36, n = 22;
  ctx.strokeStyle = col['bg-elevated-2'];
  ctx.lineWidth = Math.max(8, R * 0.16);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  // A jam centred at angle j moves backwards slowly while cars move forward.
  const j = -t * 0.25;
  for (let i = 0; i < n; i++) {
    let base = (i / n) * Math.PI * 2 + t * 0.6;
    let d = Math.atan2(Math.sin(base - j), Math.cos(base - j));
    // Squash cars together near the jam.
    const a = j + d - 0.5 * Math.sin(d) * Math.exp(-d * d);
    const slow = Math.exp(-d * d * 3);
    ctx.strokeStyle = mix(col.success, col.danger, slow);
    ctx.lineWidth = Math.max(6, R * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, R, a - 0.06, a + 0.06);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

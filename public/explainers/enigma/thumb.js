// The Enigma machine: the index card's picture. Three rotor windows ticking
// over as a key is pressed again and again, and the lamp it lights.

import { TOKENS, box, label, setFace } from '../shared/draw.js';
import { machine } from './machine.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  setFace(col['font-text']);
  const n = Math.floor(t / 0.9) % 40;
  const m = machine({ start: 'ADS' });
  let lit = '';
  for (let i = 0; i <= n; i++) lit = m.press('A').out;
  const s = Math.min(w / 6, h / 3), gap = s * 0.2;
  const x0 = (w - 3 * s - 2 * gap) / 2, y0 = h * 0.42 - s * 0.6;
  [...m.window].forEach((L, i) => {
    const x = x0 + i * (s + gap);
    box(ctx, x, y0, s, s * 1.2, s * 0.12);
    ctx.fillStyle = col.stock;
    ctx.fill();
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    label(ctx, L, x + s / 2, y0 + s * 0.6, col['stock-ink'], null, { size: s * 0.6, weight: 800, align: 'center', mono: true });
  });
  // The lamp.
  const ly = y0 + s * 1.2 + s * 0.55, r = s * 0.32;
  ctx.beginPath();
  ctx.arc(w / 2, ly, r, 0, Math.PI * 2);
  ctx.fillStyle = col.accent;
  ctx.fill();
  label(ctx, lit, w / 2, ly, col['stock-ink'], null, { size: r * 1.1, weight: 800, align: 'center', mono: true });
}

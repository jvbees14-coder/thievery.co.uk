// ---------------------------------------------------------------------------
// The house edge: a roulette wheel, and bets on it.
//
// The European wheel: 37 pockets, 0 to 36, in their real order round the
// wheel, with the real reds. A bet on red pays even money and wins on 18 of
// the 37; a bet on one number pays 35 to 1 and wins on 1 of 37. Both lose,
// on average, one stake in 37. The American wheel adds a 00.
// ---------------------------------------------------------------------------

import { TAU, alpha } from '../engine.js';

export const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const spin = (pockets = 37, rand = Math.random) => Math.floor(rand() * pockets);
/** Net winnings of a one-unit bet on red, on a wheel with `pockets` pockets (37 or 38). */
export function redBet(pockets = 37, rand = Math.random) {
  const n = spin(pockets, rand);
  if (n >= 37) return -1;            // 00
  return REDS.has(n) ? 1 : -1;
}

export function drawWheel(ctx, cx, cy, R, col, angle, ball) {
  const n = ORDER.length, seg = TAU / n;
  for (let i = 0; i < n; i++) {
    const a0 = angle + i * seg - Math.PI / 2;
    const num = ORDER[i];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0, a0 + seg);
    ctx.closePath();
    ctx.fillStyle = num === 0 ? col.success : REDS.has(num) ? col['stock-red'] : col['stock-ink'];
    ctx.fill();
    if (R > 70) {
      const m = a0 + seg / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(m) * R * 0.86, cy + Math.sin(m) * R * 0.86);
      ctx.rotate(m + Math.PI / 2);
      ctx.fillStyle = col.stock;
      ctx.font = `700 ${Math.max(8, R * 0.07)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), 0, 0);
      ctx.restore();
    }
  }
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.66, 0, TAU);
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fill();
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.strokeStyle = alpha(col.accent, 0.8);
  ctx.lineWidth = 3;
  ctx.stroke();
  if (ball != null) {
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ball) * R * 0.74, cy + Math.sin(ball) * R * 0.74, Math.max(3, R * 0.045), 0, TAU);
    ctx.fillStyle = col.stock;
    ctx.fill();
  }
}

/** Where the ball must sit, at wheel angle `angle`, to be in pocket `num`. */
export function ballAt(num, angle) {
  const i = ORDER.indexOf(num);
  return angle + (i + 0.5) * (TAU / ORDER.length) - Math.PI / 2;
}

// ---------------------------------------------------------------------------
// The mechanical watch: its parts, drawn.
//
// A balance wheel on a hairspring, swinging at 4 Hz (28,800 beats an hour)
// through about 270 degrees each way; a lever (the pallet fork) that it
// flicks from side to side as it passes the middle; and a 15-tooth escape
// wheel that the fork lets forward half a tooth at a time. The shapes are
// simplified, the motions are the real ones: one escape step per beat.
// ---------------------------------------------------------------------------

import { TAU, alpha } from '../engine.js';
import { mix } from '../shared/draw.js';

export const HZ = 4;
export const AMPLITUDE = (270 * Math.PI) / 180;
export const TEETH = 15;

/** A spur gear: a disc with teeth, turned by `angle`. */
export function gear(ctx, x, y, r, teeth, angle, col, ink, { spokes = 4, hub = 0.18 } = {}) {
  const depth = Math.min(r * 0.12, 6);
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = angle + (i / teeth) * TAU;
    const a1 = a0 + (0.5 / teeth) * TAU;
    const pts = [
      [a0, r - depth], [a0 + (0.08 / teeth) * TAU, r], [a1 - (0.08 / teeth) * TAU, r], [a1, r - depth],
    ];
    for (const [a, rr] of pts) {
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0 && a === a0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fillStyle = mix(ink, col['hiw-scene-bg'], 0.35);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.stroke();
  // Cut-outs between the spokes.
  ctx.fillStyle = col['hiw-scene-bg'];
  for (let s = 0; s < spokes; s++) {
    const a = angle + (s / spokes) * TAU + TAU / spokes / 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a - 0.5) * r * 0.3, y + Math.sin(a - 0.5) * r * 0.3);
    ctx.arc(x, y, r * 0.72, a - TAU / spokes / 2 + 0.25, a + TAU / spokes / 2 - 0.25);
    ctx.lineTo(x + Math.cos(a + 0.5) * r * 0.3, y + Math.sin(a + 0.5) * r * 0.3);
    ctx.closePath();
    if (r > 18) ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, Math.max(2, r * hub), 0, TAU);
  ctx.fillStyle = col['hiw-ink-2'];
  ctx.fill();
}

/** The escape wheel: 15 club teeth, leaning the way it turns. */
export function escapeWheel(ctx, x, y, r, angle, col) {
  ctx.beginPath();
  for (let i = 0; i < TEETH; i++) {
    const a = angle + (i / TEETH) * TAU;
    const b = a + (0.62 / TEETH) * TAU;
    const root = r * 0.72;
    ctx.lineTo(x + Math.cos(a) * root, y + Math.sin(a) * root);
    ctx.lineTo(x + Math.cos(a + 0.06) * r, y + Math.sin(a + 0.06) * r);
    ctx.lineTo(x + Math.cos(a + 0.16) * r * 0.97, y + Math.sin(a + 0.16) * r * 0.97);
    ctx.lineTo(x + Math.cos(b) * root, y + Math.sin(b) * root);
  }
  ctx.closePath();
  ctx.fillStyle = mix(col.accent, col['hiw-scene-bg'], 0.3);
  ctx.fill();
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, 0, TAU);
  ctx.fillStyle = col['hiw-scene-bg'];
  ctx.fill();
  ctx.strokeStyle = col.accent;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, Math.max(2, r * 0.1), 0, TAU);
  ctx.fillStyle = col['hiw-ink-2'];
  ctx.fill();
}

/** The balance: a rim on spokes, the hairspring coiled at its centre. */
export function balance(ctx, x, y, r, angle, col) {
  // The hairspring, wound tighter or looser as the balance turns.
  ctx.beginPath();
  const coils = 6, wind = angle / AMPLITUDE;
  for (let i = 0; i <= 240; i++) {
    const t = i / 240;
    const a = t * coils * TAU * (1 + wind * 0.08) + angle * 0.2;
    const rr = r * (0.1 + t * 0.48);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.9);
  ctx.lineWidth = 1;
  ctx.stroke();
  // The rim and its arms.
  ctx.lineWidth = Math.max(3, r * 0.1);
  ctx.strokeStyle = col.accent;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = Math.max(2, r * 0.05);
  for (const s of [0, Math.PI]) {
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle + s) * r * 0.62, y + Math.sin(angle + s) * r * 0.62);
    ctx.lineTo(x + Math.cos(angle + s) * r, y + Math.sin(angle + s) * r);
    ctx.stroke();
  }
  // Screws round the rim, which show it turning.
  for (let i = 0; i < 8; i++) {
    const a = angle + (i / 8) * TAU;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, Math.max(1.5, r * 0.05), 0, TAU);
    ctx.fillStyle = col['accent-strong'];
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, Math.max(2, r * 0.07), 0, TAU);
  ctx.fillStyle = col['hiw-ink-2'];
  ctx.fill();
}

/**
 * The pallet fork, pivoted at (px, py) between the escape wheel (centre
 * ex, ey, radius er) and the balance at (bx, by). Its two jewelled pallets
 * straddle the top of the escape wheel; as the fork tips (`tilt`, -1 to 1)
 * one pallet dips between the teeth and the other lifts clear. Its tail
 * reaches the balance's roller.
 */
export function fork(ctx, px, py, ex, ey, er, bx, by, br, tilt, col) {
  const toPivot = Math.atan2(py - ey, px - ex);
  const stones = [-1, 1].map((s) => {
    const a = toPivot + s * 0.62;
    const dip = 0.5 + 0.5 * s * tilt;
    const r = er * (1.08 - dip * 0.16);
    return [ex + Math.cos(a) * r, ey + Math.sin(a) * r];
  });
  const tailDir = Math.atan2(by - py, bx - px) + tilt * 0.12;
  const tailLen = Math.hypot(bx - px, by - py) - br * 0.32;
  const tx = px + Math.cos(tailDir) * tailLen, ty = py + Math.sin(tailDir) * tailLen;
  ctx.strokeStyle = col['label-secondary'];
  ctx.lineWidth = Math.max(2, er * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [sx, sy] of stones) {
    ctx.moveTo(px, py);
    ctx.lineTo(sx, sy);
  }
  ctx.moveTo(px, py);
  ctx.lineTo(tx, ty);
  // The horns the balance's pin knocks.
  const n = tailDir + Math.PI / 2;
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx + Math.cos(tailDir) * er * 0.12 + Math.cos(n) * er * 0.1, ty + Math.sin(tailDir) * er * 0.12 + Math.sin(n) * er * 0.1);
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx + Math.cos(tailDir) * er * 0.12 - Math.cos(n) * er * 0.1, ty + Math.sin(tailDir) * er * 0.12 - Math.sin(n) * er * 0.1);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = col.danger;
  for (const [sx, sy] of stones) {
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(2.5, er * 0.08), 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(px, py, Math.max(2, er * 0.07), 0, TAU);
  ctx.fillStyle = col['hiw-ink-2'];
  ctx.fill();
}

/** A watch face with three hands, times in seconds. */
export function dial(ctx, x, y, r, seconds, col) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = col.stock;
  ctx.fill();
  ctx.strokeStyle = col['stock-edge'];
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    const long = i % 5 === 0;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(a) * r * (long ? 0.82 : 0.88), y - Math.cos(a) * r * (long ? 0.82 : 0.88));
    ctx.lineTo(x + Math.sin(a) * r * 0.94, y - Math.cos(a) * r * 0.94);
    ctx.strokeStyle = col['stock-ink'];
    ctx.lineWidth = long ? 2 : 1;
    ctx.stroke();
  }
  const hand = (frac, len, width, ink) => {
    const a = frac * TAU;
    ctx.beginPath();
    ctx.moveTo(x - Math.sin(a) * r * 0.12, y + Math.cos(a) * r * 0.12);
    ctx.lineTo(x + Math.sin(a) * r * len, y - Math.cos(a) * r * len);
    ctx.strokeStyle = ink;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
  };
  hand((seconds / 43200) % 1, 0.5, Math.max(3, r * 0.06), col['stock-ink']);
  hand((seconds / 3600) % 1, 0.75, Math.max(2, r * 0.04), col['stock-ink']);
  hand((seconds / 60) % 1, 0.85, 1.25, col['stock-red']);
  ctx.beginPath();
  ctx.arc(x, y, Math.max(2, r * 0.04), 0, TAU);
  ctx.fillStyle = col['stock-red'];
  ctx.fill();
}

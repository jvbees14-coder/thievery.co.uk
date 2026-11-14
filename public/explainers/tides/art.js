// ---------------------------------------------------------------------------
// Tides: the Earth seen from above the North Pole, its water, and the Moon.
//
// The water is the equilibrium tide, the shape the oceans would take if
// the Earth were all ocean and the water could keep up: two bulges, one
// towards the Moon and one away, plus a smaller pair (46% as strong) from
// the Sun. Its height is drawn hundreds of thousands of times too big;
// the real bulges are about half a metre.
// ---------------------------------------------------------------------------

import { TAU, alpha } from '../engine.js';
import { landDots } from '../shared/earth.js';

export const HOURS = {
  spin: 23.9345,        // a sidereal day
  moon: 27.3217 * 24,   // the Moon once round the Earth, against the stars
  year: 365.256 * 24,
};
export const SUN_SHARE = 0.46;   // the Sun's tidal pull as a share of the Moon's
export const LONDON = { lat: 51.5, lon: -0.13 };

export function angles(hours) {
  return {
    spin: (TAU * hours) / HOURS.spin,
    moon: (TAU * hours) / HOURS.moon + 0.7,
    sun: (TAU * hours) / HOURS.year + Math.PI,
  };
}

/** The equilibrium tide at an angle round the equator, in Moon-units. */
export function tideAt(phi, a, sun = true) {
  return Math.cos(2 * (phi - a.moon)) + (sun ? SUN_SHARE * Math.cos(2 * (phi - a.sun)) : 0);
}

/**
 * The Earth from above the North Pole, turned by `spin`, with the water
 * round it bulging by `bulge` (0 for none). Returns the centre and radius.
 */
export function drawEarth(ctx, cx, cy, R, col, a, { bulge = 0, sun = true, spin = true } = {}) {
  const s = spin ? a.spin : 0;
  if (bulge > 0) {
    ctx.beginPath();
    for (let i = 0; i <= 180; i++) {
      const phi = (i / 180) * TAU;
      const r = R * (1.08 + bulge * 0.06 * tideAt(phi, a, sun));
      const x = cx + Math.cos(phi) * r, y = cy - Math.sin(phi) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = alpha(col['hiw-ink-1'], 0.32);
    ctx.fill();
    ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.8);
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
  g.addColorStop(0, col['bg-elevated-2']);
  g.addColorStop(1, col.bg);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.14);
  ctx.fill();
  const dots = landDots(R > 120 ? 1.8 : 2.6);
  const cs = Math.cos(s), sn = Math.sin(s);
  const size = Math.max(1, Math.min(2.2, R / 60));
  ctx.fillStyle = alpha(col.accent, 0.75);
  for (let i = 0; i < dots.length; i += 4) {
    if (dots[i + 2] < 0) continue;
    const x = dots[i] * cs - dots[i + 1] * sn, y = dots[i] * sn + dots[i + 1] * cs;
    ctx.fillRect(cx + x * R - size / 2, cy - y * R - size / 2, size, size);
  }
  ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();
}

/** The Moon, at angle `ang` and distance `d` from the centre. */
export function drawMoon(ctx, cx, cy, d, ang, r, col, a) {
  const x = cx + Math.cos(ang) * d, y = cy - Math.sin(ang) * d;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = col['label-secondary'];
  ctx.fill();
  // The half facing the Sun is lit.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.clip();
  ctx.fillStyle = col.bg;
  const off = Math.cos(a.sun) * r, offy = -Math.sin(a.sun) * r;
  ctx.beginPath();
  ctx.arc(x - off * 1.0, y - offy * 1.0, r * 1.02, 0, TAU);
  ctx.globalAlpha *= 0.65;
  ctx.fill();
  ctx.restore();
  return [x, y];
}

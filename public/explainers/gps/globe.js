// ---------------------------------------------------------------------------
// GPS: the Earth and the constellation, in three dimensions.
//
// Drawn on its own so that three things can share it: the explainer's first
// two chapters, the moving thumbnail on /how-it-works, and the share picture
// (scripts/og-explainers.mjs). It holds no state of its own; the caller
// says what time it is and where the camera is.
//
// Everything is to scale. The Earth is 6,371 km in radius and every orbit
// is a circle 26,560 km from its centre, which is why the Earth looks small:
// it is small, next to the orbits. The six orbital planes are 60 degrees
// apart and tipped 55 degrees to the equator, which is the shape of the
// real constellation; where each satellite sits in its plane is spread out
// evenly rather than copied from an almanac.
//
// Projection is orthographic, which keeps every circle a circle and a
// sphere's outline a circle too. That is what lets the next chapter draw a
// signal's wavefront as a plain ring.
// ---------------------------------------------------------------------------

import { TAU, alpha } from '../engine.js';
import { landDots } from '../shared/earth.js';

export const RE = 6371;               // km, the Earth's mean radius
export const A = 26560;               // km, a GPS orbit's radius (its semi-major axis)
export const C = 299792.458;          // km/s, the speed of light, exact by definition
export const SIDEREAL_DAY = 86164.0905; // s, once round against the stars
export const PERIOD = SIDEREAL_DAY / 2; // s, 11 h 58 min 2 s: two orbits a sidereal day
export const SPEED = (TAU * A) / PERIOD; // km/s, about 3.87
const INCL = (55 * Math.PI) / 180;

// Thirty-two satellites over six planes: the operational count since April
// 2026. Four to a plane is the 24-slot baseline; the rest are the spares
// that fill out the planes.
const PER_PLANE = [6, 5, 5, 6, 5, 5];
export const SATS = [];
{
  const prns = [7, 12, 3, 25, 18, 30, 1, 14, 22, 9, 27, 5, 16, 31, 11, 2, 20, 8, 29, 13, 24, 4, 17, 32, 10, 21, 6, 26, 15, 19, 28, 23];
  let i = 0;
  PER_PLANE.forEach((n, p) => {
    for (let k = 0; k < n; k++) {
      SATS.push({ plane: p, node: (p * TAU) / 6, u0: (k * TAU) / n + p * 0.52, prn: prns[i++] });
    }
  });
}

/** A satellite's position, in km, in a frame fixed to the stars. */
export function satAt(s, t) {
  const u = s.u0 + (TAU * t) / PERIOD;
  const cu = Math.cos(u), su = Math.sin(u), cn = Math.cos(s.node), sn = Math.sin(s.node);
  const ci = Math.cos(INCL), si = Math.sin(INCL);
  return [A * (cn * cu - sn * su * ci), A * (sn * cu + cn * su * ci), A * su * si];
}

/** A place on the ground, in the same frame: it turns with the Earth. */
export function groundAt(latDeg, lonDeg, t) {
  const lat = (latDeg * Math.PI) / 180;
  const th = (lonDeg * Math.PI) / 180 + (TAU * t) / SIDEREAL_DAY;
  return [RE * Math.cos(lat) * Math.cos(th), RE * Math.cos(lat) * Math.sin(th), RE * Math.sin(lat)];
}

/** How high a satellite stands above a place's horizon, in radians. */
export function elevation(sat, ground) {
  const d = [sat[0] - ground[0], sat[1] - ground[1], sat[2] - ground[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  return Math.asin((d[0] * ground[0] + d[1] * ground[1] + d[2] * ground[2]) / (len * RE));
}

export function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Where a point lands on screen: [x, y, depth], depth positive towards the
 * viewer. The camera turns about the pole (yaw), then tips the north pole
 * towards the viewer (pitch).
 */
export function project(cam, p) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const x1 = p[0] * cy + p[1] * sy;
  const y1 = -p[0] * sy + p[1] * cy;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const y2 = y1 * cp - p[2] * sp;
  const z2 = y1 * sp + p[2] * cp;
  return [cam.cx + x1 * cam.scale, cam.cy - z2 * cam.scale, -y2];
}

/** True if the Earth is between the viewer and this projected point. */
export function hidden(cam, q) {
  if (q[2] >= 0) return false;
  const dx = q[0] - cam.cx, dy = q[1] - cam.cy;
  return dx * dx + dy * dy < (RE * cam.scale) ** 2;
}

/** A camera that fits the orbits into a w by h box. */
export function fit(w, h, yaw, pitch = 0.36, margin = 1.1) {
  return { cx: w / 2, cy: h / 2, scale: Math.min(w, h) / 2 / (A * margin), yaw, pitch };
}

// --- drawing ------------------------------------------------------------------------

const RING = 120;
const ringCache = new Map();
function orbitPoints(plane) {
  if (ringCache.has(plane)) return ringCache.get(plane);
  const s = SATS.find((x) => x.plane === plane);
  const pts = [];
  for (let i = 0; i <= RING; i++) pts.push(satAt({ ...s, u0: (i * TAU) / RING }, 0));
  ringCache.set(plane, pts);
  return pts;
}

function orbits(ctx, cam, ink, front, strength) {
  ctx.beginPath();
  for (let p = 0; p < 6; p++) {
    const pts = orbitPoints(p).map((x) => project(cam, x));
    for (let i = 0; i < RING; i++) {
      const a = pts[i], b = pts[i + 1];
      const isFront = a[2] + b[2] > 0;
      if (isFront !== front) continue;
      if (!front && (hidden(cam, a) || hidden(cam, b))) continue;
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
  }
  ctx.strokeStyle = alpha(ink, front ? 0.3 * strength : 0.12 * strength);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** A satellite: a soft glow round a bright point. */
export function satDot(ctx, x, y, ink, size = 1, glow = 1) {
  if (glow > 0) {
    const r = 11 * size;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, alpha(ink, 0.55 * glow));
    g.addColorStop(1, alpha(ink, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.beginPath();
  ctx.arc(x, y, 2.4 * size, 0, TAU);
  ctx.fillStyle = ink;
  ctx.fill();
}

function earth(ctx, cam, t, col) {
  const R = RE * cam.scale;
  const { cx, cy } = cam;

  // The air: a thin halo, brightest at the limb.
  const halo = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.22);
  halo.addColorStop(0, alpha(col.sea, 0.35));
  halo.addColorStop(1, alpha(col.sea, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.22, 0, TAU);
  ctx.fill();

  // The body, lit from the upper left.
  const body = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx, cy, R);
  body.addColorStop(0, col.earthLit);
  body.addColorStop(1, col.earthDark);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  const sea = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, 0, cx, cy, R);
  sea.addColorStop(0, alpha(col.sea, 0.32));
  sea.addColorStop(1, alpha(col.sea, 0.08));
  ctx.fillStyle = sea;
  ctx.fill();

  // The land, as dots that turn with the Earth: the front half only, and
  // fainter towards the edge of the disc, where they crowd together.
  if (R > 10) {
    const dots = landDots(R > 140 ? 1.6 : R > 70 ? 2.2 : 3.2);
    const spin = (TAU * t) / SIDEREAL_DAY;
    const cs = Math.cos(spin), sn = Math.sin(spin);
    const size = Math.max(1, Math.min(2.4, R / 70));
    const p = [0, 0, 0];
    ctx.fillStyle = alpha(col.land, 0.8);
    for (let i = 0; i < dots.length; i += 4) {
      p[0] = (dots[i] * cs - dots[i + 1] * sn) * RE;
      p[1] = (dots[i] * sn + dots[i + 1] * cs) * RE;
      p[2] = dots[i + 2] * RE;
      const q = project(cam, p);
      if (q[2] < RE * 0.08) continue;
      ctx.fillRect(q[0] - size / 2, q[1] - size / 2, size, size);
    }
  }

  // Lines of latitude and longitude, which turn with the Earth: the front
  // half only, so the globe reads as solid.
  if (R > 14) {
    ctx.beginPath();
    const spin = (TAU * t) / SIDEREAL_DAY;
    const seg = (pts) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (a[2] < 0 || b[2] < 0) continue;
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
    };
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      for (let i = 0; i <= 72; i++) {
        const th = (i * TAU) / 72;
        const c = Math.cos((lat * Math.PI) / 180), s = Math.sin((lat * Math.PI) / 180);
        pts.push(project(cam, [RE * c * Math.cos(th), RE * c * Math.sin(th), RE * s]));
      }
      seg(pts);
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const pts = [];
      const th = (lon * Math.PI) / 180 + spin;
      for (let i = 0; i <= 36; i++) {
        const la = -Math.PI / 2 + (i * Math.PI) / 36;
        pts.push(project(cam, [RE * Math.cos(la) * Math.cos(th), RE * Math.cos(la) * Math.sin(th), RE * Math.sin(la)]));
      }
      seg(pts);
    }
    ctx.strokeStyle = alpha(col.grid, 0.22);
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }

  // Night: the side away from the Sun, which is fixed against the stars
  // while the Earth turns under it.
  const sun = project(cam, [RE * 3, -RE * 2, RE * 0.6]);
  const dx = sun[0] - cx, dy = sun[1] - cy;
  const len = Math.hypot(dx, dy) || 1;
  const night = ctx.createLinearGradient(cx + (dx / len) * R, cy + (dy / len) * R, cx - (dx / len) * R, cy - (dy / len) * R);
  night.addColorStop(0, alpha(col.shade, 0));
  night.addColorStop(0.45, alpha(col.shade, 0));
  night.addColorStop(1, alpha(col.shade, 0.5));
  ctx.fillStyle = night;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = alpha(col.sea, 0.6);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * The whole picture. `col` is { earthLit, earthDark, sea, grid, shade, sat,
 * orbit }. `opts.highlight` is a Set of satellite indexes to draw larger;
 * `opts.dim` fades the rest. Returns every satellite's projected position,
 * so the caller can draw on top of them.
 */
export function drawGlobe(ctx, cam, t, col, opts = {}) {
  const { highlight = null, dim = 0, strength = 1 } = opts;
  const placed = SATS.map((s) => project(cam, satAt(s, t)));
  const base = ctx.globalAlpha;

  orbits(ctx, cam, col.orbit, false, strength);
  placed.forEach((q, i) => {
    if (q[2] >= 0 || hidden(cam, q)) return;
    const on = highlight?.has(i);
    satDot(ctx, q[0], q[1], on ? col.highlight : col.sat, on ? 1.1 : 0.8, (on ? 0.9 : 0.4) * (1 - dim * 0.6));
  });
  earth(ctx, cam, t, col);
  orbits(ctx, cam, col.orbit, true, strength);
  placed.forEach((q, i) => {
    if (q[2] < 0) return;
    const on = highlight?.has(i);
    ctx.globalAlpha = base * (on ? 1 : 1 - dim * 0.7);
    satDot(ctx, q[0], q[1], on ? col.highlight : col.sat, on ? 1.25 : 1, on ? 1 : 0.8);
    ctx.globalAlpha = base;
  });
  return placed;
}

/** The inks, out of the site's tokens as the engine reads them. */
export function inks(c) {
  return {
    earthLit: c['bg-elevated-2'],
    earthDark: c.bg,
    sea: c['hiw-ink-1'],
    grid: c.ornament,
    shade: c.bg,
    sat: c.accent,
    highlight: c['accent-strong'],
    land: c['hiw-ink-1'],
    orbit: c['label-secondary'],
  };
}
export const TOKENS = ['bg', 'bg-elevated', 'bg-elevated-2', 'hiw-scene-bg', 'hiw-ink-1', 'hiw-ink-2', 'hiw-ink-3', 'hiw-ink-4', 'ornament', 'accent', 'accent-strong', 'label', 'label-secondary', 'label-tertiary', 'separator', 'separator-strong', 'danger', 'success', 'focus-ring', 'font-text'];

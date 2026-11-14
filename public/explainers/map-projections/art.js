// ---------------------------------------------------------------------------
// Map projections: the formulas, and the world drawn through them.
//
// Every projection here takes longitude and latitude in radians and gives
// x and y in its own units; `fit` scales the result into a box. The land
// is Natural Earth's (shared/land.js). Mercator is cut off at 82 degrees,
// because it runs to infinity at the poles.
// ---------------------------------------------------------------------------

import { TAU, alpha } from '../engine.js';
import { landRings } from '../shared/earth.js';

const D = Math.PI / 180;
const MERC_LIMIT = 82 * D;

function mollweideTheta(phi) {
  let t = phi;
  for (let i = 0; i < 12; i++) {
    const f = 2 * t + Math.sin(2 * t) - Math.PI * Math.sin(phi);
    const d = 2 + 2 * Math.cos(2 * t);
    if (Math.abs(d) < 1e-9) break;
    t -= f / d;
  }
  return t;
}

const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = -0.003796;

export const PROJECTIONS = {
  mercator: {
    name: 'Mercator',
    f: (l, p) => [l, Math.log(Math.tan(Math.PI / 4 + Math.max(-MERC_LIMIT, Math.min(MERC_LIMIT, p)) / 2))],
    inverse: (x, y) => [x, 2 * Math.atan(Math.exp(y)) - Math.PI / 2],
  },
  plate: {
    name: 'Equirectangular',
    f: (l, p) => [l, p],
    inverse: (x, y) => [x, y],
  },
  mollweide: {
    name: 'Mollweide',
    f: (l, p) => {
      const t = mollweideTheta(p);
      return [((2 * Math.SQRT2) / Math.PI) * l * Math.cos(t), Math.SQRT2 * Math.sin(t)];
    },
  },
  equalEarth: {
    name: 'Equal Earth',
    f: (l, p) => {
      const t = Math.asin((Math.sqrt(3) / 2) * Math.sin(p));
      const t2 = t * t, t6 = t2 * t2 * t2;
      return [
        (2 * Math.sqrt(3) * l * Math.cos(t)) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1)),
        A4 * t6 * t2 * t + A3 * t6 * t + A2 * t2 * t + A1 * t,
      ];
    },
  },
};

/** The box a projection's whole world fills, worked out by sampling its edge. */
const bounds = new Map();
export function boundsOf(id) {
  if (bounds.has(id)) return bounds.get(id);
  const f = PROJECTIONS[id].f;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i <= 90; i++) {
    for (const [l, p] of [[-Math.PI, -Math.PI / 2 + (i / 90) * Math.PI], [Math.PI, -Math.PI / 2 + (i / 90) * Math.PI], [-Math.PI + (i / 90) * TAU, 0]]) {
      const [x, y] = f(l, p);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const b = { x0, x1, y0, y1 };
  bounds.set(id, b);
  return b;
}

/** A projection fitted into a w by h box, returning screen coordinates. */
export function fitted(id, w, h, pad = 12) {
  const b = boundsOf(id);
  const s = Math.min((w - pad * 2) / (b.x1 - b.x0), (h - pad * 2) / (b.y1 - b.y0));
  const ox = w / 2 - ((b.x0 + b.x1) / 2) * s, oy = h / 2 + ((b.y0 + b.y1) / 2) * s;
  const f = PROJECTIONS[id].f;
  const inv = PROJECTIONS[id].inverse;
  return {
    s,
    to: (l, p) => {
      const [x, y] = f(l, p);
      return [ox + x * s, oy - y * s];
    },
    from: inv ? (sx, sy) => inv((sx - ox) / s, (oy - sy) / s) : null,
  };
}

// --- moving a country about on the sphere ---------------------------------------------

const vec = (l, p) => [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
const ll = (v) => [Math.atan2(v[1], v[0]), Math.asin(Math.max(-1, Math.min(1, v[2])))];

/**
 * A rotation of the sphere carrying point a to point b (both [lon, lat]),
 * so a country can be slid across the globe keeping its true shape and
 * size, then drawn through any projection.
 */
export function carry(from, to) {
  const a = vec(...from), b = vec(...to);
  const k = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const s = Math.hypot(...k), c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (s < 1e-9) return (p) => p;
  const u = k.map((x) => x / s);
  return ([l, p]) => {
    const v = vec(l, p);
    const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const x = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    return ll(v.map((vi, i) => vi * c + x[i] * s + u[i] * d * (1 - c)));
  };
}

/** The land as rings of [lon, lat] in radians, worked out once. */
let RINGS = null;
export function rings() {
  if (!RINGS) RINGS = landRings().map((r) => r.map(([l, p]) => [l * D, p * D]));
  return RINGS;
}
/** The ring that holds a point: Greenland, Australia. */
export function ringAt(lonDeg, latDeg) {
  const all = landRings();
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    let hit = false;
    for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
      const [xa, ya] = r[a], [xb, yb] = r[b];
      if (ya > latDeg !== yb > latDeg && lonDeg < ((xb - xa) * (latDeg - ya)) / (yb - ya) + xa) hit = !hit;
    }
    if (hit) return rings()[i];
  }
  return null;
}

export function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2);
}

/** The world through `to` (a lon/lat to screen function). */
export function drawWorld(ctx, to, col, { skip = null, fill = null } = {}) {
  ctx.beginPath();
  for (const r of rings()) {
    if (r === skip) continue;
    r.forEach(([l, p], i) => {
      const [x, y] = to(l, p);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
  }
  ctx.fillStyle = fill || alpha(col.accent, 0.35);
  ctx.fill('evenodd');
  ctx.strokeStyle = alpha(col.accent, 0.8);
  ctx.lineWidth = 0.75;
  ctx.stroke();
}

/** Lines of latitude and longitude, every 30 degrees. */
export function drawGrid(ctx, to, col, latLimit = 90) {
  ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += 30) {
    for (let i = 0; i <= 60; i++) {
      const p = (-latLimit + (i / 60) * latLimit * 2) * D;
      const [x, y] = to(lon * D, p);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let i = 0; i <= 72; i++) {
      const [x, y] = to((-180 + i * 5) * D, lat * D);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
  }
  ctx.strokeStyle = alpha(col['label-secondary'], 0.22);
  ctx.lineWidth = 0.75;
  ctx.stroke();
}

/** Tissot's circles: the same small circle on the globe, everywhere, drawn through the map. */
export function drawTissot(ctx, to, col, radiusDeg = 6) {
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -150; lon <= 150; lon += 60) {
      const centre = [lon * D, lat * D];
      const turn = carry([0, Math.PI / 2], centre);
      ctx.beginPath();
      for (let i = 0; i <= 36; i++) {
        const a = (i / 36) * TAU;
        const p = turn([a, Math.PI / 2 - radiusDeg * D]);
        const [x, y] = to(p[0], p[1]);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = alpha(col['hiw-ink-2'], 0.35);
      ctx.fill();
      ctx.strokeStyle = col['hiw-ink-2'];
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

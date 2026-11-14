// ---------------------------------------------------------------------------
// How it works: the world's land, for any scene that draws the Earth.
//
// The outlines are in land.js (Natural Earth, simplified). A globe draws the
// land as a field of dots rather than filled shapes: a dot is either in
// front of the Earth or behind it, so nothing has to be clipped at the
// edge of the disc, and the dotted look suits the rest of the scene. A flat
// map draws the outlines themselves, through whatever projection it is
// showing.
// ---------------------------------------------------------------------------

import { LAND } from './land.js';

const DEG = Math.PI / 180;

/** The rings in degrees: [[lon, lat], ...] each. Worked out once. */
let rings = null;
export function landRings() {
  if (!rings) {
    rings = LAND.map((r) => {
      const out = [];
      for (let i = 0; i < r.length; i += 2) out.push([r[i] / 10, r[i + 1] / 10]);
      return out;
    });
  }
  return rings;
}

function inside(lon, lat, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
export function isLand(lon, lat) {
  for (const r of landRings()) if (inside(lon, lat, r)) return true;
  return false;
}

/**
 * Points on land, as unit vectors with longitude 0 along +x and the north
 * pole along +z, about `step` degrees apart in every direction (closer
 * together in longitude towards the poles would crowd them). Worked out
 * once per step, which takes a few tens of milliseconds.
 */
const dotCache = new Map();
export function landDots(step = 2.2) {
  if (dotCache.has(step)) return dotCache.get(step);
  const out = [];
  for (let lat = -88; lat <= 88; lat += step) {
    const c = Math.cos(lat * DEG);
    const n = Math.max(1, Math.round((360 * c) / step));
    for (let k = 0; k < n; k++) {
      const lon = -180 + ((k + (Math.round(lat / step) % 2) * 0.5) * 360) / n;
      if (!isLand(lon, lat)) continue;
      out.push([c * Math.cos(lon * DEG), c * Math.sin(lon * DEG), Math.sin(lat * DEG), lat]);
    }
  }
  const arr = new Float32Array(out.length * 4);
  out.forEach((p, i) => arr.set(p, i * 4));
  dotCache.set(step, arr);
  return arr;
}

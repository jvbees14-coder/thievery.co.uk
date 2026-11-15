// ---------------------------------------------------------------------------
// Rainbows: rays through a raindrop.
//
// A ray strikes a spherical drop at height b (0 at the middle, 1 at the
// edge), bends going in, reflects once off the back (twice for the second
// bow), and bends again coming out. With i the angle it strikes at and r the
// angle inside (sin i = n sin r), it comes back at 4r − 2i from the point
// directly opposite the Sun after one reflection, and 180° + 2i − 6r after
// two. Descartes worked this out in 1637. The refractive indices are water's
// for each colour.
// ---------------------------------------------------------------------------

const DEG = 180 / Math.PI;

/** Water's refractive index for each colour, red to violet, and the token each is drawn in. */
export const SPECTRUM = [
  { name: 'Red', n: 1.331, token: 'danger' },
  { name: 'Orange', n: 1.332, token: 'warning' },
  { name: 'Yellow', n: 1.3335, token: 'hiw-signal' },
  { name: 'Green', n: 1.335, token: 'success' },
  { name: 'Blue', n: 1.338, token: 'focus-ring' },
  { name: 'Violet', n: 1.343, token: 'hiw-ink-4' },
];
export const WATER = 1.333;

/** Angle from the point opposite the Sun, in degrees, after `k` reflections (1 or 2). */
export function bowAngle(b, n = WATER, k = 1) {
  const i = Math.asin(b), r = Math.asin(b / n);
  return k === 1 ? (4 * r - 2 * i) * DEG : 180 + (2 * i - 6 * r) * DEG;
}

/** The angle the rays bunch at: the most for one reflection, the least for two. */
export function bowOf(n = WATER, k = 1) {
  let best = k === 1 ? 0 : 999;
  for (let b = 0; b <= 1; b += 1e-4) {
    const a = bowAngle(b, n, k);
    best = k === 1 ? Math.max(best, a) : Math.min(best, a);
  }
  return best;
}

/**
 * A ray's path through a drop centred at (cx, cy), radius R, sunlight
 * travelling to the right. Returns the points [in, ...inside, out] and the
 * direction it leaves in (canvas radians).
 */
export function rayPath(cx, cy, R, b, n = WATER, k = 1) {
  const i = Math.asin(b), r = Math.asin(b / n);
  const s = k === 1 ? 1 : -1;                 // the second bow comes from the lower half
  let phi = Math.PI + s * i;
  const pts = [[cx + R * Math.cos(phi), cy + R * Math.sin(phi)]];
  for (let j = 0; j <= k; j++) {
    phi += s * (Math.PI - 2 * r);
    pts.push([cx + R * Math.cos(phi), cy + R * Math.sin(phi)]);
  }
  const dir = s * (2 * (i - r) + k * (Math.PI - 2 * r));
  return { pts, dir };
}

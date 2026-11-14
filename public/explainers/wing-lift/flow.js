// ---------------------------------------------------------------------------
// Wing lift: the air round an aerofoil, worked out exactly.
//
// The aerofoil is a Joukowski aerofoil: a circle, slightly off-centre,
// pushed through the map z = ζ + 1/ζ. Flow round a circle is known exactly
// (a uniform stream, a doublet and a vortex), and the map carries it to
// flow round the aerofoil. The vortex's strength, the circulation, is
// chosen so the air leaves the sharp trailing edge smoothly: the Kutta
// condition. This is ideal, inviscid flow. It is right about the shape of
// the flow and the lift before the stall, and knows nothing about the stall
// itself, which the scene adds by hand and says so.
//
// Complex numbers are [re, im].
// ---------------------------------------------------------------------------

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a, b) => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const expi = (t) => [Math.cos(t), Math.sin(t)];
const abs = (a) => Math.hypot(a[0], a[1]);
function csqrt(a) {
  const r = abs(a);
  const re = Math.sqrt((r + a[0]) / 2);
  const im = Math.sign(a[1] || 1) * Math.sqrt(Math.max(0, (r - a[0]) / 2));
  return [re, im];
}

export const MU = [-0.08, 0.08];           // the circle's centre: thickness and camber
export const RADIUS = Math.hypot(1 - MU[0], MU[1]);
export const CHORD = 4.0;                   // roughly, from about -2 to 2

/** The aerofoil's outline, in z. */
export function outline(n = 160) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const zeta = add(MU, mul([RADIUS, 0], expi((i / n) * Math.PI * 2)));
    pts.push(add(zeta, div([1, 0], zeta)));
  }
  return pts;
}

/** Circulation for angle of attack `alpha`, by the Kutta condition. */
export function circulation(alpha) {
  const t = sub([1, 0], MU);
  const w = sub(expi(-alpha), mul(div([RADIUS * RADIUS, 0], mul(t, t)), expi(alpha)));
  // Γ such that the velocity at the trailing edge (ζ = 1) is zero.
  const g = mul([0, 2 * Math.PI], mul(t, w));
  return g[0];
}

/** Which ζ a point z came from: the root outside the circle. */
function zetaOf(z) {
  const s = csqrt(sub(mul(z, z), [4, 0]));
  const a = mul([0.5, 0], add(z, s)), b = mul([0.5, 0], sub(z, s));
  return abs(sub(a, MU)) >= abs(sub(b, MU)) ? a : b;
}

/**
 * The air's velocity at z, for a stream of speed 1 at angle `alpha`, as
 * [u, v]; null inside the aerofoil.
 */
export function velocity(z, alpha, gamma) {
  const zeta = zetaOf(z);
  const d = sub(zeta, MU);
  if (abs(d) < RADIUS * 1.0005) return null;
  const dF = add(sub(expi(-alpha), mul(div([RADIUS * RADIUS, 0], mul(d, d)), expi(alpha))), div([0, gamma / (2 * Math.PI)], d));
  const dz = sub([1, 0], div([1, 0], mul(zeta, zeta)));
  if (abs(dz) < 1e-6) return [0, 0];
  const w = div(dF, dz);
  return [w[0], -w[1]];
}

/** Lift coefficient from the circulation (Kutta-Joukowski), per unit chord. */
export const liftCoefficient = (gamma) => (2 * gamma) / CHORD;

/**
 * Streamlines for an angle of attack in degrees, from a column of starting
 * points well ahead of the wing, each in the oncoming air's own frame.
 * Worked out once per angle.
 */
const lineCache = new Map();
export function streamlines(alphaDeg, n = 17) {
  const key = `${alphaDeg}:${n}`;
  if (lineCache.has(key)) return lineCache.get(key);
  const a = (Math.min(alphaDeg, 15) * Math.PI) / 180;
  const g = circulation(a);
  const c = Math.cos(a), s = Math.sin(a);
  const out = [];
  for (let i = 0; i < n; i++) {
    const y0 = -1.7 + (3.4 * i) / (n - 1);
    // A start point level with the wing in the turned picture.
    let z = [-4.2 * c - y0 * s, -4.2 * s + y0 * c];
    const line = [z];
    for (let k = 0; k < 500; k++) {
      const v = velocity(z, a, g);
      if (!v) break;
      const sp = Math.hypot(v[0], v[1]) || 1;
      const step = 0.03 / Math.max(0.3, sp);
      const mid = [z[0] + v[0] * step * 0.5, z[1] + v[1] * step * 0.5];
      const v2 = velocity(mid, a, g) || v;
      z = [z[0] + v2[0] * step, z[1] + v2[1] * step];
      if (k % 3 === 0) line.push(z);
      if (z[0] * c + z[1] * s > 4.5) break;
    }
    out.push(line);
  }
  lineCache.set(key, out);
  return out;
}

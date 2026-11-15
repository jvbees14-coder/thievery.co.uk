// ---------------------------------------------------------------------------
// Orbits: Newton's cannonball.
//
// A ball fired sideways from a height above the Earth, pulled only by the
// Earth's gravity (no air), integrated a small step at a time. Kilometres
// and seconds throughout. GM for the Earth is 398,600 km³/s²; a circular
// orbit at radius r goes at √(GM/r); escape speed is √(2GM/r).
// ---------------------------------------------------------------------------

export const GM = 398600, R = 6371;
export const circular = (r) => Math.sqrt(GM / r);
export const escape = (r) => Math.sqrt((2 * GM) / r);
export const period = (r) => (2 * Math.PI * r) / circular(r);

/**
 * Fly a ball fired horizontally at `v` km/s from `h` km up. Returns the
 * path as [x, y] points and how it ended: 'ground', 'orbit' or 'escape'.
 */
export function fly(v, h = 300, maxTime = 6 * 3600) {
  let x = 0, y = R + h, vx = v, vy = 0, t = 0;
  const pts = [[x, y]];
  let angle = 0, prev = Math.atan2(x, y);
  const dt = 5;
  while (t < maxTime) {
    const r = Math.hypot(x, y), a = -GM / (r * r * r);
    vx += a * x * dt;
    vy += a * y * dt;
    x += vx * dt;
    y += vy * dt;
    t += dt;
    const now = Math.atan2(x, y);
    let d = now - prev;
    if (d < -Math.PI) d += 2 * Math.PI;
    if (d > Math.PI) d -= 2 * Math.PI;
    angle += d;
    prev = now;
    if (pts.length < 4000 && t % 20 === 0) pts.push([x, y]);
    if (Math.hypot(x, y) < R) return { pts: [...pts, [x, y]], end: 'ground', t };
    if (angle >= 2 * Math.PI) return { pts: [...pts, [x, y]], end: 'orbit', t };
    if (Math.hypot(x, y) > 12 * R) return { pts, end: 'escape', t };
  }
  return { pts, end: Math.hypot(vx, vy) > escape(Math.hypot(x, y)) ? 'escape' : 'orbit', t };
}

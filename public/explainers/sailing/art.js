// ---------------------------------------------------------------------------
// Sailing into the wind: the model, apart from drawing.
//
// A boat on a heading θ from the true wind (0 is straight into it), with a
// keel that lets it slide neither sideways nor back. Its speed is where the
// sail's push along the heading equals the hull's drag, k·v². The sail is
// trimmed to the apparent wind (the true wind minus the boat's own motion)
// and gives lift across it and drag along it, both growing with the
// apparent wind's speed squared. Lift needs the apparent wind at least
// LUFF degrees off the bow, or the sail just flaps; downwind, with the
// apparent wind behind, the sail is a drag sheet and pushes straight on.
// Units are knots for speeds; the constants were set so a boat reaches
// at about two thirds of the wind's speed. Kept apart from the scene so the
// figures on the page can be checked in Node.
// ---------------------------------------------------------------------------

export const LUFF = 28;
const CL = 1.25, CD = 0.25, SAIL = 0.03, HULL = 1;
const rad = (d) => (d * Math.PI) / 180;

/** The apparent wind seen from the boat: { speed, angle off the bow, in degrees }. */
export function apparent(W, heading, v) {
  // The true wind blows towards the boat from straight ahead when heading is 0.
  const t = rad(heading);
  const ax = W * Math.cos(t) + v; // along the heading, from ahead
  const ay = W * Math.sin(t); // across the boat
  return { speed: Math.hypot(ax, ay), angle: (Math.atan2(Math.abs(ay), ax) * 180) / Math.PI };
}

/** The forward push of the sail at boat speed v. */
export function push(W, heading, v) {
  const a = apparent(W, heading, v);
  const b = rad(a.angle);
  const q = SAIL * a.speed * a.speed;
  if (a.angle < LUFF) return -q * CD * Math.cos(b);
  // Lift acts at right angles to the apparent wind, drag along it; once the
  // wind is well behind, the lift fades and the sail is pushed bodily.
  const lift = CL * Math.min(1, Math.max(0, (180 - a.angle) / 60));
  const drag = CD + (1.1 - CD) * Math.max(0, (a.angle - 90) / 90);
  return q * (lift * Math.sin(b) - drag * Math.cos(b));
}

/** The boat's steady speed on a heading, in a true wind of W knots. */
export function speed(W, heading) {
  let lo = 0, hi = W * 2;
  if (push(W, heading, 0) <= 0) return 0;
  for (let i = 0; i < 60; i++) {
    const v = (lo + hi) / 2;
    if (push(W, heading, v) > HULL * v * v * 0.1) lo = v; else hi = v;
  }
  return lo;
}

/** Speed made good straight upwind on a heading. */
export const upwind = (W, heading) => speed(W, heading) * Math.cos(rad(heading));

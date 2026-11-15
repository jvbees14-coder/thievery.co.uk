// ---------------------------------------------------------------------------
// Earthquakes: the arithmetic.
//
// In the crust, P waves travel at about 6 km/s and S waves at about
// 3.5 km/s. The gap between their arrivals grows with distance:
// d = gap × vp·vs / (vp − vs), about 8.4 km for every second. Each step of
// magnitude is ten times the shaking on a seismometer and about 31.6 times
// the energy released.
// ---------------------------------------------------------------------------

export const VP = 6, VS = 3.5;
export const KM_PER_S = (VP * VS) / (VP - VS);
export const gapFor = (km) => km / VS - km / VP;
export const energyRatio = (steps) => 10 ** (1.5 * steps);

/** A seismogram's height at time t (s) for a station `km` away. */
export function trace(t, km, seed = 1) {
  const tp = km / VP, ts = km / VS;
  const wob = (k) => Math.sin(t * k + seed) * Math.sin(t * k * 0.37 + seed * 2);
  let y = 0.03 * wob(31);
  if (t > tp) y += 0.35 * Math.exp(-(t - tp) * 0.5) * wob(23);
  if (t > ts) y += 0.9 * Math.exp(-(t - ts) * 0.25) * wob(11);
  return y;
}

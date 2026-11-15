// ---------------------------------------------------------------------------
// The heat pump: the arithmetic.
//
// The refrigerant is propane (R290), which many new heat pumps use. Its
// boiling point at each pressure is read off its vapour-pressure table. The
// efficiency (the coefficient of performance, heat delivered per unit of
// electricity) is the ideal figure for the two temperatures the refrigerant
// runs at, times one half, which is roughly what good machines manage. The
// refrigerant runs 5 °C colder than the outdoor air and 5 °C hotter than
// the water it heats.
// ---------------------------------------------------------------------------

/** Propane: [°C, bar absolute], from its vapour-pressure table. */
export const PROPANE = [
  [-42.1, 1.013], [-30, 1.68], [-20, 2.44], [-10, 3.45], [0, 4.74], [10, 6.36],
  [20, 8.36], [30, 10.79], [40, 13.69], [50, 17.13], [60, 21.17],
];

/** Boiling point in °C at pressure p in bar, interpolating log pressure. */
export function boilsAt(p) {
  const L = Math.log(p);
  for (let i = 0; i < PROPANE.length - 1; i++) {
    const [t0, p0] = PROPANE[i], [t1, p1] = PROPANE[i + 1];
    if (p <= p1 || i === PROPANE.length - 2) {
      const f = (L - Math.log(p0)) / (Math.log(p1) - Math.log(p0));
      return t0 + f * (t1 - t0);
    }
  }
  return NaN;
}
/** Pressure in bar at which it boils at t °C. */
export function pressureFor(t) {
  for (let i = 0; i < PROPANE.length - 1; i++) {
    const [t0, p0] = PROPANE[i], [t1, p1] = PROPANE[i + 1];
    if (t <= t1 || i === PROPANE.length - 2) {
      const f = (t - t0) / (t1 - t0);
      return Math.exp(Math.log(p0) + f * (Math.log(p1) - Math.log(p0)));
    }
  }
  return NaN;
}

export const GAP = 5, SHARE = 0.5;
/** Heat delivered per unit of electricity, outdoors `air` °C, heating water to `flow` °C. */
export function cop(air, flow) {
  const cold = air - GAP + 273.15, hot = flow + GAP + 273.15;
  return Math.max(1, SHARE * (hot / (hot - cold)));
}

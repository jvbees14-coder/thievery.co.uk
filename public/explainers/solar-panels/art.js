// ---------------------------------------------------------------------------
// Solar panels: sunlight on a tilted panel through a clear day.
//
// The Sun's position from the usual formulas (declination by the cosine
// approximation, hour angle 15° an hour from solar noon). Direct sunlight
// on a clear day is Meinel's 1.353 × 0.7^(m^0.678) kW/m², with m the air
// mass (Kasten and Young). The panel faces due south, tilted `tilt`
// degrees, and gets the direct beam times the cosine of the angle it
// arrives at. Diffuse light from the rest of the sky and clouds are left
// out, so these are clear-sky figures for the direct beam only.
// ---------------------------------------------------------------------------

const D = Math.PI / 180;
export const declination = (day) => -23.44 * Math.cos((2 * Math.PI * (day + 10)) / 365);

export function airMass(elev) {
  return 1 / (Math.sin(elev * D) + 0.50572 * (elev + 6.07995) ** -1.6364);
}
export const beam = (elev) => (elev <= 0 ? 0 : 1353 * 0.7 ** (airMass(elev) ** 0.678));

/** Sun's elevation (degrees) at latitude `lat`, day of year, hour of solar time. */
export function elevation(lat, day, hour) {
  const d = declination(day) * D, H = 15 * (hour - 12) * D, p = lat * D;
  return Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H)) / D;
}

/** Direct sunlight on a south-facing panel tilted `tilt` degrees, W/m². */
export function onPanel(lat, day, hour, tilt) {
  const elev = elevation(lat, day, hour);
  if (elev <= 0) return 0;
  const d = declination(day) * D, H = 15 * (hour - 12) * D, q = (lat - tilt) * D;
  const cosI = Math.sin(d) * Math.sin(q) + Math.cos(d) * Math.cos(q) * Math.cos(H);
  return Math.max(0, cosI) * beam(elev);
}

/** kWh per square metre over the day. */
export function daily(lat, day, tilt) {
  let sum = 0;
  for (let t = 0; t < 24; t += 0.05) sum += onPanel(lat, day, t, tilt) * 0.05;
  return sum / 1000;
}

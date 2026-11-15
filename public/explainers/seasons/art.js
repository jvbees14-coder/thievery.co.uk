// ---------------------------------------------------------------------------
// The seasons: the arithmetic.
//
// The Sun's declination through the year (the usual cosine approximation,
// good to about a degree), the height of the noon Sun, the length of the day
// from the sunrise equation (no allowance for refraction, which adds a few
// minutes), and the Earth's distance from the Sun on its slightly oval orbit.
// ---------------------------------------------------------------------------

export const TILT = 23.44;
const R = Math.PI / 180;

/** The Sun's declination in degrees, on day `d` of the year (1 = 1 January). */
export const declination = (d) => -TILT * Math.cos((2 * Math.PI * (d + 10)) / 365);

/** Height of the noon Sun, in degrees, at latitude `lat`. */
export const noonHeight = (lat, d) => 90 - Math.abs(lat - declination(d));

/** Hours from sunrise to sunset. */
export function dayLength(lat, d) {
  const x = -Math.tan(lat * R) * Math.tan(declination(d) * R);
  if (x <= -1) return 24;
  if (x >= 1) return 0;
  return (2 * Math.acos(x)) / R / 15;
}

/** Distance from the Sun in millions of km; closest about 3 January. */
export const ECC = 0.0167, AU = 149.6;
export const distance = (d) => (AU * (1 - ECC * ECC)) / (1 + ECC * Math.cos((2 * Math.PI * (d - 3)) / 365.25));

export function dateOf(d) {
  return new Date(Date.UTC(2025, 0, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}
export const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

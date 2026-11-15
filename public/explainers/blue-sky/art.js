// ---------------------------------------------------------------------------
// Why the sky is blue: Rayleigh scattering.
//
// Air molecules scatter light in proportion to 1/λ⁴, so blue (450 nm) is
// scattered about 5.9 times as much as red (700 nm). Sunlight crossing the
// atmosphere loses a share e^(−τ·m) of each colour, where τ is the
// atmosphere's Rayleigh optical depth straight up (0.097 at 550 nm, scaled
// by 1/λ⁴) and m is the air mass, how many atmospheres thick the path is
// (Kasten and Young's formula, 38 at the horizon). Large particles such as
// cloud droplets scatter every colour about equally.
// ---------------------------------------------------------------------------

export const COLOURS = [
  { name: 'Violet', nm: 400, token: 'hiw-ink-4' },
  { name: 'Blue', nm: 450, token: 'focus-ring' },
  { name: 'Green', nm: 525, token: 'success' },
  { name: 'Yellow', nm: 575, token: 'hiw-signal' },
  { name: 'Orange', nm: 610, token: 'warning' },
  { name: 'Red', nm: 700, token: 'danger' },
];
export const TAU550 = 0.097;

/** Scattering relative to red, for particles whose law is 1/λ^p (p = 4 for molecules). */
export const scatter = (nm, p = 4) => (700 / nm) ** p;

/** Air mass for the Sun `h` degrees above the horizon (Kasten and Young, 1989). */
export function airMass(h) {
  return 1 / (Math.sin((Math.max(0, h) * Math.PI) / 180) + 0.50572 * (Math.max(0, h) + 6.07995) ** -1.6364);
}
/** Share of light of wavelength nm that crosses the atmosphere unscattered. */
export const through = (nm, m) => Math.exp(-TAU550 * (550 / nm) ** 4 * m);

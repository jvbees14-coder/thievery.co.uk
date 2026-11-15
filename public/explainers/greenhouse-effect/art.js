// ---------------------------------------------------------------------------
// The greenhouse effect: the one-layer model.
//
// Sunlight arrives at 1,361 W/m² face on, a quarter of that averaged over
// the turning globe; a share (the albedo, 0.3) is reflected. The rest must
// leave again as infrared, σT⁴ by the Stefan–Boltzmann law. With no air
// that fixes the ground at 255 K (−18 °C). Add one layer of air that
// absorbs a share ε of the ground's infrared and gives it out again, half
// up and half down, and the ground must warm until it balances:
// T = Te·(2 / (2 − ε))^¼. ε = 0.78 gives today's average of about 15 °C.
// ---------------------------------------------------------------------------

export const SOLAR = 1361, SIGMA = 5.670e-8;

export function balance(albedo = 0.3, eps = 0) {
  const absorbed = (SOLAR * (1 - albedo)) / 4;
  const Te = (absorbed / SIGMA) ** 0.25;
  const Ts = Te * (2 / (2 - eps)) ** 0.25;
  const up = SIGMA * Ts ** 4, air = eps * SIGMA * (Ts ** 4 / 2);
  return { incoming: SOLAR / 4, reflected: (SOLAR * albedo) / 4, absorbed, Ts, up, back: air, toSpace: (1 - eps) * up + air };
}

/** Equilibrium warming for a CO₂ level, at `S` °C per doubling from 280 ppm. */
export const warming = (ppm, S = 3) => S * Math.log2(ppm / 280);
export const C = (K) => K - 273.15;

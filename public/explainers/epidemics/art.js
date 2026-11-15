// ---------------------------------------------------------------------------
// Epidemics: the SIR model and a chain of infections.
//
// Kermack and McKendrick's model of 1927: everybody is susceptible (S),
// infectious (I) or recovered and immune (R). Each infectious person passes
// it on at a rate that, over the time they are infectious, gives R0 new
// cases in a population where everyone can catch it. The share who must be
// immune before it can no longer spread is 1 − 1/R0.
// ---------------------------------------------------------------------------

export const DAYS_ILL = 7;

/**
 * Run the model for `days`. `immune` is the share immune at the start (by
 * vaccination), `cut` the share by which contacts are reduced throughout.
 * Returns daily samples { s, i, r } as shares of the population.
 */
export function sir({ R0 = 3, immune = 0, cut = 0, days = 365, seed = 1e-4 } = {}) {
  const gamma = 1 / DAYS_ILL, beta = R0 * (1 - cut) * gamma;
  let s = 1 - immune - seed, i = seed, r = immune;
  const out = [{ s, i, r }];
  const dt = 0.05;
  for (let d = 1; d <= days; d++) {
    for (let k = 0; k < 1 / dt; k++) {
      const inf = beta * s * i * dt, rec = gamma * i * dt;
      s -= inf;
      i += inf - rec;
      r += rec;
    }
    out.push({ s, i, r });
  }
  return out;
}

export function summary(run, immune = 0) {
  let peak = 0, day = 0;
  run.forEach((p, d) => {
    if (p.i > peak) {
      peak = p.i;
      day = d;
    }
  });
  const last = run[run.length - 1];
  return { peak, day, total: last.r + last.i - immune };
}

export const threshold = (R0) => Math.max(0, 1 - 1 / R0);

/** A Poisson-distributed count with mean m. */
export function poisson(m, rand = Math.random) {
  const L = Math.exp(-m);
  let k = 0, p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

/** An outbreak as generations: each case passes it to a Poisson(R) number of others. */
export function chain(R, generations = 6, cap = 400, rand = Math.random) {
  const gens = [[{ parent: -1 }]];
  for (let g = 1; g <= generations; g++) {
    const next = [];
    gens[g - 1].forEach((_, idx) => {
      const k = poisson(R, rand);
      for (let j = 0; j < k && next.length < cap; j++) next.push({ parent: idx });
    });
    gens.push(next);
    if (!next.length) break;
  }
  return gens;
}

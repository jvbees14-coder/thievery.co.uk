// ---------------------------------------------------------------------------
// Stable matching: Gale and Shapley's deferred acceptance (1962).
//
// n applicants and n hospitals each rank everyone on the other side. A
// matching is unstable if some applicant and hospital would both rather
// have each other than whom they got. In deferred acceptance one side
// proposes in order of preference; the other holds on to the best offer so
// far and turns the rest away, until nobody is left unmatched. The result
// is always stable, and best for whichever side proposes.
// ---------------------------------------------------------------------------

export function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffled = (n, rand) => {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function preferences(n, seed) {
  const rand = seeded(seed);
  return { a: Array.from({ length: n }, () => shuffled(n, rand)), h: Array.from({ length: n }, () => shuffled(n, rand)) };
}

/**
 * Deferred acceptance with the `side` ('a' or 'h') proposing. Returns the
 * matching as match[a] = h, and the list of steps for replaying.
 */
export function defer(prefs, side = 'a') {
  const P = prefs[side], Q = prefs[side === 'a' ? 'h' : 'a'], n = P.length;
  const rankQ = Q.map((list) => {
    const r = new Array(n);
    list.forEach((p, i) => (r[p] = i));
    return r;
  });
  const next = new Array(n).fill(0), held = new Array(n).fill(-1), free = [...Array(n).keys()], steps = [];
  while (free.length) {
    const p = free.shift(), q = P[p][next[p]++];
    const cur = held[q];
    if (cur === -1) {
      held[q] = p;
      steps.push({ p, q, ok: true, bumped: -1 });
    } else if (rankQ[q][p] < rankQ[q][cur]) {
      held[q] = p;
      free.push(cur);
      steps.push({ p, q, ok: true, bumped: cur });
    } else {
      free.push(p);
      steps.push({ p, q, ok: false, bumped: -1 });
    }
  }
  const match = new Array(n);
  held.forEach((p, q) => (side === 'a' ? (match[p] = q) : (match[q] = p)));
  return { match, steps };
}

/** Pairs (applicant, hospital) who would both rather have each other. */
export function blocking(prefs, match) {
  const n = match.length, holder = new Array(n);
  match.forEach((h, a) => (holder[h] = a));
  const rank = (list, x) => list.indexOf(x);
  const out = [];
  for (let a = 0; a < n; a++) for (let h = 0; h < n; h++) {
    if (match[a] === h) continue;
    if (rank(prefs.a[a], h) < rank(prefs.a[a], match[a]) && rank(prefs.h[h], a) < rank(prefs.h[h], holder[h])) out.push([a, h]);
  }
  return out;
}

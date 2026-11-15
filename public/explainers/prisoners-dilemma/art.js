// ---------------------------------------------------------------------------
// The prisoner's dilemma: strategies and a tournament.
//
// Each round both players choose to cooperate (C) or defect (D). The points
// are Robert Axelrod's: both cooperate, 3 each; both defect, 1 each; one
// defects on a cooperator, 5 to the defector and 0 to the other. A match is
// 200 rounds. `evolve` lets a population's mix change in proportion to how
// well each strategy scores against the current mix.
// ---------------------------------------------------------------------------

export const PAY = { CC: [3, 3], CD: [0, 5], DC: [5, 0], DD: [1, 1] };
export const ROUNDS = 200;

// Each strategy sees its own moves and the other's, and returns 'C' or 'D'.
export const STRATEGIES = {
  titForTat: { name: 'Tit for tat', play: (mine, theirs) => (theirs.length ? theirs[theirs.length - 1] : 'C') },
  grudger: { name: 'Grudger', play: (mine, theirs) => (theirs.includes('D') ? 'D' : 'C') },
  titForTwo: { name: 'Tit for two tats', play: (mine, theirs) => (theirs.length > 1 && theirs.at(-1) === 'D' && theirs.at(-2) === 'D' ? 'D' : 'C') },
  cooperate: { name: 'Always cooperate', play: () => 'C' },
  defect: { name: 'Always defect', play: () => 'D' },
  random: { name: 'Random', play: (m, t, rand) => (rand() < 0.5 ? 'C' : 'D') },
  sneaky: { name: 'Sneaky', play: (mine, theirs, rand) => (rand() < 0.1 ? 'D' : theirs.length ? theirs.at(-1) : 'C') },
};

export function match(a, b, rand = Math.random, rounds = ROUNDS) {
  const ma = [], mb = [];
  let sa = 0, sb = 0;
  for (let i = 0; i < rounds; i++) {
    const x = STRATEGIES[a].play(ma, mb, rand), y = STRATEGIES[b].play(mb, ma, rand);
    const [pa, pb] = PAY[x + y];
    sa += pa;
    sb += pb;
    ma.push(x);
    mb.push(y);
  }
  return [sa, sb];
}

/** Everyone plays everyone (and a copy of themselves); average points per round. */
export function tournament(keys, rand = Math.random) {
  const total = Object.fromEntries(keys.map((k) => [k, 0]));
  for (let i = 0; i < keys.length; i++) {
    for (let j = i; j < keys.length; j++) {
      const [a, b] = match(keys[i], keys[j], rand);
      total[keys[i]] += a;
      if (i !== j) total[keys[j]] += b;
      else total[keys[i]] += b;
    }
  }
  for (const k of keys) total[k] /= ROUNDS * (keys.length + 1);
  return total;
}

/** Score table: table[a][b] = a's average points per round against b. */
export function table(keys, rand = Math.random) {
  const t = {};
  for (const a of keys) {
    t[a] = {};
    for (const b of keys) t[a][b] = match(a, b, rand)[0] / ROUNDS;
  }
  return t;
}
export function evolve(shares, t) {
  const keys = Object.keys(shares);
  const fit = Object.fromEntries(keys.map((a) => [a, keys.reduce((s, b) => s + shares[b] * t[a][b], 0)]));
  const mean = keys.reduce((s, a) => s + shares[a] * fit[a], 0);
  return Object.fromEntries(keys.map((a) => [a, (shares[a] * fit[a]) / mean]));
}

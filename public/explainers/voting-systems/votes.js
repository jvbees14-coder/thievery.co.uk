// ---------------------------------------------------------------------------
// Voting systems: the electorate and the counting rules.
//
// Voters are points on a map of opinion; each ranks the candidates by how
// close they are, which is the standard "spatial model" of voting. Four
// counting rules then decide a winner from the same ballots.
// ---------------------------------------------------------------------------

/** 1,500 voters in two loose camps and a scattered middle, the same every time. */
export function electorate(n = 1500, seed = 42) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = rand();
    const c = r < 0.42 ? [0.32, 0.45] : r < 0.82 ? [0.68, 0.55] : [0.5, 0.5];
    const spread = r < 0.82 ? 0.12 : 0.22;
    out.push([Math.min(0.98, Math.max(0.02, c[0] + gauss() * spread)), Math.min(0.98, Math.max(0.02, c[1] + gauss() * spread * 0.8))]);
  }
  return out;
}

/** Each voter's ranking of the candidates, nearest first. */
export function ballots(voters, cands) {
  return voters.map(([x, y]) => cands.map((c, i) => [i, Math.hypot(c.x - x, c.y - y)]).sort((a, b) => a[1] - b[1]).map(([i]) => i));
}

export function plurality(b, k) {
  const t = new Array(k).fill(0);
  for (const r of b) t[r[0]]++;
  return { tally: t, winner: t.indexOf(Math.max(...t)) };
}

/** Instant runoff: drop the last-placed candidate and pass their ballots on, until someone has half. */
export function runoff(b, k) {
  const out = new Set();
  const rounds = [];
  for (;;) {
    const t = new Array(k).fill(0);
    for (const r of b) {
      const top = r.find((i) => !out.has(i));
      if (top !== undefined) t[top]++;
    }
    rounds.push({ tally: t.slice(), out: new Set(out) });
    const live = t.map((v, i) => [v, i]).filter(([, i]) => !out.has(i));
    const total = live.reduce((s, [v]) => s + v, 0);
    const best = live.reduce((a, c) => (c[0] > a[0] ? c : a));
    if (best[0] * 2 > total || live.length <= 1) return { rounds, winner: best[1] };
    const worst = live.reduce((a, c) => (c[0] < a[0] ? c : a));
    out.add(worst[1]);
  }
}

/** Every pair head to head: wins[i][j] is how many prefer i to j. */
export function pairwise(b, k) {
  const wins = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const r of b) for (let a = 0; a < k; a++) for (let c = a + 1; c < k; c++) wins[r[a]][r[c]]++;
  let winner = -1;
  for (let i = 0; i < k; i++) {
    let beatsAll = true;
    for (let j = 0; j < k; j++) if (i !== j && wins[i][j] <= wins[j][i]) beatsAll = false;
    if (beatsAll) winner = i;
  }
  return { wins, winner };
}

/** Approval: a voter approves of every candidate within `reach` of them. */
export function approval(voters, cands, reach = 0.28) {
  const t = cands.map(() => 0);
  for (const [x, y] of voters) cands.forEach((c, i) => Math.hypot(c.x - x, c.y - y) <= reach && t[i]++);
  return { tally: t, winner: t.indexOf(Math.max(...t)) };
}

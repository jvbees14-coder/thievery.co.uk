// ---------------------------------------------------------------------------
// Small worlds: Watts and Strogatz's ring (1998).
//
// n people in a ring, each friends with the k nearest on either side. Each
// friendship is then rewired, with chance p, to someone chosen at random.
// `pathLength` is the average number of steps between two people (breadth-
// first search from everyone); `clustering` the average share of a
// person's friends who are friends with each other.
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

export function ring(n, k, p, seed = 1) {
  const rand = seeded(seed);
  const adj = Array.from({ length: n }, () => new Set());
  const edges = [];
  for (let i = 0; i < n; i++) for (let j = 1; j <= k; j++) edges.push([i, (i + j) % n]);
  for (const e of edges) {
    if (rand() < p) {
      let t;
      do t = Math.floor(rand() * n); while (t === e[0] || adj[e[0]].has(t));
      e[1] = t;
      e.shortcut = true;
    }
    adj[e[0]].add(e[1]);
    adj[e[1]].add(e[0]);
  }
  return { n, adj, edges };
}

export function pathLength(g) {
  let total = 0, pairs = 0;
  for (let s = 0; s < g.n; s++) {
    const dist = new Array(g.n).fill(-1);
    dist[s] = 0;
    const q = [s];
    for (let i = 0; i < q.length; i++) for (const v of g.adj[q[i]]) if (dist[v] < 0) {
      dist[v] = dist[q[i]] + 1;
      q.push(v);
    }
    for (const d of dist) if (d > 0) {
      total += d;
      pairs++;
    }
  }
  return total / pairs;
}

export function clustering(g) {
  let sum = 0;
  for (let i = 0; i < g.n; i++) {
    const nb = [...g.adj[i]];
    if (nb.length < 2) continue;
    let links = 0;
    for (let a = 0; a < nb.length; a++) for (let b = a + 1; b < nb.length; b++) if (g.adj[nb[a]].has(nb[b])) links++;
    sum += links / ((nb.length * (nb.length - 1)) / 2);
  }
  return sum / g.n;
}

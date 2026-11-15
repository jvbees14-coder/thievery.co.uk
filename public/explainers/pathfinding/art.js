// ---------------------------------------------------------------------------
// Pathfinding on a grid.
//
// A grid of cells, some walls, some mud (costing 5 to cross rather than 1).
// `search` runs one of three methods from the start to the goal and records
// the order in which it settled each cell, so a scene can replay the
// search: breadth first (every step costs the same), Dijkstra's (cheapest
// total cost first) and A* (cheapest cost so far plus a straight-line
// guess of the rest, Hart, Nilsson and Raphael, 1968).
// ---------------------------------------------------------------------------

export const COLS = 24, ROWS = 15;
export const WALL = 1, MUD = 2;

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function makeGrid(seed, { walls = 0.28, mud = 0 } = {}) {
  const rand = seeded(seed);
  for (let tries = 0; tries < 50; tries++) {
    const g = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => (rand() < walls ? WALL : 0)));
    if (mud) {
      // A band of mud across the middle, broken in places.
      for (let r = 2; r < ROWS - 2; r++) for (let c = 9; c < 15; c++) if (g[r][c] !== WALL && rand() < mud) g[r][c] = MUD;
    }
    const start = [Math.floor(ROWS / 2), 1], goal = [Math.floor(ROWS / 2), COLS - 2];
    g[start[0]][start[1]] = 0;
    g[goal[0]][goal[1]] = 0;
    const grid = { g, start, goal };
    if (search(grid, 'bfs').path.length) return grid;
  }
  return null;
}

const cost = (g, r, c) => (g[r][c] === MUD ? 5 : 1);

export function search({ g, start, goal }, method) {
  const key = (r, c) => r * COLS + c;
  const dist = new Map([[key(...start), 0]]), from = new Map(), done = new Set();
  const order = [];
  const h = (r, c) => (method === 'astar' ? Math.abs(r - goal[0]) + Math.abs(c - goal[1]) : 0);
  let open = [[h(...start), 0, ...start]];
  let seq = 0;
  while (open.length) {
    // Smallest priority first; ties go to the one queued earliest (breadth first).
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0] || (open[i][0] === open[bi][0] && open[i][1] < open[bi][1])) bi = i;
    const [, , r, c] = open.splice(bi, 1)[0];
    const k = key(r, c);
    if (done.has(k)) continue;
    done.add(k);
    order.push([r, c]);
    if (r === goal[0] && c === goal[1]) break;
    for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS || g[nr][nc] === WALL) continue;
      const step = method === 'bfs' ? 1 : cost(g, nr, nc);
      const nd = dist.get(k) + step, nk = key(nr, nc);
      if (!dist.has(nk) || nd < dist.get(nk)) {
        dist.set(nk, nd);
        from.set(nk, k);
        open.push([nd + h(nr, nc), ++seq, nr, nc]);
      }
    }
  }
  const path = [];
  let k = key(...goal);
  if (done.has(k)) {
    while (k !== undefined) {
      path.unshift([Math.floor(k / COLS), k % COLS]);
      k = from.get(k);
    }
  }
  const pathCost = path.slice(1).reduce((s, [r, c]) => s + cost(g, r, c), 0);
  return { order, path, cost: pathCost };
}

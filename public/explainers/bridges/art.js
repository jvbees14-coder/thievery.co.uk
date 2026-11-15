// ---------------------------------------------------------------------------
// Bridges: a truss solved joint by joint.
//
// A Warren truss of `n` triangles: a bottom chord, a top chord and
// diagonals, pinned at the left end and on rollers at the right. Every
// joint must balance, across and up, so the member forces and the three
// support reactions are the answer to one set of linear equations, solved
// here by Gaussian elimination. A positive force is tension (the member is
// being stretched), a negative one compression (it is being squeezed).
// ---------------------------------------------------------------------------

export function warren(n = 6, height = 0.9) {
  const nodes = [];
  for (let i = 0; i <= n; i++) nodes.push([i, 0]);
  for (let i = 0; i < n; i++) nodes.push([i + 0.5, height]);
  const top = (i) => n + 1 + i;
  const members = [];
  for (let i = 0; i < n; i++) members.push([i, i + 1]);
  for (let i = 0; i < n - 1; i++) members.push([top(i), top(i + 1)]);
  for (let i = 0; i < n; i++) members.push([i, top(i)], [top(i), i + 1]);
  return { n, nodes, members };
}

/** Member forces for a downward load `P` at bottom joint `at`. */
export function solve(truss, at, P = 1) {
  const { nodes, members, n } = truss;
  const m = members.length, size = m + 3, eq = nodes.length * 2;
  const A = Array.from({ length: eq }, () => new Array(size + 1).fill(0));
  members.forEach(([a, b], k) => {
    const [xa, ya] = nodes[a], [xb, yb] = nodes[b];
    const L = Math.hypot(xb - xa, yb - ya), cx = (xb - xa) / L, cy = (yb - ya) / L;
    // Tension pulls each end towards the other.
    A[2 * a][k] += cx;
    A[2 * a + 1][k] += cy;
    A[2 * b][k] -= cx;
    A[2 * b + 1][k] -= cy;
  });
  // Reactions: pin at joint 0 (across and up), roller at joint n (up).
  A[0][m] = 1;
  A[1][m + 1] = 1;
  A[2 * n + 1][m + 2] = 1;
  // External load, moved to the right-hand side.
  A[2 * at + 1][size] = P;
  // Gaussian elimination with partial pivoting.
  const rows = A.length;
  for (let c = 0, r = 0; c < size && r < rows; c++) {
    let best = r;
    for (let i = r + 1; i < rows; i++) if (Math.abs(A[i][c]) > Math.abs(A[best][c])) best = i;
    if (Math.abs(A[best][c]) < 1e-12) continue;
    [A[r], A[best]] = [A[best], A[r]];
    for (let i = 0; i < rows; i++) {
      if (i === r) continue;
      const f = A[i][c] / A[r][c];
      for (let j = c; j <= size; j++) A[i][j] -= f * A[r][j];
    }
    r++;
  }
  const x = new Array(size).fill(0);
  for (const row of A) {
    const c = row.findIndex((v, j) => j < size && Math.abs(v) > 1e-12);
    if (c >= 0) x[c] = row[size] / row[c];
  }
  return { forces: x.slice(0, m), reactions: x.slice(m) };
}

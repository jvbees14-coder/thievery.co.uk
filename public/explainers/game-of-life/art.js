// ---------------------------------------------------------------------------
// The Game of Life: John Conway's rules (1970), on a grid that wraps round.
//
// A live cell with two or three live neighbours lives on; a dead cell with
// exactly three comes alive; everything else dies or stays dead.
// ---------------------------------------------------------------------------

export const PATTERNS = {
  blinker: [[0, 0], [1, 0], [2, 0]],
  block: [[0, 0], [1, 0], [0, 1], [1, 1]],
  glider: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
  // Bill Gosper's glider gun (1970), the first pattern found to grow for ever.
  gun: [[1, 5], [1, 6], [2, 5], [2, 6], [11, 5], [11, 6], [11, 7], [12, 4], [12, 8], [13, 3], [13, 9], [14, 3], [14, 9], [15, 6],
    [16, 4], [16, 8], [17, 5], [17, 6], [17, 7], [18, 6], [21, 3], [21, 4], [21, 5], [22, 3], [22, 4], [22, 5], [23, 2], [23, 6],
    [25, 1], [25, 2], [25, 6], [25, 7], [35, 3], [35, 4], [36, 3], [36, 4]],
};

export function grid(w, h) {
  return { w, h, cells: new Uint8Array(w * h) };
}
export function place(g, pattern, ox, oy) {
  for (const [x, y] of pattern) g.cells[((oy + y + g.h) % g.h) * g.w + ((ox + x + g.w) % g.w)] = 1;
}
export function step(g, wrap = true) {
  const { w, h, cells } = g, next = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        let xx = x + dx, yy = y + dy;
        if (wrap) {
          xx = (xx + w) % w;
          yy = (yy + h) % h;
        } else if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        n += cells[yy * w + xx];
      }
      const alive = cells[y * w + x];
      next[y * w + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
    }
  }
  g.cells = next;
}
export const population = (g) => g.cells.reduce((a, b) => a + b, 0);

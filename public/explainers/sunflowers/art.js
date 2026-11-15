// ---------------------------------------------------------------------------
// Sunflowers: Vogel's model of a seed head (1979).
//
// Seed n sits at angle n × θ and distance c·√n from the middle, so every
// seed has the same area. With θ the golden angle, 360° × (1 − 1/φ) =
// 137.508°, the seeds pack evenly and the eye picks out spirals in
// Fibonacci numbers. `spacing` measures how evenly: each seed's distance
// to its nearest neighbour, the smallest of them against the average.
// ---------------------------------------------------------------------------

export const GOLDEN = 360 * (1 - (Math.sqrt(5) - 1) / 2);

export function seeds(n, angle) {
  const a = (angle * Math.PI) / 180;
  return Array.from({ length: n }, (_, i) => [Math.sqrt(i + 0.5) * Math.cos(i * a), Math.sqrt(i + 0.5) * Math.sin(i * a)]);
}

/** How evenly the outer seeds are spread: 1 is perfect, near 0 is clumped. */
export function evenness(pts) {
  const from = Math.floor(pts.length / 2);
  let total = 0, count = 0;
  for (let i = from; i < pts.length; i += 3) {
    let best = Infinity;
    for (let j = from - 40; j < pts.length; j++) {
      if (j === i || j < 0) continue;
      const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
      if (d < best) best = d;
    }
    total += Math.sqrt(best);
    count++;
  }
  // Each seed has an area of π here; packed in perfect hexagons the nearest
  // neighbour would be √(2π/√3) ≈ 1.905 away.
  return total / count / 1.905;
}

export function drawHead(ctx, cx, cy, R, pts, col, colourOf) {
  const n = pts.length, k = R / Math.sqrt(n), r = Math.max(1.2, k * 0.42);
  pts.forEach(([x, y], i) => {
    ctx.beginPath();
    ctx.arc(cx + x * k, cy + y * k, r, 0, Math.PI * 2);
    ctx.fillStyle = colourOf ? colourOf(i) : col.accent;
    ctx.fill();
  });
}

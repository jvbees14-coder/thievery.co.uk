// ---------------------------------------------------------------------------
// The lottery: six balls from fifty-nine.
//
// The number of different tickets is C(59, 6) = 45,057,474. The chance of
// matching exactly m of the six drawn is C(6, m)·C(53, 6 − m) / C(59, 6).
// ---------------------------------------------------------------------------

export const BALLS = 59, PICK = 6;
export function choose(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}
export const TICKETS = choose(BALLS, PICK);
export const matchOdds = (m) => TICKETS / (choose(PICK, m) * choose(BALLS - PICK, PICK - m));

export function draw6(rand = Math.random) {
  const a = [...Array(BALLS).keys()].map((i) => i + 1);
  for (let i = 0; i < PICK; i++) {
    const j = i + Math.floor(rand() * (BALLS - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, PICK).sort((x, y) => x - y);
}

export function drawBall(ctx, x, y, r, n, col, { picked = false, drawn = false } = {}) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = drawn && picked ? col.success : drawn ? col.accent : picked ? col['hiw-ink-1'] : col['bg-elevated-2'];
  ctx.fill();
  ctx.fillStyle = drawn || picked ? col['stock-ink'] : col['label-secondary'];
  ctx.font = `700 ${Math.max(8, r * 0.95)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x, y + 0.5);
}

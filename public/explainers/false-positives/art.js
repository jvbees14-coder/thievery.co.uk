// ---------------------------------------------------------------------------
// False positives: a thousand people and one test.
//
// `people` lays out a thousand people in a grid, as many of them ill as the
// prevalence says, and tests each one: the ill test positive with the
// test's sensitivity, the well with its false-positive rate. The counts are
// the expected ones, rounded, so the picture always matches the sum; which
// people they are is fixed by a seeded shuffle so nobody jumps about.
// ---------------------------------------------------------------------------

export const N = 1000;

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const ORDER = (() => {
  const r = seeded(7), a = [...Array(N).keys()];
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
})();

/** The chance of being ill given a positive result, by Bayes' rule. */
export function chanceIfPositive(prev, sens, fp) {
  const a = prev * sens, b = (1 - prev) * fp;
  return a + b ? a / (a + b) : 0;
}

/** Each person as { ill, positive }, in grid order. */
export function people(prev, sens, fp) {
  const ill = Math.round(N * prev);
  const truePos = Math.round(ill * sens), falsePos = Math.round((N - ill) * fp);
  const out = new Array(N);
  ORDER.forEach((slot, k) => {
    const isIll = k < ill;
    const pos = isIll ? k < truePos : k - ill < falsePos;
    out[slot] = { ill: isIll, positive: pos };
  });
  return { list: out, ill, truePos, falsePos };
}

export function drawPeople(ctx, x0, y0, w, h, list, col, { onlyPositive = false } = {}) {
  const cols = 40, rows = Math.ceil(N / cols);
  const cell = Math.min(w / cols, h / rows), r = cell * 0.36;
  const ox = x0 + (w - cell * cols) / 2;
  list.forEach((p, i) => {
    const x = ox + (i % cols) * cell + cell / 2, y = y0 + Math.floor(i / cols) * cell + cell / 2;
    const faded = onlyPositive && !p.positive;
    ctx.globalAlpha = faded ? 0.15 : 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = p.ill ? col.danger : col['hiw-ink-1'];
    ctx.fill();
    if (p.positive) {
      ctx.lineWidth = Math.max(1.2, cell * 0.12);
      ctx.strokeStyle = col.label;
      ctx.beginPath();
      ctx.arc(x, y, r + cell * 0.12, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
  return y0 + rows * cell;
}

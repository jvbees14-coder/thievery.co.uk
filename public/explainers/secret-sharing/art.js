// ---------------------------------------------------------------------------
// Secret sharing: Adi Shamir's scheme, drawn on ordinary graph paper.
//
// The secret is where a curve crosses the vertical axis. A straight line
// needs two points to pin it down, a parabola three, a curve of degree k − 1
// needs k. Each person is given one point on the curve (a share); any k of
// them can rebuild it by Lagrange interpolation and read off the secret,
// and fewer than k cannot. The real scheme does the same arithmetic modulo a
// prime, so that a share gives away nothing at all about the size of the
// secret; real numbers are used here so the curve can be seen.
// ---------------------------------------------------------------------------

/** The curve through the given points, evaluated at x. */
export function lagrange(points, x) {
  let sum = 0;
  points.forEach(([xi, yi], i) => {
    let term = yi;
    points.forEach(([xj], j) => {
      if (i !== j) term *= (x - xj) / (xi - xj);
    });
    sum += term;
  });
  return sum;
}

/**
 * Deal a secret to `n` people, any `k` of whom can rebuild it. The curve is
 * fixed by the secret at x = 0 and k − 1 random heights; the shares are its
 * heights at x = 1 ... n.
 */
export function deal(secret, k, n, rand = Math.random) {
  const fix = [[0, secret]];
  for (let i = 1; i < k; i++) fix.push([i, 2 + rand() * 6]);
  return Array.from({ length: n }, (_, i) => [i + 1, lagrange(fix, i + 1)]);
}

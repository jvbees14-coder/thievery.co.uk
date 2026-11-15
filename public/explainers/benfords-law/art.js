// ---------------------------------------------------------------------------
// Benford's law: first digits.
//
// In many collections of numbers that span several powers of ten, the
// first digit d turns up with probability log10(1 + 1/d): a 1 about 30.1%
// of the time, a 9 only 4.6%. The data sets here are made in the browser:
// powers of 2, the Fibonacci numbers, money growing at a steady rate, and
// numbers someone "made up" by picking each digit evenly.
// ---------------------------------------------------------------------------

export const benford = (d) => Math.log10(1 + 1 / d);

export function firstDigits(nums) {
  const c = new Array(10).fill(0);
  for (const n of nums) {
    const s = typeof n === 'bigint' ? n.toString() : String(Math.abs(n)).replace(/^0\.?0*/, '');
    const d = Number(s[0]);
    if (d) c[d]++;
  }
  const total = c.reduce((a, b) => a + b, 0);
  return c.map((v) => v / (total || 1));
}

export const SETS = {
  powers: { name: 'Powers of 2', make: () => { const a = []; let x = 1n; for (let i = 0; i < 1000; i++) { a.push(x); x *= 2n; } return a; } },
  fibonacci: { name: 'Fibonacci numbers', make: () => { const a = []; let p = 1n, q = 1n; for (let i = 0; i < 1000; i++) { a.push(p); [p, q] = [q, p + q]; } return a; } },
  savings: { name: '£100 at 7% a year, for 300 years', make: () => Array.from({ length: 300 }, (_, i) => 100 * 1.07 ** i) },
  madeUp: { name: 'Made-up figures', make: (rand = Math.random) => Array.from({ length: 1000 }, () => 1 + Math.floor(rand() * 9) + rand()) },
};

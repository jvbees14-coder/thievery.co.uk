// ---------------------------------------------------------------------------
// Error correction: Richard Hamming's (7,4) code.
//
// Four data bits are sent as seven, in positions 1 to 7. Positions 1, 2 and
// 4 are check bits; each makes the count of ones even over the positions
// whose number has that bit set (1: 1,3,5,7; 2: 2,3,6,7; 4: 4,5,6,7). On
// arrival the three checks are redone; the ones that fail, read as a
// binary number, are the position of a single flipped bit. Drawn as three
// overlapping circles, a flipped bit lies where exactly the failing circles
// overlap.
// ---------------------------------------------------------------------------

export const DATA_POS = [3, 5, 6, 7];
export const CHECKS = [1, 2, 4];
export const covers = (check, pos) => (pos & check) !== 0;

/** Seven bits (index 1..7; 0 unused) for a number 0..15. */
export function encode(n) {
  const b = new Array(8).fill(0);
  DATA_POS.forEach((p, i) => (b[p] = (n >> (3 - i)) & 1));
  for (const c of CHECKS) {
    let s = 0;
    for (let p = 1; p <= 7; p++) if (p !== c && covers(c, p)) s ^= b[p];
    b[c] = s;
  }
  return b;
}

/** Which checks fail, and the position they point to (0 for none). */
export function syndrome(b) {
  let pos = 0;
  const failed = [];
  for (const c of CHECKS) {
    let s = 0;
    for (let p = 1; p <= 7; p++) if (covers(c, p)) s ^= b[p];
    if (s) {
      pos += c;
      failed.push(c);
    }
  }
  return { pos, failed };
}
export const decode = (b) => DATA_POS.reduce((n, p) => (n << 1) | b[p], 0);

/** Chance a 4-bit message arrives right, sent plain or as Hamming code. */
export const plainOk = (p) => (1 - p) ** 4;
export const hammingOk = (p) => (1 - p) ** 7 + 7 * p * (1 - p) ** 6;

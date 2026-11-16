// ---------------------------------------------------------------------------
// The cipher that stood for 300 years: the arithmetic, apart from drawing.
//
// Vigenère encryption, and the two steps of breaking it: guess the key's
// length from the index of coincidence (how often two letters picked from
// the same column match), then solve each column as a Caesar shift by
// matching its letter counts to English (the chi-squared fit). Kept apart
// from the scene so the figures on the page can be checked in Node.
// ---------------------------------------------------------------------------

/** English letter frequencies, A to Z, in per cent (Lewand, Cryptological Mathematics). */
export const ENGLISH = [8.167, 1.492, 2.782, 4.253, 12.702, 2.228, 2.015, 6.094, 6.966, 0.153, 0.772, 4.025, 2.406, 6.749, 7.507, 1.929, 0.095, 5.987, 6.327, 9.056, 2.758, 0.978, 2.360, 0.150, 1.974, 0.074];

export const TEXT = 'The thieves met at midnight in the cellar under the old bank. The plan was simple: wait for the guard to finish his round, open the side door with the copied key, and take only the letters from the second drawer of the manager’s desk. Nobody would notice they were gone until Monday, and by then the ship would have sailed. The only problem was the new lock on the strongroom, which none of them had seen before, and the rumour that the manager changed its combination every evening before he went home to his wife and three children on the other side of the river.';

export const letters = (s) => s.toUpperCase().replace(/[^A-Z]/g, '');
const A = 65;

/** Encrypt (or, with sign −1, decrypt) the letters only, keeping everything else. */
export function vigenere(text, key, sign = 1) {
  const k = letters(key);
  if (!k.length) return text;
  let i = 0;
  return Array.from(text, (ch) => {
    const up = ch.toUpperCase();
    const c = up.charCodeAt(0);
    if (c < A || c > A + 25) return ch;
    const shift = k.charCodeAt(i++ % k.length) - A;
    const out = String.fromCharCode(A + ((c - A + sign * shift + 26 * 2) % 26));
    return ch === up ? out : out.toLowerCase();
  }).join('');
}

export function counts(s) {
  const n = new Array(26).fill(0);
  for (const ch of letters(s)) n[ch.charCodeAt(0) - A]++;
  return n;
}

/** The chance that two letters picked at random from s are the same. */
export function coincidence(s) {
  const n = counts(s), N = n.reduce((a, b) => a + b, 0);
  return N < 2 ? 0 : n.reduce((a, c) => a + c * (c - 1), 0) / (N * (N - 1));
}

export function columns(s, len) {
  const L = letters(s), cols = Array.from({ length: len }, () => '');
  for (let i = 0; i < L.length; i++) cols[i % len] += L[i];
  return cols;
}

/** The average coincidence of the columns, for each guessed key length. */
export function lengthScores(s, max = 10) {
  const out = [];
  for (let len = 1; len <= max; len++) {
    const c = columns(s, len);
    out.push(c.reduce((a, col) => a + coincidence(col), 0) / len);
  }
  return out;
}

/** The shift that makes one column look most like English. */
export function bestShift(col) {
  const n = counts(col), N = col.length;
  let best = 0, bestScore = Infinity;
  for (let s = 0; s < 26; s++) {
    let chi = 0;
    for (let i = 0; i < 26; i++) {
      const expect = (ENGLISH[i] / 100) * N;
      const got = n[(i + s) % 26];
      chi += ((got - expect) ** 2) / expect;
    }
    if (chi < bestScore) { bestScore = chi; best = s; }
  }
  return best;
}

export function crack(s, len) {
  return columns(s, len).map((c) => String.fromCharCode(A + bestShift(c))).join('');
}

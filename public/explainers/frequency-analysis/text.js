// ---------------------------------------------------------------------------
// Frequency analysis: the message and the arithmetic.
//
// The passage was written for this page. ENGLISH is the usual table of
// letter frequencies in English text, in per cent.
// ---------------------------------------------------------------------------

export const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const PASSAGE =
  'Meet me at the old bridge when the church bell strikes nine. Bring the map and the lantern, but leave the dog at home, ' +
  'because he barks at every shadow and the guards on the north road are not as sleepy as they look. If anything goes wrong, ' +
  'walk straight past me as though we have never met, and wait by the mill until the moon is high. The gold is hidden under ' +
  'the third stone from the river, wrapped in an oilcloth, and nobody else alive knows where it is. Tell nobody, write nothing ' +
  'down, and burn this letter as soon as you have read it. Once we have the gold we shall take the morning coach to the coast ' +
  'and nobody will ever think to look for us there.';

export const ENGLISH = {
  E: 12.7, T: 9.06, A: 8.17, O: 7.51, I: 6.97, N: 6.75, S: 6.33, H: 6.09, R: 5.99, D: 4.25, L: 4.03, C: 2.78, U: 2.76,
  M: 2.41, W: 2.36, F: 2.23, G: 2.02, Y: 1.97, P: 1.93, B: 1.29, V: 0.98, K: 0.77, J: 0.15, X: 0.15, Q: 0.1, Z: 0.07,
};
/** Letters of English, most common first. */
export const BY_FREQ = Object.keys(ENGLISH).sort((a, b) => ENGLISH[b] - ENGLISH[a]);

/** A random cipher alphabet: key[i] is what plain letter i becomes. */
export function newKey(rand = Math.random) {
  const k = [...ABC];
  for (let i = 25; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [k[i], k[j]] = [k[j], k[i]];
  }
  return k.join('');
}

/** Encipher with one alphabet, or with several taken in turn (letters only count). */
export function encipher(text, keys) {
  let n = 0;
  return [...text.toUpperCase()].map((ch) => {
    const i = ABC.indexOf(ch);
    if (i < 0) return ch;
    return keys[n++ % keys.length][i];
  }).join('');
}

/** Letter counts, as per cent of all letters. */
export function counts(text) {
  const c = Object.fromEntries([...ABC].map((L) => [L, 0]));
  let n = 0;
  for (const ch of text) if (c[ch] !== undefined) (c[ch]++, n++);
  for (const L of ABC) c[L] = n ? (c[L] / n) * 100 : 0;
  return c;
}

/** The first guess: the commonest cipher letter is E, the next T, and so on. */
export function rankGuess(cipher) {
  const c = counts(cipher);
  const order = [...ABC].sort((a, b) => c[b] - c[a] || a.localeCompare(b));
  const guess = {};
  order.forEach((L, i) => (guess[L] = BY_FREQ[i]));
  return guess;
}

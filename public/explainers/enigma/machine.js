// ---------------------------------------------------------------------------
// The Enigma machine, as the German army's three-rotor model worked.
//
// The real wirings of rotors I to V and reflector B, the real turnover
// notches, the plugboard, and the double step of the middle rotor. It is
// checked against the textbook test: rotors I, II, III, reflector B, rings
// and start at A, plugboard empty: AAAAA comes out BDZGO.
// ---------------------------------------------------------------------------

export const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const ROTORS = {
  I: { wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', notch: 'Q' },
  II: { wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', notch: 'E' },
  III: { wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', notch: 'V' },
  IV: { wiring: 'ESOVPZJAYQUIRHXLNFTGKDCMWB', notch: 'J' },
  V: { wiring: 'VZBRGITYUPSDNHLXAWMKCJQFEO', notch: 'Z' },
};
export const REFLECTOR_B = 'YRUHQSLDPXNGOKMIEBFZCWVJAT';

const idx = (c) => ABC.indexOf(c);
const mod = (n) => ((n % 26) + 26) % 26;

/**
 * A machine: `rotors` left to right, `start` and `rings` as three letters,
 * `plugs` as pairs like 'AB CD'. Returns an object that encrypts a letter at
 * a time and reports the path the current took, for drawing.
 */
export function machine({ rotors = ['I', 'II', 'III'], start = 'AAA', rings = 'AAA', plugs = '' } = {}) {
  const pos = [...start].map(idx);
  const ring = [...rings].map(idx);
  const wires = rotors.map((r) => [...ROTORS[r].wiring].map(idx));
  const back = wires.map((w) => {
    const inv = new Array(26);
    w.forEach((o, i) => (inv[o] = i));
    return inv;
  });
  const notch = rotors.map((r) => idx(ROTORS[r].notch));
  const board = [...ABC].map((_, i) => i);
  for (const pair of plugs.toUpperCase().split(/\s+/).filter(Boolean)) {
    const [a, b] = [...pair].map(idx);
    if (a >= 0 && b >= 0) {
      board[a] = b;
      board[b] = a;
    }
  }
  const refl = [...REFLECTOR_B].map(idx);

  function step() {
    // The middle rotor at its notch steps itself and the left one; that is
    // the double step. Otherwise the right rotor's notch steps the middle.
    if (pos[1] === notch[1]) {
      pos[1] = mod(pos[1] + 1);
      pos[0] = mod(pos[0] + 1);
    } else if (pos[2] === notch[2]) {
      pos[1] = mod(pos[1] + 1);
    }
    pos[2] = mod(pos[2] + 1);
  }
  const through = (i, c, table) => mod(table[mod(c + pos[i] - ring[i])] - pos[i] + ring[i]);
  const path = (c0) => {
    const path = [c0];
    let c = board[c0];
    path.push(c);
    for (const i of [2, 1, 0]) path.push((c = through(i, c, wires[i])));
    path.push((c = refl[c]));
    for (const i of [0, 1, 2]) path.push((c = through(i, c, back[i])));
    path.push(board[c]);
    return path;
  };

  return {
    get window() {
      return pos.map((p) => ABC[p]).join('');
    },
    press(letter) {
      const c0 = idx(letter);
      if (c0 < 0) return null;
      step();
      const p = path(c0);
      return { out: ABC[p[9]], path: p };
    },
    /** Where each letter would go at the next press, without pressing. */
    wiring() {
      const saved = [...pos];
      step();
      const map = [...ABC].map((_, c) => path(c)[9]);
      pos.splice(0, 3, ...saved);
      return map;
    },
    type(text) {
      let out = '';
      for (const ch of text.toUpperCase()) {
        const r = this.press(ch);
        if (r) out += r.out;
      }
      return out;
    },
  };
}

/** How many daily settings: 3 rotors of 5 in order, 26³ starts, 10 plug pairs. */
export function keySpace() {
  const fact = (n) => (n <= 1 ? 1n : BigInt(n) * fact(n - 1));
  const plugs = fact(26) / (fact(6) * fact(10) * 2n ** 10n);
  return 60n * 26n ** 3n * plugs;
}

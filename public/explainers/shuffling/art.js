// ---------------------------------------------------------------------------
// Shuffling: the deck, and the arithmetic of mixing it.
//
// Drawn on its own so the scene, the index thumbnail and the share picture
// share one picture of a deck. A deck is a permutation of 0..51: the card
// at each place, top first. A card's colour is where it started, so a fresh
// deck is a smooth rainbow and a mixed one is confetti.
// ---------------------------------------------------------------------------

import { ramp, mix } from '../shared/draw.js';

export const N = 52;

// Bayer and Diaconis (1992), Table 1: total variation distance from a
// perfectly random deck after k riffle shuffles of 52 cards, k = 1..10.
export const DISTANCE = [1, 1, 1, 0.9999, 0.924, 0.614, 0.334, 0.167, 0.085, 0.043];

export const fresh = () => Array.from({ length: N }, (_, i) => i);

/**
 * One riffle, by the Gilbert-Shannon-Reeds model: cut the deck where a fair
 * coin tossed 52 times says (so near the middle, but rarely exactly), then
 * drop cards from the two halves with odds in proportion to how many each
 * still holds. It is the model the "seven shuffles" result is about, and
 * real riffles by practised hands are close to it.
 */
export function riffle(order, rand = Math.random) {
  let cut = 0;
  for (let i = 0; i < order.length; i++) if (rand() < 0.5) cut++;
  const a = order.slice(0, cut), b = order.slice(cut);
  const out = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    const left = a.length - i, right = b.length - j;
    if (rand() < left / (left + right)) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return { order: out, cut, fromTop: new Set(a) };
}

/**
 * One overhand shuffle: small packets slid off the top of one hand onto
 * the other, which reverses the order of the packets and keeps the order
 * inside each. Packets of one to eight cards, which is about how people do it.
 */
export function overhand(order, rand = Math.random) {
  const packets = [];
  let i = 0;
  while (i < order.length) {
    const n = 1 + Math.floor(rand() * 8);
    packets.push(order.slice(i, i + n));
    i += n;
  }
  return packets.reverse().flat();
}

/**
 * Rising sequences: runs of consecutive starting places that still appear
 * in order. A new deck is one; each riffle can at most double the count; a
 * truly random deck has 26.5 on average.
 */
export function risingSequences(order) {
  const at = new Array(order.length);
  order.forEach((v, i) => (at[v] = i));
  const id = new Array(order.length);
  let n = 0;
  for (let v = 0; v < order.length; v++) {
    if (v > 0 && at[v] < at[v - 1]) n++;
    id[v] = n;
  }
  return { count: n + 1, id };
}

/** A card's colour from where it started in the deck. */
export function cardInk(col, v, n = N) {
  return ramp([col['hiw-ink-1'], col.accent, col['hiw-ink-2'], col['hiw-ink-4']], v / (n - 1));
}
const SEQ = ['hiw-ink-1', 'accent', 'hiw-ink-2', 'hiw-ink-3', 'hiw-ink-4', 'label-secondary'];
export function sequenceInk(col, id) {
  return col[SEQ[id % SEQ.length]];
}

/**
 * The deck as a row of upright cards, top of the deck on the left. `place`
 * gives each card's position (a float, so cards can glide) and `lift` how
 * far it is raised; `inkOf` its colour.
 */
export function drawDeck(ctx, x0, y0, width, height, cards, inkOf, col) {
  const step = width / N;
  const w = Math.max(2, step * 0.82);
  for (let v = 0; v < N; v++) {
    const c = cards[v];
    const x = x0 + c.place * step + (step - w) / 2;
    const y = y0 - c.lift * height * 0.28;
    const ink = inkOf(v);
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, height, Math.min(3, w / 3)) : ctx.rect(x, y, w, height);
    ctx.fill();
    ctx.fillStyle = mix(ink, col['hiw-scene-bg'], 0.55);
    ctx.fillRect(x, y + height * 0.82, w, height * 0.18);
  }
}

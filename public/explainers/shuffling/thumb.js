// Shuffling: the index card's picture. A deck riffled once every two
// seconds, seven times, then put back in order.

import { TOKENS } from '../shared/draw.js';
import { fresh, riffle, cardInk, drawDeck, N } from './art.js';

export const colours = TOKENS;

// A fixed run of shuffles, so every visitor's card shows the same thing.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const decks = [fresh()];
for (let i = 0; i < 7; i++) decks.push(riffle(decks[i], rand).order);

export function thumb(ctx, w, h, t, col) {
  const k = Math.floor(t / 2) % decks.length;
  const order = decks[k];
  const cards = new Array(N);
  order.forEach((v, i) => (cards[v] = { place: i, lift: 0 }));
  const m = w * 0.07;
  drawDeck(ctx, m, h * 0.22, w - m * 2, h * 0.56, cards, (v) => cardInk(col, v), col);
}

export function share(ctx, w, h, _t, col) {
  const m = w * 0.04;
  for (let r = 0; r < 4; r++) {
    const order = decks[[0, 2, 4, 7][r]];
    const cards = new Array(N);
    order.forEach((v, i) => (cards[v] = { place: i, lift: 0 }));
    drawDeck(ctx, m, h * (0.08 + r * 0.23), w - m * 2, h * 0.17, cards, (v) => cardInk(col, v), col);
  }
}

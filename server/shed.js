// ---------------------------------------------------------------------------
// The rules of Switchhead.
//
// Switchhead is the old card game about not being the last one holding cards,
// with two things done to it:
//
//   * **The hands move.** Every few seconds there is an even chance that two
//     players' hands are swapped wholesale. Nothing says when — not the page,
//     not the log, not a message on the socket. The cards in front of you are
//     simply different. That is the room's business (`switchhead.js` keeps
//     the clock) and `shuffleHands` below is the whole of the rule.
//   * **The goal turns over.** Every five to fifteen turns the object flips
//     from getting rid of your cards to hanging on to them, and back. Unlike
//     the swap this *is* announced, loudly: a goal nobody knows about is not
//     a goal. How many turns until the next one is never said.
//
// --- how a game is settled ---------------------------------------------------
//
// Places are filled from both ends. Going out while the goal is to win takes
// the best place still open; going out while the goal is to lose takes the
// *worst*. The last one holding cards takes whatever is left in the middle.
// With no flips at all that is the ordinary game exactly — everybody fills
// from the top and the last one holding cards is the Switchhead — and with
// them, somebody who empties their hand at the wrong moment has won the
// bottom place outright. Picking the pile up is allowed on any turn for the
// same reason: without it, a goal of losing is a goal nobody could pursue.
//
// --- the cards ---------------------------------------------------------------
//
// Three rules are always in play and cannot be taken out:
//
//   * **A two** goes on anything, and anything goes on it.
//   * **A ten** goes on anything and burns the pile. You go again.
//   * **Four of a kind** on top of the pile, however many turns it took to
//     lay them, burns it. Whoever laid the fourth goes again.
//
// Three more are the host's to add:
//
//   * **A seven** is not wild — it goes down under the ordinary rule — but
//     the card after it must be *lower* than a seven.
//   * **A four** goes on anything and is see-through: whoever is next plays
//     against the card underneath it, as though the four were not there.
//   * **A five** goes on anything, but the player who laid it must cover it,
//     there and then, with something higher than a five — or pick the pile
//     up. A two will do, because a two always does; a four will not, because
//     a see-through card covers nothing.
//
// A two and a ten "always work" against the seven and the five as well. That
// is what the host is told on the page, and it is the rule here.
//
// --- what a player may know --------------------------------------------------
//
// `viewFor` is the only thing that decides, as it is at the card table. The
// pile and everybody's face-up cards are public. Nobody's face-down cards are
// sent to anybody — not even their owner — until they are turned over, and
// nobody is sent anybody else's hand: a count, and nothing more.
// `test/switchhead.test.js` reads every message every client receives and
// fails on a card turning up anywhere it should not be.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

// A second pack once the table is big enough that one would not deal out.
// Nine cards a player, so six people is fifty-four: one short.
const PACK_AT = 6;

// Cards in the hand while the deck lasts.
export const HAND = 3;

// The chance, on each tick of the room's clock, that two hands change places.
export const SWAP_CHANCE = 0.5;

// How many turns a goal lasts before it turns over. Worked out afresh at
// every flip, and never sent to anybody.
export const FLIP_MIN = 5;
export const FLIP_MAX = 15;

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // ace high

const WORDS = {
  2: ['two', 'twos'], 3: ['three', 'threes'], 4: ['four', 'fours'], 5: ['five', 'fives'],
  6: ['six', 'sixes'], 7: ['seven', 'sevens'], 8: ['eight', 'eights'], 9: ['nine', 'nines'],
  10: ['ten', 'tens'], 11: ['jack', 'jacks'], 12: ['queen', 'queens'], 13: ['king', 'kings'], 14: ['ace', 'aces'],
};
const COUNTS = ['', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/**
 * The special cards, as the lobby shows them. `fixed` is always in play and
 * the page draws it with a lock; the others are the host's to switch on.
 * Kept here rather than in the page so that what the lobby promises and what
 * the rules do are written down once.
 */
export const SPECIALS = [
  { key: 'two', face: '2', name: 'Twos', fixed: true, say: 'Go on anything, and anything goes on them. The pile starts again.' },
  { key: 'ten', face: '10', name: 'Tens', fixed: true, say: 'Go on anything and burn the pile. You play again.' },
  { key: 'quartet', face: '4×', name: 'Four of a kind', fixed: true, say: 'Four of one rank on top of the pile burns it, however many turns it took. Whoever laid the fourth plays again.' },
  { key: 'seven', face: '7', name: 'Sevens', fixed: false, say: 'Not wild — a seven goes down like any card. But whoever is next must play lower than a seven, or pick up.' },
  { key: 'four', face: '4', name: 'Fours', fixed: false, say: 'See-through. A four goes on anything, and the next player plays against whatever is under it.' },
  { key: 'five', face: '5', name: 'Fives', fixed: false, say: 'Go on anything — but you must cover your five straight away with something higher than a five, or pick up the pile.' },
];
export const OPTIONAL = SPECIALS.filter((s) => !s.fixed).map((s) => s.key);

const systemRand = () => crypto.randomInt(0x100000000) / 0x100000000;
const between = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Lowest to highest, ace high, and by suit within a rank so that the same
// hand always reads the same way. The page never has to sort anything.
const bySuit = (c) => SUITS.indexOf(c.suit);
const inOrder = (cards) => cards.sort((a, b) => a.rank - b.rank || bySuit(a) - bySuit(b));

export const rankName = (rank) => WORDS[rank]?.[0] || String(rank);

// "a seven", "an eight", "three queens".
export function describe(cards) {
  const [one, many] = WORDS[cards[0].rank];
  if (cards.length === 1) return (one === 'eight' || one === 'ace' ? 'an ' : 'a ') + one;
  return `${COUNTS[cards.length] || cards.length} ${many}`;
}

// --- a new game --------------------------------------------------------------

/**
 * Deal a game. `players` is who is sitting down, in order of play; the seat
 * a player is given is their index in it. `rand` is for the tests, which
 * would rather know what was dealt.
 */
export function createGame({ players, specials = {}, rand = systemRand }) {
  const n = players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`Switchhead is for ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`);

  const packs = n >= PACK_AT ? 2 : 1;
  const deck = [];
  let k = 0;
  for (let p = 0; p < packs; p++) {
    for (const suit of SUITS) for (const rank of RANKS) deck.push({ id: 'c' + k++, rank, suit });
  }
  shuffle(deck, rand);

  const seats = players.map((p) => ({
    name: String(p.name || ''),
    hand: [],
    up: [],
    down: [],
    ready: false,
    place: null,
    pickups: 0,
    burns: 0,
  }));
  // Down first, then up, then the hand, a card at a time round the table —
  // the way it is dealt at a real one, not that anybody could tell.
  for (const row of ['down', 'up', 'hand']) {
    for (let i = 0; i < 3; i++) for (const s of seats) s[row].push(deck.pop());
  }
  for (const s of seats) {
    inOrder(s.hand);
    inOrder(s.up);
  }

  return {
    phase: 'swap', // 'swap' before anybody has played, then 'play', then 'ended'
    seats,
    deck,
    pile: [],
    burnt: 0,
    turn: 0,
    goal: 'win',
    flipIn: between(rand, FLIP_MIN, FLIP_MAX),
    flips: 0,
    turns: 0,
    cover: false, // the player on turn has laid a five and must cover it
    specials: Object.fromEntries(OPTIONAL.map((key) => [key, !!specials[key]])),
    places: Array(n).fill(null),
    top: 0, // the best place still open
    bottom: n - 1, // and the worst
    log: [],
    rand,
  };
}

// --- reading the table ---------------------------------------------------------

const LOG_KEEP = 40;
function log(g, text, kind = '') {
  g.log.push({ text, kind });
  if (g.log.length > LOG_KEEP) g.log.splice(0, g.log.length - LOG_KEEP);
}

const inPlay = (g, i) => g.seats[i].place == null;
const holding = (s) => s.hand.length + s.up.length + s.down.length;

/** Where this seat is playing from: the hand, then the face-up row, then blind. */
export function source(s) {
  if (s.hand.length) return 'hand';
  if (s.up.length) return 'up';
  if (s.down.length) return 'down';
  return null;
}

/** The card the next one is played against. A see-through four is not it. */
export function effectiveTop(g) {
  for (let i = g.pile.length - 1; i >= 0; i--) {
    const c = g.pile[i];
    if (g.specials.four && c.rank === 4) continue;
    return c;
  }
  return null;
}

/** Whether a card of this rank may go down now. The whole of the ordering. */
export function canPlay(g, rank) {
  // Covering a five is its own question: higher than a five, or a two.
  if (g.cover) return rank === 2 || rank > 5;
  if (rank === 2 || rank === 10) return true;
  if (g.specials.four && rank === 4) return true;
  if (g.specials.five && rank === 5) return true;
  const top = effectiveTop(g);
  if (!top) return true;
  if (g.specials.seven && top.rank === 7) return rank < 7;
  return rank >= top.rank;
}

/** Every rank that may go down now, for the page to say out loud. */
export const legalRanks = (g) => RANKS.filter((r) => canPlay(g, r));

// Four or more of one rank on top of the pile. A see-through four counts as a
// four here — four of them laid in a row is still four of a kind.
function quartet(g) {
  const p = g.pile;
  if (p.length < 4) return false;
  const rank = p[p.length - 1].rank;
  let run = 0;
  for (let i = p.length - 1; i >= 0 && p[i].rank === rank; i--) run++;
  return run >= 4;
}

// Back up to three from the deck, while it lasts.
function refill(g, s) {
  let drew = false;
  while (s.hand.length < HAND && g.deck.length) {
    s.hand.push(g.deck.pop());
    drew = true;
  }
  if (drew) inOrder(s.hand);
}

function mustBeTurn(g, seat) {
  if (g.phase !== 'play') throw new Error(g.phase === 'swap' ? 'Nobody has started yet.' : 'The game is over.');
  if (g.turn !== seat) throw new Error('It is not your turn.');
}

// --- a turn ------------------------------------------------------------------

/** Lay one or more cards of one rank from the hand or the face-up row. */
export function play(g, seat, ids) {
  mustBeTurn(g, seat);
  const s = g.seats[seat];
  refill(g, s);
  const from = source(s);
  if (from === 'down') throw new Error('Face-down cards are turned over one at a time.');
  if (!Array.isArray(ids) || !ids.length) throw new Error('Pick a card to play.');
  const wanted = [...new Set(ids.map(String))];
  if (wanted.length !== ids.length) throw new Error('That is the same card twice.');
  const row = s[from];
  const cards = wanted.map((id) => row.find((c) => c.id === id));
  if (cards.some((c) => !c)) {
    // Say which rule it was, rather than only that the card is not there: a
    // face-up card is plainly on the table, it is simply not its turn yet.
    const upNow = wanted.some((id) => s.up.some((c) => c.id === id));
    throw new Error(from === 'hand' && upNow ? 'Play the cards in your hand first.' : 'That card is not yours to play.');
  }
  const rank = cards[0].rank;
  if (cards.some((c) => c.rank !== rank)) throw new Error('Cards played together must be the same rank.');
  if (!canPlay(g, rank)) throw new Error(refusal(g, rank));
  s[from] = row.filter((c) => !wanted.includes(c.id));
  lay(g, seat, cards, '');
}

/** Turn over one face-down card and play it, if it will go. */
export function blind(g, seat, index) {
  mustBeTurn(g, seat);
  const s = g.seats[seat];
  refill(g, s);
  if (source(s) !== 'down') throw new Error('Your face-down cards come last.');
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= s.down.length) throw new Error('There is no card there.');
  const [card] = s.down.splice(i, 1);
  if (canPlay(g, card.rank)) return lay(g, seat, [card], ' blind');
  // It will not go: the pile comes up, and the card with it.
  log(g, `${s.name} turned over ${describe([card])}, which will not go.`);
  s.hand.push(card);
  take(g, seat);
}

/** Pick the pile up. Allowed on any turn — when the goal is to lose, it is a move. */
export function pickUp(g, seat) {
  mustBeTurn(g, seat);
  if (!g.pile.length) throw new Error('There is nothing to pick up.');
  take(g, seat);
}

function take(g, seat) {
  const s = g.seats[seat];
  const n = g.pile.length;
  s.hand.push(...g.pile);
  g.pile = [];
  inOrder(s.hand);
  s.pickups += 1;
  log(g, n ? `${s.name} picked up the pile (${n} ${n === 1 ? 'card' : 'cards'}).` : `${s.name} picked up.`, 'pickup');
  g.cover = false;
  advance(g);
}

function lay(g, seat, cards, how) {
  const s = g.seats[seat];
  const covering = g.cover;
  g.pile.push(...cards);
  log(g, `${s.name} played ${describe(cards)}${how}.`);
  refill(g, s);

  if (cards[0].rank === 10 || quartet(g)) {
    g.burnt += g.pile.length;
    g.pile = [];
    g.cover = false;
    s.burns += 1;
    log(g, 'The pile burns.', 'burn');
    // A burn is another go — unless that was the last card, and then there
    // is nobody to have it.
    if (!holding(s)) {
      goOut(g, seat);
      advance(g);
    }
    return;
  }

  if (g.specials.five && cards[0].rank === 5 && !covering && holding(s)) {
    g.cover = true;
    log(g, `${s.name} must cover the five.`, 'cover');
    return;
  }

  g.cover = false;
  if (!holding(s)) goOut(g, seat);
  advance(g);
}

function goOut(g, seat) {
  const s = g.seats[seat];
  if (g.goal === 'win') {
    s.place = g.top + 1;
    g.places[g.top++] = seat;
    log(g, `${s.name} is out — ${ordinal(s.place)}.`, 'out');
  } else {
    s.place = g.bottom + 1;
    g.places[g.bottom--] = seat;
    log(g, `${s.name} went out while the goal was to lose — ${ordinal(s.place)}.`, 'out');
  }
  const left = g.seats.map((_, i) => i).filter((i) => inPlay(g, i));
  if (left.length === 1) {
    const last = left[0];
    g.seats[last].place = g.top + 1;
    g.places[g.top] = last;
    end(g);
  }
}

function end(g) {
  g.phase = 'ended';
  g.cover = false;
  const head = g.places[g.places.length - 1];
  log(g, `${g.seats[head].name} is the Switchhead.`, 'end');
}

function advance(g) {
  if (g.phase !== 'play') return;
  const n = g.seats.length;
  let next = g.turn;
  for (let step = 0; step < n; step++) {
    next = (next + 1) % n;
    if (inPlay(g, next)) break;
  }
  g.turn = next;
  g.turns += 1;
  g.flipIn -= 1;
  if (g.flipIn <= 0) {
    g.goal = g.goal === 'win' ? 'lose' : 'win';
    g.flipIn = between(g.rand, FLIP_MIN, FLIP_MAX);
    g.flips += 1;
    log(g, g.goal === 'lose' ? 'The goal has turned: hang on to your cards.' : 'The goal has turned back: get rid of them.', 'goal');
  }
}

function refusal(g, rank) {
  const name = rankName(rank);
  if (g.cover) return `Cover the five with something higher than a five, or a two — or pick up.`;
  const top = effectiveTop(g);
  if (g.specials.seven && top && top.rank === 7) return `After a seven it has to be lower than a seven. A ${name} will not go.`;
  return `A ${name} will not go on a ${rankName(top.rank)}.`;
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// --- before the first card ---------------------------------------------------

/** Swap a card in the hand for one in the face-up row. Before the start only. */
export function swapUp(g, seat, handId, upId) {
  if (g.phase !== 'swap') throw new Error('The cards are in play. The time for swapping is over.');
  const s = g.seats[seat];
  if (s.ready) throw new Error('You have said you are ready.');
  const h = s.hand.findIndex((c) => c.id === String(handId));
  const u = s.up.findIndex((c) => c.id === String(upId));
  if (h < 0 || u < 0) throw new Error('Pick one card from your hand and one from your face-up row.');
  [s.hand[h], s.up[u]] = [s.up[u], s.hand[h]];
  inOrder(s.hand);
  inOrder(s.up);
}

/** This seat is happy with its face-up row. Once everybody is, play starts. */
export function ready(g, seat) {
  if (g.phase !== 'swap') throw new Error('The cards are already in play.');
  g.seats[seat].ready = true;
  if (g.seats.every((s) => s.ready)) begin(g);
}

// Whoever holds the lowest ordinary card leads. A two, a ten and any special
// the host switched on are not ordinary — nobody leads with a trick.
const OPTIONAL_RANK = { seven: 7, four: 4, five: 5 };

function begin(g) {
  g.phase = 'play';
  const tricks = new Set([2, 10, ...OPTIONAL.filter((k) => g.specials[k]).map((k) => OPTIONAL_RANK[k])]);
  let best = null;
  g.seats.forEach((s, i) => {
    for (const c of s.hand) {
      if (tricks.has(c.rank)) continue;
      if (!best || c.rank < best.rank) best = { rank: c.rank, seat: i };
    }
  });
  g.turn = best ? best.seat : 0;
  log(g, `${g.seats[g.turn].name} has the lowest card and leads.`);
}

// --- the swap ----------------------------------------------------------------

/**
 * One tick of the room's clock: an even chance that two hands change places.
 * Only hands with something in them are swapped — a player down to their
 * face-up row has no hand to lose, and handing them somebody else's would
 * put cards back into a game they have all but finished by luck alone.
 *
 * Returns whether anything moved. Nothing is written to the log: there is
 * deliberately no trace of a swap anywhere but in the cards themselves.
 */
export function shuffleHands(g, rand = g.rand) {
  if (g.phase !== 'play') return false;
  if (rand() >= SWAP_CHANCE) return false;
  const holders = g.seats.map((_, i) => i).filter((i) => inPlay(g, i) && g.seats[i].hand.length);
  if (holders.length < 2) return false;
  const a = holders.splice(Math.floor(rand() * holders.length), 1)[0];
  const b = holders[Math.floor(rand() * holders.length)];
  const sa = g.seats[a];
  const sb = g.seats[b];
  [sa.hand, sb.hand] = [sb.hand, sa.hand];
  return true;
}

// --- for the room ------------------------------------------------------------

/**
 * Move an away player on: they pick the pile up, which is what not playing
 * costs. On an empty pile there is nothing to pick up, so the lowest card
 * they can reach goes down instead. Before the start, it says they are ready.
 */
export function nudge(g, seat) {
  if (g.phase === 'swap') return ready(g, seat);
  mustBeTurn(g, seat);
  const s = g.seats[seat];
  refill(g, s);
  if (g.pile.length) return pickUp(g, seat);
  const from = source(s);
  if (from === 'down') return blind(g, seat, 0);
  const card = s[from].find((c) => canPlay(g, c.rank)) || s[from][0];
  play(g, seat, [card.id]);
}

/** The finishing order, best first, once there is one. */
export function standings(g) {
  if (g.phase !== 'ended') return null;
  return g.places.map((seat, i) => {
    const s = g.seats[seat];
    return { seat, name: s.name, place: i + 1, head: i === g.places.length - 1, pickups: s.pickups, burns: s.burns };
  });
}

const card = (c) => ({ id: c.id, rank: c.rank, suit: c.suit });

/**
 * The game as one seat sees it. `seat` of -1 is somebody watching.
 *
 * What is never in here: anybody's face-down cards, the order of the deck,
 * anybody's hand but your own, and how many turns until the goal turns over.
 */
export function viewFor(g, seat) {
  const mine = seat >= 0 && seat < g.seats.length ? g.seats[seat] : null;
  const top = effectiveTop(g);
  return {
    phase: g.phase,
    goal: g.goal,
    flips: g.flips,
    turn: g.turn,
    cover: g.cover,
    specials: g.specials,
    deck: g.deck.length,
    burnt: g.burnt,
    pile: {
      count: g.pile.length,
      // The last few, fanned. The whole pile is public at a real table, but
      // eight is as many as anybody reads.
      cards: g.pile.slice(-8).map(card),
      top: top ? card(top) : null,
    },
    legal: g.phase === 'play' ? legalRanks(g) : [],
    seats: g.seats.map((s, i) => ({
      seat: i,
      name: s.name,
      hand: s.hand.length,
      up: s.up.map(card),
      down: s.down.length,
      ready: s.ready,
      place: s.place,
      pickups: s.pickups,
    })),
    you: mine
      ? {
          seat,
          hand: mine.hand.map(card),
          up: mine.up.map(card),
          down: mine.down.length,
          from: source(mine),
          ready: mine.ready,
          place: mine.place,
        }
      : null,
    log: g.log.slice(-12),
    standings: standings(g),
  };
}

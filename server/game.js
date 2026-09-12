// ---------------------------------------------------------------------------
// The rules of Thievery.
//
// A round runs in three stages. Everyone arranges their hand in ascending
// order and locks it in; the rows are then turned face down, showing every
// card's colour but no ranks. Play passes round the table: in a partnership
// game your partner may first show you one of their cards in private, then
// you point at an opponent's card and name a rank. A hit flips the card and
// earns another go, a miss passes the turn. The first player or team with
// every opponent card face up takes the round.
//
// Hidden ranks stay here. Each player is only ever handed the cards they are
// entitled to see.
// ---------------------------------------------------------------------------

import { dealSplit, shuffle, PLAYER_COUNTS, MIN_PLAYERS, MAX_PLAYERS } from './deal.js';

export const RANK_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const rankName = (r) => RANK_NAMES[r - 1];

// Ranks are spoken, never spelled with a suit: the table can already see every
// card's colour, and naming the suit would give away more than the rules do.
const RANK_WORDS = { 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' };
export const rankWord = (r) => RANK_WORDS[r] || String(r);
export const aRank = (r) => `${r === 1 || r === 8 ? 'an' : 'a'} ${rankWord(r)}`;

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// One red suit and one black suit, Ace low through King.
export function makeDeck() {
  const deck = [];
  for (const color of ['red', 'black']) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ id: `${color[0]}${rank}`, color, rank });
  }
  return deck;
}

// --- starting a round ------------------------------------------------------

export function createGame({ numPlayers, teams, startSeat, names, counts: customCounts }) {
  if (!PLAYER_COUNTS.includes(numPlayers)) throw new Error(`Thievery.co.uk supports ${MIN_PLAYERS} to ${MAX_PLAYERS} players`);
  // Partnerships are a four-handed game: everyone has exactly one partner,
  // sitting opposite, and exactly two opponents.
  const useTeams = !!teams && numPlayers === 4;
  const deck = shuffle(makeDeck());
  // The host can fix a hand size for every seat; otherwise the round uses the
  // shuffled split for this many players.
  const counts = customCounts ? [...customCounts] : dealSplit(numPlayers);
  if (counts.length !== numPlayers || counts.reduce((a, b) => a + b, 0) !== 26 || counts.some((c) => c < 1)) {
    throw new Error('Hand sizes must add up to 26 cards');
  }
  const seats = [];
  let p = 0;
  for (let s = 0; s < numPlayers; s++) {
    const hand = deck.slice(p, p + counts[s]);
    p += counts[s];
    // Everyone starts from a tidy ascending row, black before red where two
    // cards share a rank. Same-rank pairs can be flipped before locking in.
    hand.sort((a, b) => a.rank - b.rank || (a.color === 'black' ? -1 : 1));
    seats.push({ cards: hand.map((c) => ({ ...c, faceUp: false })), locked: false });
  }
  const g = {
    numPlayers,
    teams: useTeams,
    names: [...names],
    phase: 'arrange', // arrange | play | ended
    seats,
    turn: startSeat,
    step: null, // show | guess
    known: seats.map(() => []), // cards a partner has shown this player, as "seat:idx"
    result: null, // { winners: [seat], losers: [seat], text }
    log: [],
  };
  log(g, `Round started. ${g.names[startSeat]} goes first. Arrange your cards in ascending order (aces can go anywhere).`, { kind: 'turn' });
  return g;
}

// --- who is on whose side --------------------------------------------------

export const teamOf = (g, seat) => (g.teams ? seat % 2 : seat);
export const partnerOf = (g, seat) => (g.teams ? (seat + 2) % g.numPlayers : null);
export const isOpponent = (g, a, b) => a !== b && teamOf(g, a) !== teamOf(g, b);

export function teamLabel(g, team) {
  const members = g.names.filter((_, s) => teamOf(g, s) === team);
  return members.join(' & ');
}

export function guessTargets(g, seat) {
  const out = [];
  g.seats.forEach((s, si) => {
    if (!isOpponent(g, seat, si)) return;
    s.cards.forEach((c, ci) => {
      if (!c.faceUp) out.push({ seat: si, idx: ci });
    });
  });
  return out;
}

const faceDownCount = (g, seat) => g.seats[seat].cards.filter((c) => !c.faceUp).length;

// Everything that happens at the table is written to the log. A line can also
// carry a private version, shown only to the player it belongs to.
function log(g, text, opts = {}) {
  const entry = { text };
  if (opts.kind) entry.kind = opts.kind;
  if (opts.event) entry.event = opts.event;
  if (opts.privSeat !== undefined) {
    entry.privSeat = opts.privSeat;
    entry.privText = opts.privText;
  }
  g.log.push(entry);
}

function requirePlay(g) {
  if (g.phase !== 'play') throw new Error('The game is not in progress');
}
function requireTurn(g, seat) {
  if (g.turn !== seat) throw new Error("It's not your turn");
}
function validRank(rank) {
  if (!Number.isInteger(rank) || rank < 1 || rank > 13) throw new Error('Pick a rank from Ace to King');
}

function startTurn(g) {
  log(g, `It's ${g.names[g.turn]}'s turn.`, { kind: 'turn' });
  if (g.teams) {
    const partner = partnerOf(g, g.turn);
    if (faceDownCount(g, partner) === 0) {
      log(g, `${g.names[partner]} has no face-down cards to show.`);
      g.step = 'guess';
    } else {
      g.step = 'show';
    }
  } else {
    g.step = 'guess';
  }
}

function nextTurn(g) {
  g.turn = (g.turn + 1) % g.numPlayers;
  startTurn(g);
}

// --- arranging your hand ---------------------------------------------------

export function lockOrder(g, seat, order) {
  if (g.phase !== 'arrange') throw new Error('Not in the arranging phase');
  const s = g.seats[seat];
  if (s.locked) throw new Error('You have already locked in your cards');
  if (!Array.isArray(order) || order.length !== s.cards.length) throw new Error('Invalid card order');
  const byId = new Map(s.cards.map((c) => [c.id, c]));
  const newCards = order.map((id) => byId.get(id));
  if (newCards.some((c) => !c) || new Set(order).size !== order.length) throw new Error('Invalid card order');
  // Aces are wild in position and may sit anywhere in the row. Every other
  // card has to be in ascending order relative to the rest.
  const nonAces = newCards.filter((c) => c.rank !== 1);
  for (let i = 1; i < nonAces.length; i++) {
    if (nonAces[i].rank < nonAces[i - 1].rank) throw new Error('Cards (other than aces) must be in ascending order');
  }
  s.cards = newCards;
  s.locked = true;
  log(g, `${g.names[seat]} placed their cards.`);
  if (g.seats.every((x) => x.locked)) {
    g.phase = 'play';
    log(g, 'Everyone has placed their cards. Red cards are shown sideways, black cards upright.', { kind: 'turn' });
    startTurn(g);
  }
}

// --- the show (partnership games) ------------------------------------------

export function showCard(g, seat, idx) {
  requirePlay(g);
  if (g.step !== 'show') throw new Error('Not the showing step');
  const active = g.turn;
  if (seat !== partnerOf(g, active)) throw new Error("Only the active player's partner can show a card");
  const c = g.seats[seat].cards[idx];
  if (!c) throw new Error('No such card');
  if (c.faceUp) throw new Error('That card is already face up');
  const key = `${seat}:${idx}`;
  if (!g.known[active].includes(key)) g.known[active].push(key);
  log(g, `${g.names[seat]} showed ${g.names[active]} one of their cards.`, {
    privSeat: active,
    privText: `${g.names[seat]} showed you their ${ordinal(idx + 1)} card: ${aRank(c.rank)}.`,
  });
  g.step = 'guess';
}

export function skipShow(g, seat, { allowActive = false } = {}) {
  requirePlay(g);
  if (g.step !== 'show') throw new Error('Not the showing step');
  const active = g.turn;
  const partner = partnerOf(g, active);
  if (seat === partner) {
    log(g, `${g.names[seat]} chose not to show ${g.names[active]} a card.`);
  } else if (seat === active && allowActive) {
    log(g, `${g.names[active]} skipped the show (partner unavailable).`);
  } else {
    throw new Error("Only the active player's partner can skip the show");
  }
  g.step = 'guess';
}

// --- the guess -------------------------------------------------------------

export function guess(g, seat, target, rank) {
  requirePlay(g);
  if (g.step !== 'guess') throw new Error('Not the guessing step');
  requireTurn(g, seat);
  const ts = target?.seat;
  const idx = target?.idx;
  if (!Number.isInteger(ts) || !Number.isInteger(idx)) throw new Error('Pick a card to guess');
  if (ts < 0 || ts >= g.numPlayers) throw new Error('No such seat');
  if (!isOpponent(g, seat, ts)) throw new Error("You can only guess an opponent's card");
  const c = g.seats[ts].cards[idx];
  if (!c) throw new Error('No such card');
  if (c.faceUp) throw new Error('That card is already face up');
  validRank(rank);

  const desc = `${g.names[seat]} guessed ${g.names[ts]}'s ${ordinal(idx + 1)} card is ${aRank(rank)}`;
  const event = { type: 'guess', by: seat, target: { seat: ts, idx }, rank, correct: c.rank === rank };
  if (c.rank === rank) {
    c.faceUp = true;
    event.card = aRank(c.rank);
    const winner = findWinner(g);
    if (winner !== null) {
      log(g, `${desc} — correct!`, { kind: 'good', event });
      finishRound(g, winner);
      return;
    }
    // A hit is free: the card turns over and the same player goes again.
    log(g, `${desc} — correct! ${g.names[seat]} guesses again.`, { kind: 'good', event });
    g.step = 'guess';
  } else {
    // A miss costs nothing but the turn.
    log(g, `${desc} — incorrect.`, { kind: 'bad', event });
    nextTurn(g);
  }
}

// --- ending the round ------------------------------------------------------

// The round is over the moment somebody has nothing left to guess at: every
// card belonging to their opponents is already face up.
function findWinner(g) {
  for (let seat = 0; seat < g.numPlayers; seat++) {
    if (guessTargets(g, seat).length === 0) return seat;
  }
  return null;
}

function finishRound(g, seat) {
  g.phase = 'ended';
  const team = teamOf(g, seat);
  const all = g.seats.map((_, s) => s);
  const winners = all.filter((s) => teamOf(g, s) === team);
  const losers = all.filter((s) => teamOf(g, s) !== team);
  const text = g.teams
    ? `Every ${teamLabel(g, 1 - team)} card is face up — ${teamLabel(g, team)} win the round!`
    : `Every other card is face up — ${g.names[seat]} wins the round!`;
  g.result = { winners, losers, text };
  // Nothing is secret once the round is over.
  g.seats.forEach((s) => s.cards.forEach((c) => (c.faceUp = true)));
  log(g, text, { kind: 'result', event: { type: 'result', winners, losers } });
}

// --- what a player is allowed to see ---------------------------------------
//
// You see a rank if the card is yours, if it is face up, or if your partner
// has shown it to you. Nothing else. Colours stay hidden until everyone has
// locked their row in, so nobody gets a head start while people arrange.

export function viewFor(g, viewer) {
  const known = new Set(g.known[viewer] || []);
  const colorsPublic = g.phase !== 'arrange';
  const seats = g.seats.map((s, si) => {
    const mine = si === viewer;
    return {
      locked: s.locked,
      team: teamOf(g, si),
      cards: s.cards.map((c, ci) => {
        const shown = !mine && !c.faceUp && known.has(`${si}:${ci}`);
        const canSee = mine || c.faceUp || shown;
        const card = {
          faceUp: c.faceUp,
          color: mine || colorsPublic ? c.color : null,
          rank: canSee ? c.rank : null,
          shown,
        };
        if (mine) card.id = c.id;
        return card;
      }),
    };
  });
  return {
    phase: g.phase,
    numPlayers: g.numPlayers,
    teams: g.teams,
    names: g.names,
    turn: g.turn,
    step: g.step,
    partnerSeat: partnerOf(g, viewer),
    result: g.result,
    seats,
    logTotal: g.log.length, // how many lines exist in total, so new ones can be spotted
    log: g.log.slice(-250).map((e) => ({
      kind: e.kind || null,
      text: e.privSeat === viewer ? e.privText : e.text,
      priv: e.privSeat === viewer,
      event: e.event || null,
    })),
  };
}

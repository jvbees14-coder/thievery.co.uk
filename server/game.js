// ---------------------------------------------------------------------------
// Thievery.co.uk — pure game logic. No networking in here.
//
// The game object is the single source of truth and lives only on the server.
// Clients never receive it directly; they get `viewFor(game, seat)`, which
// strips out every rank the viewer isn't entitled to know.
// ---------------------------------------------------------------------------

import { dealSplit, shuffle } from './deal.js';

export const RANK_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const rankName = (r) => RANK_NAMES[r - 1];
const SUIT = { red: '♥', black: '♠' };
export const cardName = (c) => `${rankName(c.rank)}${SUIT[c.color]}`;

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function makeDeck() {
  const deck = [];
  for (const color of ['red', 'black']) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ id: `${color[0]}${rank}`, color, rank });
  }
  return deck;
}

// --- construction ----------------------------------------------------------

export function createGame({ numPlayers, teams, startSeat, names, counts: customCounts }) {
  if (![3, 4].includes(numPlayers)) throw new Error('Thievery.co.uk supports 3 or 4 players');
  const useTeams = !!teams && numPlayers === 4;
  const deck = shuffle(makeDeck());
  // Hand sizes: the host may fix them per seat; otherwise use the random split.
  const counts = customCounts ? [...customCounts] : dealSplit(numPlayers);
  if (counts.length !== numPlayers || counts.reduce((a, b) => a + b, 0) !== 26 || counts.some((c) => c < 1)) {
    throw new Error('Hand sizes must add up to 26 cards');
  }
  const seats = [];
  let p = 0;
  for (let s = 0; s < numPlayers; s++) {
    const hand = deck.slice(p, p + counts[s]);
    p += counts[s];
    // Default arrangement: ascending, black before red on ties. Players can
    // flip same-rank pairs before locking in.
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
    known: seats.map(() => []), // per seat: ["seat:idx"] cards a partner has shown them
    result: null, // { winners: [seat], losers: [seat], text }
    log: [],
  };
  log(g, `Round started. ${g.names[startSeat]} goes first. Arrange your cards in ascending order (aces can go anywhere).`, { kind: 'turn' });
  return g;
}

// --- helpers ---------------------------------------------------------------

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

function log(g, text, opts = {}) {
  const entry = { text };
  if (opts.kind) entry.kind = opts.kind;
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

// --- arrange phase ---------------------------------------------------------

export function lockOrder(g, seat, order) {
  if (g.phase !== 'arrange') throw new Error('Not in the arranging phase');
  const s = g.seats[seat];
  if (s.locked) throw new Error('You have already locked in your cards');
  if (!Array.isArray(order) || order.length !== s.cards.length) throw new Error('Invalid card order');
  const byId = new Map(s.cards.map((c) => [c.id, c]));
  const newCards = order.map((id) => byId.get(id));
  if (newCards.some((c) => !c) || new Set(order).size !== order.length) throw new Error('Invalid card order');
  // Aces are wild in position: they may sit anywhere in the row. Every other
  // card must be in ascending order relative to the other non-aces.
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

// --- the show --------------------------------------------------------------

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
    privText: `${g.names[seat]} showed you their ${ordinal(idx + 1)} card: ${cardName(c)}.`,
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

  const desc = `${g.names[seat]} guessed ${g.names[ts]}'s ${ordinal(idx + 1)} card is a ${rankName(rank)}`;
  if (c.rank === rank) {
    c.faceUp = true;
    const winner = findWinner(g);
    if (winner !== null) {
      log(g, `${desc} — correct! It's the ${cardName(c)}.`, { kind: 'good' });
      finishRound(g, winner);
      return;
    }
    log(g, `${desc} — correct! It's the ${cardName(c)}. ${g.names[seat]} guesses again.`, { kind: 'good' });
    // A correct guess earns another guess; the turn only passes on a miss.
    g.step = 'guess';
  } else {
    // A wrong guess costs nothing: the turn simply passes.
    log(g, `${desc} — incorrect.`, { kind: 'bad' });
    nextTurn(g);
  }
}

// --- ending the round ------------------------------------------------------

// The round ends as soon as some player (or team) has every opponent card face
// up. Returns that seat, or null if the round continues.
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
  // Everything is public once the round is over.
  g.seats.forEach((s) => s.cards.forEach((c) => (c.faceUp = true)));
  log(g, text, { kind: 'result' });
}

// --- per-player view -------------------------------------------------------
//
// This is the ONLY thing that ever leaves the server. A card's rank is
// included only if the viewer owns it, it's face up, or their partner has
// shown it to them. Colors are hidden until everyone has locked in.

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
    log: g.log.slice(-250).map((e) => ({
      kind: e.kind || null,
      text: e.privSeat === viewer ? e.privText : e.text,
      priv: e.privSeat === viewer,
    })),
  };
}

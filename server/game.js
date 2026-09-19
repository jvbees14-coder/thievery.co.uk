// ---------------------------------------------------------------------------
// The rules of Thievery.
//
// A round runs in three stages. Every hand is arranged in ascending order and
// locked in; the rows are then turned face down, showing every card's colour
// but no ranks. Play passes round the table: in a partnership game the
// partner hand may first show the active hand one of its cards, then the
// active hand points at an opponent's card and names a rank. A hit flips the
// card and earns another go, a miss passes the turn. The first hand or team
// with every opponent card face up takes the round.
//
// A "seat" here is one hand, not one person. Up to two players can share a
// seat: they see the same cards, and either of them may act when the seat's
// turn comes round. Everything below is written in terms of seats, and the
// room server hands in a name for each one — "Ivy" on a seat of one, "Ivy &
// Sam" on a seat of two.
//
// Five and six hands are dealt with power-ups, which are the same twenty-six
// cards' answer to rows too short to fence anything in. They can read a card,
// forgive a wrong guess, protect a hand or cut somebody's run short; the
// catalog is in powerups.js and every rule about them is below, under "the
// power-ups". There is no way to switch them off at those sizes and no way to
// switch them on below them.
//
// Hidden ranks stay here. Each seat is only ever handed the cards it is
// entitled to see — and a power-up that shows somebody a card goes through
// the same `known` list a partner's show does, so there is exactly one path
// by which a rank reaches anybody who does not own it.
// ---------------------------------------------------------------------------

import { dealSplit, shuffle, SEAT_COUNTS, MIN_SEATS, MAX_SEATS, usesPowerUps } from './deal.js';
import * as PowerUps from './powerups.js';

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

// A name that already ends in an s takes the apostrophe and nothing after it.
// This is in the log every single turn, and "Fingers's 1st card" reads as a
// mistake however well it can be defended. A shared hand is "Ivy & Sam", which
// ends in the second name and so follows the same rule.
const possessive = (name) => `${name}${/s$/i.test(String(name)) ? "'" : "'s"}`;

// One red suit and one black suit, Ace low through King.
export function makeDeck() {
  const deck = [];
  for (const color of ['red', 'black']) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ id: `${color[0]}${rank}`, color, rank });
  }
  return deck;
}

// --- starting a round ------------------------------------------------------

export function createGame({ numSeats, teams, startSeat, names, counts: customCounts, botSeats = [] }) {
  if (!SEAT_COUNTS.includes(numSeats)) throw new Error(`A table is dealt ${MIN_SEATS} to ${MAX_SEATS} hands`);
  // Partnerships are a four-handed game: every seat has exactly one partner,
  // sitting opposite, and exactly two opponents.
  const useTeams = !!teams && numSeats === 4;
  const powered = usesPowerUps(numSeats);
  const deck = shuffle(makeDeck());
  // The host can fix a hand size for every seat; otherwise the round uses the
  // shuffled split for this many hands.
  const counts = customCounts ? [...customCounts] : dealSplit(numSeats);
  if (counts.length !== numSeats || counts.reduce((a, b) => a + b, 0) !== 26 || counts.some((c) => c < 1)) {
    throw new Error('Hand sizes must add up to 26 cards');
  }
  const seats = [];
  let p = 0;
  for (let s = 0; s < numSeats; s++) {
    const hand = deck.slice(p, p + counts[s]);
    p += counts[s];
    // Everyone starts from a tidy ascending row. The deck is shuffled and the
    // sort is stable, so where two cards share a rank they come out whichever
    // way round they were dealt — no colour always leads. Same-rank pairs can
    // be flipped before locking in.
    hand.sort((a, b) => a.rank - b.rank);
    seats.push({ cards: hand.map((c) => ({ ...c, faceUp: false })), locked: false });
  }
  const g = {
    numSeats,
    teams: useTeams,
    names: [...names],
    phase: 'arrange', // arrange | play | ended
    seats,
    turn: startSeat,
    step: null, // show | guess
    known: seats.map(() => []), // cards shown to this player, as "seat:idx"

    // --- the power-up table ---
    powered, // five and six hands only, and not optional at those
    botSeats: [...botSeats], // the house does not draw; see startTurn
    kit: seats.map(() => []), // what each hand is carrying, by id
    chain: 0, // correct guesses in the run going on now
    spare: seats.map(() => 0), // wrong guesses this hand has been forgiven
    forced: seats.map(() => null), // a hand this player's next guess must go at
    shielded: seats.map(() => false), // stakeout: nobody may guess against it
    guessed: false, // has the hand on turn guessed yet this turn
    played: [], // power-ups played this turn, so nothing stacks with itself
    // Every guess that missed, as [seat, idx, rank]. It is said out loud at
    // the table and it is in the log, so it belongs to everybody: that card is
    // not that rank, and nobody need try it again.
    misses: [],
    result: null, // { winners: [seat], losers: [seat], text }
    log: [],
  };
  log(g, `Round started. First to play: ${g.names[startSeat]}. Arrange your cards in ascending order (aces can go anywhere).`, { kind: 'turn' });
  return g;
}

// --- who is on whose side --------------------------------------------------

export const teamOf = (g, seat) => (g.teams ? seat % 2 : seat);
export const partnerOf = (g, seat) => (g.teams ? (seat + 2) % g.numSeats : null);
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

// A hand with every one of its own cards face up has nothing left to hide.
// It stays in the round — in teams, its partner plays on regardless — but
// it has no turn of its own any more.
export const isEliminated = (g, seat) => faceDownCount(g, seat) === 0;

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
  // A new turn is a clean slate: no run in progress, no guesses forgiven, and
  // nothing played yet that anything else could stack on.
  g.chain = 0;
  g.guessed = false;
  g.played = [];
  g.spare[g.turn] = 0;
  // A stakeout holds until the hand it was cast on comes round again, and
  // that is now.
  if (g.shielded[g.turn]) {
    g.shielded[g.turn] = false;
    log(g, `The stakeout on ${g.names[g.turn]} is lifted.`);
  }
  drawPowerUp(g, g.turn);

  log(g, `It's ${possessive(g.names[g.turn])} turn.`, { kind: 'turn' });

  // Stakeouts do not count towards winning, but between them they can leave a
  // hand with nothing it is allowed to shoot at. Rather than stall the round
  // the turn passes; every shield lifts on its own hand's turn, so the table
  // cannot go round for ever like this.
  if (g.powered && guessTargets(g, g.turn).length && !openTargets(g, g.turn).length) {
    log(g, `Every hand ${g.names[g.turn]} could guess at is under a stakeout. The turn passes.`);
    g.step = 'guess';
    return nextTurn(g);
  }

  if (g.teams) {
    const partner = partnerOf(g, g.turn);
    if (faceDownCount(g, partner) === 0) {
      log(g, `Nothing left to show: every card at ${g.names[partner]} is already face up.`);
      g.step = 'guess';
    } else {
      g.step = 'show';
    }
  } else {
    g.step = 'guess';
  }
}

function nextTurn(g) {
  let seat = g.turn;
  for (let i = 0; i < g.numSeats; i++) {
    seat = (seat + 1) % g.numSeats;
    if (!isEliminated(g, seat)) break;
    log(g, `${g.names[seat]} has nothing left to hide and is skipped.`);
  }
  g.turn = seat;
  startTurn(g);
}

// --- the power-ups ---------------------------------------------------------
//
// Everything below is only ever reached at a five or six-hand table. The
// catalog and the odds live in powerups.js; these are the rules.

// The hands a seat may actually shoot at now: its opponents' face-down cards,
// less anything under a stakeout. Deliberately not the same thing as
// guessTargets, which decides who has won — a shield must never win anybody a
// round by making the table look empty.
function openTargets(g, seat) {
  return guessTargets(g, seat).filter((t) => !g.shielded[t.seat]);
}

/**
 * What a seat may actually guess at this moment: the above, narrowed to one
 * hand while an order to shoot there still stands. An order whose hand has
 * since been shielded or turned entirely face up has lapsed, exactly as
 * `guess` below reads it, so it stops narrowing anything.
 *
 * This is for the house, which has to pick a move it knows will be allowed —
 * a refused move leaves the turn sitting in a bot's hand and the table
 * waiting on it. `guessTargets` decides who has won and must stay blind to
 * every word of it.
 */
export function legalTargets(g, seat) {
  const open = openTargets(g, seat);
  const sent = g.forced[seat];
  if (sent === null || sent === undefined) return open;
  const there = open.filter((t) => t.seat === sent);
  return there.length ? there : open;
}

// One draw at the start of your own turn, and never one per guess: a long run
// is already its own reward and should not also be a pile of power-ups. A
// hand at the limit draws nothing until it has spent something.
//
// The house does not draw at all. Power-ups are the players' answer to a thin
// table, and a bot sitting on three of them is three fewer in play.
function drawPowerUp(g, seat) {
  if (!g.powered) return;
  if (g.botSeats.includes(seat)) return;
  const kit = g.kit[seat];
  if (kit.length >= PowerUps.HAND_LIMIT) {
    log(g, `${g.names[seat]} is carrying all they can and draws nothing.`, {
      privSeat: seat,
      privText: `You are already carrying ${PowerUps.HAND_LIMIT} power-ups, so you draw nothing. Play one to make room.`,
    });
    return;
  }
  const drawn = PowerUps.draw(kit);
  if (!drawn) return;
  kit.push(drawn.id);
  log(g, `${g.names[seat]} drew a power-up.`, {
    privSeat: seat,
    privText: `You drew ${drawn.name} \u2014 ${drawn.blurb}`,
  });
}

const holds = (g, seat, id) => g.kit[seat].includes(id);

function spend(g, seat, id) {
  const at = g.kit[seat].indexOf(id);
  if (at < 0) throw new Error('You are not carrying that');
  g.kit[seat].splice(at, 1);
  g.played.push(`${seat}:${id}`);
}

// A face-down card belonging to somebody else, which is what the reveals all
// want and none of them may skip checking.
function otherCard(g, seat, target) {
  const ts = target?.seat;
  const idx = target?.idx;
  if (!Number.isInteger(ts) || !Number.isInteger(idx)) throw new Error('Pick a card');
  if (ts < 0 || ts >= g.numSeats) throw new Error('No such hand');
  if (ts === seat) throw new Error('Pick a card that is not your own');
  const c = g.seats[ts].cards[idx];
  if (!c) throw new Error('No such card');
  if (c.faceUp) throw new Error('That card is already face up');
  return c;
}

function otherHand(g, seat, hand) {
  if (!Number.isInteger(hand) || hand < 0 || hand >= g.numSeats) throw new Error('No such hand');
  if (hand === seat) throw new Error('Pick another hand');
  return hand;
}

// Let one seat see one card, by the same route a partner's show uses. It is
// kept per-viewer and written nowhere shared, so what one player is shown
// does not quietly become common knowledge for the rest of the round.
function reveal(g, viewer, ts, idx) {
  const key = `${ts}:${idx}`;
  if (!g.known[viewer].includes(key)) g.known[viewer].push(key);
}

/**
 * Play one. `seat` is the hand playing it rather than the person: two people
 * sharing a hand share its power-ups, exactly as they share its cards.
 *
 * All but one of these are yours to play on your own turn. The alarm is the
 * table's, and anybody may pull it whenever it needs pulling.
 */
export function playPowerUp(g, seat, id, opts = {}) {
  requirePlay(g);
  if (!g.powered) throw new Error('This table is not playing with power-ups');
  const card = PowerUps.byId(id);
  if (!card) throw new Error('No such power-up');
  if (!holds(g, seat, id)) throw new Error('You are not carrying that');

  // The alarm is the one thing that does not wait for your turn.
  if (id !== 'alarm_trip') {
    requireTurn(g, seat);
    if (g.step !== 'guess') throw new Error('Wait until it is your turn to play');
  }

  switch (id) {
    // --- reading the table ---
    case 'casing_the_joint': {
      const c = otherCard(g, seat, opts.target);
      spend(g, seat, id);
      reveal(g, seat, opts.target.seat, opts.target.idx);
      log(g, `${g.names[seat]} cased the joint.`, {
        privSeat: seat,
        privText: `${possessive(g.names[opts.target.seat])} ${ordinal(opts.target.idx + 1)} card is ${aRank(c.rank)}. Nobody else was told.`,
      });
      break;
    }
    case 'loose_lips': {
      const rank = Number(opts.rank);
      validRank(rank);
      spend(g, seat, id);
      // Counted fresh every time it is asked, because the answer changes with
      // every card that turns over.
      let left = 0;
      for (const s of g.seats) for (const c of s.cards) if (!c.faceUp && c.rank === rank) left += 1;
      log(g, `${g.names[seat]} listened for loose lips about ${rankWord(rank)}s.`, {
        privSeat: seat,
        privText: `${left || 'No'} ${rankWord(rank)}${left === 1 ? '' : 's'} still face down across the whole table. You were not told where.`,
      });
      break;
    }

    // --- buying another go ---
    case 'second_story': {
      if (g.played.includes(`${seat}:second_story`)) throw new Error('One second storey to a turn');
      spend(g, seat, id);
      g.spare[seat] += 1;
      log(g, `${g.names[seat]} went in by the second storey. Their next wrong guess will not end the turn.`);
      break;
    }
    case 'pickpocket': {
      // Never part-way through a run. Without this a lucky hand could stack
      // pickpockets onto a chain and take a turn with no end to it, which is
      // the one failure a four-hand table never has to worry about.
      if (g.chain > 0) throw new Error('A pickpocket works at the start of a turn, not part-way through a run');
      if (g.guessed) throw new Error('A pickpocket works before your first guess of the turn');
      const hand = otherHand(g, seat, Number(opts.hand));
      if (g.shielded[hand]) throw new Error('That hand is under a stakeout');
      if (!g.seats[hand].cards.some((c) => !c.faceUp)) throw new Error('Every card in that hand is face up');
      spend(g, seat, id);
      g.spare[seat] += 1;
      g.forced[seat] = hand;
      log(g, `${g.names[seat]} picked ${possessive(g.names[hand])} pocket: an extra guess at that hand, and a wrong one will not cost the turn.`);
      break;
    }

    // --- interrupting somebody ---
    case 'alarm_trip': {
      if (g.chain < 1) throw new Error('There is no run to stop');
      const running = g.turn;
      spend(g, seat, id);
      log(g, `${g.names[seat]} tripped the alarm on ${g.names[running]} after ${g.chain} in a row. The turn passes.`, { kind: 'bad' });
      // Whatever the running hand had been forgiven goes with the run.
      g.spare[running] = 0;
      g.forced[running] = null;
      nextTurn(g);
      break;
    }
    case 'stakeout': {
      const hand = otherHand(g, seat, Number(opts.hand));
      spend(g, seat, id);
      g.shielded[hand] = true;
      log(g, `${g.names[seat]} set a stakeout on ${g.names[hand]}. Nobody may guess against that hand until it plays again.`);
      break;
    }
    case 'misdirection': {
      const who = otherHand(g, seat, Number(opts.player));
      const hand = Number(opts.hand);
      if (!Number.isInteger(hand) || hand < 0 || hand >= g.numSeats) throw new Error('No such hand');
      if (hand === who) throw new Error('Nobody can be sent at their own hand');
      spend(g, seat, id);
      g.forced[who] = hand;
      log(g, `${g.names[seat]} sent ${g.names[who]} after ${g.names[hand]}. They still choose the rank.`);
      break;
    }

    // --- the vault ---
    case 'vault_crack': {
      const c = otherCard(g, seat, opts.target);
      if (g.shielded[opts.target.seat]) throw new Error('That hand is under a stakeout');
      spend(g, seat, id);
      c.faceUp = true;
      g.chain += 1;
      g.guessed = true;
      g.forced[seat] = null;
      const desc = `${g.names[seat]} cracked the vault on ${possessive(g.names[opts.target.seat])} ${ordinal(opts.target.idx + 1)} card: ${aRank(c.rank)}`;
      const event = { type: 'guess', by: seat, target: { seat: opts.target.seat, idx: opts.target.idx }, rank: c.rank, correct: true, card: aRank(c.rank) };
      const winner = findWinner(g);
      if (winner !== null) {
        log(g, `${desc}.`, { kind: 'good', event });
        finishRound(g, winner);
        return;
      }
      // It turns over like a correct guess, so it earns another go like one.
      log(g, `${desc}. Another guess for ${g.names[seat]}.`, { kind: 'good', event });
      g.step = 'guess';
      break;
    }
    default:
      throw new Error('No such power-up');
  }
}

// --- arranging your hand ---------------------------------------------------

export function lockOrder(g, seat, order) {
  if (g.phase !== 'arrange') throw new Error('Not in the arranging phase');
  const s = g.seats[seat];
  // Either player at a shared seat can lock the hand in; the first to press
  // settles it for both of them.
  if (s.locked) throw new Error('That hand is already locked in');
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

/**
 * Give a turn up without playing it.
 *
 * Nobody is at the hand the table is waiting on — a phone has died, or
 * somebody has walked off — and a round that cannot move is a round everybody
 * else has to abandon. The host may pass it, and it costs that hand nothing
 * but the go: no card turns over, nothing is revealed, and anything it was
 * carrying is still there when whoever owns it comes back.
 */
export function passTurn(g, seat) {
  requirePlay(g);
  requireTurn(g, seat);
  log(g, `${g.names[seat]} was away, so their turn passed.`, { kind: 'bad' });
  nextTurn(g);
}

// --- the guess -------------------------------------------------------------

export function guess(g, seat, target, rank) {
  requirePlay(g);
  if (g.step !== 'guess') throw new Error('Not the guessing step');
  requireTurn(g, seat);
  const ts = target?.seat;
  const idx = target?.idx;
  if (!Number.isInteger(ts) || !Number.isInteger(idx)) throw new Error('Pick a card to guess');
  if (ts < 0 || ts >= g.numSeats) throw new Error('No such seat');
  if (!isOpponent(g, seat, ts)) throw new Error("You can only guess an opponent's card");
  const c = g.seats[ts].cards[idx];
  if (!c) throw new Error('No such card');
  if (c.faceUp) throw new Error('That card is already face up');
  validRank(rank);

  if (g.shielded[ts]) throw new Error(`${g.names[ts]} is under a stakeout until they play again`);
  // A pickpocket or a misdirection names the hand this guess has to go at.
  // The hold lapses rather than traps anybody: if the named hand has since
  // been shielded or turned entirely face up, the guess is free again.
  const sentAt = g.forced[seat];
  if (sentAt !== null && sentAt !== ts) {
    const stillOn =
      !g.shielded[sentAt] && g.seats[sentAt].cards.some((x) => !x.faceUp) && isOpponent(g, seat, sentAt);
    if (stillOn) throw new Error(`This guess has to go at ${g.names[sentAt]}`);
    g.forced[seat] = null;
  }

  // Whatever named this guess has had its say now, win or lose.
  g.forced[seat] = null;
  g.guessed = true;

  const desc = `${g.names[seat]} guessed ${possessive(g.names[ts])} ${ordinal(idx + 1)} card is ${aRank(rank)}`;
  const event = { type: 'guess', by: seat, target: { seat: ts, idx }, rank, correct: c.rank === rank };
  if (c.rank === rank) {
    c.faceUp = true;
    event.card = aRank(c.rank);
    g.chain += 1;
    const winner = findWinner(g);
    if (winner !== null) {
      log(g, `${desc} \u2014 correct!`, { kind: 'good', event });
      finishRound(g, winner);
      return;
    }
    // A hit is free: the card turns over and the same player goes again.
    log(g, `${desc} \u2014 correct! Another guess for ${g.names[seat]}.`, { kind: 'good', event });
    g.step = 'guess';
  } else {
    // A miss costs nothing but the turn \u2014 but it is on the record.
    g.misses.push([ts, idx, rank]);
    // Unless something has been spent on forgiving exactly this. A forgiven
    // miss still goes on the record: the table heard it either way.
    if (g.spare[seat] > 0) {
      g.spare[seat] -= 1;
      event.spared = true;
      log(g, `${desc} \u2014 incorrect, but ${g.names[seat]} goes again.`, { kind: 'bad', event });
      g.step = 'guess';
      return;
    }
    log(g, `${desc} \u2014 incorrect.`, { kind: 'bad', event });
    nextTurn(g);
  }
}

// --- ending the round ------------------------------------------------------

// The round is over the moment somebody has nothing left to guess at: every
// card belonging to their opponents is already face up.
function findWinner(g) {
  for (let seat = 0; seat < g.numSeats; seat++) {
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
    : `Every other card is face up — the round goes to ${g.names[seat]}!`;
  g.result = { winners, losers, text };
  // Nothing is secret once the round is over.
  g.seats.forEach((s) => s.cards.forEach((c) => (c.faceUp = true)));
  log(g, text, { kind: 'result', event: { type: 'result', winners, losers } });
}

// --- what a player is allowed to see ---------------------------------------
//
// A seat sees a rank if the card is its own, if it is face up, or if its
// partner has shown it. Nothing else. Two players sharing a seat get the same
// view as each other, because they are playing the same hand. Colours stay
// hidden until every row is locked in, so nobody gets a head start while
// people arrange.

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
  // What you are carrying is yours to know. Everybody else's holdings are a
  // count and nothing more \u2014 that somebody is sitting on three power-ups is
  // worth reading at the table, which of the three they are is not.
  const powerUps = g.powered
    ? {
        kit: [...g.kit[viewer]],
        held: g.kit.map((k) => k.length),
        limit: PowerUps.HAND_LIMIT,
        chain: g.chain,
        shielded: [...g.shielded],
        spare: g.spare[viewer],
        forced: g.forced[viewer],
        // Who else is under orders, which is public: the table watched it
        // happen and the log says so.
        forcedAll: g.forced.map((f) => f),
      }
    : null;

  return {
    phase: g.phase,
    numSeats: g.numSeats,
    teams: g.teams,
    names: g.names,
    turn: g.turn,
    step: g.step,
    partnerSeat: partnerOf(g, viewer),
    result: g.result,
    seats,
    misses: g.misses,
    powered: g.powered,
    powerUps,
    logTotal: g.log.length, // how many lines exist in total, so new ones can be spotted
    log: g.log.slice(-250).map((e) => ({
      kind: e.kind || null,
      text: e.privSeat === viewer ? e.privText : e.text,
      priv: e.privSeat === viewer,
      event: e.event || null,
    })),
  };
}

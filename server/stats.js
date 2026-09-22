// ---------------------------------------------------------------------------
// What the house remembers about how you have played.
//
// The card game keeps nothing: a room is memory, a code stops working within
// the hour, and that is deliberate. This is the one thing that outlives it,
// and only for somebody who asked for it by opening an account. A signed-out
// player at a table is recorded nowhere at all — the round is played, the
// room forgets it, and nothing here is touched.
//
// Two rules keep the numbers honest:
//
//   * A round counts once per account, however many seats that account is
//     sitting at. Two tabs signed into the same account at one table is one
//     round played and, at most, one round won.
//   * Rounds against the house are counted apart from rounds against people.
//     A bot table is a real game and belongs in the total, but a win over
//     three Novices is not the same claim as a win over three people, and a
//     figure that cannot tell them apart is a figure nobody should quote.
//
// Everything is stored under `stats` in the same document the accounts live
// in, keyed by account id. A store that is shut records nothing rather than
// throwing: a round at the table must never fail because a bucket is out of
// reach.
// ---------------------------------------------------------------------------

import { data, touch, available } from './store.js';
import { SEAT_COUNTS, usesPowerUps } from './deal.js';

// A round is one of these, kept apart from the total because they are not the
// same game. Three and four hands are the deduction game as written; five and
// six spread the same 26 cards so thin that they are dealt power-ups to make
// up for it, and partnerships change who you are even allowed to guess at. A
// single win rate across all of that measures nothing in particular.
const pair = () => ({ rounds: 0, wins: 0 });

/** A record nobody has written to yet. Every field is created here so that
 *  nothing reading one has to check whether it exists. */
export function blank() {
  return {
    rounds: 0,      // rounds played through to an end
    wins: 0,        // of those, the ones won
    versus: 0,      // rounds with at least one other person at the table
    versusWins: 0,  // of those, the ones won
    streak: 0,      // wins in a row, as things stand
    best: 0,        // the longest such run there has ever been
    tables: 0,      // distinct rooms sat down at
    first: 0,       // when the first round was recorded
    last: 0,        // and the most recent
    // --- the same rounds again, split by what kind of game they were
    seats: Object.fromEntries(SEAT_COUNTS.map((n) => [n, pair()])), // by table size
    teams: pair(),  // four hands played as partnerships
    shared: pair(), // rounds where somebody else was playing your hand too
    // --- the battle room, which is a different game entirely
    battle: battleBlank(),
    // --- and Switchhead, which is a third
    switchhead: switchBlank(),
  };
}

// The revision room's figures. Kept in their own object rather than spread
// across the record above, because nothing here is comparable with anything
// there: a round at the card table is a round of deduction against people,
// and a card in the battle room is one answer typed against one back. Putting
// them in one column would produce a total that means nothing.
//
// `points` and `cards` are both kept so that an average can be worked out
// honestly. Storing the average instead would make a twenty-card match and a
// five-card match weigh the same, which is how an average of averages lies.
const battleBlank = () => ({
  matches: 0, // matches played through to the end
  duels: 0,   // of those, the ones against at least one other person
  wins: 0,    // of those, the ones won
  solo: 0,    // revision runs, which nobody can win or lose
  cards: 0,   // cards answered, across everything
  points: 0,  // marks earned across those cards, out of 100 each
  best: 0,    // the best single card mark there has ever been
  // The same cards again, by the deck they were dealt from: a house deck's
  // id, or 'mine' for members' own collections. Kept as cards and points for
  // the same reason as above, so each deck's average is an honest one.
  decks: {},  // id -> { matches, cards, points }
});

// Switchhead's figures, in their own object for the same reason as the
// battle room's: a game of Switchhead is not a round of deduction, and one win
// rate across the two would be a figure about nothing.
//
// Two ways to finish that matter, and they are not each other's opposite: a
// win is first place, and `heads` is the other end — last, the Switchhead.
// At a table of five most games are neither, which is why `seats` is kept:
// the page can say how big the tables were, and a win at two players is not
// the same claim as a win at eight.
const switchBlank = () => ({
  games: 0,   // games played through to the end
  wins: 0,    // finished first
  heads: 0,   // finished last: the Switchhead
  seats: 0,   // the sum of the table sizes, over every game
  pickups: 0, // piles picked up, including a face-down card that would not go
  burns: 0,   // piles burnt, by a ten or by four of a kind
  flips: 0,   // times the goal turned over in the games played
  streak: 0,  // games in a row not finished as the Switchhead
  best: 0,    // the longest such run there has ever been
});

// A record written before a field existed is still somebody's record, so it
// is filled in rather than replaced. Anything missing arrives at nought,
// which is true: those rounds were played, they were simply not counted this
// way at the time. `attributed` in forUser() is what admits the difference.
function fill(mine) {
  for (const [key, value] of Object.entries(blank())) {
    if (mine[key] === undefined) mine[key] = value;
  }
  for (const n of SEAT_COUNTS) mine.seats[n] ??= pair();
  // The same thought one level down. A record written while the battle room
  // had fewer figures than it has now is still somebody's record, and the
  // fields it never knew about arrive at nought rather than undefined.
  mine.battle = { ...battleBlank(), ...(mine.battle || {}) };
  mine.switchhead = { ...switchBlank(), ...(mine.switchhead || {}) };
  return mine;
}

// The record for an account, made if it is not there yet. Callers mutate it
// in place and call touch() themselves, exactly as everything else that
// writes to the document does.
function recordFor(userId) {
  const all = data().stats;
  return fill((all[userId] ??= blank()));
}

/**
 * This account has taken a seat at a table it has not sat at before. Called
 * once per room per account by the room server, which is the only thing that
 * knows what "before" means — the count is of tables, not of arrivals, so a
 * refresh in the middle of a round is not a second one.
 */
export function sitDown(userId) {
  if (!userId || !available()) return;
  const mine = recordFor(userId);
  mine.tables += 1;
  touch();
}

/**
 * A round has ended with this account at the table.
 *
 * `won` is whether one of their seats took it — both players win a shared
 * hand, which is the room's rule and not something to argue with here.
 * `versus` is whether anybody else at the table was a person. The rest says
 * what kind of game it was: how many hands it was dealt into, whether those
 * four hands were two partnerships, and whether somebody else was playing
 * this account's hand alongside them.
 */
export function record(userId, { won = false, versus = false, seats = 0, teams = false, shared = false } = {}) {
  if (!userId || !available()) return;
  const mine = recordFor(userId);
  const now = Date.now();

  const bump = (row) => {
    row.rounds += 1;
    if (won) row.wins += 1;
  };

  mine.rounds += 1;
  if (won) mine.wins += 1;
  if (versus) {
    mine.versus += 1;
    if (won) mine.versusWins += 1;
  }
  // An unknown size is not counted as a size. It cannot happen from the room
  // server, but a row that quietly invented a seventh table shape would be
  // worse than one that is honestly short.
  if (mine.seats[seats]) bump(mine.seats[seats]);
  if (teams) bump(mine.teams);
  if (shared) bump(mine.shared);

  if (won) {
    mine.streak += 1;
    if (mine.streak > mine.best) mine.best = mine.streak;
  } else {
    mine.streak = 0;
  }
  if (!mine.first) mine.first = now;
  mine.last = now;
  touch();
}

/**
 * A match in the battle room has ended with this account in it.
 *
 * The rules are the card table's, for the same reasons. A solo run is not a
 * duel and is not counted as one — one person answering their own flashcards
 * would otherwise be an unbroken winning streak — and an account is counted
 * once per match however many tabs it has open, which the room server sees to
 * before it calls this.
 *
 * `points` is the sum of the card marks, each out of 100, and `cards` is how
 * many of them there were. Both are needed: the useful figure is the average
 * mark, and it has to be worked out over every card ever answered rather than
 * over the matches they fell in.
 */
export function recordBattle(userId, { solo = false, won = false, cards = 0, points = 0, best = 0, deck = null } = {}) {
  if (!userId || !available()) return;
  const mine = recordFor(userId);
  const b = mine.battle;

  b.matches += 1;
  if (solo) {
    b.solo += 1;
  } else {
    b.duels += 1;
    if (won) b.wins += 1;
  }
  b.cards += cards;
  b.points += points;
  if (best > b.best) b.best = best;
  if (deck) {
    const row = (b.decks[deck] ??= { matches: 0, cards: 0, points: 0 });
    row.matches += 1;
    row.cards += cards;
    row.points += points;
  }

  // A match is a thing the account did, so it moves the same two dates the
  // card table moves. The round counters are deliberately left alone: a
  // battle is not a round, and adding it to `rounds` would quietly change
  // every win rate on the site.
  if (!mine.first) mine.first = Date.now();
  mine.last = Date.now();
  touch();
}

/**
 * A game of Switchhead has ended with this account at the table.
 *
 * `won` is first place and `head` is last. `players` is how many were
 * dealt in. The room counts an account once per game before it calls this.
 * Like a battle, a game moves the two dates and leaves the round counters
 * alone.
 */
export function recordSwitchhead(userId, { won = false, head = false, players = 0, pickups = 0, burns = 0, flips = 0 } = {}) {
  if (!userId || !available()) return;
  const mine = recordFor(userId);
  const sh = mine.switchhead;
  sh.games += 1;
  if (won) sh.wins += 1;
  if (head) sh.heads += 1;
  sh.seats += players;
  sh.pickups += pickups;
  sh.burns += burns;
  sh.flips += flips;
  if (head) {
    sh.streak = 0;
  } else {
    sh.streak += 1;
    if (sh.streak > sh.best) sh.best = sh.streak;
  }
  if (!mine.first) mine.first = Date.now();
  mine.last = Date.now();
  touch();
}

/**
 * What the menu is told. A fresh account has never played anything, which is
 * a blank record rather than an absence: the page prints zeros and says so in
 * words, and has nothing to special-case.
 */
export function forUser(userId) {
  const mine = fill((available() && data().stats[userId]) || blank());
  // Power-ups are not a mode anybody chooses — they come with five and six
  // hands and cannot be switched off — so they are added up here rather than
  // stored a second time.
  const powered = pair();
  const plain = pair();
  let attributed = 0;
  for (const n of SEAT_COUNTS) {
    const row = mine.seats[n];
    const into = usesPowerUps(n) ? powered : plain;
    into.rounds += row.rounds;
    into.wins += row.wins;
    attributed += row.rounds;
  }
  return {
    ...mine,
    powered,
    plain,
    // How many of the rounds in the total this page can say anything about.
    // Rounds played before the house started counting by table size are in
    // `rounds` and in none of the rows, and the page says so rather than
    // printing a breakdown that does not add up.
    attributed,
    // Worked out here rather than in the page, so the two figures cannot
    // disagree about what counts as a rate with no rounds behind it.
    rate: mine.rounds ? mine.wins / mine.rounds : 0,
    versusRate: mine.versus ? mine.versusWins / mine.versus : 0,
    battle: {
      ...mine.battle,
      // The average mark per card, which is the figure the revision room is
      // actually for. Nought cards answered is nought rather than a division
      // nobody can print.
      average: mine.battle.cards ? mine.battle.points / mine.battle.cards : 0,
      duelRate: mine.battle.duels ? mine.battle.wins / mine.battle.duels : 0,
    },
    switchhead: {
      ...mine.switchhead,
      winRate: mine.switchhead.games ? mine.switchhead.wins / mine.switchhead.games : 0,
      headRate: mine.switchhead.games ? mine.switchhead.heads / mine.switchhead.games : 0,
    },
  };
}

/** The whole shelf, for the panel. */
export function all() {
  return available() ? data().stats : {};
}

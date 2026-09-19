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
  };
}

// The record for an account, made if it is not there yet. Callers mutate it
// in place and call touch() themselves, exactly as everything else that
// writes to the document does.
function recordFor(userId) {
  const all = data().stats;
  return (all[userId] ??= blank());
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
 * `versus` is whether anybody else at the table was a person.
 */
export function record(userId, { won = false, versus = false } = {}) {
  if (!userId || !available()) return;
  const mine = recordFor(userId);
  const now = Date.now();
  mine.rounds += 1;
  if (versus) mine.versus += 1;
  if (won) {
    mine.wins += 1;
    if (versus) mine.versusWins += 1;
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
 * What the menu is told. A fresh account has never played anything, which is
 * a blank record rather than an absence: the page prints zeros and says so in
 * words, and has nothing to special-case.
 */
export function forUser(userId) {
  const mine = (available() && data().stats[userId]) || blank();
  return {
    ...mine,
    // Worked out here rather than in the page, so the two figures cannot
    // disagree about what counts as a rate with no rounds behind it.
    rate: mine.rounds ? mine.wins / mine.rounds : 0,
    versusRate: mine.versus ? mine.versusWins / mine.versus : 0,
  };
}

/** The whole shelf, for the panel. */
export function all() {
  return available() ? data().stats : {};
}

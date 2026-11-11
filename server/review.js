// ---------------------------------------------------------------------------
// When a flashcard is next worth looking at.
//
// A card answered well does not need asking again tomorrow, and one answered
// badly does. This file keeps, for each member and each of their cards, how
// long to leave it: an interval in days that grows every time the card is
// answered well and collapses when it is not. It is the ordinary spaced
// repetition arithmetic (an ease per card, nudged by each answer), fed by
// the marks the Battle room already gives.
//
// Nothing here asks a question. The Battle room does that, and tells this
// file what the mark was (record). In return this file says which of a
// member's cards are due today (due), which is what "Review due cards" in
// the flashcards room deals.
//
// Four things about it are deliberate:
//
//   - A day is a UTC day, as it is for the daily boards. Intervals are whole
//     days and a card comes due at midnight, not twenty-four hours after it
//     was last answered: nobody wants a card due at ten to midnight.
//   - A schedule belongs to a member and a card together. A card that is
//     traded away takes no schedule with it, and the one left behind is
//     dropped the next time its old owner's cards are counted.
//   - New cards are let in a few a day (NEW_PER_DAY). A member who writes
//     two hundred cards in an afternoon is not told two hundred are due.
//   - A card already answered today is not pushed further out by answering
//     it again. Going over a deck twice in an evening is revision, and it
//     must not turn a one-day interval into a month. A worse answer still
//     counts, because that is news.
//
// The schedules are `reviews[userId][cardId]` in the stored document.
// ---------------------------------------------------------------------------

import { data, touch, available } from './store.js';

const DAY_MS = 86_400_000;
export const NEW_PER_DAY = 10;
export const EASE_START = 2.5;
const EASE_MIN = 1.3;
const EASE_MAX = 3;
const INTERVAL_MAX = 365;

// Where a mark out of 100 falls. `GOOD` is the Battle room's own pass mark,
// the start of its "Close" band, so a card passed there is a card kept here.
export const AGAIN = 40;
export const GOOD = 65;
export const EASY = 85;

/** Days since the epoch, in UTC: the only clock this file has. */
export const dayOf = (now = Date.now()) => Math.floor(now / DAY_MS);
const dateOf = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/**
 * The schedule after one answer. Pure: a schedule (or nothing, for a card
 * never asked), a mark and today's day number in, the new schedule out.
 */
export function next(state, points, today) {
  const s = state
    ? { ...state }
    : { interval: 0, ease: EASE_START, reps: 0, lapses: 0, first: today };
  if (state && state.last === today && points >= GOOD) return s;
  if (points < AGAIN) {
    // Forgotten. It starts again from tomorrow, and is a little harder for it.
    s.reps = 0;
    s.lapses += 1;
    s.ease = Math.max(EASE_MIN, s.ease - 0.2);
    s.interval = 1;
  } else if (points < GOOD) {
    // Half remembered: kept, but barely further out than it was.
    s.ease = Math.max(EASE_MIN, s.ease - 0.15);
    s.interval = Math.max(1, Math.round(s.interval * 1.2));
    s.reps += 1;
  } else if (points < EASY) {
    s.interval = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.max(s.interval + 1, Math.round(s.interval * s.ease));
    s.reps += 1;
  } else {
    s.ease = Math.min(EASE_MAX, s.ease + 0.15);
    s.interval = s.reps === 0 ? 3 : Math.max(s.interval + 1, Math.round(s.interval * s.ease * 1.3));
    s.reps += 1;
  }
  s.interval = Math.min(INTERVAL_MAX, s.interval);
  s.due = today + s.interval;
  s.last = today;
  return s;
}

// --- the stored schedules -----------------------------------------------------

function shelf() {
  const db = data();
  db.reviews ??= {};
  return db.reviews;
}

/** A member has answered one of their own cards, and this was the mark. */
export function record(userId, cardId, points, now = Date.now()) {
  if (!userId || !cardId || !available()) return null;
  const mine = (shelf()[userId] ??= {});
  mine[cardId] = next(mine[cardId], Number(points) || 0, dayOf(now));
  touch();
  return mine[cardId];
}

/** A closed account takes its schedules with it. */
export function removeAllFor(userId) {
  delete shelf()[userId];
}

// A member's cards sorted into what the schedule makes of them today. The
// cards are passed in, because whose a card is belongs to cards.js, and a
// schedule for a card that is no longer theirs is dropped on the way.
function sorted(userId, cards, now) {
  const today = dayOf(now);
  const mine = (available() && data().reviews?.[userId]) || {};
  const held = new Set(cards.map((c) => c.id));
  let stale = false;
  for (const id of Object.keys(mine)) {
    if (!held.has(id)) { delete mine[id]; stale = true; }
  }
  if (stale) touch();

  const overdue = [];
  const fresh = [];
  let later = 0;
  let soonest = null;
  let begunToday = 0;
  for (const card of cards) {
    const s = mine[card.id];
    if (!s) { fresh.push(card); continue; }
    if (s.first === today) begunToday += 1;
    if (s.due <= today) overdue.push({ card, due: s.due });
    else { later += 1; if (soonest === null || s.due < soonest) soonest = s.due; }
  }
  overdue.sort((a, b) => a.due - b.due);
  fresh.sort((a, b) => a.created - b.created);
  const room = Math.max(0, NEW_PER_DAY - begunToday);
  return { overdue: overdue.map((o) => o.card), fresh: fresh.slice(0, room), waiting: Math.max(0, fresh.length - room), later, soonest };
}

/** The cards to ask today: the longest overdue first, then today's new ones. */
export function due(userId, cards, now = Date.now()) {
  const s = sorted(userId, cards, now);
  return [...s.overdue, ...s.fresh];
}

/**
 * The figures for the flashcards room: how many are due today, how many of
 * those are new, how many are scheduled for another day, and when the next
 * of those comes round.
 */
export function summary(userId, cards, now = Date.now()) {
  const s = sorted(userId, cards, now);
  return {
    due: s.overdue.length + s.fresh.length,
    fresh: s.fresh.length,
    waiting: s.waiting,
    later: s.later,
    next: s.soonest === null ? null : dateOf(s.soonest),
  };
}

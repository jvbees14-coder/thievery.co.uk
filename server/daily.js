// ---------------------------------------------------------------------------
// The daily deck — ten house cards, the same ten for everybody, every day.
//
// A battle room is a code somebody has to give you, which makes it a thing
// you do with people you already know. The daily deck is the opposite: nobody
// has to be invited, and everybody who plays it is playing the same thing, so
// a mark on it is a mark against the whole site rather than against a friend.
//
// Three things about it are deliberate:
//
//   * **Nothing about the day is stored in advance.** Which deck and which
//     ten cards are worked out from the date alone, by a generator seeded off
//     it. Two processes, a restart at noon, or a room opened at one minute to
//     midnight all agree on today's ten without asking anybody. The day is
//     UTC's, so it turns over at the same moment for everybody.
//   * **Only the first go counts.** The cards are the same all day, so a
//     second attempt is an attempt with the answers already seen. It can be
//     played — revision is revision — but the board keeps the first.
//   * **The board is the only thing written**, under `daily` in the stored
//     document, keyed by day. Old days are dropped after a fortnight: a board
//     is for today, and a document that grows by a day forever is a document
//     that one day will not fit in a bucket.
//
// It is a house deck in every way that matters to the one rule: the cards are
// dealt by `battle.js` exactly as any other preset is, and so go through the
// same `viewFor`, and the same audit.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import * as Accounts from './accounts.js';
import * as Decks from './decks.js';
import { data, touch, available } from './store.js';

/** How many cards the day deals. */
export const LENGTH = 10;

// How many days of boards are kept. Enough for "how did I do on Tuesday", and
// nothing like enough to matter to the size of the document.
const KEEP_DAYS = 14;

// --- the day ----------------------------------------------------------------

/** Today, as the board is keyed: the UTC date, YYYY-MM-DD. */
export const todayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

const dayNumber = (key) => Math.floor(Date.parse(key + 'T00:00:00Z') / 86_400_000);

/**
 * A generator that gives the same numbers to anybody who asks with the same
 * seed. mulberry32: small, fast and quite good enough for picking ten cards —
 * nothing here is a secret, only something that has to agree with itself.
 */
export function seeded(seed) {
  let a = crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The decks a day may fall on. The topic decks, because "Biology" is a thing
// somebody can be told in a word on a tile; the papers behind them would do
// as well but a paper called "High School Macroeconomics" is a worse thing to
// be greeted with. If there are no topics at all it falls back to anything
// long enough, rather than having no day.
function candidates() {
  const all = Decks.catalog().filter((d) => d.count >= LENGTH);
  const topics = all.filter((d) => d.topic);
  return (topics.length ? topics : all).map((d) => d.id).sort();
}

/** The deck today falls on, as the catalog lists it. */
export function deckFor(key = todayKey()) {
  const pool = candidates();
  if (!pool.length) return null;
  const id = pool[((dayNumber(key) % pool.length) + pool.length) % pool.length];
  return Decks.catalog().find((d) => d.id === id) || null;
}

/**
 * Today's cards, out of the deck, in the order they are dealt, and the
 * generator that dealt them — handed on so that the options on a four-option
 * card are shuffled the same way for everybody too. Two people comparing
 * notes on "the answer was C" should be talking about the same C.
 */
export function dealFor(key = todayKey()) {
  const listed = deckFor(key);
  if (!listed) throw new Error('There is no daily deck today.');
  const deck = Decks.deck(listed.id);
  const rand = seeded(`${key}:${listed.id}`);
  const out = deck.cards.slice();
  const want = Math.min(LENGTH, out.length);
  for (let i = 0; i < want; i++) {
    const j = i + Math.floor(rand() * (out.length - i));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { deck, cards: out.slice(0, want), rand };
}

// --- the board ----------------------------------------------------------------

function boards() {
  const db = data();
  db.daily ??= {};
  return db.daily;
}

// Old boards go. Called on every write, which is at most one per account per
// day and therefore costs nothing.
function prune(now = Date.now()) {
  const all = boards();
  const oldest = dayNumber(todayKey(now)) - KEEP_DAYS;
  for (const key of Object.keys(all)) {
    if (dayNumber(key) < oldest) delete all[key];
  }
}

/**
 * A run of today's ten has finished. Filed only if it is this account's first
 * for the day — see the note at the top — and returns whether it was.
 */
export function record(userId, key, { points = 0, cards = 0, spent = 0 } = {}) {
  if (!userId || !available()) return false;
  const all = boards();
  const day = (all[key] ??= {});
  if (day[userId]) return false;
  day[userId] = { points, cards, spent, at: Date.now() };
  prune();
  touch();
  return true;
}

/**
 * The day's board, best first. Marks decide it and time breaks a tie, exactly
 * as they do in a duel; the names are looked up now rather than stored, so a
 * renamed account is shown under the name it has today.
 */
export function board(key = todayKey()) {
  const day = (available() && data().daily?.[key]) || {};
  return Object.entries(day)
    .map(([userId, row]) => ({
      userId,
      name: Accounts.byId(userId)?.displayName || 'A closed account',
      points: row.points,
      cards: row.cards,
      spent: row.spent,
    }))
    .sort((a, b) => b.points - a.points || a.spent - b.spent);
}

/**
 * What one account is told about today: which deck, how they did if they
 * have played, where that puts them, and the top of the board.
 */
export function forUser(userId, { top = 5 } = {}) {
  const key = todayKey();
  const deck = deckFor(key);
  const rows = board(key);
  const at = rows.findIndex((r) => r.userId === userId);
  return {
    key,
    deck: deck ? { id: deck.id, name: deck.name, kind: deck.kind } : null,
    length: LENGTH,
    entrants: rows.length,
    yours: at >= 0 ? { ...strip(rows[at]), place: at + 1 } : null,
    top: rows.slice(0, top).map((r, i) => ({ ...strip(r), place: i + 1, you: r.userId === userId })),
  };
}

// An account id is nobody else's business, least of all on a board everybody
// is shown.
const strip = ({ userId, ...rest }) => rest;

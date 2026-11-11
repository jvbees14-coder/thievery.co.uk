// ---------------------------------------------------------------------------
// Lockup, on the server's side of it: the daily board.
//
// The game itself is played in the browser and the server never sees a move
// of it. That is fine for a personal best, which only its owner is shown
// (stats.js). It is not fine for a board, where one account's figure sits
// beside another's and a made-up one costs somebody their place.
//
// So a finished daily game is not sent as a score. It is sent as the list of
// moves that made it, and those moves are played through here, in the same
// rules file the browser ran (public/lockup-rules.js, which is a plain script
// and is run as one). What goes on the board is what that playing-through
// found. A list the rules refuse at any point is refused whole.
//
// Three things keep that from costing the card table anything:
//
//   - a playing-through is done in slices, with the event loop let in between
//     them, so a long game is never one long pause for everybody else;
//   - only so many run at once, and an account has one at a time;
//   - nobody already on the day's board is played through at all, because
//     the first finished game of the day is the one that counts, exactly as
//     with the Battle room's daily ten.
//
// The board is the only thing written: `lockup[YYYY-MM-DD][userId]` in the
// stored document, pruned to a fortnight on every write.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as Accounts from './accounts.js';
import { data, touch, available } from './store.js';

const RULES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'lockup-rules.js');
if (!globalThis.LockupRules) vm.runInThisContext(fs.readFileSync(RULES_FILE, 'utf8'), { filename: RULES_FILE });
export const Rules = globalThis.LockupRules;

/** The rooms a record can be filed under: the ones built in, by id. */
export const ROOM_IDS = Rules.MAPS.map((m) => m.id);

const KEEP_DAYS = 14;
const SLICE = 20_000;       // steps of the rules between one breath and the next
const AT_ONCE = 2;          // playings-through that may be in hand together
const BOARD_SHOWN = 50;

export const todayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const dayNumber = (key) => Math.floor(Date.parse(key + 'T00:00:00Z') / 86_400_000);
/** The table everybody is dealt on a day: the seed, the room and the stakes. */
export const tableFor = (key = todayKey()) => Rules.dailyTable(new Date(key + 'T12:00:00Z'));

// --- playing a game back ------------------------------------------------------

let inHand = 0;
const busy = new Set();

const breath = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Plays a list of moves through the rules on a day's table. Resolves with
 * what the rules made of it ({ ok, fault, waves, kept, won, stopped }), or
 * with `{ ok: false, busy: true }` if there is no room to do it right now.
 */
export async function playBack(userId, key, moves) {
  if (busy.has(userId) || inHand >= AT_ONCE) return { ok: false, busy: true };
  busy.add(userId);
  inHand += 1;
  try {
    const game = Rules.replayer(tableFor(key), moves);
    for (;;) {
      const result = game.run(SLICE);
      if (result) return result;
      await breath();
    }
  } finally {
    busy.delete(userId);
    inHand -= 1;
  }
}

// --- the board ----------------------------------------------------------------

function boards() {
  const db = data();
  db.lockup ??= {};
  return db.lockup;
}

function prune(now = Date.now()) {
  const all = boards();
  const oldest = dayNumber(todayKey(now)) - KEEP_DAYS;
  for (const key of Object.keys(all)) {
    if (dayNumber(key) < oldest) delete all[key];
  }
}

/** Is this account already on that day's board? */
export function hasPlayed(userId, key = todayKey()) {
  return !!(available() && data().lockup?.[key]?.[userId]);
}

/** A played-back game goes on the board, if it is the account's first that day. */
export function record(userId, key, { waves = 0, kept = 0 } = {}) {
  if (!userId || !available()) return false;
  const day = (boards()[key] ??= {});
  if (day[userId]) return false;
  day[userId] = { waves, kept, at: Date.now() };
  prune();
  touch();
  return true;
}

/** A closed account comes off every day's board still kept. */
export function removeAllFor(userId) {
  for (const day of Object.values(boards())) delete day[userId];
}

/**
 * The day's board, best first: the most waves seen off, then the most cards
 * kept, then whoever got there earlier. Names are looked up now rather than
 * stored, and no account id leaves here: `you` says which row is the
 * viewer's.
 */
export function board(key = todayKey(), viewerId = null) {
  const day = (available() && data().lockup?.[key]) || {};
  return Object.entries(day)
    .map(([userId, row]) => ({ userId, ...row }))
    .sort((a, b) => b.waves - a.waves || b.kept - a.kept || a.at - b.at)
    .slice(0, BOARD_SHOWN)
    .map((r) => ({
      name: Accounts.byId(r.userId)?.displayName || 'A closed account',
      waves: r.waves,
      kept: r.kept,
      you: r.userId === viewerId,
    }));
}

/** What anybody is told about today: the room, and the board as it stands. */
export function today(viewerId = null) {
  const key = todayKey();
  return { day: key, room: tableFor(key).room, board: board(key, viewerId), signedIn: !!viewerId };
}

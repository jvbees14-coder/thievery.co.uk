// ---------------------------------------------------------------------------
// /battle — the revision room.
//
// Three things happen here, and they are the same thing underneath: a card is
// shown front-first, somebody types what they think is on the back, and
// `grade.js` marks it. What changes is who is doing it and what they are being
// marked against.
//
//   * **A duel.** Two or more members in a room, the same card in front of
//     all of them at once, marked side by side. The higher mark takes the
//     card; the most cards takes the match.
//   * **Solo.** The same run, one player, nobody to lose to. This is the
//     revision the room is actually for; the duel is what makes people come
//     back to it.
//
// and the cards themselves come from one of three places:
//
//   * **Your own collection** — the flashcards you have written or traded for.
//   * **A house deck** — a fixed set out of `decks.js`.
//   * **The daily deck** — ten house cards, the same ten for everybody today,
//     out of `daily.js`. Always solo, always untimed, and only the first go
//     of the day goes on the board.
//
// and a match is settled one of two ways:
//
//   * **On marks** — every card is played, and the most marks takes it.
//   * **Sudden death** — an answer below a pass puts you out. The last one
//     standing takes it; alone, it is how many you can get in a row.
//
// Somebody who arrives with the code while a match is running is let in to
// **watch**: they see what everybody sees, which is to say nothing of a card
// until it is closed, and are dealt in to the next match if there is room.
//
// --- the fairness problem in a duel on members' own cards ------------------
//
// It is not a small one, and it is the reason `dealFrom` below is longer than
// it looks like it should be. A duel fought on the challenger's collection is
// a duel the challenger has already read the answers to. They wrote them.
//
// So a duel on members' own cards deals an **equal share from every player's
// collection** and shuffles the lot together. Whatever advantage there is in
// being quizzed on your own cards, both sides get the same amount of it, and
// a player who brings a thin collection is not thereby handing the other one
// the match. It is the same instinct as the card game dealing from one deck:
// the point is not that nobody has an edge, it is that the edge is dealt out
// evenly and everybody can see how.
//
// --- rooms ------------------------------------------------------------------
//
// Like the card game and unlike the flashcards, a battle room is memory and
// nothing else: a four-character code, the people in it, and the match in
// progress. Nothing is written down, a room is forgotten an hour after the
// last person leaves, and a restart takes every room with it. That is the
// right trade for something whose whole life is twenty minutes long, and it
// means this room can never be the thing that endangers the stored document.
//
// The one thing that *is* kept is the lifetime record, through `stats.js`,
// and on exactly the terms the card table keeps it: wrapped so that a store
// that has gone away can never take a match down with it.
//
// --- what a player may know -------------------------------------------------
//
// `viewFor` is the only thing that decides, exactly as `Game.viewFor` is at
// the card table, and it has one rule worth more than the rest of this file
// put together:
//
//   **The back of a card is never sent to anybody while the card is still
//   being answered.**
//
// A browser that has been handed the answer is a browser that can be asked
// for it, and the whole room is worthless the moment that is true. So the
// back goes out only once the card is closed and every mark on it is final.
// `test/battle.test.js` reads every message every client receives and fails
// on the back of an open card appearing in any of them.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as Accounts from './accounts.js';
import * as Cards from './cards.js';
import * as Decks from './decks.js';
import * as Daily from './daily.js';
import * as Grade from './grade.js';
import * as Stats from './stats.js';
import { available } from './store.js';
import { currentUser } from './plumbing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, 'views');

// Behind a login, so out of public/ — anything in there is served to anybody
// who asks for it by name.
const readView = (name) => fs.readFileSync(path.join(VIEWS, name), 'utf8');
const views = {
  app: readView('battle.html'),
  door: readView('battle-door.html'),
  closed: readView('battle-closed.html'),
};

// The room needs the ledger for two of its three answers — who you are, and
// what is in your collection — so it closes with it, exactly as the board and
// the flashcards do. A house deck would survive on its own, but a room nobody
// can be identified in is not a room worth opening.
export const isOpen = () => available();

// --- what a match may be ---------------------------------------------------

export const LENGTHS = [5, 10, 15, 20];
export const DEFAULT_LENGTH = 10;

// Seconds on the clock for one card. Nought is the untimed setting, which is
// what revision actually wants — a clock is for a duel, where two people
// thinking for as long as they like is not a contest.
//
// Ten and fifteen are the quick-fire settings. They are meant for a four-option
// deck, where the question is read and a button pressed; a text card at ten
// seconds is a typing test, and the lobby says so.
export const CLOCKS = [0, 10, 15, 20, 30, 45, 60, 90];
export const DEFAULT_CLOCK = 45;

// Enough room for a match worth having, few enough that a card is still on
// screen long enough to read every answer to it at the reveal.
export const MAX_PLAYERS = 8;

// Watchers are cheap — they are sent the same snapshot anybody is — but not
// free, and a room link posted somewhere public should not become an audience
// of hundreds on one process.
export const MAX_WATCHERS = 16;

// How a match is settled. See the header.
export const RULES = ['marks', 'sudden'];

// The mark an answer needs to be counted as got. It is where the marker's
// "Close" band begins: close is a pass, "some of it" is not. Sudden death puts
// you out below it, and it is the line that decides which cards were missed
// when somebody asks to go over them again.
export const PASS = Grade.points(Grade.BANDS.find((b) => b.key === 'close').at);

// How long an answer may be. The marker caps what it will read anyway; this
// is so the socket is not asked to carry an essay in the first place.
export const ANSWER_MAX = Grade.ANSWER_MAX;

const ROOM_TTL_MS = 60 * 60_000; // an empty room is kept this long before it is forgotten
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // nothing that can be misread as 0/O or 1/I

export const ROOM_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

const rooms = new Map();

const randomId = (bytes = 9) => crypto.randomBytes(bytes).toString('base64url');

function newRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  } while (rooms.has(code));
  return code;
}

// --- the room ---------------------------------------------------------------

function createRoom() {
  const room = {
    code: newRoomCode(),
    hostId: null,
    mode: 'duel', // 'duel' or 'solo'
    source: 'preset', // 'preset' or 'mine'
    presetId: Decks.DEFAULT_DECK,
    length: DEFAULT_LENGTH,
    clock: DEFAULT_CLOCK,
    rule: 'marks', // 'marks' or 'sudden'
    daily: null, // the day's key while the room is playing the daily deck
    players: [],
    match: null,
    timer: null, // the clock on the card in progress
    emptySince: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

const connected = (room) => room.players.filter((p) => p.connected);

// The people in the room who would be dealt in. Somebody who arrived to watch
// a match in progress is in `players` — they have a socket and a view like
// anybody — but is not one of these until the room is back in its lobby.
const seated = (room) => room.players.filter((p) => !p.watcher);

function clearClock(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

function forget(room) {
  clearClock(room);
  rooms.delete(room.code);
}

function removePlayer(room, player) {
  const i = room.players.indexOf(player);
  if (i >= 0) room.players.splice(i, 1);
  if (room.hostId === player.id) room.hostId = room.players[0]?.id ?? null;
  if (!room.players.length) {
    room.emptySince = Date.now();
    // Nobody left and no match to come back to: that code will never be typed
    // again, and keeping it is only somewhere for a script opening rooms in a
    // loop to pile them up.
    if (!room.match) forget(room);
  }
}

/** Forget rooms nobody has come back to. Called from the server's sweep. */
export function sweep(now = Date.now()) {
  for (const [, room] of rooms) {
    if (connected(room).length) continue;
    if (now - room.emptySince > ROOM_TTL_MS) forget(room);
  }
}

/** How many rooms are open. For the hall's tile, and for the tests. */
export const openRooms = () => rooms.size;

// --- dealing the cards ------------------------------------------------------

// Fisher-Yates, on a copy. The same shuffle the card game deals with, kept
// here rather than imported because `deal.js` is about a 26-card deck and has
// no business knowing this room exists.
//
// `rand` is for the daily deck, whose four-option cards must come out in the
// same order for everybody; anything else is shuffled off the system's own
// randomness.
function shuffled(list, rand = null) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand ? Math.floor(rand() * (i + 1)) : crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * `n` of these at random, without shuffling the whole pile to get them.
 *
 * The same Fisher-Yates, stopped after `n` swaps: each position in turn takes
 * a random element from everything not yet drawn, so the result is as evenly
 * drawn as a full shuffle and costs `n` steps rather than the length of the
 * deck. With the MMLU sets running to fifteen hundred questions and a match
 * wanting ten of them, that is the difference between a deal and a sort.
 */
function pick(list, n) {
  const want = Math.min(n, list.length);
  const out = list.slice();
  for (let i = 0; i < want; i++) {
    const j = i + crypto.randomInt(out.length - i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, want);
}

// A card as a match holds it. Flattened off whatever it came from, so that
// nothing below this line has to care whether it was a member's flashcard, a
// line out of a hand-written deck, or a row of one of the MMLU sets.
//
// A member's flashcard is always `text`: you write a back, not four options.
const asCard = (c, ownerId = null, ownerName = null) => ({
  kind: 'text',
  front: String(c.front || ''),
  back: String(c.back || ''),
  hint: String(c.hint || ''),
  ownerId,
  ownerName,
});

/**
 * A four-option card as a match holds it.
 *
 * The options are shuffled **here**, when the match is dealt, rather than
 * being left in the order the deck stores them. Two reasons, and the second
 * is the one that matters: a set where the answer is disproportionately "C"
 * teaches people to pick C, and two players dealt the same card should be
 * looking at the same screen — so the shuffle happens once, for the match,
 * not once per viewer.
 *
 * Each option carries its own id, exactly as a poll's answers used to, so
 * that what somebody picked cannot be knocked sideways by the list being
 * reordered underneath them.
 */
function asChoiceCard(c, rand = null) {
  const options = shuffled(
    c.options.map((text, i) => ({ id: randomId(4), text: String(text), was: i })),
    rand
  );
  const right = options.find((o) => o.was === c.answer);
  return {
    kind: 'choice',
    front: String(c.front || ''),
    hint: '',
    options: options.map(({ id, text }) => ({ id, text })),
    answerId: right.id,
    // The reveal panel says "the back of the card" whatever kind it is, and
    // for a choice that is the option which was right.
    back: right.text,
    ownerId: null,
    ownerName: null,
  };
}

/**
 * Build the deck a match is played on.
 *
 * The house deck is the simple case. Members' own cards is the one the
 * fairness note at the top of this file is about: every player contributes an
 * equal share, so a duel on collections is not a duel on the challenger's
 * collection.
 */
function dealFrom(room, people) {
  const want = room.length;

  if (room.daily) {
    const { deck, cards, rand } = Daily.dealFor(room.daily);
    return cards.map((c) => (deck.kind === 'choice' ? asChoiceCard(c, rand) : asCard(c)));
  }

  if (room.source === 'preset') {
    const deck = Decks.deck(room.presetId);
    if (!deck) throw new Error('That deck is no longer here. Pick another.');
    if (deck.cards.length < 2) throw new Error('That deck has nothing in it.');
    // Cut to length *before* the cards are built, not after. The MMLU sets
    // run to fifteen hundred questions apiece and building every one of them
    // — four option objects and a random id each — to then throw all but ten
    // away is work nobody asked for, on every single deal.
    // Wrapped, both of them: map passes an index as the second argument,
    // and asChoiceCard's second argument is the daily deck's generator.
    const kind = deck.kind === 'choice' ? (c) => asChoiceCard(c) : (c) => asCard(c);
    // A deck shorter than the match is dealt out in full rather than refused:
    // a ten-card run on an eight-card deck is an eight-card run, and saying so
    // is friendlier than making somebody count.
    return pick(deck.cards, want).map(kind);
  }

  // Members' own cards. Everybody's collection is read first, so that a
  // player with nothing in theirs is named rather than silently contributing
  // none and losing a duel they never had a card in.
  const holdings = people.map((p) => {
    const owned = p.userId ? Cards.cardsOf(p.userId) : [];
    return { player: p, cards: shuffled(owned.filter((c) => c.front && c.back)) };
  });

  const empty = holdings.filter((h) => !h.cards.length);
  if (empty.length) {
    const who = empty.map((h) => h.player.name).join(' and ');
    throw new Error(
      empty.length === holdings.length
        ? 'There are no flashcards to play on. Write some, or pick a house deck.'
        : `${who} has no flashcards yet. Pick a house deck, or wait for them to write one.`
    );
  }

  // Round by round, a card from each collection in turn, until the match is
  // full or every collection is empty. Taking turns rather than slicing a
  // share off each is what keeps the split even when the collections are
  // wildly different sizes: the player with forty cards does not fill the
  // match before the player with three has been asked twice.
  const out = [];
  for (let round = 0; out.length < want; round++) {
    let dealtThisRound = false;
    for (const h of holdings) {
      if (out.length >= want) break;
      const card = h.cards[round];
      if (!card) continue;
      out.push(asCard(card, h.player.userId, h.player.name));
      dealtThisRound = true;
    }
    if (!dealtThisRound) break; // every collection is spent
  }

  // Shuffled at the end so that whose card is whose is not readable off the
  // order they arrive in. Knowing the next card is yours is worth something,
  // and it is exactly the something this room is trying not to hand out.
  return shuffled(out);
}

// --- a match ----------------------------------------------------------------

// Which deck a match is filed under in the record: the house deck's id, the
// day's deck by its own id (it is the same deck, played the same way), or
// 'mine' for members' collections.
function deckIdOf(room) {
  if (room.daily) return Daily.deckFor(room.daily)?.id || null;
  return room.source === 'preset' ? room.presetId : 'mine';
}

/**
 * Deal and begin. `dealt` is a hand already made — the cards somebody missed
 * last time — and is otherwise worked out from the room's settings.
 */
function startMatch(room, dealt = null) {
  // Solo is the host's run. Anybody else in the room watches it.
  const host = room.players.find((p) => p.id === room.hostId);
  const people = room.mode === 'solo' ? (host ? [host] : []) : seated(room);
  if (!people.length) throw new Error('There is nobody here to play.');
  if (room.mode === 'duel' && people.length < 2) {
    throw new Error('A duel wants somebody to duel. Share the code, or switch to solo.');
  }

  const cards = dealt || dealFrom(room, people);
  if (!cards.length) throw new Error('No cards could be dealt.');

  for (const p of room.players) {
    p.answers = [];
    p.total = 0;
    p.spent = 0;
    p.outAt = null; // the card sudden death put them out on
  }

  room.match = {
    deck: deckIdOf(room),
    retry: !!dealt,
    cards,
    at: 0, // which card is in front of them
    phase: 'asking',
    playing: people.map((p) => p.id), // solo leaves the others watching
    startedAt: Date.now(),
    cardAt: Date.now(),
    deadline: null,
  };
  openCard(room);
}

function openCard(room) {
  const m = room.match;
  m.phase = 'asking';
  m.cardAt = Date.now();
  m.deadline = room.clock ? m.cardAt + room.clock * 1000 : null;
  clearClock(room);
  if (room.clock) {
    room.timer = setTimeout(() => {
      // The room may have been forgotten, or moved on, while this was pending.
      if (rooms.get(room.code) !== room || room.match !== m || m.phase !== 'asking') return;
      closeCard(room);
      push(room);
    }, room.clock * 1000);
  }
}

const isPlaying = (room, p) => !!room.match && room.match.playing.includes(p.id);

// In the match *and* still in it at card `at`. Only sudden death ever puts
// anybody out, and somebody put out on card four was still in for card four:
// their answer to it is on its reveal like everybody else's.
const inAt = (room, p, at) => isPlaying(room, p) && (p.outAt == null || p.outAt >= at);

// Everybody still here who has the card in front of them. A player who has
// dropped out cannot be waited for, or a duel stalls on somebody who shut
// their laptop; one who has been put out is not being asked any more.
const answering = (room) => room.players.filter((p) => inAt(room, p, room.match.at) && p.connected);

function closeCard(room) {
  const m = room.match;
  if (m.phase !== 'asking') return;
  clearClock(room);
  // Anybody in the match who never typed anything is marked on nothing, which
  // is a nought. Recorded rather than left undefined, so the reveal has a row
  // for every player and the totals add up.
  const card = m.cards[m.at];
  for (const p of room.players) {
    if (!inAt(room, p, m.at)) continue;
    if (p.answers[m.at]) continue;
    p.answers[m.at] = markOf(room, '', card, null);
  }
  // Sudden death is decided here, on the final marks, and not when an answer
  // comes in: a card is only settled once it is closed.
  if (room.rule === 'sudden') {
    for (const p of room.players) {
      if (inAt(room, p, m.at) && p.outAt == null && p.answers[m.at].points < PASS) p.outAt = m.at;
    }
  }
  m.phase = 'reveal';
}

// One player's answer to one card, marked. `ms` is null for somebody who never
// answered: nought time on an unanswered card would make them the fastest in
// the room at not playing, and time is the tiebreak.
//
// Both kinds come back in the same shape, so that everything downstream — the
// totals, the standings, the reveal, the record — reads one sort of mark. The
// working (`found`, `missed`, `extra`) is empty for a choice, because there
// is none to show: you picked the right one or you did not.
function markOf(room, given, card, ms) {
  if (card.kind === 'choice') {
    const chose = card.options.find((o) => o.id === given) || null;
    const right = chose ? chose.id === card.answerId : false;
    return {
      // What they picked, in words, so the reveal reads the same for both
      // kinds and the end-of-match review can print it.
      text: chose ? chose.text : '',
      chose: chose ? chose.id : null,
      points: right ? 100 : 0,
      // A choice has no middle. It is deliberately not run through the
      // marker: "close" is a thing an answer can be and a choice cannot.
      band: right ? 'got' : 'missed',
      bandLabel: right ? 'Right' : chose ? 'Wrong' : 'Nothing picked',
      found: [],
      missed: [],
      extra: [],
      flipped: false,
      ms,
    };
  }

  const verdict = Grade.grade(given, card.back);
  return {
    text: String(given || ''),
    chose: null,
    points: Grade.points(verdict.score),
    band: verdict.band.key,
    bandLabel: verdict.band.label,
    found: verdict.found,
    missed: verdict.missed,
    extra: verdict.extra,
    flipped: verdict.flipped,
    ms,
  };
}

function nextCard(room) {
  const m = room.match;
  if (m.phase !== 'reveal') throw new Error('That card is still being answered.');
  // The marks only count towards a total once the card is closed, so that a
  // total can never be ahead of what has been revealed.
  for (const p of room.players) {
    const a = p.answers[m.at];
    if (!a) continue;
    p.total += a.points;
    p.spent += a.ms == null ? (room.clock ? room.clock * 1000 : 0) : a.ms;
  }
  if (m.at + 1 >= m.cards.length) return endMatch(room);
  if (room.rule === 'sudden') {
    // Alone, the run is over at the first miss. In a duel it is over when one
    // player is left standing — or none, when the last of them went out on
    // the same card, and then the marks settle it.
    const standing = room.players.filter((p) => isPlaying(room, p) && p.outAt == null).length;
    if (m.playing.length < 2 ? standing === 0 : standing <= 1) return endMatch(room);
  }
  m.at += 1;
  openCard(room);
}

/**
 * Who has won, and the order they came in.
 *
 * Settled on marks. Time breaks a tie and nothing else: the room grades an
 * answer on how close it is to the card, and a duel where the faster typist
 * beats the better answer would be grading something else. A tie on both is
 * left as a tie, because it is one.
 *
 * Sudden death puts one thing ahead of the marks: how long you lasted. The
 * last one standing has won however few marks they scraped through on, which
 * is the whole point of playing it that way.
 */
function standings(room) {
  const m = room.match;
  const sudden = room.rule === 'sudden';
  const rows = room.players
    .filter((p) => m.playing.includes(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      userId: p.userId,
      total: p.total,
      spent: p.spent,
      cards: p.answers.filter(Boolean).length,
      best: p.answers.reduce((n, a) => (a && a.points > n ? a.points : n), 0),
      // Which card put them out, counting from one, or null for still in.
      out: p.outAt == null ? null : p.outAt + 1,
      // Cards got right before that, which is the figure sudden death is for.
      run: p.answers.filter((a) => a && a.points >= PASS).length,
      lasted: p.outAt == null ? m.cards.length + 1 : p.outAt,
    }))
    .sort((a, b) => (sudden ? b.lasted - a.lasted : 0) || b.total - a.total || a.spent - b.spent);
  const first = rows[0];
  for (const r of rows) {
    r.won = !!first && (!sudden || r.lasted === first.lasted) && r.total === first.total && r.spent === first.spent;
  }
  return rows;
}

function endMatch(room) {
  const m = room.match;
  m.phase = 'ended';
  clearClock(room);
  m.standings = standings(room);
  recordMatch(room);
}

// --- the lifetime record ----------------------------------------------------

// The record is worth strictly less than the match in progress, exactly as it
// is at the card table: a bucket that has gone away must never be the reason
// a round of revision falls over.
function keepCounting(fn) {
  try {
    fn();
  } catch {
    /* the match carries on regardless */
  }
}

/**
 * File the match under everybody who has an account.
 *
 * The rules are the card table's, for the same reasons: a solo run is not a
 * duel and is not counted as one, and an account is counted once however many
 * tabs it has open.
 */
function recordMatch(room) {
  const m = room.match;
  if (m.phase !== 'ended') return;
  const rows = m.standings.filter((r) => r.userId);
  if (!rows.length) return;
  // One person in two tabs is one player, not two.
  const seen = new Set();
  const solo = room.mode === 'solo' || rows.length < 2;
  for (const r of rows) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    keepCounting(() =>
      Stats.recordBattle(r.userId, {
        solo,
        won: !solo && r.won,
        cards: r.cards,
        points: r.total,
        best: r.best,
        deck: m.deck,
      })
    );
    // The day's board takes the first run of the day and ignores the rest,
    // which Daily.record sees to. Only a whole run is a run: the daily deck is
    // always played on marks, so a finished one has answered every card.
    if (room.daily && !m.retry) {
      keepCounting(() => Daily.record(r.userId, room.daily, { points: r.total, cards: r.cards, spent: r.spent }));
    }
  }
}

// --- what a player is told ---------------------------------------------------

const publicPlayer = (room, p) => ({
  id: p.id,
  name: p.name,
  connected: p.connected,
  host: room.hostId === p.id,
  playing: isPlaying(room, p),
  watching: !!p.watcher,
  out: p.outAt != null,
});

/**
 * The room as one player sees it.
 *
 * The rule from the top of this file lives in `card` below: while the phase is
 * 'asking', what goes out is the front and the hint. The back, and every other
 * player's answer, appear only once the card is closed.
 */
export function viewFor(room, player) {
  const m = room.match;
  const base = {
    code: room.code,
    hostId: room.hostId,
    mode: room.mode,
    source: room.source,
    presetId: room.presetId,
    length: room.length,
    clock: room.clock,
    rule: room.rule,
    pass: PASS,
    // While the room is on the daily deck: which day, which deck, and the
    // board as it stands, so the result screen can say where the run landed.
    daily: room.daily
      ? { key: room.daily, deck: Daily.deckFor(room.daily)?.name || '', board: dailyBoard(room.daily, player) }
      : null,
    maxPlayers: MAX_PLAYERS,
    players: room.players.map((p) => publicPlayer(room, p)),
    you: { id: player.id, name: player.name, host: room.hostId === player.id, watching: !!player.watcher },
  };

  if (!m) return { ...base, match: null };

  const card = m.cards[m.at];
  const mine = player.answers?.[m.at] || null;
  const open = m.phase === 'asking';

  const match = {
    phase: m.phase,
    at: m.at,
    total: m.cards.length,
    deadline: m.deadline,
    // Whether this card is in front of you: in the match, and not put out.
    playing: inAt(room, player, m.at),
    // In the match at all, which somebody put out still is.
    inMatch: m.playing.includes(player.id),
    outAt: player.outAt == null ? null : player.outAt + 1,
    retry: m.retry,
    card: {
      kind: card.kind,
      front: card.front,
      hint: card.hint,
      ownerName: card.ownerName,
      // The options go out while the card is open — they have to, they are
      // the question — but never which of them is right.
      options: card.kind === 'choice' ? card.options.map((o) => ({ id: o.id, text: o.text })) : null,
      // The two lines that matter, and they are the same line twice. An open
      // card tells no browser what the answer is: not the back of a text
      // card, not which option is right on a choice. Not the asker's browser,
      // not a spectator's, not the host's.
      back: open ? null : card.back,
      answerId: open ? null : card.answerId ?? null,
    },
    // Who has answered, never what they said, while the card is open.
    answered: room.players
      .filter((p) => inAt(room, p, m.at))
      .map((p) => ({ id: p.id, done: !!p.answers[m.at] })),
    // Your own answer comes back to you the moment it is in, so the page can
    // show what it sent rather than an empty box.
    yours: mine ? (open ? { text: mine.text, done: true } : mine) : null,
    // Everybody's, once the card is closed.
    marks: open
      ? null
      : room.players
          .filter((p) => inAt(room, p, m.at))
          .map((p) => ({ id: p.id, name: p.name, ...(p.answers[m.at] || {}), out: p.outAt === m.at })),
    standings: m.phase === 'ended' ? m.standings : null,
    // How many cards a "go over the misses" would deal, once it is over.
    missed: m.phase === 'ended' ? missedCards(room).length : 0,
    // Once it is over, every card this player answered, with the back and
    // what they said side by side. This is the revision half of the room
    // actually paying out: a mark on its own tells somebody they were wrong
    // without telling them what was right. It is built per viewer and holds
    // only their own answers — a finished match is no reason to hand
    // somebody else's typing around.
    review:
      m.phase === 'ended'
        ? m.cards.slice(0, m.at + 1).map((c, i) => ({
            front: c.front,
            back: c.back,
            ownerName: c.ownerName,
            text: player.answers?.[i]?.text ?? '',
            points: player.answers?.[i]?.points ?? 0,
            band: player.answers?.[i]?.band ?? 'missed',
          }))
        : null,
    // The running total counts every card that has been revealed and no card
    // that has not — which means the one on screen counts as soon as it turns
    // over. `p.total` does not move until the table advances, so the card
    // being looked at is added on here; without it the board reads nought
    // while somebody is staring at the eighty-eight they just scored on it.
    totals: room.players
      .filter((p) => isPlaying(room, p))
      .map((p) => ({
        id: p.id,
        name: p.name,
        total: p.total + (open ? 0 : p.answers[m.at]?.points || 0),
        out: p.outAt != null && (p.outAt < m.at || !open),
      })),
  };

  return { ...base, match };
}

// The top of the day's board, as one viewer sees it: their own row marked,
// and nobody's account id on any of it.
function dailyBoard(key, player) {
  return Daily.board(key)
    .slice(0, 10)
    .map((r, i) => ({ place: i + 1, name: r.name, points: r.points, you: r.userId === player.userId }));
}

// --- the socket --------------------------------------------------------------

const send = (ws, obj) => {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
};

/** Push the room out to everybody in it, each cut down to their own view. */
function push(room) {
  for (const p of room.players) {
    if (!p.ws) continue;
    send(p.ws, { type: 'battle:state', state: viewFor(room, p) });
  }
}

const ctxOf = (ws) => ws.battle || null;

function requireHost(room, player) {
  if (room.hostId !== player.id) throw new Error('Only the host can do that.');
}

// None of this changes while the process is up, so it is sent once when a
// socket says hello rather than riding along with every push. It is the house
// decks and what the settings may be set to — the lobby needs all of it
// before there is any room to be in, which is why it does not wait for a join.
//
// The decks are listed, never opened: `Decks.catalog()` gives a name and a
// count and no cards at all. A browser holding the cards is a browser holding
// the answers.
const catalogFor = (ws) =>
  send(ws, {
    type: 'battle:catalog',
    decks: Decks.catalog(),
    lengths: LENGTHS,
    clocks: CLOCKS,
    rules: RULES,
    pass: PASS,
    answerMax: ANSWER_MAX,
    bands: Grade.BANDS,
  });

function attach(room, player, ws) {
  if (player.ws && player.ws !== ws) {
    const old = player.ws;
    old.battle = null;
    try {
      send(old, { type: 'battle:superseded' });
    } catch {
      /* it is going anyway */
    }
  }
  player.ws = ws;
  player.connected = true;
  ws.battle = { room, player };
  // Again on attach, because a socket may have walked straight into a room
  // from a pasted link without ever saying hello.
  catalogFor(ws);
}

function join(ws, msg, account) {
  let room;
  if (msg.type === 'battle:create') {
    room = createRoom();
  } else {
    const code = String(msg.code || '').trim().toUpperCase();
    if (!ROOM_CODE_RE.test(code)) throw new Error('A room code is four letters and numbers.');
    room = rooms.get(code);
    if (!room) throw new Error(`Room ${code} not found. It may have been forgotten.`);
  }

  // Joining somewhere new means leaving wherever you were.
  if (ws.battle) leave(ws);

  // Coming back: the same account gets its place back rather than a second
  // one. A refresh mid-match must not cost somebody their marks.
  let player = room.players.find((p) => p.userId === account.id);
  if (player) {
    attach(room, player, ws);
    push(room);
    return;
  }

  // A match already under way is watched rather than refused. The seat at
  // the table is for the next one.
  const watcher = !!room.match && room.match.phase !== 'ended';
  if (watcher) {
    if (room.players.filter((p) => p.watcher).length >= MAX_WATCHERS) {
      throw new Error(`That match already has ${MAX_WATCHERS} people watching it.`);
    }
  } else if (seated(room).length >= MAX_PLAYERS) {
    throw new Error(`That room is full (${MAX_PLAYERS} players).`);
  }

  player = {
    id: randomId(6),
    userId: account.id,
    name: account.displayName,
    watcher,
    outAt: null,
    ws: null,
    connected: false,
    answers: [],
    total: 0,
    spent: 0,
  };
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  attach(room, player, ws);
  push(room);
}

function leave(ws) {
  const ctx = ctxOf(ws);
  if (!ctx) return;
  const { room, player } = ctx;
  ws.battle = null;
  player.ws = null;
  player.connected = false;
  // A match in progress keeps the seat: the marks already earned belong to
  // somebody who may well be back in ten seconds. In the lobby there is
  // nothing to hold and they simply go — and neither is there for somebody
  // who was only ever watching.
  if (!room.match || room.match.phase === 'ended' || player.watcher) removePlayer(room, player);
  if (rooms.get(room.code) === room) {
    if (!connected(room).length) room.emptySince = Date.now();
    push(room);
  }
}

function dropped(ws) {
  const ctx = ctxOf(ws);
  if (!ctx) return;
  const { room, player } = ctx;
  if (player.ws !== ws) return; // this place has already moved to a newer tab
  ws.battle = null;
  player.ws = null;
  player.connected = false;
  if (!connected(room).length) room.emptySince = Date.now();
  // A card waiting on somebody who has gone is a card the rest of the room
  // waits on forever, so their leaving is itself a reason to look again at
  // whether everybody left has answered.
  if (room.match && room.match.phase === 'asking' && allAnswered(room)) closeCard(room);
  if (!room.match || player.watcher) removePlayer(room, player);
  if (rooms.get(room.code) === room) push(room);
}

// Everybody still connected and in the match has laid an answer down. An
// empty room counts as answered, so a card cannot be left open by everybody
// walking away from it.
function allAnswered(room) {
  const m = room.match;
  return answering(room).every((p) => !!p.answers[m.at]);
}

function settings(room, player, msg) {
  requireHost(room, player);
  if (room.match) throw new Error('The match has already started.');
  if (msg.mode !== undefined) {
    if (msg.mode !== 'duel' && msg.mode !== 'solo') throw new Error('A battle is a duel or solo.');
    room.mode = msg.mode;
  }
  if (msg.source !== undefined) {
    if (msg.source !== 'preset' && msg.source !== 'mine') throw new Error('Cards come from a house deck or your own.');
    room.source = msg.source;
  }
  if (msg.presetId !== undefined) {
    if (!Decks.has(msg.presetId)) throw new Error('No such deck.');
    room.presetId = String(msg.presetId);
  }
  if (msg.length !== undefined) {
    const n = Number(msg.length);
    if (!LENGTHS.includes(n)) throw new Error('That is not one of the match lengths.');
    room.length = n;
  }
  if (msg.clock !== undefined) {
    const n = Number(msg.clock);
    if (!CLOCKS.includes(n)) throw new Error('That is not one of the clock settings.');
    room.clock = n;
  }
  if (msg.rule !== undefined) {
    if (!RULES.includes(msg.rule)) throw new Error('A match is settled on marks or by sudden death.');
    room.rule = msg.rule;
  }
  // Anything set by hand is a room of the host's own making, not the day's.
  room.daily = null;
}

function answer(room, player, msg) {
  const m = room.match;
  if (!m) throw new Error('No match in progress.');
  if (m.phase !== 'asking') throw new Error('That card is closed.');
  if (!isPlaying(room, player)) throw new Error('You are watching this one.');
  if (!inAt(room, player, m.at)) throw new Error('You are out of this one.');
  if (player.answers[m.at]) throw new Error('You have already answered that card.');
  const card = m.cards[m.at];
  // A choice is an option id and a text card is what was typed. An id that
  // is not on this card is refused rather than quietly marked wrong: it means
  // the page and the room disagree about what is on screen, and scoring that
  // as a wrong answer would hide a real fault behind a nought.
  let given;
  if (card.kind === 'choice') {
    given = String(msg.option == null ? '' : msg.option);
    if (!card.options.some((o) => o.id === given)) throw new Error('That is not one of the options.');
  } else {
    given = String(msg.text == null ? '' : msg.text).slice(0, ANSWER_MAX);
  }
  player.answers[m.at] = markOf(room, given, card, Date.now() - m.cardAt);
  // The last answer in closes the card. Nobody should have to press anything
  // to find out how they did.
  if (allAnswered(room)) closeCard(room);
}

/**
 * The cards somebody in the match did not get: marked below a pass by any
 * player who answered them. For a solo run that is exactly your own misses;
 * for a duel it is the cards that beat at least one of you, which is the set
 * worth going over together.
 *
 * Only cards that were reached count — sudden death can end a match with most
 * of the deck never turned over — and each comes back as a fresh copy, its
 * options shuffled again, so the second go tests the answer and not where on
 * the screen it was.
 */
function missedCards(room) {
  const m = room.match;
  const playing = room.players.filter((p) => isPlaying(room, p));
  const out = [];
  for (let i = 0; i <= m.at && i < m.cards.length; i++) {
    const beaten = playing.some((p) => p.answers[i] && p.answers[i].points < PASS);
    if (beaten) out.push(m.cards[i]);
  }
  return out;
}

const freshCopy = (c) => (c.kind === 'choice' ? { ...c, options: shuffled(c.options) } : { ...c });

function requireEnded(room, player) {
  requireHost(room, player);
  if (!room.match || room.match.phase !== 'ended') throw new Error('The match is not over.');
}

// Back to a lobby: the match is cleared, anybody who left during it goes, and
// anybody who came to watch is sat down if there is a seat for them.
function toLobby(room) {
  clearClock(room);
  room.match = null;
  for (const p of room.players) {
    p.answers = [];
    p.total = 0;
    p.spent = 0;
    p.outAt = null;
  }
  // Anybody who left during the match goes now rather than lingering in the
  // lobby as a name nobody can account for.
  room.players = room.players.filter((p) => p.connected);
  for (const p of room.players) {
    if (p.watcher && seated(room).length < MAX_PLAYERS) p.watcher = false;
  }
  if (!room.players.some((p) => p.id === room.hostId)) room.hostId = seated(room)[0]?.id ?? null;
  if (!room.players.length) forget(room);
}

function again(room, player) {
  requireEnded(room, player);
  room.daily = null;
  toLobby(room);
}

/** The same settings, a fresh deal, straight away. */
function rematch(room, player) {
  requireEnded(room, player);
  toLobby(room);
  if (rooms.get(room.code) !== room) return;
  startMatch(room);
}

/** The cards that were missed, and nothing else, straight away. */
function retry(room, player) {
  requireEnded(room, player);
  const cards = missedCards(room).map(freshCopy);
  if (!cards.length) throw new Error('Nothing was missed. Deal a rematch instead.');
  // A second look at the day's cards is revision, and is not a run of the day.
  toLobby(room);
  if (rooms.get(room.code) !== room) return;
  startMatch(room, shuffled(cards));
}

/**
 * Today's ten, alone, now. A room of its own, set to the day's deck and
 * started at once: there is nothing to set up, which is the point of it.
 */
function daily(ws, account) {
  if (!Daily.deckFor()) throw new Error('There is no daily deck today.');
  join(ws, { type: 'battle:create' }, account);
  const { room } = ctxOf(ws);
  room.mode = 'solo';
  room.rule = 'marks';
  room.clock = 0;
  room.length = Daily.LENGTH;
  room.daily = Daily.todayKey();
  startMatch(room);
  push(room);
}

/**
 * Everything a battle client can say. Called by the room server for any
 * message whose type begins `battle:`; returns true if it took it.
 *
 * The account is read off the socket afresh rather than trusted from the
 * message, and a socket with no account behind it is turned away: this room,
 * unlike the card table, has to know whose collection it is dealing from.
 */
export function socket(ws, msg) {
  if (typeof msg.type !== 'string' || !msg.type.startsWith('battle:')) return false;

  try {
    if (!available()) throw new Error('The battle room is closed for a moment. Nothing has been lost.');

    const account = ws.account ? Accounts.byId(ws.account) : null;
    if (!account) throw new Error('Sign in to battle.');

    // Who is holding this socket. The page needs it before there is any room
    // to be in — the front door says your name in the bar — and the account
    // is the server's to state rather than the page's to remember.
    if (msg.type === 'battle:hello') {
      send(ws, { type: 'battle:you', name: account.displayName, daily: Daily.forUser(account.id) });
      catalogFor(ws);
      return true;
    }
    if (msg.type === 'battle:create' || msg.type === 'battle:join') {
      join(ws, msg, account);
      return true;
    }
    if (msg.type === 'battle:leave') {
      leave(ws);
      return true;
    }
    if (msg.type === 'battle:daily') {
      daily(ws, account);
      return true;
    }

    const ctx = ctxOf(ws);
    if (!ctx) throw new Error('You are not in a room.');
    const { room, player } = ctx;

    switch (msg.type) {
      case 'battle:settings':
        settings(room, player, msg);
        break;
      case 'battle:start':
        requireHost(room, player);
        if (room.match) throw new Error('The match has already started.');
        startMatch(room);
        break;
      case 'battle:answer':
        answer(room, player, msg);
        break;
      case 'battle:next':
        requireHost(room, player);
        if (!room.match) throw new Error('No match in progress.');
        nextCard(room);
        break;
      case 'battle:again':
        again(room, player);
        break;
      case 'battle:rematch':
        rematch(room, player);
        break;
      case 'battle:retry':
        retry(room, player);
        break;
      default:
        throw new Error('Unknown action.');
    }

    if (rooms.get(room.code) === room) push(room);
  } catch (err) {
    send(ws, { type: 'battle:error', message: err.message || 'That did not work.' });
  }
  return true;
}

/** A socket has closed. Called by the room server for every connection. */
export function closed(ws) {
  if (ws.battle) dropped(ws);
}

// --- the page ----------------------------------------------------------------

function servePage(req, res) {
  const user = currentUser(req);
  const html = user ? views.app : views.door;
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "frame-ancestors 'none'",
    // The door describes the room and is worth having in an index. A room in
    // progress is members' business.
    'X-Robots-Tag': user ? 'noindex, nofollow' : 'index, follow',
  });
  res.end(html);
}

/**
 * Handle a /battle request. Returns true if it took it, so the room server
 * knows to stop looking for a file to serve.
 *
 * There is no JSON API here at all: everything a battle does is a live thing
 * happening to several people at once, and all of it goes over the socket.
 * This is the page and nothing else.
 */
export function handle(req, res, url) {
  const pathname = url.pathname;
  if (pathname !== '/battle' && !pathname.startsWith('/battle/')) return false;

  if (!available()) {
    res.writeHead(503, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '120',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    res.end(views.closed);
    return true;
  }

  // One page, one address — except for a room code, which is what people
  // paste to each other. /battle/ABCD lands on the page with the code in it.
  if (pathname !== '/battle' && pathname !== '/battle/') {
    const tail = pathname.slice('/battle/'.length).replace(/\/+$/, '').toUpperCase();
    if (!ROOM_CODE_RE.test(tail)) {
      res.writeHead(302, { Location: '/battle', 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('Method not allowed');
    return true;
  }

  servePage(req, res);
  return true;
}

/** Checked once at start-up, so a malformed house deck stops the boot. */
export const start = () => Decks.check();

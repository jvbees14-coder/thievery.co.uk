// ---------------------------------------------------------------------------
// The room server.
//
// One process hosts every room, all of them in memory: no database, nothing
// written to disk. A room is a four-character code, the people sitting at it,
// their settings and whatever round is in progress. A table is dealt three to
// six hands; players fill those hands one each, and anybody arriving after
// that pairs up with someone already seated and shares their hand. Hands
// nobody has taken can be dealt to the house instead, so one or two people can
// sit down to a full table. Anything that changes at a table is pushed
// straight back out to everyone sitting at it, cut down to what each person is
// allowed to know.
//
// Rooms survive a refresh or a dropped connection, and disappear on their own
// once nobody has been connected for an hour.
// ---------------------------------------------------------------------------

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import * as Game from './game.js';
import * as Bot from './bot.js';
import * as Flashcards from './flashcards.js';
import { shuffle, DEAL_SPLITS, SEAT_COUNTS, MIN_SEATS, MAX_SEATS, MAX_PER_SEAT, usesPowerUps } from './deal.js';
import * as PowerUps from './powerups.js';

// PORT=0 is a real answer — "any port going" — so it must not be read as no
// answer at all.
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// --- static files ----------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

// The flashcards set these on every reply of their own and the game's pages
// had none. Not one of them costs anything here: this page is never framed,
// its types are never worth guessing at, and no full address of ours is any
// other site's business.
const SAFE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "frame-ancestors 'none'",
};

// A path off the wire is not a string worth trusting. The percent-encoding can
// be malformed, in which case decoding it throws; and a null byte is the old
// trick for walking out of a directory, which makes fs throw rather than
// answer. Neither is a file anybody could be served, so both come back as
// null, and a null is a 400.
function safePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  return decoded.includes('\u0000') ? null : decoded;
}

function serve(req, res) {
  const url = new URL(req.url, 'http://x');

  // The flashcards live behind a login and keep their own state on disk, so
  // they answer for themselves. Asked first, because /flashcards must not
  // fall through to the room page below.
  if (Flashcards.handle(req, res, url)) return;

  let file = safePath(url.pathname);
  if (file === null) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad request');
  }
  if (file === '/' || file === '') file = '/index.html';
  if (file === '/health') {
    // The game is what this address is really answering for, so a shut
    // flashcards room is reported rather than failed on: the tables are up,
    // and something that watches this must not restart the process over a
    // bucket it cannot reach.
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(Flashcards.isOpen() ? 'ok' : 'ok (flashcards closed)');
  }
  const abs = path.normalize(path.join(PUBLIC_DIR, file));
  if (!abs.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  fs.stat(abs, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      // A bare room link like /ABCD is a page, not a file: serve the game.
      // Every room is the same page and a code stops working within the hour,
      // so search engines are told to keep those links out of the index.
      if (!path.extname(file)) {
        return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
          if (e2) {
            res.writeHead(404);
            return res.end('Not found');
          }
          res.writeHead(200, { 'Content-Type': MIME['.html'], 'X-Robots-Tag': 'noindex, follow', ...SAFE_HEADERS });
          res.end(html);
        });
      }
      res.writeHead(404);
      return res.end('Not found');
    }
    // Everything here is still revalidated on every visit — a room code in the
    // address bar has to reach today's markup rather than last week's — but a
    // browser that already holds the file is told to keep it instead of being
    // sent the whole stylesheet again for nothing.
    const modified = stat.mtime.toUTCString();
    if (req.headers['if-modified-since'] === modified) {
      res.writeHead(304, { 'Last-Modified': modified, 'Cache-Control': 'no-cache' });
      return res.end();
    }
    fs.readFile(abs, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Last-Modified': modified,
        ...SAFE_HEADERS,
      });
      res.end(data);
    });
  });
}

// Nothing one request does may take the whole process down with it. A table is
// memory and nothing else, so a crash empties every room in play — far too
// much to lose over a single malformed address, and something anybody could
// send on purpose.
const server = http.createServer((req, res) => {
  try {
    serve(req, res);
  } catch (err) {
    console.error(`request failed: ${req.method} ${req.url} —`, err.message);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Something went wrong');
  }
});

// --- rooms -----------------------------------------------------------------

const rooms = new Map();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // nothing that can be misread as 0/O or 1/I
const LOBBY_GRACE_MS = 20_000; // how long a seat is held for someone who drops out of a lobby
const ROOM_TTL_MS = 60 * 60_000; // how long an empty room is kept before it is forgotten

function randomId(bytes = 12) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function newRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  } while (rooms.has(code));
  return code;
}

function createRoom() {
  const room = {
    code: newRoomCode(),
    hostId: null,
    seatCount: 4, // how many hands the table is dealt
    teams: false, // partnerships, four-handed only
    customDeal: false, // the host has fixed a hand size for every seat
    handSizes: null, // those fixed sizes, one per seat
    firstSeat: null, // the seat that leads every round, or nobody: random, then rotating
    botLevel: Bot.DEFAULT_BOT_LEVEL, // how hard the house plays
    players: [], // in order of play; the first few sit alone, the rest pair up
    game: null,
    tally: {}, // wins so far this session
    round: 0,
    lastStart: -1,
    emptySince: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

// Seats are filled straight down the list and then round again, so the first
// few people — as many as there are hands — each get one to themselves and
// everyone after that joins a hand already taken. Moving people up and down —
// the arrows and the swap in the lobby — is therefore also how the host
// decides who ends up sharing with whom.
//
// Bots only ever sit at a hand nobody wanted, and never share one: a hand is
// played by the house or by people, not by both. So the people are seated
// first, exactly as they would be at a table with no bots at it, and the bots
// take what is left — keeping the hand they were dealt into where they can,
// moving along where they cannot, and giving their place up altogether once
// enough people turn up to want it.
function reseat(room) {
  // Somebody who arrived after the deal is holding a place rather than a hand,
  // and takes one at the next round. A seat of -1 keeps them out of everything
  // that counts seats without needing a second list to keep in step.
  const waiting = room.players.filter((p) => p.waiting);
  for (const p of waiting) p.seat = -1;
  const folk = room.players.filter((p) => !p.bot && !p.waiting);
  const bots = room.players.filter((p) => p.bot);
  folk.forEach((p, i) => (p.seat = i % room.seatCount));
  if (!bots.length) return;
  const taken = new Set(folk.map((p) => p.seat));
  const seated = new Set();
  for (const b of bots) {
    if (b.seat >= 0 && b.seat < room.seatCount && !taken.has(b.seat)) {
      taken.add(b.seat);
      seated.add(b);
    }
  }
  for (const b of bots) {
    if (seated.has(b)) continue;
    for (let s = 0; s < room.seatCount; s++) {
      if (taken.has(s)) continue;
      b.seat = s;
      taken.add(s);
      seated.add(b);
      break;
    }
  }
  if (seated.size !== bots.length) room.players = room.players.filter((p) => !p.bot || seated.has(p));
}

const capacity = (room) => room.seatCount * MAX_PER_SEAT;
const people = (room) => room.players.filter((p) => !p.bot);
const freeSeats = (room) => {
  const taken = new Set(room.players.map((p) => p.seat));
  return Array.from({ length: room.seatCount }, (_, i) => i).filter((i) => !taken.has(i));
};
const playersAt = (room, seat) => room.players.filter((p) => p.seat === seat);
// What the table calls a seat: one name, or two run together.
const seatName = (room, seat) => playersAt(room, seat).map((p) => p.name).join(' & ') || `Seat ${seat + 1}`;
const seatNames = (room) => Array.from({ length: room.seatCount }, (_, i) => seatName(room, i));

function removePlayer(room, player) {
  const i = room.players.indexOf(player);
  if (i >= 0) room.players.splice(i, 1);
  // The house does not keep playing to an empty room.
  if (!people(room).length) room.players.length = 0;
  reseat(room);
  if (room.hostId === player.id) room.hostId = people(room)[0]?.id ?? null;
  if (room.players.length === 0) {
    room.emptySince = Date.now();
    // Nobody at the table and no round to come back to: that code will never
    // be typed again, and keeping it for the hour is only somewhere for a
    // script opening rooms in a loop to pile them up. A room with a round in
    // progress is kept, because the people in it may yet return to it.
    if (!room.game) rooms.delete(room.code);
  }
}

function lobbyView(room) {
  return {
    code: room.code,
    // In a test room whoever is currently being controlled acts as host.
    hostId: room.test ? (room.players.find((p) => p.ws)?.id ?? room.hostId) : room.hostId,
    seats: room.seatCount,
    maxPlayers: capacity(room),
    teams: room.teams,
    // Five and six hands are dealt with power-ups and there is no switch for
    // it, so the lobby states it rather than offering it.
    powerUps: usesPowerUps(room.seatCount),
    seatCounts: SEAT_COUNTS,
    customDeal: room.customDeal,
    hands: room.customDeal ? handSizes(room) : null,
    firstSeat: room.firstSeat,
    botLevel: room.botLevel,
    freeSeats: room.game ? [] : freeSeats(room),
    round: room.round,
    test: !!room.test,
    // Whether a round is being played at all, which is what tells a latecomer
    // they are waiting on one rather than on the host pressing start.
    playing: !!room.game && room.game.phase !== 'ended',
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      bot: !!p.bot,
      waiting: !!p.waiting,
      connected: isConnected(room, p),
    })),
  };
}

// --- playing on your own ---------------------------------------------------
//
// Create a game under the name "Test67" and the room fills with four players
// and deals straight away. A bar across the top of the page switches between
// the seats, so one person can play every hand and try the game out. Leaving
// closes the whole room.

const TEST_NAME = 'test67';

// --- an unsigned favour to the table ---------------------------------------
//
// Type your name with a "/" in front of it and everybody else at the table
// starts receiving small advertisements they have to click away; a "#" does
// the same but spares nobody, sender included. The mark is stripped off before
// anyone sees the name, and nothing in what a client is sent says who is
// responsible — only whether the ads are coming for them.

const MARKS = ['/', '#'];

// Split a typed name into its mark and the name the table will see.
function readName(typed) {
  const raw = String(typed || '').trim();
  const mark = MARKS.includes(raw[0]) ? raw[0] : null;
  return { mark, name: (mark ? raw.slice(1) : raw).trim().slice(0, 20) };
}

const pranked = (room, player) => player.mark !== '/' && room.players.some((p) => p.mark);

function isConnected(room, p) {
  if (p.bot) return true; // the house is never away from the table
  return room.test ? room.players.some((x) => x.ws) : p.connected;
}

function setupTestRoom(room, ws) {
  room.test = true;
  room.seatCount = 4;
  for (let i = 0; i < 4; i++) {
    const name = i === 0 ? 'Test67' : `Test67-${i + 1}`;
    room.players.push({ id: randomId(6), token: randomId(), name, mark: null, seat: i, ws: null, connected: false });
  }
  room.hostId = room.players[0].id;
  attach(room, room.players[0], ws);
  startRound(room);
  sendState(room);
}

// The sizes a custom deal starts from, and what it currently stands at. They
// belong to the seats rather than to the people, because a shared seat is
// still one hand of cards.
function handSizes(room) {
  const base = DEAL_SPLITS[room.seatCount];
  return Array.from({ length: room.seatCount }, (_, i) => room.handSizes?.[i] ?? base[i]);
}

function customCounts(room) {
  if (!room.customDeal) return null;
  const counts = handSizes(room);
  if (counts.some((c) => !Number.isInteger(c) || c < 1)) throw new Error('Set a hand size for every seat');
  const total = counts.reduce((a, b) => a + b, 0);
  if (total !== 26) throw new Error(`Hand sizes must add up to 26 (currently ${total})`);
  return counts;
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function sendState(room) {
  for (const p of room.players) {
    if (!p.ws) continue;
    // A hand of -1 is somebody waiting for the next round, and they are sent
    // no view of the table at all. Handing `viewFor` a seat that does not
    // exist would sooner or later answer something, and what a spectator may
    // know is not a question this game has ever had to answer.
    const seated = p.seat >= 0;
    send(p.ws, {
      type: 'state',
      you: { id: p.id, seat: p.seat, name: p.name, token: p.token, prank: pranked(room, p), waiting: !!p.waiting },
      room: lobbyView(room),
      game: room.game && seated ? Game.viewFor(room.game, p.seat) : null,
      tally: room.tally,
    });
  }
  scheduleBots(room);
}

// --- the house players -----------------------------------------------------
//
// A bot is handed `Game.viewFor(...)` for its own seat and nothing else, so it
// plays on exactly what a person in that chair would know. The arithmetic
// takes a few milliseconds; the pause in front of it is there so a bot reads
// as somebody thinking rather than a trap springing shut.

const BOT_THINK_MS = [3000, 5000]; // a fresh turn
const BOT_STREAK_MS = [1700, 3000]; // and each further guess in the same run
const BOT_SHOW_MS = [2200, 3600];
const BOT_ARRANGE_MS = [1200, 2600];

// The test suite plays whole rounds out and would rather not sit through the
// good manners, so the pauses can be wound down for it.
const BOT_PACE = Number(process.env.THIEVERY_BOT_PACE) || 1;
const between = ([lo, hi]) => (lo + Math.random() * (hi - lo)) * BOT_PACE;
const botAt = (room, seat) => room.players.find((p) => p.bot && p.seat === seat) || null;

// Where the table stands, as one string. A bot wakes up, finds the table has
// moved on and its key no longer matches, and quietly drops what it was doing.
function botKey(room, job) {
  const g = room.game;
  if (!g) return null;
  if (job.what === 'arrange') return `${room.round}|${g.phase}|arrange|${job.seat}|${g.seats[job.seat].locked}`;
  return [room.round, g.phase, g.step, g.turn, g.log.length, job.what, job.seat].join('|');
}

function scheduleBots(room) {
  const g = room.game;
  if (!g || g.phase === 'ended') return;
  // Nobody is watching, so there is nothing to play to. The moment somebody
  // comes back the next snapshot starts the table up again.
  if (!people(room).some((x) => x.connected)) return;
  const jobs = [];
  if (g.phase === 'arrange') {
    for (const p of room.players) {
      if (p.bot && !g.seats[p.seat].locked) jobs.push({ what: 'arrange', seat: p.seat, wait: BOT_ARRANGE_MS });
    }
  } else if (g.step === 'show') {
    const partner = Game.partnerOf(g, g.turn);
    if (partner === null) {
      // nothing to do
    } else if (botAt(room, partner)) {
      jobs.push({ what: 'show', seat: partner, wait: BOT_SHOW_MS });
    } else if (botAt(room, g.turn) && !playersAt(room, partner).some((x) => isConnected(room, x))) {
      // Nobody is there to show the bot a card, so it moves itself on.
      jobs.push({ what: 'skipShow', seat: g.turn, wait: BOT_SHOW_MS });
    }
  } else if (g.step === 'guess' && botAt(room, g.turn)) {
    // A bot in the middle of a run does not stop to think as long each time.
    const streak = g.log[g.log.length - 1]?.kind === 'good';
    jobs.push({ what: 'guess', seat: g.turn, wait: streak ? BOT_STREAK_MS : BOT_THINK_MS });
  }
  for (const job of jobs) {
    const p = botAt(room, job.seat);
    if (!p) continue;
    const key = botKey(room, job);
    if (p.thinking === key) continue; // already on its way
    p.thinking = key;
    setTimeout(() => runBot(room, p, job, key), between(job.wait));
  }
}

// Whatever happens, a bot has to leave the table playable: if its own move is
// refused, it plays the dullest legal thing instead rather than sitting there
// with the turn in its hand.
function botFallback(room, player, job) {
  const g = room.game;
  if (job.what === 'arrange') return Game.lockOrder(g, player.seat, g.seats[player.seat].cards.map((c) => c.id));
  if (job.what === 'show' || job.what === 'skipShow') return Game.skipShow(g, player.seat, { allowActive: true });
  // Whatever it may still legally shoot at, which at a powered table is not
  // the same list as everything face down: a stakeout takes a hand off the
  // table and a misdirection can pin the guess to one. A fallback that is
  // itself refused leaves the turn exactly where the trouble started.
  const open = Game.legalTargets(g, player.seat);
  if (open.length) Game.guess(g, player.seat, open[0], 1 + Math.floor(Math.random() * 13));
}

async function runBot(room, player, job, key) {
  const stale = () => rooms.get(room.code) !== room || player.thinking !== key || botKey(room, job) !== key;
  if (stale()) return;
  let move;
  try {
    const view = Game.viewFor(room.game, player.seat);
    if (job.what === 'arrange') move = await Bot.chooseArrange(view, player.seat, room.botLevel);
    else if (job.what === 'show') move = await Bot.chooseShow(view, player.seat, room.botLevel);
    else if (job.what === 'guess') move = await Bot.chooseGuess(view, player.seat, room.botLevel);
  } catch (err) {
    console.error(`bot ${player.name} thinking in ${room.code}:`, err.message);
  }
  // Thinking gives the event loop its turn, so the table may have moved on.
  if (stale()) return;
  player.thinking = null;
  try {
    if (job.what === 'arrange') Game.lockOrder(room.game, player.seat, move);
    else if (job.what === 'show') {
      if (move === null) Game.skipShow(room.game, player.seat);
      else Game.showCard(room.game, player.seat, move);
    } else if (job.what === 'skipShow') Game.skipShow(room.game, player.seat, { allowActive: true });
    else if (move) Game.guess(room.game, player.seat, move.target, move.rank);
    else botFallback(room, player, job);
  } catch (err) {
    console.error(`bot ${player.name} playing in ${room.code}:`, err.message);
    try {
      botFallback(room, player, job);
    } catch (err2) {
      console.error(`bot ${player.name} stuck in ${room.code}:`, err2.message);
    }
  }
  applyTally(room);
  sendState(room);
}

function startRound(room) {
  const n = room.seatCount;
  // Anybody who turned up part-way through the last round has been waiting for
  // exactly this moment, so they are dealt in before the cards are.
  let seated = false;
  for (const p of room.players) {
    if (p.waiting) {
      p.waiting = false;
      seated = true;
    }
  }
  if (seated) reseat(room);
  room.round++;
  const first = room.firstSeat;
  const start = first !== null && first < n ? first : room.lastStart < 0 ? crypto.randomInt(n) : (room.lastStart + 1) % n;
  room.lastStart = start;
  room.game = Game.createGame({
    numSeats: n,
    teams: n === 4 && room.teams,
    startSeat: start,
    names: seatNames(room),
    counts: customCounts(room),
    // The house does not draw power-ups, so the game has to know which hands
    // it is sitting at.
    botSeats: room.players.filter((p) => p.bot).map((p) => p.seat),
  });
}

function applyTally(room) {
  const g = room.game;
  if (!g || g.phase !== 'ended' || g.tallied) return;
  g.tallied = true;
  for (const p of room.players) {
    room.tally[p.id] ??= { name: p.name, wins: 0 };
    if (g.result.winners.includes(p.seat)) room.tally[p.id].wins++;
  }
}

// --- join / rejoin ---------------------------------------------------------

function attach(room, player, ws) {
  if (player.ws && player.ws !== ws) {
    const old = player.ws;
    old.ctx = null;
    try {
      send(old, { type: 'superseded' });
      old.close();
    } catch {}
  }
  player.ws = ws;
  player.connected = true;
  ws.ctx = { room, player };
  // None of this changes, so it is sent once when a socket arrives rather than
  // riding along with every snapshot after it. The deal is in here as well as
  // the power-ups: how the 26 cards fall at each size is the server's to say,
  // and a copy of it written out in the page drifts the moment either moves.
  send(ws, { type: 'catalog', powerUps: PowerUps.catalog(), seatCounts: SEAT_COUNTS, splits: DEAL_SPLITS });
}

function handleJoin(ws, msg) {
  const { mark, name } = readName(msg.name);
  let room;
  if (msg.type === 'create') {
    if (!name) throw new Error('Enter a display name first');
    room = createRoom();
    if (name.toLowerCase() === TEST_NAME) {
      if (ws.ctx) handleLeave(ws);
      return setupTestRoom(room, ws);
    }
  } else {
    const code = String(msg.code || '')
      .trim()
      .toUpperCase();
    room = rooms.get(code);
    if (!room) throw new Error(`Room ${code || ''} not found`);
  }

  if (ws.ctx) {
    // Joining somewhere new means leaving wherever you were.
    handleLeave(ws);
  }

  // Coming back: the saved token gets your seat straight away, and failing
  // that, the same name as a player who has dropped out.
  let player = msg.token ? room.players.find((p) => p.token === msg.token) : null;
  if (!player && name) {
    player = room.players.find((p) => !p.connected && p.name.toLowerCase() === name.toLowerCase());
    // Typing your way back in under a fresh mark sets it again. A reconnect
    // carrying a saved token leaves the mark alone, so a refresh — which sends
    // back the stripped name — cannot call the joke off by accident.
    if (player) player.mark = mark;
  }
  if (player) {
    attach(room, player, ws);
    sendState(room);
    return;
  }

  if (!name) throw new Error('Enter a display name first');
  // Bots are not counted: a person arriving takes a hand off the house before
  // they are ever turned away.
  if (people(room).length >= capacity(room)) throw new Error(`That room is full (${capacity(room)} players)`);
  if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('Someone in that room already has that name');
  }
  // Turning up mid-round used to be a closed door and a message telling you to
  // try again later, which meant sitting on the home screen guessing at when
  // "later" was. The round cannot be joined — the cards are dealt — but the
  // room can, so a latecomer waits in it and is dealt in at the next round.
  // They are shown nothing of the table while they wait.
  const waiting = !!room.game;
  // The first few arrivals get a hand each; after that a newcomer joins
  // whoever is next round the table and the two of them share one.
  player = { id: randomId(6), token: randomId(), name, mark, seat: waiting ? -1 : 0, waiting, ws: null, connected: false };
  room.players.push(player);
  reseat(room);
  if (!room.hostId) room.hostId = player.id;
  attach(room, player, ws);
  sendState(room);
}

function handleLeave(ws) {
  const ctx = ws.ctx;
  if (!ctx) return;
  const { room, player } = ctx;
  ws.ctx = null;
  player.ws = null;
  player.connected = false;
  if (room.test) {
    // One person is every seat, so there is nothing left to keep open.
    rooms.delete(room.code);
    return;
  }
  // Somebody waiting for the next round holds no cards, so there is nothing to
  // keep their place for: they leave the moment they say so.
  if (!room.game || room.game.phase === 'ended' || player.waiting) {
    removePlayer(room, player);
    if (room.game && room.players.length === 0) room.game = null;
  }
  sendState(room);
}

function handleDisconnect(ws) {
  const ctx = ws.ctx;
  if (!ctx) return;
  const { room, player } = ctx;
  if (player.ws !== ws) return; // this seat has already moved to a newer tab
  ws.ctx = null;
  player.ws = null;
  player.connected = false;
  if (!people(room).some((x) => x.connected)) room.emptySince = Date.now();
  if ((!room.game || player.waiting) && !room.test) {
    setTimeout(() => {
      if (!player.connected && rooms.get(room.code) === room && (!room.game || player.waiting) && room.players.includes(player)) {
        removePlayer(room, player);
        sendState(room);
      }
    }, LOBBY_GRACE_MS);
  }
  sendState(room);
}

// --- everything a player can do --------------------------------------------

function handleAction(ws, msg) {
  const ctx = ws.ctx;
  if (!ctx) throw new Error('You are not in a room');
  const { room, player } = ctx;
  const isHost = room.test || room.hostId === player.id;
  const g = room.game;
  const requireHost = () => {
    if (!isHost) throw new Error('Only the host can do that');
  };
  const requireLobby = () => {
    if (g) throw new Error('The game has already started');
  };
  const requireGame = () => {
    if (!g) throw new Error('No game in progress');
  };
  const requireEnded = () => {
    requireGame();
    if (g.phase !== 'ended') throw new Error('The round is still in progress');
  };

  switch (msg.type) {
    case 'leave':
      return handleLeave(ws);

    case 'lobby:seats': {
      requireHost();
      requireLobby();
      const n = Number(msg.seats);
      if (!SEAT_COUNTS.includes(n)) throw new Error(`A table is dealt ${MIN_SEATS} to ${MAX_SEATS} hands`);
      if (people(room).length > n * MAX_PER_SEAT) {
        throw new Error(`Too many players in the room for ${n} hands (room for ${n * MAX_PER_SEAT})`);
      }
      room.seatCount = n;
      room.handSizes = null; // a different number of hands needs a different split
      if (room.firstSeat !== null && room.firstSeat >= n) room.firstSeat = null;
      if (n !== 4) room.teams = false; // partnerships are a four-handed game
      reseat(room);
      break;
    }
    case 'lobby:teams':
      requireHost();
      requireLobby();
      if (room.seatCount !== 4) throw new Error('Partnerships need exactly 4 hands');
      room.teams = !!msg.teams;
      break;

    case 'lobby:deal':
      requireHost();
      requireLobby();
      room.customDeal = !!msg.custom;
      if (room.customDeal && !room.handSizes) room.handSizes = handSizes(room);
      break;

    case 'lobby:handSize': {
      requireHost();
      requireLobby();
      const seat = Number(msg.seat);
      if (!Number.isInteger(seat) || seat < 0 || seat >= room.seatCount) throw new Error('No such seat');
      const n = Number(msg.size);
      if (!Number.isInteger(n) || n < 1 || n > 24) throw new Error('Hand size must be between 1 and 24');
      room.handSizes = handSizes(room);
      room.handSizes[seat] = n;
      break;
    }
    case 'lobby:first': {
      requireHost();
      requireLobby();
      const seat = msg.seat === null || msg.seat === undefined || msg.seat === '' ? null : Number(msg.seat);
      if (seat !== null && (!Number.isInteger(seat) || seat < 0 || seat >= room.seatCount)) throw new Error('No such seat');
      room.firstSeat = seat;
      break;
    }
    case 'lobby:bot': {
      requireHost();
      requireLobby();
      if (room.test) throw new Error('A test room comes with its own table');
      const free = freeSeats(room);
      if (!free.length) throw new Error('Every hand at this table has somebody at it already');
      const want = msg.seat === undefined || msg.seat === null ? null : Number(msg.seat);
      const seat = want !== null && free.includes(want) ? want : free[0];
      const taken = new Set(room.players.map((p) => p.name.toLowerCase()));
      room.players.push({
        id: randomId(6),
        token: null,
        name: Bot.botName(taken),
        mark: null,
        bot: true,
        seat,
        ws: null,
        connected: true,
      });
      reseat(room);
      break;
    }
    case 'lobby:botLevel': {
      requireHost();
      requireLobby();
      if (!Bot.BOT_LEVELS.includes(msg.level)) throw new Error('Pick how hard the house should play');
      room.botLevel = msg.level;
      break;
    }
    case 'lobby:shuffle':
      requireHost();
      requireLobby();
      // Only the people move: a bot sits where the seating left it.
      shuffle(room.players);
      room.players.sort((a, b) => (a.bot ? 1 : 0) - (b.bot ? 1 : 0));
      reseat(room);
      break;

    case 'lobby:swap': {
      requireHost();
      requireLobby();
      const a = room.players.findIndex((p) => p.id === msg.a);
      const b = room.players.findIndex((p) => p.id === msg.b);
      if (a < 0 || b < 0) throw new Error('No such player');
      if (room.players[a].bot || room.players[b].bot) throw new Error('A bot plays the hand it was dealt into');
      [room.players[a], room.players[b]] = [room.players[b], room.players[a]];
      reseat(room);
      break;
    }
    case 'lobby:kick': {
      requireHost();
      requireLobby();
      const target = room.players.find((p) => p.id === msg.id);
      if (!target || target === player) throw new Error('No such player');
      if (target.bot) {
        removePlayer(room, target);
        break;
      }
      const tws = target.ws;
      removePlayer(room, target);
      if (tws) {
        tws.ctx = null;
        send(tws, { type: 'kicked' });
      }
      break;
    }
    case 'lobby:start':
      requireHost();
      requireLobby();
      if (room.players.length < room.seatCount) {
        throw new Error(`Need at least ${room.seatCount} players to start (${room.players.length} in room)`);
      }
      customCounts(room); // check the hand sizes add up before dealing anything
      startRound(room);
      break;

    case 'arrange:lock':
      requireGame();
      Game.lockOrder(g, player.seat, msg.order);
      break;

    case 'show':
      requireGame();
      Game.showCard(g, player.seat, Number(msg.idx));
      break;

    case 'show:skip': {
      requireGame();
      // Nobody at the partner seat is around to show a card, so the active
      // seat is allowed to move itself on.
      const partnerSeat = Game.partnerOf(g, g.turn);
      const partners = partnerSeat === null ? [] : playersAt(room, partnerSeat);
      Game.skipShow(g, player.seat, { allowActive: !partners.some((x) => isConnected(room, x)) });
      break;
    }
    case 'guess':
      requireGame();
      Game.guess(g, player.seat, msg.target, Number(msg.rank));
      break;

    case 'powerup':
      requireGame();
      // Everything about whether this hand may play this now — whose turn it
      // is, whether the alarm has a run to stop, whether a pickpocket is too
      // late — is the game's to decide, not the room's.
      Game.playPowerUp(g, player.seat, String(msg.id || ''), msg.opts || {});
      break;

    case 'test:switch': {
      if (!room.test) throw new Error('Not a test room');
      const target = room.players[Number(msg.seat)];
      if (!target) throw new Error('No such seat');
      if (target !== player) {
        ws.ctx = null;
        player.ws = null;
        player.connected = false;
        attach(room, target, ws);
      }
      break;
    }

    case 'newRound':
      requireHost();
      requireEnded();
      if (room.players.some((p) => !isConnected(room, p))) throw new Error('Wait for everyone to reconnect (or go back to the lobby)');
      startRound(room);
      break;

    case 'turn:pass': {
      requireHost();
      requireGame();
      if (g.phase !== 'play') throw new Error('The round is not in progress');
      const here = playersAt(room, g.turn);
      if (here.some((x) => isConnected(room, x))) {
        throw new Error('Somebody is at that hand — give them a moment');
      }
      Game.passTurn(g, g.turn);
      break;
    }

    case 'toLobby':
      requireHost();
      requireEnded();
      room.game = null;
      // Back in the lobby there is no round to be waiting for.
      for (const p of room.players) p.waiting = false;
      room.players = room.players.filter((p) => isConnected(room, p));
      reseat(room);
      if (!room.players.some((p) => p.id === room.hostId)) room.hostId = room.players[0]?.id ?? null;
      break;

    default:
      throw new Error(`Unknown action: ${msg.type}`);
  }

  applyTally(room);
  sendState(room);
}

// --- the connection --------------------------------------------------------

// Nothing a client has to say is large. The longest message at the table is a
// hand being locked in, which is twenty-six short card ids; the default ceiling
// is a hundred megabytes, and a socket is open to anybody who asks.
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;
    try {
      if (msg.type === 'create' || msg.type === 'join') handleJoin(ws, msg);
      else if (msg.type === 'ping') send(ws, { type: 'pong' });
      else handleAction(ws, msg);
    } catch (err) {
      send(ws, { type: 'error', message: err.message || 'Something went wrong' });
    }
  });
  ws.on('close', () => handleDisconnect(ws));
  ws.on('error', () => {});
});

// A seat whose connection has quietly died should show as offline to the rest
// of the table, so every socket is pinged and dropped if it stops answering.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

// Forget rooms nobody has come back to.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyone = people(room).some((p) => p.connected);
    if (!anyone && now - room.emptySince > ROOM_TTL_MS) rooms.delete(code);
  }
}, 60_000);

// The admin account, if the environment has a password to give it, before the
// door is opened to anybody.
await Flashcards.start();

// PORT=0 asks the machine for whatever port is going, which is how the tests
// get one to themselves; the line below reports the port actually in use
// rather than the one that was asked for.
server.listen(PORT, () => {
  console.log(`Thievery.co.uk is running at http://localhost:${server.address().port}`);
});

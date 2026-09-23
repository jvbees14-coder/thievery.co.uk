// ---------------------------------------------------------------------------
// /switchhead — the shedding game, with the hands moving under you.
//
// The rules are in `shed.js`, and this is everything around them: the rooms,
// the lobby where the host picks which special cards are in, the socket and
// the record.
//
// It is the battle room's shape and not the card table's. Behind the login,
// because the rounds are counted against a name and a room with nobody in it
// who can be named is not worth opening; but a room is memory like the card
// table's — a four-character code in a Map, forgotten an hour after the last
// person goes, and taken by a restart. Nothing about a game is written down
// except the lifetime record, and that through `keepCounting`, so a bucket
// that has gone away can never take a game down with it.
//
// --- the swap -----------------------------------------------------------------
//
// The room has no part in it. Every ten to fifteen turns `shed.js` swaps two
// hands inside the move that ends the count, and the room pushes the result
// exactly as it would after any move — no message of its own, no log line, no
// field saying something happened. That is the rule: there is no indication
// a swap is coming, and none that it came, beyond the cards.
//
// --- what a player may know -----------------------------------------------------
//
// `Shed.viewFor` decides, and is the only thing that does. Everybody's face-
// down cards and everybody else's hand stay on the server.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as Accounts from './accounts.js';
import * as Shed from './shed.js';
import * as Stats from './stats.js';
import { available } from './store.js';
import { currentUser } from './plumbing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, 'views');

// Behind a login, so out of public/.
const readView = (name) => fs.readFileSync(path.join(VIEWS, name), 'utf8');
const views = {
  app: readView('switchhead.html'),
  door: readView('switchhead-door.html'),
  closed: readView('switchhead-closed.html'),
};

// The room needs the ledger to know who is sitting down, so it shuts with it.
export const isOpen = () => available();

export const MAX_WATCHERS = 16;

const ROOM_TTL_MS = 60 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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

// --- the room -------------------------------------------------------------------

function createRoom() {
  const room = {
    code: newRoomCode(),
    hostId: null,
    // The host's choice of extra cards. Twos, tens and four of a kind are not
    // in here because they cannot be taken out.
    specials: Object.fromEntries(Shed.OPTIONAL.map((k) => [k, false])),
    players: [],
    game: null,
    emptySince: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

const connected = (room) => room.players.filter((p) => p.connected);
const seated = (room) => room.players.filter((p) => !p.watcher);

function forget(room) {
  rooms.delete(room.code);
}

function removePlayer(room, player) {
  const i = room.players.indexOf(player);
  if (i >= 0) room.players.splice(i, 1);
  if (room.hostId === player.id) room.hostId = seated(room)[0]?.id ?? room.players[0]?.id ?? null;
  if (!room.players.length) {
    room.emptySince = Date.now();
    if (!room.game) forget(room);
  }
}

/** Forget rooms nobody has come back to. Called from the server's sweep. */
export function sweep(now = Date.now()) {
  for (const [, room] of rooms) {
    if (connected(room).length) continue;
    if (now - room.emptySince > ROOM_TTL_MS) forget(room);
  }
}

export const openRooms = () => rooms.size;

// --- a game -----------------------------------------------------------------------

function startGame(room) {
  const people = seated(room);
  if (people.length < Shed.MIN_PLAYERS) throw new Error('Switchhead wants somebody to play against. Share the code.');
  if (people.length > Shed.MAX_PLAYERS) throw new Error(`Switchhead is for at most ${Shed.MAX_PLAYERS} players.`);
  people.forEach((p, i) => (p.seat = i));
  for (const p of room.players) if (p.watcher) p.seat = -1;
  room.game = Shed.createGame({ players: people.map((p) => ({ name: p.name })), specials: room.specials });
  room.game.recorded = false;
}

function toLobby(room) {
  room.game = null;
  room.players = room.players.filter((p) => p.connected);
  for (const p of room.players) {
    p.seat = -1;
    if (p.watcher && seated(room).length < Shed.MAX_PLAYERS) p.watcher = false;
  }
  if (!room.players.some((p) => p.id === room.hostId)) room.hostId = seated(room)[0]?.id ?? null;
  if (!room.players.length) forget(room);
}

// --- the lifetime record --------------------------------------------------------

function keepCounting(fn) {
  try {
    fn();
  } catch (err) {
    console.error('stats: not counted —', err.message);
  }
}

// Once per game, once per account. Every game here is against people — the
// room will not deal to fewer than two — so there is no house to set apart.
function recordGame(room) {
  const g = room.game;
  if (!g || g.phase !== 'ended' || g.recorded) return;
  g.recorded = true;
  const rows = Shed.standings(g);
  const seen = new Set();
  for (const p of room.players) {
    if (!p.userId || p.seat < 0 || seen.has(p.userId)) continue;
    const row = rows.find((r) => r.seat === p.seat);
    if (!row) continue;
    seen.add(p.userId);
    keepCounting(() =>
      Stats.recordSwitchhead(p.userId, {
        won: row.place === 1,
        head: row.head,
        players: rows.length,
        pickups: row.pickups,
        burns: row.burns,
        flips: g.flips,
      })
    );
  }
}

// --- what a player is told ------------------------------------------------------

export function viewFor(room, player) {
  const g = room.game;
  return {
    code: room.code,
    hostId: room.hostId,
    specials: room.specials,
    minPlayers: Shed.MIN_PLAYERS,
    maxPlayers: Shed.MAX_PLAYERS,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      connected: p.connected,
      host: room.hostId === p.id,
      watching: !!p.watcher,
    })),
    you: { id: player.id, name: player.name, host: room.hostId === player.id, watching: !!player.watcher, seat: player.seat },
    game: g ? Shed.viewFor(g, player.seat) : null,
  };
}

// --- the socket -------------------------------------------------------------------

const send = (ws, obj) => {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
};

function push(room) {
  recordGame(room);
  for (const p of room.players) {
    if (p.ws) send(p.ws, { type: 'switchhead:state', state: viewFor(room, p) });
  }
}

const ctxOf = (ws) => ws.switchhead || null;

function requireHost(room, player) {
  if (room.hostId !== player.id) throw new Error('Only the host can do that.');
}

const catalogFor = (ws) =>
  send(ws, {
    type: 'switchhead:catalog',
    specials: Shed.SPECIALS,
    minPlayers: Shed.MIN_PLAYERS,
    maxPlayers: Shed.MAX_PLAYERS,
  });

function attach(room, player, ws) {
  if (player.ws && player.ws !== ws) {
    const old = player.ws;
    old.switchhead = null;
    send(old, { type: 'switchhead:superseded' });
  }
  player.ws = ws;
  player.connected = true;
  ws.switchhead = { room, player };
  catalogFor(ws);
}

function join(ws, msg, account) {
  let room;
  if (msg.type === 'switchhead:create') {
    room = createRoom();
  } else {
    const code = String(msg.code || '').trim().toUpperCase();
    if (!ROOM_CODE_RE.test(code)) throw new Error('A room code is four letters and numbers.');
    room = rooms.get(code);
    if (!room) throw new Error(`Room ${code} not found. It may have been forgotten.`);
  }

  if (ws.switchhead) leave(ws);

  // The same account gets its seat back rather than a second one. A refresh
  // in the middle of a game must not cost somebody their cards.
  let player = room.players.find((p) => p.userId === account.id);
  if (player) {
    attach(room, player, ws);
    push(room);
    return;
  }

  // A game already running is watched, and the seat is for the next one.
  const watcher = !!room.game && room.game.phase !== 'ended';
  if (watcher) {
    if (room.players.filter((p) => p.watcher).length >= MAX_WATCHERS) {
      throw new Error(`That game already has ${MAX_WATCHERS} people watching it.`);
    }
  } else if (seated(room).length >= Shed.MAX_PLAYERS) {
    throw new Error(`That room is full (${Shed.MAX_PLAYERS} players).`);
  }

  player = { id: randomId(6), userId: account.id, name: account.displayName, seat: -1, watcher, ws: null, connected: false };
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  attach(room, player, ws);
  push(room);
}

function leave(ws) {
  const ctx = ctxOf(ws);
  if (!ctx) return;
  const { room, player } = ctx;
  ws.switchhead = null;
  player.ws = null;
  player.connected = false;
  // Holding cards in a game that is still going keeps the seat: they may be
  // back in a moment, and anybody else can move them on meanwhile.
  const holding = room.game && room.game.phase !== 'ended' && player.seat >= 0;
  if (!holding) removePlayer(room, player);
  if (rooms.get(room.code) === room) {
    if (!connected(room).length) room.emptySince = Date.now();
    push(room);
  }
}

function dropped(ws) {
  const ctx = ctxOf(ws);
  if (!ctx) return;
  const { room, player } = ctx;
  if (player.ws !== ws) return;
  ws.switchhead = null;
  player.ws = null;
  player.connected = false;
  if (!connected(room).length) room.emptySince = Date.now();
  if (!room.game || player.watcher) removePlayer(room, player);
  if (rooms.get(room.code) === room) push(room);
}

function settings(room, player, msg) {
  requireHost(room, player);
  if (room.game) throw new Error('The game has already started.');
  const key = String(msg.special || '');
  if (!Shed.OPTIONAL.includes(key)) {
    // A fixed card is on the page, with a lock on it, and cannot be asked for.
    throw new Error(Shed.SPECIALS.some((s) => s.key === key) ? 'That card is always in play.' : 'No such card.');
  }
  room.specials[key] = !!msg.on;
}

// The seat this socket plays, or a refusal that says why it cannot.
function seatOf(room, player) {
  if (!room.game) throw new Error('No game in progress.');
  if (player.seat < 0) throw new Error('You are watching this one.');
  return player.seat;
}

// Somebody who has gone away is holding the table up. Anybody still here can
// move them on; what it costs them is the pile.
function nudge(room, player, msg) {
  const g = room.game;
  if (!g || g.phase === 'ended') throw new Error('No game in progress.');
  if (player.seat < 0) throw new Error('You are watching this one.');
  const target =
    g.phase === 'swap'
      ? room.players.find((p) => p.id === msg.id && p.seat >= 0)
      : room.players.find((p) => p.seat === g.turn);
  if (!target) throw new Error('There is nobody to move on.');
  if (target.connected) throw new Error(`${target.name} is still here. Give them a moment.`);
  Shed.nudge(g, target.seat);
}

export function socket(ws, msg) {
  if (typeof msg.type !== 'string' || !msg.type.startsWith('switchhead:')) return false;

  try {
    if (!available()) throw new Error('Switchhead is closed for a moment. Nothing has been lost.');

    const account = ws.account ? Accounts.byId(ws.account) : null;
    if (!account) throw new Error('Sign in to play Switchhead.');

    if (msg.type === 'switchhead:hello') {
      send(ws, { type: 'switchhead:you', name: account.displayName });
      catalogFor(ws);
      return true;
    }
    if (msg.type === 'switchhead:create' || msg.type === 'switchhead:join') {
      join(ws, msg, account);
      return true;
    }
    if (msg.type === 'switchhead:leave') {
      leave(ws);
      return true;
    }

    const ctx = ctxOf(ws);
    if (!ctx) throw new Error('You are not in a room.');
    const { room, player } = ctx;
    const g = room.game;

    switch (msg.type) {
      case 'switchhead:settings':
        settings(room, player, msg);
        break;
      case 'switchhead:start':
        requireHost(room, player);
        if (room.game) throw new Error('The game has already started.');
        startGame(room);
        break;
      case 'switchhead:swap':
        Shed.swapUp(g, seatOf(room, player), msg.hand, msg.up);
        break;
      case 'switchhead:ready':
        Shed.ready(g, seatOf(room, player));
        break;
      case 'switchhead:play':
        Shed.play(g, seatOf(room, player), Array.isArray(msg.cards) ? msg.cards.slice(0, 8) : []);
        break;
      case 'switchhead:blind':
        Shed.blind(g, seatOf(room, player), msg.index);
        break;
      case 'switchhead:pickup':
        Shed.pickUp(g, seatOf(room, player));
        break;
      case 'switchhead:nudge':
        nudge(room, player, msg);
        break;
      case 'switchhead:again':
        requireHost(room, player);
        if (!g || g.phase !== 'ended') throw new Error('The game is not over.');
        toLobby(room);
        break;
      case 'switchhead:rematch':
        requireHost(room, player);
        if (!g || g.phase !== 'ended') throw new Error('The game is not over.');
        toLobby(room);
        if (rooms.get(room.code) !== room) return true;
        startGame(room);
        break;
      default:
        throw new Error('Unknown action.');
    }

    if (rooms.get(room.code) === room) push(room);
  } catch (err) {
    send(ws, { type: 'switchhead:error', message: err.message || 'That did not work.' });
  }
  return true;
}

export function closed(ws) {
  if (ws.switchhead) dropped(ws);
}

// --- the page -----------------------------------------------------------------------

function servePage(req, res) {
  const user = currentUser(req);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'X-Robots-Tag': user ? 'noindex, nofollow' : 'index, follow',
  });
  res.end(user ? views.app : views.door);
}

/**
 * Handle a /switchhead request. Returns true if it took it. Like the battle
 * room, there is no JSON API: this is the page, and everything else is the
 * socket.
 */
export function handle(req, res, url) {
  const pathname = url.pathname;
  if (pathname !== '/switchhead' && !pathname.startsWith('/switchhead/')) return false;

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

  if (pathname !== '/switchhead' && pathname !== '/switchhead/') {
    const tail = pathname.slice('/switchhead/'.length).replace(/[/]+$/, '').toUpperCase();
    if (!ROOM_CODE_RE.test(tail)) {
      res.writeHead(302, { Location: '/switchhead', 'Cache-Control': 'no-store' });
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

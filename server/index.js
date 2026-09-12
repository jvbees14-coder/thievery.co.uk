// ---------------------------------------------------------------------------
// The room server.
//
// One process hosts every room, all of them in memory: no database, nothing
// written to disk. A room is a four-character code, the people sitting at it,
// their settings and whatever round is in progress. Anything that changes at
// a table is pushed straight back out to everyone sitting at it, cut down to
// what each person is allowed to know.
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
import { shuffle, DEAL_SPLITS, PLAYER_COUNTS, MIN_PLAYERS, MAX_PLAYERS } from './deal.js';

const PORT = Number(process.env.PORT) || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// --- static files ----------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = decodeURIComponent(url.pathname);
  if (file === '/' || file === '') file = '/index.html';
  if (file === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  const abs = path.normalize(path.join(PUBLIC_DIR, file));
  if (!abs.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(abs, (err, data) => {
    if (err) {
      // A bare room link like /ABCD is a page, not a file: serve the game.
      if (!path.extname(file)) {
        return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
          if (e2) {
            res.writeHead(404);
            return res.end('Not found');
          }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(html);
        });
      }
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
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
    mode: 4, // how many seats the table is set for
    teams: false, // partnerships, four-handed only
    customDeal: false, // the host has fixed a hand size for every seat
    firstPlayer: null, // who leads every round, or nobody: random, then rotating
    players: [],
    game: null,
    tally: {}, // wins so far this session
    round: 0,
    lastStart: -1,
    emptySince: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

function reseat(room) {
  room.players.forEach((p, i) => (p.seat = i));
}

function removePlayer(room, player) {
  const i = room.players.indexOf(player);
  if (i >= 0) room.players.splice(i, 1);
  reseat(room);
  if (room.hostId === player.id) room.hostId = room.players[0]?.id ?? null;
  if (room.firstPlayer === player.id) room.firstPlayer = null;
  if (room.players.length === 0) room.emptySince = Date.now();
}

function lobbyView(room) {
  return {
    code: room.code,
    // In a test room whoever is currently being controlled acts as host.
    hostId: room.test ? (room.players.find((p) => p.ws)?.id ?? room.hostId) : room.hostId,
    mode: room.mode,
    teams: room.teams,
    customDeal: room.customDeal,
    firstPlayer: room.firstPlayer,
    round: room.round,
    test: !!room.test,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      connected: isConnected(room, p),
      handSize: p.handSize ?? null,
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

function isConnected(room, p) {
  return room.test ? room.players.some((x) => x.ws) : p.connected;
}

function setupTestRoom(room, ws) {
  room.test = true;
  room.mode = 4;
  for (let i = 0; i < 4; i++) {
    const name = i === 0 ? 'Test67' : `Test67-${i + 1}`;
    room.players.push({ id: randomId(6), token: randomId(), name, seat: i, ws: null, connected: false, handSize: null });
  }
  room.hostId = room.players[0].id;
  attach(room, room.players[0], ws);
  startRound(room);
  sendState(room);
}

// The size a seat's hand starts at when the host switches to a custom deal.
function defaultHandSize(room, player) {
  return DEAL_SPLITS[room.mode][player.seat] ?? 6;
}

function customCounts(room) {
  if (!room.customDeal) return null;
  const counts = room.players.map((p) => p.handSize);
  if (counts.some((c) => !Number.isInteger(c) || c < 1)) throw new Error('Set a hand size for every player');
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
    send(p.ws, {
      type: 'state',
      you: { id: p.id, seat: p.seat, name: p.name, token: p.token },
      room: lobbyView(room),
      game: room.game ? Game.viewFor(room.game, p.seat) : null,
      tally: room.tally,
    });
  }
}

function startRound(room) {
  const n = room.mode;
  room.round++;
  const first = room.players.find((p) => p.id === room.firstPlayer);
  const start = first ? first.seat : room.lastStart < 0 ? crypto.randomInt(n) : (room.lastStart + 1) % n;
  room.lastStart = start;
  room.game = Game.createGame({
    numPlayers: n,
    teams: n === 4 && room.teams,
    startSeat: start,
    names: room.players.map((p) => p.name),
    counts: customCounts(room),
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
}

function handleJoin(ws, msg) {
  const name = String(msg.name || '')
    .trim()
    .slice(0, 20);
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
  }
  if (player) {
    attach(room, player, ws);
    sendState(room);
    return;
  }

  if (!name) throw new Error('Enter a display name first');
  if (room.game) throw new Error('That game has already started');
  if (room.players.length >= room.mode) throw new Error('That room is full');
  if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('Someone in that room already has that name');
  }
  player = { id: randomId(6), token: randomId(), name, seat: room.players.length, ws: null, connected: false, handSize: null };
  room.players.push(player);
  if (room.customDeal) player.handSize = defaultHandSize(room, player);
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
  if (!room.game || room.game.phase === 'ended') {
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
  if (room.players.every((p) => !p.connected)) room.emptySince = Date.now();
  if (!room.game && !room.test) {
    setTimeout(() => {
      if (!player.connected && rooms.get(room.code) === room && !room.game && room.players.includes(player)) {
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

    case 'lobby:mode': {
      requireHost();
      requireLobby();
      const m = Number(msg.mode);
      if (!PLAYER_COUNTS.includes(m)) throw new Error(`A table seats ${MIN_PLAYERS} to ${MAX_PLAYERS} players`);
      if (room.players.length > m) throw new Error(`Too many players in the room for ${m}-player mode`);
      room.mode = m;
      if (m !== 4) room.teams = false; // partnerships are a four-handed game
      break;
    }
    case 'lobby:teams':
      requireHost();
      requireLobby();
      if (room.mode !== 4) throw new Error('Partnerships need exactly 4 players');
      room.teams = !!msg.teams;
      break;

    case 'lobby:deal':
      requireHost();
      requireLobby();
      room.customDeal = !!msg.custom;
      if (room.customDeal) {
        for (const p of room.players) if (!Number.isInteger(p.handSize)) p.handSize = defaultHandSize(room, p);
      }
      break;

    case 'lobby:handSize': {
      requireHost();
      requireLobby();
      const target = room.players.find((p) => p.id === msg.id);
      if (!target) throw new Error('No such player');
      const n = Number(msg.size);
      if (!Number.isInteger(n) || n < 1 || n > 24) throw new Error('Hand size must be between 1 and 24');
      target.handSize = n;
      break;
    }
    case 'lobby:first': {
      requireHost();
      requireLobby();
      if (msg.id && !room.players.some((p) => p.id === msg.id)) throw new Error('No such player');
      room.firstPlayer = msg.id || null;
      break;
    }
    case 'lobby:shuffle':
      requireHost();
      requireLobby();
      shuffle(room.players);
      reseat(room);
      break;

    case 'lobby:swap': {
      requireHost();
      requireLobby();
      const a = room.players.findIndex((p) => p.id === msg.a);
      const b = room.players.findIndex((p) => p.id === msg.b);
      if (a < 0 || b < 0) throw new Error('No such player');
      [room.players[a], room.players[b]] = [room.players[b], room.players[a]];
      reseat(room);
      break;
    }
    case 'lobby:kick': {
      requireHost();
      requireLobby();
      const target = room.players.find((p) => p.id === msg.id);
      if (!target || target === player) throw new Error('No such player');
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
      if (room.players.length !== room.mode) {
        throw new Error(`Need exactly ${room.mode} players to start (${room.players.length} in room)`);
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
      const partnerSeat = Game.partnerOf(g, g.turn);
      const partner = partnerSeat === null ? null : room.players[partnerSeat];
      Game.skipShow(g, player.seat, { allowActive: !partner || !isConnected(room, partner) });
      break;
    }
    case 'guess':
      requireGame();
      Game.guess(g, player.seat, msg.target, Number(msg.rank));
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

    case 'toLobby':
      requireHost();
      requireEnded();
      room.game = null;
      room.players = room.players.filter((p) => isConnected(room, p));
      reseat(room);
      if (!room.players.some((p) => p.id === room.hostId)) room.hostId = room.players[0]?.id ?? null;
      if (!room.players.some((p) => p.id === room.firstPlayer)) room.firstPlayer = null;
      break;

    default:
      throw new Error(`Unknown action: ${msg.type}`);
  }

  applyTally(room);
  sendState(room);
}

// --- the connection --------------------------------------------------------

const wss = new WebSocketServer({ server });

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
    const anyone = room.players.some((p) => p.connected);
    if (!anyone && now - room.emptySince > ROOM_TTL_MS) rooms.delete(code);
  }
}, 60_000);

server.listen(PORT, () => {
  console.log(`Thievery.co.uk is running at http://localhost:${PORT}`);
});

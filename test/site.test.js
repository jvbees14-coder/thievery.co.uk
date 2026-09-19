// The front hall, and the ledger behind it.
//
// This starts the real server against a throwaway data directory and checks
// the two things the move to /cards turned on:
//
//   * Where everything now lives. The hall asks for a name, the card table
//     does not, and every link that pointed at the old addresses still lands
//     somewhere sensible.
//   * That a round played by somebody signed in is actually counted, once,
//     against their account — and that a round played by a stranger is
//     counted nowhere.
//
// The round is played out for real over a socket, three signed-in clients at
// a three-hand table, because the whole point of the figures is that they
// come off a table rather than out of a function called directly.
//
//   npm run test:site

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'thievery-site-'));

let PORT = 0;
let child = null;

function startServer() {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
      env: { ...process.env, PORT: '0', THIEVERY_DATA_DIR: DATA_DIR, THIEVERY_BOT_PACE: '0.012' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    child.stdout.on('data', (d) => {
      const at = String(d).match(/running at http:\/\/localhost:(\d+)/);
      if (at) {
        PORT = Number(at[1]);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`server exited early (${code})`)));
  });
}

let checks = 0;
function check(what, fn) {
  return Promise.resolve(fn()).then(() => {
    checks += 1;
    console.log('  ok  ' + what);
  });
}

// --- a browser, more or less -----------------------------------------------
//
// Just enough of one to hold a cookie, because the cookie is the whole
// question: it is what the hall reads on an ordinary request and what the
// card table reads off the WebSocket handshake.

function visitor() {
  const jar = new Map();
  return {
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    async call(route, { method = 'GET', body = null, origin = `http://localhost:${PORT}` } = {}) {
      const headers = {};
      if (body) headers['Content-Type'] = 'application/json';
      if (origin) headers.Origin = origin;
      if (jar.size) headers.Cookie = this.cookie;
      const res = await fetch(`http://localhost:${PORT}/api/site/${route}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      for (const raw of res.headers.getSetCookie?.() || []) {
        const [pair] = raw.split(';');
        const at = pair.indexOf('=');
        const name = pair.slice(0, at).trim();
        const value = pair.slice(at + 1).trim();
        if (value) jar.set(name, value);
        else jar.delete(name);
      }
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    async page(where = '/') {
      const headers = jar.size ? { Cookie: this.cookie } : {};
      const res = await fetch(`http://localhost:${PORT}${where}`, { headers, redirect: 'manual' });
      return { status: res.status, location: res.headers.get('location'), html: await res.text() };
    },
  };
}

const ok = (res, what) => {
  assert.equal(res.status, 200, `${what}: expected 200, got ${res.status} — ${res.body.error || ''}`);
  return res.body;
};

// The document on disk lags what is in memory: a change is held for a quarter
// of a second so that a burst of them is one write, and this whole suite runs
// in about a second. So anything that reads the file waits for it rather than
// assuming it, and says what it was waiting for when it gives up.
async function shelfWhen(pred, what, ms = 6000) {
  const file = path.join(DATA_DIR, 'flashcards.json');
  const until = Date.now() + ms;
  let last = null;
  for (;;) {
    try {
      last = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (pred(last)) return last;
    } catch { /* mid-rename, or not written yet: try again */ }
    if (Date.now() > until) throw new Error(`the document never ${what} (stats: ${JSON.stringify(last?.stats)})`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

// --- a player at the table -------------------------------------------------

class Client {
  constructor(label, cookie = null) {
    this.label = label;
    this.cookie = cookie;
    this.state = null;
    this.you = null;
    this.waiters = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      // The handshake carries the session, exactly as a browser's would. This
      // is the only place the card table ever learns a name.
      this.ws = new WebSocket(`ws://localhost:${PORT}`, this.cookie ? { headers: { Cookie: this.cookie } } : {});
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'state') {
          this.state = msg;
          this.you = msg.you;
          this.waiters = this.waiters.filter((w) => !w(msg));
        }
      });
    });
  }
  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  waitFor(pred, what = 'state', ms = 8000) {
    // Through setImmediate even when the state to hand already matches, so a
    // loop of satisfied waits still gives the socket a turn to deliver.
    if (this.state && pred(this.state)) return new Promise((r) => setImmediate(() => r(this.state)));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.label}: timed out waiting for ${what}`)), ms);
      this.waiters.push((s) => {
        if (s && pred(s)) {
          clearTimeout(t);
          resolve(s);
          return true;
        }
        return false;
      });
    });
  }
  close() {
    this.ws.close();
  }
}

const bySeat = (clients, seat) => clients.find((c) => c.you.seat === seat);
const faceDown = (g, seat) => g.seats[seat].cards.map((c, i) => (c.faceUp ? -1 : i)).filter((i) => i >= 0);
// Only the client holding a seat can see its ranks, which is what makes this
// a test harness rather than a cheat: it asks the owner.
const trueRank = (clients, seat, idx) => bySeat(clients, seat).state.game.seats[seat].cards[idx].rank;

async function lockAll(clients) {
  for (const c of clients) {
    await c.waitFor((s) => s.game && (s.game.phase === 'arrange' || s.game.phase === 'play'), 'the deal');
    if (c.state.game.phase !== 'arrange') continue;
    const cards = c.state.game.seats[c.you.seat].cards;
    c.send({ type: 'arrange:lock', order: cards.map((x) => x.id) });
  }
  for (const c of clients) await c.waitFor((s) => s.game.phase === 'play', 'play phase');
}

// Every guess right, so the first player to take a turn flips the whole table
// and the round ends quickly and without any randomness in who wins.
async function playItOut(clients) {
  const ref = clients[0];
  for (let turn = 0; turn < 200; turn++) {
    await ref.waitFor((s) => s.game.phase !== 'play' || s.game.step === 'guess', 'a guess step');
    const g = ref.state.game;
    if (g.phase !== 'play') break;
    const active = bySeat(clients, g.turn);
    await active.waitFor((s) => s.game.step === 'guess' && s.game.turn === g.turn && s.game.log.length >= g.log.length, 'fresh state');
    const ag = active.state.game;
    const targets = [];
    ag.seats.forEach((s, si) => {
      if (si === g.turn) return;
      faceDown(ag, si).forEach((idx) => targets.push({ seat: si, idx }));
    });
    assert.ok(targets.length, 'the active player should always have a card to guess');
    const t = targets[0];
    const logLen = g.log.length;
    active.send({ type: 'guess', target: t, rank: trueRank(clients, t.seat, t.idx) });
    await ref.waitFor((s) => s.game.log.length > logLen || s.game.phase !== 'play', 'the result');
  }
  await ref.waitFor((s) => s.game.phase === 'ended', 'the end of the round');
  return ref.state.game;
}

// ---------------------------------------------------------------------------

async function run() {
  await startServer();
  console.log(`site: server on ${PORT}, data in ${DATA_DIR}\n`);

  // --- where everything lives ----------------------------------------------

  const stranger = visitor();

  await check('a stranger at "/" is shown the door, not the menu', async () => {
    const res = await stranger.page('/');
    assert.equal(res.status, 200);
    assert.ok(res.html.includes('Open an account'), 'expected the sign-in page');
    assert.ok(!res.html.includes('menu-grid'), 'the menu leaked to a logged-out visitor');
  });

  await check('a stranger cannot read the menu behind it', async () => {
    assert.equal((await stranger.call('me')).status, 401);
  });

  await check('the menu markup is not sitting in public/', async () => {
    assert.equal((await stranger.page('/menu.html')).status, 404);
  });

  await check('the card table is open to anybody at /cards', async () => {
    const res = await stranger.page('/cards');
    assert.equal(res.status, 200);
    assert.ok(res.html.includes('Create game'), 'expected the game page');
  });

  await check('a room link under /cards serves the table', async () => {
    const res = await stranger.page('/cards/ABCD');
    assert.equal(res.status, 200);
    assert.ok(res.html.includes('Create game'));
  });

  await check('anything else under /cards goes back to the table', async () => {
    const res = await stranger.page('/cards/nonsense');
    assert.equal(res.status, 302);
    assert.match(res.location, /\/cards$/);
  });

  // Three generations of room link, all of which are in somebody's messages.
  await check('every older room link still lands at a table', async () => {
    const bare = await stranger.page('/ABCD');
    assert.equal(bare.status, 301, 'a link from before the game left the root');
    assert.match(bare.location, /\/cards\/ABCD$/);

    const query = await stranger.page('/?code=abcd');
    assert.equal(query.status, 301, 'a pre-move invite link should be sent on');
    assert.match(query.location, /\/cards\/ABCD$/);

    const named = await stranger.page('/logic/ABCD');
    assert.equal(named.status, 301, 'a link from the day it was called Logic');
    assert.match(named.location, /\/cards\/ABCD$/);

    const bareNamed = await stranger.page('/logic');
    assert.equal(bareNamed.status, 301);
    assert.match(bareNamed.location, /\/cards$/);
  });

  await check('the flashcards room is where it was', async () => {
    const res = await stranger.page('/flashcards');
    assert.equal(res.status, 200);
    assert.ok(res.html.includes('Open an account'));
  });

  await check('health still answers', async () => {
    assert.equal((await stranger.page('/health')).status, 200);
  });

  // --- the door ------------------------------------------------------------

  const alice = visitor();
  const bob = visitor();
  const carol = visitor();

  await check('an account can be opened at the front door', async () => {
    const body = ok(await alice.call('register', { method: 'POST', body: { username: 'alice', password: 'a-long-enough-password', displayName: 'Alice' } }), 'register');
    assert.equal(body.user.username, 'alice');
    assert.equal(body.play.rounds, 0, 'a new account has played nothing');
    assert.equal(body.collection.count, 3, 'a new account is dealt three cards');
  });

  await check('the menu is served once there is a cookie', async () => {
    const res = await alice.page('/');
    assert.ok(res.html.includes('menu-grid'), 'expected the menu');
    assert.ok(!res.html.includes('Open an account'), 'the door was served to a member');
  });

  await check('a post from another site is refused', async () => {
    const res = await alice.call('account', { method: 'POST', body: { displayName: 'Mallory' }, origin: 'https://not-thievery.example' });
    assert.equal(res.status, 403);
  });

  await check('the display name can be changed', async () => {
    const body = ok(await alice.call('account', { method: 'POST', body: { displayName: 'Alice at the table' } }), 'account');
    assert.equal(body.user.displayName, 'Alice at the table');
  });

  await check('changing a password needs the old one', async () => {
    const res = await alice.call('account', { method: 'POST', body: { password: 'another-long-password', currentPassword: 'wrong' } });
    assert.equal(res.status, 403);
  });

  await check('signing out drops the session', async () => {
    const away = visitor();
    ok(await away.call('register', { method: 'POST', body: { username: 'transient', password: 'a-long-enough-password' } }), 'register');
    ok(await away.call('logout', { method: 'POST' }), 'logout');
    assert.equal((await away.call('me')).status, 401);
    assert.ok((await away.page('/')).html.includes('Open an account'), 'the door should be back');
  });

  for (const [who, name] of [[bob, 'bob'], [carol, 'carol']]) {
    ok(await who.call('register', { method: 'POST', body: { username: name, password: 'a-long-enough-password' } }), `register ${name}`);
  }

  // --- a round, counted ----------------------------------------------------

  const players = [
    new Client('alice', alice.cookie),
    new Client('bob', bob.cookie),
    new Client('carol', carol.cookie),
  ];
  let winners = [];

  await check('three signed-in players play a round out', async () => {
    for (const c of players) await c.connect();
    players[0].send({ type: 'create', name: 'Alice' });
    await players[0].waitFor((s) => !!s.room, 'a room');
    const code = players[0].state.room.code;
    players[1].send({ type: 'join', code, name: 'Bob' });
    players[2].send({ type: 'join', code, name: 'Carol' });
    for (const c of players) await c.waitFor((s) => s.room.players.length === 3, 'everybody seated');
    players[0].send({ type: 'lobby:seats', seats: 3 });
    for (const c of players) await c.waitFor((s) => s.room.seats === 3, 'three hands');
    players[0].send({ type: 'lobby:start' });
    await lockAll(players);
    const game = await playItOut(players);
    winners = game.result.winners;
    assert.ok(winners.length, 'a round should end with a winner');
  });

  await check('the round lands on every account at the table', async () => {
    for (const [who, client] of [[alice, players[0]], [bob, players[1]], [carol, players[2]]]) {
      const { play } = ok(await who.call('me'), `me for ${client.label}`);
      assert.equal(play.rounds, 1, `${client.label} should have one round`);
      assert.equal(play.tables, 1, `${client.label} should have sat at one table`);
      assert.equal(play.versus, 1, `${client.label} played against people`);
      const won = winners.includes(client.you.seat) ? 1 : 0;
      assert.equal(play.wins, won, `${client.label} should have ${won} win`);
      assert.equal(play.versusWins, won);
      assert.equal(play.best, won, 'the best run is the win, or nothing');
      assert.equal(play.rate, won, 'one round means the rate is the win');
    }
  });

  await check('a second round at the same table is not a second table', async () => {
    players[0].send({ type: 'newRound' });
    await lockAll(players);
    await playItOut(players);
    const { play } = ok(await alice.call('me'), 'me');
    assert.equal(play.rounds, 2, 'two rounds');
    assert.equal(play.tables, 1, 'still one table');
  });

  await check('a stranger sits down and is written nowhere', async () => {
    const anon = new Client('anon');
    await anon.connect();
    anon.send({ type: 'create', name: 'Nobody' });
    await anon.waitFor((s) => !!s.room, 'a room');
    anon.send({ type: 'lobby:seats', seats: 3 });
    await anon.waitFor((s) => s.room.seats === 3, 'three hands');
    // Two hands to the house, so one person could play the round out.
    for (const seat of [1, 2]) anon.send({ type: 'lobby:bot', seat });
    await anon.waitFor((s) => s.room.players.filter((p) => p.bot).length === 2, 'two bots');
    anon.send({ type: 'lobby:start' });
    await anon.waitFor((s) => s.game && s.game.phase === 'arrange', 'the deal');
    anon.close();

    const me = ok(await alice.call('me'), 'me');
    const shelf = await shelfWhen((d) => d.stats?.[me.user.id]?.rounds === 2, 'recorded both rounds');
    const names = Object.keys(shelf.stats);
    assert.equal(names.length, 3, `only the three signed-in accounts should have a record, found ${names.length}`);
  });

  await check('the record survives a restart', async () => {
    for (const c of players) c.close();
    const before = ok(await alice.call('me'), 'me').play;
    child.kill();
    await new Promise((r) => child.once('exit', r));
    await startServer();
    const after = ok(await alice.call('me'), 'me').play;
    assert.deepEqual(after, before, 'the lifetime record changed over a restart');
  });

  console.log(`\n${checks} checks passed.`);
}

run()
  .then(() => {
    child?.kill();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nFAILED:', err.message);
    child?.kill();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    process.exit(1);
  });

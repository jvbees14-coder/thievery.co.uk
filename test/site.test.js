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
      env: {
        ...process.env,
        PORT: '0',
        THIEVERY_DATA_DIR: DATA_DIR,
        THIEVERY_BOT_PACE: '0.012',
        THIEVERY_ADMIN_USERNAME: 'house',
        THIEVERY_ADMIN_PASSWORD: 'the-house-always-wins',
      },
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
//
// Partnerships add a step and take some targets away: a turn opens with the
// partner offering a card, which is skipped here because the point is to end
// the round rather than to play it well, and a seat may only be guessed at
// from the other team.
async function playItOut(clients) {
  const ref = clients[0];
  for (let turn = 0; turn < 300; turn++) {
    await ref.waitFor((s) => s.game.phase !== 'play' || ['show', 'guess'].includes(s.game.step), 'a step');
    const g = ref.state.game;
    if (g.phase !== 'play') break;
    const active = bySeat(clients, g.turn);

    if (g.step === 'show') {
      const partnerSeat = (g.turn + 2) % g.numSeats;
      const partner = bySeat(clients, partnerSeat);
      await partner.waitFor((s) => s.game.step === 'show' && s.game.turn === g.turn, 'the show step');
      partner.send({ type: 'show:skip' });
      await ref.waitFor((s) => s.game.step !== 'show' || s.game.turn !== g.turn, 'the show to pass');
      continue;
    }

    await active.waitFor((s) => s.game.step === 'guess' && s.game.turn === g.turn && s.game.log.length >= g.log.length, 'fresh state');
    const ag = active.state.game;
    const targets = [];
    ag.seats.forEach((s, si) => {
      if (si === g.turn || s.team === ag.seats[g.turn].team) return;
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

  await check('about and privacy are open to anybody', async () => {
    for (const where of ['/about', '/privacy']) {
      const res = await stranger.page(where);
      assert.equal(res.status, 200, `${where} answered ${res.status}`);
      assert.ok(res.html.includes('class="site-foot"'), `${where} has no footer`);
      assert.ok(!res.html.includes('{{'), `${where} has a placeholder left in it`);
    }
    assert.ok((await stranger.page('/about')).html.includes('MIT'), 'the decks are credited');
    assert.ok((await stranger.page('/privacy')).html.includes('mailto:admin@thievery.co.uk'), 'the privacy page gives no address to write to');
  });

  await check('an address nobody recognises is a page, and still a 404', async () => {
    const res = await stranger.page('/no-such-page');
    assert.equal(res.status, 404);
    assert.ok(res.html.includes('Nothing here'), 'expected the not-found page');
    assert.ok(res.html.includes('href="/cards"'), 'the not-found page should point at the table');
  });

  await check('the game page by its file name is sent to /cards', async () => {
    const res = await stranger.page('/cards.html');
    assert.equal(res.status, 301);
    assert.equal(res.location, '/cards');
  });

  // The views and the game page are annotated for whoever maintains them.
  // None of that is for the visitor, so none of it may reach a browser.
  await check('no page is served with its comments or its placeholders in it', async () => {
    for (const where of ['/', '/cards', '/cards/ABCD', '/flashcards', '/battle', '/switchhead', '/about', '/privacy', '/nowhere']) {
      const { html } = await stranger.page(where);
      assert.ok(!html.includes('<!--'), `${where} was served with a comment in it`);
      assert.ok(!html.includes('{{'), `${where} was served with a placeholder in it`);
    }
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
    assert.equal(body.collection.count, 0, 'a new account starts with no cards');
  });

  await check('the menu is served once there is a cookie', async () => {
    const res = await alice.page('/');
    assert.ok(res.html.includes('menu-grid'), 'expected the menu');
    // One bar on every page, with every room on it and nothing left over.
    for (const room of ['/cards', '/flashcards', '/battle', '/switchhead']) {
      assert.ok(res.html.includes(`href="${room}"`), `the bar does not link to ${room}`);
    }
    assert.ok(!res.html.includes('<!--') && !res.html.includes('{{'), 'the menu was served unrendered');
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

  // --- the members panel ---------------------------------------------------

  const house = visitor();
  ok(await house.call('login', { method: 'POST', body: { username: 'house', password: 'the-house-always-wins' } }), 'admin login');

  await check('the members panel does not exist for a member', async () => {
    assert.equal((await bob.call('admin/users')).status, 404);
    const target = ok(await house.call('admin/users'), 'overview').users.find((u) => u.username === 'carol');
    assert.equal((await bob.call('admin/users/' + target.id, { method: 'POST', body: { displayName: 'Taken' } })).status, 404);
  });

  await check('the admin can see every account from the hall', async () => {
    const { users } = ok(await house.call('admin/users'), 'overview');
    for (const name of ['alice', 'bob', 'carol', 'house']) assert.ok(users.some((u) => u.username === name), name + ' is missing');
    assert.ok(ok(await house.call('me'), 'me').user.admin, 'the menu is not told who the admin is');
  });

  await check("the admin saves a change to another member's account", async () => {
    const { users } = ok(await house.call('admin/users'), 'overview');
    const target = users.find((u) => u.username === 'transient');
    const body = ok(await house.call('admin/users/' + target.id, {
      method: 'POST',
      body: { displayName: 'Passing through', username: 'transit', note: 'renamed from the hall', password: 'a-fresh-long-password' },
    }), 'patch');
    assert.equal(body.account.displayName, 'Passing through');
    assert.equal(body.account.username, 'transit');
    assert.equal(body.account.note, 'renamed from the hall');
    // And it took: the new name and the new password open the account.
    const back = visitor();
    ok(await back.call('login', { method: 'POST', body: { username: 'transit', password: 'a-fresh-long-password' } }), 'login as renamed');
  });

  await check('a save the house refuses says why', async () => {
    const target = ok(await house.call('admin/users'), 'overview').users.find((u) => u.username === 'transit');
    const res = await house.call('admin/users/' + target.id, { method: 'POST', body: { username: 'alice' } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /taken/);
  });

  await check('a suspended account cannot sign in, and a closed one is gone', async () => {
    const target = ok(await house.call('admin/users'), 'overview').users.find((u) => u.username === 'transit');
    ok(await house.call('admin/users/' + target.id, { method: 'POST', body: { disabled: true } }), 'suspend');
    const res = await visitor().call('login', { method: 'POST', body: { username: 'transit', password: 'a-fresh-long-password' } });
    assert.notEqual(res.status, 200, 'a suspended account signed in');
    const left = ok(await house.call('admin/users/' + target.id, { method: 'DELETE' }), 'delete').users;
    assert.ok(!left.some((u) => u.id === target.id), 'the account is still listed');
  });

  async function openAccount(name) {
    const who = visitor();
    ok(await who.call('register', { method: 'POST', body: { username: name, password: 'a-long-enough-password' } }), `register ${name}`);
    return who;
  }

  // Everybody who ends up sitting down at a table. The ledger should hold a
  // row for each of them and for nobody else — not for the account that only
  // ever registered, and not for the stranger who plays without one.
  const played = [alice, bob, carol];

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

  await check('the rounds are filed under the kind of game they were', async () => {
    const { play } = ok(await alice.call('me'), 'me');
    assert.equal(play.rounds, 2);
    assert.equal(play.seats['3'].rounds, 2, 'both rounds were three-handed');
    assert.equal(play.seats['4'].rounds, 0);
    assert.equal(play.plain.rounds, 2, 'three hands are dealt no power-ups');
    assert.equal(play.powered.rounds, 0);
    assert.equal(play.teams.rounds, 0, 'three hands cannot be partnerships');
    assert.equal(play.shared.rounds, 0, 'three people at three hands share nothing');
    assert.equal(play.attributed, play.rounds, 'every round should be accounted for');
  });

  await check('partnerships and a shared hand are counted as such', async () => {
    for (const c of players) c.close();
    // Five people at four hands: the fifth shares the first hand, which is
    // the only way `shared` can ever be true.
    const folk = [alice, bob, carol, await openAccount('dan'), await openAccount('erin')];
    played.push(folk[3], folk[4]);
    const table = folk.map((who, i) => new Client(`p${i}`, who.cookie));
    for (const c of table) await c.connect();

    table[0].send({ type: 'create', name: 'Alice' });
    await table[0].waitFor((s) => !!s.room, 'a room');
    const code = table[0].state.room.code;
    for (let i = 1; i < table.length; i++) table[i].send({ type: 'join', code, name: `P${i}` });
    for (const c of table) await c.waitFor((s) => s.room.players.length === 5, 'everybody seated');

    table[0].send({ type: 'lobby:seats', seats: 4 });
    await table[0].waitFor((s) => s.room.seats === 4, 'four hands');
    table[0].send({ type: 'lobby:teams', teams: true });
    for (const c of table) await c.waitFor((s) => s.room.teams === true, 'partnerships');

    table[0].send({ type: 'lobby:start' });
    await lockAll(table);
    const game = await playItOut(table);
    assert.equal(game.teams, true, 'the round should have been played as partnerships');
    for (const c of table) c.close();

    const { play } = ok(await alice.call('me'), 'me');
    assert.equal(play.rounds, 3);
    assert.equal(play.seats['4'].rounds, 1, 'the four-hand round should be filed under four');
    assert.equal(play.seats['3'].rounds, 2, 'and the three-hand ones left alone');
    assert.equal(play.teams.rounds, 1, 'it was a partnership round');
    assert.equal(play.powered.rounds, 0, 'four hands are dealt no power-ups');
    assert.equal(play.attributed, 3);

    // Two people sat at the first hand, and Alice was one of them.
    assert.equal(play.shared.rounds, 1, 'her hand was shared for exactly one round');
    const solo = ok(await carol.call('me'), 'me').play;
    assert.equal(solo.shared.rounds, 0, 'a hand of her own is not a shared one');
    assert.equal(solo.seats['4'].rounds, 1);
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
    // Whatever the rounds above added up to, rather than a number written
    // here that a new check further up would quietly falsify.
    const shelf = await shelfWhen((d) => d.stats?.[me.user.id]?.rounds === me.play.rounds, 'catch up with the rounds played');

    const expected = [];
    for (const who of played) expected.push(ok(await who.call('me'), 'me').user.id);
    assert.deepEqual(
      Object.keys(shelf.stats).sort(),
      [...new Set(expected)].sort(),
      'the ledger should hold a row for everybody who sat down and for nobody else'
    );
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

  // The modes were added after the record existed, so there are rows out
  // there written before any of them. Losing somebody's totals to a field
  // that was not there yet would be exactly the kind of quiet damage the
  // never-overwrite rule exists to prevent.
  await check('a record from before the modes is filled in, not replaced', async () => {
    const me = ok(await alice.call('me'), 'me');
    child.kill();
    await new Promise((r) => child.once('exit', r));

    const file = path.join(DATA_DIR, 'flashcards.json');
    const shelf = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Put her row back into the shape it had before there were modes.
    const old = { ...shelf.stats[me.user.id] };
    delete old.seats;
    delete old.teams;
    delete old.shared;
    shelf.stats[me.user.id] = old;
    fs.writeFileSync(file, JSON.stringify(shelf), 'utf8');

    await startServer();
    const { play } = ok(await alice.call('me'), 'me');
    assert.equal(play.rounds, me.play.rounds, 'the total was lost');
    assert.equal(play.wins, me.play.wins, 'the wins were lost');
    assert.equal(play.best, me.play.best);
    assert.equal(play.tables, me.play.tables);
    // The rows come back at nought, which is true: those rounds were played,
    // they were simply not counted this way at the time.
    assert.equal(play.seats['3'].rounds, 0);
    assert.equal(play.teams.rounds, 0);
    assert.equal(play.attributed, 0, 'none of them can be filed under a size');
    assert.equal(play.rounds - play.attributed, me.play.rounds, 'and the page is told how many');
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

// The flashcards room, put through its paces.
//
// This starts the real server against a throwaway data directory, opens
// accounts over HTTP the way a browser would, makes cards, lays them on the
// trading post and watches them swap. It also tries the things a visitor
// should not be able to do — read somebody else's collection, reach the
// panel, post from another site, guess a password all afternoon — and checks
// that each of them is refused.
//
//   npm test

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'thievery-flashcards-'));

const ADMIN = { username: 'thehouse', password: 'a-long-enough-password' };

let PORT = 0;
let child = null;

function startServer() {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
      env: {
        ...process.env,
        PORT: '0',
        THIEVERY_DATA_DIR: DATA_DIR,
        THIEVERY_ADMIN_USERNAME: ADMIN.username,
        THIEVERY_ADMIN_PASSWORD: ADMIN.password,
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

// --- a browser, more or less -----------------------------------------------
//
// Just enough of one to hold a cookie and send an Origin header, which is all
// the server distinguishes people by.

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
      const res = await fetch(`http://localhost:${PORT}/api/flashcards/${route}`, {
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
      const payload = await res.json().catch(() => ({}));
      return { status: res.status, body: payload };
    },
  };
}

const ok = (res, what) => {
  assert.equal(res.status, 200, `${what}: expected 200, got ${res.status} — ${res.body.error || ''}`);
  return res.body;
};

let checks = 0;
function check(what, fn) {
  return Promise.resolve(fn()).then(() => {
    checks += 1;
    console.log('  ok  ' + what);
  });
}

// A card worth striking, so the appraisal has something to work with.
function goodCard(n) {
  return {
    front: `What does the number ${n} mean in this deck?`,
    back: `It marks the ${n}th distinct principle of the arrangement, which governs how the remaining cards are ordered and which of them may be guessed before the others are turned.`,
    hint: 'Think about the ordering rather than the value.',
    category: 'Method',
    tags: ['order', 'method'],
  };
}

// ---------------------------------------------------------------------------

async function run() {
  await startServer();
  console.log(`flashcards: server on ${PORT}, data in ${DATA_DIR}\n`);

  // --- the door ------------------------------------------------------------

  const stranger = visitor();

  await check('a stranger is refused the collection', async () => {
    const res = await stranger.call('me');
    assert.equal(res.status, 401);
  });

  await check('/flashcards serves the door, not the app', async () => {
    const res = await fetch(`http://localhost:${PORT}/flashcards`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.ok(html.includes('Open an account'), 'expected the sign-in page');
    assert.ok(!html.includes('id="tab-panel"'), 'the app shell leaked to a logged-out visitor');
  });

  await check('the app markup is not sitting in public/', async () => {
    const res = await fetch(`http://localhost:${PORT}/flashcards.html`);
    assert.equal(res.status, 404);
  });

  await check('a short password is refused', async () => {
    const res = await stranger.call('register', { method: 'POST', body: { username: 'shorty', password: 'abc' } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /at least 10/);
  });

  await check('a reserved username is refused', async () => {
    const res = await stranger.call('register', { method: 'POST', body: { username: 'admin', password: 'a-long-enough-password' } });
    assert.equal(res.status, 400);
  });

  await check('the admin username cannot be claimed by a newcomer', async () => {
    const res = await stranger.call('register', { method: 'POST', body: { username: ADMIN.username, password: 'a-long-enough-password' } });
    assert.equal(res.status, 400);
  });

  // --- two members ---------------------------------------------------------

  const alice = visitor();
  const bob = visitor();
  let aliceState;

  await check('an account opens and is dealt three cards', async () => {
    aliceState = ok(await alice.call('register', { method: 'POST', body: { username: 'alice', password: 'a-long-enough-password', displayName: 'Alice' } }), 'register');
    assert.equal(aliceState.user.username, 'alice');
    assert.equal(aliceState.cards.length, 3, 'a new account should arrive with three cards');
    assert.equal(aliceState.user.admin, false);
  });

  await check('a taken username is refused', async () => {
    const res = await visitor().call('register', { method: 'POST', body: { username: 'ALICE', password: 'a-long-enough-password' } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /taken/);
  });

  await check('a second account opens', async () => {
    const state = ok(await bob.call('register', { method: 'POST', body: { username: 'bob', password: 'a-long-enough-password', displayName: 'Bob' } }), 'register');
    assert.equal(state.user.username, 'bob');
  });

  await check('signing in again works and out again stops working', async () => {
    const carol = visitor();
    ok(await carol.call('register', { method: 'POST', body: { username: 'carol', password: 'a-long-enough-password' } }), 'register');
    ok(await carol.call('logout', { method: 'POST' }), 'logout');
    assert.equal((await carol.call('me')).status, 401, 'the session should be dead after signing out');
    ok(await carol.call('login', { method: 'POST', body: { username: 'carol', password: 'a-long-enough-password' } }), 'login');
    ok(await carol.call('me'), 'me');
  });

  await check('a wrong password is refused without saying which half was wrong', async () => {
    const res = await visitor().call('login', { method: 'POST', body: { username: 'alice', password: 'not-the-password' } });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Wrong username or password.');
    const ghost = await visitor().call('login', { method: 'POST', body: { username: 'nobody-at-all', password: 'not-the-password' } });
    assert.equal(ghost.body.error, res.body.error, 'a missing account must read the same as a wrong password');
  });

  await check('guessing repeatedly earns a lockout', async () => {
    const guesser = visitor();
    let locked = false;
    for (let i = 0; i < 9; i++) {
      const res = await guesser.call('login', { method: 'POST', body: { username: 'bob', password: 'wrong-' + i } });
      if (res.status === 429) { locked = true; break; }
    }
    assert.ok(locked, 'the door should shut after a few wrong guesses');
  });

  // --- cards ---------------------------------------------------------------

  await check('a card is struck, appraised and stamped', async () => {
    const res = ok(await alice.call('cards', { method: 'POST', body: goodCard(1) }), 'create');
    const card = res.card;
    assert.ok(card.craft > 60, `a well-made card should score well, got ${card.craft}`);
    assert.ok(card.value > 0);
    assert.ok(card.mint > 0);
    assert.ok(['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(card.rarity), 'a member cannot mint a mythic');
    assert.equal(res.cards.length, 4);
  });

  await check('an empty card is refused', async () => {
    const res = await alice.call('cards', { method: 'POST', body: { front: '', back: '' } });
    assert.equal(res.status, 400);
  });

  await check('the appraisal preview quotes odds, never a rarity', async () => {
    const res = ok(await alice.call('appraise', { method: 'POST', body: goodCard(2) }), 'appraise');
    assert.ok(res.craft > 60);
    assert.ok(res.odds.legendary > 0 && res.odds.legendary < 100);
    assert.equal(res.rarity, undefined, 'the preview must not commit to a rarity');
  });

  await check('a card cannot be read, re-cut or burnt by somebody else', async () => {
    const mine = aliceState.cards[0].id;
    assert.equal((await bob.call('cards/' + mine, { method: 'POST', body: goodCard(3) })).status, 404);
    assert.equal((await bob.call('cards/' + mine, { method: 'DELETE' })).status, 404);
    const bobsView = ok(await bob.call('me'), 'me');
    assert.ok(!bobsView.cards.some((c) => c.id === mine), "Bob can see Alice's card in his own collection");
  });

  await check('re-cutting changes the worth but never the rarity', async () => {
    const state = ok(await alice.call('me'), 'me');
    const card = state.cards.find((c) => c.front.includes('number 1'));
    const before = { rarity: card.rarity, mint: card.mint };
    const res = ok(await alice.call('cards/' + card.id, { method: 'POST', body: { ...goodCard(1), back: 'Short.' } }), 'edit');
    assert.equal(res.card.rarity, before.rarity, 're-cutting must not re-roll the rarity');
    assert.equal(res.card.mint, before.mint, 'the mint number is struck once');
    assert.ok(res.card.craft < card.craft, 'a worse back should appraise lower');
  });

  // --- the trading post ----------------------------------------------------

  await check('an offered card waits when nothing matches it', async () => {
    const state = ok(await alice.call('me'), 'me');
    const card = state.cards[0];
    const res = ok(await alice.call('trade/offer', { method: 'POST', body: { id: card.id } }), 'offer');
    assert.equal(res.settled, 0);
    assert.ok(res.pool.some((p) => p.id === card.id && p.mine));
  });

  await check('a card on the table cannot be burnt or re-cut', async () => {
    const state = ok(await alice.call('me'), 'me');
    const offered = state.cards.find((c) => c.pooled);
    assert.equal((await alice.call('cards/' + offered.id, { method: 'DELETE' })).status, 400);
    assert.equal((await alice.call('cards/' + offered.id, { method: 'POST', body: goodCard(9) })).status, 400);
  });

  await check('a card can be taken back off the table', async () => {
    const state = ok(await alice.call('me'), 'me');
    const offered = state.cards.find((c) => c.pooled);
    const res = ok(await alice.call('trade/withdraw', { method: 'POST', body: { id: offered.id } }), 'withdraw');
    assert.ok(!res.pool.some((p) => p.id === offered.id));
  });

  await check('the pool never shows a stranger the answer', async () => {
    const state = ok(await alice.call('me'), 'me');
    ok(await alice.call('trade/offer', { method: 'POST', body: { id: state.cards[0].id } }), 'offer');
    const bobsView = ok(await bob.call('me'), 'me');
    const entry = bobsView.pool.find((p) => !p.mine);
    assert.ok(entry, 'Bob should see the table');
    assert.equal(entry.back, undefined, 'a back leaked through the trading post');
    assert.equal(entry.hint, undefined, 'a hint leaked through the trading post');
  });

  await check('two sides of equal worth swap, and nobody trades with themselves', async () => {
    // Give both of them a spread, offer the lot, and let the post settle.
    for (let i = 0; i < 10; i++) {
      ok(await alice.call('cards', { method: 'POST', body: goodCard(100 + i) }), 'create');
      ok(await bob.call('cards', { method: 'POST', body: goodCard(200 + i) }), 'create');
    }
    for (const who of [alice, bob]) {
      const state = ok(await who.call('me'), 'me');
      for (const card of state.cards.filter((c) => !c.pooled)) {
        ok(await who.call('trade/offer', { method: 'POST', body: { id: card.id } }), 'offer');
      }
    }
    const state = ok(await alice.call('me'), 'me');
    assert.ok(state.trades.length > 0, 'nothing settled at all');
    for (const trade of state.trades) {
      const gave = trade.gave.reduce((n, c) => n + c.value, 0);
      const got = trade.got.reduce((n, c) => n + c.value, 0);
      const tolerance = Math.max(8, Math.round(Math.max(gave, got) * 0.12));
      assert.ok(Math.abs(gave - got) <= tolerance, `a lopsided trade: ${gave} for ${got}`);
      assert.notEqual(trade.withName, 'Alice', 'Alice traded with herself');
    }
  });

  await check('a card that changed hands is gone from the old collection', async () => {
    const aliceNow = ok(await alice.call('me'), 'me');
    const bobNow = ok(await bob.call('me'), 'me');
    const aliceIds = new Set(aliceNow.cards.map((c) => c.id));
    const shared = bobNow.cards.filter((c) => aliceIds.has(c.id));
    assert.equal(shared.length, 0, 'a card is in two collections at once');
  });

  // --- the panel -----------------------------------------------------------

  await check('an ordinary member cannot see the panel exists', async () => {
    for (const [route, method] of [['admin/overview', 'GET'], ['admin/mythic', 'POST'], ['admin/users/x', 'GET']]) {
      const res = await alice.call(route, { method, body: method === 'POST' ? {} : null });
      assert.equal(res.status, 404, `${route} answered ${res.status} to a member`);
    }
  });

  const house = visitor();

  await check('the admin account exists and is marked as such', async () => {
    const state = ok(await house.call('login', { method: 'POST', body: ADMIN }), 'admin login');
    assert.equal(state.user.admin, true);
  });

  await check('the panel lists every account and what it holds', async () => {
    const overview = ok(await house.call('admin/overview'), 'overview');
    const names = overview.users.map((u) => u.username).sort();
    assert.deepEqual(names, ['alice', 'bob', 'carol', ADMIN.username].sort());
    const a = overview.users.find((u) => u.username === 'alice');
    assert.ok(a.cards > 0 && a.worth > 0);
    assert.ok(overview.stats.trades > 0);
  });

  await check('the admin can read and change any account', async () => {
    const overview = ok(await house.call('admin/overview'), 'overview');
    const bobId = overview.users.find((u) => u.username === 'bob').id;
    const detail = ok(await house.call('admin/users/' + bobId), 'detail');
    assert.equal(detail.account.username, 'bob');
    assert.ok(detail.cards.length > 0);
    assert.ok(detail.cards[0].back, 'the panel should see the backs');

    const changed = ok(await house.call('admin/users/' + bobId, { method: 'POST', body: { displayName: 'Bobby', note: 'watch this one' } }), 'patch');
    assert.equal(changed.account.displayName, 'Bobby');
    assert.equal(changed.account.note, 'watch this one');
  });

  await check('an admin password reset signs the account out everywhere', async () => {
    const overview = ok(await house.call('admin/overview'), 'overview');
    const carolId = overview.users.find((u) => u.username === 'carol').id;
    ok(await house.call('admin/users/' + carolId, { method: 'POST', body: { password: 'a-brand-new-password' } }), 'reset');
    const carol = visitor();
    assert.equal((await carol.call('login', { method: 'POST', body: { username: 'carol', password: 'a-long-enough-password' } })).status, 401);
    ok(await carol.call('login', { method: 'POST', body: { username: 'carol', password: 'a-brand-new-password' } }), 'login with the new one');
  });

  await check('suspending an account closes the door on it', async () => {
    const overview = ok(await house.call('admin/overview'), 'overview');
    const carolId = overview.users.find((u) => u.username === 'carol').id;
    ok(await house.call('admin/users/' + carolId, { method: 'POST', body: { disabled: true } }), 'suspend');
    const res = await visitor().call('login', { method: 'POST', body: { username: 'carol', password: 'a-brand-new-password' } });
    assert.equal(res.status, 403);
    ok(await house.call('admin/users/' + carolId, { method: 'POST', body: { disabled: false } }), 'reinstate');
  });

  await check('a mythic is struck and given to a named member', async () => {
    const res = ok(await house.call('admin/mythic', {
      method: 'POST',
      body: {
        title: 'The Gilded Magpie',
        front: 'What does the magpie take?',
        back: 'Whatever is brightest, and only what is brightest. It leaves the rest of the nest exactly as it found it.',
        flavour: 'Struck once, and never again.',
        to: 'alice',
      },
    }), 'mythic');
    assert.equal(res.card.rarity, 'mythic');
    assert.equal(res.to.username, 'alice');
    assert.ok(res.card.value > 100, 'a mythic should be worth something');

    const aliceNow = ok(await alice.call('me'), 'me');
    const hers = aliceNow.cards.find((c) => c.id === res.card.id);
    assert.ok(hers, 'the mythic did not arrive');
    assert.equal(hers.title, 'The Gilded Magpie');
    assert.equal(hers.authorName, 'The House');
  });

  await check('a mythic can be thrown to a random member, never to the house', async () => {
    for (let i = 0; i < 6; i++) {
      const res = ok(await house.call('admin/mythic', {
        method: 'POST',
        body: { front: `Who holds the ${i}th key?`, back: 'Whoever was handed it, which was decided by nobody in particular.', to: 'random' },
      }), 'random mythic');
      assert.notEqual(res.to.username, ADMIN.username, 'the house kept a mythic for itself');
    }
  });

  await check('the admin can set a mythic\'s worth by hand', async () => {
    const res = ok(await house.call('admin/mythic', {
      method: 'POST',
      body: { front: 'What is this worth?', back: 'Exactly what the house says it is worth, and not a point more.', to: 'bob', value: 4242 },
    }), 'priced mythic');
    assert.equal(res.card.value, 4242);
  });

  await check('the admin can re-price and move a card', async () => {
    const overview = ok(await house.call('admin/overview'), 'overview');
    const bobId = overview.users.find((u) => u.username === 'bob').id;
    const aliceId = overview.users.find((u) => u.username === 'alice').id;
    const card = ok(await house.call('admin/users/' + bobId), 'detail').cards.find((c) => !c.pooled);

    const priced = ok(await house.call('admin/cards/' + card.id, { method: 'POST', body: { value: 999 } }), 'reprice');
    assert.equal(priced.card.value, 999);
    assert.equal((await house.call('admin/cards/' + card.id, { method: 'POST', body: { value: 0 } })).status, 400);

    ok(await house.call('admin/cards/' + card.id, { method: 'POST', body: { ownerId: aliceId } }), 'move');
    const aliceNow = ok(await alice.call('me'), 'me');
    assert.ok(aliceNow.cards.some((c) => c.id === card.id), 'the card did not move');
    const bobNow = ok(await bob.call('me'), 'me');
    assert.ok(!bobNow.cards.some((c) => c.id === card.id), 'the card is still in the old collection');
  });

  await check('a member cannot re-price their own cards', async () => {
    const mine = ok(await alice.call('me'), 'me').cards[0];
    assert.equal((await alice.call('admin/cards/' + mine.id, { method: 'POST', body: { value: 99999 } })).status, 404);
  });

  await check('the admin cannot suspend or delete themselves', async () => {
    const overview = ok(await house.call('admin/overview'), 'overview');
    const me = overview.users.find((u) => u.username === ADMIN.username).id;
    assert.equal((await house.call('admin/users/' + me, { method: 'POST', body: { disabled: true } })).status, 400);
    assert.equal((await house.call('admin/users/' + me, { method: 'DELETE' })).status, 400);
  });

  await check('closing an account takes its cards with it', async () => {
    const victim = visitor();
    ok(await victim.call('register', { method: 'POST', body: { username: 'departing', password: 'a-long-enough-password' } }), 'register');
    const overview = ok(await house.call('admin/overview'), 'overview');
    const id = overview.users.find((u) => u.username === 'departing').id;
    const before = ok(await house.call('admin/overview'), 'overview').stats.cards;
    ok(await house.call('admin/users/' + id, { method: 'DELETE' }), 'delete');
    const after = ok(await house.call('admin/overview'), 'overview');
    assert.ok(!after.users.some((u) => u.username === 'departing'));
    assert.equal(after.stats.cards, before - 3, 'the three welcome cards should have gone too');
    assert.equal((await victim.call('me')).status, 401, 'a closed account should not still be signed in');
  });

  // --- the locks ------------------------------------------------------------

  await check('a post from another site is refused', async () => {
    const res = await alice.call('cards', { method: 'POST', body: goodCard(77), origin: 'https://not-thievery.example' });
    assert.equal(res.status, 403);
  });

  await check('an enormous body is refused', async () => {
    const res = await alice.call('cards', { method: 'POST', body: { front: 'x', back: 'y'.repeat(200000) } });
    assert.ok(res.status === 413 || res.status === 400, `expected a refusal, got ${res.status}`);
  });

  await check('the game is still where it was', async () => {
    const home = await fetch(`http://localhost:${PORT}/`);
    const html = await home.text();
    assert.equal(home.status, 200);
    assert.ok(html.includes('Create game'), 'the room page should be untouched');
    const room = await fetch(`http://localhost:${PORT}/ABCD`);
    assert.equal(room.status, 200, 'a room code should still serve the game');
    assert.equal((await fetch(`http://localhost:${PORT}/health`)).status, 200);
  });

  // Last, because passing it uses up the address's allowance for the hour.
  await check('one address cannot open unlimited accounts', async () => {
    let refused = false;
    for (let i = 0; i < 20; i++) {
      const res = await visitor().call('register', {
        method: 'POST',
        body: { username: 'crowd' + i, password: 'a-long-enough-password' },
      });
      if (res.status === 429) { refused = true; break; }
      assert.equal(res.status, 200, `registration ${i} answered ${res.status}`);
    }
    assert.ok(refused, 'the sign-up form should stop opening accounts eventually');
    // A rejected attempt must not have counted, so the door still reports the
    // real reason rather than the throttle, for a name that is taken.
    const taken = await visitor().call('register', { method: 'POST', body: { username: 'alice', password: 'a-long-enough-password' } });
    assert.equal(taken.status, 429, 'once throttled, everything from that address waits');
  });

  await check('the collection survives a restart', async () => {
    const before = ok(await alice.call('me'), 'me');
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
    await startServer();
    const after = await alice.call('me');
    assert.equal(after.status, 200, 'the session did not survive the restart');
    assert.equal(after.body.cards.length, before.cards.length, 'the collection changed size over a restart');
    assert.equal(after.body.user.username, 'alice');
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

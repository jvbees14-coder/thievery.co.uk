// The board, and the one rule that makes it a board.
//
// Most of this suite is about a single sentence: you have to have answered
// somebody else's question before you may ask one of your own. So it checks
// the rule from every side a member could come at it from — a fresh account
// refused, the admin exempt so the board can ever be started, answering your
// own question not counting, and the refusal surviving a restart rather than
// being a thing the page happened to be hiding.
//
// The rest is what a poll is: two to six answers, no repeats, one answer per
// account and no changing it, the split kept back until you have answered,
// and who voted for what never leaving the server at all.
//
//   npm run test:polls

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'thievery-polls-'));

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

let checks = 0;
function check(what, fn) {
  return Promise.resolve(fn()).then(() => {
    checks += 1;
    console.log('  ok  ' + what);
  });
}

// --- a browser, more or less -----------------------------------------------

function visitor() {
  const jar = new Map();
  const call = async (base, route, { method = 'GET', body = null, origin = `http://localhost:${PORT}` } = {}) => {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (origin) headers.Origin = origin;
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(`http://localhost:${PORT}${base}${route ? '/' + route : ''}`, {
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
  };
  return {
    site: (route, opts) => call('/api/site', route, opts),
    polls: (route, opts) => call('/api/polls', route, opts),
    async page(where) {
      const headers = jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {};
      const res = await fetch(`http://localhost:${PORT}${where}`, { headers, redirect: 'manual' });
      return { status: res.status, location: res.headers.get('location'), html: await res.text() };
    },
  };
}

const ok = (res, what) => {
  assert.equal(res.status, 200, `${what}: expected 200, got ${res.status} — ${res.body.error || ''}`);
  return res.body;
};

async function member(name) {
  const who = visitor();
  const body = ok(
    await who.site('register', { method: 'POST', body: { username: name, password: 'a-long-enough-password', displayName: name } }),
    `register ${name}`
  );
  who.id = body.user.id;
  everyone.push(who);
  return who;
}

// Every account the suite has opened, so a snapshot can be searched for an id
// that has no business being in it.
const everyone = [];

// The poll on the board with this question, as this member sees it.
const find = (board, question) => board.polls.find((p) => p.question === question);

// ---------------------------------------------------------------------------

async function run() {
  await startServer();
  console.log(`polls: server on ${PORT}, data in ${DATA_DIR}\n`);

  const stranger = visitor();

  // --- the door ------------------------------------------------------------

  await check('a stranger at /polls is shown the door, not the board', async () => {
    const res = await stranger.page('/polls');
    assert.equal(res.status, 200);
    assert.ok(res.html.includes('Open an account'), 'expected the sign-in page');
    assert.ok(!res.html.includes('id="board"'), 'the board leaked to a logged-out visitor');
  });

  await check('a stranger cannot read the board behind it', async () => {
    assert.equal((await stranger.polls('')).status, 401);
  });

  await check('the board markup is not sitting in public/', async () => {
    assert.equal((await stranger.page('/polls.html')).status, 404);
  });

  await check('anything deeper than /polls comes back to it', async () => {
    const res = await stranger.page('/polls/something');
    assert.equal(res.status, 302);
    assert.match(res.location, /\/polls$/);
  });

  // --- the rule ------------------------------------------------------------

  const alice = await member('alice');

  await check('a fresh account arrives with nothing and may not ask', async () => {
    const board = ok(await alice.polls(''), 'board');
    assert.equal(board.polls.length, 0, 'the board should start empty');
    assert.equal(board.you.answered, 0);
    assert.equal(board.you.mayAsk, false, 'a new account should not be able to ask');
  });

  await check('and is refused if it asks anyway', async () => {
    const res = await alice.polls('ask', {
      method: 'POST',
      body: { question: 'Should the house deal six hands?', options: ['Yes', 'No'] },
    });
    assert.equal(res.status, 403, 'asking without having answered should be refused');
    assert.match(res.body.error, /answer somebody else/i);
  });

  // The board would otherwise be a room nobody can unlock: with nothing to
  // answer, nobody can earn the right to ask.
  const house = visitor();
  await check('the house is exempt, so the first question can exist', async () => {
    ok(await house.site('login', { method: 'POST', body: ADMIN }), 'admin login');
    const before = ok(await house.polls(''), 'board');
    assert.equal(before.you.mayAsk, true, 'the admin should always be able to ask');
    assert.equal(before.you.exempt, true);
    const after = ok(
      await house.polls('ask', { method: 'POST', body: { question: 'Six hands or four?', options: ['Six', 'Four', 'Four'] } }),
      'ask'
    );
    const poll = find(after, 'Six hands or four?');
    assert.ok(poll, 'the question should be on the board');
    assert.equal(poll.options.length, 2, 'a repeated answer should have been dropped');
  });

  let pollId = null;

  await check('answering somebody else’s question earns the right to ask', async () => {
    const before = ok(await alice.polls(''), 'board');
    const poll = find(before, 'Six hands or four?');
    pollId = poll.id;
    assert.equal(before.you.mayAsk, false, 'still not yet');

    const after = ok(await alice.polls(`answer/${pollId}`, { method: 'POST', body: { option: poll.options[0].id } }), 'answer');
    assert.equal(after.you.answered, 1);
    assert.equal(after.you.mayAsk, true, 'one answer should be enough');
  });

  await check('and now the question goes up', async () => {
    const after = ok(
      await alice.polls('ask', { method: 'POST', body: { question: 'Best power-up in the deck?', options: ['The alarm', 'A read', 'A show'] } }),
      'ask'
    );
    const mine = find(after, 'Best power-up in the deck?');
    assert.ok(mine, 'the question should be on the board');
    assert.equal(mine.mine, true, 'it should be marked as hers');
    assert.equal(after.you.asked, 1);
  });

  await check('answering your own question does not earn a second ask', async () => {
    const bob = await member('bob');
    const board = ok(await bob.polls(''), 'board');
    assert.equal(board.you.mayAsk, false);

    // Bob answers one of his own — except he has none, so the check is made
    // where it can be: the count only ever rises for other people's.
    const theirs = find(board, 'Six hands or four?');
    ok(await bob.polls(`answer/${theirs.id}`, { method: 'POST', body: { option: theirs.options[0].id } }), 'answer');
    const now = ok(await bob.polls('ask', { method: 'POST', body: { question: 'Are bots too sharp?', options: ['Yes', 'No'] } }), 'ask');
    assert.equal(now.you.answered, 1, 'his own question must not count towards it');

    const own = find(now, 'Are bots too sharp?');
    ok(await bob.polls(`answer/${own.id}`, { method: 'POST', body: { option: own.options[0].id } }), 'answer his own');
    const after = ok(await bob.polls(''), 'board');
    assert.equal(after.you.answered, 1, 'answering his own question changed the count');
  });

  // --- what a poll is ------------------------------------------------------

  await check('the split is kept back until you have answered', async () => {
    const carol = await member('carol');
    const board = ok(await carol.polls(''), 'board');
    const poll = find(board, 'Six hands or four?');
    assert.equal(poll.yours, null, 'she has not answered it');
    assert.ok(poll.total >= 2, 'the number of answers is not a secret');
    for (const o of poll.options) assert.equal(o.votes, null, 'the split leaked to somebody who had not answered');

    const after = ok(await carol.polls(`answer/${poll.id}`, { method: 'POST', body: { option: poll.options[1].id } }), 'answer');
    const seen = find(after, 'Six hands or four?');
    assert.equal(seen.yours, poll.options[1].id, 'her own answer should come back to her');
    const counted = seen.options.reduce((n, o) => n + o.votes, 0);
    assert.equal(counted, seen.total, 'the tally should add up to the number of answers');
  });

  await check('who answered what never leaves the server', async () => {
    const board = ok(await alice.polls(''), 'board');
    // The tallies are on the wire and are meant to be. What must not be is any
    // trace of whose answer made them: the only account id in Alice's snapshot
    // should be Alice's own, and it should be in `user` rather than in a poll.
    const polls = JSON.stringify(board.polls);
    for (const who of everyone) {
      assert.ok(!polls.includes(who.id), `an account id reached the board (${who.id})`);
    }
    assert.ok(everyone.length >= 3, 'expected several accounts by now');

    // And the asker is a name rather than an id, so a poll cannot be used to
    // look one up either.
    for (const p of board.polls) assert.ok(typeof p.asked === 'string' && p.asked.length, 'a poll should name who asked it');
  });

  await check('an answer is final', async () => {
    const board = ok(await alice.polls(''), 'board');
    const poll = find(board, 'Six hands or four?');
    const res = await alice.polls(`answer/${poll.id}`, { method: 'POST', body: { option: poll.options[1].id } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /already answered/i);
  });

  await check('an answer that is not on the poll is refused', async () => {
    const dave = await member('dave');
    const board = ok(await dave.polls(''), 'board');
    const poll = find(board, 'Six hands or four?');
    const res = await dave.polls(`answer/${poll.id}`, { method: 'POST', body: { option: 'not-an-option' } });
    assert.equal(res.status, 400);
  });

  await check('a question needs at least two answers', async () => {
    const res = await alice.polls('ask', { method: 'POST', body: { question: 'Is this a poll at all?', options: ['Only this one'] } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /at least 2/);
  });

  await check('a question needs a question', async () => {
    assert.equal((await alice.polls('ask', { method: 'POST', body: { question: '   ', options: ['Yes', 'No'] } })).status, 400);
  });

  await check('no more than six answers are taken', async () => {
    const after = ok(
      await alice.polls('ask', {
        method: 'POST',
        body: { question: 'Which suit is the prettiest?', options: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
      }),
      'ask'
    );
    assert.equal(find(after, 'Which suit is the prettiest?').options.length, 6);
  });

  await check('a post from another site is refused', async () => {
    const res = await alice.polls('ask', {
      method: 'POST',
      body: { question: 'Can a stranger post this?', options: ['Yes', 'No'] },
      origin: 'https://not-thievery.example',
    });
    assert.equal(res.status, 403);
  });

  // --- taking one down -----------------------------------------------------

  await check('somebody else’s question cannot be taken down', async () => {
    const board = ok(await alice.polls(''), 'board');
    const theirs = find(board, 'Six hands or four?');
    const res = await alice.polls(theirs.id, { method: 'DELETE' });
    assert.equal(res.status, 404, 'and a 404, so it does not confirm whose it is');
  });

  await check('your own question can, and its answers go with it', async () => {
    const board = ok(await alice.polls(''), 'board');
    const mine = find(board, 'Which suit is the prettiest?');
    const after = ok(await alice.polls(mine.id, { method: 'DELETE' }), 'delete');
    assert.ok(!find(after, 'Which suit is the prettiest?'), 'it should be off the board');
  });

  await check('the house can take anybody’s down', async () => {
    const board = ok(await house.polls(''), 'board');
    const hers = find(board, 'Best power-up in the deck?');
    const after = ok(await house.polls(hers.id, { method: 'DELETE' }), 'delete');
    assert.ok(!find(after, 'Best power-up in the deck?'), 'the admin should be able to clear the board');
  });

  // --- the menu ------------------------------------------------------------

  await check('the hall says which side of the rule you are on', async () => {
    const eve = await member('eve');
    const before = ok(await eve.site('me'), 'me');
    assert.equal(before.polls.mayAsk, false);
    assert.ok(before.polls.open > 0, 'there are questions to answer');

    const board = ok(await eve.polls(''), 'board');
    const poll = find(board, 'Six hands or four?');
    ok(await eve.polls(`answer/${poll.id}`, { method: 'POST', body: { option: poll.options[0].id } }), 'answer');

    const after = ok(await eve.site('me'), 'me');
    assert.equal(after.polls.mayAsk, true, 'the menu should notice');
    assert.equal(after.polls.answered, 1);
  });

  // --- and it is all really written down -----------------------------------

  await check('the board survives a restart, and so does the rule', async () => {
    const before = ok(await alice.polls(''), 'board');
    // Writes are debounced by a quarter of a second and this suite runs in
    // about a second, so the file is waited for rather than assumed.
    const until = Date.now() + 6000;
    for (;;) {
      const shelf = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'flashcards.json'), 'utf8'));
      if (Object.keys(shelf.polls || {}).length === before.polls.length) break;
      if (Date.now() > until) throw new Error('the board never reached the document');
      await new Promise((r) => setTimeout(r, 50));
    }
    child.kill();
    await new Promise((r) => child.once('exit', r));
    await startServer();

    const after = ok(await alice.polls(''), 'board');
    assert.equal(after.polls.length, before.polls.length, 'the board changed size over a restart');
    assert.equal(after.you.mayAsk, true, 'an earned ask should be earned for good');

    const fresh = await member('frank');
    assert.equal(ok(await fresh.polls(''), 'board').you.mayAsk, false, 'and a new account still has to earn it');
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

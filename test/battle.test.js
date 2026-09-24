// The battle room: the marker, the rooms, and the one thing that must never
// leak.
//
// Three suites in one file, because they are three views of the same claim.
//
//   * **The marker**, driven directly. `grade.js` takes two strings and
//     returns a number, so it can be checked the way arithmetic is checked —
//     no server, no socket, no randomness. Most of what "fair" means on this
//     site is asserted here: a reworded answer scores like a right one, a
//     padded one does not, a typo is forgiven, a figure is not, and an answer
//     that negates the card is capped below a pass.
//   * **A match**, played out over a real socket against a real server, solo
//     and as a duel, on a house deck and on the players' own collections.
//   * **The one rule.** Every message every client receives is kept, and the
//     whole lot is searched at the end for the back of a card that was still
//     open when it was sent. A browser that has been handed the answer is a
//     browser that can be asked for it, and no amount of care in the page
//     could make up for the server sending it early.
//
//   npm run test:battle

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as Grade from '../server/grade.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The site has no house deck you type into, and the one-rule audit is about
// typed answers, so this suite brings two of its own: test/fixtures/decks,
// read by decks.js from THIEVERY_EXTRA_DECKS. It has to be set before decks.js
// is first loaded, here and in the server this spawns (which inherits the
// environment), so those two modules are imported after it rather than above.
process.env.THIEVERY_EXTRA_DECKS = path.join(__dirname, 'fixtures', 'decks');
const Decks = await import('../server/decks.js');
const Daily = await import('../server/daily.js');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'thievery-battle-'));

let PORT = 0;
let child = null;

function startServer() {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
      env: { ...process.env, PORT: '0', THIEVERY_DATA_DIR: DATA_DIR },
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
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const call = async (base, route, { method = 'GET', body = null } = {}) => {
    const headers = { Origin: `http://localhost:${PORT}` };
    if (body) headers['Content-Type'] = 'application/json';
    if (jar.size) headers.Cookie = cookieHeader();
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
    cookie: cookieHeader,
    site: (route, opts) => call('/api/site', route, opts),
    fc: (route, opts) => call('/api/flashcards', route, opts),
    async page(where) {
      const headers = jar.size ? { Cookie: cookieHeader() } : {};
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
    await who.site('register', {
      method: 'POST',
      body: { username: name, password: 'a-long-enough-password', displayName: name },
    }),
    `register ${name}`
  );
  who.id = body.user.id;
  who.name = name;
  return who;
}

// --- the audit ---------------------------------------------------------------
//
// Every message every client has ever received, with the state of the match
// at the time. Searched at the end of the run rather than as it goes, so that
// a leak is reported once with everything about it rather than as whichever
// assertion happened to be nearest.

const audit = [];
let leaks = 0;
let choiceMessages = 0;

// The backs of every card the house decks hold. If any of these turns up in a
// message sent while the card carrying it was still open, the room is broken.
const allBacks = new Set();
for (const d of Decks.catalog()) for (const c of Decks.deck(d.id).cards) allBacks.add(c.back);

function watch(label, raw, msg) {
  audit.push({ label, raw, msg });
  if (msg.type !== 'battle:state') return;
  const m = msg.state.match;
  if (!m || m.phase !== 'asking') return;

  // The declared contract, for both kinds of card: an open card says neither
  // what its back is nor which of its options is right.
  if (m.card.back !== null) {
    leaks += 1;
    console.error(`  LEAK  ${label}: card.back was sent while the card was open: ${JSON.stringify(m.card.back)}`);
  }
  if (m.card.answerId != null) {
    leaks += 1;
    console.error(`  LEAK  ${label}: card.answerId was sent while the card was open: ${JSON.stringify(m.card.answerId)}`);
  }
  // A four-option card has its answer on screen by construction — it is one
  // of the four — so the text search below would be meaningless against it.
  // What protects a choice is the id, which is checked just above, and the
  // fact that nothing in the message says which option carries it.
  if (m.card.kind === 'choice') {
    choiceMessages += 1;
    return;
  }
  // And the stronger claim: the text of the back is nowhere in the message at
  // all, under any key, however it got there.
  //
  // One thing is taken out of the message before it is searched, and only
  // one: `yours`, which is this player's own answer read back to them. A
  // player who has typed the right answer has put the back of the card into
  // their own message, and echoing it to them is not the room telling them
  // anything they did not already know. Everything else stays in — the other
  // players' marks especially, which is where a real leak would show.
  const scrubbed = JSON.parse(raw);
  if (scrubbed.state?.match?.yours) delete scrubbed.state.match.yours;
  const text = JSON.stringify(scrubbed);
  for (const back of allBacks) {
    if (text.includes(back)) {
      leaks += 1;
      console.error(`  LEAK  ${label}: a card back appeared in an open-card message: ${JSON.stringify(back)}`);
    }
  }
}

// --- a battler ----------------------------------------------------------------

class Battler {
  constructor(who) {
    this.who = who;
    this.label = who.name;
    this.state = null;
    this.catalog = null;
    this.errors = [];
    this.waiters = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}`, { headers: { Cookie: this.who.cookie() } });
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (data) => {
        const raw = data.toString();
        const msg = JSON.parse(raw);
        watch(this.label, raw, msg);
        if (msg.type === 'battle:state') this.state = msg.state;
        else if (msg.type === 'battle:catalog') this.catalog = msg;
        else if (msg.type === 'battle:error') this.errors.push(msg.message);
        this.waiters = this.waiters.filter((w) => !w(msg));
      });
    });
  }

  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }

  // Resolve once a state matching `pred` has arrived. The current one counts,
  // but the check still goes through setImmediate: awaiting an already-settled
  // promise only drains microtasks, so a loop whose every wait is satisfied by
  // what it already holds never lets the event loop deliver anything.
  waitFor(pred, what = 'state', ms = 5000) {
    if (this.state && pred(this.state)) return new Promise((r) => setImmediate(() => r(this.state)));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.label}: timed out waiting for ${what}`)), ms);
      this.waiters.push((msg) => {
        if (msg.type === 'battle:state' && pred(msg.state)) {
          clearTimeout(t);
          resolve(msg.state);
          return true;
        }
        return false;
      });
    });
  }

  // Send something the server should refuse, and hand back the refusal.
  expectError(obj, what, ms = 3000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.label}: expected a refusal for ${what}`)), ms);
      this.waiters.push((msg) => {
        if (msg.type === 'battle:error') {
          clearTimeout(t);
          resolve(msg.message);
          return true;
        }
        return false;
      });
      this.send(obj);
    });
  }

  close() {
    this.ws.close();
  }
}

const atCard = (n) => (s) => s.match && s.match.at === n && s.match.phase === 'asking';
const revealed = (n) => (s) => s.match && s.match.at === n && s.match.phase === 'reveal';
const ended = (s) => s.match && s.match.phase === 'ended';

// ---------------------------------------------------------------------------

async function run() {
  // =========================================================================
  // The marker
  // =========================================================================

  const mark = (given, wanted) => Grade.points(Grade.grade(given, wanted).score);

  await check('an answer word for word is full marks', () => {
    const back = 'Mitochondria produce ATP through respiration';
    assert.equal(mark(back, back), 100);
    assert.equal(mark('  MITOCHONDRIA   produce, ATP through respiration! ', back), 100);
  });

  await check('the same answer in your own words is still a right answer', () => {
    const back = 'Mitochondria produce ATP through respiration';
    const score = mark('ATP is produced by the mitochondria during respiration', back);
    assert.ok(score >= 85, `a correct rewording scored ${score}, which is not a pass`);
  });

  await check('word order does not decide it', () => {
    const back = 'Mitochondria produce ATP through respiration';
    assert.equal(mark('respiration through ATP produce mitochondria', back), 100);
  });

  await check('a typo is not a wrong answer', () => {
    const back = 'Mitochondria produce ATP through respiration';
    const score = mark('mitochondira prodce ATP through respirtion', back);
    assert.ok(score >= 80, `three typos scored ${score}`);
    assert.ok(score < 100, 'a misspelling should still cost something');
  });

  await check('a wrong answer scores nothing much', () => {
    const back = 'Mitochondria produce ATP through respiration';
    assert.ok(mark('The cell wall of a plant is made of cellulose', back) < 20);
    assert.equal(mark('', back), 0);
  });

  await check('padding does not pay', () => {
    const back = 'The powerhouse of the cell';
    // Every word of the answer is in here somewhere, which is exactly the
    // trick a recall-only marker would fall for.
    const dump =
      'powerhouse cell nucleus golgi ribosome membrane plant animal energy sugar oxygen water enzyme protein lipid';
    const score = mark(dump, back);
    assert.ok(score < 65, `answering with the dictionary scored ${score}`);
    assert.ok(score < mark('the powerhouse of the cell', back), 'padding must not beat the answer');
  });

  await check('a one-word stab at a long answer is not a pass', () => {
    const back = 'Mitochondria produce ATP through respiration';
    assert.ok(mark('mitochondria', back) < 50);
  });

  await check('getting the one word that mattered wrong is not "close"', () => {
    const back = 'The powerhouse of the cell';
    const score = mark('the battery of the cell', back);
    assert.ok(score < 65, `the wrong content word still scored ${score}`);
  });

  await check('a figure is right or it is wrong, never nearly right', () => {
    assert.equal(mark('1066', '1066'), 100);
    assert.equal(mark('1067', '1066'), 0);
    // Word-perfect apart from the one thing the card was asking for.
    const near = mark('The Battle of Hastings was in 1067', 'The Battle of Hastings was in 1066');
    assert.ok(near <= 50, `the wrong date still scored ${near}`);
  });

  await check('a figure written out is the same figure', () => {
    assert.equal(mark('a triangle has three sides', 'A triangle has 3 sides'), 100);
    assert.ok(mark('a triangle has four sides', 'A triangle has 3 sides') <= 50);
  });

  await check('an answer that negates the card cannot pass', () => {
    const back = 'Sodium is not soluble in water';
    assert.equal(mark(back, back), 100);
    const flipped = mark('Sodium is soluble in water', back);
    assert.ok(flipped <= 40, `the opposite of the answer scored ${flipped}`);
    assert.equal(Grade.grade('Sodium is soluble in water', back).flipped, true);
  });

  await check('accents and capitals are not what is being marked', () => {
    assert.equal(mark('resume', 'résumé'), 100);
    assert.equal(mark('The CAPITAL is Paris', 'the capital is paris'), 100);
  });

  await check('the marker shows its working', () => {
    const v = Grade.grade('mitochondria and cellulose', 'Mitochondria produce ATP through respiration');
    assert.ok(v.found.includes('mitochondria'), 'what was found should be listed');
    assert.ok(v.missed.includes('atp'), 'what was missed should be listed');
    assert.ok(v.extra.includes('cellulose'), 'what was invented should be listed');
    // The mortar is not worth reporting either way.
    assert.ok(!v.missed.includes('through'), 'small words should not be reported as missed');
  });

  await check('the marker is not bothered by a pasted novel', () => {
    const back = 'The powerhouse of the cell';
    const started = Date.now();
    for (let i = 0; i < 200; i++) mark('lorem ipsum dolor sit amet '.repeat(400), back);
    const each = (Date.now() - started) / 200;
    assert.ok(each < 12, `marking an over-long answer took ${each.toFixed(1)}ms each`);
  });

  await check('every house deck is well formed', () => {
    const { decks, cards } = Decks.check();
    assert.ok(decks >= 2, 'expected at least the two hand-written decks');
    for (const d of Decks.catalog()) {
      assert.ok(d.count >= 2, `${d.id} is too short`);
      assert.ok(d.kind === 'text' || d.kind === 'choice', `${d.id} has no kind`);
    }
    console.log(`      (${decks} decks, ${cards.toLocaleString('en-GB')} cards)`);
  });

  await check('the subject papers loaded, and loaded as four-option decks', () => {
    // The MMLU papers by name, rather than everything that is not hand-
    // written: a converted deck is also not hand-written, and is under no
    // obligation to be four-option or to be multiple choice at all.
    const papers = Decks.catalog().filter((d) => d.id.startsWith('mmlu-'));
    assert.ok(papers.length >= 50, `only ${papers.length} subject papers loaded`);
    assert.ok(papers.every((d) => d.kind === 'choice'), 'a subject paper is a four-option deck');
    // Spot-check one all the way down to a card.
    const bio = Decks.deck('mmlu-high-school-biology');
    assert.ok(bio, 'high school biology did not load');
    assert.ok(bio.cards.length > 100);
    for (const c of bio.cards) {
      assert.equal(c.options.length, 4);
      assert.ok(Number.isInteger(c.answer) && c.answer >= 0 && c.answer <= 3);
    }
  });

  await check('a topic deck is gathered from the papers, and deals one kind of card', () => {
    const topics = Decks.catalog().filter((d) => d.topic);
    assert.ok(topics.length >= 5, `only ${topics.length} topic decks were assembled`);

    for (const t of topics) {
      const deck = Decks.deck(t.id);
      // The one that would break `dealFrom`, which picks a single builder for
      // the whole deck off its kind: a text card in here would be dealt as a
      // choice and fall over on its missing options.
      assert.equal(deck.kind, 'choice', `${t.id} is not a choice deck`);
      for (const c of deck.cards) {
        assert.ok(Array.isArray(c.options), `${t.id} holds a card with no options`);
      }
    }

    // Biology is assembled from the anatomy paper among others, so a card of
    // that paper's must be findable in it — the same object, not a copy.
    const bio = Decks.deck('topic-biology');
    assert.ok(bio, 'there is no biology topic deck');
    const anatomy = Decks.deck('mmlu-anatomy');
    assert.ok(bio.cards.includes(anatomy.cards[0]), 'the biology topic deck does not hold the anatomy paper');

    // And nothing is in it twice, which a card belonging to two sources would
    // otherwise cause.
    assert.equal(new Set(bio.cards).size, bio.cards.length, 'a card is in the biology deck twice');
  });

  await check('the lobby offers subjects and our own decks, and no source sets', () => {
    const listed = Decks.catalog().filter((d) => d.listed);
    assert.ok(listed.length > 0, 'nothing is listed');
    for (const d of listed) assert.ok(d.topic || d.house, `${d.id} is listed but is neither a subject nor ours`);
    assert.ok(!listed.some((d) => d.id.startsWith('mmlu-')), 'a subject paper is listed on its own');
    // The sources stay in the catalog, because rooms and the record hold their ids.
    assert.ok(Decks.has('mmlu-anatomy'), 'a source deck can no longer be found by id');
  });

  await check('every question in the converted sets is under some subject', () => {
    const topics = Decks.catalog().filter((d) => d.topic).map((d) => Decks.deck(d.id));
    const filed = new Set(topics.flatMap((d) => d.cards));
    for (const id of ['arc-challenge', 'arc-easy', 'openbookqa', 'qasc', 'sciq']) {
      const source = Decks.deck(id);
      if (!source) continue; // a checkout without the converted decks
      const lost = source.cards.filter((c) => !filed.has(c));
      // A card the same as one already filed (front and options) is dropped
      // as a duplicate, which is the only way one may be missing.
      const key = (c) => c.front + '|' + c.options.join('|');
      const keys = new Set([...filed].map(key));
      const orphans = lost.filter((c) => !keys.has(key(c)));
      assert.equal(orphans.length, 0, `${orphans.length} cards from ${id} are in no subject`);
    }
  });

  await check('the CSV reader handles quotes, doubled quotes and newlines', () => {
    const rows = Decks.parseCsv('plain,"quoted, with comma","says ""hi""","two\nlines",d,A\n');
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], ['plain', 'quoted, with comma', 'says "hi"', 'two\nlines', 'd', 'A']);
  });

  // =========================================================================
  // The room
  // =========================================================================

  await startServer();
  console.log(`\nbattle: server on ${PORT}, data in ${DATA_DIR}\n`);

  const stranger = visitor();

  await check('a stranger at /battle is shown the door, not the room', async () => {
    const res = await stranger.page('/battle');
    assert.equal(res.status, 200);
    assert.ok(res.html.includes('Open an account'), 'expected the sign-in page');
    assert.ok(!res.html.includes('id="screen-lobby"'), 'the room leaked to a logged-out visitor');
  });

  await check('the room markup is not sitting in public/', async () => {
    assert.equal((await stranger.page('/battle.html')).status, 404);
  });

  await check('a room link lands on the page rather than a redirect', async () => {
    const res = await stranger.page('/battle/ABCD');
    assert.equal(res.status, 200, 'a shared room link must open the page');
  });

  await check('anything that is not a room code comes back to /battle', async () => {
    const res = await stranger.page('/battle/not-a-code');
    assert.equal(res.status, 302);
    assert.match(res.location, /\/battle$/);
  });

  await check('a socket with no account behind it is turned away', async () => {
    const nobody = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((r) => nobody.on('open', r));
    const refusal = await new Promise((resolve) => {
      nobody.on('message', (d) => {
        const msg = JSON.parse(d.toString());
        if (msg.type === 'battle:error') resolve(msg.message);
      });
      nobody.send(JSON.stringify({ type: 'battle:create' }));
    });
    assert.match(refusal, /sign in/i);
    nobody.close();
  });

  const ada = await member('ada');
  const bram = await member('bram');

  const a = new Battler(ada);
  const b = new Battler(bram);
  await a.connect();
  await b.connect();

  await check('the catalog arrives with the house decks on it', async () => {
    a.send({ type: 'battle:hello' });
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(a.catalog, 'no catalog was sent');
    assert.ok(a.catalog.decks.length >= 1);
    assert.ok(a.catalog.lengths.includes(5));
    assert.ok(a.catalog.clocks.includes(0), 'untimed must be one of the settings');
    // The catalog is a list of decks, not the cards in them.
    assert.equal(JSON.stringify(a.catalog).includes('Canberra'), false, 'the catalog carried card backs');
  });

  // --- a solo run ----------------------------------------------------------

  await check('a room opens and its host is whoever opened it', async () => {
    a.send({ type: 'battle:create' });
    const s = await a.waitFor((x) => !!x.code, 'a room');
    assert.match(s.code, /^[A-Z0-9]{4}$/);
    assert.equal(s.you.host, true);
    assert.equal(s.players.length, 1);
  });

  const soloCode = a.state.code;

  await check('a solo run on a house deck plays through to a result', async () => {
    a.send({ type: 'battle:settings', mode: 'solo', source: 'preset', presetId: 'capitals', length: 5, clock: 0 });
    await a.waitFor((s) => s.mode === 'solo' && s.length === 5, 'the settings');

    a.send({ type: 'battle:start' });
    await a.waitFor(atCard(0), 'the first card');
    assert.equal(a.state.match.total, 5);
    assert.equal(a.state.match.card.back, null, 'the back was sent with an open card');
    assert.ok(a.state.match.card.front.length > 0);

    // Played properly: the answer is looked up from the deck rather than
    // guessed, so the marks mean something.
    const deck = Decks.deck('capitals');
    for (let i = 0; i < 5; i++) {
      await a.waitFor(atCard(i), `card ${i + 1}`);
      const front = a.state.match.card.front;
      const card = deck.cards.find((c) => c.front === front);
      assert.ok(card, `card ${i + 1} was not from the deck it said it was`);
      a.send({ type: 'battle:answer', text: card.back });
      await a.waitFor(revealed(i), `the reveal of card ${i + 1}`);
      assert.equal(a.state.match.card.back, card.back, 'the back should be shown once the card is closed');
      assert.equal(a.state.match.marks[0].points, 100, 'a word-perfect answer should be full marks');
      a.send({ type: 'battle:next' });
    }

    const end = await a.waitFor(ended, 'the result');
    assert.equal(end.match.standings.length, 1);
    assert.equal(end.match.standings[0].total, 500, 'five perfect answers is 500');
    assert.equal(end.match.standings[0].cards, 5);
    assert.equal(end.match.review.length, 5, 'every card should come back for review');
    assert.ok(end.match.review.every((c) => c.back), 'the review should carry the backs');
  });

  await check('a solo run is filed as revision and never as a duel won', async () => {
    const menu = ok(await ada.site('me'), 'the menu');
    const bt = menu.battle;
    assert.equal(bt.matches, 1);
    assert.equal(bt.solo, 1);
    assert.equal(bt.duels, 0, 'a solo run must not be counted as a duel');
    assert.equal(bt.wins, 0, 'nobody wins a solo run');
    assert.equal(bt.cards, 5);
    assert.equal(bt.points, 500);
    assert.equal(bt.average, 100);
    // And filed again under the deck it was dealt from, by name for the page.
    const capitals = bt.decks.find((d) => d.id === 'capitals');
    assert.ok(capitals, 'the match was not filed under its deck');
    assert.equal(capitals.cards, 5);
    assert.equal(capitals.average, 100);
    assert.equal(bt.bestDeck.id, 'capitals', 'five perfect cards on one deck is that deck being your best');
  });

  await check('an unanswered card is marked at nought rather than left open', async () => {
    a.send({ type: 'battle:again' });
    await a.waitFor((s) => !s.match, 'the lobby');
    a.send({ type: 'battle:settings', mode: 'solo', source: 'preset', presetId: 'bones', length: 5, clock: 20 });
    await a.waitFor((s) => s.clock === 20, 'the clock');
    a.send({ type: 'battle:start' });
    await a.waitFor(atCard(0), 'the first card');
    assert.ok(a.state.match.deadline > Date.now(), 'a timed card should carry a deadline');

    a.send({ type: 'battle:answer', text: 'something that is certainly not it' });
    const rev = await a.waitFor(revealed(0), 'the reveal');
    assert.equal(rev.match.marks.length, 1);
    assert.ok(rev.match.marks[0].points < 40, 'a wrong answer should not score');
  });

  await check('a match in progress refuses what belongs to the lobby', async () => {
    assert.match(await a.expectError({ type: 'battle:answer', text: 'late' }, 'answering a closed card'), /closed/i);
    assert.match(await a.expectError({ type: 'battle:start' }, 'starting twice'), /already started/i);
    // The guard on the match comes before the guard on the value, which is
    // the right way round: a setting cannot be wrong if it cannot be set.
    assert.match(await a.expectError({ type: 'battle:settings', length: 5 }, 'settings mid-match'), /already started/i);
    assert.match(await a.expectError({ type: 'battle:nonsense' }, 'an invented action'), /unknown/i);
  });

  await check('the lobby refuses a setting that is not one of the settings', async () => {
    // A match that is still running cannot be wound back to a lobby, so this
    // opens a fresh room rather than abandoning one — which is what somebody
    // walking away from a half-played match actually does.
    a.send({ type: 'battle:create' });
    await a.waitFor((s) => !s.match, 'a fresh room');
    a.send({ type: 'battle:settings', length: 5, presetId: 'bones' });
    await a.waitFor((s) => s.length === 5 && s.presetId === 'bones', 'the settings');
    assert.match(await a.expectError({ type: 'battle:settings', length: 999 }, 'a silly length'), /length/i);
    assert.match(await a.expectError({ type: 'battle:settings', clock: 7 }, 'a clock nobody offered'), /clock/i);
    assert.match(await a.expectError({ type: 'battle:settings', presetId: 'nope' }, 'a deck that is not there'), /no such deck/i);
    assert.match(await a.expectError({ type: 'battle:settings', mode: 'brawl' }, 'a mode that does not exist'), /duel or solo/i);
    assert.match(await a.expectError({ type: 'battle:join', code: 'ZZZZ' }, 'a room that is not there'), /not found/i);
    assert.match(await a.expectError({ type: 'battle:join', code: '!!' }, 'a code that is not a code'), /four letters/i);
    assert.match(await a.expectError({ type: 'battle:next' }, 'turning a card nobody dealt'), /no match/i);
    // The settings survived every one of those refusals.
    assert.equal(a.state.length, 5);
    assert.equal(a.state.presetId, 'bones');
  });

  // --- a duel --------------------------------------------------------------

  await check('a second member joins by code and the host keeps the settings', async () => {
    const code = a.state.code;

    b.send({ type: 'battle:join', code });
    await b.waitFor((s) => s.code === code, 'the room');
    await a.waitFor((s) => s.players.length === 2, 'the second player');

    assert.equal(b.state.you.host, false);
    assert.equal(a.state.you.host, true);
    assert.match(await b.expectError({ type: 'battle:settings', length: 20 }, 'a guest setting the match up'), /host/i);
  });

  await check('a duel marks both players on the same card and settles on marks', async () => {
    a.send({ type: 'battle:settings', mode: 'duel', source: 'preset', presetId: 'capitals', length: 5, clock: 0 });
    await a.waitFor((s) => s.mode === 'duel' && s.length === 5, 'the settings');
    a.send({ type: 'battle:start' });
    await a.waitFor(atCard(0), 'the first card');
    await b.waitFor(atCard(0), 'the first card, for the guest');

    // Both are shown the same card, and neither is shown the back of it.
    assert.equal(a.state.match.card.front, b.state.match.card.front, 'the two are not on the same card');
    assert.equal(a.state.match.card.back, null);
    assert.equal(b.state.match.card.back, null);

    const deck = Decks.deck('capitals');
    for (let i = 0; i < 5; i++) {
      await a.waitFor(atCard(i), `card ${i + 1}`);
      const card = deck.cards.find((c) => c.front === a.state.match.card.front);

      // Ada answers it properly; Bram does not.
      a.send({ type: 'battle:answer', text: card.back });
      // Ada's answer alone must not turn the card over.
      await new Promise((r) => setTimeout(r, 80));
      assert.equal(a.state.match.phase, 'asking', 'one answer should not close a duel card');
      assert.equal(a.state.match.card.back, null, 'the back must stay back until both are in');
      // And her answer must not be readable by the person still answering.
      assert.equal(b.state.match.marks, null, "the other player's answer leaked before the reveal");

      b.send({ type: 'battle:answer', text: 'I have no idea' });
      await a.waitFor(revealed(i), `the reveal of card ${i + 1}`);
      assert.equal(a.state.match.marks.length, 2, 'both answers should be on the reveal');
      const hers = a.state.match.marks.find((m) => m.name === 'ada');
      const his = a.state.match.marks.find((m) => m.name === 'bram');
      assert.equal(hers.points, 100);
      assert.ok(his.points < 40);
      assert.equal(hers.text, card.back, 'the reveal should show what each of them said');
      a.send({ type: 'battle:next' });
    }

    const end = await a.waitFor(ended, 'the result');
    const rows = end.match.standings;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, 'ada', 'the better answers should come first');
    assert.equal(rows[0].won, true);
    assert.equal(rows[1].won, false);
    assert.equal(rows[0].total, 500);
  });

  await check('a duel is filed apart from revision, and only the winner wins', async () => {
    const hers = ok(await ada.site('me'), "ada's menu").battle;
    const his = ok(await bram.site('me'), "bram's menu").battle;
    assert.equal(hers.duels, 1);
    assert.equal(hers.wins, 1);
    assert.equal(his.duels, 1);
    assert.equal(his.wins, 0, 'losing a duel is not winning one');
    assert.equal(his.solo, 0);
    assert.equal(hers.solo, 1, "ada's earlier revision should still be counted as revision");
  });

  // --- a four-option deck ----------------------------------------------------

  await check('a four-option card is picked from, and marked right or wrong', async () => {
    a.send({ type: 'battle:again' });
    await a.waitFor((s) => !s.match, 'the lobby');
    a.send({ type: 'battle:settings', mode: 'solo', source: 'preset', presetId: 'mmlu-anatomy', length: 5, clock: 0 });
    await a.waitFor((s) => s.presetId === 'mmlu-anatomy', 'the settings');
    a.send({ type: 'battle:start' });
    await a.waitFor(atCard(0), 'the first card');

    const deck = Decks.deck('mmlu-anatomy');
    let right = 0;

    for (let i = 0; i < 5; i++) {
      await a.waitFor(atCard(i), `card ${i + 1}`);
      const card = a.state.match.card;

      assert.equal(card.kind, 'choice');
      assert.equal(card.options.length, 4, 'a four-option card should have four options');
      assert.equal(card.back, null, 'the answer was sent with an open card');
      assert.equal(card.answerId, null, 'which option is right was sent with an open card');
      // Nothing about an option says whether it is the one.
      for (const o of card.options) {
        assert.deepEqual(Object.keys(o).sort(), ['id', 'text'], 'an option carried more than its id and its text');
      }

      // Look the card up in the deck and pick the right one deliberately, so
      // the mark means something rather than being a one-in-four coin.
      const source = deck.cards.find((c) => c.front === card.front);
      assert.ok(source, 'the card was not from the deck it said it was');
      const wanted = source.options[source.answer];
      const option = card.options.find((o) => o.text === wanted);
      assert.ok(option, 'the right answer was not among the options offered');

      // Every option must be one of the four the deck holds — the shuffle
      // reorders them and must not invent or drop any.
      assert.deepEqual(
        card.options.map((o) => o.text).slice().sort(),
        source.options.slice().sort(),
        'the options on screen are not the options in the deck'
      );

      a.send({ type: 'battle:answer', option: option.id });
      await a.waitFor(revealed(i), `the reveal of card ${i + 1}`);
      assert.equal(a.state.match.card.answerId, option.id, 'the reveal should name the right option');
      assert.equal(a.state.match.card.back, wanted);
      assert.equal(a.state.match.marks[0].points, 100, 'the right option should be full marks');
      assert.equal(a.state.match.marks[0].bandLabel, 'Right');
      right += 1;
      a.send({ type: 'battle:next' });
    }

    const end = await a.waitFor(ended, 'the result');
    assert.equal(right, 5);
    assert.equal(end.match.standings[0].total, 500);
  });

  await check('a wrong option is nought, with nothing in between', async () => {
    a.send({ type: 'battle:again' });
    await a.waitFor((s) => !s.match, 'the lobby');
    a.send({ type: 'battle:settings', mode: 'solo', source: 'preset', presetId: 'mmlu-anatomy', length: 5, clock: 0 });
    await a.waitFor((s) => s.presetId === 'mmlu-anatomy', 'the settings');
    a.send({ type: 'battle:start' });
    await a.waitFor(atCard(0), 'the first card');

    const deck = Decks.deck('mmlu-anatomy');
    const card = a.state.match.card;
    const source = deck.cards.find((c) => c.front === card.front);
    const wrong = card.options.find((o) => o.text !== source.options[source.answer]);

    a.send({ type: 'battle:answer', option: wrong.id });
    const rev = await a.waitFor(revealed(0), 'the reveal');
    assert.equal(rev.match.marks[0].points, 0, 'a wrong option is nought, not a near miss');
    assert.equal(rev.match.marks[0].bandLabel, 'Wrong');
    assert.notEqual(rev.match.card.answerId, wrong.id);
  });

  await check('an option that is not on the card is refused, not marked wrong', async () => {
    a.send({ type: 'battle:next' });
    await a.waitFor(atCard(1), 'the second card');
    const refusal = await a.expectError({ type: 'battle:answer', option: 'not-an-option' }, 'an invented option');
    assert.match(refusal, /not one of the options/i);
    // And the card is still open, because nothing was laid down.
    assert.equal(a.state.match.phase, 'asking');
  });

  // --- the fairness rule ---------------------------------------------------

  await check("a duel on members' cards deals an equal share from each collection", async () => {
    // Each of them writes four cards nobody could mistake for the other's.
    for (let i = 1; i <= 4; i++) {
      ok(
        await ada.fc('cards', {
          method: 'POST',
          body: { front: `Ada asks number ${i}`, back: `Ada answers number ${i} plainly`, category: 'test' },
        }),
        'ada writes a card'
      );
      ok(
        await bram.fc('cards', {
          method: 'POST',
          body: { front: `Bram asks number ${i}`, back: `Bram answers number ${i} plainly`, category: 'test' },
        }),
        'bram writes a card'
      );
    }

    // The four-option checks above left a match half-played, and a match
    // that is still running cannot be wound back to a lobby — so this opens a
    // fresh room, which is what walking away from one actually does.
    a.send({ type: 'battle:create' });
    await a.waitFor((s) => !s.match, 'a fresh room');
    const code = a.state.code;
    b.send({ type: 'battle:join', code });
    await a.waitFor((s) => s.players.length === 2, 'both of them');
    a.send({ type: 'battle:settings', mode: 'duel', source: 'mine', length: 5, clock: 0 });
    await a.waitFor((s) => s.source === 'mine', 'the settings');
    a.send({ type: 'battle:start' });
    await a.waitFor(atCard(0), 'the first card');

    // Walk the whole match and count whose cards turned up.
    const owners = [];
    for (let i = 0; i < 5; i++) {
      await a.waitFor(atCard(i), `card ${i + 1}`);
      owners.push(a.state.match.card.ownerName);
      a.send({ type: 'battle:answer', text: 'something' });
      b.send({ type: 'battle:answer', text: 'something' });
      await a.waitFor(revealed(i), `the reveal of card ${i + 1}`);
      a.send({ type: 'battle:next' });
    }
    await a.waitFor(ended, 'the result');

    const mine = owners.filter((o) => o === 'ada').length;
    const theirs = owners.filter((o) => o === 'bram').length;
    assert.equal(mine + theirs, 5, 'every card should say whose collection it came from');
    // Five cards cannot split evenly, so the most either side can fairly hold
    // is three. Anything wider than that is a duel on one person's cards.
    assert.ok(
      Math.abs(mine - theirs) <= 1,
      `the deal was ${mine} of ada's against ${theirs} of bram's, which is not an equal share`
    );
  });

  await check("a duel on cards nobody has written names who is short", async () => {
    const cleo = await member('cleo');
    // A fresh account arrives with the three welcome cards, so it is emptied
    // to make the point.
    const theirs = ok(await cleo.fc('me'), "cleo's collection");
    for (const card of theirs.cards) ok(await cleo.fc(`cards/${card.id}`, { method: 'DELETE' }), 'clear');

    const c = new Battler(cleo);
    await c.connect();
    c.send({ type: 'battle:create' });
    await c.waitFor((s) => !!s.code, 'a room');
    c.send({ type: 'battle:settings', mode: 'solo', source: 'mine' });
    await c.waitFor((s) => s.source === 'mine', 'the settings');
    const refusal = await c.expectError({ type: 'battle:start' }, 'a battle on an empty collection');
    assert.match(refusal, /no flashcards|write some/i);
    c.close();
  });

  // --- your own decks ------------------------------------------------------

  await check('solo on your own deck deals only that deck, and a sub-deck only that', async () => {
    const eve = await member('eve');
    const deck = ok(await eve.fc('decks', { method: 'POST', body: { name: 'Rivers' } }), 'a deck').deck.id;
    const sub = ok(await eve.fc('decks', { method: 'POST', body: { name: 'Long ones', parentId: deck } }), 'a sub-deck').deck.id;
    const make = async (i, where) =>
      ok(
        await eve.fc('cards', {
          method: 'POST',
          body: { front: `Eve asks river question ${i}`, back: `Eve answers river number ${i} plainly`, category: 'test', deck: where },
        }),
        'a card'
      ).card.front;
    const inSub = [await make(1, sub), await make(2, sub)];
    const inDeck = [...inSub, await make(3, deck), await make(4, deck)];
    const loose = [await make(5, ''), await make(6, '')];

    const e = new Battler(eve);
    await e.connect();
    e.send({ type: 'battle:create' });
    await e.waitFor((st) => !!st.code, 'a room');
    e.send({ type: 'battle:settings', mode: 'solo', source: 'mine', ownDeck: deck, length: 10, clock: 0 });
    await e.waitFor((st) => st.ownDeck === deck, 'the deck');
    assert.equal(e.state.yourDecks[0].count, 4, 'the lobby is not told how many cards the deck holds');
    assert.equal(e.state.ownSub, '', 'a new deck does not start on all of itself');

    const fronts = async () => {
      const seen = new Set();
      e.send({ type: 'battle:start' });
      let st = await e.waitFor((x) => x.match && x.match.phase === 'asking', 'the first card');
      const total = st.match.total;
      for (let i = 0; i < total; i++) {
        st = await e.waitFor((x) => x.match && x.match.at === i && x.match.phase === 'asking', `card ${i + 1}`);
        seen.add(st.match.card.front);
        e.send({ type: 'battle:answer', text: 'no idea' });
        st = await e.waitFor((x) => x.match && (x.match.phase !== 'asking' || x.match.at !== i), 'the reveal');
        if (st.match.phase === 'reveal') e.send({ type: 'battle:next' });
      }
      await e.waitFor((x) => x.match && x.match.phase === 'ended', 'the end');
      e.send({ type: 'battle:again' });
      await e.waitFor((x) => !x.match, 'the lobby');
      return seen;
    };

    const whole = await fronts();
    assert.deepEqual([...whole].sort(), [...inDeck].sort(), 'the deck dealt something else, or not all of itself');
    assert.ok(loose.every((x) => !whole.has(x)), 'an unfiled card was dealt');

    e.send({ type: 'battle:settings', ownSub: sub });
    await e.waitFor((st) => st.ownSub === sub, 'the sub-deck');
    const part = await fronts();
    assert.deepEqual([...part].sort(), [...inSub].sort(), 'the sub-deck dealt something else');

    // Somebody else's deck is not a setting anybody can choose.
    const stranger = ok(await (await member('fern')).fc('decks', { method: 'POST', body: { name: 'Hers' } }), 'her deck').deck.id;
    assert.match(await e.expectError({ type: 'battle:settings', ownDeck: stranger }, "another member's deck"), /no such deck/i);
    assert.match(await e.expectError({ type: 'battle:settings', ownDeck: sub }, 'a sub-deck as a deck'), /sub-deck, not a deck/i);
    e.close();
  });

  // --- leaving --------------------------------------------------------------

  await check('a card is not left open by somebody who has gone', async () => {
    a.send({ type: 'battle:again' });
    await a.waitFor((s) => !s.match, 'the lobby');
    const code = a.state.code;
    b.send({ type: 'battle:join', code });
    await a.waitFor((s) => s.players.length === 2, 'both of them');

    a.send({ type: 'battle:settings', mode: 'duel', source: 'preset', presetId: 'bones', length: 5, clock: 0 });
    await a.waitFor((s) => s.length === 5, 'the settings');
    a.send({ type: 'battle:start' });
    await a.waitFor(atCard(0), 'the first card');
    await b.waitFor(atCard(0), 'the first card, for the guest');

    // Bram shuts his laptop without answering. Ada answers, and the card must
    // turn over rather than waiting on somebody who is not coming back.
    b.close();
    await new Promise((r) => setTimeout(r, 150));
    a.send({ type: 'battle:answer', text: 'the collarbone' });
    const rev = await a.waitFor(revealed(0), 'the reveal after a walk-out');
    assert.ok(rev.match.card.back, 'the card should have turned over');
  });

  // --- what happens after a match -------------------------------------------

  // A card answered right off the deck, or wrong on purpose. Both kinds.
  //
  // The card is found by its front *and*, for a four-option card, by its
  // options. The papers are not above asking the same question twice — "Which
  // one of the following statements is true:" is a whole question in some of
  // them — and a topic deck gathers several papers, so the front alone can
  // find the wrong card and look for an answer that is not on the screen.
  const sameOptions = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
  function answerOf(state, deckId, right) {
    const card = state.match.card;
    const source = Decks.deck(deckId).cards.find(
      (c) => c.front === card.front && (!card.options || sameOptions(c.options, card.options.map((o) => o.text)))
    );
    assert.ok(source, 'the card was not from the deck it said it was');
    if (card.kind === 'choice') {
      const wanted = source.options[source.answer];
      const option = card.options.find((o) => (right ? o.text === wanted : o.text !== wanted));
      return { type: 'battle:answer', option: option.id };
    }
    return { type: 'battle:answer', text: right ? source.back : 'certainly not the answer to this' };
  }

  async function playThrough(who, deckId, rightOn = () => true) {
    const total = who.state.match.total;
    for (let i = 0; i < total; i++) {
      await who.waitFor(atCard(i), `card ${i + 1}`);
      who.send(answerOf(who.state, deckId, rightOn(i)));
      await who.waitFor(revealed(i), `the reveal of card ${i + 1}`);
      who.send({ type: 'battle:next' });
    }
    return who.waitFor(ended, 'the result');
  }

  const ada2 = new Battler(ada);
  await ada2.connect();
  a.close();

  await check('the quick-fire clocks are settings', async () => {
    ada2.send({ type: 'battle:create' });
    await ada2.waitFor((s) => !!s.code && !s.match, 'a room');
    ada2.send({ type: 'battle:settings', clock: 10 });
    await ada2.waitFor((s) => s.clock === 10, 'a ten-second clock');
    ada2.send({ type: 'battle:settings', clock: 0 });
    await ada2.waitFor((s) => s.clock === 0, 'untimed again');
  });

  await check('the misses can be gone over, and only the misses', async () => {
    ada2.send({ type: 'battle:settings', mode: 'solo', source: 'preset', presetId: 'capitals', length: 5, rule: 'marks' });
    await ada2.waitFor((s) => s.length === 5 && s.presetId === 'capitals', 'the settings');
    ada2.send({ type: 'battle:start' });
    await ada2.waitFor(atCard(0), 'the first card');
    // Cards two and four are got wrong.
    const end = await playThrough(ada2, 'capitals', (i) => i !== 1 && i !== 3);
    assert.equal(end.match.missed, 2, 'two cards were missed');
    const missedFronts = [end.match.review[1].front, end.match.review[3].front].sort();

    ada2.send({ type: 'battle:retry' });
    const again = await ada2.waitFor((s) => s.match && s.match.phase === 'asking' && s.match.retry, 'the misses dealt');
    assert.equal(again.match.total, 2, 'only the misses should be dealt');
    const seen = [];
    await ada2.waitFor(atCard(0), 'the first miss');
    for (let i = 0; i < 2; i++) {
      await ada2.waitFor(atCard(i), `miss ${i + 1}`);
      seen.push(ada2.state.match.card.front);
      ada2.send(answerOf(ada2.state, 'capitals', true));
      await ada2.waitFor(revealed(i), 'the reveal');
      ada2.send({ type: 'battle:next' });
    }
    const done = await ada2.waitFor(ended, 'the result');
    assert.deepEqual(seen.sort(), missedFronts, 'the cards dealt were not the ones that were missed');
    assert.equal(done.match.missed, 0);
    assert.match(await ada2.expectError({ type: 'battle:retry' }, 'going over nothing'), /nothing was missed/i);
  });

  await check('a rematch deals again on the same settings, straight away', async () => {
    ada2.send({ type: 'battle:rematch' });
    const s = await ada2.waitFor((x) => x.match && x.match.phase === 'asking' && !x.match.retry, 'the rematch');
    assert.equal(s.match.total, 5, 'the rematch should be dealt at the room\u2019s length, not the retry\u2019s');
    assert.equal(s.presetId, 'capitals');
    assert.match(await ada2.expectError({ type: 'battle:rematch' }, 'a rematch mid-match'), /not over/i);
  });

  await check('sudden death alone ends at the first miss', async () => {
    // The rematch from the check above is played out first.
    await playThrough(ada2, 'capitals');
    ada2.send({ type: 'battle:again' });
    await ada2.waitFor((s) => !s.match, 'the lobby');
    ada2.send({ type: 'battle:settings', mode: 'solo', rule: 'sudden', presetId: 'capitals', length: 10 });
    await ada2.waitFor((s) => s.rule === 'sudden' && s.length === 10, 'sudden death');
    ada2.send({ type: 'battle:start' });
    await ada2.waitFor(atCard(0), 'the first card');

    // Right, right, wrong: the run is three cards long and two of them got.
    for (let i = 0; i < 3; i++) {
      await ada2.waitFor(atCard(i), `card ${i + 1}`);
      ada2.send(answerOf(ada2.state, 'capitals', i < 2));
      await ada2.waitFor(revealed(i), 'the reveal');
      ada2.send({ type: 'battle:next' });
    }
    const end = await ada2.waitFor(ended, 'the end of the run');
    const me = end.match.standings[0];
    assert.equal(me.out, 3, 'out on the third card');
    assert.equal(me.run, 2, 'two in a row');
    assert.equal(end.match.review.length, 3, 'the review holds the cards that were reached, and no others');
  });

  await check('sudden death in a duel is won by whoever is left standing', async () => {
    const bram2 = new Battler(bram);
    await bram2.connect();
    ada2.send({ type: 'battle:again' });
    await ada2.waitFor((s) => !s.match, 'the lobby');
    bram2.send({ type: 'battle:join', code: ada2.state.code });
    await ada2.waitFor((s) => s.players.length === 2, 'bram');
    ada2.send({ type: 'battle:settings', mode: 'duel', rule: 'sudden', presetId: 'capitals', length: 10 });
    await ada2.waitFor((s) => s.mode === 'duel' && s.rule === 'sudden', 'a sudden-death duel');
    ada2.send({ type: 'battle:start' });

    // Card one: both right. Card two: bram misses, and that is the match —
    // even though bram answered faster, lasting is what counts.
    for (let i = 0; i < 2; i++) {
      await ada2.waitFor(atCard(i), `card ${i + 1}`);
      await bram2.waitFor(atCard(i), `card ${i + 1}, for bram`);
      bram2.send(answerOf(bram2.state, 'capitals', i === 0));
      ada2.send(answerOf(ada2.state, 'capitals', true));
      await ada2.waitFor(revealed(i), 'the reveal');
      ada2.send({ type: 'battle:next' });
    }
    const end = await ada2.waitFor(ended, 'the end');
    const [first, second] = end.match.standings;
    assert.equal(first.name, 'ada');
    assert.equal(first.won, true);
    assert.equal(first.out, null, 'the winner was never out');
    assert.equal(second.out, 2);
    assert.equal(second.won, false);
    bram2.close();
  });

  await check('somebody with the code mid-match watches, and is sat down after', async () => {
    const bram3 = new Battler(bram);
    await bram3.connect();
    const cleo = await member('cleo2');
    const watcher = new Battler(cleo);
    await watcher.connect();

    ada2.send({ type: 'battle:again' });
    await ada2.waitFor((s) => !s.match, 'the lobby');
    bram3.send({ type: 'battle:join', code: ada2.state.code });
    await ada2.waitFor((s) => s.players.filter((p) => p.connected).length === 2, 'bram back');
    ada2.send({ type: 'battle:settings', mode: 'duel', rule: 'marks', presetId: 'capitals', length: 5 });
    await ada2.waitFor((s) => s.rule === 'marks' && s.length === 5, 'the settings');
    ada2.send({ type: 'battle:start' });
    await ada2.waitFor(atCard(0), 'the first card');

    watcher.send({ type: 'battle:join', code: ada2.state.code });
    const s = await watcher.waitFor((x) => x.match && x.you.watching, 'watching');
    assert.equal(s.match.playing, false, 'a watcher is not asked the card');
    assert.equal(s.match.card.back, null, 'a watcher is not shown the back of an open card either');
    assert.match(await watcher.expectError({ type: 'battle:answer', text: 'me too' }, 'a watcher answering'), /watching/i);

    // The watcher sees the reveal like anybody.
    ada2.send(answerOf(ada2.state, 'capitals', true));
    bram3.send(answerOf(bram3.state, 'capitals', false));
    const rev = await watcher.waitFor(revealed(0), 'the reveal, watched');
    assert.equal(rev.match.marks.length, 2, 'the watcher sees both marks, and is not one of them');

    // Played out, and back to the lobby: the watcher has a seat now.
    ada2.send({ type: 'battle:next' });
    for (let i = 1; i < 5; i++) {
      await ada2.waitFor(atCard(i), `card ${i + 1}`);
      ada2.send(answerOf(ada2.state, 'capitals', true));
      bram3.send(answerOf(bram3.state, 'capitals', true));
      await ada2.waitFor(revealed(i), 'the reveal');
      ada2.send({ type: 'battle:next' });
    }
    const end = await ada2.waitFor(ended, 'the end');
    assert.equal(end.match.standings.length, 2, 'a watcher is not in the standings');
    ada2.send({ type: 'battle:again' });
    const lobby = await watcher.waitFor((x) => !x.match, 'the lobby');
    assert.equal(lobby.you.watching, false, 'the watcher should have been given a seat');
    assert.equal(lobby.players.filter((p) => !p.watching).length, 3);
    watcher.close();
    bram3.close();
  });

  // --- the daily deck ----------------------------------------------------------

  const today = Daily.deckFor();

  await check('today\u2019s ten is the same ten for everybody', async () => {
    assert.ok(today, 'there is no daily deck');
    const bram4 = new Battler(bram);
    await bram4.connect();

    ada2.send({ type: 'battle:daily' });
    bram4.send({ type: 'battle:daily' });
    const hers = await ada2.waitFor((s) => s.daily && s.match && s.match.phase === 'asking', 'the daily, for ada');
    const his = await bram4.waitFor((s) => s.daily && s.match && s.match.phase === 'asking', 'the daily, for bram');
    assert.notEqual(hers.code, his.code, 'a daily run is a room of its own');
    assert.equal(hers.mode, 'solo');
    assert.equal(hers.match.total, Daily.LENGTH);
    assert.equal(hers.match.card.front, his.match.card.front, 'the two were dealt different cards');
    if (hers.match.card.options) {
      assert.deepEqual(
        hers.match.card.options.map((o) => o.text),
        his.match.card.options.map((o) => o.text),
        'the options came out in a different order for each of them'
      );
    }

    // Ada gets it all right; Bram gets it all wrong.
    const [herEnd] = await Promise.all([
      playThrough(ada2, today.id, () => true),
      playThrough(bram4, today.id, () => false),
    ]);
    assert.equal(herEnd.match.standings[0].total, Daily.LENGTH * 100);
    bram4.close();
  });

  await check('the board keeps the first go of the day, best first', async () => {
    const menu = ok(await ada.site('me'), 'the menu');
    const d = menu.battle.daily;
    assert.equal(d.deck.id, today.id);
    assert.equal(d.yours.points, Daily.LENGTH * 100);
    assert.equal(d.yours.place, 1);
    assert.equal(d.entrants, 2);
    assert.ok(!JSON.stringify(d).includes(ada.id), 'the board handed out an account id');

    // A second go, got all wrong, changes nothing on the board.
    ada2.send({ type: 'battle:rematch' });
    await ada2.waitFor((s) => s.daily && s.match && s.match.phase === 'asking' && s.match.at === 0, 'a second go');
    const end = await playThrough(ada2, today.id, () => false);
    assert.equal(end.daily.board[0].points, Daily.LENGTH * 100, 'a second go replaced the first');
    const after = ok(await ada.site('me'), 'the menu').battle.daily;
    assert.equal(after.yours.points, Daily.LENGTH * 100);
    assert.equal(after.entrants, 2);
  });

  // =========================================================================

  // --- the question list --------------------------------------------------

  const bankOf = (b, request) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${b.label}: no question list came back`)), 5000);
      b.waiters.push((msg) => {
        if (msg.type !== 'battle:bank') return false;
        clearTimeout(t);
        resolve(msg);
        return true;
      });
      b.send({ type: 'battle:browse', ...request });
    });

  const dora = await member('dora');
  const d = new Battler(dora);
  await d.connect();

  await check('the question list pages through a subject, answers and all', async () => {
    const first = await bankOf(d, { deck: 'topic-physics', query: '', offset: 0 });
    assert.equal(first.kind, 'choice');
    assert.equal(first.cards.length, 25);
    assert.ok(first.total > 25);
    const card = first.cards[0];
    assert.ok(card.front && Array.isArray(card.options) && Number.isInteger(card.answer), 'a question came back without its answer');
    const second = await bankOf(d, { deck: 'topic-physics', query: '', offset: 25 });
    assert.notEqual(second.cards[0].front, card.front, 'the second page was the first again');
  });

  await check('the question list searches questions and answers', async () => {
    const all = await bankOf(d, { deck: 'topic-physics', query: '', offset: 0 });
    const found = await bankOf(d, { deck: 'topic-physics', query: 'VELOCITY', offset: 0 });
    assert.ok(found.total > 0 && found.total < all.total, 'a search did not narrow the list');
    for (const c of found.cards) {
      assert.ok((c.front + ' ' + c.options.join(' ')).toLowerCase().includes('velocity'), 'a result does not match the search');
    }
  });

  await check('the question list offers only what the lobby does', async () => {
    assert.match(await d.expectError({ type: 'battle:browse', deck: 'mmlu-anatomy' }, 'a source set'), /no such subject/i);
  });

  await check('today\u2019s ten are not in the question list', async () => {
    const { deck, cards } = Daily.dealFor();
    const listed = await bankOf(d, { deck: deck.id, query: '', offset: 0 });
    assert.equal(listed.total, deck.cards.length - cards.length, 'the list does not leave out exactly the daily ten');
    for (const c of cards) {
      const hit = await bankOf(d, { deck: deck.id, query: c.front, offset: 0 });
      assert.ok(!hit.cards.some((x) => x.front === c.front && JSON.stringify(x.options) === JSON.stringify(c.options)), 'a daily card is in the list');
    }
  });

  await check('the question list is shut to anybody in a match', async () => {
    d.send({ type: 'battle:create' });
    await d.waitFor((st) => !!st.code, 'a room');
    d.send({ type: 'battle:settings', mode: 'solo', source: 'preset', presetId: 'topic-physics', length: 5, clock: 0 });
    await d.waitFor((st) => st.presetId === 'topic-physics', 'the settings');
    d.send({ type: 'battle:start' });
    await d.waitFor((st) => st.match && st.match.phase === 'asking', 'the first card');
    assert.match(await d.expectError({ type: 'battle:browse', deck: 'topic-physics' }, 'browsing mid-match'), /closed while you/i);
    d.send({ type: 'battle:leave' });
    await new Promise((r) => setTimeout(r, 100));
    const after = await bankOf(d, { deck: 'topic-physics', query: '', offset: 0 });
    assert.ok(after.total > 0, 'the list stayed shut after leaving the match');
  });

  d.close();

  console.log('');
  await check('no message ever carried the back of a card that was still open', () => {
    assert.equal(leaks, 0, `${leaks} leak(s) — see above`);
    // A suite that checked nothing would also report no leaks.
    assert.ok(audit.length > 60, `only ${audit.length} messages were audited, which is too few to trust`);
    const asking = audit.filter((e) => e.msg.type === 'battle:state' && e.msg.state.match?.phase === 'asking');
    assert.ok(asking.length > 15, `only ${asking.length} open-card messages were seen`);
    // Both kinds have to have gone past the audit, or half of it proved
    // nothing at all.
    assert.ok(choiceMessages > 5, `only ${choiceMessages} open four-option cards were seen`);
    console.log(
      `      (${audit.length} messages audited, ${asking.length} with a card open, ${choiceMessages} of those four-option)`
    );
  });

  ada2.close();
}

run()
  .then(() => {
    console.log(`\n${checks} checks passed.`);
    child?.kill();
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nFAILED:', err.message);
    child?.kill();
    process.exit(1);
  });

// Switchhead: the rules, a game played out, and what must never be sent.
//
// Two suites in one file.
//
//   * **The rules**, played against `shed.js` directly. A swap and a goal
//     flip each come on a random count of turns, so a test that waited for
//     either over a socket would wait a long time and then fail for the
//     wrong reason. Here the table is set up by hand and the counts are set.
//   * **A game**, over a real socket against a real server, played to the
//     end with the hands swapping underneath it. Every message every client receives is kept and searched for a card
//     anywhere it should not be: somebody else's hand, anybody's face-down
//     row, or the deck.
//
//   npm run test:switchhead

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as Shed from '../server/shed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'thievery-switchhead-'));

let checks = 0;
async function check(what, fn) {
  await fn();
  checks += 1;
  console.log('  ok  ' + what);
}

// --- a table set by hand -----------------------------------------------------

let nextId = 1000;
const c = (rank, suit = 'S') => ({ id: 'x' + nextId++, rank, suit });

// A game already in play, with every seat's cards and the pile laid out as
// the test says. Anything not given is empty, which keeps a check about one
// rule from tripping over another.
function table({ seats = 2, specials = {}, rand = () => 0.99, pile = [], turn = 0, deck = [] } = {}) {
  const g = Shed.createGame({ players: Array.from({ length: seats }, (_, i) => ({ name: 'P' + i })), specials, rand });
  for (const s of g.seats) {
    s.hand = [];
    s.up = [];
    s.down = [];
    s.ready = true;
  }
  g.phase = 'play';
  g.deck = deck;
  g.pile = pile;
  g.turn = turn;
  g.flipIn = 1000; // no flips unless a check asks for one
  return g;
}

const refused = (fn, pattern) => assert.throws(fn, pattern);

console.log('the rules');

await check('a deal is three down, three up, three in the hand, and the hand in order', () => {
  const g = Shed.createGame({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
  assert.equal(g.phase, 'swap');
  for (const s of g.seats) {
    assert.equal(s.down.length, 3);
    assert.equal(s.up.length, 3);
    assert.equal(s.hand.length, 3);
    for (const row of [s.hand, s.up]) {
      for (let i = 1; i < row.length; i++) assert.ok(row[i - 1].rank <= row[i].rank, 'lowest to highest');
    }
  }
  assert.equal(g.deck.length, 52 - 27);
  const six = Shed.createGame({ players: Array.from({ length: 6 }, (_, i) => ({ name: 'P' + i })) });
  assert.equal(six.deck.length, 104 - 54, 'six players are dealt from two packs');
  refused(() => Shed.createGame({ players: [{ name: 'alone' }] }), /2 to 8/);
});

await check('before the start a hand card and a face-up card can be swapped, and not after ready', () => {
  const g = Shed.createGame({ players: [{ name: 'A' }, { name: 'B' }] });
  const s = g.seats[0];
  const h = s.hand[0];
  const u = s.up[2];
  Shed.swapUp(g, 0, h.id, u.id);
  assert.ok(s.up.some((x) => x.id === h.id) && s.hand.some((x) => x.id === u.id));
  Shed.ready(g, 0);
  refused(() => Shed.swapUp(g, 0, s.hand[0].id, s.up[0].id), /ready/);
  assert.equal(g.phase, 'swap', 'one seat ready is not everybody');
  Shed.ready(g, 1);
  assert.equal(g.phase, 'play');
  refused(() => Shed.swapUp(g, 1, g.seats[1].hand[0].id, g.seats[1].up[0].id), /over/);
});

await check('whoever holds the lowest ordinary card leads, and a two is not ordinary', () => {
  const g = Shed.createGame({ players: [{ name: 'A' }, { name: 'B' }] });
  g.seats[0].hand = [c(2), c(9), c(12)];
  g.seats[1].hand = [c(4), c(13), c(14)];
  Shed.ready(g, 0);
  Shed.ready(g, 1);
  assert.equal(g.turn, 1);
});

await check('a card goes on its equal or higher; a two resets; the turn moves on', () => {
  const g = table();
  g.seats[0].hand = [c(5), c(9), c(9, 'H')];
  g.seats[0].up = [c(3)];
  g.seats[1].hand = [c(8), c(2)];
  g.seats[1].up = [c(3)];
  g.pile = [c(8)];
  refused(() => Shed.play(g, 0, [g.seats[0].hand[0].id]), /will not go on a eight|will not go/);
  refused(() => Shed.play(g, 1, [g.seats[1].hand[0].id]), /not your turn/);
  Shed.play(g, 0, [g.seats[0].hand[1].id, g.seats[0].hand[2].id]);
  assert.equal(g.pile.length, 3, 'two nines together');
  assert.equal(g.turn, 1);
  refused(() => Shed.play(g, 1, [g.seats[1].hand.find((x) => x.rank === 8).id]), /will not go/);
  Shed.play(g, 1, [g.seats[1].hand.find((x) => x.rank === 2).id]);
  assert.ok(Shed.canPlay(g, 3), 'anything on a two');
});

await check('cards played together must be one rank', () => {
  const g = table();
  g.seats[0].hand = [c(6), c(7)];
  g.seats[1].hand = [c(3)];
  refused(() => Shed.play(g, 0, g.seats[0].hand.map((x) => x.id)), /same rank/);
});

await check('a ten burns the pile and the same player goes again', () => {
  const g = table();
  g.seats[0].hand = [c(10), c(4)];
  g.seats[1].hand = [c(3)];
  g.pile = [c(13), c(14)];
  Shed.play(g, 0, [g.seats[0].hand.find((x) => x.rank === 10).id]);
  assert.equal(g.pile.length, 0);
  assert.equal(g.burnt, 3);
  assert.equal(g.turn, 0, 'still their turn');
  assert.equal(g.seats[0].burns, 1);
});

await check('four of a kind across turns burns the pile, and whoever laid the fourth goes again', () => {
  const g = table();
  g.seats[0].hand = [c(6, 'S'), c(6, 'H'), c(12)];
  g.seats[1].hand = [c(6, 'D'), c(6, 'C'), c(13)];
  Shed.play(g, 0, [g.seats[0].hand[0].id, g.seats[0].hand[1].id]);
  Shed.play(g, 1, [g.seats[1].hand[0].id, g.seats[1].hand[1].id]);
  assert.equal(g.pile.length, 0);
  assert.equal(g.turn, 1);
});

await check('a seven: not wild, and the next card must be lower', () => {
  const g = table({ specials: { seven: true } });
  g.pile = [c(9)];
  g.seats[0].hand = [c(7), c(3)];
  g.seats[1].hand = [c(8), c(7, 'H'), c(6), c(10), c(2)];
  assert.equal(Shed.canPlay(g, 7), false, 'a seven will not go on a nine');
  g.pile = [c(5)];
  Shed.play(g, 0, [g.seats[0].hand.find((x) => x.rank === 7).id]);
  assert.equal(Shed.canPlay(g, 8), false);
  assert.equal(Shed.canPlay(g, 7), false, 'lower than a seven, not a seven');
  assert.equal(Shed.canPlay(g, 6), true);
  assert.equal(Shed.canPlay(g, 2), true, 'a two always works');
  assert.equal(Shed.canPlay(g, 10), true, 'a ten always works');
  refused(() => Shed.play(g, 1, [g.seats[1].hand.find((x) => x.rank === 8).id]), /lower than a seven/);
  const plain = table();
  plain.pile = [c(7)];
  assert.equal(Shed.canPlay(plain, 8), true, 'without the rule a seven is only a seven');
});

await check('a four is see-through: it goes on anything and the next plays against what is under it', () => {
  const g = table({ specials: { four: true } });
  g.pile = [c(13)];
  g.seats[0].hand = [c(4), c(3)];
  g.seats[1].hand = [c(12), c(14)];
  Shed.play(g, 0, [g.seats[0].hand.find((x) => x.rank === 4).id]);
  assert.equal(Shed.effectiveTop(g).rank, 13);
  assert.equal(Shed.canPlay(g, 12), false);
  assert.equal(Shed.canPlay(g, 14), true);
  const plain = table();
  plain.pile = [c(13)];
  assert.equal(Shed.canPlay(plain, 4), false, 'without the rule a four is only a four');
});

await check('a four passes a seven along', () => {
  const g = table({ specials: { four: true, seven: true } });
  g.pile = [c(7), c(4)];
  assert.equal(Shed.canPlay(g, 8), false);
  assert.equal(Shed.canPlay(g, 6), true);
});

await check('a five goes on anything, and its player must cover it higher than five or pick up', () => {
  const g = table({ specials: { five: true, four: true } });
  g.pile = [c(13)];
  g.seats[0].hand = [c(5), c(4), c(3), c(8)];
  g.seats[1].hand = [c(9)];
  Shed.play(g, 0, [g.seats[0].hand.find((x) => x.rank === 5).id]);
  assert.equal(g.cover, true);
  assert.equal(g.turn, 0, 'the same player covers it');
  refused(() => Shed.play(g, 0, [g.seats[0].hand.find((x) => x.rank === 3).id]), /Cover the five/);
  refused(() => Shed.play(g, 0, [g.seats[0].hand.find((x) => x.rank === 4).id]), /Cover the five/);
  Shed.play(g, 0, [g.seats[0].hand.find((x) => x.rank === 8).id]);
  assert.equal(g.cover, false);
  assert.equal(g.turn, 1);
  const plain = table();
  plain.pile = [c(13)];
  assert.equal(Shed.canPlay(plain, 5), false, 'without the rule a five is only a five');
});

await check('an uncovered five costs the pile', () => {
  const g = table({ specials: { five: true } });
  g.pile = [c(13)];
  g.seats[0].hand = [c(5), c(3)];
  g.seats[1].hand = [c(9)];
  Shed.play(g, 0, [g.seats[0].hand.find((x) => x.rank === 5).id]);
  Shed.pickUp(g, 0);
  assert.equal(g.seats[0].hand.length, 3, 'the three, the king and the five');
  assert.equal(g.cover, false);
  assert.equal(g.turn, 1);
});

await check('the face-up row waits for the hand, and the face-down cards are turned one at a time', () => {
  const g = table();
  const up = c(9);
  g.seats[0].hand = [c(3)];
  g.seats[0].up = [up];
  g.seats[0].down = [c(4), c(12)];
  g.seats[1].hand = [c(3)];
  refused(() => Shed.play(g, 0, [up.id]), /hand first/);
  refused(() => Shed.blind(g, 0, 0), /come last/);
  g.seats[0].hand = [];
  g.pile = [c(8)];
  Shed.play(g, 0, [up.id]);
  g.turn = 0;
  // The four will not go on a nine: it comes up with the pile.
  Shed.blind(g, 0, 0);
  assert.equal(g.pile.length, 0);
  assert.deepEqual(g.seats[0].hand.map((x) => x.rank), [4, 8, 9]);
  assert.equal(g.seats[0].down.length, 1);
  assert.equal(g.turn, 1);
});

await check('picking up is a move on any turn, but an empty pile is nothing to pick up', () => {
  const g = table();
  g.seats[0].hand = [c(14)];
  g.seats[1].hand = [c(3)];
  refused(() => Shed.pickUp(g, 0), /nothing to pick up/);
  g.pile = [c(3)];
  Shed.pickUp(g, 0);
  assert.equal(g.seats[0].pickups, 1);
});

await check('the goal turns over after its count of turns, and the next count is ten to fifteen', () => {
  const rolls = [0.99, 0.0];
  const g = table({ rand: () => (rolls.length ? rolls.shift() : 0.5) });
  g.seats[0].hand = [c(3), c(4), c(5)];
  g.seats[1].hand = [c(6), c(7), c(8)];
  g.flipIn = 2;
  Shed.play(g, 0, [g.seats[0].hand[0].id]);
  assert.equal(g.goal, 'win');
  Shed.play(g, 1, [g.seats[1].hand[0].id]);
  assert.equal(g.goal, 'lose');
  assert.equal(g.flips, 1);
  assert.ok(g.flipIn >= Shed.FLIP_MIN && g.flipIn <= Shed.FLIP_MAX);
  assert.equal(g.log[g.log.length - 1].kind, 'goal', 'a flip is announced');
});

await check('places fill from both ends: out while winning is the top, out while losing is the bottom', () => {
  const g = table({ seats: 4 });
  g.seats[0].hand = [c(3)];
  g.seats[1].hand = [c(4)];
  g.seats[2].hand = [c(5), c(12)];
  g.seats[3].hand = [c(6), c(13)];
  Shed.play(g, 0, [g.seats[0].hand[0].id]);
  assert.equal(g.seats[0].place, 1);
  g.goal = 'lose';
  Shed.play(g, 1, [g.seats[1].hand[0].id]);
  assert.equal(g.seats[1].place, 4, 'went out at the wrong moment');
  assert.equal(g.turn, 2);
  g.goal = 'win';
  g.seats[2].hand = [g.seats[2].hand[1]];
  Shed.play(g, 2, [g.seats[2].hand[0].id]);
  assert.equal(g.seats[2].place, 2);
  assert.equal(g.phase, 'ended');
  assert.equal(g.seats[3].place, 3, 'the last one holding cards takes what is left');
  const rows = Shed.standings(g);
  assert.deepEqual(rows.map((r) => r.name), ['P0', 'P2', 'P3', 'P1']);
  assert.equal(rows[3].head, true);
});

await check('with no flips, it is the ordinary game: the last one holding cards is the Switchhead', () => {
  const g = table({ seats: 3 });
  g.seats[0].hand = [c(3)];
  g.seats[1].hand = [c(4)];
  g.seats[2].hand = [c(2), c(9)];
  Shed.play(g, 0, [g.seats[0].hand[0].id]);
  Shed.play(g, 1, [g.seats[1].hand[0].id]);
  assert.equal(g.phase, 'ended');
  assert.equal(Shed.standings(g)[2].name, 'P2');
});

await check('the hands swap after their count of turns, and the next count is ten to fifteen', () => {
  const g = table({ seats: 3 });
  g.seats[0].hand = [c(3), c(4)];
  g.seats[1].hand = [c(6), c(7)];
  g.seats[2].hand = [c(9), c(11)];
  g.flipIn = 99;
  g.swapIn = 2;
  Shed.play(g, 0, [g.seats[0].hand[0].id]);
  assert.equal(g.swapIn, 1);
  // The swap comes inside the move that ends the count, so it is between
  // the hands as they stand once seat 1 has laid its card.
  const laid = g.seats[1].hand[0].id;
  const between = g.seats.map((x) => x.hand.filter((y) => y.id !== laid).map((y) => y.id).join());
  Shed.play(g, 1, [laid]);
  const after = g.seats.map((x) => x.hand.map((y) => y.id).join());
  const moved = after.filter((h, i) => h !== between[i]).length;
  assert.equal(moved, 2, 'exactly two hands changed places');
  assert.deepEqual([...after].sort(), [...between].sort(), 'the same hands, in different seats');
  assert.ok(g.swapIn >= Shed.SWAP_MIN && g.swapIn <= Shed.SWAP_MAX);
  assert.ok(g.log.every((l) => l.kind !== 'swap' && !/swap/i.test(l.text)), 'nothing in the log');
});

await check('the host\u2019s timings are what the counts are drawn from', () => {
  const timings = { swapMin: 2, swapMax: 2, flipMin: 3, flipMax: 3 };
  const g = Shed.createGame({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], timings });
  assert.equal(g.swapIn, 2);
  assert.equal(g.flipIn, 3);
  assert.deepEqual(g.timings, timings);
  // And after a count runs out, the next one is drawn from the same range.
  const t = table({ seats: 3 });
  t.timings = { swapMin: 4, swapMax: 4, flipMin: 1, flipMax: 1 };
  t.seats[0].hand = [c(3), c(4)];
  t.seats[1].hand = [c(6), c(7)];
  t.seats[2].hand = [c(9), c(11)];
  t.swapIn = 1;
  t.flipIn = 1;
  Shed.play(t, 0, [t.seats[0].hand[0].id]);
  assert.equal(t.swapIn, 4, 'the next swap was not drawn from the host\u2019s range');
  assert.equal(t.flipIn, 1, 'the next flip was not drawn from the host\u2019s range');
  refused(() => Shed.cleanTimings({ swapMin: 0 }), /whole number/);
  refused(() => Shed.cleanTimings({ flipMax: 51 }), /whole number/);
  refused(() => Shed.cleanTimings({ swapMin: 1.5 }), /whole number/);
  refused(() => Shed.cleanTimings({ swapMin: 9, swapMax: 3 }), /cannot be more/);
  assert.deepEqual(Shed.cleanTimings(), { ...Shed.DEFAULT_TIMINGS });
});

await check('a swap moves only hands with cards in, and never before the start', () => {
  const g = table({ seats: 3 });
  const a = [c(3), c(4)];
  const b = [c(9)];
  g.seats[0].hand = a;
  g.seats[1].hand = [];
  g.seats[1].up = [c(5)];
  g.seats[2].hand = b;
  const logged = g.log.length;
  assert.equal(Shed.shuffleHands(g, () => 0.1), true);
  assert.equal(g.seats[0].hand, b);
  assert.equal(g.seats[2].hand, a);
  assert.deepEqual(g.seats[1].hand, [], 'an empty hand is not swapped');
  assert.equal(g.log.length, logged, 'nothing in the log');
  g.seats[2].hand = [];
  assert.equal(Shed.shuffleHands(g, () => 0.1), false, 'one hand has nobody to swap with');
  g.phase = 'swap';
  g.seats[2].hand = [c(6)];
  assert.equal(Shed.shuffleHands(g, () => 0.1), false, 'no swapping before the start');
});

await check('what a seat is told: its own hand, everybody’s face-up row, and counts for the rest', () => {
  const g = Shed.createGame({ players: [{ name: 'A' }, { name: 'B' }] });
  const v = Shed.viewFor(g, 0);
  assert.equal(v.you.hand.length, 3);
  assert.equal(typeof v.you.down, 'number');
  assert.equal(typeof v.seats[1].hand, 'number');
  assert.equal(typeof v.seats[1].down, 'number');
  assert.equal(v.seats[1].up.length, 3);
  const text = JSON.stringify(v);
  assert.ok(!text.includes('flipIn'), 'the count to the next flip stays on the server');
  assert.ok(!text.includes('swapIn'), 'and so does the count to the next swap');
  for (const s of g.seats) for (const x of s.down) assert.ok(!text.includes(`"${x.id}"`), 'no face-down card');
  for (const x of g.seats[1].hand) assert.ok(!text.includes(`"${x.id}"`), 'no other hand');
  for (const x of g.deck) assert.ok(!text.includes(`"${x.id}"`), 'no deck');
  assert.equal(Shed.viewFor(g, -1).you, null, 'a watcher holds nothing');
});

// --- a game over the socket -----------------------------------------------------

console.log('a game');

let PORT = 0;
const child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
  env: { ...process.env, PORT: '0', THIEVERY_DATA_DIR: DATA_DIR },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  child.stdout.on('data', (d) => {
    const at = String(d).match(/running at http:[/][/]localhost:([0-9]+)/);
    if (at) {
      PORT = Number(at[1]);
      resolve();
    }
  });
  child.on('exit', (code) => reject(new Error(`server exited early (${code})`)));
});

function visitor() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  return {
    cookie,
    async site(route, body) {
      const headers = { Origin: `http://localhost:${PORT}` };
      if (body) headers['Content-Type'] = 'application/json';
      if (jar.size) headers.Cookie = cookie();
      const res = await fetch(`http://localhost:${PORT}/api/site/${route}`, {
        method: body ? 'POST' : 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      for (const raw of res.headers.getSetCookie?.() || []) {
        const [pair] = raw.split(';');
        const at = pair.indexOf('=');
        jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
      }
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    async page(where) {
      const res = await fetch(`http://localhost:${PORT}${where}`, {
        headers: jar.size ? { Cookie: cookie() } : {},
        redirect: 'manual',
      });
      return { status: res.status, location: res.headers.get('location'), html: await res.text() };
    },
  };
}

async function member(name) {
  const who = visitor();
  const res = await who.site('register', { username: name, password: 'a-long-enough-password', displayName: name });
  assert.equal(res.status, 200, `register ${name}: ${res.body.error || ''}`);
  who.name = name;
  return who;
}

// --- the audit ----------------------------------------------------------------
//
// A card is any object with a rank and a suit. These are the only places one
// may be, and anything else is a leak however it got there.
const ALLOWED = [
  /^state[.]game[.]you[.](hand|up)[.][0-9]+$/,
  /^state[.]game[.]seats[.][0-9]+[.]up[.][0-9]+$/,
  /^state[.]game[.]pile[.]cards[.][0-9]+$/,
  /^state[.]game[.]pile[.]top$/,
];
let leaks = 0;
let audited = 0;

function audit(label, msg) {
  audited += 1;
  const walk = (node, where) => {
    if (!node || typeof node !== 'object') return;
    if ('rank' in node && 'suit' in node && !ALLOWED.some((re) => re.test(where))) {
      leaks += 1;
      console.error(`  LEAK  ${label}: a card at ${where}`);
    }
    if ('flipIn' in node || 'rand' in node || 'deckCards' in node) {
      leaks += 1;
      console.error(`  LEAK  ${label}: server-only state at ${where}`);
    }
    for (const [k, v] of Object.entries(node)) walk(v, where ? `${where}.${k}` : k);
  };
  walk(msg, '');
  const g = msg.type === 'switchhead:state' && msg.state.game;
  if (!g) return;
  for (const s of g.seats) {
    if (typeof s.hand !== 'number' || typeof s.down !== 'number') {
      leaks += 1;
      console.error(`  LEAK  ${label}: seat ${s.seat} was sent more than a count`);
    }
  }
  if (g.you && typeof g.you.down !== 'number') {
    leaks += 1;
    console.error(`  LEAK  ${label}: your own face-down cards were sent`);
  }
}

class Player {
  constructor(who) {
    this.who = who;
    this.state = null;
    this.errors = [];
    this.seq = 0;
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}`, { headers: { Cookie: this.who.cookie() } });
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        audit(this.who.name, msg);
        if (msg.type === 'switchhead:state') {
          this.state = msg.state;
          this.seq += 1;
        } else if (msg.type === 'switchhead:error') {
          this.errors.push(msg.message);
          this.acted = -1; // look again
        }
      });
    });
  }
  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  async waitFor(pred, what, ms = 5000) {
    const until = Date.now() + ms;
    while (!(this.state && pred(this.state))) {
      if (Date.now() > until) throw new Error(`${this.who.name}: timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 5));
    }
    return this.state;
  }
  async errorLike(re) {
    const until = Date.now() + 3000;
    while (!this.errors.some((e) => re.test(e))) {
      if (Date.now() > until) throw new Error(`${this.who.name}: no error like ${re}; had ${JSON.stringify(this.errors)}`);
      await new Promise((r) => setTimeout(r, 5));
    }
    this.errors = [];
  }

  // The dullest legal move: the lowest card that will go, every one of that
  // rank, or the pile if nothing will. It is enough to finish a game.
  move() {
    const g = this.state?.game;
    if (!g || g.phase !== 'play' || !g.you || g.turn !== g.you.seat || g.you.place != null) return;
    if (this.acted === this.seq) return;
    this.acted = this.seq;
    const from = g.you.from;
    if (from === 'down') return this.send({ type: 'switchhead:blind', index: 0 });
    const row = g.you[from];
    const card = row.find((x) => g.legal.includes(x.rank));
    if (!card) return this.send({ type: 'switchhead:pickup' });
    this.send({ type: 'switchhead:play', cards: row.filter((x) => x.rank === card.rank).map((x) => x.id) });
  }
}

const ann = await member('annie');
const bob = await member('bobby');
const cat = await member('catty');

await check('a stranger is shown the door, a member the room, and a bad code is sent home', async () => {
  const stranger = visitor();
  const door = await stranger.page('/switchhead');
  assert.equal(door.status, 200);
  assert.ok(door.html.includes('data-next="/switchhead"'), 'the door');
  const room = await ann.page('/switchhead/ABCD');
  assert.equal(room.status, 200);
  assert.ok(room.html.includes('/switchhead.js'), 'the room');
  const bad = await ann.page('/switchhead/nope!');
  assert.equal(bad.status, 302);
  assert.equal(bad.location, '/switchhead');
});

const A = new Player(ann);
const B = new Player(bob);
const C = new Player(cat);
await A.connect();
await B.connect();
await C.connect();

await check('the host opens a room and picks the extra cards; the fixed three cannot be touched', async () => {
  A.send({ type: 'switchhead:create' });
  await A.waitFor((s) => s.code, 'a room');
  for (const special of ['seven', 'four', 'five']) A.send({ type: 'switchhead:settings', special, on: true });
  await A.waitFor((s) => s.specials.seven && s.specials.four && s.specials.five, 'three specials on');
  A.send({ type: 'switchhead:settings', special: 'two', on: false });
  await A.errorLike(/always in play/);
  A.send({ type: 'switchhead:start' });
  await A.errorLike(/somebody to play against/);
});

await check('the host sets the timings, and one end drags the other', async () => {
  assert.deepEqual(A.state.timings, { ...Shed.DEFAULT_TIMINGS });
  A.send({ type: 'switchhead:settings', timing: 'swapMin', value: 20 });
  await A.waitFor((st) => st.timings.swapMin === 20, 'the new swap minimum');
  assert.equal(A.state.timings.swapMax, 20, 'the maximum was left below the minimum');
  A.send({ type: 'switchhead:settings', timing: 'flipMax', value: 4 });
  await A.waitFor((st) => st.timings.flipMax === 4, 'the new flip maximum');
  assert.equal(A.state.timings.flipMin, 4, 'the minimum was left above the maximum');
  A.send({ type: 'switchhead:settings', timing: 'flipMin', value: 0 });
  await A.errorLike(/whole number/);
  A.send({ type: 'switchhead:settings', timing: 'nonsense', value: 3 });
  await A.errorLike(/No such setting/);
  // Back to the usual, so the game played below is the ordinary one.
  for (const [timing, value] of Object.entries(Shed.DEFAULT_TIMINGS)) A.send({ type: 'switchhead:settings', timing, value });
  await A.waitFor((st) => JSON.stringify(st.timings) === JSON.stringify(Shed.DEFAULT_TIMINGS), 'the usual timings');
});

await check('a guest joins by code, and cannot change the cards', async () => {
  B.send({ type: 'switchhead:join', code: A.state.code });
  await B.waitFor((s) => s.players.length === 2, 'two in the room');
  B.send({ type: 'switchhead:settings', special: 'seven', on: false });
  await B.errorLike(/Only the host/);
});

await check('the deal, a swap before the start, and play once both are ready', async () => {
  A.send({ type: 'switchhead:start' });
  await A.waitFor((s) => s.game && s.game.phase === 'swap', 'the deal');
  await B.waitFor((s) => s.game && s.game.phase === 'swap', 'the deal');
  const mine = A.state.game.you;
  const h = mine.hand[0].id;
  const u = mine.up[0].id;
  A.send({ type: 'switchhead:swap', hand: h, up: u });
  await A.waitFor((s) => s.game.you.up.some((x) => x.id === h), 'the swap');
  A.send({ type: 'switchhead:ready' });
  B.send({ type: 'switchhead:ready' });
  await A.waitFor((s) => s.game.phase === 'play', 'play');
});

await check('somebody arriving mid-game watches, holding nothing', async () => {
  C.send({ type: 'switchhead:join', code: A.state.code });
  const s = await C.waitFor((st) => st.game, 'the table');
  assert.equal(s.you.watching, true);
  assert.equal(s.game.you, null);
});

await check('a whole game played out, with the hands swapping underneath it', async () => {
  const until = Date.now() + 60_000;
  while (A.state.game.phase !== 'ended') {
    if (Date.now() > until) throw new Error('the game did not finish');
    A.move();
    B.move();
    await new Promise((r) => setTimeout(r, 8));
  }
  await B.waitFor((s) => s.game.phase === 'ended', 'the end');
  const rows = A.state.game.standings;
  assert.equal(rows.length, 2);
  assert.equal(rows[1].head, true);
  // A swap rides inside a move's push and leaves nothing a client could
  // count, which is the point of it; the rules suite above is where it is
  // checked. What this game proves is that none of them leaked a card.
  console.log(`        (${A.state.game.flips} goal flips)`);
});

await check('the game is on both records: one first, one the Switchhead', async () => {
  const a = (await ann.site('me')).body.switchhead;
  const b = (await bob.site('me')).body.switchhead;
  const c2 = (await cat.site('me')).body.switchhead;
  assert.equal(a.games, 1);
  assert.equal(b.games, 1);
  assert.equal(c2.games, 0, 'watching is not playing');
  assert.equal(a.wins + b.wins, 1);
  assert.equal(a.heads + b.heads, 1);
  assert.equal(a.seats, 2);
  assert.equal((await ann.site('me')).body.rooms.switchhead, true);
});

await check('dealing again sits the watcher down', async () => {
  A.send({ type: 'switchhead:rematch' });
  const s = await C.waitFor((st) => st.game && st.game.phase === 'swap', 'the next deal');
  assert.equal(s.you.watching, false);
  assert.equal(s.game.seats.length, 3);
  assert.ok(s.game.you, 'dealt in');
});

await check('nothing was sent that should not have been', () => {
  assert.ok(audited > 50, `only ${audited} messages audited`);
  assert.equal(leaks, 0, `${leaks} leak(s)`);
});

for (const p of [A, B, C]) p.ws.close();
child.kill();
fs.rmSync(DATA_DIR, { recursive: true, force: true });
console.log(`\n${checks} checks passed.`);

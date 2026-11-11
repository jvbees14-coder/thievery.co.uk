// Lockup, played against its rules with nothing drawn.
//
// The game runs in the browser and the server never sees a move of it, so
// there is no socket to listen on and no snapshot to audit. What there is
// instead is public/lockup-rules.js, which never touches a page: this suite
// runs that file as the browser would (it is a plain script that hangs its
// rules on globalThis) and plays it by hand.
//
// The things worth pinning down are the ones a change would break quietly:
// what counts as a hand, that there is one deck and no card is ever in two
// places, that a card is lost at the door and nowhere else, and that a seed
// is the whole of a game, because the daily table is nothing but a seed.
//
// That the page is served, and that what it keeps in the browser is on the
// privacy page, is test/site.test.js.
//
//   npm run test:lockup

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'lockup-rules.js');
vm.runInThisContext(fs.readFileSync(FILE, 'utf8'), { filename: FILE });
const R = globalThis.LockupRules;

let passed = 0;
function check(what, fn) {
  try {
    fn();
    console.log(`  ok  ${what}`);
    passed++;
  } catch (err) {
    console.error(`  FAILED: ${what}`);
    throw err;
  }
}

// A card from two characters and a rank: c('S', 12) is the queen of spades.
const c = (s, r) => ({ s, r });
const JOKER = { s: 'J', r: 0 };
const cards = (text) => text.split(' ').map((t) => c(t.slice(-1), { J: 11, Q: 12, K: 13, A: 14 }[t.slice(0, -1)] || Number(t.slice(0, -1))));

/** A game with money to spend and exactly the cards asked for in hand. */
function gameWith(hand, { seed = 7, map = 0 } = {}) {
  const g = R.newGame(seed, 'free', map, 'standard');
  g.chips = 10000;
  // The cards asked for are taken out of the deck, wherever they are, so the
  // one-deck rule still holds for a game set up by hand.
  const same = (a, b) => a.s === b.s && a.r === b.r;
  const all = [...g.deck, ...g.hand.filter(Boolean)];
  const wanted = hand.map((w) => { const i = all.findIndex((x) => same(x, w)); return all.splice(i, 1)[0]; });
  g.deck = all;
  g.hand = wanted;
  return g;
}

/** Every card the game knows about, wherever it is. */
function everyCard(g) {
  return [...g.deck, ...g.discard, ...g.hand.filter(Boolean), ...g.towers.map((t) => t.card)];
}

/** Run the clock for so many seconds. */
function run(g, seconds, each) {
  const steps = Math.round(seconds / R.DT);
  for (let i = 0; i < steps; i++) {
    R.step(g, R.DT);
    if (each) each();
  }
}

/** The twelve cards, wherever they have got to. */
const twelve = (g) => g.vault + g.lost + g.drops.length + g.thieves.reduce((n, t) => n + t.carry, 0);

// --- hands -------------------------------------------------------------------

console.log('hands');

check('each hand is read for what it is', () => {
  const want = {
    '7S 7H': 'pair',
    '7S 7H 9D 9C': 'twopair',
    '7S 7H 7D': 'trips',
    '5S 6H 7D': 'straight',
    '9D 7S 8H': 'straight',
    'AS 2H 3D': 'straight',
    'QS KH AD': 'straight',
    '2H 9H KH': 'flush',
    '7S 7H 7D 9C 9S': 'full',
    '7S 7H 7D 7C': 'quads',
    '5H 6H 7H': 'sf',
    '10S JS QS KS AS': 'sf',
  };
  for (const [text, hand] of Object.entries(want)) assert.equal(R.evalSeg(cards(text)), hand, text);
});

check('and a line that is not a hand is not one', () => {
  for (const text of ['7S 8H', '7S 7H 9D', '5S 6H 8D', 'KS AH 2D', '2H 9H KS', '7S 7H 7D 9C', '2S 5H']) {
    assert.equal(R.evalSeg(cards(text)), null, text);
  }
});

check('a joker is whatever card makes the best of the line', () => {
  assert.equal(R.bestHand([JOKER, ...cards('7S 7H')]), 'trips');
  assert.equal(R.bestHand([cards('5D')[0], JOKER, cards('7D')[0]]), 'sf');
  assert.equal(R.bestHand([JOKER, JOKER]), 'pair');
  assert.equal(R.bestHand([JOKER, ...cards('7S 7H 7D')]), 'quads');
});

check('better hands are worth more, and only straights reach further', () => {
  const order = ['pair', 'twopair', 'trips', 'flush', 'full', 'quads'];
  // A flush is taken at its full five: three of a suit is easy to find, and is
  // deliberately worth less than three of a kind.
  const size = { pair: 2, twopair: 4, trips: 3, flush: 5, full: 5, quads: 4 };
  for (let i = 1; i < order.length; i++) {
    assert.ok(R.handBonus(order[i], size[order[i]]).pow > R.handBonus(order[i - 1], size[order[i - 1]]).pow, `${order[i]} should beat ${order[i - 1]}`);
    assert.equal(R.handBonus(order[i], size[order[i]]).rng, 0);
  }
  assert.ok(R.handBonus('straight', 3).rng > 0 && R.handBonus('straight', 5).rng > R.handBonus('straight', 3).rng);
  assert.ok(R.handBonus('flush', 5).pow > R.handBonus('flush', 3).pow, 'a longer flush is a better one');
});

check('a card in two lines keeps the better of each', () => {
  const g = gameWith(cards('9S 10S JS JH 2D'));
  R.place(g, 0, 2, 3); R.place(g, 1, 3, 3); R.place(g, 2, 4, 3);
  R.place(g, 3, 4, 4);
  const at = (x, y) => g.grid[y * R.COLS + x];
  assert.equal(at(2, 3).hand, 'sf');
  assert.equal(at(4, 3).hand, 'sf', 'the jack of spades is in a straight flush and a pair, and keeps the first');
  assert.equal(at(4, 4).hand, 'pair');
  assert.ok(at(4, 3).pow > at(4, 4).pow && at(4, 3).rng > 0 && at(4, 4).rng === 0);
  // The hands worth showing are the two whole ones, not every piece of them.
  assert.deepEqual(g.handList, [['sf', 1], ['pair', 1]]);
  // A card that breaks nothing and joins nothing changes nothing.
  R.place(g, 4, 0, 11);
  assert.equal(at(0, 11).hand, null);
  assert.equal(at(2, 3).hand, 'sf');
});

// --- the cards themselves ----------------------------------------------------

console.log('\nthe cards');

check('a higher rank is a stronger card and a dearer one', () => {
  for (const s of 'SCHD') {
    const low = R.towerStats(c(s, 2), 0, 0, 0, 0), high = R.towerStats(c(s, 10), 0, 0, 0, 0);
    assert.ok(high.dmg > low.dmg, `${s}: damage`);
    assert.ok(R.cost(c(s, 10)) > R.cost(c(s, 2)), `${s}: cost`);
  }
  assert.ok(R.towerStats(c('H', 10), 0, 0, 0, 0).slow > R.towerStats(c('H', 2), 0, 0, 0, 0).slow);
  assert.ok(R.towerStats(c('D', 10), 0, 0, 0, 0).bonus > R.towerStats(c('D', 2), 0, 0, 0, 0).bonus);
});

check('the face cards each do their one thing', () => {
  const ten = R.towerStats(c('S', 10), 0, 0, 0, 0);
  const jack = R.towerStats(c('S', 11), 0, 0, 0, 0), queen = R.towerStats(c('S', 12), 0, 0, 0, 0);
  assert.ok(jack.rate > ten.rate && jack.range === ten.range, 'a jack is quicker and reaches no further');
  assert.ok(queen.range > ten.range && queen.rate === ten.rate, 'a queen reaches further and is no quicker');
  assert.ok(R.towerStats(c('C', 14), 0, 0, 0, 0).pierce && !R.towerStats(c('C', 13), 0, 0, 0, 0).pierce, 'only an ace ignores armour');
  assert.ok(R.towerStats(c('H', 14), 0, 0, 0, 0).names, 'any ace names a forger');
  assert.ok(R.towerStats(c('S', 2), 0, 0, 0, 0).names && !R.towerStats(c('C', 2), 0, 0, 0, 0).names, 'and any spade, but not a club');
});

check('a king lifts the cards touching it, corners included, and not itself', () => {
  const g = gameWith(cards('KC 5S 6H 9D'));
  R.place(g, 0, 3, 3);
  R.place(g, 1, 4, 4); // a corner
  R.place(g, 2, 3, 4); // a side
  R.place(g, 3, 6, 3); // nowhere near
  const at = (x, y) => g.grid[y * R.COLS + x];
  assert.equal(at(4, 4).court, R.CFG.court);
  assert.equal(at(3, 4).court, R.CFG.court);
  assert.equal(at(6, 3).court, 0);
  assert.equal(at(3, 3).court, 0);
  assert.ok(at(4, 4).st.dmg > R.towerStats(c('S', 5), 0, 0, 0, 0).dmg);
});

// --- the table ---------------------------------------------------------------

console.log('\nthe table');

check('there is one deck of fifty-four, and no card is ever in two places', () => {
  const g = R.newGame(11, 'free', 0, 'standard');
  g.chips = 100000;
  const whole = () => {
    const all = everyCard(g);
    assert.equal(all.length, 54);
    assert.equal(all.filter((x) => x.s === 'J').length, 2);
    assert.equal(new Set(all.filter((x) => x.s !== 'J').map((x) => x.s + x.r)).size, 52);
  };
  whole();
  const spots = [];
  for (let y = 0; y < R.ROWS; y++) for (let x = 0; x < R.COLS; x++) if (R.buildable(x, y)) spots.push([x, y]);
  // Deal after deal, placing what comes and selling some of it back, until
  // the deck has been round more than once.
  for (let round = 0; round < 30; round++) {
    for (let i = 0; i < 5; i++) {
      const spot = spots.find(([x, y]) => !g.grid[y * R.COLS + x]);
      if (g.hand[i] && spot && round % 3 !== 2) R.place(g, i, spot[0], spot[1]);
    }
    if (round % 4 === 3 && g.towers.length) R.sell(g, g.towers[0]);
    whole();
    R.redeal(g);
    whole();
  }
  assert.ok(g.towers.length > 20, 'expected a full table by now');
});

check('a card goes only on an empty spot off the carpet, and only if it can be paid for', () => {
  const g = gameWith(cards('5S 6S 7S'));
  assert.equal(R.place(g, 0, 1, 0), null, 'the carpet is not a spot');
  assert.equal(R.place(g, 0, -1, 3), null);
  assert.equal(R.place(g, 0, 2, 12), null);
  assert.ok(R.place(g, 0, 2, 3));
  assert.equal(R.place(g, 1, 2, 3), null, 'the spot is taken');
  g.chips = R.cost(c('S', 6)) - 1;
  assert.equal(R.place(g, 1, 3, 3), null, 'not enough chips');
  assert.equal(g.towers.length, 1);
  assert.equal(g.hand.filter(Boolean).length, 2, 'a card that was refused stays in the hand');
});

check('a card sold before the wave is a mistake undone; after it, half is back', () => {
  const g = gameWith(cards('9S 9H'));
  const before = g.chips;
  const t = R.place(g, 0, 2, 3);
  assert.equal(g.chips, before - R.cost(t.card));
  assert.equal(R.sellValue(g, t), R.cost(t.card));
  R.sell(g, t);
  assert.equal(g.chips, before);
  const u = R.place(g, 1, 2, 3);
  const price = R.upgradeCost(u, 0);
  assert.ok(R.upgrade(g, u, 0));
  assert.equal(u.spent, R.cost(u.card) + price, 'what an upgrade cost is part of what the card is worth');
  R.sendWave(g);
  assert.equal(R.sellValue(g, u), Math.floor(u.spent / 2));
});

// --- upgrades ------------------------------------------------------------------

console.log('\nupgrades');

check('every suit has three tracks of three steps, each said in words', () => {
  for (const s of 'SCHDJ') {
    const tracks = R.tracksOf(c(s, s === 'J' ? 0 : 9));
    assert.equal(tracks.length, 3, s);
    for (const t of tracks) {
      assert.ok(t.name && t.steps.length === R.TRACK_TOP && t.steps.every((x) => typeof x === 'string' && x.length > 5), `${s}: ${t.name}`);
    }
  }
});

check('each step of a track makes the card better at that one thing', () => {
  const st = (card, up) => R.towerStats(card, 0, 0, up, 0);
  for (let n = 1; n <= 3; n++) {
    const was = [0, 0, 0], now = [0, 0, 0];
    was[0] = n - 1; now[0] = n;
    assert.ok(st(c('S', 9), now).dmg > st(c('S', 9), was).dmg, `spade edge ${n}`);
    assert.ok(st(c('C', 9), now).dmg > st(c('C', 9), was).dmg, `club weight ${n}`);
    assert.ok(st(c('D', 9), now).dmg > st(c('D', 9), was).dmg, `diamond edge ${n}`);
    was[0] = 0; now[0] = 0; was[1] = n - 1; now[1] = n;
    assert.ok(st(c('S', 9), now).range > st(c('S', 9), was).range, `spade sight ${n}`);
    assert.ok(st(c('H', 9), now).range > st(c('H', 9), was).range, `heart reach ${n}`);
    was[1] = 0; now[1] = 0; was[2] = n - 1; now[2] = n;
    assert.ok(st(c('S', 9), now).rate > st(c('S', 9), was).rate, `spade tempo ${n}`);
    assert.ok(st(c('H', 9), now).dmg > st(c('H', 9), was).dmg, `heart scorch ${n}`);
    assert.ok(st(c('D', 9), now).bonus > st(c('D', 9), was).bonus, `diamond fence ${n}`);
  }
  // The last steps are the ones that change what a card is.
  assert.ok(st(c('S', 9), [3, 0, 0]).pierce && !st(c('S', 9), [2, 0, 0]).pierce);
  assert.ok(st(c('S', 9), [0, 3, 0]).chain && !st(c('S', 9), [0, 2, 0]).chain);
  assert.ok(st(c('C', 9), [3, 0, 0]).stun > 0 && !st(c('C', 9), [2, 0, 0]).stun);
  assert.ok(st(c('C', 9), [0, 3, 0]).splashFull && st(c('C', 9), [0, 2, 0]).splash > st(c('C', 9), [0, 0, 0]).splash);
  assert.ok(st(c('H', 9), [3, 0, 0]).expose && !st(c('H', 9), [2, 0, 0]).expose);
  assert.ok(st(c('D', 9), [0, 0, 3]).income > 0 && !st(c('D', 9), [0, 0, 2]).income);
});

check('only one track of a card takes its last step', () => {
  const g = gameWith(cards('9S'));
  const t = R.place(g, 0, 2, 3);
  for (let i = 0; i < 3; i++) assert.ok(R.upgrade(g, t, 0), `edge step ${i + 1}`);
  assert.equal(R.upgrade(g, t, 0), false, 'a track has three steps');
  assert.ok(R.upgrade(g, t, 1) && R.upgrade(g, t, 1), 'the other tracks still take two');
  assert.equal(R.canUpgrade(t, 1), false);
  assert.equal(R.upgrade(g, t, 1), false, 'but not a third');
  assert.ok(R.upgrade(g, t, 2) && R.upgrade(g, t, 2));
  assert.equal(R.upgrade(g, t, 2), false);
  assert.deepEqual(t.up, [3, 2, 2]);
  assert.equal(R.upgrade(g, t, 3), false, 'there is no fourth track');
});

check('an upgrade is paid for, and dearer the further along it is', () => {
  const g = gameWith(cards('9S 2S'));
  const t = R.place(g, 0, 2, 3), low = R.place(g, 1, 6, 6);
  const prices = [];
  for (let i = 0; i < 3; i++) {
    const chips = g.chips, price = R.upgradeCost(t, 0);
    prices.push(price);
    assert.ok(R.upgrade(g, t, 0));
    assert.equal(g.chips, chips - price);
  }
  assert.ok(prices[0] < prices[1] && prices[1] < prices[2]);
  assert.ok(R.upgradeCost(low, 0) < prices[0], 'a cheap card is cheap to upgrade');
  g.chips = R.upgradeCost(low, 0) - 1;
  assert.equal(R.upgrade(g, low, 0), false, 'not enough chips');
  assert.deepEqual(low.up, [0, 0, 0]);
});

check('a card that has been upgraded is worth more than two that have not', () => {
  const plain = R.towerStats(c('S', 9), 0, 0, null, 0);
  const made = R.towerStats(c('S', 9), 0, 0, [2, 0, 2], 0);
  assert.ok(made.dmg * made.rate > 2 * plain.dmg * plain.rate);
  const spent = [0, 1].reduce((n, i) => n + R.CFG.upCost[i], 0) * 2;
  assert.ok(spent < made.dmg * made.rate / (plain.dmg * plain.rate), 'and it should cost less than the cards it stands in for');
});

check('a stunned thief stands still, and the Mastermind for much less time', () => {
  const stand = (type) => {
    const g = gameWith([c('C', 9)]);
    const t = R.place(g, 0, 2, 1);
    for (let i = 0; i < 3; i++) R.upgrade(g, t, 0);
    R.sendWave(g);
    g.queue = [{ type, gap: 0, hpMul: 1e6 }];
    g.spawnT = 0;
    let still = 0, was = -1;
    run(g, 6, () => { const th = g.thieves[0]; if (th && th.d === was) still++; was = th ? th.d : -1; });
    return still;
  };
  const pick = stand('pick'), boss = stand('boss');
  assert.ok(pick > 20, `a pickpocket stood still for ${pick} steps`);
  assert.ok(boss > 0 && boss < pick, `the Mastermind stood still for ${boss} steps against ${pick}`);
});

check('a diamond at the end of its Fence pays at the end of every wave', () => {
  const pay = (steps) => {
    const g = gameWith([c('D', 9)]);
    const t = R.place(g, 0, 0, 11); // out of reach of everything
    for (let i = 0; i < steps; i++) R.upgrade(g, t, 2);
    R.sendWave(g);
    g.queue = [];
    const before = g.chips;
    run(g, 1);
    return g.chips - before;
  };
  assert.equal(pay(3) - pay(2), 12);
});

// --- a seed is a game ----------------------------------------------------------

console.log('\na seed is a game');

check('the same seed deals the same cards and sends the same waves', () => {
  const deals = (seed) => {
    const g = R.newGame(seed, 'daily', 0, 'standard');
    const out = [];
    for (let i = 0; i < 12; i++) { out.push(g.hand.map((x) => x.s + x.r).join(' ')); R.deal(g); }
    return out.join('|');
  };
  assert.equal(deals(2026), deals(2026));
  assert.notEqual(deals(2026), deals(2027));
  for (let n = 1; n <= R.LAST_WAVE; n++) {
    assert.equal(JSON.stringify(R.genWave(2026, n, 1)), JSON.stringify(R.genWave(2026, n, 1)), `wave ${n}`);
  }
  assert.notEqual(JSON.stringify(R.genWave(2026, 8, 1)), JSON.stringify(R.genWave(2027, 8, 1)));
});

check("the daily table's seed is the UTC date and nothing else", () => {
  const morning = R.dailySeed(new Date('2026-11-10T00:00:01Z')), night = R.dailySeed(new Date('2026-11-10T23:59:59Z'));
  assert.equal(morning, night);
  assert.notEqual(morning, R.dailySeed(new Date('2026-11-11T00:00:01Z')));
  assert.ok(Number.isInteger(morning) && morning >= 0);
});

check('a new kind of thief arrives on its wave, and not before', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    for (let n = 1; n <= R.LAST_WAVE; n++) {
      const wave = R.genWave(seed, n, 1);
      const kinds = new Set(wave.map((e) => e.type));
      for (const [kind, debut] of Object.entries(R.DEBUT)) {
        if (n < debut) assert.ok(!kinds.has(kind), `seed ${seed}: a ${kind} on wave ${n}`);
        if (n === debut) assert.ok(kinds.has(kind), `seed ${seed}: no ${kind} on its first wave`);
      }
      assert.equal(kinds.has('boss'), n % 10 === 0, `seed ${seed}: the Mastermind and wave ${n}`);
      assert.equal(wave.filter((e) => e.type !== 'boss').length, R.CFG.countBase + Math.floor(n * R.CFG.countPer));
    }
  }
});

check('waves get tougher, and the stakes scale them', () => {
  let last = 0;
  for (let n = 1; n <= R.LAST_WAVE; n++) {
    const hp = R.genWave(9, n, 1)[0].hpMul;
    assert.ok(hp > last, `wave ${n} is no tougher than the one before`);
    last = hp;
  }
  const { low, standard, high } = R.CFG.stakes;
  assert.ok(low < standard && standard < high);
  assert.equal(R.genWave(9, 5, high)[0].hpMul, R.genWave(9, 5, 1)[0].hpMul * high);
});

// --- the door ----------------------------------------------------------------

console.log('\nthe door');

check('with nobody in the way, every thief leaves with a card, and by the door', () => {
  const g = R.newGame(3, 'free', 0, 'standard');
  R.sendWave(g);
  const count = g.queue.length;
  let last = 0;
  run(g, 90, () => {
    assert.equal(twelve(g), R.VAULT_START, 'a card went missing');
    assert.ok(g.lost >= last, 'a lost card came back');
    last = g.lost;
  });
  assert.equal(g.phase, 'build', 'the wave should be over');
  assert.equal(g.lost, count);
  assert.equal(g.vault, R.VAULT_START - count);
  assert.equal(g.wave, 1);
});

/** One thief, walking out with a card, and nobody else on the carpet. */
function carrier() {
  const g = R.newGame(3, 'free', 0, 'standard');
  R.sendWave(g);
  g.queue = g.queue.slice(0, 1);
  let th = null;
  for (let i = 0; i < 60 / R.DT && !th; i++) {
    R.step(g, R.DT);
    th = g.thieves.find((t) => t.carry && t.d < 8) || null;
  }
  assert.ok(th, 'expected a thief on its way out with a card');
  // Something has to be on its way, or the wave is over the moment the
  // carpet is empty and everything dropped goes straight home.
  g.queue = [{ type: 'pick', gap: 600, hpMul: 1 }];
  g.spawnT = 600;
  return { g, th };
}

check('a thief that is stopped drops its card, and pays', () => {
  const { g, th } = carrier();
  const chips = g.chips;
  assert.equal(g.vault, R.VAULT_START - 1);
  R.hurt(g, th, 1e9);
  assert.equal(g.drops.length, 1);
  assert.equal(g.chips, chips + th.def.bounty);
  assert.equal(g.lost, 0);
  assert.equal(twelve({ ...g, thieves: [] }), R.VAULT_START);
});

check('a dropped card goes home after ten seconds, and not sooner', () => {
  const { g, th } = carrier();
  R.hurt(g, th, 1e9);
  run(g, 9.8);
  assert.equal(g.drops.length, 1);
  assert.equal(g.vault, R.VAULT_START - 1);
  run(g, 0.4);
  assert.equal(g.drops.length, 0);
  assert.equal(g.vault, R.VAULT_START);
  assert.equal(g.lost, 0);
});

check('unless the next thief gets to it first', () => {
  const { g, th } = carrier();
  R.hurt(g, th, 1e9);
  g.spawnT = 0; // the one that was waiting comes in now
  run(g, 30);
  assert.equal(g.lost, 1, 'the card should have left by the door');
  assert.equal(g.vault, R.VAULT_START - 1, 'it was picked up off the carpet, not out of the vault');
});

check('a forger cannot be touched until something names it', () => {
  const play = (card) => {
    const g = gameWith([card]);
    R.place(g, 0, 2, 1); // beside the first stretch of the carpet
    R.sendWave(g);
    g.queue = [{ type: 'forger', gap: 0, hpMul: 50 }];
    g.spawnT = 0;
    run(g, 2.5);
    return g.thieves[0];
  };
  const unseen = play(c('D', 5));
  assert.ok(unseen.hidden && unseen.hp === unseen.max, 'a diamond should not have seen it');
  const named = play(c('S', 5));
  assert.ok(!named.hidden && named.hp < named.max, 'a spade should have named it and hit it');
  assert.ok(!play(c('D', 14)).hidden, 'an ace of any suit names it');
});

check('armour takes the edge off a hit, and an ace goes through it', () => {
  const g = R.newGame(3, 'free', 0, 'standard');
  R.sendWave(g);
  g.queue = [{ type: 'bruiser', gap: 0, hpMul: 1 }];
  g.spawnT = 0;
  run(g, 0.1);
  const th = g.thieves[0];
  R.hurt(g, th, 10);
  assert.equal(th.max - th.hp, 10 - th.def.armor);
  const was = th.hp;
  R.hurt(g, th, 10, false, true);
  assert.equal(was - th.hp, 10);
});

// --- whole games -------------------------------------------------------------

console.log('\nwhole games');

/** Somebody who buys the best card they can afford and puts it by the carpet. */
function playOut(seed, map, stakes) {
  const g = R.newGame(seed, 'free', map, stakes);
  const spots = [...R.map.near].map((k) => [k % R.COLS, Math.floor(k / R.COLS)]);
  let steps = 0;
  while (g.phase === 'build' || g.phase === 'wave') {
    if (g.phase === 'build') {
      for (;;) {
        const i = [0, 1, 2, 3, 4].filter((k) => g.hand[k] && g.chips >= R.cost(g.hand[k])).sort((a, b) => g.hand[b].r - g.hand[a].r)[0];
        const spot = spots.find(([x, y]) => !g.grid[y * R.COLS + x]);
        if (i === undefined || !spot || !R.place(g, i, spot[0], spot[1])) break;
      }
      // And then spends what is left on the cards already down.
      for (const t of g.towers) for (const k of [0, 2, 1]) while (R.canUpgrade(t, k) && g.chips >= R.upgradeCost(t, k)) R.upgrade(g, t, k);
      R.sendWave(g);
    }
    R.step(g, R.DT);
    assert.equal(twelve(g), R.VAULT_START, `seed ${seed}: a card went missing on wave ${g.wave}`);
    assert.ok(++steps < 2e6, `seed ${seed}: the game never ended`);
  }
  assert.equal(everyCard(g).length, 54);
  return { phase: g.phase, wave: g.wave, lost: g.lost, chips: g.chips };
}

check('a game on each room plays out to an end, and loses no card on the way', () => {
  for (const map of R.MAPS.keys()) {
    const end = playOut(5, map, 'standard');
    assert.ok(end.phase === 'won' || end.phase === 'over');
    if (end.phase === 'over') assert.equal(end.lost, R.VAULT_START);
    if (end.phase === 'won') assert.equal(end.wave, R.LAST_WAVE);
  }
});

check('the same seed played the same way ends the same way', () => {
  assert.deepEqual(playOut(8, 0, 'high'), playOut(8, 0, 'high'));
});

check('high stakes are harder than low ones', () => {
  const low = playOut(8, 0, 'low'), high = playOut(8, 0, 'high');
  assert.ok(low.wave > high.wave || (low.wave === high.wave && low.lost <= high.lost), `low ${JSON.stringify(low)}, high ${JSON.stringify(high)}`);
});

// --- rooms ---------------------------------------------------------------------

console.log('\nrooms');

check('at the Fork the thieves come by each door in turn, and leave by their own', () => {
  const fork = R.MAPS.findIndex((m) => m.id === 'fork');
  assert.equal(R.MAPS[fork].routes.length, 2);
  const g = R.newGame(3, 'free', fork, 'standard');
  R.sendWave(g);
  const count = g.queue.length;
  const doors = new Map();
  run(g, 60, () => {
    assert.equal(twelve(g), R.VAULT_START);
    for (const th of g.thieves) {
      if (!doors.has(th.id)) doors.set(th.id, th.route);
      assert.equal(th.route, doors.get(th.id), 'a thief changed doors');
      assert.ok(th.path === th.route.main || th.path === th.route.cat);
    }
  });
  const byDoor = R.MAPS[fork].routes.map((r) => [...doors.values()].filter((x) => x === r).length);
  assert.equal(byDoor[0] + byDoor[1], count);
  assert.ok(Math.abs(byDoor[0] - byDoor[1]) <= 1, `the doors were used ${byDoor}`);
  assert.equal(g.lost, count);
});

check('a drawn room is its corners, there and back', () => {
  const cells = [[1, 0], [1, 4], [6, 4], [6, 9], [2, 9]];
  const code = R.codeOfCells(cells);
  assert.equal(code, '1014646929');
  assert.deepEqual(R.cellsOfCode(code), cells);
  assert.equal(R.roomFault(cells), '');
  const room = R.roomFromCode(code);
  assert.equal(room.id, 'custom');
  assert.equal(room.code, code);
  assert.deepEqual(room.vault, [2.5, 9.5]);
  assert.ok(room.routes[0].wp[0][1] < 0, 'the door is just off the board, beyond its edge square');
  assert.ok(room.set.has(4 * R.COLS + 3) && !room.set.has(0), 'the carpet covers its squares and no others');
});

check('a code that is not a room is not played', () => {
  const bad = {
    'not a string': 12,
    'odd length': '101',
    'off the board': '10c4',
    'a letter too far': '10z4',
    'one corner': '10',
    'a door in the middle': '4446',
    'a diagonal stretch': '1035',
    'a corner on top of the last': '10101464',
    'crossing itself': '1016464212' + '18',
    'too short': '1013',
    'too many corners': '10'.repeat(R.ROOM_MAX_CORNERS + 1),
  };
  for (const [why, code] of Object.entries(bad)) assert.equal(R.roomFromCode(code), null, why);
});

check('a drawn room plays like any other', () => {
  const room = R.roomFromCode('1014646929');
  const g = R.newGame(3, 'free', room, 'standard');
  assert.equal(g.mapIndex, -1);
  assert.equal(R.place(g, g.hand.findIndex(Boolean), 1, 2), null, 'the drawn carpet is not a spot');
  R.sendWave(g);
  const count = g.queue.length;
  run(g, 60, () => assert.equal(twelve(g), R.VAULT_START));
  assert.equal(g.phase, 'build');
  assert.equal(g.lost, count);
});

check('after thirty waves the same table can be played on', () => {
  const g = R.newGame(3, 'free', 0, 'standard');
  assert.equal(R.keepGoing(g), false, 'not before it is won');
  g.wave = R.LAST_WAVE - 1;
  R.sendWave(g);
  g.queue = []; g.thieves = [];
  run(g, 0.1);
  assert.equal(g.phase, 'won');
  assert.equal(R.cleared(g), R.LAST_WAVE);
  assert.ok(R.keepGoing(g));
  assert.equal(g.phase, 'build');
  R.sendWave(g);
  assert.equal(g.wave, R.LAST_WAVE + 1);
  assert.ok(g.queue[0].hpMul > R.genWave(g.seed, R.LAST_WAVE, g.hpScale)[0].hpMul, 'and it goes on getting harder');
  g.queue = []; g.thieves = [];
  run(g, 0.1);
  assert.equal(g.phase, 'build', 'there is no second win');
  const daily = R.newGame(3, 'daily', 0, 'standard');
  daily.phase = 'won';
  assert.equal(R.keepGoing(daily), false, 'the daily table ends at thirty for everybody');
});

// --- playing a game back ---------------------------------------------------------

console.log('\nplaying a game back');

/** A daily game played by the suite's own hand, and the moves it left. */
function dailyGame(date, { waves = 6 } = {}) {
  const table = R.dailyTable(date);
  const g = R.newGame(table.seed, 'daily', table.room, table.stakes);
  const spots = [...R.map.near].map((k) => [k % R.COLS, Math.floor(k / R.COLS)]);
  while ((g.phase === 'build' || g.phase === 'wave') && g.wave < waves) {
    if (g.phase === 'build') {
      if (g.wave === 2) R.redeal(g);
      if (g.wave === 3 && g.towers.length > 3) R.sell(g, g.towers[3]);
      const t = g.towers[g.wave % Math.max(1, g.towers.length)];
      if (t && R.canUpgrade(t, 0)) R.upgrade(g, t, 0);
      for (let i = 0; i < 5; i++) {
        const spot = spots.find(([x, y]) => !g.grid[y * R.COLS + x]);
        if (g.hand[i] && spot && g.chips >= R.cost(g.hand[i])) R.place(g, i, spot[0], spot[1]);
      }
      R.sendWave(g);
    }
    // A card laid while the wave is running, to prove the clock is honoured.
    if (g.phase === 'wave' && g.ticks % 400 === 399) {
      const i = g.hand.findIndex((x) => x && g.chips >= R.cost(x)), spot = spots.find(([x, y]) => !g.grid[y * R.COLS + x]);
      if (i >= 0 && spot) R.place(g, i, spot[0], spot[1]);
    }
    R.step(g, R.DT);
  }
  while (g.phase === 'wave') R.step(g, R.DT);
  return { table, g, moves: JSON.parse(JSON.stringify(g.log)) };
}
function playBack(table, moves, slice = 5000) {
  const game = R.replayer(table, moves);
  for (let i = 0; i < 1e5; i++) { const r = game.run(slice); if (r) return r; }
  throw new Error('the playing-back never ended');
}
const DAY = new Date('2026-11-10T12:00:00Z');

check('every move of a game is written down as it is made', () => {
  const { g, moves } = dailyGame(DAY);
  const kinds = new Set(moves.map((m) => m[1]));
  for (const k of ['p', 'u', 'r', 's', 'w']) assert.ok(kinds.has(k), `no move of kind ${k} in the log`);
  assert.ok(moves.every((m, i) => i === 0 || m[0] >= moves[i - 1][0]), 'the log is in the order things happened');
  assert.ok(moves.some((m) => m[1] === 'p' && m[0] > 0), 'a card laid during a wave is dated');
  assert.equal(moves.filter((m) => m[1] === 'w').length, g.wave);
});

check('played back, the moves are the same game to the chip', () => {
  const { table, g, moves } = dailyGame(DAY);
  const r = playBack(table, moves);
  assert.ok(r.ok, r.fault);
  assert.deepEqual([r.waves, r.kept, r.stopped, r.ticks], [R.cleared(g), R.VAULT_START - g.lost, g.stopped, g.ticks]);
  // In slices of any size, since the server takes it a slice at a time.
  assert.deepEqual(playBack(table, moves, 37), r);
  // And with another game made in between, as the server will have.
  const game = R.replayer(table, moves);
  let other = null;
  for (;;) { const x = game.run(1000); R.newGame(1, 'free', 1, 'high'); if (x) { other = x; break; } }
  assert.deepEqual(other, r);
});

check('a list of moves that is not the game is refused', () => {
  const { table, moves } = dailyGame(DAY);
  const bad = (list, why) => assert.equal(playBack(table, list).ok, false, why);
  const copy = () => JSON.parse(JSON.stringify(moves));
  let m = copy(); m.splice(1, 0, [0, 'u', 0, 0, 0]);
  bad(m, 'an upgrade to a card that is not there');
  m = copy(); m.find((x) => x[1] === 'p')[2] = 9;
  bad(m, 'a card from a hand of five that has no ninth');
  m = copy(); for (let i = 0; i < 60; i++) m.splice(1, 0, [0, 'r']);
  bad(m, 'more redeals than there are chips for');
  m = copy(); m[m.length - 1][0] += 5; m.push([m[m.length - 1][0] + 1e6, 'w']);
  bad(m, 'a move dated after the game');
  m = copy(); m.reverse();
  bad(m, 'the moves out of order');
  bad([[0, 'x']], 'a move nobody could make');
  bad('moves', 'not a list at all');
  bad([[0.5, 'w']], 'half a tick');
  // Yesterday's moves on today's table are somebody else's cards.
  assert.equal(playBack(R.dailyTable(new Date('2026-11-11T12:00:00Z')), moves).ok, false);
});

check('a game given up between waves is as far as it got', () => {
  const { table, moves } = dailyGame(DAY, { waves: 3 });
  const r = playBack(table, moves);
  assert.ok(r.ok && !r.won);
  assert.equal(r.waves, 3);
  assert.deepEqual(playBack(table, []), { ok: true, fault: '', waves: 0, kept: R.VAULT_START, won: false, stopped: 0, ticks: 0 });
});

console.log(`\n${passed} checks passed.`);

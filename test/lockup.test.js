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
  assert.ok(R.raise(g, u));
  assert.equal(u.spent, R.cost(u.card) * 2, 'a first raise costs the card again');
  R.sendWave(g);
  assert.equal(R.sellValue(g, u), Math.floor(u.spent / 2));
});

check('a raise adds power three times and no more', () => {
  const g = gameWith(cards('9S'));
  const t = R.place(g, 0, 2, 3);
  let last = t.st.dmg;
  for (let i = 0; i < R.CFG.maxRaise; i++) {
    assert.ok(R.raise(g, t));
    assert.ok(t.st.dmg > last);
    last = t.st.dmg;
  }
  assert.equal(R.raise(g, t), false);
  assert.equal(t.lvl, R.CFG.maxRaise);
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
  for (const map of [0, 1]) {
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

console.log(`\n${passed} checks passed.`);

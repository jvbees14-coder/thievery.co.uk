// The power-ups, driven straight against the rules.
//
// A five or six-hand table draws these at random, which makes them awkward to
// pin down over a socket: a test that waits for somebody to draw a stakeout
// waits a long time and then fails for the wrong reason. So this suite skips
// the room server entirely and plays game.js by hand, putting exactly the
// power-up it wants into exactly the hand it wants it in.
//
// What that leaves out — that a draw actually reaches a browser, that a
// reveal does not leak on the way there — is covered over HTTP by
// test/smoke.test.js, which checks every snapshot every client receives.
//
//   npm run test:powerups

import assert from 'node:assert/strict';
import * as Game from '../server/game.js';
import * as Bot from '../server/bot.js';
import * as PowerUps from '../server/powerups.js';
import { DEAL_SPLITS, SEAT_COUNTS, usesPowerUps } from '../server/deal.js';

const NAMES = ['Ivy', 'Sam', 'Reg', 'Cal', 'Fay', 'Mo'];

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

// The house thinks with a promise in front of it, so the handful of checks
// that ask it for a move have to be awaited. Everything else here is plain.
async function checkAsync(what, fn) {
  try {
    await fn();
    console.log(`  ok  ${what}`);
    passed++;
  } catch (err) {
    console.error(`  FAILED: ${what}`);
    throw err;
  }
}

/** A table already past the arranging, with every hand locked in as dealt. */
function table(numSeats, { botSeats = [] } = {}) {
  const g = Game.createGame({
    numSeats,
    teams: false,
    startSeat: 0,
    names: NAMES.slice(0, numSeats),
    botSeats,
  });
  for (let s = 0; s < numSeats; s++) {
    Game.lockOrder(g, s, g.seats[s].cards.map((c) => c.id));
  }
  return g;
}

/** Whatever this seat may legally shoot at, and what is really there. */
const openShots = (g, seat) => Game.guessTargets(g, seat).filter((t) => !g.shielded[t.seat]);
const realRank = (g, t) => g.seats[t.seat].cards[t.idx].rank;
const missAt = (g, seat, t) => Game.guess(g, seat, t, (realRank(g, t) % 13) + 1);
const hitAt = (g, seat, t) => Game.guess(g, seat, t, realRank(g, t));

/** The message from an action that should not have been allowed. */
function refused(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    return err.message;
  }
}

// --- the deal ---------------------------------------------------------------

check('every table still deals all 26 cards', () => {
  for (const n of SEAT_COUNTS) {
    const total = DEAL_SPLITS[n].reduce((a, b) => a + b, 0);
    assert.equal(total, 26, `${n} hands deal ${total}`);
    assert.equal(DEAL_SPLITS[n].length, n);
    const g = table(n);
    assert.equal(g.seats.reduce((a, s) => a + s.cards.length, 0), 26);
  }
});

check('five and six hands are dealt with power-ups, three and four are not', () => {
  for (const n of SEAT_COUNTS) {
    assert.equal(table(n).powered, n >= 5, `${n} hands`);
    assert.equal(usesPowerUps(n), n >= 5);
  }
  const small = table(4);
  assert.match(refused(() => Game.playPowerUp(small, 0, 'second_story')), /not playing with power-ups/);
  assert.equal(Game.viewFor(small, 0).powerUps, null);
});

check('a six-hand table still holds twelve people, two to a hand', () => {
  // The hands are the game's business; who sits at them is the room's. What
  // matters here is that nothing in the rules counts people rather than hands.
  const g = table(6);
  assert.equal(g.numSeats, 6);
  assert.equal(g.names.length, 6);
});

// --- the draw ---------------------------------------------------------------

check('one draw at the start of your own turn, and never more', () => {
  const g = table(6);
  assert.equal(g.kit[0].length, 1, 'the hand on turn drew');
  assert.ok(g.kit.slice(1).every((k) => k.length === 0), 'nobody else drew');

  // A correct guess earns another go but not another power-up.
  const t = openShots(g, 0)[0];
  hitAt(g, 0, t);
  assert.equal(g.turn, 0, 'still their turn');
  assert.equal(g.kit[0].length, 1, 'a second guess is not a second draw');
});

check('the house never draws', () => {
  const g = table(6, { botSeats: [2, 5] });
  for (let i = 0; i < 12 && g.phase === 'play'; i++) {
    const seat = g.turn;
    const shots = openShots(g, seat);
    if (!shots.length) break;
    missAt(g, seat, shots[0]);
  }
  assert.deepEqual(g.kit[2], [], 'seat 2 is the house and drew nothing');
  assert.deepEqual(g.kit[5], [], 'seat 5 is the house and drew nothing');
  assert.ok(g.kit[0].length + g.kit[1].length > 0, 'the people did draw');
});

check('a hand at the limit draws nothing until it spends something', () => {
  const g = table(6);
  g.kit[0] = ['stakeout', 'misdirection', 'loose_lips'];
  const before = [...g.kit[0]];
  // Round the table back to seat 0.
  for (let i = 0; i < 6 && g.phase === 'play'; i++) {
    const shots = openShots(g, g.turn);
    if (!shots.length) break;
    missAt(g, g.turn, shots[0]);
  }
  assert.deepEqual(g.kit[0], before, 'a full hand drew nothing');
  assert.equal(g.kit[0].length, PowerUps.HAND_LIMIT);
});

check('the draw never deals a second copy of something already held', () => {
  const held = ['casing_the_joint', 'loose_lips'];
  for (let i = 0; i < 4000; i++) {
    const drawn = PowerUps.draw(held);
    assert.ok(drawn, 'a hand of two should always draw something');
    assert.ok(!held.includes(drawn.id), `drew a second ${drawn.id}`);
  }
  assert.equal(PowerUps.draw(['a', 'b', 'c']), null, 'a full hand draws nothing');
});

check('the tiers come up about as often as they are meant to', () => {
  const runs = 40000;
  const tally = { common: 0, uncommon: 0, rare: 0, veryRare: 0 };
  const byId = {};
  for (let i = 0; i < runs; i++) {
    const p = PowerUps.draw([]);
    tally[p.tier]++;
    byId[p.id] = (byId[p.id] || 0) + 1;
  }
  for (const [tier, want] of Object.entries(PowerUps.TIER_WEIGHTS)) {
    const got = (100 * tally[tier]) / runs;
    assert.ok(Math.abs(got - want) < 2, `${tier} came up ${got.toFixed(1)}%, wanted about ${want}%`);
  }
  // The alarm is the table's only way to stop a run, so it must not be the
  // rare nobody ever sees.
  assert.ok(byId.alarm_trip > byId.stakeout * 1.5, 'the alarm should be the likeliest of the rares');
});

// --- reading the table ------------------------------------------------------

check('casing the joint tells the caster and nobody else', () => {
  const g = table(6);
  g.kit[0] = ['casing_the_joint'];
  const real = g.seats[1].cards[0].rank;
  Game.playPowerUp(g, 0, 'casing_the_joint', { target: { seat: 1, idx: 0 } });

  const mine = Game.viewFor(g, 0).seats[1].cards[0];
  assert.equal(mine.rank, real, 'the caster learns the rank');
  assert.equal(mine.shown, true);
  for (const other of [2, 3, 4, 5]) {
    const theirs = Game.viewFor(g, other).seats[1].cards[0];
    assert.equal(theirs.rank, null, `seat ${other} was told`);
    assert.equal(theirs.shown, false);
  }
  // Even the card's owner sees no change: it is still face down.
  assert.equal(g.seats[1].cards[0].faceUp, false, 'the card stayed face down');
  assert.ok(!g.kit[0].includes('casing_the_joint'), 'it was spent');
});

check('loose lips gives a count and never a place', () => {
  const g = table(6);
  g.kit[0] = ['loose_lips'];
  // Two of every rank exist, so the answer before anything turns over is two.
  Game.playPowerUp(g, 0, 'loose_lips', { rank: 7 });
  const caster = Game.viewFor(g, 0).log.slice(-1)[0];
  assert.match(caster.text, /2 7s still face down/);
  assert.equal(caster.priv, true);
  const table2 = Game.viewFor(g, 3).log.slice(-1)[0];
  assert.match(table2.text, /listened for loose lips/);
  assert.ok(!/still face down/.test(table2.text), 'the count leaked to the table');
});

check('loose lips is counted fresh, not remembered', () => {
  const g = table(6);
  // Turn one seven over, then ask again: the answer has to have moved.
  const seat = g.seats.findIndex((s) => s.cards.some((c) => c.rank === 7));
  const idx = g.seats[seat].cards.findIndex((c) => c.rank === 7);
  const asker = seat === 0 ? 1 : 0;
  g.kit[asker] = ['loose_lips'];
  g.turn = asker;
  g.step = 'guess';
  Game.playPowerUp(g, asker, 'loose_lips', { rank: 7 });
  assert.match(Game.viewFor(g, asker).log.slice(-1)[0].text, /2 7s/);

  g.seats[seat].cards[idx].faceUp = true;
  g.kit[asker] = ['loose_lips'];
  Game.playPowerUp(g, asker, 'loose_lips', { rank: 7 });
  assert.match(Game.viewFor(g, asker).log.slice(-1)[0].text, /1 7 still face down/);
});

check('a tip-off reaches the one player it was meant for', () => {
  const g = table(6);
  g.kit[0] = ['tip_off'];
  const real = g.seats[0].cards[0].rank;
  Game.playPowerUp(g, 0, 'tip_off', { idx: 0, player: 3 });
  assert.equal(Game.viewFor(g, 3).seats[0].cards[0].rank, real, 'the recipient was shown it');
  for (const other of [1, 2, 4, 5]) {
    assert.equal(Game.viewFor(g, other).seats[0].cards[0].rank, null, `seat ${other} saw a private tip-off`);
  }
});

// --- buying another go ------------------------------------------------------

check('a second storey forgives exactly one wrong guess', () => {
  const g = table(6);
  g.kit[0] = ['second_story'];
  Game.playPowerUp(g, 0, 'second_story');
  assert.equal(g.spare[0], 1);

  const first = openShots(g, 0)[0];
  missAt(g, 0, first);
  assert.equal(g.turn, 0, 'the forgiven miss kept the turn');
  assert.equal(g.spare[0], 0, 'and used the forgiveness up');

  const second = openShots(g, 0).find((t) => t.seat !== first.seat || t.idx !== first.idx);
  missAt(g, 0, second);
  assert.notEqual(g.turn, 0, 'the next miss passed the turn');
});

check('a forgiven miss is still on the record', () => {
  const g = table(6);
  g.kit[0] = ['second_story'];
  Game.playPowerUp(g, 0, 'second_story');
  const t = openShots(g, 0)[0];
  const wrong = (realRank(g, t) % 13) + 1;
  Game.guess(g, 0, t, wrong);
  assert.ok(
    g.misses.some(([s, i, r]) => s === t.seat && i === t.idx && r === wrong),
    'the table heard it either way',
  );
});

check('a second storey does not stack with itself', () => {
  const g = table(6);
  g.kit[0] = ['second_story'];
  Game.playPowerUp(g, 0, 'second_story');
  g.kit[0] = ['second_story']; // as if a second copy had been drawn
  assert.match(refused(() => Game.playPowerUp(g, 0, 'second_story')), /One second storey to a turn/);
});

// --- the balance rules ------------------------------------------------------

check('a pickpocket cannot be used to extend a run', () => {
  const g = table(6);
  g.kit[0] = ['pickpocket'];
  hitAt(g, 0, openShots(g, 0)[0]);
  assert.equal(g.chain, 1, 'a run is going');
  assert.match(
    refused(() => Game.playPowerUp(g, 0, 'pickpocket', { hand: 2 })),
    /not part-way through a run/,
  );
  assert.deepEqual(g.kit[0], ['pickpocket'], 'a refused play costs nothing');
});

check('a pickpocket works at the start of a turn, and names the hand', () => {
  const g = table(6);
  g.kit[0] = ['pickpocket'];
  Game.playPowerUp(g, 0, 'pickpocket', { hand: 2 });
  assert.equal(g.spare[0], 1, 'it buys a forgiven miss');
  assert.equal(g.forced[0], 2, 'and points the next guess');
  assert.match(refused(() => Game.guess(g, 0, { seat: 3, idx: 0 }, 5)), /has to go at/);
  missAt(g, 0, { seat: 2, idx: openShots(g, 0).find((t) => t.seat === 2).idx });
  assert.equal(g.turn, 0, 'the extra guess did not cost the turn');
  assert.equal(g.forced[0], null, 'and the hold lapsed after it');
});

check('anybody may trip the alarm, out of turn, and it ends the run', () => {
  const g = table(6);
  // Build a run of three at seat 0.
  for (let i = 0; i < 3; i++) hitAt(g, 0, openShots(g, 0)[0]);
  assert.equal(g.turn, 0);
  assert.equal(g.chain, 3, 'three in a row');

  const bystander = 4;
  g.kit[bystander] = ['alarm_trip'];
  Game.playPowerUp(g, bystander, 'alarm_trip');
  assert.notEqual(g.turn, 0, 'the run was cut short');
  assert.equal(g.chain, 0, 'and the chain reset');
  assert.deepEqual(g.kit[bystander], [], 'the alarm was spent');
});

check('the alarm needs a run to stop', () => {
  const g = table(6);
  g.kit[1] = ['alarm_trip'];
  assert.match(refused(() => Game.playPowerUp(g, 1, 'alarm_trip')), /no run to stop/);
});

check('the alarm takes whatever the running hand had been forgiven with it', () => {
  const g = table(6);
  g.kit[0] = ['second_story'];
  Game.playPowerUp(g, 0, 'second_story');
  hitAt(g, 0, openShots(g, 0)[0]);
  assert.equal(g.spare[0], 1);
  g.kit[3] = ['alarm_trip'];
  Game.playPowerUp(g, 3, 'alarm_trip');
  assert.equal(g.spare[0], 0, 'a stopped run does not keep its spare guesses');
});

check('every other power-up waits for your turn', () => {
  const g = table(6);
  g.kit[1] = ['second_story'];
  assert.match(refused(() => Game.playPowerUp(g, 1, 'second_story')), /not your turn/);
});

// --- stakeout ---------------------------------------------------------------

check('a stakeout blocks guesses against the hand it watches', () => {
  const g = table(6);
  g.kit[0] = ['stakeout'];
  Game.playPowerUp(g, 0, 'stakeout', { hand: 2 });
  assert.equal(g.shielded[2], true);
  assert.match(refused(() => Game.guess(g, 0, { seat: 2, idx: 0 }, 5)), /under a stakeout/);
  // Another hand is still fair game.
  const elsewhere = openShots(g, 0).find((t) => t.seat !== 2);
  assert.ok(elsewhere, 'there is somewhere else to shoot');
  hitAt(g, 0, elsewhere);
});

check('a stakeout never wins anybody the round', () => {
  const g = table(6);
  const before = Game.guessTargets(g, 0).length;
  g.kit[0] = ['stakeout'];
  Game.playPowerUp(g, 0, 'stakeout', { hand: 2 });
  assert.equal(Game.guessTargets(g, 0).length, before, 'a shielded hand still counts as something left to take');
  assert.equal(g.phase, 'play', 'the round did not end');
});

check('a stakeout lifts when the hand it watches plays again', () => {
  const g = table(6);
  g.kit[0] = ['stakeout'];
  Game.playPowerUp(g, 0, 'stakeout', { hand: 1 });
  assert.equal(g.shielded[1], true);
  missAt(g, 0, openShots(g, 0)[0]);
  assert.equal(g.turn, 1, 'the watched hand is next');
  assert.equal(g.shielded[1], false, 'and the stakeout lifted as its turn began');
});

check('a stakeout cannot be set on your own hand', () => {
  const g = table(6);
  g.kit[0] = ['stakeout'];
  assert.match(refused(() => Game.playPowerUp(g, 0, 'stakeout', { hand: 0 })), /Pick another hand/);
  assert.deepEqual(g.kit[0], ['stakeout'], 'and costs nothing when refused');
});

// --- misdirection -----------------------------------------------------------

check('misdirection sends somebody at a hand of your choosing', () => {
  const g = table(6);
  g.kit[0] = ['misdirection'];
  Game.playPowerUp(g, 0, 'misdirection', { player: 1, hand: 3 });
  assert.equal(g.forced[1], 3);
  missAt(g, 0, openShots(g, 0).find((t) => t.seat !== 1));
  assert.equal(g.turn, 1, 'their turn');
  assert.match(refused(() => Game.guess(g, 1, { seat: 2, idx: 0 }, 5)), /has to go at/);
  // They still choose the rank, and it lapses either way.
  missAt(g, 1, { seat: 3, idx: 0 });
  assert.equal(g.forced[1], null, 'the order expired after their next guess');
});

check('nobody can be sent at their own hand', () => {
  const g = table(6);
  g.kit[0] = ['misdirection'];
  assert.match(
    refused(() => Game.playPowerUp(g, 0, 'misdirection', { player: 1, hand: 1 })),
    /own hand/,
  );
});

check('an order that has become impossible lapses instead of trapping anybody', () => {
  const g = table(6);
  g.kit[0] = ['misdirection'];
  Game.playPowerUp(g, 0, 'misdirection', { player: 1, hand: 3 });
  // Hand 3 is then put under a stakeout by somebody else.
  g.shielded[3] = true;
  missAt(g, 0, openShots(g, 0).find((t) => t.seat !== 1 && t.seat !== 3));
  assert.equal(g.turn, 1);
  // Seat 1 is under orders it cannot follow, so the orders give way.
  const somewhere = openShots(g, 1).find((t) => t.seat !== 3);
  missAt(g, 1, somewhere);
  assert.equal(g.forced[1], null);
});

// --- the vault --------------------------------------------------------------

check('cracking the vault turns a card over and earns another go', () => {
  const g = table(6);
  g.kit[0] = ['vault_crack'];
  const real = g.seats[2].cards[1].rank;
  Game.playPowerUp(g, 0, 'vault_crack', { target: { seat: 2, idx: 1 } });
  assert.equal(g.seats[2].cards[1].faceUp, true, 'it turned over');
  assert.equal(g.chain, 1, 'it counts towards the run');
  assert.equal(g.turn, 0, 'and the caster goes again');
  assert.equal(g.step, 'guess');
  // A card that is face up is everybody's to see.
  assert.equal(Game.viewFor(g, 4).seats[2].cards[1].rank, real);
});

check('the vault cannot be cracked on your own hand, or through a stakeout', () => {
  const g = table(6);
  g.kit[0] = ['vault_crack'];
  assert.match(refused(() => Game.playPowerUp(g, 0, 'vault_crack', { target: { seat: 0, idx: 0 } })), /not your own/);
  g.shielded[2] = true;
  assert.match(refused(() => Game.playPowerUp(g, 0, 'vault_crack', { target: { seat: 2, idx: 0 } })), /under a stakeout/);
  assert.deepEqual(g.kit[0], ['vault_crack'], 'neither refusal cost the card');
});

check('the vault can take the round', () => {
  const g = table(6);
  // Turn everything face up but one card, then crack it.
  for (let si = 1; si < 6; si++) g.seats[si].cards.forEach((c, ci) => { if (!(si === 2 && ci === 0)) c.faceUp = true; });
  g.kit[0] = ['vault_crack'];
  Game.playPowerUp(g, 0, 'vault_crack', { target: { seat: 2, idx: 0 } });
  assert.equal(g.phase, 'ended');
  assert.deepEqual(g.result.winners, [0]);
});

// --- what the table is allowed to know --------------------------------------

check('you see your own power-ups, and only a count of everyone else’s', () => {
  const g = table(6);
  g.kit[0] = ['vault_crack', 'stakeout'];
  g.kit[1] = ['loose_lips'];
  const v = Game.viewFor(g, 1);
  assert.deepEqual(v.powerUps.kit, ['loose_lips'], 'your own hand, in full');
  assert.deepEqual(v.powerUps.held, [2, 1, 0, 0, 0, 0], 'everyone else, as a count');
  assert.ok(!JSON.stringify(v.powerUps).includes('vault_crack'), 'somebody else’s holdings leaked');
  assert.equal(v.powerUps.limit, PowerUps.HAND_LIMIT);
});

check('a hand with nothing it may shoot at passes rather than stalls', () => {
  const g = table(6);
  // Every hand but seat 0 is under a stakeout at once. A watched hand may
  // still play; the watch only stops people shooting at it.
  for (let si = 1; si < 6; si++) g.shielded[si] = true;
  g.turn = 5;
  g.step = 'guess';

  // Seat 5 misses at the one hand nobody is watching, and the turn comes round
  // to seat 0 with nowhere at all to shoot.
  missAt(g, 5, { seat: 0, idx: 0 });
  assert.equal(g.phase, 'play', 'the round did not stall');
  assert.notEqual(g.turn, 0, 'seat 0 had nothing open, so the turn moved past it');
  assert.equal(g.turn, 1, 'and landed on the next hand, whose own watch has now lifted');
  assert.equal(g.shielded[1], false);
  assert.ok(openShots(g, 1).length > 0, 'which does have somewhere to shoot');
});

// --- the house, at a table that has power-ups on it -------------------------
//
// Bots draw none of these, but they are played *at* them, and a bot that picks
// a move the rules refuse leaves the turn in its own hand: the room reschedules
// the same thinking every few seconds and the table waits on it for good.

const LEVELS = ['novice', 'sharp', 'ruthless'];

await checkAsync('the house does not guess at a hand under a stakeout', async () => {
  for (const level of LEVELS) {
    for (let run = 0; run < 25; run++) {
      const g = table(6, { botSeats: [1] });
      g.turn = 1;
      g.step = 'guess';
      // Every hand but one is being watched, so a bot reading none of it has
      // five chances in six of picking somewhere it may not shoot.
      for (const si of [0, 2, 3, 4]) g.shielded[si] = true;
      const move = await Bot.chooseGuess(Game.viewFor(g, 1), 1, level);
      assert.ok(move, `${level} found nothing to play`);
      assert.equal(g.shielded[move.target.seat], false, `${level} aimed at a staked-out hand`);
      Game.guess(g, 1, move.target, move.rank); // and the rules accept it
    }
  }
});

await checkAsync('the house goes where a misdirection sends it', async () => {
  for (const level of LEVELS) {
    for (let run = 0; run < 25; run++) {
      const g = table(6, { botSeats: [1] });
      g.turn = 1;
      g.step = 'guess';
      g.forced[1] = 4;
      const move = await Bot.chooseGuess(Game.viewFor(g, 1), 1, level);
      assert.equal(move.target.seat, 4, `${level} ignored an order to guess at hand 4`);
      Game.guess(g, 1, move.target, move.rank);
    }
  }
});

await checkAsync('an order it cannot follow lets the house shoot anywhere', async () => {
  const g = table(6, { botSeats: [1] });
  g.turn = 1;
  g.step = 'guess';
  g.forced[1] = 4;
  g.shielded[4] = true; // the hand it was sent at is now nobody's to guess at
  const move = await Bot.chooseGuess(Game.viewFor(g, 1), 1, 'sharp');
  assert.notEqual(move.target.seat, 4, 'it followed an order that had lapsed');
  Game.guess(g, 1, move.target, move.rank);
});

check('the fallback move the room plays is one the rules allow', () => {
  // What the room reaches for when a bot's own move is refused. It has to be
  // legal too, or the turn never leaves that seat.
  const g = table(6, { botSeats: [1] });
  g.turn = 1;
  g.step = 'guess';
  for (const si of [0, 2, 3]) g.shielded[si] = true;
  g.forced[1] = 5;
  const open = Game.legalTargets(g, 1);
  assert.ok(open.length, 'there is always something left to shoot at');
  assert.deepEqual([...new Set(open.map((t) => t.seat))], [5], 'and it is where the order points');
  Game.guess(g, 1, open[0], 1);
});

console.log(`\n${passed} checks passed.`);

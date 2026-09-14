// A whole evening of games, played by machine.
//
// This starts the real server, sits several real clients down at real tables,
// and plays rounds out to the end: partnerships, solo, three and four hands,
// hands shared by two players, custom deals, people dropping out and coming
// back. Every snapshot any client receives is checked for ranks it should
// never have been sent.
//
//   npm test

import { spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The server is asked for any free port rather than a guessed one, so two runs
// at once cannot land on the same one and confuse each other.
let PORT = 0;

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
      // Bots pause for three to five seconds before playing; a test that plays
      // twenty-six cards out does not want to wait for all of it.
      env: { ...process.env, PORT: '0', THIEVERY_BOT_PACE: '0.012' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    child.stdout.on('data', (d) => {
      const at = String(d).match(/running at http:\/\/localhost:(\d+)/);
      if (at) {
        PORT = Number(at[1]);
        resolve(child);
      }
    });
    child.on('exit', (code) => reject(new Error(`server exited early (${code})`)));
  });
}

class Client {
  constructor(label) {
    this.label = label;
    this.state = null;
    this.errors = [];
    this.waiters = [];
    this.you = null;
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}`);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'state') {
          this.state = msg;
          this.you = msg.you;
          checkPrivacy(msg);
          this.waiters = this.waiters.filter((w) => !w(msg));
        } else if (msg.type === 'error') {
          this.errors.push(msg.message);
          this.waiters = this.waiters.filter((w) => !w(null, msg.message));
        }
      });
    });
  }
  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  // Resolve when a state matching `pred` arrives (checks the current one first).
  //
  // Even when the state to hand already matches, the wait goes through
  // setImmediate rather than resolving on the spot. Awaiting a promise that is
  // already settled only drains the microtask queue, so a loop whose every
  // wait is satisfied by what it has already got never gives the event loop a
  // turn — which means no socket message is ever delivered, the state it is
  // waiting to change never changes, and the loop spins until the heap is
  // gone. Handing control back once here costs nothing and makes that
  // impossible.
  waitFor(pred, what = 'state', ms = 4000) {
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
  // Send an action and expect the server to reject it.
  expectError(obj, what) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.label}: expected error for ${what}`)), 2000);
      this.waiters.push((s, err) => {
        if (err) {
          clearTimeout(t);
          resolve(err);
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

// Every snapshot a client receives must only contain ranks they may know.
let snapshotsChecked = 0;
function checkPrivacy(msg) {
  const g = msg.game;
  if (!g) return;
  const me = msg.you.seat;
  g.seats.forEach((s, si) => {
    s.cards.forEach((c) => {
      const mine = si === me;
      if (!mine && !c.faceUp && !c.shown) {
        assert.equal(c.rank, null, `rank leaked for seat ${si} to seat ${me}`);
        assert.equal(c.id, undefined, `card id leaked for seat ${si} to seat ${me}`);
      }
      if (!mine && g.phase === 'arrange') assert.equal(c.color, null, `colour leaked during arrange to seat ${me}`);
      if (c.shown) assert.ok(c.rank, 'shown card must include its rank');
    });
  });
  snapshotsChecked++;
}

// The harness can see everyone's own view, so it knows every true rank.
function trueRank(clients, seat, idx) {
  const owner = clients.find((c) => c.you.seat === seat);
  return owner.state.game.seats[seat].cards[idx].rank;
}
function bySeat(clients, seat) {
  return clients.find((c) => c.you.seat === seat);
}
function faceDown(g, seat) {
  return g.seats[seat].cards.map((c, i) => (c.faceUp ? -1 : i)).filter((i) => i >= 0);
}

// A shared hand is arranged once, by whichever of its two players gets there
// first; the other has nothing left to lock.
async function lockAll(clients) {
  const done = new Set();
  for (const c of clients) {
    // Wait for the deal, not for the arranging: a hand shared by two people is
    // arranged once, and by the time the second of them is asked the last hand
    // may already have gone in and the round started without them.
    await c.waitFor((s) => s.game && (s.game.phase === 'arrange' || s.game.phase === 'play'), 'the deal');
    if (done.has(c.you.seat) || c.state.game.phase !== 'arrange') continue;
    done.add(c.you.seat);
    const cards = c.state.game.seats[c.you.seat].cards;
    let mine = cards.map((x) => x.id);
    // Aces may go anywhere: move any ace to the far right and expect it to be accepted.
    const ace = cards.find((x) => x.rank === 1);
    if (ace) mine = mine.filter((id) => id !== ace.id).concat(ace.id);
    // A genuinely out-of-order row (non-aces descending) must be rejected first.
    const nonAces = cards.filter((x) => x.rank !== 1);
    if (nonAces.length >= 2 && nonAces[0].rank !== nonAces[nonAces.length - 1].rank) {
      assert.match(await c.expectError({ type: 'arrange:lock', order: [...mine].reverse() }, 'bad order'), /ascending/);
    }
    c.send({ type: 'arrange:lock', order: mine });
  }
  for (const c of clients) await c.waitFor((s) => s.game.phase === 'play', 'play phase');
}

// Play turns until `maxTurns` have passed or the round ends. Alternates
// correct/incorrect guesses unless `alwaysCorrect` is set. Returns the final
// game snapshot.
async function playTurns(clients, maxTurns, { alwaysCorrect = false } = {}) {
  let turns = 0;
  let correct = true;
  const ref = clients[0];
  while (turns < maxTurns) {
    await ref.waitFor((s) => s.game.phase !== 'play' || ['show', 'guess'].includes(s.game.step), 'a step');
    const g = ref.state.game;
    if (g.phase !== 'play') break;
    const active = bySeat(clients, g.turn);
    if (g.step === 'show') {
      const partnerSeat = (g.turn + 2) % 4;
      const partner = bySeat(clients, partnerSeat);
      await partner.waitFor((s) => s.game.step === 'show' && s.game.turn === g.turn, 'show step');
      const idxs = faceDown(partner.state.game, partnerSeat);
      partner.send({ type: 'show', idx: idxs[0] });
      await active.waitFor((s) => s.game.turn === g.turn && s.game.seats[partnerSeat].cards[idxs[0]].shown, 'guess after show');
      // The active player now sees that card's rank; nobody else does.
      const shownCard = active.state.game.seats[partnerSeat].cards[idxs[0]];
      assert.ok(shownCard.shown && shownCard.rank, 'active player should see the shown card');
      const other = clients.find((c) => c.you.seat !== g.turn && c.you.seat !== partnerSeat);
      await other.waitFor((s) => s.game.step === 'guess' && s.game.turn === g.turn, 'other sees guess step');
      assert.equal(other.state.game.seats[partnerSeat].cards[idxs[0]].rank, null, 'shown card leaked to a non-partner');
    } else if (g.step === 'guess') {
      // Wait until the active client's snapshot is at least as fresh as the reference one.
      await active.waitFor((s) => s.game.step === 'guess' && s.game.turn === g.turn && s.game.log.length >= g.log.length, 'fresh guess state');
      const ag = active.state.game;
      const targets = [];
      ag.seats.forEach((s, si) => {
        if (s.team === ag.seats[g.turn].team) return;
        faceDown(ag, si).forEach((idx) => targets.push({ seat: si, idx }));
      });
      // The round ends the moment someone runs out of targets, so an active
      // player always has something to guess.
      assert.ok(targets.length > 0, 'active player should always have a card to guess');
      const t = targets[Math.floor(Math.random() * targets.length)];
      const real = trueRank(clients, t.seat, t.idx);
      const useCorrect = alwaysCorrect || correct;
      const rank = useCorrect ? real : (real % 13) + 1;
      const logLen = g.log.length;
      const ownDown = faceDown(g, g.turn).length;
      active.send({ type: 'guess', target: t, rank });
      await ref.waitFor((s) => s.game.log.length > logLen || s.game.phase !== 'play', 'guess result');
      const after = ref.state.game;
      if (useCorrect) {
        assert.ok(after.seats[t.seat].cards[t.idx].faceUp, 'guessed card flips');
        if (after.phase === 'play') {
          // A correct guess keeps the turn and the guess step.
          assert.equal(after.turn, g.turn, 'correct guess should keep the turn');
          assert.equal(after.step, 'guess', 'correct guess should allow another guess');
        }
      } else {
        assert.equal(after.phase, 'play', 'a wrong guess never ends the round');
        assert.notEqual(after.turn, g.turn, 'wrong guess passes the turn');
        assert.ok(!after.seats[t.seat].cards[t.idx].faceUp, 'wrongly guessed card stays face down');
        assert.equal(faceDown(after, g.turn).length, ownDown, 'a wrong guess must not cost the guesser a card');
      }
      correct = !correct;
      turns++;
    }
  }
  return ref.state.game;
}

// A guess that keeps the round moving without helping it along. Best is one
// that cannot possibly land: there is one card of each rank in each colour, so
// a rank this seat holds itself is not also in somebody else's row. A rank
// already ruled out at that card is no use — the table has been told about
// those — and once they run out, anything still legal will do, even if it
// lands. `sure` says which kind came back.
function dullGuess(c) {
  const g = c.state.game;
  const me = c.you.seat;
  const mine = g.seats[me].cards;
  const ruled = (si, idx, rank) => g.misses.some(([s2, i2, r]) => s2 === si && i2 === idx && r === rank);
  let any = null;
  for (let si = 0; si < g.numSeats; si++) {
    if (si === me || g.seats[si].team === g.seats[me].team) continue;
    for (let idx = 0; idx < g.seats[si].cards.length; idx++) {
      if (g.seats[si].cards[idx].faceUp) continue;
      const held = mine.find((x) => x.color === g.seats[si].cards[idx].color && !ruled(si, idx, x.rank));
      if (held) return { target: { seat: si, idx }, rank: held.rank, sure: true };
      if (any) continue;
      for (let r = 1; r <= 13; r++) {
        if (!ruled(si, idx, r)) {
          any = { target: { seat: si, idx }, rank: r, sure: false };
          break;
        }
      }
    }
  }
  return any;
}

// Sit at a table of bots, miss every guess on purpose, and let the house play
// the round out. Records which seats guessed and which asked us for a show.
//
// "Not our turn yet" and "the round is over" have to be told apart carefully:
// every client is sent the same snapshot but does not always read it at the
// same moment, so the only sound test for the end of a round is `ended`.
async function missUntilOver(clients, guessed = new Set(), showed = new Set()) {
  const ref = clients[0];
  const over = (s) => s.game.phase === 'ended';
  for (const c of clients) await c.waitFor((s) => s.game.phase !== 'arrange', 'everyone is in play');
  // A round of deliberate misses runs long, and the log a client is sent is
  // trimmed to its last 250 lines — so progress is counted off `logTotal`,
  // which is the whole of it.
  for (let step = 0; step < 2000 && !over(ref.state); step++) {
    const g = ref.state.game;
    const partner = g.numSeats === 4 && g.teams ? (g.turn + 2) % 4 : null;
    const us = clients.find((c) => c.you.seat === g.turn);
    const asked = g.step === 'show' && clients.find((c) => c.you.seat === partner);
    const before = g.logTotal;
    if (asked) {
      showed.add(g.turn);
      await asked.waitFor((s) => over(s) || (s.game.step === 'show' && s.game.turn === g.turn), 'the show');
      if (over(asked.state)) break;
      asked.send({ type: 'show:skip' });
    } else if (g.step === 'guess' && us) {
      await us.waitFor((s) => over(s) || (s.game.turn === us.you.seat && s.game.step === 'guess'), 'our turn');
      if (over(us.state)) break;
      const bad = dullGuess(us);
      assert.ok(bad, 'something legal left to guess at');
      us.send({ type: 'guess', target: bad.target, rank: bad.rank });
      await ref.waitFor((s) => over(s) || s.game.logTotal > before, 'the guess lands somewhere');
      if (bad.sure) {
        assert.ok(
          ref.state.game.misses.some(([s2, i2, r]) => s2 === bad.target.seat && i2 === bad.target.idx && r === bad.rank),
          'a miss goes on the public record',
        );
      }
      continue;
    } else {
      guessed.add(g.turn);
    }
    await ref.waitFor((s) => over(s) || s.game.logTotal > before, 'the house plays', 15000);
  }
  for (const c of clients) await c.waitFor(over, 'the round to end', 15000);
}

// Play correct guesses until the round ends; every client sees the result.
async function playToEnd(clients) {
  const g = await playTurns(clients, Infinity, { alwaysCorrect: true });
  assert.equal(g.phase, 'ended', 'round should have ended');
  for (const c of clients) await c.waitFor((s) => s.game.phase === 'ended', 'round end');
  return clients[0].state.game.result;
}

async function main() {
  const server = await startServer();
  try {
    // ---------------- 4 players, teams ----------------
    const A = new Client('A');
    await A.connect();
    A.send({ type: 'create', name: 'Ada' });
    await A.waitFor((s) => s.room && s.room.code);
    const code = A.state.room.code;
    assert.match(code, /^[A-Z2-9]{4}$/);

    const B = new Client('B');
    const C = new Client('C');
    const D = new Client('D');
    for (const [c, name] of [[B, 'Bob'], [C, 'Cy'], [D, 'Di']]) {
      await c.connect();
      c.send({ type: 'join', code, name });
      await c.waitFor((s) => s.room);
    }
    const four = [A, B, C, D];
    await A.waitFor((s) => s.room.players.length === 4);

    // Non-host can't change settings; host can.
    assert.match(await B.expectError({ type: 'lobby:teams', teams: true }, 'non-host teams'), /host/);
    A.send({ type: 'lobby:teams', teams: true });
    await A.waitFor((s) => s.room.teams === true);
    // A fifth player is not turned away: they join the first hand and share it.
    const E = new Client('E');
    await E.connect();
    E.send({ type: 'join', code, name: 'Eve' });
    await E.waitFor((s) => s.room.players.length === 5, 'Eve seated');
    assert.equal(E.you.seat, 0, 'the fifth player shares the first hand');
    // Everyone is told at the same moment but does not read it at the same
    // moment, so wait for the seat being asked about before asking it.
    await A.waitFor((s) => s.room.players.length === 5, 'Ada sees Eve arrive');
    assert.deepEqual(
      A.state.room.players.map((p) => p.seat),
      [0, 1, 2, 3, 0],
      'hands fill one player each, then pair up',
    );
    assert.equal(A.state.room.maxPlayers, 8, 'four hands hold eight people');
    A.send({ type: 'lobby:kick', id: E.you.id });
    await A.waitFor((s) => s.room.players.length === 4, 'Eve removed');
    E.close();

    A.send({ type: 'lobby:start' });
    await lockAll(four);
    assert.equal(A.state.game.teams, true);
    assert.deepEqual(
      four.map((c) => c.state.game.seats[c.you.seat].cards.length).sort(),
      [6, 6, 7, 7],
      'deal split',
    );
    // Ascending order was enforced server-side by default; also try a bad order.
    // (Everyone is locked already, so this must be rejected.)
    assert.match(await A.expectError({ type: 'arrange:lock', order: [] }, 'double lock'), /arranging|locked/);

    await playTurns(four, 6);
    const before = four[0].state.game;
    assert.equal(before.phase, 'play');

    // Reconnect mid-game with the token: same seat, same private knowledge.
    const bSeat = B.you.seat;
    const bToken = B.you.token;
    const bKnown = B.state.game.seats.flatMap((s, si) => s.cards.map((c, ci) => (c.shown ? `${si}:${ci}:${c.rank}` : null))).filter(Boolean);
    B.close();
    await A.waitFor((s) => s.room.players.find((p) => p.seat === bSeat).connected === false, 'B offline');
    const B2 = new Client('B2');
    await B2.connect();
    B2.send({ type: 'join', code, token: bToken });
    await B2.waitFor((s) => s.game && s.you.seat === bSeat, 'B rejoined');
    const bKnown2 = B2.state.game.seats.flatMap((s, si) => s.cards.map((c, ci) => (c.shown ? `${si}:${ci}:${c.rank}` : null))).filter(Boolean);
    assert.deepEqual(bKnown2, bKnown, 'partner-shown cards survive a reconnect');
    four[1] = B2;

    // Play the round out: the first team to flip every opposing card wins.
    const res = await playToEnd(four);
    assert.equal(res.winners.length, 2, 'a whole team wins');
    assert.equal(res.winners[0] % 2, res.winners[1] % 2, 'winners are partners');
    assert.deepEqual(res.losers, [0, 1, 2, 3].filter((s) => !res.winners.includes(s)), 'the other team loses');
    assert.ok(four.every((c) => c.state.game.seats.every((s) => s.cards.every((x) => x.faceUp && x.rank))), 'all cards public after round');
    // Nothing can be guessed once the round is over.
    assert.match(await A.expectError({ type: 'guess', target: { seat: 1, idx: 0 }, rank: 1 }, 'guess after end'), /not in progress/);

    // New round, same room.
    A.send({ type: 'newRound' });
    await lockAll(four);
    assert.equal(A.state.room.round, 2);
    await playTurns(four, 3);
    const res2 = await playToEnd(four);
    assert.equal(res2.winners.length, 2, 'a whole team wins round 2');
    const wins = Object.values(A.state.tally).map((t) => t.wins);
    assert.equal(wins.reduce((a, b) => a + b, 0), 4, 'two team wins → four player-wins tallied');

    for (const c of four) c.close();

    // ---------------- 3 players, solo ----------------
    const P = new Client('P');
    await P.connect();
    P.send({ type: 'create', name: 'Pat' });
    await P.waitFor((s) => s.room);
    const code3 = P.state.room.code;
    P.send({ type: 'lobby:seats', seats: 3 });
    await P.waitFor((s) => s.room.seats === 3);
    const Q = new Client('Q');
    const R = new Client('R');
    for (const [c, name] of [[Q, 'Quinn'], [R, 'Rae']]) {
      await c.connect();
      c.send({ type: 'join', code: code3, name });
      await c.waitFor((s) => s.room);
    }
    const three = [P, Q, R];
    await P.waitFor((s) => s.room.players.length === 3);
    // Host fixes hand sizes and who leads.
    P.send({ type: 'lobby:deal', custom: true });
    await P.waitFor((s) => s.room.customDeal && s.room.hands && s.room.hands.length === 3);
    P.send({ type: 'lobby:handSize', seat: 0, size: 12 });
    P.send({ type: 'lobby:handSize', seat: 1, size: 8 });
    P.send({ type: 'lobby:handSize', seat: 2, size: 5 });
    await P.waitFor((s) => s.room.hands.join() === '12,8,5', 'hand sizes');
    assert.match(await P.expectError({ type: 'lobby:start' }, 'bad total'), /26 \(currently 25\)/);
    P.send({ type: 'lobby:handSize', seat: 2, size: 6 });
    P.send({ type: 'lobby:first', seat: 2 });
    await P.waitFor((s) => s.room.firstSeat === 2);
    P.send({ type: 'lobby:start' });
    await lockAll(three);
    assert.equal(P.state.game.turn, 2, 'chosen hand leads');
    assert.deepEqual(P.state.game.seats.map((x) => x.cards.length), [12, 8, 6], 'custom hand sizes');
    assert.equal(P.state.game.teams, false);
    assert.equal(P.state.game.step, 'guess', 'solo mode has no show step');
    // Nobody can show in solo mode.
    assert.match(await Q.expectError({ type: 'show', idx: 0 }, 'show in solo'), /showing/);
    await playTurns(three, 5);
    const res3 = await playToEnd(three);
    assert.equal(res3.winners.length, 1, 'solo mode has a single winner');
    assert.equal(res3.losers.length, 2, 'the other two lose');
    assert.deepEqual([...res3.winners, ...res3.losers].sort(), [0, 1, 2]);

    // Rejoin by name after the round (no token), then back to lobby.
    R.close();
    const R2 = new Client('R2');
    await R2.connect();
    R2.send({ type: 'join', code: code3, name: 'rae' });
    await R2.waitFor((s) => s.game && s.you.name === 'Rae', 'rejoin by name');
    P.send({ type: 'toLobby' });
    await P.waitFor((s) => !s.game && s.room.players.length === 3, 'back to lobby');

    for (const c of [P, Q, R2]) c.close();

    // ---------------- one player, three bots ----------------
    // A table nobody else turned up to. The house takes the empty hands, plays
    // them off the same view of the table a person in that chair would get,
    // and hands them back the moment somebody arrives to want one.
    const H = new Client('H');
    await H.connect();
    H.send({ type: 'create', name: 'Lonely' });
    await H.waitFor((s) => s.room);
    const botCode = H.state.room.code;
    assert.deepEqual(H.state.room.freeSeats, [1, 2, 3], 'three hands are going begging');

    for (let i = 0; i < 3; i++) H.send({ type: 'lobby:bot' });
    await H.waitFor((s) => s.room.players.length === 4, 'the house sits down');
    const botsOf = (c) => c.state.room.players.filter((p) => p.bot);
    assert.equal(botsOf(H).length, 3, 'three bots');
    assert.deepEqual(H.state.room.players.map((p) => p.seat).sort(), [0, 1, 2, 3], 'a hand each');
    assert.equal(new Set(H.state.room.players.map((p) => p.name)).size, 4, 'no two players share a name');
    assert.deepEqual(H.state.room.freeSeats, [], 'the table is full');
    assert.match(await H.expectError({ type: 'lobby:bot' }, 'a fifth bot'), /already/);

    // A person arriving takes a hand off the house rather than being turned away.
    const H2 = new Client('H2');
    await H2.connect();
    H2.send({ type: 'join', code: botCode, name: 'Company' });
    await H2.waitFor((s) => s.room.players.length === 4, 'company seated');
    await H.waitFor((s) => s.room.players.filter((p) => p.bot).length === 2, 'a bot gives up its hand');
    assert.deepEqual(
      H.state.room.players.filter((p) => !p.bot).map((p) => p.seat),
      [0, 1],
      'the people take the first hands',
    );
    assert.match(
      await H.expectError({ type: 'lobby:swap', a: H.you.id, b: botsOf(H)[0].id }, 'swapping a bot'),
      /dealt into/,
    );
    // The host can send one home, and deal another in.
    H.send({ type: 'lobby:kick', id: botsOf(H)[0].id });
    await H.waitFor((s) => s.room.players.length === 3, 'a bot sent home');
    H.send({ type: 'lobby:bot', seat: 3 });
    await H.waitFor((s) => s.room.players.length === 4, 'and another dealt in');

    // Fewer hands than there are bodies at the table: the people keep theirs
    // and the house gives up whatever is left over.
    H.send({ type: 'lobby:seats', seats: 3 });
    await H.waitFor((s) => s.room.seats === 3, 'three hands');
    assert.equal(H.state.room.players.length, 3, 'a bot gives its hand up to make the table fit');
    assert.equal(H.state.room.players.filter((p) => p.bot).length, 1, 'two people and one bot');
    assert.deepEqual(H.state.room.players.map((p) => p.seat).sort(), [0, 1, 2], 'and everyone left has a hand each');
    H.send({ type: 'lobby:seats', seats: 4 });
    H.send({ type: 'lobby:bot' });
    await H.waitFor((s) => s.room.seats === 4 && s.room.players.length === 4, 'back to four hands');

    assert.match(await H2.expectError({ type: 'lobby:botLevel', level: 'ruthless' }, 'non-host level'), /host/);
    assert.match(await H.expectError({ type: 'lobby:botLevel', level: 'cheating' }, 'bad level'), /how hard/);
    H.send({ type: 'lobby:botLevel', level: 'ruthless' });
    await H.waitFor((s) => s.room.botLevel === 'ruthless', 'the house plays it straight');

    H.send({ type: 'lobby:start' });
    for (const c of [H, H2]) {
      await c.waitFor((s) => s.game && s.game.phase === 'arrange', 'arrange phase');
      c.send({ type: 'arrange:lock', order: c.state.game.seats[c.you.seat].cards.map((x) => x.id) });
    }
    // The bots arrange their own hands, in their own time.
    await H.waitFor((s) => s.game.phase === 'play', 'the bots lock in too', 12000);
    assert.ok(
      H.state.game.seats.every((x) => x.locked),
      'every hand is locked in',
    );

    // Play the round out. Neither person can see a bot's cards, so both guess
    // as dully as the table allows and leave the work to the house.
    const seenGuessing = new Set();
    await missUntilOver([H, H2], seenGuessing);
    assert.equal(H.state.game.phase, 'ended', 'the bots played the round out');
    assert.ok(seenGuessing.size >= 2, 'both bots took turns');
    // The round goes to the last hand still holding anything, so missing every
    // guess on purpose is no bar to winning it — what matters is that the
    // house did the work and that the winner is tallied either way.
    const botSeats = new Set(H.state.room.players.filter((p) => p.bot).map((p) => p.seat));
    assert.ok(
      H.state.game.log.some((e) => e.event?.type === 'guess' && e.event.correct && botSeats.has(e.event.by)),
      'the house turned cards over',
    );
    const winner = H.state.room.players.find((p) => H.state.game.result.winners.includes(p.seat));
    assert.ok(winner, 'somebody took the round');
    assert.equal(H.state.tally[winner.id].wins, 1, 'and a bot is tallied like anybody else');
    // Nothing a bot was holding leaked to a person while it was hidden: every
    // snapshot either client saw has already been checked for that.

    // ---------------- a bot for a partner ----------------
    // Partnerships with the house: the bot opposite shows you a card at the
    // start of your turn, and asks you for one at the start of its own.
    H.send({ type: 'toLobby' });
    await H.waitFor((s) => !s.game, 'back to the lobby');
    H.send({ type: 'lobby:kick', id: H2.you.id });
    await H2.waitFor((s) => !s.room, 'company sent home').catch(() => {});
    await H.waitFor((s) => s.room.players.filter((p) => !p.bot).length === 1, 'on our own again');
    H.send({ type: 'lobby:bot' });
    H.send({ type: 'lobby:teams', teams: true });
    H.send({ type: 'lobby:first', seat: 0 });
    await H.waitFor((s) => s.room.teams && s.room.players.length === 4 && s.room.firstSeat === 0, 'partnerships set');
    assert.equal(H.you.seat, 0, 'we lead');

    H.send({ type: 'lobby:start' });
    await H.waitFor((s) => s.game && s.game.phase === 'arrange', 'arrange phase');
    H.send({ type: 'arrange:lock', order: H.state.game.seats[0].cards.map((x) => x.id) });
    await H.waitFor((s) => s.game.phase === 'play', 'the bots lock in', 12000);
    assert.equal(H.state.game.teams, true, 'partnerships are on');
    assert.equal(H.state.game.partnerSeat, 2, 'the hand opposite is ours');

    // Our partner is a bot, and it shows us a card off its own bat.
    await H.waitFor((s) => s.game.step === 'guess' && s.game.turn === 0, 'the bot shows us a card', 12000);
    const shownByBot = H.state.game.seats[2].cards.filter((c) => c.shown);
    assert.equal(shownByBot.length, 1, 'the bot showed exactly one card');
    assert.ok(shownByBot[0].rank, 'and we can see its rank');
    assert.ok(
      H.state.game.seats[1].cards.every((c) => c.faceUp || c.rank === null),
      'the other side is still hidden from us',
    );

    // Miss on purpose and let the partnership play itself out. Whenever the
    // hand we are partnered with is up, the table waits on us for the show,
    // and takes "nothing" for an answer.
    const skipped = new Set();
    await missUntilOver([H], new Set(), skipped);
    assert.ok(skipped.size > 0, 'the bot waited on us for the show at least once');
    assert.equal(H.state.game.phase, 'ended', 'the partnership round finished');
    assert.equal(H.state.game.result.winners.length, 2, 'a whole team wins');

    // The house does not play on to an empty room: once the last person walks
    // out, the bots clear the table with them.
    H.send({ type: 'leave' });
    await new Promise((r) => setTimeout(r, 200));
    const after = new Client('H-x');
    await after.connect();
    after.send({ type: 'join', code: botCode, name: 'Nobody' });
    await after.waitFor((s) => s.room, 'the room is still there');
    assert.deepEqual(after.state.room.players.map((p) => p.name), ['Nobody'], 'nothing was left sitting at it');
    after.send({ type: 'leave' });
    after.close();
    for (const c of [H, H2]) c.close();

    // ---------------- six players, four hands, two of them shared ----------------
    const big = [];
    const S0 = new Client('S0');
    await S0.connect();
    S0.send({ type: 'create', name: 'Sharer0' });
    await S0.waitFor((s) => s.room);
    const sharedCode = S0.state.room.code;
    big.push(S0);
    for (let i = 1; i < 6; i++) {
      const c = new Client(`S${i}`);
      await c.connect();
      c.send({ type: 'join', code: sharedCode, name: `Sharer${i}` });
      await c.waitFor((s) => s.room);
      big.push(c);
    }
    await S0.waitFor((s) => s.room.players.length === 6, 'six seated');
    assert.deepEqual(
      S0.state.room.players.map((p) => p.seat),
      [0, 1, 2, 3, 0, 1],
      'players five and six share hands one and two',
    );
    // Three hands still hold these six, and then the room is full.
    S0.send({ type: 'lobby:seats', seats: 3 });
    await S0.waitFor((s) => s.room.seats === 3, 'three hands');
    assert.deepEqual(S0.state.room.players.map((p) => p.seat), [0, 1, 2, 0, 1, 2], 'six across three hands');
    assert.equal(S0.state.room.maxPlayers, 6, 'three hands hold six people');
    const gate = new Client('S-x');
    await gate.connect();
    assert.match(await gate.expectError({ type: 'join', code: sharedCode, name: 'Gatecrasher' }, 'full'), /full/);
    gate.close();
    S0.send({ type: 'lobby:seats', seats: 4 });
    await S0.waitFor((s) => s.room.seats === 4, 'back to four hands');

    // Lead with a shared hand, so the pair are up first.
    S0.send({ type: 'lobby:first', seat: 0 });
    await S0.waitFor((s) => s.room.firstSeat === 0);
    S0.send({ type: 'lobby:start' });
    await S0.waitFor((s) => s.game && s.game.phase === 'arrange', 'arrange phase');
    // Two players at one hand hold the very same cards, and the hand is
    // arranged once: the first of the pair to lock it in settles it for both.
    await big[4].waitFor((s) => s.game && s.game.phase === 'arrange', 'arrange phase');
    assert.deepEqual(
      big[4].state.game.seats[0].cards.map((c) => c.id),
      big[0].state.game.seats[0].cards.map((c) => c.id),
      'partners at a hand see the same cards',
    );
    S0.send({ type: 'arrange:lock', order: S0.state.game.seats[0].cards.map((c) => c.id) });
    await S0.waitFor((s) => s.game.seats[0].locked, 'the first hand is locked in');
    assert.match(
      await big[4].expectError({ type: 'arrange:lock', order: big[4].state.game.seats[0].cards.map((c) => c.id) }, 'second lock'),
      /already locked/,
    );
    await lockAll(big.filter((c) => c.you.seat !== 0));
    for (const c of big) await c.waitFor((s) => s.game.phase === 'play', 'play phase');
    const gs = S0.state.game;
    assert.equal(gs.numSeats, 4, 'four hands in play');
    assert.equal(gs.seats.reduce((a, x) => a + x.cards.length, 0), 26, 'all 26 cards dealt');
    assert.equal(gs.names[0], 'Sharer0 & Sharer4', 'a shared hand is named after both players');
    assert.equal(gs.names[2], 'Sharer2', 'a hand played alone keeps one name');
    assert.equal(gs.teams, false, 'sharing a hand is not the partnership game');
    assert.equal(gs.step, 'guess', 'no show step outside partnerships');
    // Either player at a hand may take its turn, so let the one who joined
    // second make the opening guess.
    assert.equal(gs.turn, 0, 'the shared hand leads');
    const second = big[4];
    await second.waitFor((s) => s.game.step === 'guess' && s.game.turn === 0, 'the pair are up');
    const sIdx = faceDown(second.state.game, 1)[0];
    second.send({ type: 'guess', target: { seat: 1, idx: sIdx }, rank: trueRank(big, 1, sIdx) });
    await S0.waitFor((s) => s.game.seats[1].cards[sIdx].faceUp, 'the second player at a hand can guess for it');

    await playTurns(big, 6);
    const resShared = await playToEnd(big);
    assert.equal(resShared.winners.length, 1, 'one hand wins');
    assert.equal(resShared.losers.length, 3, 'the other three lose');
    // A shared win counts for both of the people who played the hand.
    const wonSeat = resShared.winners[0];
    const wonIds = S0.state.room.players.filter((p) => p.seat === wonSeat).map((p) => p.id);
    for (const id of wonIds) assert.equal(S0.state.tally[id].wins, 1, 'everyone at the winning hand is credited');
    for (const c of big) c.close();

    // ---------------- eight players: partnerships, every hand shared ----------------
    const eight = [];
    const P0 = new Client('P0');
    await P0.connect();
    P0.send({ type: 'create', name: 'Pair0' });
    await P0.waitFor((s) => s.room);
    const eightCode = P0.state.room.code;
    eight.push(P0);
    for (let i = 1; i < 8; i++) {
      const c = new Client(`P${i}`);
      await c.connect();
      c.send({ type: 'join', code: eightCode, name: `Pair${i}` });
      await c.waitFor((s) => s.room);
      eight.push(c);
    }
    await P0.waitFor((s) => s.room.players.length === 8, 'eight seated');
    assert.deepEqual(
      P0.state.room.players.map((p) => p.seat),
      [0, 1, 2, 3, 0, 1, 2, 3],
      'eight players fill four hands two apiece',
    );
    const ninth = new Client('P-x');
    await ninth.connect();
    assert.match(await ninth.expectError({ type: 'join', code: eightCode, name: 'Latecomer' }, 'full'), /full/);
    ninth.close();

    P0.send({ type: 'lobby:teams', teams: true });
    await P0.waitFor((s) => s.room.teams === true);
    P0.send({ type: 'lobby:first', seat: 0 });
    await P0.waitFor((s) => s.room.firstSeat === 0);
    P0.send({ type: 'lobby:start' });
    await P0.waitFor((s) => s.game && s.game.phase === 'arrange', 'arrange phase');
    await lockAll(eight);
    const ge = P0.state.game;
    assert.equal(ge.teams, true, 'partnerships still run at a table of shared hands');
    assert.equal(ge.names[0], 'Pair0 & Pair4', 'hands are named after both players');
    assert.equal(ge.step, 'show', 'a partnership round opens with the show');
    assert.equal(ge.turn, 0, 'the chosen hand leads');

    // The partner hand is hand 3, played by Pair2 and Pair6: either of them can
    // show, and both players of the active hand learn what was shown.
    const shower = eight[6];
    await shower.waitFor((s) => s.game.step === 'show' && s.game.turn === 0, 'the show');
    const shownIdx = faceDown(shower.state.game, 2)[0];
    shower.send({ type: 'show', idx: shownIdx });
    for (const c of [eight[0], eight[4]]) {
      await c.waitFor((s) => s.game.seats[2].cards[shownIdx].shown, 'both players of a hand are shown the card');
      assert.ok(c.state.game.seats[2].cards[shownIdx].rank, 'a shown card arrives with its rank');
    }
    // The other team is told nothing.
    for (const c of [eight[1], eight[5]]) {
      assert.equal(c.state.game.seats[2].cards[shownIdx].rank, null, 'the show leaked across the table');
    }

    await playTurns(eight, 6);
    const resEight = await playToEnd(eight);
    assert.equal(resEight.winners.length, 2, 'a whole team of two hands wins');
    assert.equal(resEight.winners[0] % 2, resEight.winners[1] % 2, 'the winning hands are partners');
    // Four people played the winning team's two hands; all four are credited.
    const creditedEight = P0.state.room.players.filter((p) => resEight.winners.includes(p.seat));
    assert.equal(creditedEight.length, 4, 'four people to a winning partnership');
    for (const p of creditedEight) assert.equal(P0.state.tally[p.id].wins, 1, 'every winner is tallied');
    for (const c of eight) c.close();

    // ---------------- a name with a mark in front of it ----------------
    // "/" sets the advertisements on everybody else; "#" does the same but
    // spares nobody. Either way the mark is stripped off the name, and a
    // client is only ever told whether the ads are coming for it.
    const M0 = new Client('M0');
    await M0.connect();
    M0.send({ type: 'create', name: 'Straight' });
    await M0.waitFor((s) => s.room);
    const markCode = M0.state.room.code;
    assert.equal(M0.you.prank, false, 'an unmarked room advertises at nobody');

    const M1 = new Client('M1');
    await M1.connect();
    M1.send({ type: 'join', code: markCode, name: '/Trigger' });
    await M1.waitFor((s) => s.room.players.length === 2, 'the trigger is seated');
    assert.equal(M1.you.name, 'Trigger', 'the mark is stripped off the name');
    assert.ok(
      M0.state.room.players.every((p) => !/^[/#]/.test(p.name)),
      'no mark reaches the rest of the table',
    );
    await M0.waitFor((s) => s.you.prank === true, 'the room starts getting the ads');
    assert.equal(M1.you.prank, false, 'the one who started it is spared');

    // A refresh sends the saved token and the stripped name back; that must not
    // quietly call the whole thing off.
    const triggerToken = M1.you.token;
    M1.close();
    const M1b = new Client('M1b');
    await M1b.connect();
    M1b.send({ type: 'join', code: markCode, name: 'Trigger', token: triggerToken });
    await M1b.waitFor((s) => s.you.name === 'Trigger', 'the trigger is back');
    assert.equal(M1b.you.prank, false, 'a refresh leaves the mark where it was');
    assert.equal(M0.state.you.prank, true, 'and leaves everyone else where they were');

    // "#" asks for them too.
    const M2 = new Client('M2');
    await M2.connect();
    M2.send({ type: 'join', code: markCode, name: '#Willing' });
    await M2.waitFor((s) => s.room.players.length === 3, 'the willing one is seated');
    assert.equal(M2.you.name, 'Willing', 'the hash is stripped off as well');
    assert.equal(M2.you.prank, true, 'a hash takes the ads as well as handing them out');

    // A second "/" spares that player too; everyone unmarked still gets them.
    const M3 = new Client('M3');
    await M3.connect();
    M3.send({ type: 'join', code: markCode, name: '/Quiet' });
    await M3.waitFor((s) => s.room.players.length === 4, 'the second trigger is seated');
    assert.equal(M3.you.prank, false, 'neither of two triggers gets the ads');
    assert.equal(M1b.state.you.prank, false, 'and nor does the first');
    await M0.waitFor((s) => s.you.prank === true, 'everyone else still gets them');

    // Stripped names still have to be unique.
    const M4 = new Client('M4');
    await M4.connect();
    assert.match(await M4.expectError({ type: 'join', code: markCode, name: '/Straight' }, 'duplicate'), /already has that name/);
    M4.close();

    // Once the marked players have gone, so have the ads.
    for (const id of M0.state.room.players.filter((p) => p.id !== M0.you.id).map((p) => p.id)) {
      M0.send({ type: 'lobby:kick', id });
    }
    await M0.waitFor((s) => s.room.players.length === 1 && s.you.prank === false, 'the ads stop');
    for (const c of [M1b, M2, M3, M0]) c.close();

    // ---------------- test mode: one browser drives four seats ----------------
    const T = new Client('T');
    await T.connect();
    T.send({ type: 'create', name: 'Test67' });
    await T.waitFor((s) => s.game && s.room.test, 'test room');
    assert.deepEqual(
      T.state.room.players.map((p) => `${p.seat}:${p.name}`),
      ['0:Test67', '1:Test67-2', '2:Test67-3', '3:Test67-4'],
      'four seats filled in order',
    );
    assert.equal(T.you.seat, 0, 'tester starts in seat 1');
    assert.equal(T.state.game.phase, 'arrange', 'game starts immediately');
    assert.ok(T.state.room.players.every((p) => p.connected), 'all seats count as connected');
    assert.match(await T.expectError({ type: 'test:switch', seat: 9 }, 'bad seat'), /seat/);
    // Lock in from every seat by switching to it; only that seat's cards carry ids.
    for (let seat = 0; seat < 4; seat++) {
      T.send({ type: 'test:switch', seat });
      await T.waitFor((s) => s.you.seat === seat, `switch to seat ${seat}`);
      assert.equal(T.state.room.hostId, T.you.id, 'controlled seat acts as host');
      T.send({ type: 'arrange:lock', order: T.state.game.seats[seat].cards.map((c) => c.id) });
      await T.waitFor((s) => s.game.seats[seat].locked, `seat ${seat} locked`);
    }
    await T.waitFor((s) => s.game.phase === 'play', 'test game in play');
    // Act as whoever's turn it is and make a correct guess.
    const turn = T.state.game.turn;
    T.send({ type: 'test:switch', seat: turn });
    await T.waitFor((s) => s.you.seat === turn, 'switch to active seat');
    const targetSeat = (turn + 1) % 4;
    const targetIdx = faceDown(T.state.game, targetSeat)[0];
    T.send({ type: 'test:switch', seat: targetSeat });
    await T.waitFor((s) => s.you.seat === targetSeat, 'peek at the target seat');
    const real = T.state.game.seats[targetSeat].cards[targetIdx].rank;
    T.send({ type: 'test:switch', seat: turn });
    await T.waitFor((s) => s.you.seat === turn, 'back to the active seat');
    T.send({ type: 'guess', target: { seat: targetSeat, idx: targetIdx }, rank: real });
    await T.waitFor((s) => s.game.seats[targetSeat].cards[targetIdx].faceUp, 'guess from a switched seat lands');
    // Leaving a test room deletes it.
    const testCode = T.state.room.code;
    T.send({ type: 'leave' });
    await new Promise((r) => setTimeout(r, 150)); // leave is processed with no reply
    const T2 = new Client('T2');
    await T2.connect();
    assert.match(await T2.expectError({ type: 'join', code: testCode, name: 'Test67-2' }, 'test room gone'), /not found/);
    T.close();
    T2.close();

    console.log(`OK — ${snapshotsChecked} snapshots checked for leaks`);
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

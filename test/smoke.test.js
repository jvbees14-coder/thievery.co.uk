// End-to-end smoke test: boots the real server, drives real WebSocket clients
// through complete games, and checks that hidden information never leaks.
//
//   npm test

import { spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3999 + Math.floor(Math.random() * 500);

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    child.stdout.on('data', (d) => {
      if (String(d).includes('running')) resolve(child);
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
  waitFor(pred, what = 'state', ms = 4000) {
    if (this.state && pred(this.state)) return Promise.resolve(this.state);
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

async function lockAll(clients) {
  for (const c of clients) {
    await c.waitFor((s) => s.game && s.game.phase === 'arrange', 'arrange phase');
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
    // A fifth player can't join a full room.
    const E = new Client('E');
    await E.connect();
    assert.match(await E.expectError({ type: 'join', code, name: 'Eve' }, 'full room'), /full/);
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
    P.send({ type: 'lobby:mode', mode: 3 });
    await P.waitFor((s) => s.room.mode === 3);
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
    await P.waitFor((s) => s.room.customDeal && s.room.players.every((p) => p.handSize));
    const ids = P.state.room.players.map((p) => p.id);
    P.send({ type: 'lobby:handSize', id: ids[0], size: 12 });
    P.send({ type: 'lobby:handSize', id: ids[1], size: 8 });
    P.send({ type: 'lobby:handSize', id: ids[2], size: 5 });
    await P.waitFor((s) => s.room.players.map((p) => p.handSize).join() === '12,8,5', 'hand sizes');
    assert.match(await P.expectError({ type: 'lobby:start' }, 'bad total'), /26 \(currently 25\)/);
    P.send({ type: 'lobby:handSize', id: ids[2], size: 6 });
    P.send({ type: 'lobby:first', id: ids[2] });
    await P.waitFor((s) => s.room.firstPlayer === ids[2]);
    P.send({ type: 'lobby:start' });
    await lockAll(three);
    assert.equal(P.state.game.turn, 2, 'chosen player leads');
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
    console.log(`OK — ${snapshotsChecked} snapshots checked for leaks`);
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// The house players.
//
// A table can be filled out with bots, so one or two people can sit down to a
// three- or four-handed game. A bot is a player like any other: it holds a
// hand, arranges it, takes its turn, and is only ever handed the same view of
// the table as a person in its seat would be. Everything below works from
// `Game.viewFor(...)` and nothing else, so a bot cannot see a rank it has not
// earned.
//
// Three levels of nerve:
//
//   Novice    knows the rule and nothing more. It picks a card that caught its
//             eye, works out what the cards either side of it allow, and takes
//             one of those at random.
//   Sharp     shops around. It works the same fence out for every card on the
//             table and plays the narrowest one it can find, on the best rank
//             that fence leaves.
//   Ruthless  reads the whole table at once. Every row is in ascending order
//             with the aces wild, every colour is on show and all 26 cards are
//             accounted for, which is enough to work out the odds on every
//             hidden card at the table — see `handMarginals` below.
//
// The thinking is cheap (single-figure milliseconds); the pause before a bot
// plays is manners, not arithmetic, and is set by the room server.
// ---------------------------------------------------------------------------

export const BOT_LEVELS = ['novice', 'sharp', 'ruthless'];
export const BOT_LEVEL_LABEL = { novice: 'Novice', sharp: 'Sharp', ruthless: 'Ruthless' };
export const DEFAULT_BOT_LEVEL = 'sharp';

// Thieves' cant, so a bot never reads as one of the house aliases.
const BOT_NAMES = [
  'Cutpurse', 'Peterman', 'Cracksman', 'Dipper', 'Bagman', 'Snakesman', 'Tosher', 'Shill',
  'Grifter', 'Fingers', 'Magpie', 'Nightjar', 'Sneak', 'Rook', 'Whisper', 'Lockjaw',
  'Bluecoat', 'Sharper', 'Dodger', 'Prigger', 'Mudlark', 'Hoister',
];

// A name nobody at the table is using already.
export function botName(taken) {
  const free = BOT_NAMES.filter((n) => !taken.has(n.toLowerCase()));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  const base = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

// --- the deck, as the arithmetic sees it -----------------------------------
//
// A card is one number: colour (red 0, black 1) times fourteen, plus its rank.
// There is exactly one of each, which is the whole basis of the deduction.

const RED = 0;
const BLACK = 1;
const CARDS = 28; // 2 colours x ranks 0..13, with 0 unused
const card = (color, rank) => color * 14 + rank;
const colorIdx = (c) => (c === 'red' ? RED : BLACK);

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];
const tick = () => new Promise((r) => setImmediate(r));

// --- reading the table -----------------------------------------------------
//
// What a seat can see: its own hand, everything face up, and anything a
// partner has shown it. Everything else is a slot of a known colour holding
// one of the cards nobody has placed yet.

function readTable(view, me) {
  const hands = [];
  const placed = new Set();
  // Every guess that has already missed. Said out loud, so it is everybody's.
  const missed = new Map();
  for (const [seat, idx, rank] of view.misses || []) {
    const key = `${seat}:${idx}`;
    let no = missed.get(key);
    if (!no) missed.set(key, (no = new Uint8Array(14)));
    no[rank] = 1;
  }
  for (let si = 0; si < view.numSeats; si++) {
    const slots = view.seats[si].cards.map((c, idx) => ({
      color: colorIdx(c.color),
      rank: c.rank ?? null, // null means: this seat does not know
      faceUp: c.faceUp,
      no: missed.get(`${si}:${idx}`) || null,
    }));
    for (const s of slots) if (s.rank !== null) placed.add(card(s.color, s.rank));
    hands.push({ seat: si, slots, team: view.seats[si].team, free: slots.filter((s) => s.rank === null).length });
  }
  // Everything nobody has been seen holding.
  const pool = [];
  for (const color of [RED, BLACK]) {
    for (let r = 1; r <= 13; r++) if (!placed.has(card(color, r))) pool.push(card(color, r));
  }
  return { hands, placed, pool, me, myTeam: view.seats[me].team };
}

const isOpponent = (t, si) => si !== t.me && t.hands[si].team !== t.myTeam;

// --- one hand's odds -------------------------------------------------------
//
// A hand is a row of slots. The colour of every slot is public and some of the
// ranks are known; the rest come from a pool of cards, each carrying a weight
// (0 meaning "not available"). The rules say the row is ascending with the
// aces wild, which is enough to count every way the row could be filled.
//
// The count is a walk left to right. All that matters about what has been laid
// down so far is: the rank of the last non-ace (nothing may come below it),
// whether the red and the black card of that rank are already spent, and
// whether each ace has been used. That is 14 x 2 x 2 x 2 x 2 states, packed
// into one integer.
//
//   bits 4+ : rank of the last non-ace, 0 for none yet
//   bit 3   : the red card of that rank is used
//   bit 2   : the black card of that rank is used
//   bit 1   : the red ace is used
//   bit 0   : the black ace is used
//
// Counting forwards to each slot and backwards from it gives, for every slot
// and every rank, the number of complete rows that put that rank there — which
// is the probability the table would put on it.

const NS = 224;

function step(s, c, r) {
  if (r === 1) {
    // An ace is wild in position, so it leaves the ascending run alone.
    const bit = c === RED ? 2 : 1;
    return s & bit ? -1 : s | bit;
  }
  const m = s >> 4;
  if (r < m) return -1; // that would break the ascending row
  const used = c === RED ? 8 : 4;
  if (r === m) return s & used ? -1 : s | used; // the other colour of the same rank
  return (r << 4) | used | (s & 3);
}

function rescale(v) {
  let max = 0;
  for (let i = 0; i < NS; i++) if (v[i] > max) max = v[i];
  if (max > 0 && (max > 1e120 || max < 1e-120)) for (let i = 0; i < NS; i++) v[i] /= max;
  return max;
}

// Odds for every free slot in one hand, given what the pool has to offer.
// Returns an array the length of the hand: a 14-long distribution over ranks
// for each free slot, null for a slot whose rank is already known. A hand that
// cannot be filled at all comes back as null.
function handMarginals(slots, w) {
  const n = slots.length;
  const back = new Array(n + 1);
  back[n] = new Float64Array(NS).fill(1);
  for (let i = n - 1; i >= 0; i--) {
    const cur = new Float64Array(NS);
    const nxt = back[i + 1];
    const { color: c, rank, no } = slots[i];
    const lo = rank === null ? 1 : rank;
    const hi = rank === null ? 13 : rank;
    for (let s = 0; s < NS; s++) {
      let sum = 0;
      for (let r = lo; r <= hi; r++) {
        if (no && no[r]) continue;
        const wt = rank === null ? w[card(c, r)] : 1;
        if (wt <= 0) continue;
        const ns = step(s, c, r);
        if (ns >= 0) sum += wt * nxt[ns];
      }
      cur[s] = sum;
    }
    rescale(cur);
    back[i] = cur;
  }
  if (back[0][0] <= 0) return null; // nothing fits this row

  const out = new Array(n).fill(null);
  let fwd = new Float64Array(NS);
  fwd[0] = 1;
  for (let i = 0; i < n; i++) {
    const nxtF = new Float64Array(NS);
    const { color: c, rank, no } = slots[i];
    const free = rank === null;
    const lo = free ? 1 : rank;
    const hi = free ? 13 : rank;
    const marg = free ? new Float64Array(14) : null;
    const b = back[i + 1];
    for (let s = 0; s < NS; s++) {
      const f = fwd[s];
      if (f === 0) continue;
      for (let r = lo; r <= hi; r++) {
        if (no && no[r]) continue;
        const wt = free ? w[card(c, r)] : 1;
        if (wt <= 0) continue;
        const ns = step(s, c, r);
        if (ns < 0) continue;
        const v = f * wt;
        nxtF[ns] += v;
        if (free) marg[r] += v * b[ns];
      }
    }
    if (free) {
      let total = 0;
      for (let r = 1; r <= 13; r++) total += marg[r];
      if (total > 0) for (let r = 1; r <= 13; r++) marg[r] /= total;
      out[i] = marg;
    }
    rescale(nxtF);
    fwd = nxtF;
  }
  return out;
}

// --- the whole table at once -----------------------------------------------
//
// Each hand can be counted on its own, but they are all drawing on the same
// pool: a card in one row is in nobody else's. Counting every hand, adding up
// how much of each card the table has claimed, and then leaning on the hands
// that are over-claiming settles quickly on a set of odds where every card in
// the pool is accounted for exactly once.

function refineTable(t, { rounds = 40, budgetMs = 60 } = {}) {
  const live = t.hands.filter((h) => h.seat !== t.me && h.free > 0);
  const base = new Float64Array(CARDS);
  for (const x of t.pool) base[x] = 1;
  const w = live.map(() => Float64Array.from(base));
  const marg = live.map(() => null);
  const until = Date.now() + budgetMs;

  for (let round = 0; round < rounds; round++) {
    // How much of each card the table is claiming. A slot's odds are over
    // ranks; the card it would be holding is that rank in the slot's colour.
    const usage = new Float64Array(CARDS);
    for (let h = 0; h < live.length; h++) {
      const m = handMarginals(live[h].slots, w[h]) || handMarginals(live[h].slots, base);
      marg[h] = m;
      if (!m) continue;
      live[h].slots.forEach((slot, i) => {
        const d = m[i];
        if (!d) return;
        for (let r = 1; r <= 13; r++) usage[card(slot.color, r)] += d[r];
      });
    }
    let err = 0;
    for (const x of t.pool) err = Math.max(err, Math.abs(usage[x] - 1));
    if (err < 0.01 || Date.now() > until) break;
    for (const x of t.pool) {
      const claim = usage[x];
      if (claim <= 0) continue;
      // Ease towards the fix rather than jumping at it, so two hands fighting
      // over one card do not swap places every round.
      const f = Math.pow(1 / claim, 0.75);
      for (let h = 0; h < live.length; h++) {
        const v = w[h][x] * f;
        w[h][x] = v > 1e12 ? 1e12 : v < 1e-12 ? 0 : v;
      }
    }
  }

  // Odds per seat, indexed the way the table is.
  const bySeat = new Array(t.hands.length).fill(null);
  live.forEach((h, i) => (bySeat[h.seat] = marg[i]));
  return bySeat;
}

// --- the colours alone -----------------------------------------------------
//
// One card of each rank in each colour, so a rank whose card of that colour
// has already turned up is not coming round again. It is the least anybody at
// the table knows, and what is left when a row says nothing.

function looseOdds(t, slot) {
  const out = new Float64Array(14);
  let n = 0;
  for (let r = 1; r <= 13; r++) {
    if (t.placed.has(card(slot.color, r)) || (slot.no && slot.no[r])) continue;
    out[r] = 1;
    n++;
  }
  if (n) for (let r = 1; r <= 13; r++) out[r] /= n;
  return out;
}

// --- what a sharp player reads ---------------------------------------------
//
// A face-down card is fenced in by the nearest face-up cards either side of
// it: nothing below the one on its left, nothing above the one on its right.
// Aces are wild, so they never form part of a fence and are always possible.

function fencedOdds(t, seat, idx) {
  const slots = t.hands[seat].slots;
  const slot = slots[idx];
  const c = slot.color;
  let lo = 2;
  let hi = 13;
  for (let i = idx - 1; i >= 0; i--) {
    const r = slots[i].rank;
    if (r !== null && r !== 1) {
      lo = r;
      break;
    }
  }
  for (let i = idx + 1; i < slots.length; i++) {
    const r = slots[i].rank;
    if (r !== null && r !== 1) {
      hi = r;
      break;
    }
  }
  const out = new Float64Array(14);
  let n = 0;
  const can = (r) => !t.placed.has(card(c, r)) && !(slot.no && slot.no[r]);
  if (can(1)) {
    out[1] = 1;
    n++;
  }
  for (let r = Math.max(2, lo); r <= hi; r++) {
    if (!can(r)) continue;
    out[r] = 1;
    n++;
  }
  // A fence that rules everything out means the row is telling a story this
  // bot cannot follow; fall back to the colours.
  if (!n) return looseOdds(t, slot);
  for (let r = 1; r <= 13; r++) out[r] /= n;
  return out;
}

// --- taking a turn ---------------------------------------------------------

function targets(t) {
  const out = [];
  t.hands.forEach((h, si) => {
    if (!isOpponent(t, si)) return;
    h.slots.forEach((s, idx) => {
      if (!s.faceUp) out.push({ seat: si, idx, color: s.color });
    });
  });
  return out;
}

// The likeliest rank a set of odds points at, and how likely it is.
function topRank(odds) {
  let rank = 1;
  for (let r = 2; r <= 13; r++) if (odds[r] > odds[rank]) rank = r;
  return { rank, p: odds[rank] };
}

// Every card on offer, rated by what its own row says about it and nothing
// else. This is the whole of what Sharp knows, and where Ruthless turns when
// the table has been read into a corner.
const fenceShots = (t, open) =>
  open.map((o) => ({ seat: o.seat, idx: o.idx, ...topRank(fencedOdds(t, o.seat, o.idx)) }));

// The best card-and-rank on offer, with ties broken by the toss of a coin so
// two bots at one table do not play the same game as each other.
function bestShot(list) {
  let best = -1;
  let winners = [];
  for (const shot of list) {
    if (shot.p > best + 1e-9) {
      best = shot.p;
      winners = [shot];
    } else if (shot.p > best - 1e-9) {
      winners.push(shot);
    }
  }
  return pick(winners);
}

const asMove = (shot) => ({ target: { seat: shot.seat, idx: shot.idx }, rank: shot.rank });

export async function chooseGuess(view, me, level) {
  const t = readTable(view, me);
  const open = targets(t);
  if (!open.length) return null;

  if (level === 'novice') {
    // A card that caught its eye, and any rank the row allows there. It never
    // looks at the next card along to see whether that is the better bet.
    const shot = pick(open);
    const odds = fencedOdds(t, shot.seat, shot.idx);
    const ranks = [];
    for (let r = 1; r <= 13; r++) if (odds[r] > 0) ranks.push(r);
    return { target: { seat: shot.seat, idx: shot.idx }, rank: ranks.length ? pick(ranks) : 1 + rnd(13) };
  }

  if (level === 'sharp') return asMove(bestShot(fenceShots(t, open)));

  await tick();
  const bySeat = refineTable(t);
  const shots = [];
  for (const o of open) {
    const odds = bySeat[o.seat]?.[o.idx];
    if (odds) shots.push({ seat: o.seat, idx: o.idx, ...topRank(odds) });
  }
  // A table that cannot be read at all is one to fall back on the fences for,
  // rather than pass up the turn over.
  return asMove(bestShot(shots.length ? shots : fenceShots(t, open)));
}

// --- arranging the hand ----------------------------------------------------
//
// The row has to be ascending, but the aces go anywhere and two cards of the
// same rank can go either way round. Those choices are the only thing a player
// controls about their own row, and they are what makes the colours on show
// worth reading — or not.

function shuffledRow(cards) {
  const aces = cards.filter((c) => c.rank === 1);
  const rest = cards.filter((c) => c.rank !== 1).sort((a, b) => a.rank - b.rank);
  const row = [];
  for (let i = 0; i < rest.length; ) {
    // Two cards of the same rank may sit either way round.
    let j = i;
    while (j < rest.length && rest[j].rank === rest[i].rank) j++;
    const tie = rest.slice(i, j);
    for (let k = tie.length - 1; k > 0; k--) {
      const q = rnd(k + 1);
      [tie[k], tie[q]] = [tie[q], tie[k]];
    }
    row.push(...tie);
    i = j;
  }
  for (const ace of aces) row.splice(rnd(row.length + 1), 0, ace);
  return row;
}

export async function chooseArrange(view, me, level) {
  const cards = view.seats[me].cards;
  // A novice tidies its hand and thinks no more about it — which leaves the
  // aces sitting at the front of the row, where anyone who has played a couple
  // of rounds will look for them first. The other two hide them.
  if (level === 'novice') return [...cards].sort((a, b) => a.rank - b.rank).map((c) => c.id);
  return shuffledRow(cards).map((c) => c.id);
}

// --- the show (partnership games) ------------------------------------------
//
// Showing costs nothing: only the partner sees it. The card worth showing is
// the one the partner is least likely to work out on their own.

export async function chooseShow(view, me, level) {
  const slots = view.seats[me].cards;
  const down = slots.map((c, i) => (c.faceUp ? -1 : i)).filter((i) => i >= 0);
  if (!down.length) return null;
  if (level === 'novice') return Math.random() < 0.4 ? null : pick(down);

  const t = readTable(view, me);
  if (level === 'sharp') {
    // The widest fence in the row: the card with the least about it on show.
    let best = down[0];
    let width = -1;
    for (const idx of down) {
      const odds = fencedOdds(t, me, idx);
      let n = 0;
      for (let r = 1; r <= 13; r++) if (odds[r] > 0) n++;
      if (n > width) {
        width = n;
        best = idx;
      }
    }
    return best;
  }

  // Ruthless: read this row the way the partner has to — they know their own
  // cards and whatever is face up, and everything else on the table is still
  // anybody's — then give away whichever card that reading is worst at.
  await tick();
  const w = new Float64Array(CARDS);
  for (const color of [RED, BLACK]) for (let r = 1; r <= 13; r++) w[card(color, r)] = 1;
  for (const h of t.hands) for (const s of h.slots) if (s.faceUp) w[card(s.color, s.rank)] = 0;
  // Our own row as the partner sees it: the face-up cards, the colours, and
  // the ranks the table has already ruled out at each place — but not the
  // ranks themselves.
  const asSeen = t.hands[me].slots.map((x) => ({ color: x.color, rank: x.faceUp ? x.rank : null, faceUp: x.faceUp, no: x.no }));
  const marg = handMarginals(asSeen, w);
  if (!marg) return pick(down);
  let best = down[0];
  let worst = Infinity;
  for (const idx of down) {
    const p = marg[idx] ? marg[idx][slots[idx].rank] : 1;
    if (p < worst) {
      worst = p;
      best = idx;
    }
  }
  return best;
}

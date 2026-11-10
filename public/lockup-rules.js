// ---------------------------------------------------------------------------
// Lockup: the rules.
//
// A tower defence where the towers are playing cards. A stack of cards sits
// in the vault at the end of a carpet. Thieves walk in, take one and carry it
// back to the door, and a card is only lost when a thief gets out with it.
// What stands in their way is a hand dealt from one deck of fifty-four: a
// suit says what a card does, its rank how well, and cards laid side by side
// make poker hands that lift every card in them.
//
// This file is the rules and nothing else. It never touches the page, and
// the only randomness that decides anything comes from the seed a game is
// made with, so the same seed deals the same cards and sends the same waves:
// that is the whole of how the daily table works. (Math.random is used once,
// for which way the sparks fly when a thief is stopped.) step() can be run in
// a loop with nothing drawn, which is how the numbers in CFG were arrived at
// and how test/lockup.test.js plays whole games.
//
// It is an ordinary script, not a module, because the page loads it with a
// plain script tag like every other file in public/. What it offers is hung
// on globalThis as LockupRules, for lockup.js in the browser and for the
// suite, which runs this file in a context of its own.
// ---------------------------------------------------------------------------

(() => {
'use strict';

const COLS = 9, ROWS = 12, VAULT_START = 12, LAST_WAVE = 30, DT = 1 / 60;

// Every number that decides how hard the game is, in one place, so they can
// be changed from the console while a headless run plays them out.
const CFG = {
  start: 100, costBase: 16, costRank: 4, joker: 60, hpA: 1, hpB: .15, countBase: 6, countPer: 1.3,
  raise: .3, maxRaise: 3, court: .12, stakes: { low: .75, standard: 1, high: 1.3 }
};

// --- seeded random ---------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// --- rooms -----------------------------------------------------------------
function poly(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
function at(p, d) {
  d = clamp(d, 0, p.len);
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < d) i++;
  const t = (d - p.cum[i - 1]) / (p.cum[i] - p.cum[i - 1] || 1);
  const a = p.pts[i - 1], b = p.pts[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
const MAPS = [
  { id: 'corridor', name: 'The Corridor', wp: [[1.5, -0.6], [1.5, 2.5], [7.5, 2.5], [7.5, 5.5], [1.5, 5.5], [1.5, 8.5], [7.5, 8.5], [7.5, 11.5]] },
  { id: 'spiral', name: 'The Spiral', wp: [[-0.6, 1.5], [7.5, 1.5], [7.5, 10.5], [1.5, 10.5], [1.5, 4.5], [4.5, 4.5], [4.5, 7.5]] }
];
for (const m of MAPS) {
  const wp = m.wp;
  m.main = poly(wp);
  // Cat burglars cut every corner: they run between the midpoints of each stretch.
  m.cat = poly([wp[0], ...wp.slice(1).map((p, i) => [(p[0] + wp[i][0]) / 2, (p[1] + wp[i][1]) / 2]), wp[wp.length - 1]]);
  m.set = new Set();
  for (let i = 1; i < wp.length; i++) {
    const a = wp[i - 1], b = wp[i], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 4);
    for (let k = 0; k <= n; k++) {
      const x = Math.floor(a[0] + (b[0] - a[0]) * k / n), y = Math.floor(a[1] + (b[1] - a[1]) * k / n);
      if (x >= 0 && x < COLS && y >= 0 && y < ROWS) m.set.add(y * COLS + x);
    }
  }
  m.near = new Set();
  for (const k of m.set) {
    const px = k % COLS, py = Math.floor(k / COLS);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = px + dx, y = py + dy;
      if (x >= 0 && x < COLS && y >= 0 && y < ROWS && !m.set.has(y * COLS + x)) m.near.add(y * COLS + x);
    }
  }
  m.vault = wp[wp.length - 1];
  m.door = [clamp(wp[0][0], .5, COLS - .5), clamp(wp[0][1], .22, ROWS - .22)];
}
let M = MAPS[0];
const buildable = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS && !M.set.has(y * COLS + x);

// --- cards -----------------------------------------------------------------
const SUITS = {
  S: { name: 'Spades', glyph: '♠︎', red: false, role: 'Long shot. Names face-down forgers.' },
  C: { name: 'Clubs', glyph: '♣︎', red: false, role: 'Heavy hit up close. Splashes.' },
  H: { name: 'Hearts', glyph: '♥︎', red: true, role: 'Slows every thief in reach.' },
  D: { name: 'Diamonds', glyph: '♦︎', red: true, role: 'Pays extra chips for takedowns in reach.' },
  J: { name: 'Joker', glyph: '★︎', red: true, role: 'Wild in any hand. Shoots like a spade.' }
};
const FACE = {
  11: { name: 'Quick hands', text: 'Acts 35% faster.' },
  12: { name: 'Long sight', text: '20% more reach.' },
  13: { name: 'Court', text: 'Cards touching it gain 12% power.' },
  14: { name: 'Ace high', text: 'Ignores armour and names forgers.' }
};
const RANK_L = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const RANK_W = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
const rankLabel = c => c.s === 'J' ? '★︎' : (RANK_L[c.r] || String(c.r));
const cardName = c => c.s === 'J' ? 'Joker' : `${RANK_W[c.r]} of ${SUITS[c.s].name}`;
const cost = c => c.s === 'J' ? CFG.joker : CFG.costBase + CFG.costRank * c.r;

const ALL52 = [];
for (const s of 'SCHD') for (let r = 2; r <= 14; r++) ALL52.push({ s, r });

// --- poker hands along a line of neighbouring cards ------------------------
const TIER = { pair: 1, twopair: 2, trips: 3, straight: 4, flush: 5, full: 6, quads: 7, sf: 8 };
const HAND_NAME = { pair: 'Pair', twopair: 'Two pair', trips: 'Three of a kind', straight: 'Straight', flush: 'Flush', full: 'Full house', quads: 'Four of a kind', sf: 'Straight flush' };
function handBonus(h, n) {
  switch (h) {
    case 'pair': return { pow: .15, rng: 0 };
    case 'twopair': return { pow: .30, rng: 0 };
    case 'trips': return { pow: .45, rng: 0 };
    case 'straight': return { pow: .10, rng: .20 + .10 * (n - 3) };
    case 'flush': return { pow: .25 + .15 * (n - 3), rng: 0 };
    case 'full': return { pow: .80, rng: 0 };
    case 'quads': return { pow: 1.0, rng: 0 };
    case 'sf': return { pow: .60 + .20 * (n - 3), rng: .30 + .10 * (n - 3) };
  }
  return { pow: 0, rng: 0 };
}
function evalSeg(cards) {
  const n = cards.length;
  const ranks = cards.map(c => c.r).sort((a, b) => a - b);
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const cv = Object.values(counts).sort((a, b) => b - a);
  const flush = n >= 3 && cards.every(c => c.s === cards[0].s);
  let straight = n >= 3 && cv[0] === 1 && ranks[n - 1] - ranks[0] === n - 1;
  if (!straight && n >= 3 && cv[0] === 1 && ranks[n - 1] === 14) {           // ace low
    const low = [1, ...ranks.slice(0, n - 1)];
    straight = low[n - 1] - low[0] === n - 1;
  }
  if (straight && flush) return 'sf';
  if (n === 4 && cv[0] === 4) return 'quads';
  if (n === 5 && cv[0] === 3 && cv[1] === 2) return 'full';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (n === 3 && cv[0] === 3) return 'trips';
  if (n === 4 && cv[0] === 2 && cv[1] === 2) return 'twopair';
  if (n === 2 && cv[0] === 2) return 'pair';
  return null;
}
function bestHand(cards) {
  const jokers = cards.filter(c => c.s === 'J').length;
  if (!jokers) return evalSeg(cards);
  const arr = cards.filter(c => c.s !== 'J');
  let best = null;
  const rec = k => {
    if (k === 0) { const h = evalSeg(arr); if (h && (!best || TIER[h] > TIER[best])) best = h; return; }
    for (const o of ALL52) { arr.push(o); rec(k - 1); arr.pop(); }
  };
  rec(jokers);
  return best;
}
// Every stretch of 2 to 5 neighbouring cards in a row or column is checked; each card keeps its best bonus.
function scoreGrid(grid) {
  const res = new Map(), segs = [];
  const line = cells => {
    let run = [];
    const flush = () => {
      for (let n = Math.min(5, run.length); n >= 2; n--) {
        for (let i = 0; i + n <= run.length; i++) {
          const seg = run.slice(i, i + n);
          const h = bestHand(seg.map(t => t.card));
          if (!h) continue;
          const b = handBonus(h, n);
          segs.push({ towers: seg, hand: h });
          for (const t of seg) {
            const cur = res.get(t) || { pow: 0, rng: 0, hand: null };
            cur.pow = Math.max(cur.pow, b.pow); cur.rng = Math.max(cur.rng, b.rng);
            if (!cur.hand || TIER[h] > TIER[cur.hand]) cur.hand = h;
            res.set(t, cur);
          }
        }
      }
      run = [];
    };
    for (const t of cells) { if (t) run.push(t); else flush(); }
    flush();
  };
  for (let y = 0; y < ROWS; y++) line(Array.from({ length: COLS }, (_, x) => grid[y * COLS + x]));
  for (let x = 0; x < COLS; x++) line(Array.from({ length: ROWS }, (_, y) => grid[y * COLS + x]));
  return { res, segs };
}

function towerStats(card, pow, rng, lvl, court) {
  const face = card.s === 'J' ? 0 : card.r;
  const r = face ? (face - 2) / 12 : 0;
  const P = (1 + pow + (court || 0)) * (1 + CFG.raise * (lvl || 0)), R = (1 + rng) * (face === 12 ? 1.2 : 1), Q = face === 11 ? 1.35 : 1;
  let st;
  switch (card.s) {
    case 'S': st = { range: 3.2 * R, dmg: (8 + 20 * r) * P, rate: 1.0 * Q }; break;
    case 'C': st = { range: 1.7 * R, dmg: (16 + 40 * r) * P, rate: .75 * Q, splash: .8 }; break;
    case 'H': st = { range: 2.3 * R, slow: Math.min(.7, (.25 + .2 * r) * P), dmg: (2 + 4 * r) * P * Q }; break;
    case 'D': st = { range: 2.4 * R, dmg: (5 + 10 * r) * P, rate: 1.0 * Q, bonus: Math.round((1 + 3 * r) * P) }; break;
    default: st = { range: 3.0 * R, dmg: 20 * P, rate: 1.0 };
  }
  st.pierce = face === 14;
  st.names = card.s === 'S' || card.s === 'J' || face === 14;
  return st;
}

// --- thieves ---------------------------------------------------------------
const THIEF = {
  pick: { name: 'Pickpocket', plural: 'Pickpockets', desc: 'Quick and flimsy.', hp: 28, spd: 1.5, bounty: 3, r: .2, col: '#8fa3c8' },
  bruiser: { name: 'Bruiser', plural: 'Bruisers', desc: 'Slow, tough, and shrugs off small hits.', hp: 130, spd: .75, armor: 3, bounty: 8, r: .3, col: '#b0714f' },
  cat: { name: 'Cat burglar', plural: 'Cat burglars', desc: 'Cuts every corner instead of following the carpet.', hp: 38, spd: 1.25, bounty: 6, r: .21, col: '#8a78c9', cat: true },
  forger: { name: 'Forger', plural: 'Forgers', desc: 'Comes in face down. Untouchable until a spade or an ace names it.', hp: 60, spd: 1.05, bounty: 7, r: .22, col: '#62a882', hidden: true },
  lookout: { name: 'Lookout', plural: 'Lookouts', desc: 'Hurries along every thief near it.', hp: 50, spd: 1.1, bounty: 7, r: .22, col: '#4fb3c9', haste: 1.6 },
  double: { name: 'Double act', plural: 'Double acts', desc: 'Stop it and two pickpockets tumble out.', hp: 70, spd: 1.0, bounty: 5, r: .25, col: '#d9944a', split: true },
  boss: { name: 'Mastermind', plural: 'The Mastermind', desc: 'Takes two cards at once.', hp: 600, spd: .55, armor: 2, bounty: 60, r: .38, col: '#2b2f42', carry: 2 }
};
const DEBUT = { pick: 1, bruiser: 3, cat: 5, forger: 7, lookout: 9, double: 12 };
const WEIGHT = { pick: 5, bruiser: 2, cat: 2, forger: 1.5, lookout: 1, double: 1.5 };
function genWave(seed, n, scale) {
  const r = mulberry32((seed ^ Math.imul(n, 0x9E3779B1)) >>> 0);
  const hpMul = (1 + CFG.hpA * (n - 1) + CFG.hpB * (n - 1) ** 2) * (scale || 1);
  const count = CFG.countBase + Math.floor(n * CFG.countPer);
  // A new kind of thief arrives in ones and twos, then builds up over three waves.
  const pool = Object.keys(DEBUT).filter(t => n >= DEBUT[t]).map(t => [t, WEIGHT[t] * Math.min(1, (n - DEBUT[t] + 1) / 3)]);
  const total = pool.reduce((s, p) => s + p[1], 0);
  const gap = Math.max(.4, 1.1 - n * .02);
  const q = [];
  for (let i = 0; i < count; i++) {
    let roll = r() * total, type = 'pick';
    for (const [t, w] of pool) { if ((roll -= w) < 0) { type = t; break; } }
    q.push({ type, gap: gap * (.6 + .8 * r()), hpMul });
  }
  for (const t in DEBUT) if (DEBUT[t] === n && n > 1 && !q.some(e => e.type === t)) q[Math.floor(count / 2)].type = t;
  if (n % 10 === 0) q.push({ type: 'boss', gap: 2, hpMul });
  return q;
}

// --- game state ------------------------------------------------------------
function newGame(seed, mode, mapIndex, stakes) {
  M = MAPS[mapIndex];
  const g = {
    seed, mode, mapIndex, stakes, hpScale: CFG.stakes[stakes] || 1, rng: mulberry32(seed), chips: CFG.start, wave: 0, phase: 'build',
    vault: VAULT_START, lost: 0, grid: Array(COLS * ROWS).fill(null), towers: [], thieves: [], spawned: [],
    shots: [], drops: [], fx: [], deck: [], discard: [], hand: [], redeals: 0, queue: [], spawnT: 0,
    segs: [], handSegs: [], handList: [], events: [], time: 0, uid: 1, shake: 0, vaultFlash: 0
  };
  for (const c of ALL52) g.deck.push({ s: c.s, r: c.r });
  g.deck.push({ s: 'J', r: 0 }, { s: 'J', r: 0 });
  shuffle(g.deck, g.rng);
  deal(g);
  return g;
}
function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
}
function deal(g) {
  for (const c of g.hand) if (c) g.discard.push(c);
  g.hand = [];
  for (let i = 0; i < 5; i++) {
    if (!g.deck.length && g.discard.length) { g.deck = g.discard; g.discard = []; shuffle(g.deck, g.rng); }
    g.hand.push(g.deck.length ? g.deck.pop() : null);
  }
  g.deals = (g.deals || 0) + 1;
}
const redealCost = g => 5 + 5 * g.redeals;
function redeal(g) {
  const c = redealCost(g);
  if (g.phase === 'over' || g.phase === 'won' || g.chips < c) return false;
  g.chips -= c; g.redeals++; deal(g); g.events.push('deal');
  return true;
}
function recompute(g) {
  const { res, segs } = scoreGrid(g.grid);
  g.segs = segs;
  for (const t of g.towers) {
    const b = res.get(t) || { pow: 0, rng: 0, hand: null };
    t.pow = b.pow; t.rng = b.rng; t.hand = b.hand;
    let kings = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = t.x + dx, y = t.y + dy, o = x >= 0 && x < COLS && y >= 0 && y < ROWS ? g.grid[y * COLS + x] : null;
      if (o && o.card.s !== 'J' && o.card.r === 13) kings++;
    }
    t.court = CFG.court * Math.min(2, kings);
    t.st = towerStats(t.card, t.pow, t.rng, t.lvl, t.court);
  }
  // The hands worth showing: the best one for at least one of its cards, and not a piece of a longer one.
  g.handSegs = segs.filter(s => s.towers.some(t => t.hand === s.hand) &&
    !segs.some(o => o !== s && o.hand === s.hand && o.towers.length > s.towers.length && s.towers.every(t => o.towers.includes(t))));
  const m = {};
  for (const s of g.handSegs) m[s.hand] = (m[s.hand] || 0) + 1;
  g.handList = Object.entries(m).sort((a, b) => TIER[b[0]] - TIER[a[0]]);
}
function place(g, i, x, y) {
  const card = g.hand[i];
  if (!card || !buildable(x, y) || g.grid[y * COLS + x] || g.chips < cost(card)) return null;
  if (g.phase !== 'build' && g.phase !== 'wave') return null;
  g.chips -= cost(card);
  const t = { card, lvl: 0, spent: cost(card), x, y, cx: x + .5, cy: y + .5, cd: 0, kick: 0, pop: 1, shine: 0, pow: 0, rng: 0, court: 0, hand: null, st: null, placedWave: g.wave, inBuild: g.phase === 'build' };
  g.grid[y * COLS + x] = t; g.towers.push(t); g.hand[i] = null;
  recompute(g);
  g.events.push('place');
  if (t.hand) {
    for (const s of g.segs) if (s.hand === t.hand && s.towers.includes(t)) for (const o of s.towers) o.shine = 1;
    g.fx.push({ k: 'text', x: t.cx, y: t.cy - .55, txt: HAND_NAME[t.hand], t: 0, life: 1.6, col: '#e2b857', big: true });
    g.events.push('hand');
  }
  return t;
}
const sellValue = (g, t) => (t.inBuild && g.phase === 'build' && t.placedWave === g.wave) ? t.spent : Math.floor(t.spent / 2);
const raiseCost = t => cost(t.card) * (t.lvl + 1);
function raise(g, t) {
  if (!g.towers.includes(t) || t.lvl >= CFG.maxRaise || g.chips < raiseCost(t)) return false;
  const c = raiseCost(t);
  g.chips -= c; t.spent += c; t.lvl++; t.pop = .6; recompute(g); g.events.push('place');
  return true;
}
function sell(g, t) {
  if (!g.towers.includes(t)) return;
  g.chips += sellValue(g, t);
  g.grid[t.y * COLS + t.x] = null; g.towers.splice(g.towers.indexOf(t), 1); g.discard.push(t.card);
  recompute(g); g.events.push('sell');
}
function sendWave(g) {
  if (g.phase !== 'build') return false;
  g.wave++; g.queue = genWave(g.seed, g.wave, g.hpScale); g.phase = 'wave'; g.spawnT = .6; g.events.push('send');
  return true;
}

// --- simulation ------------------------------------------------------------
function makeThief(g, type, hp, d, dir, path) {
  const def = THIEF[type];
  d = clamp(d, 0, path.len);
  const [x, y] = at(path, d);
  return { id: g.uid++, type, def, hp, max: hp, d, dir, path, x, y, carry: 0, hidden: !!def.hidden, slow: 0, haste: 0, flash: 0, vx: 1, dead: false, gone: false };
}
function hurt(g, th, amt, aura, pierce) {
  if (th.dead) return;
  if (!aura) { if (!pierce) amt = Math.max(1, amt - (th.def.armor || 0)); th.flash = 1; }
  th.hp -= amt;
  if (th.hp > 0) return;
  th.dead = true;
  let bonus = 0;
  for (const t of g.towers) if (t.card.s === 'D' && Math.hypot(t.cx - th.x, t.cy - th.y) <= t.st.range) bonus = Math.max(bonus, t.st.bonus);
  const pay = th.def.bounty + bonus;
  g.chips += pay;
  g.fx.push({ k: 'text', x: th.x, y: th.y - .3, txt: '+' + pay, t: 0, life: .9, col: bonus ? '#e2b857' : '#f1ead9' });
  g.fx.push({ k: 'burst', x: th.x, y: th.y, t: 0, life: .5, col: th.def.col, seed: Math.random() * 99 });
  g.fx.push({ k: 'poof', x: th.x, y: th.y, r: th.def.r * 2.2, t: 0, life: .3 });
  for (let i = 0; i < th.carry; i++) g.drops.push({ x: th.x + i * .28, y: th.y, t: 10 });
  if (th.carry) g.events.push('drop');
  if (th.def.split) for (const o of [-.3, .3]) { const k = makeThief(g, 'pick', th.max * .4, th.d + o, th.dir, th.path); k.small = true; g.spawned.push(k); }
  g.events.push('down');
}
function step(g, dt) {
  g.time += dt;
  for (const f of g.fx) f.t += dt;
  g.fx = g.fx.filter(f => f.t < f.life);
  g.shake = Math.max(0, g.shake - dt); g.vaultFlash = Math.max(0, g.vaultFlash - dt * 1.5);
  for (const t of g.towers) { t.kick = Math.max(0, t.kick - dt * 4); t.pop = Math.max(0, t.pop - dt * 3.5); t.shine = Math.max(0, t.shine - dt * .9); }
  if (g.phase !== 'wave') return;

  // spawn
  if (g.queue.length) {
    g.spawnT -= dt;
    if (g.spawnT <= 0) {
      const q = g.queue.shift(), def = THIEF[q.type];
      g.thieves.push(makeThief(g, q.type, def.hp * q.hpMul, 0, 1, def.cat ? M.cat : M.main));
      g.spawnT = g.queue.length ? g.queue[0].gap : 0;
    }
  }

  // lookouts hurry the others; hearts slow and scorch; spades, jokers and aces name forgers
  for (const th of g.thieves) { th.slow = 0; th.haste = 0; th.flash = Math.max(0, th.flash - dt * 6); }
  for (const lo of g.thieves) {
    if (!lo.def.haste || lo.dead) continue;
    for (const th of g.thieves) if (th !== lo && !th.def.haste && Math.hypot(lo.x - th.x, lo.y - th.y) <= lo.def.haste) th.haste = .3;
  }
  for (const t of g.towers) {
    const heart = t.card.s === 'H';
    if (!heart && !t.st.names) continue;
    for (const th of g.thieves) {
      if (th.dead || Math.hypot(t.cx - th.x, t.cy - th.y) > t.st.range) continue;
      if (t.st.names && th.hidden) {
        th.hidden = false;
        g.fx.push({ k: 'text', x: th.x, y: th.y - .4, txt: 'Named', t: 0, life: 1, col: '#f1ead9' });
        g.fx.push({ k: 'ring', x: th.x, y: th.y, r: .5, t: 0, life: .3 });
        g.events.push('name');
      }
      if (heart) { th.slow = Math.max(th.slow, t.st.slow); if (!th.hidden) hurt(g, th, t.st.dmg * dt, true); }
    }
  }

  // move
  for (const th of g.thieves) {
    if (th.dead) continue;
    th.d += th.dir * th.def.spd * (1 - th.slow) * (1 + th.haste) * (th.carry ? .85 : 1) * dt;
    if (th.dir > 0 && th.d >= th.path.len) {
      th.d = th.path.len; th.dir = -1;
      const take = Math.min(th.def.carry || 1, g.vault);
      g.vault -= take; th.carry += take;
      if (take) { g.events.push('steal'); g.vaultFlash = 1; }
    } else if (th.dir < 0 && th.d <= 0) {
      th.gone = true;
      if (th.carry) {
        g.lost += th.carry; g.shake = .35; g.events.push('lost');
        g.fx.push({ k: 'text', x: M.door[0], y: M.door[1] + .5, txt: '−' + th.carry + (th.carry > 1 ? ' cards' : ' card'), t: 0, life: 1.8, col: '#e0566b', big: true });
      }
    }
    const [nx, ny] = at(th.path, th.d);
    if (Math.abs(nx - th.x) > 1e-4) th.vx = nx > th.x ? 1 : -1;
    th.x = nx; th.y = ny;
    if (th.dir > 0 && !th.gone) {
      for (const dr of g.drops) {
        if (!dr.taken && Math.hypot(dr.x - th.x, dr.y - th.y) < .45) { dr.taken = true; th.carry++; th.dir = -1; g.events.push('steal'); break; }
      }
    }
  }

  // dropped cards find their way home
  for (const dr of g.drops) {
    if (dr.taken) continue;
    dr.t -= dt;
    if (dr.t <= 0) { dr.taken = true; g.vault++; g.events.push('return'); g.fx.push({ k: 'text', x: M.vault[0], y: M.vault[1] - .6, txt: '+1 card', t: 0, life: 1, col: '#f1ead9' }); }
  }
  g.drops = g.drops.filter(d => !d.taken);

  // towers fire
  for (const t of g.towers) {
    if (t.card.s === 'H') continue;
    t.cd -= dt;
    if (t.cd > 0) continue;
    let best = null, bs = -Infinity;
    for (const th of g.thieves) {
      if (th.dead || th.gone || th.hidden || Math.hypot(t.cx - th.x, t.cy - th.y) > t.st.range) continue;
      const f = th.d / th.path.len;
      const sc = th.carry ? 2 + (1 - f) : th.dir > 0 ? f : -1 + f;
      if (sc > bs) { bs = sc; best = th; }
    }
    if (!best) continue;
    t.cd = 1 / t.st.rate; t.kick = 1;
    if (t.card.s === 'C') {
      g.fx.push({ k: 'ring', x: best.x, y: best.y, r: t.st.splash, t: 0, life: .25 });
      g.fx.push({ k: 'slash', x: t.cx, y: t.cy, x2: best.x, y2: best.y, t: 0, life: .16 });
      for (const th of g.thieves) if (!th.dead && !th.gone && th !== best && Math.hypot(th.x - best.x, th.y - best.y) <= t.st.splash) hurt(g, th, t.st.dmg * .5, false, t.st.pierce);
      hurt(g, best, t.st.dmg, false, t.st.pierce);
    } else {
      g.shots.push({ x: t.cx, y: t.cy, dx: 0, dy: 0, target: best, dmg: t.st.dmg, pierce: t.st.pierce, gold: t.card.s === 'D' });
    }
  }

  // shots
  for (const s of g.shots) {
    const th = s.target;
    if (th.dead || th.gone) { s.done = true; continue; }
    const dx = th.x - s.x, dy = th.y - s.y, dist = Math.hypot(dx, dy), mv = 13 * dt;
    if (dist <= mv + .15) { s.done = true; hurt(g, th, s.dmg, false, s.pierce); }
    else { s.dx = dx / dist; s.dy = dy / dist; s.x += s.dx * mv; s.y += s.dy * mv; }
  }
  g.shots = g.shots.filter(s => !s.done);
  g.thieves = g.thieves.filter(th => !th.dead && !th.gone);
  if (g.spawned.length) { g.thieves.push(...g.spawned); g.spawned = []; }

  // endings
  if (g.lost >= VAULT_START) { g.phase = 'over'; g.events.push('over'); return; }
  if (!g.queue.length && !g.thieves.length) {
    g.vault += g.drops.length; g.drops = []; g.shots = [];
    g.chips += 10 + g.wave * 2;
    if (g.wave >= LAST_WAVE) { g.phase = 'won'; g.events.push('won'); return; }
    g.phase = 'build'; g.redeals = 0; deal(g); g.events.push('clear');
  }
}

// The daily table's seed: the UTC date and nothing else, so everybody is dealt
// the same cards without anything being asked for or stored.
function dailySeed(date = new Date()) {
  return hashStr('lockup-' + date.toISOString().slice(0, 10));
}

// --- what the page and the suite may use ----------------------------------

globalThis.LockupRules = {
  COLS, ROWS, VAULT_START, LAST_WAVE, DT, CFG, MAPS, SUITS, FACE, THIEF, DEBUT, HAND_NAME, TIER,
  clamp, hashStr, mulberry32, rankLabel, cardName, cost, buildable, evalSeg, bestHand, handBonus, scoreGrid, towerStats, genWave,
  newGame, deal, redealCost, redeal, recompute, place, sellValue, raiseCost, raise, sell, sendWave, step,
  dailySeed, hurt, makeThief,
  get map() { return M; },
};
})();

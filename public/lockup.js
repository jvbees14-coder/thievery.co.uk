// ---------------------------------------------------------------------------
// Lockup: the page.
//
// The rules are lockup-rules.js, loaded before this. This file draws them:
// the canvas, the hand, the panels beside the board, the tips on a first
// game, the sounds and the keys. It decides nothing about the game itself.
//
// There is no account in it. The best wave, the chosen room and stakes, the
// sound switch and whether the tips have been seen are one entry in
// localStorage (STORE_KEY, listed on /privacy). A finished game is also told
// to /api/site/lockup, which adds it to the record of whoever is signed in
// and answers 401 to everybody else. The page cannot see the session cookie,
// so it asks either way. A finished daily game is sent as its list of moves
// instead, for the server to play back and put on the day's board. A room
// somebody drew travels in the address, after the #, and never leaves the
// browser.
// ---------------------------------------------------------------------------

(() => {
'use strict';

const {
  COLS, ROWS, VAULT_START, LAST_WAVE, DT, CFG, MAPS, SUITS, FACE, THIEF, DEBUT, HAND_NAME, TRACK_TOP,
  clamp, rankLabel, cardName, cost, buildable, scoreGrid, towerStats, tracksOf, genWave,
  newGame, redealCost, redeal, place, sellValue, canUpgrade, upgradeCost, upgrade, sell, sendWave, keepGoing, cleared, step,
  dailyTable, cellsOfCode, codeOfCells, roomFault, roomFromCode,
} = globalThis.LockupRules;
// The room being drawn. The rules keep their own note of it for a game in
// play; this one also has to follow the start sheet, where no game exists.
let M = MAPS[0];

// Every id on the page is the room's own, so none can meet one of the bar's.
const $ = id => document.getElementById('lk-' + id);
const cv = $('board'), ctx = cv.getContext('2d');
let g = null, sel = -1, selTower = null, hover = null, speed = 1, paused = false, S = 40, dpr = 1, quiet = false;
let lastSig = '', lastPhase = '', lastChips = 0, lastDeal = 0, coach = -1, coachText = '';
// A room being drawn, the last one that was, and today's board once it has
// been asked for.
let editor = null, customRoom = null, daily = { loaded: false, room: 0, board: [], signedIn: false };
// One colour a track, on the card's pips and in the panel beside the board.
const TRACK_COLOURS = ['#c9952b', '#3f8f86', '#8a5bb8'];
// The site's own switch for animations (prefs.js), asked each time because
// it can be changed while a game is running.
const still = () => window.thieveryStill ? window.thieveryStill() : matchMedia('(prefers-reduced-motion: reduce)').matches;
// One entry holds everything this room remembers, so /privacy has one line
// to keep true. A browser that refuses storage plays the same game and
// forgets it afterwards.
const STORE_KEY = 'thievery-lockup';
const store = {
  all() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } },
  get(k) { const v = this.all()[k]; return v == null ? null : String(v); },
  set(k, v) { try { const a = this.all(); a[k] = v; localStorage.setItem(STORE_KEY, JSON.stringify(a)); } catch (e) { } }
};
let pickMap = clamp(Math.trunc(+store.get('map')) || 0, 0, MAPS.length - 1), pickStakes = CFG.stakes[store.get('stakes')] ? store.get('stakes') : 'standard';
M = MAPS[pickMap];

// --- sound (synthesised, off until the first click) ------------------------
let ac = null, muted = store.get('muted') === '1';
function beep(f, d, type, v, slide) {
  if (muted || quiet) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), gn = ac.createGain(), t0 = ac.currentTime;
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + d);
    gn.gain.setValueAtTime(v || .05, t0); gn.gain.exponentialRampToValueAtTime(.0001, t0 + d);
    o.connect(gn).connect(ac.destination); o.start(t0); o.stop(t0 + d);
  } catch (e) { }
}
const SOUNDS = {
  place: () => beep(520, .08, 'triangle', .06, 200), upgrade: () => { beep(620, .07, 'triangle', .06, 260); setTimeout(() => beep(930, .1, 'triangle', .05), 60); }, sell: () => beep(300, .1, 'triangle', .05, -120),
  hand: () => { beep(660, .12, 'triangle', .06); setTimeout(() => beep(880, .18, 'triangle', .06), 90); },
  deal: () => beep(900, .04, 'square', .02, -400), send: () => beep(180, .25, 'sawtooth', .04, 120),
  steal: () => beep(240, .2, 'square', .04, -90), lost: () => beep(140, .5, 'sawtooth', .06, -70),
  drop: () => beep(700, .08, 'sine', .05, 300), return: () => beep(600, .1, 'sine', .04, 200),
  name: () => beep(1000, .06, 'sine', .04), clear: () => { beep(520, .1, 'triangle', .05); setTimeout(() => beep(780, .2, 'triangle', .05), 110); },
  over: () => beep(200, .9, 'sawtooth', .06, -150), won: () => { [520, 660, 780, 1040].forEach((f, i) => setTimeout(() => beep(f, .25, 'triangle', .06), i * 130)); }
};
let downAt = 0;
function drainEvents() {
  if (!g) return;
  for (const e of g.events) {
    if (e === 'down') { if (performance.now() - downAt > 60) { beep(380, .05, 'square', .02, -200); downAt = performance.now(); } }
    else if (SOUNDS[e]) SOUNDS[e]();
  }
  g.events.length = 0;
}

// --- sizing ----------------------------------------------------------------
function fit() {
  const mobile = innerWidth < 820;
  const availW = mobile ? Math.min(innerWidth - 24, 560) : Math.min(innerWidth - 24 - 392, 660);
  const availH = innerHeight - (mobile ? 372 : 196);
  S = Math.max(26, Math.floor(Math.min(availW / COLS, availH / ROWS)));
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.style.width = S * COLS + 'px'; cv.style.height = S * ROWS + 'px';
  cv.width = S * COLS * dpr; cv.height = S * ROWS * dpr;
  $('boardwrap').style.width = S * COLS + 'px';
}
addEventListener('resize', fit);

// --- drawing ---------------------------------------------------------------
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function drawCard(c, cx, cy, card, scale, alpha, glow) {
  const w = .66 * S * scale, h = .88 * S * scale, x = cx - w / 2, y = cy - h / 2, su = SUITS[card.s];
  c.save(); c.globalAlpha = alpha;
  c.shadowColor = glow ? `rgba(226,184,87,${Math.min(1, .55 + glow * .45)})` : 'rgba(0,0,0,.55)';
  c.shadowBlur = glow ? S * (.22 + glow * .3) : S * .12; c.shadowOffsetY = glow ? 0 : S * .04;
  rr(c, x, y, w, h, S * .08); c.fillStyle = '#f1ead9'; c.fill();
  c.shadowColor = 'transparent';
  if (glow) { c.strokeStyle = '#e2b857'; c.lineWidth = Math.max(1.5, S * .05); c.stroke(); }
  c.fillStyle = su.red ? '#a3182d' : '#161a26';
  c.textAlign = 'left'; c.textBaseline = 'top'; c.font = `700 ${Math.round(S * .26 * scale)}px system-ui, sans-serif`;
  c.fillText(rankLabel(card), x + w * .1, y + h * .06);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(S * .42 * scale)}px system-ui, sans-serif`;
  c.fillText(su.glyph, cx, cy + h * .14);
  c.restore();
}
function drawThief(c, th) {
  const bob = still() ? 0 : Math.sin(g.time * 11 + th.id * 1.7) * S * .03 * (th.slow > 0 ? .4 : 1);
  const x = th.x * S, y = th.y * S + bob, r = th.def.r * S * (th.small ? .8 : 1);
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(th.x * S, th.y * S + r * .95, r * .8, r * .28, 0, 0, 7); c.fill();
  if (th.def.haste) { c.beginPath(); c.arc(x, y, th.def.haste * S, 0, 7); c.fillStyle = 'rgba(79,179,201,.06)'; c.fill(); c.strokeStyle = 'rgba(79,179,201,.3)'; c.lineWidth = 1; c.stroke(); }
  if (th.slow > 0) { c.beginPath(); c.arc(x, y, r + 3, 0, 7); c.strokeStyle = 'rgba(224,86,107,.75)'; c.lineWidth = 1.5; c.stroke(); }
  if (th.haste > 0) { c.strokeStyle = 'rgba(79,179,201,.8)'; c.lineWidth = 1.5; c.beginPath(); for (const o of [-.5, 0, .5]) { c.moveTo(x - th.vx * r * 1.25, y + o * r); c.lineTo(x - th.vx * r * 1.7, y + o * r); } c.stroke(); }
  if (th.hidden) {
    const w = .34 * S, h = .46 * S;
    rr(c, x - w / 2, y - h / 2, w, h, 3); c.fillStyle = '#6d1626'; c.fill(); c.strokeStyle = '#f1ead9'; c.lineWidth = 1.5; c.stroke();
    c.strokeStyle = 'rgba(241,234,217,.4)'; c.lineWidth = 1; c.beginPath();
    c.moveTo(x - w / 2 + 3, y - h / 2 + 3); c.lineTo(x + w / 2 - 3, y + h / 2 - 3); c.moveTo(x + w / 2 - 3, y - h / 2 + 3); c.lineTo(x - w / 2 + 3, y + h / 2 - 3); c.stroke();
  } else {
    if (th.def.cat) {
      c.fillStyle = th.def.col; c.beginPath();
      c.moveTo(x - r * .9, y - r * .3); c.lineTo(x - r * .7, y - r * 1.35); c.lineTo(x - r * .1, y - r * .8);
      c.moveTo(x + r * .9, y - r * .3); c.lineTo(x + r * .7, y - r * 1.35); c.lineTo(x + r * .1, y - r * .8); c.fill();
    }
    if (th.def.split) { c.beginPath(); c.arc(x - th.vx * r * .7, y - r * .25, r * .8, 0, 7); c.fillStyle = '#b87a36'; c.fill(); c.strokeStyle = '#0a0c14'; c.lineWidth = 1.5; c.stroke(); }
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = th.def.col; c.fill();
    c.lineWidth = th.type === 'boss' ? 2.5 : 1.5; c.strokeStyle = th.type === 'boss' ? '#e2b857' : '#0a0c14'; c.stroke();
    const look = th.vx * r * .14;
    c.fillStyle = '#0a0c14'; rr(c, x - r * .82, y - r * .4, r * 1.64, r * .5, r * .2); c.fill();   // the mask
    c.fillStyle = '#f1ead9'; c.beginPath(); c.arc(x - r * .36 + look, y - r * .15, r * .13, 0, 7); c.arc(x + r * .36 + look, y - r * .15, r * .13, 0, 7); c.fill();
    if (th.def.haste) { c.fillStyle = '#0a0c14'; c.beginPath(); c.arc(x, y - r * .45, r * .85, Math.PI, 0); c.fill(); c.fillRect(x - r * (th.vx > 0 ? .2 : 1.2), y - r * .55, r * 1.4, r * .16); }
    if (th.type === 'boss') { c.fillStyle = '#0a0c14'; c.fillRect(x - r * .95, y - r * 1.02, r * 1.9, r * .2); c.fillRect(x - r * .6, y - r * 1.7, r * 1.2, r * .75); c.fillStyle = '#e2b857'; c.fillRect(x - r * .6, y - r * 1.2, r * 1.2, r * .14); }
    if (th.flash > 0) { c.globalAlpha = th.flash * .7; c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = '#fff'; c.fill(); c.globalAlpha = 1; }
  }
  for (let i = 0; i < th.carry; i++) {
    const w = .2 * S, h = .27 * S, px = x + r * .5 + i * w * .5, py = y - r - h * .7;
    rr(c, px, py, w, h, 2); c.fillStyle = '#f1ead9'; c.fill(); c.strokeStyle = '#e2b857'; c.lineWidth = 1.5; c.stroke();
  }
  if (th.hp < th.max && !th.hidden) {
    const w = Math.max(.5 * S, r * 2), bx = x - w / 2, by = th.y * S + r + 4;
    c.fillStyle = 'rgba(10,12,20,.8)'; c.fillRect(bx, by, w, 3);
    c.fillStyle = th.carry ? '#e2b857' : '#e0566b'; c.fillRect(bx, by, w * Math.max(0, th.hp / th.max), 3);
  }
}
function draw() {
  const c = ctx, W = S * COLS, H = S * ROWS;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#0c0f18'; c.fillRect(0, 0, W, H);
  if (g && g.shake > 0 && !still()) c.translate((Math.random() - .5) * g.shake * S * .35, (Math.random() - .5) * g.shake * S * .35);
  const bg = c.createRadialGradient(W / 2, H / 2, S, W / 2, H / 2, H * .7);
  bg.addColorStop(0, '#171c2c'); bg.addColorStop(1, '#0c0f18');
  c.fillStyle = bg; c.fillRect(0, 0, W, H);

  if (editor) { drawEditor(c, W, H); return; }

  // spots: marked when a card is in hand, faint dots otherwise
  const picking = g && sel >= 0 && g.hand[sel];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = y * COLS + x;
    if (M.set.has(k) || (g && g.grid[k])) continue;
    if (picking && M.near.has(k)) {
      rr(c, x * S + S * .14, y * S + S * .06, S * .72, S * .88, S * .08);
      c.fillStyle = 'rgba(226,184,87,.06)'; c.fill(); c.strokeStyle = 'rgba(226,184,87,.32)'; c.lineWidth = 1; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]);
    } else { c.fillStyle = picking ? 'rgba(226,184,87,.25)' : 'rgba(241,234,217,.08)'; c.fillRect((x + .5) * S - 1, (y + .5) * S - 1, 2, 2); }
  }

  // the carpet
  const trace = () => { c.beginPath(); for (const r of M.routes) r.wp.forEach((p, i) => i ? c.lineTo(p[0] * S, p[1] * S) : c.moveTo(p[0] * S, p[1] * S)); };
  c.lineJoin = 'round'; c.lineCap = 'butt';
  trace(); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = S * .96; c.stroke();
  trace(); c.strokeStyle = 'rgba(226,184,87,.4)'; c.lineWidth = S * .84; c.stroke();
  trace(); c.strokeStyle = '#3a1420'; c.lineWidth = S * .78; c.stroke();
  trace(); c.strokeStyle = '#451826'; c.lineWidth = S * .5; c.stroke();
  c.setLineDash([S * .12, S * .22]); trace(); c.strokeStyle = 'rgba(226,184,87,.22)'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
  // door
  c.fillStyle = '#e2b857'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `600 ${Math.round(S * .2)}px system-ui, sans-serif`;
  for (const r of M.routes) c.fillText('DOOR', r.door[0] * S, r.door[1] * S);

  // vault
  const vx = M.vault[0] * S, vy = M.vault[1] * S, vn = g ? g.vault : VAULT_START, vf = g ? g.vaultFlash : 0;
  rr(c, vx - S * .46, vy - S * .46, S * .92, S * .92, S * .1); c.fillStyle = '#0a0c14'; c.fill();
  c.strokeStyle = vf > 0 ? '#e0566b' : '#e2b857'; c.lineWidth = 2 + vf * 3; c.stroke();
  for (let i = 0; i < Math.min(vn, 5); i++) { rr(c, vx - S * .2 - i * 1.5, vy - S * .32 - i * 1.5, S * .34, S * .46, 2); c.fillStyle = '#f1ead9'; c.fill(); c.strokeStyle = '#0a0c14'; c.lineWidth = 1; c.stroke(); }
  const off = Math.min(vn, 5) * 1.5 - 1.5;
  c.fillStyle = vn ? '#0a0c14' : '#e0566b'; c.font = `700 ${Math.round(S * .28)}px system-ui, sans-serif`;
  c.fillText(String(vn), vn ? vx - S * .03 - off : vx, vn ? vy - S * .09 - off : vy);
  c.fillStyle = '#e2b857'; c.font = `600 ${Math.round(S * .17)}px system-ui, sans-serif`; c.fillText('VAULT', vx, vy + S * .33);
  if (!g) return;

  // range previews
  const ring = (x, y, r, ok) => { c.beginPath(); c.arc(x * S, y * S, r * S, 0, 7); c.fillStyle = ok ? 'rgba(226,184,87,.07)' : 'rgba(224,86,107,.07)'; c.fill(); c.strokeStyle = ok ? 'rgba(226,184,87,.55)' : 'rgba(224,86,107,.55)'; c.lineWidth = 1.5; c.stroke(); };
  if (selTower) ring(selTower.cx, selTower.cy, selTower.st.range, true);

  // hand lines
  c.lineCap = 'round';
  for (const s of g.handSegs) {
    const a = s.towers[0], b = s.towers[s.towers.length - 1], sh = Math.max(...s.towers.map(t => t.shine));
    c.beginPath(); c.moveTo(a.cx * S, a.cy * S); c.lineTo(b.cx * S, b.cy * S);
    c.strokeStyle = `rgba(226,184,87,${.26 + sh * .4})`; c.lineWidth = S * (.5 + sh * .25); c.stroke();
  }
  // heart auras
  for (const t of g.towers) if (t.card.s === 'H') {
    const p = (g.time * .6 + t.x * .13) % 1;
    c.beginPath(); c.arc(t.cx * S, t.cy * S, t.st.range * S * (still() ? 1 : p), 0, 7);
    c.strokeStyle = `rgba(224,86,107,${still() ? .15 : .3 * (1 - p)})`; c.lineWidth = 1.5; c.stroke();
  }
  // drops
  for (const d of g.drops) {
    const x = d.x * S, y = d.y * S, w = .26 * S, h = .35 * S;
    rr(c, x - w / 2, y - h / 2, w, h, 2); c.fillStyle = '#f1ead9'; c.fill(); c.strokeStyle = '#e2b857'; c.lineWidth = 1.5; c.stroke();
    c.beginPath(); c.arc(x, y, .3 * S, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (d.t / 10)); c.strokeStyle = 'rgba(241,234,217,.7)'; c.lineWidth = 2; c.stroke();
  }
  // towers
  for (const t of g.towers) {
    const pop = still() ? 0 : t.pop * t.pop;
    const glow = t.hand || t === selTower ? .3 + t.shine * .7 : 0;
    drawCard(c, t.cx * S, t.cy * S - t.kick * S * .05 - pop * S * .25, t.card, 1 + t.kick * .06 + pop * .35, 1, glow);
    // What has been spent on it: a column of pips a track, down the right
    // edge, and a ring round the track that took its last step.
    for (let k = 0; k < 3; k++) for (let i = 0; i < t.up[k]; i++) {
      const px = t.cx * S + S * (.07 + k * .095), py = t.cy * S - S * .33 + i * S * .1;
      c.beginPath(); c.arc(px, py, S * .036, 0, 7); c.fillStyle = TRACK_COLOURS[k]; c.fill();
      if (t.up[k] >= TRACK_TOP && i === 0) { c.beginPath(); c.arc(px, py, S * .058, 0, 7); c.strokeStyle = TRACK_COLOURS[k]; c.lineWidth = 1; c.stroke(); }
    }
    if (t.court) { c.fillStyle = '#c9952b'; c.font = `${Math.round(S * .16)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♚︎', t.cx * S - S * .2, t.cy * S + S * .33); }
  }
  // hover ghost
  if (hover && picking) {
    const card = g.hand[sel], ok = buildable(hover.x, hover.y) && !g.grid[hover.y * COLS + hover.x];
    if (ok) {
      const ghost = { card }; g.grid[hover.y * COLS + hover.x] = ghost;
      const b = scoreGrid(g.grid).res.get(ghost) || { pow: 0, rng: 0, hand: null };
      g.grid[hover.y * COLS + hover.x] = null;
      ring(hover.x + .5, hover.y + .5, towerStats(card, b.pow, b.rng, 0, 0).range, true);
      drawCard(c, (hover.x + .5) * S, (hover.y + .5) * S, card, 1, .7, b.hand ? .5 : 0);
      if (b.hand) { c.font = `600 ${Math.round(S * .26)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#e2b857'; c.fillText(HAND_NAME[b.hand], clamp((hover.x + .5) * S, S * 1.3, W - S * 1.3), Math.max(S * .2, (hover.y - .12) * S)); }
    } else if (hover.x >= 0 && hover.x < COLS && hover.y >= 0 && hover.y < ROWS) {
      c.fillStyle = 'rgba(224,86,107,.18)'; c.fillRect(hover.x * S, hover.y * S, S, S);
    }
  }
  // thieves, shots, effects
  for (const th of g.thieves) drawThief(c, th);
  c.lineCap = 'round';
  for (const s of g.shots) {
    c.beginPath(); c.moveTo((s.x - s.dx * .35) * S, (s.y - s.dy * .35) * S); c.lineTo(s.x * S, s.y * S);
    c.strokeStyle = s.gold ? 'rgba(226,184,87,.6)' : 'rgba(241,234,217,.6)'; c.lineWidth = S * .06; c.stroke();
    c.beginPath(); c.arc(s.x * S, s.y * S, S * .065, 0, 7); c.fillStyle = s.gold ? '#e2b857' : '#f1ead9'; c.fill();
  }
  for (const f of g.fx) {
    const p = f.t / f.life;
    if (f.k === 'text') {
      c.globalAlpha = 1 - p * p; c.font = `700 ${Math.round(S * (f.big ? .32 : .24))}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const tx = clamp(f.x * S, S * 1.4, W - S * 1.4), ty = Math.max(S * .25, (f.y - p * .5) * S);
      c.lineWidth = 3; c.strokeStyle = 'rgba(10,12,20,.85)'; c.strokeText(f.txt, tx, ty); c.fillStyle = f.col; c.fillText(f.txt, tx, ty); c.globalAlpha = 1;
    } else if (f.k === 'ring') {
      c.beginPath(); c.arc(f.x * S, f.y * S, f.r * S * (.4 + .6 * p), 0, 7); c.strokeStyle = `rgba(241,234,217,${.6 * (1 - p)})`; c.lineWidth = 2; c.stroke();
    } else if (f.k === 'slash') {
      c.beginPath(); c.moveTo(f.x * S, f.y * S); c.lineTo(f.x2 * S, f.y2 * S); c.strokeStyle = `rgba(241,234,217,${.7 * (1 - p)})`; c.lineWidth = Math.max(.5, S * .12 * (1 - p)); c.stroke();
    } else if (f.k === 'poof') {
      c.beginPath(); c.arc(f.x * S, f.y * S, f.r * S * (.3 + .7 * p), 0, 7); c.fillStyle = `rgba(241,234,217,${.25 * (1 - p)})`; c.fill();
    } else if (f.k === 'burst' && !still()) {
      c.fillStyle = f.col; c.globalAlpha = 1 - p;
      for (let i = 0; i < 9; i++) { const a = f.seed + i * .7, d = (1 - (1 - p) * (1 - p)) * .6 * S * (1 + (i % 3) * .35); c.fillRect(f.x * S + Math.cos(a) * d - 1.5, f.y * S + Math.sin(a) * d - 1.5, 3, 3); }
      c.globalAlpha = 1;
    }
  }
  if (paused) { c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = 'rgba(10,12,20,.55)'; c.fillRect(0, 0, W, H); c.fillStyle = '#f1ead9'; c.font = `${Math.round(S * .6)}px Limelight, Georgia, serif`; c.textAlign = 'center'; c.fillText('Paused', W / 2, H / 2); }
}

// --- panels ----------------------------------------------------------------
const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
function statLines(card, pow, rng, up, court) {
  const st = towerStats(card, pow, rng, up, court), out = [];
  out.push(['Reach', st.range.toFixed(1)]);
  if (card.s === 'H') { out.push(['Slows by', Math.round(st.slow * 100) + '%']); out.push(['Scorch', st.dmg.toFixed(1) + ' a second']); }
  else { out.push(['Hit', Math.round(st.dmg)]); out.push(['Speed', st.rate.toFixed(2) + ' a second']); }
  if (st.bonus) out.push(['Bonus chips', '+' + st.bonus]);
  return out.map(([k, v]) => `<div class="lk-row"><span>${k}</span><b>${v}</b></div>`).join('');
}
const faceLine = card => card.s !== 'J' && FACE[card.r] ? `<p class="lk-face"><b>${FACE[card.r].name}.</b> ${FACE[card.r].text}</p>` : '';
function handsOnTable() {
  if (!g.handList.length) return g.towers.length >= 2 ? `<p class="lk-hint">No hands on the table yet. Put matching suits or ranks side by side.</p>` : '';
  return `<div class="lk-made"><span>On the table</span>${g.handList.map(([h, n]) => `<b>${HAND_NAME[h]}${n > 1 ? ' ×' + n : ''}</b>`).join('')}</div>`;
}
// The three tracks of the card that is selected: how far each has been
// taken, what the next step does, and what it costs. A track that cannot
// take its last step because another already has says so.
function trackRows(t) {
  return tracksOf(t.card).map((tr, k) => {
    const n = t.up[k], top = n >= TRACK_TOP, open = canUpgrade(t, k), price = top ? 0 : upgradeCost(t, k);
    const pips = [0, 1, 2].map(i => `<i class="${i < n ? 'is-on' : ''}"></i>`).join('');
    const label = top ? 'Complete' : !open ? 'Locked' : `Upgrade · ${price}`;
    const next = top ? tr.steps[TRACK_TOP - 1] : !open ? 'Another track has taken its last step.' : tr.steps[n];
    return `<div class="lk-track lk-track-${k}"><div class="lk-track-head"><b>${tr.name}</b><span class="lk-pips" role="img" aria-label="${n} of ${TRACK_TOP} steps">${pips}</span></div>
      <p>${next}</p><button class="btn small${open && !top ? ' primary' : ''}" type="button" data-track="${k}" ${top || !open || g.chips < price ? 'disabled' : ''}>${label}</button></div>`;
  }).join('');
}
function boardHtml(list) {
  if (!list || !list.length) return '';
  return `<ol class="lk-boardlist">${list.map(r => `<li class="${r.you ? 'is-you' : ''}"><span>${esc(r.name)}</span><b>Wave ${r.waves}</b><i>${r.kept} kept</i></li>`).join('')}</ol>`;
}
function renderInfo() {
  const el = $('info');
  if (editor) {
    const fault = roomFault(editor.cells);
    el.innerHTML = `<h3>Draw a room</h3><p>Tap an edge square for the door, then a square along the same row or column for each corner. The last corner is the vault.</p>
      <p class="${fault ? 'lk-hint' : 'lk-new'}">${esc(editor.note || fault || 'This room is ready to play.')}</p>
      <div class="lk-pair"><button class="btn" type="button" id="lk-ed-undo" ${editor.cells.length ? '' : 'disabled'}>Undo</button><button class="btn" type="button" id="lk-ed-clear" ${editor.cells.length ? '' : 'disabled'}>Clear</button></div>
      <div class="lk-pair"><button class="btn primary" type="button" id="lk-ed-play" ${fault ? 'disabled' : ''}>Play this room</button><button class="btn" type="button" id="lk-ed-link" ${fault ? 'disabled' : ''}>Copy link</button></div>
      <div class="lk-pair"><button class="btn" type="button" id="lk-ed-back">Back</button></div>`;
    $('ed-undo').onclick = () => { editor.cells.pop(); editor.note = ''; renderInfo(); };
    $('ed-clear').onclick = () => { editor.cells = []; editor.note = ''; renderInfo(); };
    $('ed-play').onclick = () => closeEditor(true);
    $('ed-back').onclick = () => closeEditor(false);
    $('ed-link').onclick = () => {
      const url = `${location.origin}/lockup#room=${codeOfCells(editor.cells)}`;
      const said = () => { editor.note = 'Link copied. Anybody who opens it gets this room.'; renderInfo(); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(said, () => { editor.note = url; renderInfo(); });
      else { editor.note = url; renderInfo(); }
    };
    return;
  }
  if (!g) {
    // Nothing in play: the panel is today's board.
    if (!daily.loaded) { el.innerHTML = ''; return; }
    el.innerHTML = `<h3>Today’s table</h3><p>${MAPS[daily.room].name}. Everybody is dealt the same cards, and your first finished game of the day is the one that counts.</p>
      ${boardHtml(daily.board) || '<p class="lk-hint">Nobody has finished today’s table yet.</p>'}
      ${daily.signedIn ? '' : '<p class="lk-hint">Sign in on the home page to put your score on the board.</p>'}`;
    return;
  }
  if (selTower) {
    const t = selTower, su = SUITS[t.card.s];
    el.innerHTML = `<h3>${esc(cardName(t.card))}</h3><p>${su.role}</p>${faceLine(t.card)}${statLines(t.card, t.pow, t.rng, t.up, t.court)}
      <div class="lk-row"><span>Hand</span><b class="${t.hand ? 'lk-gold' : ''}">${t.hand ? HAND_NAME[t.hand] : 'None yet'}</b></div>
      ${t.court ? `<div class="lk-row"><span>Beside a king</span><b class="lk-gold">+${Math.round(t.court * 100)}% power</b></div>` : ''}
      <div class="lk-tracks">${trackRows(t)}</div>
      <p class="lk-hint">Only one track can take its last step.</p>
      <div class="lk-pair"><button class="btn" type="button" id="lk-sell">Sell for ${sellValue(g, t)}</button></div>`;
    $('sell').onclick = () => { sell(g, t); selTower = null; lastSig = ''; };
    for (const b of el.querySelectorAll('[data-track]')) b.onclick = () => { upgrade(g, t, +b.dataset.track); lastSig = ''; };
  } else if (sel >= 0 && g.hand[sel]) {
    const card = g.hand[sel];
    el.innerHTML = `<h3>${esc(cardName(card))}</h3><p>${SUITS[card.s].role}</p>${faceLine(card)}${statLines(card, 0, 0, null, 0)}
      <p class="lk-hint">Upgrades: ${tracksOf(card).map(tr => tr.name).join(', ')}. Tap a marked spot beside the carpet to lay it.</p>`;
  } else if (g.phase === 'build') {
    const n = g.wave + 1, q = genWave(g.seed, n, g.hpScale), counts = {};
    for (const e of q) counts[e.type] = (counts[e.type] || 0) + 1;
    const list = Object.entries(counts).map(([k, c]) => k === 'boss' ? THIEF[k].plural : `${c} ${(c > 1 ? THIEF[k].plural : THIEF[k].name).toLowerCase()}`).join(', ');
    const fresh = Object.keys(counts).filter(k => (k === 'boss' ? 10 : DEBUT[k]) === n);
    el.innerHTML = `<h3>Wave ${n}</h3><p>${list}.</p>${fresh.map(k => `<p class="lk-new"><b>New</b> ${THIEF[k].name}. ${THIEF[k].desc}</p>`).join('')}${handsOnTable()}<p class="lk-hint">${TIPS[Math.min(g.wave, TIPS.length - 1)]}</p>`;
  } else {
    el.innerHTML = `<h3>Wave ${g.wave}</h3>${handsOnTable()}<p class="lk-hint">Thieves carrying a card are hit first. A dropped card goes home after ten seconds, if nobody picks it up.</p>`;
  }
}
const TIPS = [
  'The bends of the carpet see the most traffic.',
  'Tap a card on the table to upgrade it. A cheap card with upgrades beats a dear one without.',
  'Clubs and high cards get through a bruiser’s padding. Small hits mostly bounce.',
  'Two cards of the same rank side by side make a pair. Three of one suit is a flush, three ranks in a row a straight.',
  'Cat burglars leave the carpet. Cover the middle of each stretch.',
  'Only one track of a card can take its last step. Pick the one that suits where the card sits.',
  'Forgers cannot be touched until a spade, a joker or an ace has them in reach.',
  'Hearts do little harm alone. Put them where your hitters already reach.',
  'Take out the lookout first and the rest slow back down.',
  'The Mastermind takes two cards at once.',
  'Cards alone will not hold the later waves. Spend on the ones in the best spots.',
  'Splash from clubs deals with the pickpockets a double act leaves behind.',
  'A king lifts every card touching it, corners included.',
  'A redeal costs more each time in the same wave.'
];
function renderHand() {
  const el = $('hand'), dealt = g.deals !== lastDeal && !still();
  lastDeal = g.deals;
  el.innerHTML = g.hand.map((c, i) => {
    if (!c) return `<div class="lk-pc is-empty" aria-hidden="true"></div>`;
    const su = SUITS[c.s], dis = g.chips < cost(c), face = c.s !== 'J' && FACE[c.r];
    return `<button class="lk-pc${su.red ? ' is-red' : ''}${i === sel ? ' is-sel' : ''}${dealt ? ' is-dealt' : ''}" style="--i:${i}" data-i="${i}" ${dis ? 'disabled' : ''} aria-pressed="${i === sel}" aria-label="${esc(cardName(c))}, ${cost(c)} chips${face ? ', ' + FACE[c.r].name : ''}">
      <span class="lk-rk">${rankLabel(c)}</span><span class="lk-st">${su.glyph}</span>${face ? '<span class="lk-fc" aria-hidden="true"></span>' : ''}<span class="lk-cost">${cost(c)}</span></button>`;
  }).join('');
  for (const b of el.querySelectorAll('button')) b.onclick = () => { const i = +b.dataset.i; sel = sel === i ? -1 : i; selTower = null; lastSig = ''; };
}
function syncUI() {
  if (!g) return;
  tickCoach();
  const sig = [g.chips, g.phase, g.wave, sel, g.towers.indexOf(selTower), g.vault, g.lost, g.redeals, speed, paused, g.towers.length, g.towers.reduce((a, t) => a + t.up[0] + t.up[1] + t.up[2], 0), g.hand.map(c => c ? c.s + c.r : '-').join('')].join('|');
  if (sig === lastSig) return;
  lastSig = sig;
  if (sel >= 0 && (!g.hand[sel] || g.chips < cost(g.hand[sel]))) sel = -1;
  const wave = g.phase === 'build' ? g.wave + 1 : g.wave;
  $('wave').textContent = g.endless ? String(wave) : wave + ' / ' + LAST_WAVE;
  const chipsEl = $('chips');
  chipsEl.textContent = g.chips;
  if (g.chips > lastChips && !still()) { chipsEl.classList.remove('lk-pop'); void chipsEl.offsetWidth; chipsEl.classList.add('lk-pop'); }
  lastChips = g.chips;
  $('cards').textContent = (VAULT_START - g.lost) + ' / ' + VAULT_START;
  $('cards').classList.toggle('lk-bad', g.lost >= 8);
  renderHand(); renderInfo();
  const playing = g.phase === 'build' || g.phase === 'wave';
  $('send').disabled = g.phase !== 'build'; $('send').textContent = g.phase === 'build' ? `Send wave ${g.wave + 1}` : 'Wave running';
  $('redeal').disabled = !playing || g.chips < redealCost(g); $('redeal').textContent = `Redeal · ${redealCost(g)}`;
  $('speed').textContent = speed + '×'; $('pause').textContent = paused ? 'Resume' : 'Pause';
  if (g.phase !== lastPhase) {
    lastPhase = g.phase;
    if (g.phase === 'over' || g.phase === 'won') showEnd();
  }
}

// --- first-game coaching ---------------------------------------------------
const COACH = [
  { text: () => sel >= 0 ? 'Now tap a marked spot beside the carpet.' : 'Pick a card from your hand.', nudge: () => sel >= 0 ? null : 'hand', done: () => g.towers.length >= 1 },
  { text: () => sel >= 0 ? 'Put it touching the first. Matching suits or ranks in a line make a hand.' : 'Pick another card.', nudge: () => sel >= 0 ? null : 'hand', done: () => g.towers.length >= 2 || !g.hand.some(c => c && g.chips >= cost(c)) },
  { text: () => 'Send the wave when you are ready.', nudge: () => 'send', done: () => g.phase !== 'build' || g.wave > 0 },
  { text: () => 'Thieves take a card and run for the door. Stop one and the card drops.', nudge: () => null, done: () => g.wave >= 1 && g.phase === 'build' },
  { text: () => 'Tap a card on the table to upgrade it. Upgrades matter more than extra cards.', nudge: () => null, done: () => g.wave >= 2 || g.towers.some(t => t.up.some(Boolean)) }
];
function tickCoach() {
  if (coach < 0) return;
  while (coach < COACH.length && COACH[coach].done()) coach++;
  if (coach >= COACH.length || g.phase === 'over' || g.phase === 'won') { endCoach(); return; }
  const text = COACH[coach].text(), nudge = COACH[coach].nudge();
  if (text + nudge === coachText) return;
  coachText = text + nudge;
  $('coach').hidden = false; $('coachtext').textContent = text;
  $('hand').classList.toggle('lk-nudge', nudge === 'hand'); $('send').classList.toggle('lk-nudge', nudge === 'send');
}
function endCoach() {
  coach = -1; coachText = ''; store.set('seen', '1');
  $('coach').hidden = true; $('hand').classList.remove('lk-nudge'); $('send').classList.remove('lk-nudge');
}
$('coachskip').onclick = endCoach;

// --- the daily board -------------------------------------------------------

// Today's board is asked for once when the page opens, and again by the reply
// to a finished daily game. A stranger can read it; only a member is on it.
function loadBoard() {
  if (quiet) return;
  fetch('/api/site/lockup/daily').then(r => r.ok ? r.json() : null).then(body => {
    if (!body) return;
    daily = { loaded: true, room: body.room, board: body.board, signedIn: body.signedIn };
    if (!g) renderInfo();
  }).catch(() => { });
}
// A finished daily game is sent as the list of moves that made it. The
// server plays them through the same rules and puts what it finds on the
// board, so the figure there is never this page's word for it.
function postDaily(moves) {
  const say = html => { const el = document.getElementById('lk-endboard'); if (el) el.innerHTML = html; };
  fetch('/api/site/lockup/daily', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moves }) })
    .then(r => r.json().then(body => ({ status: r.status, body })))
    .then(({ status, body }) => {
      if (status === 401) return say('<p class="lk-hint">Sign in on the home page to put your score on the board.</p>');
      if (status !== 200) return say(`<p class="lk-hint">${esc(body.error || 'The board could not be reached.')}</p>`);
      daily = { loaded: true, room: body.room, board: body.board, signedIn: true };
      const place = body.board.findIndex(r => r.you) + 1;
      say(`<p class="lk-hint">${body.counted ? `On today’s board: ${ordinal(place)} of ${body.board.length}.` : 'Your first game today is the one on the board.'}</p>${boardHtml(body.board.slice(0, 5))}`);
    }).catch(() => say('<p class="lk-hint">The board could not be reached.</p>'));
}

// --- start and end sheets --------------------------------------------------
const best = () => +store.get('best') || 0;
const segHtml = (label, attr, items, cur) => `<div class="lk-opt"><span>${label}</span><div class="lk-seg" role="group" aria-label="${label}">${items.map(([v, t]) => `<button type="button" data-${attr}="${v}" aria-pressed="${String(v) === String(cur)}">${t}</button>`).join('')}</div></div>`;
function showEnd() {
  const waves = cleared(g), kept = VAULT_START - g.lost, prev = best();
  // A drawn room can be as easy as its maker likes, so it is played for
  // itself: no best, no record, no board.
  const counted = g.mapIndex >= 0 && !quiet;
  if (counted && waves > prev) store.set('best', waves);
  if (counted && g.mode === 'daily') postDaily(g.log);
  else if (counted) {
    fetch('/api/site/lockup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ waves, room: g.room, stopped: g.stopped }) }).catch(() => { });
  }
  const won = g.phase === 'won';
  $('overlay').hidden = false;
  $('overlay').innerHTML = `<div class="lk-sheet"><p class="lk-eyebrow">${g.mode === 'daily' ? 'Daily table' : g.endless ? 'Endless' : 'Free play'} · ${M.name}</p>
    <h2 class="display">${won ? 'The vault holds.' : 'Cleaned out.'}</h2>
    <p>${won ? `All ${LAST_WAVE} waves turned away, with ${kept} of ${VAULT_START} cards still yours.` : `They got the lot on wave ${g.wave}. You saw off ${plural(waves, 'wave')}.`}</p>
    ${counted ? `<p class="lk-hint">${waves > prev ? 'A new best.' : `Your best is ${plural(prev, 'wave')}.`}</p>` : ''}
    <div id="lk-endboard"></div>
    <div class="lk-actions">${won && g.mode !== 'daily' ? '<button class="btn primary" type="button" data-endless>Keep going</button>' : ''}<button class="btn${won && g.mode !== 'daily' ? '' : ' primary'}" type="button" data-mode="${g.mode}">Play again</button><button class="btn" type="button" data-menu>Change table</button></div></div>`;
  wireSheet();
}
function showStart() {
  const b = best();
  if (pickMap < 0 && !customRoom) pickMap = 0;
  M = pickMap < 0 ? customRoom : MAPS[pickMap];
  const rooms = MAPS.map((m, i) => [i, m.name.replace('The ', '')]);
  if (customRoom) rooms.push([-1, 'Drawn']);
  $('overlay').hidden = false;
  $('overlay').innerHTML = `<div class="lk-sheet"><p class="lk-eyebrow">A tower defence for one</p>
    <h2 class="display">They’re coming for your cards.</h2>
    <ol class="lk-steps"><li><b>Deal</b> Five cards a wave. Pay chips to put any of them on the table.</li>
    <li><b>Upgrade</b> Cards are cheap. What you spend on them afterwards is what holds the door.</li>
    <li><b>Lock up</b> Stop a thief and the card drops. Let one out the door and it’s gone.</li></ol>
    ${segHtml('Room', 'map', rooms, pickMap)}
    ${segHtml('Stakes', 'stakes', [['low', 'Low'], ['standard', 'Standard'], ['high', 'High']], pickStakes)}
    <div class="lk-actions"><button class="btn primary" type="button" data-mode="free">Play</button><button class="btn" type="button" data-mode="daily">Play daily table</button><button class="btn" type="button" data-draw>Draw a room</button></div>
    <p class="lk-hint">${b ? `Your best is ${plural(b, 'wave')}. ` : ''}The daily table picks the room and deals everyone the same cards, at standard stakes.</p></div>`;
  wireSheet();
  renderInfo();
}
function wireSheet() {
  const o = $('overlay');
  for (const b of o.querySelectorAll('[data-mode]')) b.onclick = () => start(b.dataset.mode);
  for (const b of o.querySelectorAll('[data-map]')) b.onclick = () => { pickMap = +b.dataset.map; if (pickMap >= 0) store.set('map', pickMap); g = null; showStart(); };
  for (const b of o.querySelectorAll('[data-stakes]')) b.onclick = () => { pickStakes = b.dataset.stakes; store.set('stakes', pickStakes); showStart(); };
  for (const b of o.querySelectorAll('[data-menu]')) b.onclick = () => { g = null; resetHud(); showStart(); };
  for (const b of o.querySelectorAll('[data-draw]')) b.onclick = openEditor;
  for (const b of o.querySelectorAll('[data-endless]')) b.onclick = () => { if (keepGoing(g)) { $('overlay').hidden = true; lastPhase = g.phase; lastSig = ''; } };
}
function resetHud() { $('hand').innerHTML = ''; $('info').innerHTML = ''; $('wave').textContent = '1 / ' + LAST_WAVE; $('chips').textContent = CFG.start; $('cards').textContent = VAULT_START + ' / ' + VAULT_START; $('cards').classList.remove('lk-bad'); }
function start(mode, seed, opts) {
  const isDaily = mode === 'daily', table = isDaily ? dailyTable() : null;
  if (seed == null) seed = isDaily ? table.seed : (Math.random() * 2 ** 32) >>> 0;
  const room = opts && opts.map != null ? opts.map : isDaily ? table.room : pickMap >= 0 ? pickMap : customRoom;
  const stakes = opts && opts.stakes ? opts.stakes : isDaily ? 'standard' : pickStakes;
  g = newGame(seed, mode, room, stakes); M = typeof room === 'number' ? MAPS[room] : room;
  editor = null; sel = -1; selTower = null; paused = false; lastSig = ''; lastPhase = 'build'; lastChips = g.chips; lastDeal = 0;
  $('overlay').hidden = true;
  if (!quiet && !store.get('seen')) { coach = 0; coachText = ''; } else if (coach >= 0) endCoach();
  return g;
}

// --- drawing a room --------------------------------------------------------

// The editor is the board with no game on it. A room is a list of corners,
// and the rules say whether a list is a room (roomFault); the page only
// collects taps and refuses the ones that could never become one.
function openEditor() {
  editor = { cells: customRoom ? cellsOfCode(customRoom.code) : [], note: '' };
  g = null; resetHud();
  $('overlay').hidden = true;
  renderInfo();
}
function closeEditor(play) {
  const code = codeOfCells(editor.cells), room = roomFromCode(code);
  editor = null;
  if (room) {
    customRoom = room; pickMap = -1;
    try { history.replaceState(null, '', '#room=' + code); } catch (e) { }
  }
  if (play && room) start('free'); else showStart();
}
function editorTap(x, y) {
  if (!(x >= 0 && x < COLS && y >= 0 && y < ROWS)) return;
  const cells = editor.cells, last = cells[cells.length - 1];
  editor.note = '';
  if (!last) {
    if (x !== 0 && y !== 0 && x !== COLS - 1 && y !== ROWS - 1) editor.note = 'Start on an edge square: that is the door.';
    else cells.push([x, y]);
  } else if (last[0] === x && last[1] === y) {
    return;
  } else if ((last[0] !== x) === (last[1] !== y)) {
    editor.note = 'Pick a square in the same row or column as the last corner.';
  } else {
    cells.push([x, y]);
    const fault = roomFault(cells);
    if (/cross|corners/.test(fault)) { cells.pop(); editor.note = fault; }
  }
  renderInfo();
}
function drawEditor(c, W, H) {
  const cells = editor.cells, last = cells[cells.length - 1];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const edge = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
    const open = last ? (last[0] === x) !== (last[1] === y) : edge;
    if (open) {
      rr(c, x * S + S * .1, y * S + S * .1, S * .8, S * .8, S * .1);
      c.fillStyle = 'rgba(226,184,87,.06)'; c.fill(); c.strokeStyle = 'rgba(226,184,87,.28)'; c.lineWidth = 1; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]);
    } else { c.fillStyle = 'rgba(241,234,217,.1)'; c.fillRect((x + .5) * S - 1, (y + .5) * S - 1, 2, 2); }
  }
  if (!last) return;
  const trace = () => { c.beginPath(); cells.forEach(([x, y], i) => i ? c.lineTo((x + .5) * S, (y + .5) * S) : c.moveTo((x + .5) * S, (y + .5) * S)); };
  c.lineJoin = 'round'; c.lineCap = 'round';
  trace(); c.strokeStyle = 'rgba(226,184,87,.4)'; c.lineWidth = S * .84; c.stroke();
  trace(); c.strokeStyle = '#3a1420'; c.lineWidth = S * .78; c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#e2b857'; c.font = `600 ${Math.round(S * .2)}px system-ui, sans-serif`;
  c.fillText('DOOR', (cells[0][0] + .5) * S, (cells[0][1] + .5) * S);
  if (cells.length > 1) c.fillText('VAULT', (last[0] + .5) * S, (last[1] + .5) * S);
}
// A link somebody was sent: /lockup#room=... The code is checked by the
// rules like anything else off the wire, and a bad one is simply no room.
function readHash() {
  const m = /^#room=([0-9a-b]+)$/.exec(location.hash);
  const room = m && roomFromCode(m[1]);
  if (room) { customRoom = room; pickMap = -1; }
}

// --- input -----------------------------------------------------------------
function cellAt(e) { const r = cv.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / r.width * COLS), y: Math.floor((e.clientY - r.top) / r.height * ROWS) }; }
cv.addEventListener('pointermove', e => { hover = e.pointerType === 'touch' ? null : cellAt(e); });
cv.addEventListener('pointerleave', () => { hover = null; });
cv.addEventListener('click', e => {
  if (editor) { const { x, y } = cellAt(e); editorTap(x, y); return; }
  if (!g || paused) return;
  const { x, y } = cellAt(e), t = g.grid[y * COLS + x];
  if (t) { selTower = selTower === t ? null : t; sel = -1; }
  else if (sel >= 0 && g.hand[sel]) { if (place(g, sel, x, y)) { sel = -1; selTower = null; } }
  else selTower = null;
  lastSig = '';
});
$('send').onclick = () => { if (g) sendWave(g); };
$('redeal').onclick = () => { if (g) { redeal(g); sel = -1; } };
$('speed').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; lastSig = ''; $('speed').textContent = speed + '×'; };
$('pause').onclick = () => { if (!g) return; paused = !paused; lastSig = ''; };
$('mute').onclick = () => { muted = !muted; store.set('muted', muted ? '1' : '0'); $('mute').textContent = muted ? 'Turn sound on' : 'Mute sound'; };
$('mute').textContent = muted ? 'Turn sound on' : 'Mute sound';
addEventListener('keydown', e => {
  if (!g || e.target.closest('input,textarea')) return;
  if (e.key >= '1' && e.key <= '5') { const i = +e.key - 1; if (g.hand[i] && g.chips >= cost(g.hand[i])) { sel = sel === i ? -1 : i; selTower = null; lastSig = ''; } }
  else if (e.key === ' ' && e.target === document.body) { e.preventDefault(); if (g.phase === 'build') sendWave(g); else $('pause').click(); }
  else if (e.key === 'Escape') { sel = -1; selTower = null; lastSig = ''; }
});

// --- loop ------------------------------------------------------------------
let last = performance.now(), acc = 0;
function frame(now) {
  const el = Math.min(.1, (now - last) / 1000); last = now;
  if (g && !paused && (g.phase === 'wave' || g.phase === 'build')) {
    acc += el * speed;
    while (acc >= DT) { step(g, DT); acc -= DT; }
  }
  drainEvents(); syncUI(); draw();
  requestAnimationFrame(frame);
}
// A link to a drawn room opened while the page is already up changes only
// what follows the #, which loads nothing, so it is read again here.
addEventListener('hashchange', () => { readHash(); if (!g && !editor) showStart(); });
fit(); readHash(); showStart(); loadBoard(); requestAnimationFrame(frame);

// A handle for the console: start a game, place cards and step the rules by
// hand, which is how a change to CFG is tried before it is kept.
window.lockup = {
  get g() { return g; }, get map() { return M; }, start, rules: globalThis.LockupRules,
  set quiet(v) { quiet = v; },
};
})();

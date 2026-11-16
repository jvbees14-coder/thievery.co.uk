// ---------------------------------------------------------------------------
// Why so much is bell-shaped: the scene.
//
// The chances of every total of n dice, worked out exactly by adding one
// die at a time (a convolution), drawn as a line; under it, bars of real
// rolls piling up while the scene plays. Chapter 4 swaps in a loaded die
// that shows 1 half the time, 2 to 4 otherwise and never 5 or 6.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { plot } from '../shared/plot.js';

const FAIR = [1, 1, 1, 1, 1, 1];
const LOADED = [3, 1, 1, 1, 0, 0];
const st = { n: 1, face: FAIR, tally: [], rolls: 0, last: [], acc: 0, readout: null, ways: false };

/** The exact chance of each total, indexed by the total itself. */
export function totals(n, face) {
  const sum = face.reduce((a, b) => a + b);
  let d = [1];
  for (let k = 0; k < n; k++) {
    const e = new Array(d.length + 6).fill(0);
    d.forEach((p, i) => face.forEach((q, j) => (e[i + j + 1] += (p * q) / sum)));
    d = e;
  }
  return d;
}

function rollOne() {
  const sum = st.face.reduce((a, b) => a + b);
  let r = Math.random() * sum;
  for (let j = 0; j < 6; j++) {
    r -= st.face[j];
    if (r < 0) return j + 1;
  }
  return 1;
}

function roll(times) {
  for (let t = 0; t < times; t++) {
    st.last = Array.from({ length: Math.min(st.n, 20) }, rollOne);
    const total = st.last.reduce((a, b) => a + b, 0);
    st.tally[total] = (st.tally[total] || 0) + 1;
    st.rolls++;
  }
}

function reset() {
  st.tally = [];
  st.rolls = 0;
  st.last = [];
}

function die(ctx, x, y, s, v, col) {
  ctx.fillStyle = col.stock;
  ctx.strokeStyle = col['stock-edge'];
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, s * 0.18);
  ctx.fill();
  ctx.stroke();
  const pips = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] }[v];
  ctx.fillStyle = col['stock-ink'];
  for (const [i, j] of pips) {
    ctx.beginPath();
    ctx.arc(x + s * (0.25 + i * 0.25), y + s * (0.25 + j * 0.25), s * 0.08, 0, TAU);
    ctx.fill();
  }
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const moving = api.playing && api.motion;
  if (moving) {
    st.acc += f.dt * (st.n > 5 ? 120 : 40);
    const k = Math.floor(st.acc);
    st.acc -= k;
    if (k) roll(k);
  }
  const exact = totals(st.n, st.face);
  const lo = st.n, hi = 6 * st.n;
  let peak = 0;
  exact.forEach((p, i) => { if (p > exact[peak]) peak = i; });
  let most = 0;
  for (let v = lo; v <= hi; v++) most = Math.max(most, (st.tally[v] || 0) / Math.max(1, st.rolls));
  // Until there are enough rolls, a lone bar would set the scale; let the exact chances do it.
  const top = Math.max(exact[peak] * 1.25, st.rolls >= 300 ? most * 1.1 : 0);
  const step = top > 0.4 ? 0.1 : top > 0.12 ? 0.05 : 0.02;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(Math.round(v * 100) / 100);
  const xt = [];
  const every = Math.max(1, Math.ceil((hi - lo + 1) / 12));
  for (let v = lo; v <= hi; v += every) xt.push(v);
  const g = plot(ctx, col, bg, { x0: 54, x1: w - 20, y0: 120, y1: h - 44 },
    { min: lo - 0.6, max: hi + 0.6, ticks: xt, name: st.n === 1 ? 'The face' : 'The total' },
    { min: 0, max: top, ticks, fmt: (v) => `${Math.round(v * 100)}%`, name: 'Share of rolls' });
  const bw = Math.max(1, (g.X(lo + 1) - g.X(lo)) * 0.8);
  for (let v = lo; v <= hi; v++) {
    const c = st.tally[v] || 0;
    if (!c) continue;
    const p = Math.min(top, c / st.rolls);
    ctx.fillStyle = alpha(col['hiw-ink-1'], 0.55);
    ctx.fillRect(g.X(v) - bw / 2, g.Y(p), bw, g.Y(0) - g.Y(p));
  }
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let v = lo; v <= hi; v++) (v === lo ? ctx.moveTo : ctx.lineTo).call(ctx, g.X(v), g.Y(exact[v] || 0));
  ctx.stroke();
  for (let v = lo; v <= hi; v++) {
    ctx.beginPath();
    ctx.arc(g.X(v), g.Y(exact[v] || 0), st.n > 8 ? 2 : 3.5, 0, TAU);
    ctx.fillStyle = col.accent;
    ctx.fill();
  }
  if (st.ways && st.n === 2) {
    for (let v = 2; v <= 12; v++) label(ctx, `${Math.round(exact[v] * 36)}`, g.X(v), g.Y(exact[v]) - 14, col.accent, bg, { size: 12, weight: 700, align: 'center' });
    label(ctx, 'Ways out of 36', g.x1, 100, col.accent, bg, { size: 11, align: 'right' });
  }
  // The dice of the last roll, along the top.
  const show = st.last.length ? st.last : [];
  const s = Math.min(26, (w - 120) / Math.max(1, show.length) - 4);
  show.forEach((v, i) => die(ctx, 54 + i * (s + 4), 58, s, v, col));
  if (show.length) label(ctx, `= ${show.reduce((a, b) => a + b, 0)}`, 54 + show.length * (s + 4) + 6, 58 + s / 2, col.label, bg, { size: 14, weight: 700 });
  st.readout?.set('peak', `${peak}`);
  st.readout?.set('chance', `${fmt(exact[peak] * 100, 1)}%`);
  st.readout?.set('rolls', fmt(st.rolls));
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.ways = id === 'two';
  st.face = id === 'lopsided' ? LOADED : FAIR;
  st.n = { one: 1, two: 2, many: 10, lopsided: 1 }[id];
  reset();
  api.note({ one: 'One fair die', two: 'Two fair dice', many: 'Any number of fair dice', lopsided: 'A loaded die' }[id]);
  if (id === 'many' || id === 'lopsided') {
    ui.slider({ label: 'Dice', min: 1, max: 20, value: st.n, onInput(v) { st.n = v; reset(); api.invalidate(); } });
  }
  if (id === 'lopsided') {
    ui.choice({
      label: 'Die',
      options: [{ id: 'loaded', label: 'Loaded' }, { id: 'fair', label: 'Fair' }],
      value: 'loaded',
      onChange(v) { st.face = v === 'fair' ? FAIR : LOADED; reset(); api.invalidate(); },
    });
  }
  ui.button({ label: 'Roll 1,000 times', onClick() { roll(1000); api.status(`${fmt(st.rolls)} rolls so far.`); api.invalidate(); } });
  ui.button({ label: 'Start again', onClick() { reset(); api.invalidate(); } });
  st.readout = api.readout([{ key: 'peak', label: 'Most likely' }, { key: 'chance', label: 'Its chance' }, { key: 'rolls', label: 'Rolls' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

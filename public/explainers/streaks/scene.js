// ---------------------------------------------------------------------------
// Why real chance is streaky: the scene.
//
// Tosses drawn as a row of discs, wrapped into lines of 20. A made-up list
// is a chain that switches face two times in three, which is about what
// people do; a real one switches half the time. Chapter 2 is the exact
// chance of each longest run in n tosses, by counting the lists whose runs
// all stop at k or shorter. Chapter 4 scatters 100 points over a ten by
// ten grid and shades each square by how many it caught.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { plot } from '../shared/plot.js';

const st = { real: [], fake: [], n: 100, pts: [], even: false, left: null, score: [0, 0], readout: null };

const toss = (n, switchChance) => {
  const s = [Math.random() < 0.5 ? 1 : 0];
  for (let i = 1; i < n; i++) s.push(Math.random() < switchChance ? 1 - s[i - 1] : s[i - 1]);
  return s;
};
const longest = (s) => { let best = 0, run = 0; s.forEach((v, i) => { run = i && v === s[i - 1] ? run + 1 : 1; best = Math.max(best, run); }); return best; };
const switches = (s) => s.reduce((a, v, i) => a + (i && v !== s[i - 1] ? 1 : 0), 0);

/** The chance that every run in n tosses is k long or shorter. */
function atMost(n, k) {
  let a = new Array(k + 2).fill(0);
  a[1] = 1;
  for (let i = 2; i <= n; i++) {
    const b = new Array(k + 2).fill(0);
    for (let r = 1; r <= k; r++) {
      if (!a[r]) continue;
      b[1] += a[r] / 2;
      if (r + 1 <= k) b[r + 1] += a[r] / 2;
    }
    a = b;
  }
  return a.reduce((x, y) => x + y, 0);
}

function fresh() {
  st.real = toss(100, 0.5);
  st.fake = toss(100, 0.67);
  st.left = Math.random() < 0.5 ? 'real' : 'fake';
}

function scatter() {
  st.pts = [];
  if (st.even) {
    for (let i = 0; i < 100; i++) st.pts.push([(i % 10 + 0.3 + Math.random() * 0.4) / 10, (Math.floor(i / 10) + 0.3 + Math.random() * 0.4) / 10]);
  } else for (let i = 0; i < 100; i++) st.pts.push([Math.random(), Math.random()]);
}

function row(ctx, s, x0, y0, wid, col, bg, title) {
  const per = 10, d = Math.min(wid / per, 26);
  // Mark the longest run.
  const L = longest(s);
  let end = -1, run = 0;
  s.forEach((v, i) => { run = i && v === s[i - 1] ? run + 1 : 1; if (run === L && end < 0) end = i; });
  label(ctx, title, x0, y0 - 16, col.label, bg, { size: 13, weight: 700 });
  s.forEach((v, i) => {
    const x = x0 + (i % per) * d + d / 2, y = y0 + Math.floor(i / per) * d + d / 2;
    const inRun = i > end - L && i <= end;
    ctx.beginPath();
    ctx.arc(x, y, d * 0.38, 0, TAU);
    ctx.fillStyle = v ? col['hiw-ink-1'] : col['hiw-ink-2'];
    ctx.fill();
    if (inRun) {
      ctx.strokeStyle = col.label;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    label(ctx, v ? 'H' : 'T', x, y, col.bg, null, { size: Math.max(8, d * 0.4), align: 'center' });
  });
  return y0 + Math.ceil(s.length / per) * d;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'fake' || ch === 'spot') {
    const half = (w - 60) / 2;
    const A = ch === 'spot' ? (st.left === 'real' ? st.real : st.fake) : st.fake;
    const B = ch === 'spot' ? (st.left === 'real' ? st.fake : st.real) : st.real;
    const names = ch === 'spot' ? ['List A', 'List B'] : ['Made up', 'Real tosses'];
    const y = 84;
    row(ctx, A, 20, y, half, col, bg, names[0]);
    const bottom = row(ctx, B, 40 + half, y, half, col, bg, names[1]);
    if (ch === 'fake' || st.revealed) {
      label(ctx, `Longest run ${longest(A)} · ${switches(A)} switches`, 20, bottom + 18, col['label-secondary'], bg, { size: 12 });
      label(ctx, `Longest run ${longest(B)} · ${switches(B)} switches`, 40 + half, bottom + 18, col['label-secondary'], bg, { size: 12 });
    }
    if (ch === 'fake') {
      r?.set('fake', `${longest(st.fake)}`);
      r?.set('real', `${longest(st.real)}`);
    } else {
      r?.set('score', `${st.score[0]} of ${st.score[1]}`);
    }
  } else if (ch === 'longest') {
    const n = st.n;
    const probs = [];
    let prev = 0;
    for (let k = 1; k <= 16; k++) { const c = atMost(n, k); probs.push(c - prev); prev = c; }
    const top = Math.max(...probs) * 1.2;
    const step = top > 0.3 ? 0.1 : 0.05;
    const ticks = [];
    for (let v = 0; v <= top; v += step) ticks.push(Math.round(v * 100) / 100);
    const g = plot(ctx, col, bg, { x0: 54, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0.4, max: 16.6, ticks: [1, 2, 4, 6, 8, 10, 12, 14, 16], name: 'Longest run' },
      { min: 0, max: top, ticks, fmt: (v) => `${Math.round(v * 100)}%`, name: `Chance, in ${fmt(n)} tosses` });
    const bw = (g.X(2) - g.X(1)) * 0.7;
    let best = 0;
    probs.forEach((p, i) => {
      if (p > probs[best]) best = i;
      ctx.fillStyle = col['hiw-ink-1'];
      ctx.fillRect(g.X(i + 1) - bw / 2, g.Y(p), bw, g.Y(0) - g.Y(p));
      if (p > 0.005) label(ctx, `${fmt(p * 100, 0)}%`, g.X(i + 1), g.Y(p) - 11, col['label-secondary'], bg, { size: 10, align: 'center' });
    });
    r?.set('mode', `${best + 1}`);
    r?.set('five', `${fmt((1 - atMost(n, 4)) * 100, 1)}%`);
  } else if (ch === 'clusters') {
    const side = Math.min(w - 40, h - 120);
    const x0 = (w - side) / 2, y0 = 60, c = side / 10;
    const counts = new Array(100).fill(0);
    for (const [px, py] of st.pts) counts[Math.min(9, Math.floor(py * 10)) * 10 + Math.min(9, Math.floor(px * 10))]++;
    counts.forEach((k, i) => {
      ctx.fillStyle = k === 0 ? alpha(col['label-tertiary'], 0.06) : alpha(col.danger, Math.min(0.75, k * 0.18));
      ctx.fillRect(x0 + (i % 10) * c, y0 + Math.floor(i / 10) * c, c, c);
    });
    ctx.strokeStyle = col.separator;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(x0 + i * c, y0);
      ctx.lineTo(x0 + i * c, y0 + side);
      ctx.moveTo(x0, y0 + i * c);
      ctx.lineTo(x0 + side, y0 + i * c);
      ctx.stroke();
    }
    for (const [px, py] of st.pts) {
      ctx.beginPath();
      ctx.arc(x0 + px * side, y0 + py * side, 3, 0, TAU);
      ctx.fillStyle = col.label;
      ctx.fill();
    }
    r?.set('empty', `${counts.filter((k) => k === 0).length}`);
    r?.set('three', `${counts.filter((k) => k >= 3).length}`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  st.revealed = false;
  api.note({ fake: 'Heads and tails, 100 of each list', longest: 'Exact chances for a fair coin', spot: 'One list is real and one is made up', clusters: '100 points over 100 squares' }[id]);
  if (id === 'fake') {
    fresh();
    ui.button({ label: 'Toss again', onClick() { fresh(); api.invalidate(); } });
    st.readout = api.readout([{ key: 'fake', label: 'Longest run, made up' }, { key: 'real', label: 'Longest run, real' }]);
  } else if (id === 'longest') {
    ui.slider({ label: 'Tosses', min: 10, max: 1000, step: 10, value: st.n, format: (v) => fmt(v), onInput(v) { st.n = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'mode', label: 'Most likely longest run' }, { key: 'five', label: 'A run of 5 or more' }]);
  } else if (id === 'spot') {
    fresh();
    const guess = (pick) => {
      if (st.revealed) return;
      const right = pick === st.left;
      st.score[1]++;
      if (right) st.score[0]++;
      st.revealed = true;
      api.status(`${right ? 'Right' : 'Wrong'}: list ${st.left === 'real' ? 'A' : 'B'} was the real one.`);
      api.invalidate();
    };
    ui.button({ label: 'A is real', onClick() { guess('real'); } });
    ui.button({ label: 'B is real', onClick() { guess('fake'); } });
    ui.button({ label: 'Next pair', onClick() { fresh(); st.revealed = false; api.status(''); api.invalidate(); } });
    st.readout = api.readout([{ key: 'score', label: 'Right so far' }]);
  } else if (id === 'clusters') {
    st.even = false;
    scatter();
    ui.choice({
      label: 'Points',
      options: [{ id: 'random', label: 'At random' }, { id: 'even', label: 'Spread out' }],
      value: 'random',
      onChange(v) { st.even = v === 'even'; scatter(); api.invalidate(); },
    });
    ui.button({ label: 'Scatter again', onClick() { scatter(); api.invalidate(); } });
    st.readout = api.readout([{ key: 'empty', label: 'Empty squares' }, { key: 'three', label: 'Squares with 3 or more' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

// ---------------------------------------------------------------------------
// How polls work: the scene.
//
// A country in which 52% favour one option. Chapter 1 draws one sample from
// a crowd; chapter 2 runs hundreds of polls and stacks up their answers;
// chapter 3 changes the sample size; chapter 4 makes one side less willing
// to answer, which no sample size can fix.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const TRUE = 0.52, CROWD = 1200;
const st = { n: 1000, results: [], sample: new Set(), crowd: [], reluctance: 0.6, readout: null };
st.crowd = Array.from({ length: CROWD }, () => Math.random() < TRUE);

const moe = (n) => 1.96 * Math.sqrt((TRUE * (1 - TRUE)) / n);

/** One poll of n people; supporters answer only with chance `answer`. */
function poll(n, answer = 1) {
  let yes = 0, got = 0;
  while (got < n) {
    const supports = Math.random() < TRUE;
    if (supports && Math.random() > answer) continue;
    if (supports) yes++;
    got++;
  }
  return yes / n;
}
function runPolls(count = 300, answer = 1) {
  st.results = Array.from({ length: count }, () => poll(st.n, answer));
}

function histogram(ctx, w, h, col, bg, results, lo = 0.4, hi = 0.64) {
  const x0 = 30, x1 = w - 20, y0 = 90, y1 = h - 50, bins = 48;
  const X = (v) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  const counts = new Array(bins).fill(0);
  for (const v of results) {
    const b = Math.floor(((v - lo) / (hi - lo)) * bins);
    if (b >= 0 && b < bins) counts[b]++;
  }
  const max = Math.max(5, ...counts), bw = (x1 - x0) / bins;
  // The band within the margin of error.
  ctx.fillStyle = alpha(col.success, 0.12);
  ctx.fillRect(X(TRUE - moe(st.n)), y0, X(TRUE + moe(st.n)) - X(TRUE - moe(st.n)), y1 - y0);
  counts.forEach((c, i) => {
    const bh = (c / max) * (y1 - y0);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fillRect(x0 + i * bw + 1, y1 - bh, bw - 2, bh);
  });
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X(TRUE), y0 - 8);
  ctx.lineTo(X(TRUE), y1);
  ctx.stroke();
  label(ctx, 'The truth, 52%', X(TRUE) + 6, y0 - 4, col.accent, bg, { size: 11, weight: 700 });
  for (let pc = Math.ceil(lo * 20) * 5; pc <= hi * 100; pc += 5) label(ctx, `${pc}%`, X(pc / 100), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'What each poll said', x1, y1 + 30, col['label-tertiary'], bg, { size: 11, align: 'right' });
}

function crowd(ctx, w, h, col, bg) {
  const cols = 40, cell = Math.min((w - 32) / cols, (h - 110) / (CROWD / cols)), x0 = (w - cell * cols) / 2;
  st.crowd.forEach((yes, i) => {
    const asked = st.sample.has(i);
    ctx.globalAlpha = st.sample.size && !asked ? 0.25 : 1;
    ctx.beginPath();
    ctx.arc(x0 + (i % cols) * cell + cell / 2, 70 + Math.floor(i / cols) * cell + cell / 2, cell * (asked ? 0.45 : 0.34), 0, TAU);
    ctx.fillStyle = yes ? col['hiw-ink-1'] : col['hiw-ink-2'];
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'sample') {
    crowd(ctx, w, h, col, bg);
    const yes = [...st.sample].filter((i) => st.crowd[i]).length;
    r?.set('said', st.sample.size ? `${fmt((yes / st.sample.size) * 100, 0)}% in favour` : '–');
    r?.set('truth', `${fmt((st.crowd.filter(Boolean).length / CROWD) * 100, 0)}% in favour`);
  } else {
    histogram(ctx, w, h, col, bg, st.results, ch === 'bias' ? 0.3 : 0.4, ch === 'bias' ? 0.64 : 0.64);
    const inside = st.results.filter((v) => Math.abs(v - TRUE) <= moe(st.n)).length;
    const mean = st.results.reduce((a, b) => a + b, 0) / (st.results.length || 1);
    r?.set('moe', `±${fmt(moe(st.n) * 100, 1)} points`);
    r?.set('inside', `${fmt((inside / (st.results.length || 1)) * 100, 0)}%`);
    r?.set('mean', `${fmt(mean * 100, 1)}%`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ sample: '1,200 people; blue are in favour', spread: '300 polls of 1,000 people each', size: 'Change how many each poll asks', bias: 'Supporters less willing to answer' }[id]);
  if (id === 'sample') {
    const take = () => {
      st.sample = new Set();
      while (st.sample.size < 100) st.sample.add(Math.floor(Math.random() * CROWD));
      api.invalidate();
    };
    take();
    ui.button({ label: 'Ask another 100', onClick: take });
    st.readout = api.readout([{ key: 'said', label: 'This poll says' }, { key: 'truth', label: 'The whole crowd' }]);
  } else if (id === 'spread' || id === 'size') {
    if (id === 'spread') st.n = 1000;
    runPolls();
    if (id === 'size') ui.slider({ label: 'People asked in each poll', min: 100, max: 5000, step: 100, value: st.n, format: (v) => fmt(v), onInput(v) { st.n = v; runPolls(); api.invalidate(); } });
    ui.button({ label: 'Run 300 more polls', onClick() { runPolls(); api.invalidate(); } });
    st.readout = api.readout([{ key: 'moe', label: 'Margin of error' }, { key: 'inside', label: 'Polls within it' }]);
  } else if (id === 'bias') {
    st.n = 1000;
    const run = () => { runPolls(300, st.reluctance); api.invalidate(); };
    run();
    ui.slider({ label: 'Supporters who answer, against everyone else', min: 0.4, max: 1, step: 0.05, value: st.reluctance, format: (v) => `${Math.round(v * 100)}%`, onInput(v) { st.reluctance = v; run(); } });
    ui.slider({ label: 'People asked in each poll', min: 100, max: 5000, step: 100, value: st.n, format: (v) => fmt(v), onInput(v) { st.n = v; run(); } });
    st.readout = api.readout([{ key: 'mean', label: 'Average of the polls' }, { key: 'inside', label: 'Polls within the margin' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });


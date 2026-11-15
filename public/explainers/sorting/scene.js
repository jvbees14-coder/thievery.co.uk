// ---------------------------------------------------------------------------
// How computers sort: the scene.
//
// Chapters 1 to 3 play one sort on 32 shuffled bars, a step at a time,
// lighting the two bars being compared and counting. Chapter 4 races the
// three on longer rows: merge and quicksort are counted by running them,
// bubble sort by its formula, n(n − 1)/2, which it nearly always needs.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';
import { SORTS, shuffled, count } from './art.js';

const N = 32;
const st = {
  name: 'bubble', a: [], run: null, ev: null, compares: 0, moves: 0, done: false,
  sorted: new Set(), acc: 0,
  n: 1000, race: null,
  readout: null,
};

function restart(name) {
  st.name = name;
  st.a = shuffled(N);
  st.run = SORTS[name](st.a);
  st.ev = null;
  st.compares = 0;
  st.moves = 0;
  st.done = false;
  st.sorted = new Set();
}

function advance() {
  if (st.done) return;
  const r = st.run.next();
  if (r.done) {
    st.done = true;
    st.ev = null;
    return;
  }
  st.ev = r.value;
  if (st.ev[0] === 'compare') st.compares++;
  else if (st.ev[0] === 'swap' || st.ev[0] === 'write') st.moves++;
  else if (st.ev[0] === 'done') for (let i = st.ev[1]; i < N; i++) st.sorted.add(i);
  else if (st.ev[0] === 'pivot') st.sorted.add(st.ev[1]);
}

function drawBars(ctx, w, h, col) {
  const x0 = 16, x1 = w - 16, y0 = 64, y1 = h - 24;
  const bw = (x1 - x0) / N;
  const ev = st.ev || [];
  st.a.forEach((v, i) => {
    const bh = (v / N) * (y1 - y0);
    let c = alpha(col['hiw-ink-1'], 0.75);
    if (st.done || st.sorted.has(i)) c = col.success;
    if ((ev[0] === 'compare' && (ev[1] === i || ev[2] === i))) c = col.accent;
    if ((ev[0] === 'swap' && (ev[1] === i || ev[2] === i)) || (ev[0] === 'write' && ev[1] === i)) c = col['hiw-ink-2'];
    box(ctx, x0 + i * bw + 1, y1 - bh, bw - 2, bh, Math.min(3, bw / 4));
    ctx.fillStyle = c;
    ctx.fill();
  });
}

function race() {
  // Average a few runs of the two quick ones; bubble sort by its formula.
  const runs = st.n <= 500 ? 5 : 2;
  let m = 0, q = 0;
  for (let k = 0; k < runs; k++) {
    m += count('merge', st.n);
    q += count('quick', st.n);
  }
  st.race = { bubble: (st.n * (st.n - 1)) / 2, merge: m / runs, quick: q / runs };
}

function drawRace(ctx, w, h, col, bg) {
  const rows = [['Bubble sort', 'bubble', col['hiw-ink-2']], ['Merge sort', 'merge', col['hiw-ink-1']], ['Quicksort', 'quick', col.accent]];
  const max = st.race.bubble, x0 = 20, x1 = w - 20;
  rows.forEach(([name, key, c], i) => {
    const y = 90 + i * Math.min(130, Math.max(80, (h - 200) / 3)), v = st.race[key];
    label(ctx, name, x0, y, col.label, bg, { size: 14, weight: 700 });
    label(ctx, `${fmt(Math.round(v))} comparisons`, x1, y, col['label-secondary'], bg, { size: 12, align: 'right' });
    box(ctx, x0, y + 14, Math.max(3, (v / max) * (x1 - x0)), 22, 5);
    ctx.fillStyle = c;
    ctx.fill();
  });
  label(ctx, `Sorting ${fmt(st.n)} shuffled numbers`, x0, h - 24, col['label-tertiary'], bg, { size: 11 });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (ch === 'race') {
    drawRace(ctx, w, h, col, bg);
    r?.set('ratio', `${fmt(st.race.bubble / st.race.merge, 0)} times as many`);
    return false;
  }
  if (api.playing && api.motion && !st.done) {
    st.acc += dt * 40;
    while (st.acc >= 1 && !st.done) {
      advance();
      st.acc -= 1;
    }
    moving = true;
  }
  drawBars(ctx, w, h, col);
  r?.set('compares', fmt(st.compares));
  r?.set('moves', fmt(st.moves));
  if (st.done) api.status('Sorted.');
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  if (id === 'race') {
    api.note('Comparisons needed, three ways');
    race();
    ui.slider({
      label: 'How many numbers',
      min: 100,
      max: 3000,
      step: 100,
      value: st.n,
      format: (v) => fmt(v),
      onInput(v) { st.n = v; race(); api.invalidate(); },
    });
    st.readout = api.readout([{ key: 'ratio', label: 'Bubble sort against merge sort' }]);
    api.invalidate();
    return;
  }
  api.note({ bubble: 'Bubble sort, 32 bars', merge: 'Merge sort, 32 bars', quick: 'Quicksort, 32 bars' }[id]);
  restart(id);
  ui.button({ label: 'One step', onClick() { advance(); api.invalidate(); } });
  ui.button({ label: 'Finish', onClick() { while (!st.done) advance(); api.invalidate(); } });
  ui.button({ label: 'Shuffle', onClick() { restart(id); api.status(''); api.invalidate(); } });
  st.readout = api.readout([{ key: 'compares', label: 'Comparisons' }, { key: 'moves', label: 'Moves' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

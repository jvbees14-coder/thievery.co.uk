// ---------------------------------------------------------------------------
// Finding π with random darts: the scene.
//
// Chapter 1 throws darts at a square with a quarter circle in it; four
// times the share that land inside is close to π. Chapter 2 plots the
// estimate as darts pile up. Chapter 3 is Buffon's needle (1777): needles
// as long as the gap between lines cross a line with chance 2/π. Chapter 4
// measures the area of an awkward shape the same way.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const st = { darts: [], inside: 0, history: [], needles: [], crossed: 0, blob: [], blobIn: 0, acc: 0, readout: null };

// An awkward lake: inside when the wobbly radius is greater than the distance.
const lakeR = (a) => 0.33 + 0.08 * Math.sin(3 * a) + 0.05 * Math.cos(5 * a + 1);
const inLake = (x, y) => Math.hypot(x - 0.5, y - 0.5) < lakeR(Math.atan2(y - 0.5, x - 0.5));
const LAKE = (() => {
  // Its true area, by a fine grid, for comparison.
  let n = 0;
  const g = 600;
  for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) if (inLake((i + 0.5) / g, (j + 0.5) / g)) n++;
  return n / (g * g);
})();

function reset() {
  st.darts = [];
  st.inside = 0;
  st.history = [];
  st.needles = [];
  st.crossed = 0;
  st.blob = [];
  st.blobIn = 0;
}

function throwDart() {
  const x = Math.random(), y = Math.random(), hit = x * x + y * y <= 1;
  if (st.darts.length < 4000) st.darts.push([x, y, hit]);
  if (hit) st.inside++;
  st.history.push(4 * st.inside / (st.history.length + 1));
}
function dropNeedle() {
  // Lines one unit apart, needles one unit long.
  const y = Math.random() * 6, a = Math.random() * Math.PI, x = 0.5 + Math.random() * 5;
  const dy = (Math.sin(a) / 2);
  const crosses = Math.floor(y - dy) !== Math.floor(y + dy);
  if (st.needles.length < 600) st.needles.push([x, y, a, crosses]);
  if (crosses) st.crossed++;
  st.dropped = (st.dropped || 0) + 1;
}
function throwAtLake() {
  const x = Math.random(), y = Math.random(), hit = inLake(x, y);
  if (st.blob.length < 4000) st.blob.push([x, y, hit]);
  if (hit) st.blobIn++;
  st.blobN = (st.blobN || 0) + 1;
}

function square(ctx, w, h) {
  const size = Math.min(w - 40, h - 90);
  return { x0: (w - size) / 2, y0: 70, size };
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (api.playing && api.motion) {
    st.acc += dt * (ch === 'needle' ? 20 : 120);
    while (st.acc >= 1) {
      if (ch === 'needle') dropNeedle();
      else if (ch === 'uses') throwAtLake();
      else throwDart();
      st.acc -= 1;
    }
    moving = true;
  }
  if (ch === 'darts' || ch === 'uses') {
    const { x0, y0, size } = square(ctx, w, h);
    ctx.strokeStyle = col.separator;
    ctx.strokeRect(x0, y0, size, size);
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ch === 'darts') ctx.arc(x0, y0 + size, size, -Math.PI / 2, 0);
    else for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * TAU, rr = lakeR(a);
      const px = x0 + (0.5 + Math.cos(a) * rr) * size, py = y0 + (0.5 + Math.sin(a) * rr) * size;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    for (const [x, y, hit] of ch === 'darts' ? st.darts : st.blob) {
      ctx.fillStyle = hit ? col['hiw-ink-1'] : alpha(col['hiw-ink-2'], 0.8);
      ctx.fillRect(x0 + x * size - 1.5, ch === 'darts' ? y0 + size - y * size - 1.5 : y0 + y * size - 1.5, 3, 3);
    }
    if (ch === 'darts') {
      const n = st.history.length;
      r?.set('n', fmt(n));
      r?.set('pi', n ? fmt(4 * st.inside / n, 4) : '–');
    } else {
      const n = st.blobN || 0;
      r?.set('n', fmt(n));
      r?.set('area', n ? `${fmt((st.blobIn / n) * 100, 1)}% of the square` : '–');
      r?.set('true', `${fmt(LAKE * 100, 1)}%`);
    }
  } else if (ch === 'converge') {
    const x0 = 50, x1 = w - 20, y0 = 80, y1 = h - 40, N = Math.max(100, st.history.length);
    const X = (i) => x0 + (Math.log10(i + 1) / Math.log10(N + 1)) * (x1 - x0), Y = (v) => (y0 + y1) / 2 - ((v - Math.PI) / 0.6) * ((y1 - y0) / 2);
    ctx.strokeStyle = col.accent;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, Y(Math.PI));
    ctx.lineTo(x1, Y(Math.PI));
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'π = 3.14159…', x0 + 4, Y(Math.PI) - 10, col.accent, bg, { size: 11 });
    // The typical error, shrinking as 1/√n.
    ctx.fillStyle = alpha(col.success, 0.12);
    ctx.beginPath();
    for (let i = 1; i <= N; i *= 1.1) ctx.lineTo(X(i), Y(Math.PI + 1.64 / Math.sqrt(i)));
    for (let i = N; i >= 1; i /= 1.1) ctx.lineTo(X(i), Y(Math.PI - 1.64 / Math.sqrt(i)));
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();
    ctx.strokeStyle = col['hiw-ink-1'];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    st.history.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.stroke();
    ctx.restore();
    for (const n of [1, 10, 100, 1000, 10000, 100000]) if (n <= N) label(ctx, fmt(n), X(n), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
    label(ctx, 'Darts thrown', x1, y1 + 28, col['label-tertiary'], bg, { size: 11, align: 'right' });
    const n = st.history.length;
    r?.set('n', fmt(n));
    r?.set('pi', n ? fmt(st.history[n - 1], 4) : '–');
  } else if (ch === 'needle') {
    const x0 = 20, y0 = 70, unit = Math.min((w - 40) / 6, (h - 100) / 6);
    ctx.strokeStyle = col['separator-strong'];
    for (let k = 0; k <= 6; k++) {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + k * unit);
      ctx.lineTo(x0 + 6 * unit, y0 + k * unit);
      ctx.stroke();
    }
    ctx.lineWidth = 1.5;
    for (const [x, y, a, c] of st.needles) {
      ctx.strokeStyle = c ? col.accent : alpha(col['hiw-ink-1'], 0.7);
      ctx.beginPath();
      ctx.moveTo(x0 + (x - Math.cos(a) / 2) * unit, y0 + (y - Math.sin(a) / 2) * unit);
      ctx.lineTo(x0 + (x + Math.cos(a) / 2) * unit, y0 + (y + Math.sin(a) / 2) * unit);
      ctx.stroke();
    }
    const n = st.dropped || 0;
    r?.set('n', fmt(n));
    r?.set('pi', st.crossed ? fmt((2 * n) / st.crossed, 4) : '–');
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ darts: 'Random darts at a square; the arc is a quarter circle', converge: 'The estimate as darts pile up', needle: 'Needles as long as the gap between the lines', uses: 'Measuring a lake with darts' }[id]);
  reset();
  st.dropped = 0;
  st.blobN = 0;
  const many = (k) => () => {
    for (let i = 0; i < k; i++) (id === 'needle' ? dropNeedle : id === 'uses' ? throwAtLake : throwDart)();
    api.invalidate();
  };
  ui.button({ label: id === 'needle' ? 'Drop 1,000' : 'Throw 1,000', onClick: many(1000) });
  if (id === 'converge') ui.button({ label: 'Throw 100,000', onClick: many(100000) });
  ui.button({ label: 'Start again', onClick() { reset(); st.dropped = 0; st.blobN = 0; api.invalidate(); } });
  st.readout = api.readout(id === 'uses'
    ? [{ key: 'n', label: 'Darts' }, { key: 'area', label: 'Lake, by darts' }, { key: 'true', label: 'Lake, measured exactly' }]
    : [{ key: 'n', label: id === 'needle' ? 'Needles' : 'Darts' }, { key: 'pi', label: 'Estimate of π' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

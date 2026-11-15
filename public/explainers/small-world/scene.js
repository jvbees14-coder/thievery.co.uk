// ---------------------------------------------------------------------------
// Six degrees of separation: the scene.
//
// Two hundred people round a circle, each friends with the three nearest
// on either side; a share of the friendships rewired to anyone at all.
// Chapter 1 is the plain ring; chapter 2 adds shortcuts; chapter 3 plots
// path length and clustering against the share rewired (Watts and
// Strogatz's figure); chapter 4 finds the chain between two people.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { ring, pathLength, clustering } from './art.js';

const N = 200, K = 3;
const st = { p: 0.02, g: null, stats: null, pair: null, path: [], curve: null, readout: null };

function rebuild() {
  st.g = ring(N, K, st.p, 7);
  st.stats = { L: pathLength(st.g), C: clustering(st.g) };
}

function shortest(a, b) {
  const prev = new Array(N).fill(-1), seen = new Array(N).fill(false);
  seen[a] = true;
  const q = [a];
  for (let i = 0; i < q.length; i++) for (const v of st.g.adj[q[i]]) if (!seen[v]) {
    seen[v] = true;
    prev[v] = q[i];
    q.push(v);
  }
  const path = [];
  for (let v = b; v !== -1; v = prev[v]) path.unshift(v);
  return path;
}

function drawRing(ctx, w, h, col, bg) {
  const cx = w / 2, cy = (h + 50) / 2, R = Math.min(w, h - 80) * 0.44;
  const P = (i) => [cx + Math.cos((i / N) * TAU - Math.PI / 2) * R, cy + Math.sin((i / N) * TAU - Math.PI / 2) * R];
  for (const e of st.g.edges) {
    const [x1, y1] = P(e[0]), [x2, y2] = P(e[1]);
    ctx.strokeStyle = e.shortcut ? alpha(col.accent, 0.8) : alpha(col['label-tertiary'], 0.35);
    ctx.lineWidth = e.shortcut ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  if (st.path.length > 1) {
    ctx.strokeStyle = col.danger;
    ctx.lineWidth = 3;
    ctx.beginPath();
    st.path.forEach((v, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, ...P(v)));
    ctx.stroke();
  }
  for (let i = 0; i < N; i++) {
    const on = st.path.includes(i);
    ctx.beginPath();
    ctx.arc(...P(i), on ? 5 : 2.5, 0, TAU);
    ctx.fillStyle = on ? col.danger : col['hiw-ink-1'];
    ctx.fill();
  }
}

function drawCurve(ctx, w, h, col, bg) {
  if (!st.curve) {
    const base = ring(N, K, 0, 1), L0 = pathLength(base), C0 = clustering(base);
    st.curve = [];
    for (let e = -3.5; e <= 0.001; e += 0.25) {
      const p = 10 ** e, g = ring(N, K, p, 11);
      st.curve.push([e, pathLength(g) / L0, clustering(g) / C0]);
    }
  }
  const x0 = 50, x1 = w - 20, y0 = 80, y1 = h - 40;
  const X = (e) => x0 + ((e + 3.5) / 3.5) * (x1 - x0), Y = (v) => y1 - v * (y1 - y0);
  ctx.strokeStyle = col.separator;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  for (const [e, name] of [[-3, '0.1%'], [-2, '1%'], [-1, '10%'], [0, '100%']]) label(ctx, name, X(e), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Friendships rewired', x1, y1 + 28, col['label-tertiary'], bg, { size: 11, align: 'right' });
  for (const [k, c, name] of [[1, col.danger, 'Steps between people'], [2, col['hiw-ink-1'], 'Friends who know each other']]) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    st.curve.forEach((pt, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(pt[0]), Y(pt[k])));
    ctx.stroke();
    for (const pt of st.curve) {
      ctx.beginPath();
      ctx.arc(X(pt[0]), Y(pt[k]), 3.5, 0, TAU);
      ctx.fillStyle = c;
      ctx.fill();
    }
    label(ctx, name, x0 + 8, y0 + 14 + (k - 1) * 18, c, bg, { size: 11, weight: 700 });
  }
  label(ctx, 'Both as a share of the plain ring’s', x0 + 8, y0 + 50, col['label-tertiary'], bg, { size: 11 });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'curve') drawCurve(ctx, w, h, col, bg);
  else drawRing(ctx, w, h, col, bg);
  r?.set('L', fmt(st.stats.L, 1));
  r?.set('C', `${fmt(st.stats.C * 100, 0)}%`);
  r?.set('chain', st.path.length ? `${st.path.length - 1} steps` : '–');
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ ring: '200 people, each friends with their 6 nearest', shortcuts: 'Some friendships rewired to anyone', curve: 'Watts and Strogatz’s comparison', six: 'The chain between two people' }[id]);
  st.path = [];
  st.readout = null;
  if (id === 'ring') st.p = 0;
  else if (st.p === 0) st.p = 0.02;
  rebuild();
  if (id === 'shortcuts') {
    ui.slider({ label: 'Friendships rewired', min: 0, max: 0.3, step: 0.005, value: st.p, format: (v) => `${fmt(v * 100, 1)}%`, onInput(v) { st.p = v; rebuild(); api.invalidate(); } });
  }
  if (id === 'six') {
    const pick = () => {
      const a = Math.floor(Math.random() * N);
      let b = (a + N / 2 + Math.floor(Math.random() * 20) - 10) % N;
      st.path = shortest(a, b);
      api.invalidate();
    };
    pick();
    ui.button({ label: 'Pick two more people', onClick: pick });
  }
  if (id !== 'curve') {
    st.readout = api.readout(id === 'six'
      ? [{ key: 'chain', label: 'Chain between them' }, { key: 'L', label: 'Average for everyone' }]
      : [{ key: 'L', label: 'Average steps between two people' }, { key: 'C', label: 'Friends who know each other' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

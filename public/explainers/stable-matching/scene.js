// ---------------------------------------------------------------------------
// Matching doctors to hospitals: the scene.
//
// Six applicants on the left, six hospitals on the right, each with a
// ranked list. Chapter 1 is a matching drawn at random, with its unstable
// pairs dashed; chapter 2 picks one such pair out; chapter 3 replays
// deferred acceptance step by step; chapter 4 compares who proposes.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';
import { seeded, preferences, defer, blocking } from './art.js';

const A = ['Ada', 'Ben', 'Cara', 'Dev', 'Eve', 'Finn'];
const H = ['North', 'South', 'East', 'West', 'Park', 'Bridge'];
const N = 6;
const st = { seed: 3, prefs: null, match: null, run: null, k: 0, side: 'a', acc: 0, readout: null };

function reseed(seed) {
  st.seed = seed;
  st.prefs = preferences(N, seed);
  randomMatch();
}
function randomMatch() {
  const r = seeded(st.seed * 31 + Math.floor(Math.random() * 1e6));
  const perm = [...Array(N).keys()];
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  st.match = perm;
}
reseed(3);

function layout(w, h) {
  const top = 80, gap = (h - top - 40) / N;
  return { ax: w * 0.2, hx: w * 0.8, y: (i) => top + gap * (i + 0.5) };
}

function people(ctx, w, h, col, bg, L) {
  for (let i = 0; i < N; i++) {
    for (const [x, name, c, prefs, other, right] of [[L.ax, A[i], col['hiw-ink-1'], st.prefs.a[i], H, false], [L.hx, H[i], col['hiw-ink-4'], st.prefs.h[i], A, true]]) {
      box(ctx, x - 34, L.y(i) - 14, 68, 28, 8);
      ctx.fillStyle = alpha(c, 0.25);
      ctx.fill();
      label(ctx, name, x, L.y(i), col.label, null, { size: 12, weight: 700, align: 'center' });
      if (w > 520) label(ctx, prefs.slice(0, 3).map((j) => other[j]).join(', ') + '…', right ? x + 42 : x - 42, L.y(i), col['label-tertiary'], bg, { size: 10, align: right ? 'left' : 'right' });
    }
  }
}

function lines(ctx, col, L, match, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2.5;
  match.forEach((h, a) => {
    if (h == null || h < 0) return;
    ctx.beginPath();
    ctx.moveTo(L.ax + 34, L.y(a));
    ctx.lineTo(L.hx - 34, L.y(h));
    ctx.stroke();
  });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  const L = layout(w, h);
  let moving = false;
  people(ctx, w, h, col, bg, L);
  if (ch === 'problem' || ch === 'unstable') {
    lines(ctx, col, L, st.match, alpha(col['label-secondary'], 0.7));
    const bad = blocking(st.prefs, st.match);
    const shown = ch === 'unstable' ? bad.slice(0, 1) : bad;
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = col.danger;
    ctx.lineWidth = 2;
    for (const [a, hh] of shown) {
      ctx.beginPath();
      ctx.moveTo(L.ax + 34, L.y(a));
      ctx.lineTo(L.hx - 34, L.y(hh));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    r?.set('bad', String(bad.length));
    if (ch === 'unstable' && bad.length) {
      const [a, hh] = bad[0], holder = st.match.indexOf(hh);
      api.status(`${A[a]} would rather have ${H[hh]} than ${H[st.match[a]]}, and ${H[hh]} would rather have ${A[a]} than ${A[holder]}.`);
    } else if (ch === 'unstable') api.status('This matching is stable: no pair would both rather swap.');
  } else if (ch === 'algorithm') {
    const steps = st.run.steps;
    if (api.playing && api.motion && st.k < steps.length) {
      st.acc += dt * 1.5;
      while (st.acc >= 1 && st.k < steps.length) {
        st.k++;
        st.acc -= 1;
      }
      moving = true;
    }
    // Replay: who holds whom after k steps.
    const held = new Array(N).fill(-1);
    for (let i = 0; i < st.k; i++) {
      const s = steps[i];
      if (s.ok) held[s.q] = s.p;
    }
    const match = new Array(N).fill(-1);
    held.forEach((p, q) => p >= 0 && (match[p] = q));
    lines(ctx, col, L, match, col.success);
    const last = steps[st.k - 1];
    if (last) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = last.ok ? col.accent : col.danger;
      ctx.beginPath();
      ctx.moveTo(L.ax + 34, L.y(last.p));
      ctx.lineTo(L.hx - 34, L.y(last.q));
      ctx.stroke();
      ctx.setLineDash([]);
      api.status(`${A[last.p]} asks ${H[last.q]}: ${last.ok ? (last.bumped >= 0 ? `held, and ${A[last.bumped]} is let go` : 'held') : 'turned away'}.`);
    } else api.status('Each applicant starts by asking their first choice.');
    r?.set('steps', `${st.k} of ${steps.length}`);
  } else if (ch === 'proposers') {
    const { match } = defer(st.prefs, st.side);
    lines(ctx, col, L, match, st.side === 'a' ? col['hiw-ink-1'] : col['hiw-ink-4']);
    const ar = match.reduce((t, hh, a) => t + st.prefs.a[a].indexOf(hh) + 1, 0) / N;
    const hr = match.reduce((t, hh, a) => t + st.prefs.h[hh].indexOf(a) + 1, 0) / N;
    r?.set('a', fmt(ar, 2));
    r?.set('h', fmt(hr, 2));
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ problem: 'A matching drawn at random', unstable: 'One pair that would both swap', algorithm: 'Deferred acceptance, applicants asking', proposers: 'Who does the asking' }[id]);
  st.readout = null;
  if (id === 'problem' || id === 'unstable') {
    ui.button({ label: 'Another random matching', onClick() { randomMatch(); api.invalidate(); } });
    ui.button({ label: 'New preferences', onClick() { reseed(Math.floor(Math.random() * 1e6)); api.invalidate(); } });
    st.readout = api.readout([{ key: 'bad', label: 'Pairs who would both rather swap' }]);
  } else if (id === 'algorithm') {
    st.run = defer(st.prefs, 'a');
    st.k = api.motion ? 0 : st.run.steps.length;
    ui.button({ label: 'One step', onClick() { st.k = Math.min(st.run.steps.length, st.k + 1); api.invalidate(); } });
    ui.button({ label: 'Start again', onClick() { st.k = 0; api.invalidate(); } });
    st.readout = api.readout([{ key: 'steps', label: 'Steps' }]);
  } else if (id === 'proposers') {
    ui.choice({ label: 'Who asks', options: [{ id: 'a', label: 'Applicants' }, { id: 'h', label: 'Hospitals' }], value: st.side, onChange(v) { st.side = v; api.invalidate(); } });
    ui.button({ label: 'New preferences', onClick() { reseed(Math.floor(Math.random() * 1e6)); api.invalidate(); } });
    st.readout = api.readout([{ key: 'a', label: 'Applicants get, on average, choice number' }, { key: 'h', label: 'Hospitals get, on average, choice number' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });


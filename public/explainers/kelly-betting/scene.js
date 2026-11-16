// ---------------------------------------------------------------------------
// How much to bet: the scene.
//
// An even-money bet on a coin that lands heads 60% of the time. Staking a
// share f of what you have, the money is multiplied by 1 + f on a win and
// 1 − f on a loss, so its long-run growth per toss is
// g(f) = 0.6 ln(1 + f) + 0.4 ln(1 − f), highest at f = 0.2 (Kelly).
// Chapters 1, 2 and 4 toss real (random) coins for one or twenty gamblers
// on a logarithmic scale; chapter 3 draws g(f).
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { plot, curve } from '../shared/plot.js';

const P = 0.6;
const growth = (f) => P * Math.log(1 + f) + (1 - P) * Math.log(1 - f);
const st = { f: 0.2, paths: [[100]], people: 1, acc: 0, max: 100, readout: null };

function reset(people) {
  st.people = people;
  st.paths = Array.from({ length: people }, () => [100]);
}
function tossAll() {
  for (const p of st.paths) {
    if (p.length > st.max) continue;
    const m = p[p.length - 1];
    if (m < 0.01) { p.push(0); continue; }
    const stake = m * st.f;
    p.push(Math.random() < P ? m + stake : m - stake);
  }
}

function money(v) {
  if (v <= 0) return '£0';
  if (v >= 1e6) return `£${fmt(v / 1e6, 1)}m`;
  if (v < 1) return `${fmt(v * 100)}p`;
  return `£${fmt(v)}`;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let more = false;
  if (ch === 'fraction') {
    const g = plot(ctx, col, bg, { x0: 64, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0, max: 0.6, ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], fmt: (v) => `${Math.round(v * 100)}%`, name: 'Share staked each toss' },
      { min: -0.06, max: 0.03, ticks: [-0.06, -0.04, -0.02, 0, 0.02], fmt: (v) => `${v > 0 ? '+' : ''}${fmt(v * 100)}%`, name: 'Growth per toss, long run' });
    ctx.strokeStyle = alpha(col['label-tertiary'], 0.8);
    ctx.beginPath();
    ctx.moveTo(g.x0, g.Y(0));
    ctx.lineTo(g.x1, g.Y(0));
    ctx.stroke();
    curve(ctx, g, growth, 0, 0.6, col.accent, 3);
    ctx.fillStyle = col.danger;
    ctx.beginPath();
    ctx.arc(g.X(st.f), g.Y(Math.max(-0.06, growth(st.f))), 6, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, 'Kelly: 20%', g.X(0.2), g.Y(growth(0.2)) - 16, col.accent, bg, { size: 12, weight: 700, align: 'center' });
    label(ctx, 'Shrinks', g.X(0.5), g.Y(-0.01), col.danger, bg, { size: 11, align: 'center' });
    r?.set('rate', `${growth(st.f) >= 0 ? '+' : ''}${fmt(growth(st.f) * 100, 2)}% a toss`);
    r?.set('after', `${fmt(Math.exp(100 * growth(st.f)), 2)} ×`);
  } else {
    if (api.playing && api.motion && st.paths.some((p) => p.length <= st.max)) {
      st.acc += f.dt * 20;
      while (st.acc >= 1) { tossAll(); st.acc--; }
      more = true;
    }
    const lo = 1, hi = 1e6;
    const L = (v) => Math.log10(Math.max(lo, Math.min(hi, v)));
    const g = plot(ctx, col, bg, { x0: 64, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0, max: st.max, ticks: [0, 25, 50, 75, 100].map((t) => (t * st.max) / 100), name: 'Tosses' },
      { min: 0, max: 6, ticks: [0, 1, 2, 3, 4, 5, 6], fmt: (v) => money(10 ** v), name: 'Money (each line is ten times the last)' });
    st.paths.forEach((p, i) => {
      ctx.strokeStyle = st.people > 1 ? alpha(i % 2 ? col['hiw-ink-1'] : col['hiw-ink-4'], 0.7) : col.accent;
      ctx.lineWidth = st.people > 1 ? 1.5 : 2.5;
      ctx.beginPath();
      p.forEach((v, t) => (t ? ctx.lineTo : ctx.moveTo).call(ctx, g.X(t), g.Y(L(v))));
      ctx.stroke();
      const end = p[p.length - 1];
      if (end <= 0.01) label(ctx, 'Broke', g.X(p.length - 1), g.Y(0) - 10, col.danger, bg, { size: 11, align: 'center' });
    });
    const ends = st.paths.map((p) => p[p.length - 1]).sort((a, b) => a - b);
    const tosses = st.paths[0].length - 1;
    if (st.people === 1) r?.set('money', money(ends[0]));
    else {
      r?.set('median', money(ends[Math.floor(ends.length / 2)]));
      r?.set('behind', `${ends.filter((v) => v < 100).length} of ${st.people}`);
    }
    r?.set('tosses', fmt(tosses));
  }
  return more;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ edge: 'Heads 60% of the time, starting with £100', all: 'Staking everything, every toss', fraction: 'The same share staked every toss', paths: 'Twenty gamblers, £100 each' }[id]);
  const toss = (k) => ui.button({ label: k === 1 ? 'Toss' : `Toss ${k} times`, onClick() { for (let i = 0; i < k; i++) tossAll(); api.invalidate(); } });
  if (id === 'edge') {
    st.f = 0.2;
    st.max = 100;
    reset(1);
    ui.slider({ label: 'Share staked', min: 5, max: 95, step: 5, value: 20, format: (v) => `${v}%`, onInput(v) { st.f = v / 100; reset(1); api.invalidate(); } });
    toss(1);
    toss(10);
    ui.button({ label: 'Start again', onClick() { reset(1); api.invalidate(); } });
    st.readout = api.readout([{ key: 'money', label: 'You have' }, { key: 'tosses', label: 'Tosses' }]);
  } else if (id === 'all') {
    st.f = 1;
    st.max = 30;
    reset(1);
    toss(1);
    ui.button({ label: 'Start again', onClick() { reset(1); api.invalidate(); } });
    st.readout = api.readout([{ key: 'money', label: 'You have' }, { key: 'tosses', label: 'Tosses' }]);
  } else if (id === 'fraction') {
    st.f = 0.2;
    ui.slider({ label: 'Share staked', min: 1, max: 60, value: 20, format: (v) => `${v}%`, onInput(v) { st.f = v / 100; api.invalidate(); } });
    st.readout = api.readout([{ key: 'rate', label: 'Long-run growth' }, { key: 'after', label: 'Typically, after 100 tosses' }]);
  } else if (id === 'paths') {
    st.f = 0.2;
    st.max = 200;
    reset(20);
    ui.slider({ label: 'Share staked', min: 5, max: 60, step: 5, value: 20, format: (v) => `${v}%`, onInput(v) { st.f = v / 100; reset(20); api.invalidate(); } });
    toss(10);
    ui.button({ label: 'Start again', onClick() { reset(20); api.invalidate(); } });
    st.readout = api.readout([{ key: 'median', label: 'The middle gambler' }, { key: 'behind', label: 'Below £100' }, { key: 'tosses', label: 'Tosses' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

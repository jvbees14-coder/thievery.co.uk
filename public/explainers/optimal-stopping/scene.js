// ---------------------------------------------------------------------------
// When to stop looking: the scene.
//
// The secretary problem. n choices arrive in a random order; look at the
// first r without taking any, then take the first better than all of
// them (or the last, if none is). The chance of ending with the best is
// exactly (r/n) × Σ 1/(i−1) for i from r+1 to n, and 1/n when r is 0.
// Chapter 1 runs one search as bars arriving; chapter 2 compares that
// formula with simulated runs; chapter 3 finds the best r for large n;
// chapter 4 splits the outcomes into the best, another, and the last.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { plot, curve } from '../shared/plot.js';

export function chance(n, r) {
  if (r === 0) return 1 / n;
  let s = 0;
  for (let i = r + 1; i <= n; i++) s += 1 / (i - 1);
  return (r / n) * s;
}
function bestSkip(n) {
  let b = 0;
  for (let r = 1; r < n; r++) if (chance(n, r) > chance(n, b)) b = r;
  return b;
}
function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function search(order, r) {
  const n = order.length;
  let bar = 0;
  for (let i = 0; i < r; i++) bar = Math.max(bar, order[i]);
  for (let i = r; i < n; i++) if (order[i] > bar) return i;
  return n - 1;
}

const st = { n: 10, r: 3, order: shuffled(10), shown: 0, acc: 0, sims: null, big: 100, readout: null };

function runSims() {
  st.sims = [];
  for (let r = 0; r < 10; r++) {
    let won = 0;
    for (let k = 0; k < 1000; k++) {
      const o = shuffled(10);
      if (o[search(o, r)] === 10) won++;
    }
    st.sims.push(won / 1000);
  }
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let more = false;
  if (ch === 'problem') {
    const n = st.n;
    if (api.playing && api.motion && st.shown < n) {
      st.acc += f.dt * 1.6;
      if (st.acc >= 1) { st.acc = 0; st.shown++; }
      more = true;
    }
    const pick = search(st.order, st.r);
    const x0 = 40, x1 = w - 30, y1 = h - 70, top = 100;
    const cw = (x1 - x0) / n;
    ctx.fillStyle = alpha(col['label-tertiary'], 0.1);
    ctx.fillRect(x0, top - 20, cw * st.r, y1 - top + 40);
    label(ctx, 'Just looking', x0 + 6, top - 30, col['label-secondary'], bg, { size: 11 });
    if (st.r < n) label(ctx, 'Take the first better one', x0 + cw * st.r + 6, top - 30, col['label-secondary'], bg, { size: 11 });
    let bar = 0;
    for (let i = 0; i < st.r; i++) bar = Math.max(bar, st.order[i]);
    for (let i = 0; i < Math.min(st.shown, n); i++) {
      const v = st.order[i];
      const bh = (v / n) * (y1 - top);
      const chosen = i === pick && st.shown > pick;
      ctx.fillStyle = chosen ? (v === n ? col.success : col.danger) : i < st.r ? alpha(col['hiw-ink-1'], 0.5) : col['hiw-ink-1'];
      ctx.fillRect(x0 + i * cw + cw * 0.15, y1 - bh, cw * 0.7, bh);
      label(ctx, `${v}`, x0 + i * cw + cw / 2, y1 + 14, col['label-secondary'], bg, { size: 11, align: 'center' });
      if (chosen) label(ctx, 'Taken', x0 + i * cw + cw / 2, y1 - bh - 12, chosen && v === n ? col.success : col.danger, bg, { size: 12, weight: 700, align: 'center' });
    }
    if (st.r && st.shown >= st.r) {
      const y = y1 - (bar / n) * (y1 - top);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = col.accent;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, 'Best while looking', x1, y - 10, col.accent, bg, { size: 11, align: 'right' });
    }
    label(ctx, 'Each flat scored 1 to 10, 10 the best', x0, h - 22, col['label-tertiary'], bg, { size: 11 });
    if (st.shown > pick) r?.set('got', `${st.order[pick]}${st.order[pick] === n ? ', the best' : ''}`);
    else r?.set('got', '–');
    r?.set('chance', `${fmt(chance(n, st.r) * 100, 1)}%`);
  } else if (ch === 'cutoff') {
    const g = plot(ctx, col, bg, { x0: 54, x1: w - 20, y0: 80, y1: h - 44 },
      { min: -0.5, max: 9.5, ticks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], name: 'Flats looked at first' },
      { min: 0, max: 0.5, ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5], fmt: (v) => `${Math.round(v * 100)}%`, name: 'Finds the best' });
    const bw = (g.X(1) - g.X(0)) * 0.6;
    for (let k = 0; k < 10; k++) {
      const p = chance(10, k);
      if (st.sims) {
        ctx.fillStyle = alpha(col['hiw-ink-1'], 0.45);
        ctx.fillRect(g.X(k) - bw / 2, g.Y(st.sims[k]), bw, g.Y(0) - g.Y(st.sims[k]));
      }
      ctx.fillStyle = k === st.r ? col.accent : col['label-secondary'];
      ctx.fillRect(g.X(k) - bw / 2 - 4, g.Y(p) - 1.5, bw + 8, 3);
      label(ctx, `${fmt(p * 100, 1)}%`, g.X(k), g.Y(p) - 12, k === st.r ? col.accent : col['label-secondary'], bg, { size: 10, align: 'center' });
    }
    r?.set('chance', `${fmt(chance(10, st.r) * 100, 1)}%`);
    r?.set('sim', st.sims ? `${fmt(st.sims[st.r] * 100, 1)}%` : '–');
  } else if (ch === 'rule') {
    const n = st.big;
    const b = bestSkip(n);
    const g = plot(ctx, col, bg, { x0: 54, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: (v) => `${Math.round(v * 100)}%`, name: 'Share looked at first' },
      { min: 0, max: 0.5, ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5], fmt: (v) => `${Math.round(v * 100)}%`, name: 'Finds the best' });
    curve(ctx, g, (x) => chance(n, Math.min(n - 1, Math.round(x * n))), 0, 0.99, col.accent, 3, Math.min(200, n));
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = col['label-tertiary'];
    ctx.beginPath();
    ctx.moveTo(g.X(1 / Math.E), g.Y(0));
    ctx.lineTo(g.X(1 / Math.E), g.Y(0.5));
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, '37%', g.X(1 / Math.E) + 6, g.Y(0.47), col['label-tertiary'], bg, { size: 11 });
    ctx.fillStyle = col.danger;
    ctx.beginPath();
    ctx.arc(g.X(b / n), g.Y(chance(n, b)), 6, 0, Math.PI * 2);
    ctx.fill();
    r?.set('skip', `${fmt(b)} of ${fmt(n)}`);
    r?.set('chance', `${fmt(chance(n, b) * 100, 1)}%`);
  } else if (ch === 'risk') {
    const n = 100, k = st.r;
    const best = chance(n, k), last = k / n, other = 1 - best - last;
    const parts = [[best, col.success, 'The best'], [Math.max(0, other), col['hiw-ink-1'], 'Another, taken in time'], [last, col.danger, 'Stuck with the last']];
    const x0 = 40, x1 = w - 40, y = h / 2 - 20, bh = 56;
    let x = x0;
    for (const [p, c, name] of parts) {
      const wd = p * (x1 - x0);
      ctx.fillStyle = c;
      ctx.fillRect(x, y, wd, bh);
      if (wd > 50) label(ctx, `${fmt(p * 100, 0)}%`, x + wd / 2, y + bh / 2, col.bg, null, { size: 13, weight: 700, align: 'center' });
      x += wd;
    }
    parts.forEach(([p, c, name], i) => {
      ctx.fillStyle = c;
      ctx.fillRect(x0, y + bh + 30 + i * 22, 12, 12);
      label(ctx, `${name}: ${fmt(p * 100, 1)}%`, x0 + 20, y + bh + 36 + i * 22, col.label, bg, { size: 12 });
    });
    label(ctx, `Out of 100 choices, looking at the first ${k}`, x0, y - 22, col['label-secondary'], bg, { size: 12 });
    r?.set('best', `${fmt(best * 100, 1)}%`);
    r?.set('last', `${fmt(last * 100, 1)}%`);
  }
  return more;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ problem: 'Ten flats, seen one at a time', cutoff: 'Ten flats: the exact chance, and 1,000 tries each', rule: 'Any number of choices', risk: 'A hundred choices' }[id]);
  if (id === 'problem') {
    st.n = 10;
    st.r = 3;
    st.order = shuffled(10);
    st.shown = api.motion ? 0 : 10;
    ui.slider({ label: 'Look at first', min: 0, max: 9, value: st.r, onInput(v) { st.r = v; api.invalidate(); } });
    ui.button({ label: 'New viewings', onClick() { st.order = shuffled(10); st.shown = api.playing && api.motion ? 0 : 10; api.invalidate(); } });
    st.readout = api.readout([{ key: 'got', label: 'You took' }, { key: 'chance', label: 'Chance of the best' }]);
  } else if (id === 'cutoff') {
    st.r = 3;
    st.sims = null;
    ui.slider({ label: 'Look at first', min: 0, max: 9, value: st.r, onInput(v) { st.r = v; api.invalidate(); } });
    ui.button({ label: 'Run 1,000 searches each', onClick() { runSims(); api.invalidate(); } });
    st.readout = api.readout([{ key: 'chance', label: 'Exact chance' }, { key: 'sim', label: 'In the runs' }]);
  } else if (id === 'rule') {
    ui.slider({ label: 'Choices', min: 3, max: 1000, value: st.big, format: (v) => fmt(v), onInput(v) { st.big = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'skip', label: 'Best to look at' }, { key: 'chance', label: 'Finds the best' }]);
  } else if (id === 'risk') {
    st.r = 37;
    ui.slider({ label: 'Look at first', min: 1, max: 90, value: st.r, onInput(v) { st.r = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'best', label: 'Ends with the best' }, { key: 'last', label: 'Stuck with the last' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

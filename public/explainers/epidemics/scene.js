// ---------------------------------------------------------------------------
// How epidemics spread: the scene.
//
// Chapter 1 is a chain of infections, generation by generation, each case
// passing it to a random number of others averaging R. Chapters 2 to 4 are
// the SIR model drawn as three curves: susceptible, infectious and
// recovered, as shares of everybody, over two hundred days.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { sir, summary, threshold, chain } from './art.js';

const DAYS = 200;
const st = { R: 2, gens: null, R0: 3, immune: 0, cut: 0, readout: null };

function drawChain(ctx, w, h, col, bg) {
  const gens = st.gens;
  const top = 70, rowH = (h - top - 30) / 6;
  const pos = gens.map((g, k) => g.map((_, j) => [((j + 0.5) / g.length) * (w - 40) + 20, top + k * rowH]));
  ctx.strokeStyle = alpha(col.danger, 0.35);
  ctx.lineWidth = 1;
  gens.forEach((g, k) => {
    if (!k) return;
    g.forEach((c, j) => {
      ctx.beginPath();
      ctx.moveTo(...pos[k - 1][c.parent]);
      ctx.lineTo(...pos[k][j]);
      ctx.stroke();
    });
  });
  gens.forEach((g, k) => {
    const r = g.length > 120 ? 2 : g.length > 40 ? 3 : 5;
    g.forEach((_, j) => {
      ctx.beginPath();
      ctx.arc(...pos[k][j], r, 0, TAU);
      ctx.fillStyle = col.danger;
      ctx.fill();
    });
    label(ctx, `${fmt(g.length)}${g.length >= 400 ? '+' : ''}`, w - 14, top + k * rowH - 12, col['label-tertiary'], bg, { size: 11, align: 'right' });
  });
}

function drawCurves(ctx, w, h, col, bg, run, ghost) {
  const x0 = 44, x1 = w - 16, y0 = 70, y1 = h - 36;
  const X = (d) => x0 + (d / DAYS) * (x1 - x0), Y = (v) => y1 - v * (y1 - y0);
  ctx.strokeStyle = col.separator;
  ctx.lineWidth = 1;
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(v));
    ctx.lineTo(x1, Y(v));
    ctx.stroke();
    label(ctx, `${v * 100}%`, x0 - 6, Y(v), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  for (let d = 0; d <= DAYS; d += 50) label(ctx, `Day ${d}`, X(d), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  const line = (key, c, width, data = run) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let d = 0; d <= DAYS; d++) {
      const p = [X(d), Y(data[d][key])];
      d ? ctx.lineTo(...p) : ctx.moveTo(...p);
    }
    ctx.stroke();
  };
  if (ghost) line('i', alpha(col.danger, 0.3), 2, ghost);
  line('s', col['hiw-ink-1'], 2.5);
  line('r', col.success, 2.5);
  line('i', col.danger, 3);
  const keys = [['Can catch it', col['hiw-ink-1']], ['Ill now', col.danger], ['Recovered or immune', col.success]];
  let lx = x0;
  for (const [name, c] of keys) {
    ctx.fillStyle = c;
    ctx.fillRect(lx, y0 - 22, 10, 10);
    label(ctx, name, lx + 14, y0 - 17, col['label-secondary'], bg, { size: 11 });
    lx += ctx.measureText(name).width + 34;
  }
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'chain') {
    drawChain(ctx, w, h, col, bg);
    const total = st.gens.reduce((n, g) => n + g.length, 0);
    const out = !st.gens[st.gens.length - 1].length;
    r?.set('cases', `${fmt(total)}${st.gens.some((g) => g.length >= 400) ? '+' : ''}`);
    const k = st.gens.length - 2;
    r?.set('end', !out ? 'Still spreading' : k ? `Died out after ${k} generation${k === 1 ? '' : 's'}` : 'Died out at once');
    return false;
  }
  const opts = { R0: st.R0, days: DAYS };
  if (ch === 'threshold') opts.immune = st.immune;
  if (ch === 'flatten') opts.cut = st.cut;
  const run = sir(opts);
  const ghost = ch === 'flatten' ? sir({ R0: st.R0, days: DAYS }) : null;
  drawCurves(ctx, w, h, col, bg, run, ghost);
  const long = summary(sir({ ...opts, days: 1000 }), opts.immune || 0);
  const s = summary(run, opts.immune || 0);
  r?.set('peak', `${fmt(s.peak * 100, 1)}%`);
  r?.set('day', s.peak < 0.001 ? '–' : `Day ${s.day}`);
  r?.set('total', `${fmt(Math.max(0, long.total) * 100, 1)}%`);
  r?.set('threshold', `${fmt(threshold(st.R0) * 100, 0)}%`);
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({
    chain: 'One case, and the cases it causes',
    curve: 'The SIR model, 7 days ill',
    threshold: 'Some people immune from the start',
    flatten: 'Fewer contacts; faint line is without',
  }[id]);
  if (id === 'chain') {
    const again = () => {
      st.gens = chain(st.R, 6);
      api.invalidate();
    };
    // The first one shown is one that got going, so there is something to see.
    do st.gens = chain(st.R, 6); while (st.R > 1 && st.gens.length < 5);
    ui.slider({ label: 'Average passed on (R)', min: 0.5, max: 3, step: 0.1, value: st.R, format: (v) => fmt(v, 1), onInput(v) { st.R = v; again(); } });
    ui.button({ label: 'New outbreak', onClick: again });
    st.readout = api.readout([{ key: 'cases', label: 'Cases in six generations' }, { key: 'end', label: 'Outbreak' }]);
  } else {
    ui.slider({ label: 'Basic reproduction number (R0)', min: 1.1, max: 6, step: 0.1, value: st.R0, format: (v) => fmt(v, 1), onInput(v) { st.R0 = v; api.invalidate(); } });
    if (id === 'threshold') ui.slider({ label: 'Immune at the start', min: 0, max: 0.95, step: 0.01, value: st.immune, format: (v) => `${Math.round(v * 100)}%`, onInput(v) { st.immune = v; api.invalidate(); } });
    if (id === 'flatten') ui.slider({ label: 'Contacts cut by', min: 0, max: 0.6, step: 0.01, value: st.cut, format: (v) => `${Math.round(v * 100)}%`, onInput(v) { st.cut = v; api.invalidate(); } });
    const rows = [{ key: 'peak', label: 'Ill at the peak' }, { key: 'day', label: 'Peak' }, { key: 'total', label: 'Caught it in the end' }];
    if (id === 'threshold') rows.splice(0, 2, { key: 'threshold', label: 'Needed immune' });
    st.readout = api.readout(rows);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

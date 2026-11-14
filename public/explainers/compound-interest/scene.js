// ---------------------------------------------------------------------------
// How compound interest works: the scene.
//
// Arithmetic, drawn. A balance grows year by year, split into what was put
// in and what the interest added; the same sum is then compounded more and
// more often (and runs into e), doubled by the rule of 72, fed monthly, and
// finally turned round to show a debt and inflation working the same way.
// Nothing here is advice about anybody's money.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const st = {
  start: 1000,
  rate: 5,
  years: 30,
  monthly: 100,
  perYear: 1,
  delay: 0,
  readout: null,
};
const money = (v) => `£${fmt(v, v < 100 ? 2 : 0)}`;

/** Balance after t years: a lump sum, compounded n times a year, plus a monthly payment. */
function balance(t, { start = st.start, rate = st.rate, n = 1, monthly = 0 } = {}) {
  const r = rate / 100;
  let b = start * (1 + r / n) ** (n * t);
  if (monthly) {
    const m = Math.floor(t * 12);
    const i = (1 + r) ** (1 / 12) - 1;
    b += i ? (monthly * ((1 + i) ** m - 1)) / i : monthly * m;
  }
  return b;
}

function chart(ctx, w, h, col, bg, series, yearsShown, opts = {}) {
  const x0 = 56, x1 = w - 16, y0 = 64, y1 = h - 40;
  const max = Math.max(1, ...series.flatMap((s) => s.values)) * 1.05;
  const X = (t) => x0 + (t / yearsShown) * (x1 - x0), Y = (v) => y1 - (v / max) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  for (const frac of [0.5, 1]) label(ctx, money(max * frac / 1.05), x0 - 6, Y((max * frac) / 1.05), col['label-tertiary'], bg, { size: 10, align: 'right' });
  for (let y = 0; y <= yearsShown; y += Math.max(1, Math.round(yearsShown / 6))) label(ctx, `${y}`, X(y), y1 + 14, col['label-tertiary'], bg, { size: 10, align: 'center' });
  label(ctx, 'years', x1, y1 + 28, col['label-tertiary'], bg, { size: 10, align: 'right' });
  for (const s of series) {
    if (s.fill) {
      ctx.beginPath();
      ctx.moveTo(X(0), y1);
      s.values.forEach((v, i) => ctx.lineTo(X((i / (s.values.length - 1)) * yearsShown), Y(v)));
      ctx.lineTo(X(yearsShown), y1);
      ctx.closePath();
      ctx.fillStyle = alpha(s.ink, 0.3);
      ctx.fill();
    }
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = X((i / (s.values.length - 1)) * yearsShown), y = Y(v);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = s.width || 2;
    if (s.dash) ctx.setLineDash(s.dash);
    ctx.stroke();
    ctx.setLineDash([]);
    const last = s.values[s.values.length - 1];
    if (s.name) label(ctx, `${s.name}: ${money(last)}`, X(yearsShown) - 4, Y(last) - 10, s.ink, bg, { size: 12, align: 'right' });
  }
  if (opts.mark) {
    ctx.strokeStyle = col.warning;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(X(opts.mark), y0);
    ctx.lineTo(X(opts.mark), y1);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, opts.markLabel, X(opts.mark) + 6, y0 + 10, col.warning, bg, { size: 12 });
  }
}

const steps = (years, f, per = 4) => Array.from({ length: years * per + 1 }, (_, i) => f(i / per));

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;

  if (ch === 'simple') {
    const simple = steps(st.years, (t) => st.start * (1 + (st.rate / 100) * t));
    const comp = steps(st.years, (t) => balance(t));
    chart(ctx, w, h, col, bg, [
      { values: steps(st.years, () => st.start), ink: col['label-secondary'], width: 1, dash: [3, 4] },
      { values: simple, ink: col['hiw-ink-2'], name: 'Simple' },
      { values: comp, ink: col['hiw-ink-1'], name: 'Compound', fill: true },
    ], st.years);
    r?.set('simple', money(simple[simple.length - 1]));
    r?.set('compound', money(comp[comp.length - 1]));
    r?.set('extra', money(comp[comp.length - 1] - simple[simple.length - 1]));
  }
  if (ch === 'often') {
    // £1 at 100% for a year, compounded n times: (1 + 1/n)^n.
    const ns = [1, 2, 4, 12, 52, 365];
    const bw = (w - 80) / ns.length;
    const base = h - 50, top = 96;
    const Y = (v) => base - ((v - 1) / 1.9) * (base - top);
    ctx.strokeStyle = col.warning;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(40, Y(Math.E));
    ctx.lineTo(w - 20, Y(Math.E));
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'e = 2.71828…', 44, Y(Math.E) - 12, col.warning, bg, { size: 12 });
    ns.forEach((n, i) => {
      const v = (1 + 1 / n) ** n;
      const x = 50 + i * bw;
      ctx.fillStyle = n === st.perYear ? col.accent : alpha(col['hiw-ink-1'], 0.7);
      ctx.fillRect(x + bw * 0.15, Y(v), bw * 0.7, base - Y(v));
      label(ctx, `£${v.toFixed(4)}`, x + bw / 2, Y(v) - 10, col.label, bg, { size: 11, align: 'center' });
      label(ctx, ['yearly', 'twice', 'quarterly', 'monthly', 'weekly', 'daily'][i], x + bw / 2, base + 14, col['label-secondary'], bg, { size: 11, align: 'center' });
    });
    label(ctx, '£1 at 100% for one year', 44, 60, col['label-secondary'], bg, { size: 12 });
    r?.set('n', fmt(st.perYear));
    r?.set('value', `£${((1 + 1 / st.perYear) ** st.perYear).toFixed(5)}`);
  }
  if (ch === 'seventytwo') {
    const exact = Math.log(2) / Math.log(1 + st.rate / 100);
    const years = Math.max(10, Math.ceil(exact * 2.2));
    chart(ctx, w, h, col, bg, [{ values: steps(years, (t) => balance(t)), ink: col['hiw-ink-1'], fill: true }], years, { mark: exact, markLabel: 'Doubled' });
    r?.set('rule', `${fmt(72 / st.rate, 1)} years`);
    r?.set('exact', `${fmt(exact, 1)} years`);
  }
  if (ch === 'regular') {
    const years = st.years;
    const paid = steps(years, (t) => st.start + st.monthly * Math.floor(t * 12));
    const grown = steps(years, (t) => balance(t, { monthly: st.monthly }));
    const late = steps(years, (t) => (t < st.delay ? 0 : balance(t - st.delay, { monthly: st.monthly })));
    chart(ctx, w, h, col, bg, [
      { values: grown, ink: col['hiw-ink-1'], name: 'Total', fill: true },
      { values: paid, ink: col['label-secondary'], name: 'Paid in', width: 1.5 },
      ...(st.delay ? [{ values: late, ink: col['hiw-ink-2'], name: `Starting ${st.delay} years later` }] : []),
    ], years);
    r?.set('paid', money(paid[paid.length - 1]));
    r?.set('total', money(grown[grown.length - 1]));
    r?.set('late', st.delay ? money(late[late.length - 1]) : '–');
  }
  if (ch === 'against') {
    const years = 30;
    const debt = steps(years, (t) => balance(t, { start: 1000, rate: st.rate }));
    const worth = steps(years, (t) => 1000 / (1 + st.inflation / 100) ** t);
    chart(ctx, w, h, col, bg, [
      { values: debt, ink: col.danger, name: `£1,000 owed at ${st.rate}%, unpaid` },
      { values: worth, ink: col.warning, name: `What £1,000 buys, at ${st.inflation}% inflation` },
    ], years);
    r?.set('debt', money(debt[debt.length - 1]));
    r?.set('worth', money(worth[worth.length - 1]));
    r?.set('half', `${fmt(Math.log(2) / Math.log(1 + st.inflation / 100), 1)} years`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note('Arithmetic, not advice');
  if (id === 'against') {
    st.rate = 22;
    st.inflation = 2;
  } else if (st.rate > 15) st.rate = 5;
  const rate = (max = 15) => ui.slider({ label: 'Interest a year', min: 1, max, step: 0.5, value: st.rate, format: (v) => `${v}%`, onInput: (v) => { st.rate = v; api.invalidate(); } });
  if (id === 'simple') {
    rate();
    ui.slider({ label: 'Years', min: 1, max: 50, value: st.years, onInput: (v) => { st.years = v; api.invalidate(); } });
  }
  if (id === 'often') {
    ui.choice({ label: 'Compounded', options: [[1, 'Yearly'], [2, 'Twice'], [4, 'Quarterly'], [12, 'Monthly'], [52, 'Weekly'], [365, 'Daily']].map(([n, l]) => ({ id: String(n), label: l })), value: String(st.perYear), onChange: (n) => { st.perYear = Number(n); api.invalidate(); } });
  }
  if (id === 'seventytwo') rate(20);
  if (id === 'regular') {
    rate();
    ui.slider({ label: 'Paid in each month', min: 0, max: 500, step: 10, value: st.monthly, format: (v) => `£${v}`, onInput: (v) => { st.monthly = v; api.invalidate(); } });
    ui.slider({ label: 'Start this many years later', min: 0, max: 20, value: st.delay, onInput: (v) => { st.delay = v; api.invalidate(); } });
  }
  if (id === 'against') {
    rate(40);
    ui.slider({ label: 'Inflation a year', min: 0, max: 10, step: 0.5, value: st.inflation, format: (v) => `${v}%`, onInput: (v) => { st.inflation = v; api.invalidate(); } });
  }
  const rows = {
    simple: [{ key: 'simple', label: 'Simple interest' }, { key: 'compound', label: 'Compound interest' }, { key: 'extra', label: 'Interest on interest' }],
    often: [{ key: 'n', label: 'Times a year' }, { key: 'value', label: '£1 becomes' }],
    seventytwo: [{ key: 'rule', label: 'Rule of 72 says' }, { key: 'exact', label: 'Exactly' }],
    regular: [{ key: 'paid', label: 'Paid in' }, { key: 'total', label: 'Worth' }, { key: 'late', label: 'Starting later' }],
    against: [{ key: 'debt', label: 'Owed after 30 years' }, { key: 'worth', label: '£1,000 buys, in today’s money' }, { key: 'half', label: 'Money halves in value in' }],
  }[id];
  st.readout = api.readout(rows);
  api.invalidate();
}

st.inflation = 2;
mount({ colours: TOKENS, chapter, draw });

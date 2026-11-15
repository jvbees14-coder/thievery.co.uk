// ---------------------------------------------------------------------------
// Regression to the mean: the scene.
//
// Four hundred people each have a skill, and every time they sit a test
// they score their skill plus some luck, both drawn from bell curves. The
// scatter plots their first score across and their second up. Chapter 2
// picks out the top tenth on the first test; chapter 3 is one pilot's run
// of landings; chapter 4 picks out the bottom tenth instead.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const st = { luck: 1, people: [], landings: [], readout: null };

function normal() {
  let u = 0;
  while (!u) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * Math.random());
}
function newPeople() {
  st.people = Array.from({ length: 400 }, () => ({ skill: normal(), l1: normal(), l2: normal() }));
}
function newLandings() {
  st.landings = Array.from({ length: 40 }, () => normal());
}
newPeople();
newLandings();

const scores = (p) => [p.skill + st.luck * p.l1, p.skill + st.luck * p.l2];
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

function drawScatter(ctx, w, h, col, bg, pick) {
  const x0 = 50, x1 = w - 16, y0 = 70, y1 = h - 40;
  const lim = 4.2;
  const X = (v) => x0 + ((v + lim) / (2 * lim)) * (x1 - x0), Y = (v) => y1 - ((v + lim) / (2 * lim)) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  // The line where both scores are equal.
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(X(-lim), Y(-lim));
  ctx.lineTo(X(lim), Y(lim));
  ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, 'First test', x1, y1 + 16, col['label-tertiary'], bg, { size: 11, align: 'right' });
  ctx.save();
  ctx.translate(x0 - 14, y0);
  ctx.rotate(-Math.PI / 2);
  label(ctx, 'Second test', 0, 0, col['label-tertiary'], bg, { size: 11, align: 'right' });
  ctx.restore();
  const all = st.people.map(scores);
  const firsts = all.map((s) => s[0]).sort((a, b) => a - b);
  const cut = pick === 'top' ? firsts[Math.floor(firsts.length * 0.9)] : pick === 'bottom' ? firsts[Math.floor(firsts.length * 0.1)] : null;
  const chosen = all.filter((s) => (pick === 'top' ? s[0] >= cut : pick === 'bottom' ? s[0] <= cut : false));
  for (const s of all) {
    const on = cut != null && (pick === 'top' ? s[0] >= cut : s[0] <= cut);
    ctx.beginPath();
    ctx.arc(X(s[0]), Y(s[1]), on ? 4 : 3, 0, TAU);
    ctx.fillStyle = on ? col.accent : alpha(col['hiw-ink-1'], cut != null ? 0.3 : 0.7);
    ctx.fill();
  }
  if (chosen.length) {
    const m1 = mean(chosen.map((s) => s[0])), m2 = mean(chosen.map((s) => s[1]));
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(m1), Y(m1));
    ctx.lineTo(X(m1), Y(m2));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(m1), Y(m2), 6, 0, TAU);
    ctx.fill();
    label(ctx, 'Their average, second time', X(m1) + (pick === 'top' ? -10 : 10), Y(m2) + (pick === 'top' ? 16 : -16), col.accent, bg, { size: 11, align: pick === 'top' ? 'right' : 'left' });
    return { m1, m2 };
  }
  return null;
}

function drawLandings(ctx, w, h, col, bg) {
  const x0 = 40, x1 = w - 16, y0 = 80, y1 = h - 40;
  const n = st.landings.length;
  const X = (i) => x0 + ((i + 0.5) / n) * (x1 - x0), Y = (v) => (y0 + y1) / 2 - (v / 3.2) * ((y1 - y0) / 2);
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(x0, Y(0));
  ctx.lineTo(x1, Y(0));
  ctx.stroke();
  label(ctx, 'Their usual standard', x0, Y(0) - 10, col['label-tertiary'], bg, { size: 11 });
  const sorted = [...st.landings].sort((a, b) => a - b);
  const hi = sorted[Math.floor(n * 0.85)], lo = sorted[Math.floor(n * 0.15)];
  let afterGood = [], afterBad = [];
  st.landings.forEach((v, i) => {
    const good = v >= hi, bad = v <= lo;
    ctx.fillStyle = good ? col.success : bad ? col.danger : alpha(col['hiw-ink-1'], 0.6);
    const bw = Math.max(3, (x1 - x0) / n - 3);
    const y = Y(v);
    ctx.fillRect(X(i) - bw / 2, Math.min(y, Y(0)), bw, Math.abs(y - Y(0)));
    if (i + 1 < n) {
      if (good) afterGood.push(st.landings[i + 1]);
      if (bad) afterBad.push(st.landings[i + 1]);
    }
  });
  label(ctx, 'Green: praised. Red: told off.', x0, y1 + 18, col['label-secondary'], bg, { size: 11 });
  return { afterGood: mean(afterGood), afterBad: mean(afterBad), good: mean(sorted.filter((v) => v >= hi)), bad: mean(sorted.filter((v) => v <= lo)) };
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'landings') {
    const s = drawLandings(ctx, w, h, col, bg);
    r?.set('good', `${s.good > 0 ? '+' : ''}${fmt(s.good, 1)}, then ${s.afterGood > 0 ? '+' : ''}${fmt(s.afterGood, 1)}`);
    r?.set('bad', `${fmt(s.bad, 1)}, then ${s.afterBad > 0 ? '+' : ''}${fmt(s.afterBad, 1)}`);
    return false;
  }
  const s = drawScatter(ctx, w, h, col, bg, ch === 'top' ? 'top' : ch === 'bottom' ? 'bottom' : null);
  if (s) {
    r?.set('first', `${s.m1 > 0 ? '+' : ''}${fmt(s.m1, 2)}`);
    r?.set('second', `${s.m2 > 0 ? '+' : ''}${fmt(s.m2, 2)}`);
  }
  const all = st.people.map(scores);
  const m1 = mean(all.map((x) => x[0])), m2 = mean(all.map((x) => x[1]));
  const sd = (a, m) => Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
  const corr = mean(all.map((x) => (x[0] - m1) * (x[1] - m2))) / (sd(all.map((x) => x[0]), m1) * sd(all.map((x) => x[1]), m2));
  r?.set('corr', fmt(corr, 2));
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({
    luck: 'Four hundred people, two tests each',
    top: 'The top tenth on the first test',
    landings: 'One pilot, forty landings',
    bottom: 'The bottom tenth on the first test',
  }[id]);
  if (id === 'landings') {
    ui.button({ label: 'Forty more landings', onClick() { newLandings(); api.invalidate(); } });
    st.readout = api.readout([{ key: 'good', label: 'Praised landings, then the next' }, { key: 'bad', label: 'Told-off landings, then the next' }]);
  } else {
    if (id === 'luck') {
      ui.slider({
        label: 'How much luck counts',
        min: 0,
        max: 2,
        step: 0.05,
        value: st.luck,
        format: (v) => (v === 0 ? 'None' : v < 0.6 ? 'A little' : v < 1.4 ? 'As much as skill' : 'More than skill'),
        onInput(v) { st.luck = v; api.invalidate(); },
      });
    } else st.luck = 1;
    ui.button({ label: 'New people', onClick() { newPeople(); api.invalidate(); } });
    st.readout = id === 'luck'
      ? api.readout([{ key: 'corr', label: 'How well the first score predicts the second' }])
      : api.readout([{ key: 'first', label: 'Their average, first test' }, { key: 'second', label: 'Their average, second test' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

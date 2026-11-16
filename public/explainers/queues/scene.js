// ---------------------------------------------------------------------------
// Why queues suddenly get long: the scene.
//
// Customers arrive at random (a Poisson stream) and each takes on average
// one minute to serve. Chapter 1 simulates one till, event by event, with
// "busy" the arrival rate as a share of what the till can manage. Chapter
// 2 draws the average wait in the queue for one till, ρ/(1 − ρ) minutes,
// and chapter 3 the same with every customer taking exactly a minute,
// half that. Chapter 4 compares two tills each with its own queue against
// two tills sharing one, from Erlang's formula.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { plot, curve, seeded } from '../shared/plot.js';

const st = { rho: 0.8, sim: null, readout: null, shared: true };

const mm1 = (r) => r / (1 - r);
const md1 = (r) => r / (2 * (1 - r));
/** Average wait for c tills sharing one queue, each busy a share r of the time (Erlang C). */
function mmc(c, r) {
  const a = c * r;
  let s = 0, t = 1;
  for (let k = 0; k < c; k++) { if (k) t *= a / k; s += t; }
  const tc = (t * a) / c;
  const pc = tc / (1 - r);
  const C = pc / (s + pc);
  return C / (c - a);
}

function newSim(seed) {
  return { rnd: seeded(seed), clock: 0, next: 0, queue: [], busy: null, served: 0, waited: 0 };
}
const exp = (rnd, mean) => -Math.log(1 - rnd()) * mean;

function advance(sim, minutes, fixed) {
  const end = sim.clock + minutes;
  while (true) {
    const tBusy = sim.busy ? sim.busy.until : Infinity;
    const t = Math.min(sim.next, tBusy);
    if (t > end) break;
    sim.clock = t;
    if (t === sim.next) {
      sim.queue.push({ came: t });
      sim.next = t + exp(sim.rnd, 1 / st.rho);
    } else {
      sim.busy = null;
    }
    if (!sim.busy && sim.queue.length) {
      const c = sim.queue.shift();
      sim.waited += sim.clock - c.came;
      sim.served++;
      sim.busy = { until: sim.clock + (fixed ? 1 : exp(sim.rnd, 1)) };
    }
  }
  sim.clock = end;
}

function tillView(ctx, w, h, col, bg, sim) {
  const tx = w - 90, ty = h * 0.4;
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.strokeStyle = col['separator-strong'];
  ctx.beginPath();
  ctx.roundRect(tx, ty - 30, 60, 60, 8);
  ctx.fill();
  ctx.stroke();
  label(ctx, 'Till', tx + 30, ty + 46, col['label-secondary'], bg, { size: 11, align: 'center' });
  if (sim.busy) {
    ctx.beginPath();
    ctx.arc(tx + 30, ty, 12, 0, TAU);
    ctx.fillStyle = col.accent;
    ctx.fill();
  }
  sim.queue.forEach((c, i) => {
    const x = tx - 30 - i * 26;
    if (x < 10) return;
    ctx.beginPath();
    ctx.arc(x, ty, 10, 0, TAU);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
  });
  if (sim.queue.length * 26 > tx - 40) label(ctx, `+${sim.queue.length - Math.floor((tx - 40) / 26)} more`, 16, ty - 24, col.danger, bg, { size: 12, weight: 700 });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let more = false;
  if (ch === 'busy') {
    const moving = api.playing && api.motion;
    if (moving) advance(st.sim, f.dt * 2, false);
    tillView(ctx, w, h * 0.6, col, bg, st.sim);
    // A strip of the queue's length over the last hour.
    if (!st.hist) st.hist = [];
    st.hist.push([st.sim.clock, st.sim.queue.length]);
    while (st.hist.length && st.hist[0][0] < st.sim.clock - 60) st.hist.shift();
    const g = plot(ctx, col, bg, { x0: 54, x1: w - 20, y0: h * 0.62, y1: h - 36 },
      { min: st.sim.clock - 60, max: st.sim.clock, ticks: [], name: 'The last hour' },
      { min: 0, max: 20, ticks: [0, 10, 20], name: 'People waiting' });
    ctx.strokeStyle = col['hiw-ink-1'];
    ctx.lineWidth = 2;
    ctx.beginPath();
    st.hist.forEach(([t, n], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, g.X(t), g.Y(Math.min(20, n))));
    ctx.stroke();
    r?.set('avg', st.sim.served ? `${fmt(st.sim.waited / st.sim.served, 1)} min` : '–');
    r?.set('theory', `${fmt(mm1(st.rho), 1)} min`);
    more = moving;
  } else if (ch === 'curve' || ch === 'steady') {
    const g = plot(ctx, col, bg, { x0: 54, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: (v) => `${Math.round(v * 100)}%`, name: 'How busy the till is' },
      { min: 0, max: 20, ticks: [0, 5, 10, 15, 20], name: 'Average wait in the queue, minutes' });
    curve(ctx, g, (x) => Math.min(20.5, mm1(x)), 0, 0.985, col.danger, 3, 300);
    if (ch === 'steady') curve(ctx, g, (x) => Math.min(20.5, md1(x)), 0, 0.985, col['hiw-ink-1'], 3, 300);
    ctx.beginPath();
    ctx.arc(g.X(st.rho), g.Y(Math.min(20, mm1(st.rho))), 6, 0, TAU);
    ctx.fillStyle = col.danger;
    ctx.fill();
    if (ch === 'steady') {
      label(ctx, 'Random service times', g.x0 + 12, g.y0 + 14, col.danger, bg, { size: 12, weight: 700 });
      label(ctx, 'Every customer one minute', g.x0 + 12, g.y0 + 34, col['hiw-ink-1'], bg, { size: 12, weight: 700 });
      r?.set('fixed', `${fmt(md1(st.rho), 1)} min`);
    }
    r?.set('wait', `${fmt(mm1(st.rho), 1)} min`);
  } else if (ch === 'shared') {
    const g = plot(ctx, col, bg, { x0: 54, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: (v) => `${Math.round(v * 100)}%`, name: 'How busy each till is' },
      { min: 0, max: 20, ticks: [0, 5, 10, 15, 20], name: 'Average wait, minutes' });
    curve(ctx, g, (x) => Math.min(20.5, mm1(x)), 0, 0.985, col.danger, 3, 300);
    curve(ctx, g, (x) => Math.min(20.5, mmc(2, x)), 0, 0.985, col.success, 3, 300);
    label(ctx, 'A queue for each till', g.x0 + 12, g.y0 + 14, col.danger, bg, { size: 12, weight: 700 });
    label(ctx, 'One queue for both', g.x0 + 12, g.y0 + 34, col.success, bg, { size: 12, weight: 700 });
    for (const [fn, c] of [[mm1, col.danger], [(x) => mmc(2, x), col.success]]) {
      ctx.beginPath();
      ctx.arc(g.X(st.rho), g.Y(Math.min(20, fn(st.rho))), 6, 0, TAU);
      ctx.fillStyle = c;
      ctx.fill();
    }
    r?.set('own', `${fmt(mm1(st.rho), 1)} min`);
    r?.set('one', `${fmt(mmc(2, st.rho), 1)} min`);
  }
  return more;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ busy: 'One till; customers arrive at random', curve: 'One till, each customer a minute on average', steady: 'The same, with every customer taking exactly a minute', shared: 'Two tills' }[id]);
  const busy = (fn) => ui.slider({ label: 'Busy', min: 10, max: 98, value: Math.round(st.rho * 100), format: (v) => `${v}%`, onInput(v) { st.rho = v / 100; fn?.(); api.invalidate(); } });
  if (id === 'busy') {
    st.sim = newSim(7);
    st.hist = [];
    busy(() => { st.sim = newSim(7); st.hist = []; });
    if (!api.motion) ui.button({ label: 'Run an hour', onClick() { advance(st.sim, 60, false); api.invalidate(); } });
    st.readout = api.readout([{ key: 'avg', label: 'Average wait so far' }, { key: 'theory', label: 'In the long run' }]);
  } else if (id === 'curve') {
    busy();
    st.readout = api.readout([{ key: 'wait', label: 'Average wait' }]);
  } else if (id === 'steady') {
    busy();
    st.readout = api.readout([{ key: 'wait', label: 'Random times' }, { key: 'fixed', label: 'Exactly a minute each' }]);
  } else if (id === 'shared') {
    busy();
    st.readout = api.readout([{ key: 'own', label: 'A queue for each' }, { key: 'one', label: 'One queue for both' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

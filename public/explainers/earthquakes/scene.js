// ---------------------------------------------------------------------------
// How earthquakes are found: the scene.
//
// Chapter 1 sends P and S waves out from a quake towards a seismometer and
// draws its trace as they arrive. Chapter 2 moves the seismometer and reads
// the distance off the gap. Chapter 3 is a map: three stations, a circle
// for each one's distance, and the quake where they meet. Chapter 4 counts
// smaller quakes against one big one.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { VP, VS, KM_PER_S, gapFor, energyRatio, trace } from './art.js';

const st = { t: 0, km: 200, quake: [0.55, 0.45], circles: new Set([0, 1, 2]), steps: 2, readout: null };
const STATIONS = [[0.18, 0.25, 'Station A'], [0.85, 0.3, 'Station B'], [0.35, 0.85, 'Station C']];

function seismogram(ctx, x0, y0, w, h, km, until, col, bg) {
  const span = Math.max(60, km / VS + 30);
  ctx.strokeStyle = col.separator;
  ctx.strokeRect(x0, y0, w, h);
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let s = 0; s <= Math.min(until, span); s += span / 600) {
    const x = x0 + (s / span) * w, y = y0 + h / 2 - trace(s, km) * h * 0.45;
    s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  const tp = km / VP, ts = km / VS;
  for (const [t, name, c] of [[tp, 'P', col['hiw-ink-1']], [ts, 'S', col.danger]]) {
    if (until < t) continue;
    const x = x0 + (t / span) * w;
    ctx.strokeStyle = c;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + h);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, name, x + 4, y0 + 10, c, bg, { size: 12, weight: 800 });
  }
  label(ctx, 'Seconds after the quake', x0 + w, y0 + h + 12, col['label-tertiary'], bg, { size: 11, align: 'right' });
}

function drawWaves(ctx, w, h, col, bg) {
  // A strip of ground from the quake, on the left, to the station.
  const y = 120, x0 = 30, x1 = w - 40;
  const k = (x1 - x0) / st.km;
  ctx.fillStyle = col['bg-elevated'];
  ctx.fillRect(0, y, w, 6);
  ctx.beginPath();
  ctx.arc(x0, y, 7, 0, TAU);
  ctx.fillStyle = col.danger;
  ctx.fill();
  label(ctx, 'Quake', x0, y - 16, col['label-secondary'], bg, { size: 11, align: 'center' });
  ctx.fillStyle = col.label;
  ctx.fillRect(x1 - 6, y - 14, 12, 14);
  label(ctx, `Seismometer, ${st.km} km`, x1, y - 24, col['label-secondary'], bg, { size: 11, align: 'right' });
  for (const [v, c] of [[VP, col['hiw-ink-1']], [VS, col.danger]]) {
    const r = v * st.t * k;
    if (r > x1 - x0 + 40) continue;
    ctx.strokeStyle = alpha(c, 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x0, y, r, -Math.PI / 2.4, Math.PI / 2.4);
    ctx.stroke();
  }
  seismogram(ctx, 20, h * 0.42, w - 40, h * 0.42, st.km, st.t, col, bg);
}

function drawMap(ctx, w, h, col, bg) {
  const x0 = 20, y0 = 70, mw = w - 40, mh = h - 100;
  const scale = 600 / mw;           // km per pixel: the map is 600 km across
  const P = ([x, y]) => [x0 + x * mw, y0 + y * mh];
  ctx.strokeStyle = col.separator;
  ctx.strokeRect(x0, y0, mw, mh);
  const q = P(st.quake);
  STATIONS.forEach((s, i) => {
    const p = P(s);
    const km = Math.hypot(p[0] - q[0], p[1] - q[1]) * scale;
    if (st.circles.has(i)) {
      ctx.strokeStyle = alpha([col['hiw-ink-1'], col['hiw-ink-4'], col.warning][i], 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p[0], p[1], km / scale, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = col.label;
    ctx.fillRect(p[0] - 5, p[1] - 5, 10, 10);
    // Labels on the right-hand side of the map read leftwards, so they stay on it.
    const right = s[0] > 0.6;
    label(ctx, `${s[2]}: ${fmt(gapFor(km), 1)} s gap, ${fmt(km, 0)} km`, p[0] + (right ? -10 : 10), p[1] - 12, col['label-secondary'], bg, { size: 11, align: right ? 'right' : 'left' });
  });
  if (st.circles.size === 3) {
    ctx.beginPath();
    ctx.arc(q[0], q[1], 8, 0, TAU);
    ctx.fillStyle = col.danger;
    ctx.fill();
    label(ctx, 'Quake', q[0], q[1] + 18, col.danger, bg, { size: 12, weight: 700, align: 'center' });
  }
  label(ctx, '600 km across', x0 + mw - 4, y0 + mh + 14, col['label-tertiary'], bg, { size: 11, align: 'right' });
}

function drawMagnitude(ctx, w, h, col, bg) {
  const n = Math.round(energyRatio(st.steps));
  const x0 = 20, y0 = 90, aw = w - 40, ah = h - 130;
  const per = Math.ceil(Math.sqrt((n * aw) / ah)), cell = Math.min(aw / per, 40);
  label(ctx, `One magnitude ${5 + st.steps}`, x0, y0 - 18, col.danger, bg, { size: 13, weight: 700 });
  label(ctx, `releases as much energy as ${n.toLocaleString('en-GB')} of magnitude 5`, x0, y0 - 2, col['label-secondary'], bg, { size: 12 });
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x0 + (i % per) * cell + cell / 2, y0 + 14 + Math.floor(i / per) * cell + cell / 2, cell * 0.38, 0, TAU);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
  }
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (ch === 'waves' || ch === 'gap') {
    const end = st.km / VS + 30;
    if (api.playing && api.motion) {
      st.t = st.t >= end ? 0 : st.t + dt * (st.km / 40);
      moving = true;
    } else if (!api.motion) st.t = end;
    drawWaves(ctx, w, h, col, bg);
    r?.set('p', `${fmt(st.km / VP, 1)} s`);
    r?.set('s', `${fmt(st.km / VS, 1)} s`);
    r?.set('gap', `${fmt(gapFor(st.km), 1)} s, so ${fmt(gapFor(st.km) * KM_PER_S, 0)} km away`);
  } else if (ch === 'locate') {
    drawMap(ctx, w, h, col, bg);
  } else if (ch === 'magnitude') {
    drawMagnitude(ctx, w, h, col, bg);
    r?.set('shake', `${10 ** st.steps} times`);
    r?.set('energy', `${Math.round(energyRatio(st.steps)).toLocaleString('en-GB')} times`);
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ waves: 'Two kinds of wave from one quake', gap: 'Move the seismometer', locate: 'Three stations, one quake', magnitude: 'Each dot is one magnitude 5' }[id]);
  st.readout = null;
  if (id === 'waves' || id === 'gap') {
    st.t = 0;
    if (id === 'waves') st.km = 200;
    if (id === 'gap') ui.slider({ label: 'Distance to the seismometer', min: 20, max: 800, step: 10, value: st.km, format: (v) => `${v} km`, onInput(v) { st.km = v; st.t = v / VS + 30; api.invalidate(); } });
    st.readout = api.readout(id === 'waves'
      ? [{ key: 'p', label: 'P wave arrives' }, { key: 's', label: 'S wave arrives' }]
      : [{ key: 'gap', label: 'Gap between them' }]);
  } else if (id === 'locate') {
    ui.chips({
      label: 'Circles drawn',
      items: STATIONS.map((s, i) => ({ id: i, label: s[2], pressed: st.circles.has(i) })),
      onChange(i, on) { on ? st.circles.add(i) : st.circles.delete(i); api.invalidate(); },
    });
    ui.button({ label: 'New quake', onClick() { st.quake = [0.25 + Math.random() * 0.5, 0.3 + Math.random() * 0.45]; api.invalidate(); } });
  } else if (id === 'magnitude') {
    ui.choice({ label: 'Compare with magnitude 5', options: [{ id: '1', label: 'Magnitude 6' }, { id: '2', label: 'Magnitude 7' }], value: String(st.steps), onChange(v) { st.steps = Number(v); api.invalidate(); } });
    st.readout = api.readout([{ key: 'shake', label: 'Shaking on the trace' }, { key: 'energy', label: 'Energy' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

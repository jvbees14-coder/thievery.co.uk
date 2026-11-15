// ---------------------------------------------------------------------------
// Why traffic jams appear from nowhere: the scene.
//
// Cars on a 230 m ring road, simulated by art.js, running four times faster
// than life. Chapter 1 is the ring; chapter 2 adds a record of where every
// car was over the last two minutes, in which a jam shows as a dark band
// drifting backwards; chapter 3 changes the number of cars; chapter 4 makes
// one driver steady.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU, clamp } from '../engine.js';
import { label, setFace, mix, TOKENS } from '../shared/draw.js';
import { ROAD, ring, step, meanSpeed } from './art.js';

const FAST = 4, DT = 0.05, KEEP = 120;
const st = { n: 22, cars: [], time: 0, acc: 0, trail: [], calm: false, readout: null };

function restart(n = st.n) {
  st.n = n;
  st.cars = ring(n);
  st.time = 0;
  st.acc = 0;
  st.trail = [];
  if (st.calm) st.cars[0].calm = true;
}
restart();

function run(dt) {
  st.acc += dt * FAST;
  while (st.acc >= DT) {
    step(st.cars, DT);
    st.time += DT;
    st.acc -= DT;
    // A sample every half second for the record.
    if (Math.round(st.time / DT) % 10 === 0) {
      st.trail.push(st.cars.map((c) => [c.x, c.v]));
      if (st.trail.length > KEEP * 2) st.trail.shift();
    }
  }
}

// Red for stopped, green from about 10 km/h up.
const speedColour = (col, v) => mix(col.danger, col.success, clamp(v / 2.8, 0, 1));

function drawRing(ctx, cx, cy, R, col, bg) {
  ctx.strokeStyle = col['bg-elevated-2'];
  ctx.lineWidth = Math.max(14, R * 0.12);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 1;
  const carLen = (4.5 / ROAD) * TAU;
  for (const c of st.cars) {
    const a = (c.x / ROAD) * TAU - Math.PI / 2;
    ctx.strokeStyle = c.calm ? col['hiw-ink-4'] : speedColour(col, c.v);
    ctx.lineWidth = Math.max(8, R * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, R, a - carLen / 2, a + carLen / 2);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.lineWidth = 1;
  label(ctx, 'Traffic goes clockwise', cx, cy, col['label-tertiary'], bg, { size: 11, align: 'center' });
}

function drawRecord(ctx, x0, y0, w, h, col, bg) {
  // Position round the ring across, time down the page, newest at the bottom.
  const rows = st.trail.length;
  ctx.strokeStyle = col.separator;
  ctx.strokeRect(x0, y0, w, h);
  st.trail.forEach((snap, k) => {
    const y = y0 + h - ((rows - 1 - k) / (KEEP * 2)) * h;
    for (const [x, v] of snap) {
      ctx.fillStyle = speedColour(col, v);
      ctx.fillRect(x0 + (x / ROAD) * w - 1, y - 1, 2.5, 2.5);
    }
  });
  label(ctx, 'Where each car was, over the last two minutes', x0, y0 - 12, col['label-tertiary'], bg, { size: 11 });
  label(ctx, 'Now', x0 + w + 4, y0 + h, col['label-tertiary'], bg, { size: 11 });
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
    run(Math.min(dt, 0.1));
    moving = true;
  }
  if (ch === 'wave') {
    const R = Math.min(w * 0.18, h * 0.16);
    drawRing(ctx, w / 2, 60 + R, R, col, bg);
    const top = 60 + 2 * R + 40;
    drawRecord(ctx, 20, top, w - 60, h - top - 20, col, bg);
  } else {
    const R = Math.min(w, h - 60) * 0.38;
    drawRing(ctx, w / 2, (h + 40) / 2, R, col, bg);
  }
  const mean = meanSpeed(st.cars);
  const slow = Math.min(...st.cars.map((c) => c.v));
  r?.set('time', `${fmt(st.time / 60, 1)} min`);
  r?.set('mean', `${fmt(mean * 3.6, 0)} km/h`);
  r?.set('slow', `${fmt(slow * 3.6, 0)} km/h`);
  r?.set('flow', `${fmt((st.n / ROAD) * mean * 3600, 0)} cars an hour`);
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({
    ring: '22 cars on a 230 m ring, four times faster than life',
    wave: 'The same ring, and a record of it',
    density: 'Choose how many cars',
    smooth: '22 cars; the purple one can be steady',
  }[id]);
  st.calm = false;
  if (id === 'density') {
    restart(st.n);
    ui.slider({ label: 'Cars', min: 6, max: 30, value: st.n, onInput(v) { restart(v); api.invalidate(); } });
  } else if (id === 'smooth') {
    restart(22);
    ui.toggle({
      label: 'One steady driver',
      checked: false,
      onChange(v) {
        st.calm = v;
        st.cars[0].calm = v;
        api.invalidate();
      },
    });
  } else restart(22);
  ui.button({ label: 'Start again', onClick() { restart(st.n); api.invalidate(); } });
  const rows = [{ key: 'time', label: 'Time' }, { key: 'mean', label: 'Average speed' }, { key: 'slow', label: 'Slowest car' }];
  if (id === 'density') rows.push({ key: 'flow', label: 'Getting through' });
  st.readout = api.readout(rows);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

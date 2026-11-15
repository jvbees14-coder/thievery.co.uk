// ---------------------------------------------------------------------------
// How solar panels work: the scene.
//
// Chapter 1 is a slice of a cell: light knocks electrons loose and the
// junction sends them one way, round a circuit. Chapter 2 tilts a panel
// against the Sun's rays. Chapter 3 is a clear day in London on a panel
// tilted 35° to the south, worked out by art.js. Chapter 4 is where a
// thousand watts of sunlight go.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU, clamp } from '../engine.js';
import { label, setFace, box, arrow, TOKENS } from '../shared/draw.js';
import { onPanel, daily, elevation } from './art.js';

const LAT = 51.5, TILT = 35;
const st = { light: 0.7, angle: 0, day: 172, t: 0, readout: null };

function drawCell(ctx, w, h, col, bg) {
  const x0 = 40, x1 = w - 40, top = h * 0.32, mid = h * 0.45, bot = h * 0.6;
  box(ctx, x0, top, x1 - x0, mid - top, 4);
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.3);
  ctx.fill();
  box(ctx, x0, mid, x1 - x0, bot - mid, 4);
  ctx.fillStyle = alpha(col['hiw-ink-4'], 0.3);
  ctx.fill();
  label(ctx, 'Silicon with extra electrons', x1 - 6, (top + mid) / 2, col['label-secondary'], null, { size: 11, align: 'right' });
  label(ctx, 'Silicon short of electrons', x1 - 6, (mid + bot) / 2, col['label-secondary'], null, { size: 11, align: 'right' });
  ctx.strokeStyle = col.warning;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x0, mid);
  ctx.lineTo(x1, mid);
  ctx.stroke();
  ctx.setLineDash([]);
  // The circuit: from the top layer, round through a lamp, into the bottom.
  ctx.strokeStyle = col['label-tertiary'];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0 + 10, top);
  ctx.lineTo(x0 + 10, top - 30);
  ctx.lineTo(x0 - 20, top - 30);
  ctx.lineTo(x0 - 20, bot + 30);
  ctx.lineTo(x0 + 10, bot + 30);
  ctx.lineTo(x0 + 10, bot);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x0 - 20, (top + bot) / 2, 12, 0, TAU);
  ctx.fillStyle = alpha(col.accent, 0.2 + 0.8 * st.light);
  ctx.fill();
  // Photons coming down; each one that lands frees an electron.
  const n = Math.round(st.light * 10);
  for (let i = 0; i < n; i++) {
    const x = x0 + 40 + ((i * 71) % 100) / 100 * (x1 - x0 - 120);
    const f = (st.t * 0.6 + i * 0.13) % 1;
    if (f < 0.5) {
      const y = 60 + (f / 0.5) * (mid - 60);
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 14; k++) ctx.lineTo(x + Math.sin(k * 1.2) * 4, y - 26 + k * 2);
      ctx.stroke();
    } else {
      // The freed electron drifts up and out into the wire.
      const g = (f - 0.5) / 0.5;
      ctx.beginPath();
      ctx.arc(x - g * (x - x0 - 10), mid - g * (mid - top), 4, 0, TAU);
      ctx.fillStyle = col['hiw-ink-1'];
      ctx.fill();
    }
  }
  label(ctx, 'Light', x0 + 40, 56, col.accent, bg, { size: 11 });
}

function drawAngle(ctx, w, h, col, bg) {
  const cx = w / 2, cy = h * 0.58, L = Math.min(w, h) * 0.32;
  const a = (st.angle * Math.PI) / 180;
  // Rays straight down; the panel turned by `angle`.
  const px = Math.cos(a) * L, py = Math.sin(a) * L;
  const caught = Math.abs(Math.cos(a)) * L;
  ctx.fillStyle = alpha(col.accent, 0.15);
  ctx.fillRect(cx - caught, 60, caught * 2, cy - 60);
  for (let i = -6; i <= 6; i++) {
    const x = cx + (i / 6) * L * 1.2;
    const inside = Math.abs(x - cx) <= caught;
    ctx.strokeStyle = inside ? col.accent : alpha(col.accent, 0.25);
    ctx.lineWidth = 1.5;
    arrow(ctx, x, 60, x, inside ? cy + (x - cx) * Math.tan(a) : h - 20, ctx.strokeStyle, 1.5, 6);
  }
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(cx - px, cy - py);
  ctx.lineTo(cx + px, cy + py);
  ctx.stroke();
  ctx.lineWidth = 1;
  label(ctx, 'Sunlight', cx - L * 1.2, 52, col.accent, bg, { size: 11 });
}

function drawDay(ctx, w, h, col, bg, api) {
  const x0 = 50, x1 = w - 20, y0 = 80, y1 = h - 40;
  const X = (t) => x0 + ((t - 3) / 18) * (x1 - x0), Y = (v) => y1 - (v / 1000) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  for (const v of [0, 250, 500, 750, 1000]) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(v));
    ctx.lineTo(x1, Y(v));
    ctx.stroke();
    label(ctx, `${v}`, x0 - 6, Y(v), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  for (const t of [6, 9, 12, 15, 18]) label(ctx, `${t}:00`, X(t), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Watts per square metre of panel', x0, y0 - 16, col['label-tertiary'], bg, { size: 11 });
  for (const [d, c, wd] of [[172, alpha(col['label-tertiary'], 0.5), 1.5], [355, alpha(col['label-tertiary'], 0.5), 1.5], [st.day, col.accent, 3]]) {
    ctx.strokeStyle = c;
    ctx.lineWidth = wd;
    ctx.beginPath();
    for (let t = 3; t <= 21; t += 0.1) {
      const p = [X(t), Y(onPanel(LAT, d, t, TILT))];
      t === 3 ? ctx.moveTo(...p) : ctx.lineTo(...p);
    }
    ctx.stroke();
  }
  ctx.fillStyle = alpha(col.accent, 0.12);
  ctx.beginPath();
  ctx.moveTo(X(3), Y(0));
  for (let t = 3; t <= 21; t += 0.1) ctx.lineTo(X(t), Y(onPanel(LAT, st.day, t, TILT)));
  ctx.lineTo(X(21), Y(0));
  ctx.fill();
  if (api.playing && api.motion) {
    const t = 4 + (st.t % 16);
    if (elevation(LAT, st.day, t) > 0) {
      ctx.beginPath();
      ctx.arc(X(t), Y(onPanel(LAT, st.day, t, TILT)), 6, 0, TAU);
      ctx.fillStyle = col.label;
      ctx.fill();
    }
  }
}

function drawBudget(ctx, w, h, col, bg) {
  const parts = [[200, 'Electricity', col.accent], [800, 'Warms the panel, or is reflected', col['label-tertiary']]];
  const x0 = 20, x1 = w - 20, y = h * 0.42;
  let x = x0;
  label(ctx, '1,000 watts of sunlight on a square metre', x0, y - 24, col.label, bg, { size: 13, weight: 700 });
  for (const [v, name, c] of parts) {
    const pw = (v / 1000) * (x1 - x0);
    box(ctx, x, y, pw - 3, 40, 6);
    ctx.fillStyle = c;
    ctx.fill();
    label(ctx, `${name}: about ${v} W`, x + 4, y + 58, c, bg, { size: 12, weight: 700 });
    x += pw;
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
  if (api.playing && api.motion && (ch === 'photon' || ch === 'day')) {
    st.t += dt * (ch === 'day' ? 1.5 : 1);
    moving = true;
  }
  if (ch === 'photon') drawCell(ctx, w, h, col, bg);
  else if (ch === 'angle') {
    drawAngle(ctx, w, h, col, bg);
    r?.set('share', `${fmt(clamp(Math.cos((st.angle * Math.PI) / 180), 0, 1) * 100, 0)}%`);
  } else if (ch === 'day') {
    drawDay(ctx, w, h, col, bg, api);
    const k = daily(LAT, st.day, TILT);
    r?.set('kwh', `${fmt(k, 1)} kWh per m²`);
    r?.set('panel', `${fmt(k * 0.2 * 1.9, 1)} kWh`);
  } else if (ch === 'budget') drawBudget(ctx, w, h, col, bg);
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ photon: 'A slice through one cell', angle: 'Sunlight on a panel at an angle', day: 'A clear day in London, panel tilted 35° south', budget: 'A typical silicon panel' }[id]);
  if (id === 'photon') ui.slider({ label: 'Sunlight', min: 0, max: 1, step: 0.05, value: st.light, format: (v) => `${Math.round(v * 100)}%`, onInput(v) { st.light = v; api.invalidate(); } });
  if (id === 'angle') {
    ui.slider({ label: 'Panel turned from the Sun', min: 0, max: 90, value: st.angle, format: (v) => `${v}°`, onInput(v) { st.angle = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'share', label: 'Sunlight caught, against face-on' }]);
  }
  if (id === 'day') {
    ui.choice({ label: 'Day', options: [{ id: '172', label: 'June' }, { id: '80', label: 'March' }, { id: '355', label: 'December' }], value: String(st.day), onChange(v) { st.day = Number(v); api.invalidate(); } });
    st.readout = api.readout([{ key: 'kwh', label: 'Direct sunlight over the day' }, { key: 'panel', label: 'One 400-watt panel makes' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

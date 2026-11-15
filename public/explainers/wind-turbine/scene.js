// ---------------------------------------------------------------------------
// How a wind turbine works: the scene.
//
// The power carried by wind through a disc of radius r is ½ρπr²v³ (air
// 1.225 kg/m³). Chapter 1 turns a rotor in the chosen wind; chapter 2 is
// that power against wind speed, with a typical turbine's limits; chapter 3
// is Betz's limit: slowing the wind to a fraction b of its speed captures
// ½(1 + b)(1 − b²) of the power, at most 16/27 when b = 1/3. Chapter 4
// changes the blade length.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const RHO = 1.225;
const st = { v: 10, r: 60, b: 1 / 3, angle: 0, readout: null };
const windPower = (r, v) => 0.5 * RHO * Math.PI * r * r * v ** 3;
const captured = (b) => 0.5 * (1 + b) * (1 - b * b);
const mw = (W) => `${fmt(W / 1e6, W < 1e7 ? 2 : 1)} MW`;

function rotor(ctx, cx, cy, R, col, dt, speed, api) {
  if (api.playing && api.motion) st.angle += dt * speed;
  ctx.strokeStyle = col['separator-strong'];
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy + R * 1.5);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = st.angle + (i * TAU) / 3;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.04);
    ctx.quadraticCurveTo(R * 0.5, -R * 0.09, R, 0);
    ctx.quadraticCurveTo(R * 0.5, R * 0.03, 0, R * 0.04);
    ctx.fillStyle = col.stock;
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.06, 0, TAU);
  ctx.fillStyle = col['label-secondary'];
  ctx.fill();
}

function streaks(ctx, w, h, col, v) {
  ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.5);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    const y = 80 + ((i * 53) % (h - 120)), off = ((st.angle * 40 + i * 70) % (w + 80)) - 40;
    ctx.beginPath();
    ctx.moveTo(off, y);
    ctx.lineTo(off + 10 + v * 3, y);
    ctx.stroke();
  }
}

function curve(ctx, w, h, col, bg) {
  const x0 = 60, x1 = w - 20, y0 = 80, y1 = h - 40, R = st.r;
  const rated = windPower(R, 12) * 0.45;
  const X = (v) => x0 + (v / 30) * (x1 - x0), Y = (W) => y1 - (W / (windPower(R, 14) * 0.6)) * (y1 - y0);
  const out = (v) => (v < 3 || v > 25 ? 0 : Math.min(rated, windPower(R, v) * 0.45));
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  for (const v of [0, 5, 10, 15, 20, 25, 30]) label(ctx, `${v}`, X(v), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Wind speed, metres a second', x1, y1 + 28, col['label-tertiary'], bg, { size: 11, align: 'right' });
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0 - 10, x1 - x0, y1 - y0 + 10);
  ctx.clip();
  ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let v = 0; v <= 30; v += 0.2) (v ? ctx.lineTo : ctx.moveTo).call(ctx, X(v), Y(windPower(R, v)));
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let v = 0; v <= 30; v += 0.1) (v ? ctx.lineTo : ctx.moveTo).call(ctx, X(v), Y(out(v)));
  ctx.stroke();
  label(ctx, 'Power in the wind', X(11.5), y0 + 6, col['hiw-ink-1'], bg, { size: 11, align: 'right' });
  label(ctx, 'What a turbine makes', X(20), Y(rated) - 12, col.accent, bg, { size: 11, align: 'center' });
  ctx.beginPath();
  ctx.arc(X(st.v), Y(out(st.v)), 6, 0, TAU);
  ctx.fillStyle = col.accent;
  ctx.fill();
}

function betz(ctx, w, h, col, bg) {
  const x0 = 60, x1 = w - 20, y0 = 80, y1 = h - 40;
  const X = (b) => x0 + b * (x1 - x0), Y = (c) => y1 - (c / 0.7) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  for (const c of [0, 0.2, 0.4, 0.6]) label(ctx, `${c * 100}%`, x0 - 6, Y(c), col['label-tertiary'], bg, { size: 11, align: 'right' });
  for (const b of [0, 0.25, 0.5, 0.75, 1]) label(ctx, `${b * 100}%`, X(b), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Wind speed left behind the rotor', x1, y1 + 28, col['label-tertiary'], bg, { size: 11, align: 'right' });
  label(ctx, 'Share of the wind’s power caught', x0, y0 - 16, col['label-tertiary'], bg, { size: 11 });
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let b = 0; b <= 1.0001; b += 0.01) (b ? ctx.lineTo : ctx.moveTo).call(ctx, X(b), Y(captured(b)));
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = col['label-tertiary'];
  ctx.beginPath();
  ctx.moveTo(x0, Y(16 / 27));
  ctx.lineTo(x1, Y(16 / 27));
  ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, 'Betz’s limit, 59.3%', x1, Y(16 / 27) - 10, col['label-secondary'], bg, { size: 11, align: 'right' });
  ctx.beginPath();
  ctx.arc(X(st.b), Y(captured(st.b)), 7, 0, TAU);
  ctx.fillStyle = col.label;
  ctx.fill();
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (ch === 'power' || ch === 'size') {
    const R = Math.min(w, h) * (ch === 'size' ? 0.12 + (st.r / 100) * 0.25 : 0.32);
    streaks(ctx, w, h, col, st.v);
    rotor(ctx, w / 2, h * 0.42, R, col, dt, st.v * 0.12, api);
    moving = api.playing && api.motion;
  } else if (ch === 'cube') curve(ctx, w, h, col, bg);
  else if (ch === 'betz') betz(ctx, w, h, col, bg);
  const P = windPower(st.r, st.v);
  r?.set('wind', mw(P));
  r?.set('betz', mw(P * 16 / 27));
  r?.set('share', `${fmt(captured(st.b) * 100, 1)}%`);
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ power: 'Blades 60 m long', cube: 'Blades 60 m long, in winds from calm to gale', betz: 'Slowing the wind down', size: 'Longer blades, the same wind' }[id]);
  st.readout = null;
  if (id === 'power' || id === 'cube') {
    st.r = 60;
    ui.slider({ label: 'Wind speed', min: 0, max: 30, step: 0.5, value: st.v, format: (v) => `${v} m/s`, onInput(v) { st.v = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'wind', label: 'Power in the wind through the blades' }, { key: 'betz', label: 'The most any turbine could take' }]);
  } else if (id === 'betz') {
    ui.slider({ label: 'Wind speed left behind the rotor', min: 0, max: 1, step: 0.01, value: st.b, format: (v) => `${Math.round(v * 100)}%`, onInput(v) { st.b = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'share', label: 'Power caught' }]);
  } else if (id === 'size') {
    st.v = 12;
    ui.slider({ label: 'Blade length', min: 10, max: 110, step: 5, value: st.r, format: (v) => `${v} m`, onInput(v) { st.r = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'wind', label: 'Power in a 12 m/s wind' }, { key: 'betz', label: 'The most any turbine could take' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

// ---------------------------------------------------------------------------
// The greenhouse effect: the scene.
//
// Sunlight comes down, some bounces off, the ground warms and glows in
// infrared; arrows are as wide as the power they carry, in watts per square
// metre. Chapters 1 and 2 have no air; chapter 3 adds a layer that catches
// some of the ground's glow; chapter 4 is how much warmer a given amount of
// CO₂ makes things once they settle.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, arrow, TOKENS } from '../shared/draw.js';
import { balance, warming, C } from './art.js';

const st = { albedo: 0.3, eps: 0.78, ppm: 420, readout: null };

function thick(ctx, x1, y1, x2, y2, watts, c) {
  const wdt = Math.max(2, watts / 18);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = alpha(c, 0.8);
  ctx.lineWidth = wdt;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
  arrow(ctx, x1 + (x2 - x1) * 0.98, y1 + (y2 - y1) * 0.98, x2, y2, c, 1, Math.max(8, wdt * 0.9));
}

function scene(ctx, w, h, col, bg, b, air) {
  const ground = h - 70, airTop = 130, airBot = 200;
  // The ground and, if there is one, the layer of air.
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fillRect(0, ground, w, h - ground);
  if (air) {
    ctx.fillStyle = alpha(col['hiw-ink-1'], 0.14);
    ctx.fillRect(0, airTop, w, airBot - airTop);
    label(ctx, 'Air that absorbs infrared', w - 12, airTop + 14, col['hiw-ink-1'], null, { size: 11, align: 'right' });
  }
  const top = 70;
  // Each arrow carries a short label beside its middle.
  const tag = (text, x, y, c) => label(ctx, text, x, y, c, bg, { size: 11, weight: 700 });
  thick(ctx, w * 0.1, top, w * 0.26, ground - 4, b.absorbed, col.accent);
  tag(`Sun ${fmt(b.absorbed, 0)}`, w * 0.18 + 14, (top + ground) / 2, col.accent);
  thick(ctx, w * 0.3, ground - 30, w * 0.36, top, b.reflected, col.stock);
  tag(`Reflected ${fmt(b.reflected, 0)}`, w * 0.36 + 10, top + 16, col['label-secondary']);
  const upTo = air ? airBot : top;
  thick(ctx, w * 0.56, ground - 4, w * 0.56, upTo, b.up, col.danger);
  tag(`Up ${fmt(b.up, 0)}`, w * 0.56 + b.up / 36 + 8, (ground + upTo) / 2, col.danger);
  if (air) {
    if (st.eps < 0.99) thick(ctx, w * 0.56, airTop, w * 0.56, top, (1 - st.eps) * b.up, col.danger);
    thick(ctx, w * 0.9, airTop, w * 0.9, top, b.back, col.danger);
    thick(ctx, w * 0.78, airBot, w * 0.78, ground - 4, b.back, col.warning);
    tag(`Back ${fmt(b.back, 0)}`, w * 0.78 + b.back / 36 + 8, (ground + airBot) / 2, col.warning);
  }
  tag(`Out to space ${fmt(b.toSpace, 0)}`, w * 0.56, top - 6, col.danger);
  // A thermometer reading.
  label(ctx, `Ground: ${fmt(C(b.Ts), 0)} °C`, 16, ground + 30, col.label, bg, { size: 16, weight: 800 });
  // On a narrow scene the note goes on its own line, under the temperature.
  if (w < 520) label(ctx, 'Arrows sized by watts per square metre', 16, ground + 54, col['label-tertiary'], bg, { size: 11 });
  else label(ctx, 'Arrows sized by watts per square metre', w - 12, ground + 30, col['label-tertiary'], bg, { size: 11, align: 'right' });
}

function drawCO2(ctx, w, h, col, bg) {
  const x0 = 50, x1 = w - 20, y0 = 80, y1 = h - 50;
  const X = (p) => x0 + ((p - 250) / (850 - 250)) * (x1 - x0), Y = (t) => y1 - (t / 7) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  for (let t = 0; t <= 7; t++) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(t));
    ctx.lineTo(x1, Y(t));
    ctx.stroke();
    label(ctx, `+${t} °C`, x0 - 6, Y(t), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  for (const p of [280, 420, 560, 840]) label(ctx, `${p}`, X(p), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'CO₂, parts per million', x1, y1 + 30, col['label-tertiary'], bg, { size: 11, align: 'right' });
  // The likely range, 2.5 to 4 °C a doubling, and the best estimate.
  ctx.fillStyle = alpha(col.danger, 0.15);
  ctx.beginPath();
  for (let p = 280; p <= 850; p += 5) ctx.lineTo(X(p), Y(Math.max(0, warming(p, 4))));
  for (let p = 850; p >= 280; p -= 5) ctx.lineTo(X(p), Y(Math.max(0, warming(p, 2.5))));
  ctx.fill();
  ctx.strokeStyle = col.danger;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let p = 280; p <= 850; p += 5) (p === 280 ? ctx.moveTo : ctx.lineTo).call(ctx, X(p), Y(warming(p)));
  ctx.stroke();
  for (const [p, name] of [[280, 'Before industry'], [420, 'Now']]) {
    ctx.beginPath();
    ctx.arc(X(p), Y(warming(p)), 5, 0, TAU);
    ctx.fillStyle = col['label-secondary'];
    ctx.fill();
    label(ctx, name, X(p) + 8, Y(warming(p)) - 12, col['label-secondary'], bg, { size: 11 });
  }
  ctx.beginPath();
  ctx.arc(X(st.ppm), Y(warming(st.ppm)), 7, 0, TAU);
  ctx.fillStyle = col.accent;
  ctx.fill();
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'carbon') {
    drawCO2(ctx, w, h, col, bg);
    r?.set('warm', `+${fmt(warming(st.ppm), 1)} °C`);
    r?.set('range', `+${fmt(warming(st.ppm, 2.5), 1)} to +${fmt(warming(st.ppm, 4), 1)} °C`);
    return false;
  }
  const air = ch === 'blanket';
  const b = balance(st.albedo, air ? st.eps : 0);
  scene(ctx, w, h, col, bg, b, air);
  r?.set('temp', `${fmt(C(b.Ts), 1)} °C`);
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ balance: 'An airless Earth, averaged over day and night', bare: 'An airless Earth', blanket: 'One layer of air', carbon: 'Warming once things settle' }[id]);
  if (id !== 'bare') st.albedo = 0.3;
  if (id === 'bare') {
    ui.slider({ label: 'Sunlight reflected', min: 0.05, max: 0.7, step: 0.01, value: st.albedo, format: (v) => `${Math.round(v * 100)}%`, onInput(v) { st.albedo = v; api.invalidate(); } });
  }
  if (id === 'blanket') {
    ui.slider({ label: 'Infrared the air absorbs', min: 0, max: 1, step: 0.01, value: st.eps, format: (v) => `${Math.round(v * 100)}%`, onInput(v) { st.eps = v; api.invalidate(); } });
  }
  if (id === 'carbon') {
    ui.slider({ label: 'CO₂ in the air', min: 280, max: 840, step: 5, value: st.ppm, format: (v) => `${v} ppm`, onInput(v) { st.ppm = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'warm', label: 'Warming, best estimate' }, { key: 'range', label: 'Likely range' }]);
  } else {
    st.readout = api.readout([{ key: 'temp', label: 'Average ground temperature' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

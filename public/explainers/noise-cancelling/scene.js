// ---------------------------------------------------------------------------
// How noise-cancelling headphones work: the scene.
//
// Waves as pressure against time. The noise in chapters 1 and 2 is a few
// low tones added together. In chapter 3 one tone of frequency f is
// cancelled by its inverse arriving τ = 50 µs late; what is left has
// amplitude 2·sin(π f τ). Chapter 4 adds a passive cushion whose blocking
// rises smoothly with frequency (an illustrative shape) and draws what
// gets through of each, in decibels.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { plot, curve } from '../shared/plot.js';

const TAU_S = 50e-6;
// The pitch slider runs 0 to 100 along a logarithmic scale from 50 Hz to 8 kHz.
const pitch = (v) => Math.round(10 ** (Math.log10(50) + (v / 100) * (Math.log10(8000) - Math.log10(50))));
const st = { t: 0, on: false, freq: 100, active: true, passive: true, readout: null };

const noise = (t) => 0.55 * Math.sin(t * 2.0) + 0.3 * Math.sin(t * 3.1 + 1) + 0.15 * Math.sin(t * 5.3 + 2);
const residual = (f) => Math.min(2, 2 * Math.abs(Math.sin(Math.PI * f * TAU_S)));
const db = (a) => 20 * Math.log10(Math.max(1e-4, a));
// The cushion: little effect below a few hundred hertz, about 25 dB by 4 kHz.
const cushion = (f) => -28 / (1 + (400 / f) ** 1.6);

function wave(ctx, x0, x1, y, amp, fn, colour, width = 2.5) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 2) (x === x0 ? ctx.moveTo : ctx.lineTo).call(ctx, x, y - fn((x - x0) / (x1 - x0)) * amp);
  ctx.stroke();
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  const moving = api.playing && api.motion;
  if (moving) st.t += f.dt;
  const x0 = 110, x1 = w - 20;
  if (ch === 'wave' || ch === 'flip') {
    const span = 14;
    const n = (u) => noise(u * span + st.t * 3);
    const rows = ch === 'wave' ? [['Noise', n, col.danger]] : [['Noise', n, col.danger], ['Speaker', (u) => (st.on ? -n(u) : 0), col['hiw-ink-1']], ['At your ear', (u) => n(u) + (st.on ? -n(u) : 0), col.accent]];
    const rowH = (h - 60) / rows.length;
    rows.forEach(([name, fn, c], i) => {
      const y = 40 + rowH * (i + 0.5);
      ctx.strokeStyle = col.separator;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      label(ctx, name, 16, y, c, bg, { size: 13, weight: 700 });
      wave(ctx, x0, x1, y, rowH * 0.35, fn, c);
    });
    if (ch === 'wave') label(ctx, 'Pressure above and below normal, over a few hundredths of a second', x0, h - 16, col['label-tertiary'], bg, { size: 11 });
    r?.set('left', st.on ? 'None' : 'All of it');
    return moving;
  }
  if (ch === 'delay') {
    const top = h * 0.5;
    const cycles = 3;
    const fn = (u) => Math.sin(u * cycles * 2 * Math.PI + st.t * 4);
    const lag = TAU_S * st.freq * 2 * Math.PI;
    const anti = (u) => -Math.sin(u * cycles * 2 * Math.PI + st.t * 4 - lag);
    const rowH = top / 2.2;
    wave(ctx, x0, x1, 30 + rowH * 0.5, rowH * 0.35, fn, col.danger, 2);
    wave(ctx, x0, x1, 30 + rowH * 0.5, rowH * 0.35, anti, col['hiw-ink-1'], 2);
    label(ctx, 'Noise and', 16, 30 + rowH * 0.5 - 8, col.danger, bg, { size: 12, weight: 700 });
    label(ctx, 'late reply', 16, 30 + rowH * 0.5 + 8, col['hiw-ink-1'], bg, { size: 12, weight: 700 });
    wave(ctx, x0, x1, 30 + rowH * 1.6, rowH * 0.35, (u) => fn(u) + anti(u), col.accent, 2.5);
    label(ctx, 'Left over', 16, 30 + rowH * 1.6, col.accent, bg, { size: 12, weight: 700 });
    const g = plot(ctx, col, bg, { x0: 70, x1: w - 20, y0: top + 40, y1: h - 40 },
      { min: Math.log10(50), max: Math.log10(8000), ticks: [2, 3, Math.log10(8000)].concat([Math.log10(50), Math.log10(500)]), fmt: (v) => `${fmt(10 ** v)} Hz`, name: 'Pitch' },
      { min: -40, max: 10, ticks: [-40, -30, -20, -10, 0, 10], fmt: (v) => `${v} dB`, name: 'Noise left' });
    curve(ctx, g, (lf) => db(residual(10 ** lf)), Math.log10(50), Math.log10(8000), col.accent, 2.5, 300);
    ctx.beginPath();
    ctx.arc(g.X(Math.log10(st.freq)), g.Y(db(residual(st.freq))), 6, 0, Math.PI * 2);
    ctx.fillStyle = col.danger;
    ctx.fill();
    r?.set('left', `${fmt(residual(st.freq) * 100)}% of the noise`);
    r?.set('db', `${db(residual(st.freq)) > 0 ? '+' : ''}${fmt(db(residual(st.freq)), 1)} dB`);
    return moving;
  }
  if (ch === 'passive') {
    const g = plot(ctx, col, bg, { x0: 70, x1: w - 20, y0: 80, y1: h - 44 },
      { min: Math.log10(30), max: Math.log10(10000), ticks: [Math.log10(30), 2, Math.log10(300), 3, Math.log10(3000), 4], fmt: (v) => `${fmt(10 ** v)} Hz`, name: 'Pitch' },
      { min: -40, max: 5, ticks: [-40, -30, -20, -10, 0], fmt: (v) => `${v} dB`, name: 'Noise that gets through' });
    const total = (f) => (st.active ? Math.min(0, db(residual(f))) : 0) + (st.passive ? cushion(f) : 0);
    if (st.active) curve(ctx, g, (lf) => Math.min(0, db(residual(10 ** lf))), Math.log10(30), 4, alpha(col['hiw-ink-1'], 0.7), 1.5, 300);
    if (st.passive) curve(ctx, g, (lf) => cushion(10 ** lf), Math.log10(30), 4, alpha(col['hiw-ink-4'], 0.8), 1.5, 300);
    curve(ctx, g, (lf) => total(10 ** lf), Math.log10(30), 4, col.accent, 3, 300);
    if (st.active) label(ctx, 'Electronics', g.X(Math.log10(60)), g.Y(-28), col['hiw-ink-1'], bg, { size: 11 });
    if (st.passive) label(ctx, 'Cushions', g.X(Math.log10(4000)), g.Y(-18), col['hiw-ink-4'], bg, { size: 11, align: 'center' });
    let worst = 30;
    for (let lf = Math.log10(30); lf <= 4; lf += 0.01) if (total(10 ** lf) > total(worst)) worst = 10 ** lf;
    r?.set('worst', `${fmt(worst)} Hz`);
    return false;
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ wave: 'The noise reaching one ear', flip: 'Microphone, speaker and the sum', delay: 'One steady tone, and a reply 50 microseconds late', passive: 'What gets through, by pitch' }[id]);
  if (id === 'flip') {
    st.on = false;
    ui.toggle({ label: 'Cancelling', checked: false, onChange(v) { st.on = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'left', label: 'Noise left' }]);
  } else if (id === 'delay') {
    st.freq = pitch(14);
    ui.slider({ label: 'Pitch', min: 0, max: 100, value: 14, format: (v) => `${fmt(pitch(v))} Hz`, onInput(v) { st.freq = pitch(v); api.invalidate(); } });
    st.readout = api.readout([{ key: 'left', label: 'Left over' }, { key: 'db', label: 'In decibels' }]);
  } else if (id === 'passive') {
    st.active = true;
    st.passive = true;
    ui.toggle({ label: 'Electronics', checked: true, onChange(v) { st.active = v; api.invalidate(); } });
    ui.toggle({ label: 'Cushions', checked: true, onChange(v) { st.passive = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'worst', label: 'Gets through most at' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

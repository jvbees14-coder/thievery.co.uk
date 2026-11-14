// ---------------------------------------------------------------------------
// How sound works: the scene.
//
// Chapter 1 is a grid of air particles, each swinging back and forth about
// its own place, so that crowded bands (compressions) travel along while no
// particle does. Then a waveform: one frequency, then several added
// together, then the Fourier series of a square wave term by term. Every
// waveform can be played through the Web Audio API, quietly, only when the
// reader presses Play sound; nothing plays by itself.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU, clamp } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const C_AIR = 343;            // m/s in air at 20 °C
const st = {
  t: 0,
  freq: 440,
  harm: [1, 0.5, 0.33, 0.25, 0, 0],
  terms: 3,
  audio: null,
  playing: false,
  readout: null,
};

// The shape being drawn and played, as harmonic amplitudes (sine terms).
function amplitudes(ch) {
  if (ch === 'harmonics') return st.harm;
  if (ch === 'square') {
    const a = [];
    for (let n = 1; n <= 2 * st.terms - 1; n++) a.push(n % 2 ? 1 / n : 0);
    return a;
  }
  return [1];
}

function sample(amps, x) {
  let s = 0;
  amps.forEach((a, i) => (s += a * Math.sin((i + 1) * x)));
  return s;
}

// --- sound --------------------------------------------------------------------------

function stop() {
  if (st.audio) {
    const a = st.audio;
    a.gain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.03);
    setTimeout(() => a.ctx.close(), 200);
    st.audio = null;
  }
  st.playing = false;
}
function start(ch) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  stop();
  const ctx = new AC();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(gain).connect(ctx.destination);
  st.audio = { ctx, osc, gain };
  tune(ch);
  osc.start();
  gain.gain.setTargetAtTime(0.06, ctx.currentTime, 0.03);
  st.playing = true;
}
function tune(ch) {
  const a = st.audio;
  if (!a) return;
  const amps = amplitudes(ch);
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  amps.forEach((v, i) => (imag[i + 1] = v));
  a.osc.setPeriodicWave(a.ctx.createPeriodicWave(real, imag));
  a.osc.frequency.setTargetAtTime(st.freq, a.ctx.currentTime, 0.02);
}

// --- drawing ------------------------------------------------------------------------

function particles(ctx, w, h, col, bg) {
  const rows = 9, cols = Math.floor(w / 9);
  const k = TAU / (w * 0.45);
  const amp = 7;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = (c + 0.5) * (w / cols);
      const dx = amp * Math.sin(k * x0 - st.t * 3);
      const y = h * 0.22 + r * 12;
      const tracked = r === 4 && c === Math.floor(cols / 2);
      ctx.fillStyle = tracked ? col.danger : alpha(col['hiw-ink-1'], 0.85);
      ctx.beginPath();
      ctx.arc(x0 + dx, y, tracked ? 4 : 2.2, 0, TAU);
      ctx.fill();
    }
  }
  const y0 = h * 0.72, ah = h * 0.12;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 3) {
    const p = -Math.cos(k * x - st.t * 3);
    if (x) ctx.lineTo(x, y0 - p * ah);
    else ctx.moveTo(x, y0 - p * ah);
  }
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  label(ctx, 'Pressure', 12, y0 - ah - 14, col['label-secondary'], bg, { size: 12 });
  label(ctx, 'The red particle only ever swings in place', w / 2, h * 0.22 - 22, col.danger, bg, { size: 12, align: 'center' });
}

function wave(ctx, w, h, col, bg, amps, ch) {
  const y0 = h * 0.5, ah = h * 0.32;
  let peak = 1e-6;
  for (let i = 0; i < 200; i++) peak = Math.max(peak, Math.abs(sample(amps, (i / 200) * TAU)));
  const cycles = ch === 'square' ? 2 : clamp(st.freq / 220, 1, 6);
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(0, y0);
  ctx.lineTo(w, y0);
  ctx.stroke();
  if (ch === 'harmonics' || ch === 'square') {
    amps.forEach((a, i) => {
      if (!a) return;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const v = (a * Math.sin((i + 1) * ((x / w) * cycles * TAU + st.t))) / peak;
        if (x) ctx.lineTo(x, y0 - v * ah);
        else ctx.moveTo(x, y0 - v * ah);
      }
      ctx.strokeStyle = alpha(col['hiw-ink-2'], 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }
  if (ch === 'square') {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const ph = ((((x / w) * cycles * TAU + st.t) % TAU) + TAU) % TAU;
      const v = ((ph < Math.PI ? 1 : -1) * (Math.PI / 4)) / peak;
      if (x) ctx.lineTo(x, y0 - v * ah);
      else ctx.moveTo(x, y0 - v * ah);
    }
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = col['label-tertiary'];
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const v = sample(amps, (x / w) * cycles * TAU + st.t) / peak;
    if (x) ctx.lineTo(x, y0 - v * ah);
    else ctx.moveTo(x, y0 - v * ah);
  }
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function hearing(ctx, w, h, col, bg) {
  const x = (f) => 20 + ((Math.log10(f) - 1) / (Math.log10(30000) - 1)) * (w - 40);
  const y = h * 0.5;
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.25);
  ctx.fillRect(x(20), y - 30, x(20000) - x(20), 60);
  label(ctx, 'Human hearing, 20 Hz to 20 kHz', (x(20) + x(20000)) / 2, y - 44, col['hiw-ink-1'], bg, { size: 12, align: 'center' });
  ctx.fillStyle = alpha(col.accent, 0.35);
  ctx.fillRect(x(27.5), y - 12, x(4186) - x(27.5), 24);
  label(ctx, 'A piano, 27.5 Hz to 4,186 Hz', (x(27.5) + x(4186)) / 2, y + 28, col.accent, bg, { size: 12, align: 'center' });
  for (const f of [10, 100, 1000, 10000]) {
    ctx.fillStyle = col['label-tertiary'];
    ctx.fillRect(x(f), y + 44, 1, 8);
    label(ctx, f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`, x(f), y + 62, col['label-tertiary'], bg, { size: 11, align: 'center' });
  }
  ctx.fillStyle = col.danger;
  ctx.fillRect(x(st.freq) - 1, y - 36, 3, 72);
  label(ctx, `${fmt(st.freq)} Hz`, x(st.freq), y - 60, col.danger, bg, { size: 12, align: 'center' });
}

function noteName(freq) {
  const note = 12 * Math.log2(freq / 440);
  const names = ['A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯'];
  const n = Math.round(note);
  const octave = 4 + Math.floor((n + 9) / 12);
  const off = note - n;
  return `${names[((n % 12) + 12) % 12]}${octave}${Math.abs(off) > 0.05 ? ` ${off > 0 ? '+' : '−'}${fmt(Math.abs(off) * 100)} cents` : ''}`;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const run = api.playing && api.motion;
  if (run) st.t += dt;
  if (ch === 'waves') particles(ctx, w, h, col, bg);
  else if (ch === 'hearing') hearing(ctx, w, h, col, bg);
  else wave(ctx, w, h, col, bg, amplitudes(ch), ch);

  const r = st.readout;
  if (r) {
    r.set('speed', `${C_AIR} m/s`);
    r.set('freq', `${fmt(st.freq)} Hz`);
    r.set('length', `${fmt((C_AIR / st.freq) * 100, st.freq > 1000 ? 1 : 0)} cm`);
    r.set('period', `${fmt(1000 / st.freq, 2)} ms`);
    r.set('terms', fmt(st.terms));
    r.set('note', noteName(st.freq));
  }
  return run;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  stop();
  api.note({ waves: 'Slowed down enormously', pitch: 'Real waveform, slowed for the eye', harmonics: 'Faint lines: each harmonic', square: 'Dashed: a perfect square wave', hearing: 'A logarithmic scale' }[id]);
  if (id !== 'waves') {
    const btn = ui.button({
      label: 'Play sound',
      onClick() {
        if (st.playing) stop();
        else start(api.chapter);
        btn.textContent = st.playing ? 'Stop sound' : 'Play sound';
      },
    });
  }
  if (id === 'pitch' || id === 'hearing' || id === 'harmonics') {
    const lo = 20, hi = id === 'hearing' ? 20000 : 2000;
    ui.slider({
      label: 'Frequency',
      min: 0,
      max: 1000,
      value: Math.round((Math.log(clamp(st.freq, lo, hi) / lo) / Math.log(hi / lo)) * 1000),
      format: (v) => `${fmt(lo * (hi / lo) ** (v / 1000))} Hz`,
      onInput(v) {
        st.freq = lo * (hi / lo) ** (v / 1000);
        tune(api.chapter);
        api.invalidate();
      },
    });
  }
  if (id === 'harmonics') {
    st.harm.forEach((a, i) => {
      ui.slider({
        label: i === 0 ? 'Fundamental' : `Harmonic ${i + 1} (×${i + 1})`,
        min: 0,
        max: 100,
        value: Math.round(a * 100),
        format: (v) => `${v}%`,
        onInput(v) {
          st.harm[i] = v / 100;
          tune(api.chapter);
          api.invalidate();
        },
      });
    });
  }
  if (id === 'square') {
    ui.slider({ label: 'Odd harmonics added', min: 1, max: 30, value: st.terms, onInput: (v) => { st.terms = v; tune(api.chapter); api.invalidate(); } });
  }
  const rows = {
    waves: [{ key: 'speed', label: 'Speed of sound' }],
    pitch: [{ key: 'freq', label: 'Frequency' }, { key: 'note', label: 'Nearest note' }, { key: 'length', label: 'Wavelength in air' }, { key: 'period', label: 'One cycle takes' }],
    harmonics: [{ key: 'freq', label: 'Fundamental' }, { key: 'note', label: 'Nearest note' }],
    square: [{ key: 'terms', label: 'Odd harmonics' }],
    hearing: [{ key: 'freq', label: 'Frequency' }, { key: 'length', label: 'Wavelength in air' }],
  }[id];
  st.readout = api.readout(rows);
  api.invalidate();
}

window.addEventListener('pagehide', stop);

mount({ colours: TOKENS, chapter, draw });

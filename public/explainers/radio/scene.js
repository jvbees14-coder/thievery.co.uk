// ---------------------------------------------------------------------------
// How radio carries a voice: the scene.
//
// Waves drawn slowed down: the carrier makes a few dozen swings across the
// screen against two of the "voice". AM multiplies the carrier by
// (1 + 0.6·voice); FM adds the voice to its rate of swinging. Interference
// is a few random spikes added to the wave's height. The AM receiver
// follows the peaks (the outline), so the spikes come through; the FM one
// reads only the spacing of the zero crossings, so they mostly don't.
// Chapter 4 is wavelength = c ÷ f, with a quarter-wave aerial.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { seeded } from '../shared/plot.js';

const C = 299792458;
const STATIONS = [
  { id: 'lw', name: 'Long wave, 198 kHz', f: 198e3 },
  { id: 'mw', name: 'Medium wave, 909 kHz', f: 909e3 },
  { id: 'fm', name: 'FM, 100 MHz', f: 100e6 },
  { id: 'wifi', name: 'Wi-Fi, 2.4 GHz', f: 2.4e9 },
];
const st = { cyc: 24, t: 0, noisy: false, spikes: [], station: 'fm', readout: null };

const voice = (u) => 0.7 * Math.sin(u * 2 * Math.PI * 2) + 0.3 * Math.sin(u * 2 * Math.PI * 5 + 1);

function makeSpikes() {
  const r = seeded(9);
  st.spikes = Array.from({ length: 7 }, () => [r(), (r() - 0.3) * 1.6]);
}
const spike = (u) => st.noisy ? st.spikes.reduce((a, [p, k]) => a + k * Math.exp(-(((u - p) / 0.006) ** 2)), 0) : 0;

function trace(ctx, x0, x1, y, amp, fn, colour, width = 2, n = 900) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    (i ? ctx.lineTo : ctx.moveTo).call(ctx, x0 + u * (x1 - x0), y - fn(u) * amp);
  }
  ctx.stroke();
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  const x0 = 110, x1 = w - 20;
  const moving = api.playing && api.motion;
  if (moving) st.t += f.dt * 0.15;
  const sh = (u) => u + st.t;
  if (ch === 'carrier') {
    const y = h / 2;
    trace(ctx, x0, x1, y, h * 0.3, (u) => Math.sin(sh(u) * 2 * Math.PI * st.cyc), col['hiw-ink-1'], 2);
    label(ctx, 'Carrier', 16, y, col['hiw-ink-1'], bg, { size: 13, weight: 700 });
    r?.set('swings', `${st.cyc} on screen`);
    return moving;
  }
  if (ch === 'am' || ch === 'fm') {
    const rows = 3, rowH = (h - 40) / rows;
    const ys = [0, 1, 2].map((i) => 30 + rowH * (i + 0.5));
    const v = (u) => voice(sh(u) % 1);
    trace(ctx, x0, x1, ys[0], rowH * 0.35, v, col['hiw-ink-2'], 2.5);
    label(ctx, 'Voice', 16, ys[0], col['hiw-ink-2'], bg, { size: 13, weight: 700 });
    let sent;
    const K = 30;
    if (ch === 'am') sent = (u) => (1 + 0.6 * v(u)) * Math.sin(u * 2 * Math.PI * K) * 0.6;
    else {
      // Phase is the running total of the frequency; integrate numerically.
      const N = 900;
      const ph = new Float64Array(N + 1);
      for (let i = 1; i <= N; i++) ph[i] = ph[i - 1] + (2 * Math.PI * K * (1 + 0.45 * v(i / N))) / N;
      sent = (u) => Math.sin(ph[Math.round(u * N)]) * 0.9;
    }
    const got = (u) => sent(u) + spike(u);
    trace(ctx, x0, x1, ys[1], rowH * 0.4, got, col['hiw-ink-1'], 1.5);
    label(ctx, ch === 'am' ? 'AM signal' : 'FM signal', 16, ys[1], col['hiw-ink-1'], bg, { size: 13, weight: 700 });
    // What the receiver gets back.
    let heard;
    if (ch === 'am') {
      // Follow the peaks: the largest height within one carrier swing.
      heard = (u) => {
        let m = 0;
        for (let k = -6; k <= 6; k++) m = Math.max(m, Math.abs(got(u + k / (K * 12))));
        return (m / 0.6 - 1) / 0.6;
      };
    } else {
      // Count the spacing of upward zero crossings and turn it back into the voice.
      const N = 900, cross = [];
      let prev = got(0);
      for (let i = 1; i <= N; i++) {
        const cur = got(i / N);
        // Where the wave crosses zero, found between the two samples either side.
        if (prev < 0 && cur >= 0) cross.push((i - 1 + prev / (prev - cur)) / N);
        prev = cur;
      }
      // Each swing gives one reading, placed at its middle; join them up.
      const pts = [];
      for (let j = 1; j < cross.length; j++) pts.push([(cross[j] + cross[j - 1]) / 2, (1 / ((cross[j] - cross[j - 1]) * K) - 1) / 0.45]);
      heard = (u) => {
        if (!pts.length) return 0;
        if (u <= pts[0][0]) return pts[0][1];
        for (let j = 1; j < pts.length; j++) if (pts[j][0] >= u) {
          const [x0, y0] = pts[j - 1], [x1, y1] = pts[j];
          return y0 + ((y1 - y0) * (u - x0)) / (x1 - x0);
        }
        return pts[pts.length - 1][1];
      };
    }
    trace(ctx, x0, x1, ys[2], rowH * 0.35, (u) => Math.max(-1.6, Math.min(1.6, heard(u))), col.accent, 2.5, 300);
    label(ctx, 'Heard', 16, ys[2], col.accent, bg, { size: 13, weight: 700 });
    return moving;
  }
  if (ch === 'size') {
    const s = STATIONS.find((x) => x.id === st.station);
    const lambda = C / s.f;
    // Compare a quarter wavelength with a 1.8 m person and a 213 m mast.
    const things = [['Person', 1.8, col['hiw-ink-2']], ['Quarter-wave aerial', lambda / 4, col.accent], ['Wavelength', lambda, col['hiw-ink-1']]];
    const biggest = Math.max(...things.map((t) => t[1]));
    const base = h - 50, top = 90, x = 60, bw = Math.min(70, (w - 120) / 4);
    things.forEach(([name, m, c], i) => {
      const bh = Math.max(2, (m / biggest) * (base - top));
      const bx = x + i * (bw + (w - 120 - 3 * bw) / 2);
      ctx.fillStyle = alpha(c, 0.85);
      ctx.fillRect(bx, base - bh, bw, bh);
      label(ctx, name, bx + bw / 2, base + 16, col['label-secondary'], bg, { size: 11, align: 'center' });
      const t = m >= 1000 ? `${fmt(m / 1000, 2)} km` : m >= 1 ? `${fmt(m, m < 10 ? 2 : 0)} m` : `${fmt(m * 100, 1)} cm`;
      label(ctx, t, bx + bw / 2, base - bh - 12, c, bg, { size: 12, weight: 700, align: 'center' });
    });
    r?.set('lambda', lambda >= 1000 ? `${fmt(lambda / 1000, 3)} km` : lambda >= 1 ? `${fmt(lambda, 1)} m` : `${fmt(lambda * 100, 1)} cm`);
    r?.set('aerial', lambda / 4 >= 1 ? `${fmt(lambda / 4, lambda / 4 < 10 ? 2 : 0)} m` : `${fmt((lambda / 4) * 100, 1)} cm`);
    return false;
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  st.noisy = false;
  makeSpikes();
  api.note({ carrier: 'A carrier, drawn millions of times slower', am: 'Amplitude modulation', fm: 'Frequency modulation', size: 'Wavelengths and aerials, to scale with each other' }[id]);
  if (id === 'carrier') {
    st.cyc = 24;
    ui.slider({ label: 'Frequency', min: 6, max: 60, value: 24, format: (v) => `${v} swings on screen`, onInput(v) { st.cyc = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'swings', label: 'Swings' }]);
  } else if (id === 'am' || id === 'fm') {
    ui.toggle({ label: 'Interference', checked: false, onChange(v) { st.noisy = v; api.invalidate(); } });
    ui.button({ label: 'Different crackle', onClick() { st.spikes = st.spikes.map(() => [Math.random(), (Math.random() - 0.3) * 1.6]); api.invalidate(); } });
  } else if (id === 'size') {
    ui.choice({ label: 'Station', options: STATIONS.map((s) => ({ id: s.id, label: s.name })), value: st.station, onChange(v) { st.station = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'lambda', label: 'Wavelength' }, { key: 'aerial', label: 'Quarter-wave aerial' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

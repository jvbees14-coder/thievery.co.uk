// ---------------------------------------------------------------------------
// Collecting the full set: the scene.
//
// An album of n stickers, one random sticker a packet, every sticker as
// common as any other. Chapter 1 opens packets into a grid; chapter 2 draws
// the average wait for each new sticker, n ÷ (stickers still missing);
// chapter 3 the average total, n × H(n), against the size of the album;
// chapter 4 simulates friends pooling packets until each has a set, with a
// seeded generator so the figures match the page.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';
import { plot, curve, seeded } from '../shared/plot.js';

const harmonic = (n) => { let s = 0; for (let i = 1; i <= n; i++) s += 1 / i; return s; };
const st = { n: 50, have: [], packets: 0, acc: 0, friends: 2, cache: new Map(), readout: null, flash: -1 };

function packetsEach(n, f) {
  // Alone, the exact average; with friends, simulated.
  if (f === 1) return n * harmonic(n);
  const key = `${n}:${f}`;
  if (!st.cache.has(key)) {
    const r = seeded(3);
    let s = 0;
    const T = 1500;
    for (let i = 0; i < T; i++) {
      const c = new Array(n).fill(0);
      let done = 0, p = 0;
      while (done < n) {
        const k = Math.floor(r() * n);
        if (++c[k] === f) done++;
        p++;
      }
      s += p;
    }
    st.cache.set(key, s / T / f);
  }
  return st.cache.get(key);
}

function open(k = 1) {
  for (let i = 0; i < k; i++) {
    if (st.have.filter(Boolean).length === st.n) return;
    const s = Math.floor(Math.random() * st.n);
    st.have[s] = (st.have[s] || 0) + 1;
    st.flash = s;
    st.packets++;
  }
}

function reset() {
  st.have = new Array(st.n).fill(0);
  st.packets = 0;
  st.flash = -1;
}

function album(ctx, w, h, col, bg) {
  const n = st.n, cols = 10, rows = Math.ceil(n / cols);
  const cell = Math.min((w - 80) / cols, (h - 160) / rows);
  const x0 = (w - cell * cols) / 2, y0 = 64;
  for (let i = 0; i < n; i++) {
    const x = x0 + (i % cols) * cell, y = y0 + Math.floor(i / cols) * cell;
    box(ctx, x + 3, y + 3, cell - 6, cell - 6, 4);
    const c = st.have[i];
    ctx.fillStyle = c ? (i === st.flash ? col.accent : col['hiw-ink-1']) : alpha(col['label-tertiary'], 0.12);
    ctx.fill();
    label(ctx, `${i + 1}`, x + cell / 2, y + cell / 2, c ? col.bg : col['label-tertiary'], null, { size: Math.min(12, cell * 0.32), align: 'center' });
    if (c > 1) label(ctx, `×${c}`, x + cell - 6, y + 10, col.label, bg, { size: 10, align: 'right' });
  }
  const got = st.have.filter(Boolean).length;
  // A strip under the album: how many packets each new sticker took, on average.
  const y = y0 + rows * cell + 24;
  label(ctx, `${got} of ${n} collected after ${fmt(st.packets)} packets`, w / 2, y, col.label, bg, { size: 13, weight: 700, align: 'center' });
  return got;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  const n = st.n;
  let more = false;
  if (ch === 'first') {
    const moving = api.playing && api.motion;
    const got0 = st.have.filter(Boolean).length;
    if (moving && got0 < n) {
      st.acc += f.dt * 8;
      const k = Math.floor(st.acc);
      st.acc -= k;
      if (k) open(k);
      more = true;
    }
    const got = album(ctx, w, h, col, bg);
    r?.set('packets', fmt(st.packets));
    r?.set('got', `${got} of ${n}`);
    r?.set('expect', fmt(n * harmonic(n), 0));
  } else if (ch === 'last') {
    const top = n;
    const g = plot(ctx, col, bg, { x0: 54, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0.5, max: n + 0.5, ticks: [1, 10, 20, 30, 40, 50], name: 'The new sticker you are waiting for' },
      { min: 0, max: top * 1.08, ticks: [0, 10, 20, 30, 40, 50], name: 'Packets, on average' });
    const bw = (g.X(2) - g.X(1)) * 0.8;
    let run = 0;
    for (let k = 1; k <= n; k++) {
      const wait = n / (n - k + 1);
      run += wait;
      ctx.fillStyle = k > n / 2 ? col.danger : col['hiw-ink-1'];
      ctx.fillRect(g.X(k) - bw / 2, g.Y(wait), bw, g.Y(0) - g.Y(wait));
    }
    const half = n * (harmonic(n) - harmonic(n / 2));
    label(ctx, `First 25: about ${fmt(half)} packets in all`, g.X(13), g.Y(12), col['hiw-ink-1'], bg, { size: 12, weight: 700, align: 'center' });
    label(ctx, `Last 25: about ${fmt(n * harmonic(n) - half)}`, g.X(40), g.Y(30), col.danger, bg, { size: 12, weight: 700, align: 'center' });
    r?.set('last', `${fmt(n)} packets`);
    r?.set('total', fmt(run));
  } else if (ch === 'whole') {
    const max = 700;
    const g = plot(ctx, col, bg, { x0: 64, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0, max, ticks: [0, 100, 200, 300, 400, 500, 600, 700], name: 'Stickers in the album' },
      { min: 0, max: 5200, ticks: [0, 1000, 2000, 3000, 4000, 5000], fmt: (v) => fmt(v), name: 'Packets, on average' });
    curve(ctx, g, (x) => x * harmonic(Math.round(x)), 1, max, col.accent, 3, 140);
    ctx.setLineDash([4, 4]);
    curve(ctx, g, (x) => x, 0, max, alpha(col['label-tertiary'], 0.8), 1.5, 2);
    ctx.setLineDash([]);
    label(ctx, 'One packet a sticker', g.X(620), g.Y(620) - 14, col['label-tertiary'], bg, { size: 11, align: 'right' });
    const v = n * harmonic(n);
    ctx.fillStyle = col.danger;
    ctx.beginPath();
    ctx.arc(g.X(n), g.Y(v), 6, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, `${fmt(n)} stickers: about ${fmt(v)} packets`, g.X(n) + (n > 450 ? -10 : 10), g.Y(v) - 16, col.danger, bg, { size: 12, weight: 700, align: n > 450 ? 'right' : 'left' });
    r?.set('total', fmt(v));
    r?.set('times', `${fmt(harmonic(n), 1)} ×`);
  } else if (ch === 'swap') {
    const g = plot(ctx, col, bg, { x0: 54, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0.4, max: 10.6, ticks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], name: 'Friends swapping' },
      { min: 0, max: 250, ticks: [0, 50, 100, 150, 200, 250], name: 'Packets each, on average' });
    const bw = (g.X(2) - g.X(1)) * 0.6;
    for (let k = 1; k <= 10; k++) {
      const v = packetsEach(50, k);
      ctx.fillStyle = k === st.friends ? col.accent : alpha(col['hiw-ink-1'], 0.6);
      ctx.fillRect(g.X(k) - bw / 2, g.Y(v), bw, g.Y(0) - g.Y(v));
      label(ctx, fmt(v), g.X(k), g.Y(v) - 12, k === st.friends ? col.accent : col['label-secondary'], bg, { size: 11, align: 'center' });
    }
    r?.set('each', fmt(packetsEach(50, st.friends)));
    r?.set('saved', `${fmt(225 - packetsEach(50, st.friends))}`);
  }
  return more;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ first: 'One random sticker in every packet', last: 'The wait for each new sticker, 50-sticker album', whole: 'Albums of any size', swap: 'A 50-sticker album, shared among friends' }[id]);
  st.readout = null;
  if (id === 'first') {
    st.n = 50;
    reset();
    ui.button({ label: 'Open a packet', onClick() { open(1); api.invalidate(); } });
    ui.button({ label: 'Open 10', onClick() { open(10); api.invalidate(); } });
    ui.button({ label: 'Start again', onClick() { reset(); api.invalidate(); } });
    st.readout = api.readout([{ key: 'packets', label: 'Packets' }, { key: 'got', label: 'Collected' }, { key: 'expect', label: 'Whole set, on average' }]);
  } else if (id === 'last') {
    st.n = 50;
    st.readout = api.readout([{ key: 'last', label: 'The last sticker' }, { key: 'total', label: 'Whole set, on average' }]);
  } else if (id === 'whole') {
    st.n = 50;
    ui.slider({ label: 'Stickers in the album', min: 5, max: 700, step: 5, value: 50, onInput(v) { st.n = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'total', label: 'Packets, on average' }, { key: 'times', label: 'Times the album size' }]);
  } else if (id === 'swap') {
    ui.slider({ label: 'Friends', min: 1, max: 10, value: st.friends, onInput(v) { st.friends = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'each', label: 'Packets each' }, { key: 'saved', label: 'Saved each, against going alone' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

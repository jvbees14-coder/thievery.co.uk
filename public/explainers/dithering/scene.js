// ---------------------------------------------------------------------------
// Shades from black and white: the scene.
//
// A small greyscale picture (a lit ball on a graded background), drawn with
// only two colours four ways: a plain threshold, random noise, a Bayer
// ordered pattern, and Floyd–Steinberg error diffusion (1976). The two
// colours are the card navy and the card cream, so it works on either
// scheme.
// ---------------------------------------------------------------------------

import { mount, fmt } from '../engine.js';
import { label, setFace, mix, TOKENS } from '../shared/draw.js';

const W = 120, H = 80;
const IMG = (() => {
  const a = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0.15 + 0.7 * (x / W);                                   // a graded background
      const dx = (x - 46) / 26, dy = (y - 40) / 26, d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        // A ball lit from the upper left.
        const z = Math.sqrt(1 - d2), lit = Math.max(0, (-dx * 0.5 - dy * 0.6 + z * 0.62));
        v = 0.08 + 0.9 * lit;
      }
      a[y * W + x] = Math.min(1, Math.max(0, v));
    }
  }
  return a;
})();
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

function dither(method, seed = 1) {
  const out = new Uint8Array(W * H);
  if (method === 'diffusion') {
    const e = Float32Array.from(IMG);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, v = e[i], q = v >= 0.5 ? 1 : 0, err = v - q;
        out[i] = q;
        // Pass the error on: 7/16 right, 3/16 below left, 5/16 below, 1/16 below right.
        if (x + 1 < W) e[i + 1] += (err * 7) / 16;
        if (y + 1 < H) {
          if (x > 0) e[i + W - 1] += (err * 3) / 16;
          e[i + W] += (err * 5) / 16;
          if (x + 1 < W) e[i + W + 1] += err / 16;
        }
      }
    }
    return out;
  }
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = IMG[y * W + x];
      const t = method === 'threshold' ? 0.5 : method === 'random' ? rand() : (BAYER[y % 4][x % 4] + 0.5) / 16;
      out[y * W + x] = v >= t ? 1 : 0;
    }
  }
  return out;
}

const st = { method: 'threshold', original: false, zoom: 1, readout: null };

function paint(ctx, w, h, col, values, two) {
  const cell = Math.min((w - 20) / W, (h - 90) / H) * st.zoom;
  const ox = (w - Math.min(w - 20, cell * W)) / 2, oy = 70;
  const visW = Math.min(W, Math.floor((w - 20) / cell)), visH = Math.min(H, Math.floor((h - 90) / cell));
  const sx = Math.floor((W - visW) / 2), sy = Math.floor((H - visH) / 2);
  for (let y = 0; y < visH; y++) {
    for (let x = 0; x < visW; x++) {
      const v = values[(y + sy) * W + (x + sx)];
      ctx.fillStyle = two ? (v ? col.stock : col.back) : mix(col.back, col.stock, v);
      ctx.fillRect(ox + x * cell, oy + y * cell, cell + 0.4, cell + 0.4);
    }
  }
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const r = st.readout;
  const out = dither(st.method);
  paint(ctx, w, h, col, st.original ? IMG : out, !st.original);
  // How far the overall brightness of each 8 × 8 patch is from the original.
  let err = 0, n = 0;
  for (let by = 0; by < H; by += 8) for (let bx = 0; bx < W; bx += 8) {
    let a = 0, b = 0;
    for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) {
      a += IMG[y * W + x];
      b += out[y * W + x];
    }
    err += Math.abs(a - b) / 64;
    n++;
  }
  r?.set('err', `${fmt((err / n) * 100, 1)}%`);
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.method = { threshold: 'threshold', random: 'random', ordered: 'ordered', diffusion: 'diffusion' }[id];
  api.note({ threshold: 'Light pixels white, dark ones black', random: 'Each pixel against a random level', ordered: 'Each pixel against a repeating pattern', diffusion: 'Floyd–Steinberg: passing the error on' }[id]);
  st.original = false;
  st.zoom = 1;
  ui.toggle({ label: 'Show the original greys', checked: false, onChange(v) { st.original = v; api.invalidate(); } });
  ui.slider({ label: 'Zoom', min: 1, max: 4, step: 0.5, value: 1, format: (v) => `${v}×`, onInput(v) { st.zoom = v; api.invalidate(); } });
  st.readout = api.readout([{ key: 'err', label: 'Average brightness off, patch by patch' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

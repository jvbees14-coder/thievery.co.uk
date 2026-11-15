// ---------------------------------------------------------------------------
// How a screen makes every colour: the scene.
//
// This is the one scene that draws literal colours: the reader's own red,
// green and blue levels are the subject, and no token could stand for
// them. Everything else (labels, frames) is in tokens as usual.
//
// Chapter 1 zooms into a patch of screen until the red, green and blue
// sub-pixels show. Chapter 2 overlaps three lights. Chapter 3 is the eye's
// three kinds of cone, roughly drawn, and what a pure yellow light and a
// red-plus-green mix do to them. Chapter 4 is the numbers.
// ---------------------------------------------------------------------------

import { mount, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const st = { r: 255, g: 180, b: 40, zoom: 1, nm: 580, readout: null };
const rgb = (r, g, b) => `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
const hex = (r, g, b) => '#' + [r, g, b].map((v) => (v | 0).toString(16).padStart(2, '0')).join('').toUpperCase();

// Rough cone sensitivities: bell curves at 440, 540 and 565 nm.
const CONES = [
  { name: 'S (short)', peak: 440, width: 30, token: 'focus-ring' },
  { name: 'M (medium)', peak: 540, width: 42, token: 'success' },
  { name: 'L (long)', peak: 565, width: 48, token: 'danger' },
];
const response = (cone, nm) => Math.exp(-(((nm - cone.peak) / cone.width) ** 2) / 2);
// The screen's three lights, as single wavelengths for this purpose.
const PRIMARY = { r: 610, g: 545, b: 465 };

function drawPixels(ctx, w, h, col, bg) {
  const x0 = 16, y0 = 64, size = Math.min(w - 32, h - 90);
  const z = st.zoom;
  if (z < 1.5) {
    ctx.fillStyle = rgb(st.r, st.g, st.b);
    ctx.fillRect(x0, y0, size, size);
  } else {
    // A grid of pixels, each three stripes, as many as the zoom allows.
    const n = Math.max(1, Math.round(24 / z)), p = size / n;
    ctx.fillStyle = 'rgb(0, 0, 0)';
    ctx.fillRect(x0, y0, size, size);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = x0 + i * p, y = y0 + j * p, sw = p / 3;
        [[st.r, 0, 0], [0, st.g, 0], [0, 0, st.b]].forEach((c, k) => {
          ctx.fillStyle = rgb(...c);
          ctx.fillRect(x + k * sw + sw * 0.12, y + p * 0.06, sw * 0.76, p * 0.88);
        });
      }
    }
  }
  ctx.strokeStyle = col.separator;
  ctx.strokeRect(x0, y0, size, size);
}

function drawMixing(ctx, w, h, col, bg) {
  const cx = w / 2, cy = h * 0.5, R = Math.min(w, h) * 0.22, d = R * 0.6;
  ctx.fillStyle = 'rgb(0, 0, 0)';
  ctx.fillRect(16, 64, w - 32, h - 80);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  [[st.r, 0, 0, -90], [0, st.g, 0, 30], [0, 0, st.b, 150]].forEach(([r, g, b, a]) => {
    const t = (a * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(t) * d, cy + Math.sin(t) * d, R, 0, TAU);
    ctx.fillStyle = rgb(r, g, b);
    ctx.fill();
  });
  ctx.restore();
}

function drawEyes(ctx, w, h, col, bg) {
  const x0 = 44, x1 = w - 16, y0 = 80, y1 = h * 0.55;
  const X = (nm) => x0 + ((nm - 400) / 300) * (x1 - x0), Y = (v) => y1 - v * (y1 - y0);
  for (const nm of [400, 450, 500, 550, 600, 650, 700]) label(ctx, `${nm}`, X(nm), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Wavelength, nanometres', x1, y1 + 28, col['label-tertiary'], bg, { size: 11, align: 'right' });
  for (const c of CONES) {
    ctx.strokeStyle = col[c.token];
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let nm = 400; nm <= 700; nm += 2) (nm === 400 ? ctx.moveTo : ctx.lineTo).call(ctx, X(nm), Y(response(c, nm)));
    ctx.stroke();
  }
  ctx.strokeStyle = col.label;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(X(st.nm), y0);
  ctx.lineTo(X(st.nm), y1);
  ctx.stroke();
  ctx.setLineDash([]);
  // Cone signals: from the single light, and from a red and green mix
  // chosen to give the same M and L signals.
  const single = CONES.map((c) => response(c, st.nm));
  const [mR, lR] = [response(CONES[1], PRIMARY.r), response(CONES[2], PRIMARY.r)];
  const [mG, lG] = [response(CONES[1], PRIMARY.g), response(CONES[2], PRIMARY.g)];
  const det = lR * mG - lG * mR;
  const a = Math.max(0, (single[2] * mG - lG * single[1]) / det), b = Math.max(0, (lR * single[1] - single[2] * mR) / det);
  const mix = CONES.map((c) => a * response(c, PRIMARY.r) + b * response(c, PRIMARY.g));
  const bars = (vals, x, title) => {
    label(ctx, title, x, h * 0.66, col['label-secondary'], bg, { size: 11 });
    vals.forEach((v, i) => {
      const bh = Math.min(1.2, v) * (h * 0.22);
      ctx.fillStyle = col[CONES[i].token];
      ctx.fillRect(x + i * 26, h - 30 - bh, 20, bh);
    });
  };
  bars(single, x0, `One light at ${st.nm} nm`);
  bars(mix, w / 2 + 10, 'Red and green mixed to match');
  return { a, b };
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'pixels') drawPixels(ctx, w, h, col, bg);
  else if (ch === 'mixing') drawMixing(ctx, w, h, col, bg);
  else if (ch === 'eyes') drawEyes(ctx, w, h, col, bg);
  else if (ch === 'numbers') {
    const size = Math.min(w - 32, h - 160);
    ctx.fillStyle = rgb(st.r, st.g, st.b);
    ctx.fillRect((w - size) / 2, 70, size, size);
    label(ctx, hex(st.r, st.g, st.b), w / 2, 70 + size + 30, col.label, bg, { size: 22, weight: 800, align: 'center', mono: true });
  }
  r?.set('rgb', `${st.r}, ${st.g}, ${st.b}`);
  r?.set('hex', hex(st.r, st.g, st.b));
  return false;
}

function levelSliders(ui, api) {
  for (const [k, name] of [['r', 'Red'], ['g', 'Green'], ['b', 'Blue']]) {
    ui.slider({ label: name, min: 0, max: 255, value: st[k], onInput(v) { st[k] = v; api.invalidate(); } });
  }
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ pixels: 'A patch of screen', mixing: 'Three coloured lights in the dark', eyes: 'The eye’s three cones, roughly', numbers: 'One pixel' }[id]);
  if (id === 'pixels') {
    ui.slider({ label: 'Zoom', min: 1, max: 12, step: 0.5, value: st.zoom, format: (v) => (v < 1.5 ? 'Arm’s length' : `${v}×`), onInput(v) { st.zoom = v; api.invalidate(); } });
    levelSliders(ui, api);
    st.readout = api.readout([{ key: 'rgb', label: 'Red, green, blue' }]);
  } else if (id === 'mixing') {
    levelSliders(ui, api);
    st.readout = api.readout([{ key: 'rgb', label: 'Red, green, blue' }]);
  } else if (id === 'eyes') {
    ui.slider({ label: 'A single colour of light', min: 540, max: 610, value: st.nm, format: (v) => `${v} nm`, onInput(v) { st.nm = v; api.invalidate(); } });
    st.readout = null;
  } else {
    levelSliders(ui, api);
    st.readout = api.readout([{ key: 'rgb', label: 'Red, green, blue' }, { key: 'hex', label: 'As web designers write it' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });


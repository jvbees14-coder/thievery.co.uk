// ---------------------------------------------------------------------------
// How a microwave oven heats: the scene.
//
// Microwaves at 2.45 GHz have a wavelength of 12.2 cm. Chapter 1 is the
// wave and a water molecule twisting to follow it. In the closed metal box
// the waves bounce and settle into a standing pattern with hot spots every
// half wavelength, 6.1 cm; chapters 2 and 3 heat a 30 cm plate in that
// pattern, still and then turning. Chapter 4 is the chocolate trick: melted
// spots 6.1 cm apart give the speed of light. The pattern is a simplified
// grid of hot spots, not a solved field for a real oven.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, mix, TOKENS } from '../shared/draw.js';

const F = 2.45e9, C = 299792458, LAMBDA = C / F, N = 40, PLATE = 0.3;
const st = { t: 0, heat: new Float32Array(N * N), angle: 0, turning: false, spacing: 6.1, readout: null };

// Heating rate at a point (metres, from the oven's middle): hot spots
// half a wavelength apart, offset so the middle is not one.
const rate = (x, y) => (Math.cos((TAU * x) / LAMBDA + 0.6) * Math.cos((TAU * y) / LAMBDA + 1.1)) ** 2;

function cook(dt) {
  st.angle += st.turning ? dt * 0.8 : 0;
  const ca = Math.cos(st.angle), sa = Math.sin(st.angle);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const u = ((i + 0.5) / N - 0.5) * PLATE, v = ((j + 0.5) / N - 0.5) * PLATE;
      if (u * u + v * v > (PLATE / 2) ** 2) continue;
      // Where this bit of food is in the oven, given the plate's turn.
      st.heat[i * N + j] += rate(u * ca - v * sa, u * sa + v * ca) * dt;
    }
  }
}

function drawPlate(ctx, w, h, col, bg) {
  const size = Math.min(w - 40, h - 110), x0 = (w - size) / 2, y0 = 70, cell = size / N;
  let max = 0, min = Infinity;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const u = (i + 0.5) / N - 0.5, v = (j + 0.5) / N - 0.5;
    if (u * u + v * v > 0.25) continue;
    max = Math.max(max, st.heat[i * N + j]);
    min = Math.min(min, st.heat[i * N + j]);
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const u = (i + 0.5) / N - 0.5, v = (j + 0.5) / N - 0.5;
    if (u * u + v * v > 0.25) continue;
    const t = max > 0 ? st.heat[i * N + j] / max : 0;
    ctx.fillStyle = mix(col['focus-ring'], col.danger, t);
    ctx.fillRect(x0 + i * cell, y0 + j * cell, cell + 0.5, cell + 0.5);
  }
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.arc(x0 + size / 2, y0 + size / 2, size / 2, 0, TAU);
  ctx.stroke();
  label(ctx, 'Blue: cool. Red: hot.', w / 2, y0 + size + 18, col['label-secondary'], bg, { size: 11, align: 'center' });
  return max > 0 ? min / max : 1;
}

function drawWave(ctx, w, h, col, bg) {
  const y = h * 0.42, x0 = 20, x1 = w - 20, len = x1 - x0, k = TAU / (len / 2.4);
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 3) (x === x0 ? ctx.moveTo : ctx.lineTo).call(ctx, x, y - 50 * Math.sin(k * (x - x0) - st.t * 3));
  ctx.stroke();
  // A water molecule, turning to line up with the field.
  const mx = w / 2, field = Math.sin(k * (mx - x0) - st.t * 3), a = field * 1.2;
  const r = 22;
  ctx.beginPath();
  ctx.arc(mx, y + 110, r, 0, TAU);
  ctx.fillStyle = col.danger;
  ctx.fill();
  for (const s of [-1, 1]) {
    const ha = a + Math.PI / 2 + s * 0.9;
    ctx.beginPath();
    ctx.arc(mx + Math.cos(ha) * r * 1.2, y + 110 + Math.sin(ha) * r * 1.2, r * 0.55, 0, TAU);
    ctx.fillStyle = col.stock;
    ctx.fill();
  }
  label(ctx, 'One wavelength: 12.2 cm', x0 + len / 4.8, y - 70, col['label-secondary'], bg, { size: 11, align: 'center' });
  label(ctx, 'A water molecule twisting to follow the field', mx, y + 160, col['label-secondary'], bg, { size: 11, align: 'center' });
}

function drawChocolate(ctx, w, h, col, bg) {
  const x0 = 20, x1 = w - 20, y = h * 0.45, cm = (x1 - x0) / 30;
  ctx.fillStyle = col['stock-red'];
  ctx.fillRect(x0, y - 20, x1 - x0, 40);
  for (let c = 0; c <= 30; c += 0.2) {
    const melt = Math.cos((Math.PI * (c - 3)) / st.spacing) ** 16;
    if (melt > 0.3) {
      ctx.fillStyle = alpha(col.warning, melt);
      ctx.fillRect(x0 + c * cm - cm * 0.1, y - 20, cm * 0.2 + 1, 40);
    }
  }
  for (let c = 0; c <= 30; c += 5) label(ctx, `${c} cm`, x0 + c * cm, y + 36, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'A bar of chocolate, turntable out: melted spots in orange', w / 2, y - 40, col['label-secondary'], bg, { size: 11, align: 'center' });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (ch === 'waves') {
    if (api.playing && api.motion) {
      st.t += dt * 0.5;
      moving = true;
    }
    drawWave(ctx, w, h, col, bg);
  } else if (ch === 'standing' || ch === 'turntable') {
    if (api.playing && api.motion && st.t < 40) {
      cook(Math.min(dt, 0.05) * 2);
      st.t += dt;
      moving = true;
    }
    const even = drawPlate(ctx, w, h, col, bg);
    r?.set('even', `${fmt(even * 100, 0)}%`);
  } else if (ch === 'light') {
    drawChocolate(ctx, w, h, col, bg);
    r?.set('c', `${fmt(2 * (st.spacing / 100) * F, 0)} m/s`);
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ waves: 'Microwaves, slowed enormously', standing: 'Food on a plate that doesn’t turn', turntable: 'The same, on a turntable', light: 'Measuring the speed of light' }[id]);
  st.readout = null;
  if (id === 'standing' || id === 'turntable') {
    st.turning = id === 'turntable';
    st.heat.fill(0);
    st.t = 0;
    st.angle = 0;
    if (!api.motion) for (let i = 0; i < 400; i++) cook(0.05);
    ui.button({ label: 'Cook again', onClick() { st.heat.fill(0); st.t = 0; st.angle = 0; if (!api.motion) for (let i = 0; i < 400; i++) cook(0.05); api.invalidate(); } });
    st.readout = api.readout([{ key: 'even', label: 'Coolest spot, against the hottest' }]);
  } else if (id === 'light') {
    ui.slider({ label: 'Gap between melted spots', min: 5, max: 7, step: 0.1, value: st.spacing, format: (v) => `${fmt(v, 1)} cm`, onInput(v) { st.spacing = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'c', label: 'Speed of light, 2 × gap × 2.45 GHz' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

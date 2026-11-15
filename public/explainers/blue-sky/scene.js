// ---------------------------------------------------------------------------
// Why the sky is blue: the scene.
//
// Chapter 1 is beams of each colour crossing a field of molecules, with
// short ones bounced aside far more often, and bars of how much each colour
// is scattered. Chapter 2 is the view from the ground. Chapter 3 lowers the
// Sun and works out what survives the longer path. Chapter 4 grows the
// particles until every colour scatters alike.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU, clamp } from '../engine.js';
import { label, setFace, mix, TOKENS } from '../shared/draw.js';
import { COLOURS, scatter, airMass, through } from './art.js';

const st = { sun: 30, size: 0, t: 0, readout: null };

function bars(ctx, x0, y0, w, h, col, bg, values, title) {
  const n = values.length, slot = w / n, max = Math.max(...values);
  label(ctx, title, x0, y0 - 12, col['label-tertiary'], bg, { size: 11 });
  values.forEach((v, i) => {
    const c = COLOURS[i], bh = (v / max) * h;
    ctx.fillStyle = col[c.token];
    ctx.fillRect(x0 + i * slot + slot * 0.15, y0 + h - bh, slot * 0.7, bh);
    label(ctx, c.name, x0 + i * slot + slot / 2, y0 + h + 12, col['label-secondary'], bg, { size: 11, align: 'center' });
  });
}

function drawMolecules(ctx, w, h, col, bg, p) {
  // Rays of each colour coming in from the left; a share of each is
  // knocked aside, more for short wavelengths.
  const top = 70, bottom = h * 0.55, n = COLOURS.length;
  const field = { x0: w * 0.3, x1: w * 0.7 };
  ctx.fillStyle = alpha(col['label-tertiary'], 0.5);
  for (let i = 0; i < 60; i++) {
    const x = field.x0 + ((i * 53) % 97) / 97 * (field.x1 - field.x0), y = top + ((i * 31) % 89) / 89 * (bottom - top);
    ctx.beginPath();
    ctx.arc(x, y, p > 2 ? 2 : 2 + (4 - p) * 1.5, 0, TAU);
    ctx.fill();
  }
  COLOURS.forEach((c, i) => {
    const y = top + ((i + 0.5) / n) * (bottom - top);
    const share = clamp(scatter(c.nm, p) / scatter(400, p), 0, 1);
    ctx.strokeStyle = col[c.token];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(10, y);
    ctx.lineTo(field.x0 + 20, y);
    ctx.stroke();
    // What gets through, thinner the more is scattered.
    ctx.lineWidth = Math.max(0.6, 3 * (1 - share * 0.85));
    ctx.beginPath();
    ctx.moveTo(field.x0 + 20, y);
    ctx.lineTo(w - 10, y);
    ctx.stroke();
    // Scattered rays, more of them for more scattering.
    const k = Math.round(share * 6);
    ctx.lineWidth = 1.2;
    for (let j = 0; j < k; j++) {
      const a = ((j * 97 + i * 31 + st.t * 40) % 360) * (Math.PI / 180);
      const sx = field.x0 + 30 + ((j * 41) % 70) / 70 * (field.x1 - field.x0 - 60);
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx + Math.cos(a) * 26, y + Math.sin(a) * 26);
      ctx.stroke();
    }
  });
  bars(ctx, 20, h * 0.66, w - 40, h * 0.22, col, bg, COLOURS.map((c) => scatter(c.nm, p)), 'How much each colour is scattered');
}

function drawSunset(ctx, w, h, col, bg) {
  // The Earth's curve with its atmosphere, and the path of sunlight to you.
  const R = w * 1.6, cx = w * 0.35, cy = h * 0.55 + R, atm = h * 0.22;
  ctx.fillStyle = alpha(col['focus-ring'], 0.12);
  ctx.beginPath();
  ctx.arc(cx, cy, R + atm, 0, TAU);
  ctx.fill();
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  const you = [cx, cy - R];
  const a = (st.sun * Math.PI) / 180;
  const m = airMass(st.sun);
  // The ray to the Sun, until it leaves the atmosphere.
  const dir = [Math.cos(a), -Math.sin(a)];
  let s = 0;
  while (Math.hypot(you[0] + dir[0] * s - cx, you[1] + dir[1] * s - cy) < R + atm && s < w * 2) s += 2;
  const sunTone = (() => {
    const blue = through(450, m), red = through(700, m);
    return mix(col.stock, col.danger, clamp(1 - blue / red, 0, 1) * 0.9);
  })();
  ctx.strokeStyle = sunTone;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(...you);
  ctx.lineTo(you[0] + dir[0] * s, you[1] + dir[1] * s);
  ctx.stroke();
  // The Sun just beyond the air, kept inside the scene.
  let d = s + 30;
  while (d > 0 && (you[0] + dir[0] * d > w - 22 || you[1] + dir[1] * d < 82)) d -= 4;
  const sx = you[0] + dir[0] * d, sy = you[1] + dir[1] * d;
  ctx.beginPath();
  ctx.arc(sx, sy, 16, 0, TAU);
  ctx.fillStyle = sunTone;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(...you, 5, 0, TAU);
  ctx.fillStyle = col.label;
  ctx.fill();
  label(ctx, 'You', you[0], you[1] + 16, col['label-secondary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Air', cx - R * 0.02, you[1] - atm * 0.5, col['label-tertiary'], bg, { size: 11, align: 'center' });
  bars(ctx, 20, h * 0.68, w - 40, h * 0.2, col, bg, COLOURS.map((c) => through(c.nm, m)), 'Share of each colour that reaches you straight from the Sun');
  return m;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (api.playing && api.motion && (ch === 'scatter' || ch === 'clouds')) {
    st.t += dt;
    moving = true;
  }
  if (ch === 'scatter') {
    drawMolecules(ctx, w, h, col, bg, 4);
    r?.set('ratio', `${fmt(scatter(450), 1)} times as much`);
  } else if (ch === 'blue') {
    // The sky overhead, coloured by what is scattered towards you.
    const sky = ctx.createLinearGradient(0, 60, 0, h * 0.6);
    sky.addColorStop(0, mix(col['focus-ring'], col.bg, 0.25));
    sky.addColorStop(1, mix(col['focus-ring'], col.stock, 0.55));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 60, w, h * 0.6 - 60);
    ctx.fillStyle = col['bg-elevated-2'];
    ctx.fillRect(0, h * 0.6, w, 6);
    bars(ctx, 20, h * 0.7, w - 40, h * 0.18, col, bg, COLOURS.map((c) => scatter(c.nm)), 'Scattered towards you from every part of the sky');
    r?.set('ratio', `${fmt(scatter(450), 1)} times as much`);
  } else if (ch === 'sunset') {
    const m = drawSunset(ctx, w, h, col, bg);
    r?.set('air', `${fmt(m, 1)} times`);
    r?.set('blue', `${fmt(through(450, m) * 100, 0)}%`);
    r?.set('red', `${fmt(through(700, m) * 100, 0)}%`);
  } else if (ch === 'clouds') {
    const p = 4 * (1 - st.size);
    drawMolecules(ctx, w, h, col, bg, p);
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ scatter: 'Sunlight meeting air molecules', blue: 'Looking up, away from the Sun', sunset: 'Air molecules alone; no dust or haze', clouds: 'Make the particles bigger' }[id]);
  if (id === 'sunset') {
    ui.slider({ label: 'Height of the Sun', min: 0, max: 90, value: st.sun, format: (v) => `${v}°`, onInput(v) { st.sun = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'air', label: 'Air crossed, against overhead' }, { key: 'blue', label: 'Blue getting through' }, { key: 'red', label: 'Red getting through' }]);
  } else if (id === 'clouds') {
    st.size = 0;
    ui.slider({ label: 'Particle size', min: 0, max: 1, step: 0.01, value: 0, format: (v) => (v < 0.2 ? 'Molecules' : v < 0.8 ? 'Haze' : 'Cloud droplets'), onInput(v) { st.size = v; api.invalidate(); } });
    st.readout = null;
  } else {
    st.readout = api.readout([{ key: 'ratio', label: 'Blue scattered, compared with red' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

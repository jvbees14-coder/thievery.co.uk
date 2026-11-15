// ---------------------------------------------------------------------------
// The phases of the Moon: the scene.
//
// Chapters 1 and 2 are the Moon's orbit seen from above the north pole, with
// sunlight from the right, beside the face we see from Earth. Chapter 3
// moves the Earth along its own orbit for a month, to show why the phases
// take two days longer than one turn. Chapter 4 is a side view of new moons
// passing above, below, and now and then across the line to the Sun.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, glow, arrow, TOKENS } from '../shared/draw.js';
import { SYNODIC, SIDEREAL, TILT, MOON_KM, EARTH_R, NODE_STEP, ECLIPSE_LIMIT, lit, phaseName, drawFace } from './art.js';

const st = { age: 0, days: 0, moon: 0, readout: null, slider: null };
const U0 = 4;   // where the first new moon of chapter 4 falls, in degrees from a crossing

function drawEarth(ctx, x, y, r, toSun, col) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = col['hiw-ink-1'];
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, toSun + Math.PI / 2, toSun + 1.5 * Math.PI);
  ctx.closePath();
  ctx.fillStyle = alpha(col.back, 0.65);
  ctx.fill();
}
function drawMoon(ctx, x, y, r, toSun, col) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = col.back;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, toSun - Math.PI / 2, toSun + Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = col.stock;
  ctx.fill();
}

function drawOrbit(ctx, w, h, col, bg, ch) {
  const wide = w > 560;
  const cx = wide ? w * 0.42 : w / 2, cy = wide ? h / 2 + 10 : h * 0.42;
  const R = Math.min(wide ? w * 0.3 : w * 0.38, h * 0.3) * (ch === 'phases' ? 0.8 : 1);
  // Sunlight from the right.
  for (let k = -3; k <= 3; k++) {
    const y = cy + k * R * 0.32;
    arrow(ctx, w - 8, y, w - 8 - Math.min(60, w * 0.1), y, alpha(col.accent, 0.6), 1.5, 6);
  }
  label(ctx, 'Sunlight', w - 10, cy - R * 1.1, col.accent, bg, { size: 11, align: 'right' });
  ctx.strokeStyle = col.separator;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  drawEarth(ctx, cx, cy, R * 0.18, 0, col);
  // New moon on the Sun's side, going round anticlockwise.
  if (ch === 'phases') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, age = (i / 8) * SYNODIC;
      drawFace(ctx, cx + Math.cos(a) * R * 1.32, cy - Math.sin(a) * R * 1.32, Math.max(7, R * 0.07), age, col);
    }
  }
  const a = (st.age / SYNODIC) * TAU;
  const mx = cx + Math.cos(a) * R, my = cy - Math.sin(a) * R;
  drawMoon(ctx, mx, my, Math.max(7, R * 0.08), 0, col);
  // What we see.
  const fx = wide ? w * 0.86 : w / 2, fy = wide ? h * 0.78 : h * 0.86, fr = Math.min(wide ? w * 0.07 : h * 0.07, 42);
  drawFace(ctx, fx, fy, fr, st.age, col);
  label(ctx, 'From Earth', fx, fy - fr - 12, col['label-tertiary'], bg, { size: 11, align: 'center' });
}

function drawMonth(ctx, w, h, col, bg) {
  // The Sun far off to the left; the Earth on a great arc round it.
  const sx = -w * 0.9, sy = h / 2 + 20, OR = w * 1.3;
  const e0 = -0.25, ea = e0 + (st.days * 0.9856 * Math.PI) / 180;
  const ex = sx + Math.cos(ea) * OR, ey = sy - Math.sin(ea) * OR;
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.arc(sx, sy, OR, -0.45, 0.45);
  ctx.stroke();
  // Where the Earth started.
  const x0 = sx + Math.cos(e0) * OR, y0 = sy - Math.sin(e0) * OR;
  ctx.beginPath();
  ctx.arc(x0, y0, 5, 0, TAU);
  ctx.strokeStyle = col['label-tertiary'];
  ctx.stroke();
  const toSun = Math.atan2(sy - ey, sx - ex);
  const R = Math.min(w, h) * 0.17;
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.arc(ex, ey, R, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // The direction of the Sun, and of a far star (the Sun's direction at the start).
  const star = Math.atan2(sy - y0, sx - x0);
  arrow(ctx, ex, ey, ex + Math.cos(toSun) * R * 1.6, ey + Math.sin(toSun) * R * 1.6, col.accent, 2, 8);
  ctx.setLineDash([6, 4]);
  arrow(ctx, ex, ey, ex + Math.cos(star) * R * 1.6, ey + Math.sin(star) * R * 1.6, col['hiw-ink-4'], 2, 8);
  ctx.setLineDash([]);
  label(ctx, 'To the Sun', ex + Math.cos(toSun) * R * 1.6, ey + Math.sin(toSun) * R * 1.6 + 16, col.accent, bg, { size: 11, align: 'center' });
  label(ctx, 'To a far star', ex + Math.cos(star) * R * 1.6, ey + Math.sin(star) * R * 1.6 - 14, col['hiw-ink-4'], bg, { size: 11, align: 'center' });
  drawEarth(ctx, ex, ey, R * 0.2, toSun, col);
  // The Moon turns once against the stars every 27.32 days.
  const ma = star + (st.days / SIDEREAL) * TAU * -1;
  drawMoon(ctx, ex + Math.cos(ma) * R, ey + Math.sin(ma) * R, Math.max(10, R * 0.13), toSun, col);
}

function newMoonAt(k) {
  const u = U0 + k * NODE_STEP;
  return { u, height: MOON_KM * Math.sin((TILT * Math.PI) / 180) * Math.sin((u * Math.PI) / 180) };
}
function eclipse(u) {
  const m = ((u % 180) + 180) % 180;
  return Math.min(m, 180 - m) < ECLIPSE_LIMIT;
}

function drawSide(ctx, w, h, col, bg) {
  const cy = h / 2 + 10, sx = 40, ex = w - 50;
  const scale = (h * 0.32) / 34472;          // vertical: much stretched
  glow(ctx, sx, cy, col.accent, 24, 2.2, 0.6);
  ctx.beginPath();
  ctx.arc(sx, cy, 24, 0, TAU);
  ctx.fillStyle = col.accent;
  ctx.fill();
  const er = EARTH_R * scale;
  ctx.beginPath();
  ctx.arc(ex, cy, er, 0, TAU);
  ctx.fillStyle = col['hiw-ink-1'];
  ctx.fill();
  ctx.strokeStyle = alpha(col.accent, 0.4);
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(sx, cy);
  ctx.lineTo(ex, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  const { u, height } = newMoonAt(st.moon);
  const mx = ex - Math.min(160, w * 0.3), my = cy - height * scale;
  const hit = eclipse(u);
  // The Moon's shadow, cast away from the Sun.
  ctx.fillStyle = alpha(hit ? col.danger : col['label-tertiary'], hit ? 0.35 : 0.15);
  const mr = Math.max(6, 1737 * scale * 1.2);
  ctx.beginPath();
  ctx.moveTo(mx, my - mr);
  ctx.lineTo(ex + 30, my - mr * 0.3);
  ctx.lineTo(ex + 30, my + mr * 0.3);
  ctx.lineTo(mx, my + mr);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, TAU);
  ctx.fillStyle = col.back;
  ctx.fill();
  ctx.strokeStyle = col.separator;
  ctx.stroke();
  label(ctx, 'New moon', mx, my - mr - 12, col.label, bg, { size: 12, weight: 700, align: 'center' });
  label(ctx, 'Sun', sx, cy + 40, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Earth', ex, cy + er + 16, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Heights stretched; distances not to scale', w / 2, h - 18, col['label-tertiary'], bg, { size: 11, align: 'center' });
  // The two years of new moons, as a strip.
  const n = 25, sw = (w - 32) / n;
  for (let k = 0; k < n; k++) {
    const e = eclipse(newMoonAt(k).u);
    ctx.fillStyle = k === st.moon ? col.accent : e ? col.danger : alpha(col['label-tertiary'], 0.4);
    ctx.fillRect(16 + k * sw + 1, 56, sw - 2, k === st.moon ? 14 : 9);
  }
  label(ctx, 'Two years of new moons: red ones cause an eclipse', 16, 84, col['label-tertiary'], bg, { size: 11 });
  return { height, hit };
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  let moving = false;
  const r = st.readout;
  if (ch === 'orbit' || ch === 'phases') {
    if (api.playing && api.motion) {
      st.age = (st.age + dt * 3) % SYNODIC;
      st.slider?.set(Math.round(st.age * 2) / 2);
      moving = true;
    }
    drawOrbit(ctx, w, h, col, bg, ch);
    r?.set('age', `${fmt(st.age, 1)} days`);
    r?.set('phase', phaseName(st.age));
    r?.set('lit', `${fmt(lit(st.age) * 100, 0)}%`);
  } else if (ch === 'month') {
    if (api.playing && api.motion) {
      st.days = st.days >= 30 ? 0 : st.days + dt * 3;
      st.slider?.set(Math.round(st.days * 4) / 4);
      moving = true;
    }
    drawMonth(ctx, w, h, col, bg);
    const stars = ((st.days / SIDEREAL) * 360) % 360;
    r?.set('days', `${fmt(st.days, 2)}`);
    r?.set('stars', st.days >= SIDEREAL ? (stars < 0.5 ? 'Once round' : `360° + ${fmt(stars, 0)}°`) : `${fmt(stars, 0)}°`);
    r?.set('phase', phaseName(st.days));
  } else if (ch === 'eclipses') {
    const { height, hit } = drawSide(ctx, w, h, col, bg);
    r?.set('pass', Math.abs(height) < 500 ? 'Right across the line' : `${fmt(Math.abs(height), 0)} km ${height > 0 ? 'above' : 'below'}`);
    r?.set('eclipse', hit ? 'Yes, a solar eclipse' : 'No');
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({
    orbit: 'From above the North Pole; not to scale',
    phases: 'The phases at each point of the orbit',
    month: 'The Earth moves on as the Moon goes round',
    eclipses: 'From the side, at each new moon',
  }[id]);
  st.slider = null;
  if (id === 'orbit' || id === 'phases') {
    st.slider = ui.slider({
      label: 'Days since new moon',
      min: 0,
      max: 29.5,
      step: 0.5,
      value: Math.round(st.age * 2) / 2,
      format: (v) => fmt(v, 1),
      onInput(v) {
        st.age = v;
        api.invalidate();
      },
    });
    st.readout = api.readout([{ key: 'age', label: 'Age' }, { key: 'phase', label: 'Phase' }, { key: 'lit', label: 'Lit, as we see it' }]);
  } else if (id === 'month') {
    st.slider = ui.slider({
      label: 'Days',
      min: 0,
      max: 30,
      step: 0.25,
      value: st.days,
      format: (v) => fmt(v, 2),
      onInput(v) {
        st.days = v;
        api.invalidate();
      },
    });
    ui.button({ label: 'One turn: 27.32 days', onClick() { st.days = SIDEREAL; st.slider.set(st.days); api.invalidate(); } });
    ui.button({ label: 'New moon again: 29.53', onClick() { st.days = SYNODIC; st.slider.set(st.days); api.invalidate(); } });
    st.readout = api.readout([{ key: 'days', label: 'Days' }, { key: 'stars', label: 'Turned against the stars' }, { key: 'phase', label: 'Phase' }]);
  } else if (id === 'eclipses') {
    st.slider = ui.slider({
      label: 'New moon',
      min: 0,
      max: 24,
      value: st.moon,
      format: (v) => `${v + 1} of 25`,
      onInput(v) {
        st.moon = v;
        api.invalidate();
      },
    });
    st.readout = api.readout([{ key: 'pass', label: 'The Moon passes' }, { key: 'eclipse', label: 'Its shadow reaches the Earth' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

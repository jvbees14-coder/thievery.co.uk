// ---------------------------------------------------------------------------
// Why eclipses are rare: the scene.
//
// Chapter 1 looks down on Earth and the Moon with sunlight from the left.
// Chapter 2 is a side view, to scale up and down: at new moon the Moon's
// height above Earth's orbital plane is 384,400 km × sin 5.145° × sin u,
// where u is its angle from the node; its shadow touches Earth when that
// is within about 6,400 km (a central eclipse) and some of its half-shadow
// does to about 10,700 km (a partial one). Chapter 3 walks a year: new
// moons every 29.53 days, the Sun moving 360° a year and the nodes back
// 19.35° a year, an eclipse when the Sun is within 17° of a node. Chapter
// 4 compares the Sun's and Moon's real angular sizes.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const DIST = 384400, TILT = (5.145 * Math.PI) / 180, RE = 6371;
const st = { moon: 0.5, node: 20, day: 0, dist: 384400, readout: null };

function sun(ctx, x, y, R, col) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, col['accent-strong']);
  g.addColorStop(1, col.warning);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fill();
}
function body(ctx, x, y, R, col, dayAngle) {
  // Lit on the side facing the Sun (to the left): a dark disc with a lit half.
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fillStyle = col.back;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, R, Math.PI / 2 + (dayAngle || 0), Math.PI * 1.5 + (dayAngle || 0));
  ctx.fillStyle = col['label-secondary'];
  ctx.fill();
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let more = false;
  if (ch === 'line') {
    const ex = w * 0.6, ey = h / 2, orb = Math.min(w * 0.3, h * 0.38);
    sun(ctx, -w * 0.05, ey, h * 0.4, col);
    ctx.strokeStyle = col.separator;
    ctx.beginPath();
    ctx.arc(ex, ey, orb, 0, TAU);
    ctx.stroke();
    // Earth's shadow, off to the right.
    ctx.fillStyle = alpha(col.back, 0.45);
    ctx.fillRect(ex, ey - 22, w, 44);
    body(ctx, ex, ey, 22, col);
    const a = st.moon * TAU;
    const mx = ex + Math.cos(a) * orb, my = ey - Math.sin(a) * orb;
    body(ctx, mx, my, 9, col);
    const near = (target) => Math.abs(((a - target + Math.PI * 3) % TAU) - Math.PI) < 0.06;
    let what = 'No eclipse';
    if (near(Math.PI)) {
      what = 'New moon: a solar eclipse, if lined up';
      ctx.fillStyle = alpha(col.back, 0.5);
      ctx.beginPath();
      ctx.moveTo(mx, my - 9);
      ctx.lineTo(ex - 20, ey - 3);
      ctx.lineTo(ex - 20, ey + 3);
      ctx.lineTo(mx, my + 9);
      ctx.fill();
    } else if (near(0)) what = 'Full moon: a lunar eclipse, if lined up';
    label(ctx, 'Sunlight →', w * 0.22, h - 20, col['label-secondary'], bg, { size: 12 });
    label(ctx, 'Earth', ex, ey + 38, col.label, bg, { size: 12, align: 'center' });
    r?.set('what', what);
  } else if (ch === 'tilt') {
    const u = (st.node * Math.PI) / 180;
    const z = DIST * Math.sin(TILT) * Math.sin(u);
    const scale = (h * 0.42) / 36000;
    const ex = w * 0.78, ey = h / 2;
    ctx.strokeStyle = col.separator;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(0, ey);
    ctx.lineTo(w, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'The plane of Earth’s orbit', 12, ey - 12, col['label-tertiary'], bg, { size: 11 });
    // Earth, to scale vertically.
    ctx.beginPath();
    ctx.arc(ex, ey, RE * scale, 0, TAU);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
    const mx = w * 0.35, my = ey - z * scale;
    // The shadow travels level with the sunlight, from the Moon towards Earth.
    const hit = Math.abs(z) < 6400 ? 'total' : Math.abs(z) < 10700 ? 'partial' : 'none';
    ctx.fillStyle = alpha(col.back, hit === 'none' ? 0.35 : 0.6);
    ctx.fillRect(mx, my - 1737 * scale, w - mx, 3474 * scale);
    ctx.beginPath();
    ctx.arc(mx, my, Math.max(3, 1737 * scale), 0, TAU);
    ctx.fillStyle = col['label-secondary'];
    ctx.fill();
    label(ctx, 'Sunlight →', 12, h - 20, col['label-secondary'], bg, { size: 12 });
    label(ctx, 'Moon at new moon', mx, my - 22, col.label, bg, { size: 12, align: 'center' });
    label(ctx, `${fmt(Math.abs(z))} km ${z >= 0 ? 'above' : 'below'}`, mx, my + 26, col['label-secondary'], bg, { size: 11, align: 'center' });
    r?.set('height', `${fmt(Math.abs(z))} km`);
    r?.set('eclipse', hit === 'total' ? 'Total or annular' : hit === 'partial' ? 'Partial' : 'None');
  } else if (ch === 'seasons') {
    if (api.playing && api.motion) {
      st.day = (st.day + f.dt * 30) % 366;
      more = true;
    }
    const cx = w * 0.5, cy = h * 0.5, R = Math.min(w, h) * 0.36;
    sun(ctx, cx, cy, 18, col);
    ctx.strokeStyle = col.separator;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    // The direction of the node line drifts back slowly over the year.
    const nodeA = (st.node0 - (19.35 * st.day) / 365.25) * (Math.PI / 180);
    let count = 0;
    const lim = (17 * Math.PI) / 180;
    for (let dd = st.phase; dd < 365.25; dd += 29.53) {
      const sa = (dd / 365.25) * TAU;
      const na = (st.node0 - (19.35 * dd) / 365.25) * (Math.PI / 180);
      let off = Math.abs(((sa - na) % Math.PI + Math.PI) % Math.PI);
      off = Math.min(off, Math.PI - off);
      const ecl = off < lim;
      if (ecl) count++;
      const past = dd <= st.day;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(sa) * R, cy - Math.sin(sa) * R, ecl ? 7 : 4, 0, TAU);
      ctx.fillStyle = ecl ? (past ? col.danger : alpha(col.danger, 0.35)) : past ? col['label-secondary'] : alpha(col['label-tertiary'], 0.4);
      ctx.fill();
    }
    const ea = (st.day / 365.25) * TAU;
    const exx = cx + Math.cos(ea) * R, eyy = cy - Math.sin(ea) * R;
    ctx.beginPath();
    ctx.arc(exx, eyy, 9, 0, TAU);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
    // The node line, carried with Earth.
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(exx - Math.cos(nodeA) * 40, eyy + Math.sin(nodeA) * 40);
    ctx.lineTo(exx + Math.cos(nodeA) * 40, eyy - Math.sin(nodeA) * 40);
    ctx.stroke();
    label(ctx, 'Nodes', exx + Math.cos(nodeA) * 48, eyy - Math.sin(nodeA) * 48, col.accent, bg, { size: 11, align: 'center' });
    label(ctx, 'Dots: the year’s new moons. Red: solar eclipses.', 12, h - 16, col['label-tertiary'], bg, { size: 11 });
    r?.set('day', `${fmt(st.day)}`);
    r?.set('count', `${count}`);
  } else if (ch === 'shadow') {
    const sunDeg = 0.533;
    const moonDeg = (2 * Math.atan(1737.4 / st.dist) * 180) / Math.PI;
    const scale = Math.min(w, h) * 0.55 / 0.6;
    const cx = w / 2, cy = h * 0.45;
    sun(ctx, cx, cy, (sunDeg / 2) * scale, col);
    ctx.beginPath();
    ctx.arc(cx, cy, (moonDeg / 2) * scale, 0, TAU);
    ctx.fillStyle = col.back;
    ctx.fill();
    const kind = moonDeg >= sunDeg ? 'Total: the Sun is covered' : 'Annular: a ring of Sun is left';
    label(ctx, kind, cx, cy + (sunDeg / 2) * scale + 30, moonDeg >= sunDeg ? col.success : col.warning, bg, { size: 14, weight: 700, align: 'center' });
    r?.set('moon', `${fmt(moonDeg, 3)}°`);
    r?.set('sun', `${fmt(sunDeg, 3)}°`);
  }
  return more;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ line: 'Looking down on Earth and the Moon, not to scale', tilt: 'Side view, heights to scale', seasons: 'One year, looking down on Earth’s orbit', shadow: 'The Sun and Moon at their real sizes in the sky' }[id]);
  if (id === 'line') {
    st.moon = 0.4;
    ui.slider({ label: 'Moon’s place', min: 0, max: 100, value: 40, format: (v) => `${Math.round(v * 3.6)}°`, onInput(v) { st.moon = v / 100; api.invalidate(); } });
    st.readout = api.readout([{ key: 'what', label: 'Now' }]);
  } else if (id === 'tilt') {
    st.node = 40;
    ui.slider({ label: 'New moon’s distance from a node', min: -90, max: 90, value: 40, format: (v) => `${v}°`, onInput(v) { st.node = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'height', label: 'Moon off the plane' }, { key: 'eclipse', label: 'Solar eclipse' }]);
  } else if (id === 'seasons') {
    st.day = api.motion ? 0 : 365;
    st.node0 = 60;
    st.phase = 12;
    ui.slider({ label: 'Day of the year', min: 0, max: 365, value: st.day, onInput(v) { st.day = v; api.invalidate(); } });
    ui.button({ label: 'Another year', onClick() { st.node0 = (st.node0 + 137) % 360; st.phase = (st.phase + 11) % 29.53; st.day = api.motion ? 0 : 365; api.invalidate(); } });
    st.readout = api.readout([{ key: 'day', label: 'Day' }, { key: 'count', label: 'Solar eclipses this year' }]);
  } else if (id === 'shadow') {
    st.dist = 384400;
    ui.slider({ label: 'Moon’s distance', min: 356500, max: 406700, step: 100, value: 384400, format: (v) => `${fmt(v)} km`, onInput(v) { st.dist = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'moon', label: 'Moon’s width in the sky' }, { key: 'sun', label: 'Sun’s' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

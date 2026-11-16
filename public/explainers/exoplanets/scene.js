// ---------------------------------------------------------------------------
// Finding planets round other stars: the scene.
//
// A star seen face on and a planet crossing it on an edge-on orbit. The
// brightness is 1 minus the area of overlap between the two discs over the
// star's area, the overlap worked out exactly (the lens formula), for a
// star of even brightness. Chapter 3 repeats the crossing once an orbit
// and plots several; chapter 4 swings the star about the shared centre and
// plots its speed towards us, tinting it bluer or redder.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU, clamp } from '../engine.js';
import { label, setFace, TOKENS, mix } from '../shared/draw.js';
import { plot } from '../shared/plot.js';

const SUN = 696340, EARTH = 6371;
const st = { rp: 11, t: 0, period: 1, mass: 1, readout: null };

/** The area of overlap of two circles, radii R and r, centres d apart. */
function overlap(R, r, d) {
  if (d >= R + r) return 0;
  if (d <= Math.abs(R - r)) return Math.PI * Math.min(R, r) ** 2;
  const a = r * r * Math.acos((d * d + r * r - R * R) / (2 * d * r));
  const b = R * R * Math.acos((d * d + R * R - r * r) / (2 * d * R));
  const c = 0.5 * Math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R));
  return a + b - c;
}
/** Brightness when the planet's centre is x star-radii from the star's centre. */
const light = (x, k) => 1 - overlap(1, k, Math.abs(x)) / Math.PI;

function star(ctx, cx, cy, R, col, tint) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  const core = tint ? mix(col['accent-strong'], tint, 0.45) : col['accent-strong'];
  g.addColorStop(0, core);
  g.addColorStop(0.75, tint ? mix(col.warning, tint, 0.45) : col.warning);
  g.addColorStop(1, alpha(col.warning, 0.6));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
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
  const k = (st.rp * EARTH) / SUN;
  if (ch === 'dip' || ch === 'size') {
    // One crossing every 8 seconds; the planet's path runs from −2.5 to 2.5.
    const cyc = 8;
    const ph = moving ? (st.t % cyc) / cyc : 0.5;
    const x = -2.5 + 5 * ph;
    const R = Math.min(w * 0.18, h * 0.2), cx = w / 2, cy = 30 + R;
    star(ctx, cx, cy, R, col);
    ctx.beginPath();
    ctx.arc(cx + x * R, cy, Math.max(1.5, k * R), 0, TAU);
    ctx.fillStyle = col.back;
    ctx.fill();
    const depthPct = k * k * 100;
    const ymin = Math.max(0.9, 1 - depthPct / 100 * 1.6);
    const g = plot(ctx, col, bg, { x0: 70, x1: w - 20, y0: cy + R + 50, y1: h - 40 },
      { min: -2.5, max: 2.5, ticks: [], name: 'Time' },
      { min: ymin, max: 1.0005, ticks: [ymin, (1 + ymin) / 2, 1], fmt: (v) => `${fmt(v * 100, depthPct < 0.1 ? 3 : 1)}%`, name: 'Brightness' });
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 400; i++) {
      const xx = -2.5 + (5 * i) / 400;
      if (xx > x) break;
      (i ? ctx.lineTo : ctx.moveTo).call(ctx, g.X(xx), g.Y(light(xx, k)));
    }
    ctx.stroke();
    r?.set('depth', `${fmt(depthPct, depthPct < 0.1 ? 4 : 2)}%`);
    r?.set('size', `${fmt(st.rp, 1)} × Earth`);
    return moving;
  }
  if (ch === 'period') {
    const cyc = 2 * st.period;
    const R = Math.min(w * 0.08, 50), cx = w * 0.18, cy = h * 0.32;
    // A view from above: the orbit, and us off to the bottom of the screen.
    const orb = Math.min(w * 0.14, h * 0.22) * Math.cbrt(st.period * st.period) / Math.cbrt(4) * 1.2;
    const a = (st.t / cyc) * TAU;
    ctx.strokeStyle = col.separator;
    ctx.beginPath();
    ctx.arc(cx, cy, orb, 0, TAU);
    ctx.stroke();
    star(ctx, cx, cy, R * 0.5, col);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * orb, cy + Math.sin(a) * orb, 5, 0, TAU);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
    label(ctx, 'To us ↓', cx, cy + orb + 22, col['label-tertiary'], bg, { size: 11, align: 'center' });
    const span = 12;
    const g = plot(ctx, col, bg, { x0: w * 0.4, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0, max: span, ticks: [0, 3, 6, 9, 12], name: 'Years of watching' },
      { min: 0.988, max: 1.001, ticks: [0.99, 1], fmt: (v) => `${fmt(v * 100)}%`, name: 'Brightness' });
    // The transit lasts a sliver of the orbit: the star's width over the orbit's circumference.
    const dur = 0.04 * Math.cbrt(st.period);
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const tNow = Math.min(span, st.t / 2);
    for (let i = 0; i <= 1200; i++) {
      const tt = (span * i) / 1200;
      if (tt > tNow) break;
      const p = ((tt / st.period) % 1 + 1) % 1;
      const off = (Math.min(Math.abs(p - 0.25), 1) / dur) * 2;
      (i ? ctx.lineTo : ctx.moveTo).call(ctx, g.X(tt), g.Y(light(off, 0.1)));
    }
    ctx.stroke();
    r?.set('year', `${fmt(st.period, 1)} years`);
    r?.set('dist', `${fmt(Math.cbrt(st.period * st.period), 2)} × Earth’s`);
    if (st.t / 2 > span) st.t = 0;
    return moving;
  }
  if (ch === 'wobble') {
    const cx = w * 0.3, cy = h * 0.42;
    const a = st.t * 1.4;
    const swing = 8 + 20 * Math.min(1, st.mass / 10);
    const sx = cx - Math.cos(a) * swing, sy = cy - Math.sin(a) * swing * 0.35;
    const v = -Math.cos(a);
    const speed = 12.4 * st.mass;
    const tint = v > 0 ? col['hiw-ink-1'] : col.danger;
    star(ctx, sx, sy, Math.min(w * 0.09, 56), col, Math.abs(v) > 0.05 ? mix(col['accent-strong'], tint, Math.abs(v)) : null);
    const orb = Math.min(w * 0.22, 150);
    ctx.strokeStyle = col.separator;
    ctx.beginPath();
    ctx.ellipse(cx, cy, orb, orb * 0.35, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * orb, cy + Math.sin(a) * orb * 0.35, 4 + Math.min(6, st.mass), 0, TAU);
    ctx.fillStyle = col['hiw-ink-4'];
    ctx.fill();
    label(ctx, 'To us ↓', cx, cy + orb * 0.35 + 70, col['label-tertiary'], bg, { size: 11, align: 'center' });
    const g = plot(ctx, col, bg, { x0: w * 0.58, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0, max: TAU * 2, ticks: [], name: 'Time' },
      { min: -150, max: 150, ticks: [-150, -75, 0, 75, 150], fmt: (s) => `${s > 0 ? '+' : ''}${s}`, name: 'Star’s speed towards us, m/s' });
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const tt = (TAU * 2 * i) / 200;
      (i ? ctx.lineTo : ctx.moveTo).call(ctx, g.X(tt), g.Y(clamp(-speed * Math.cos(tt + a), -150, 150)));
    }
    ctx.stroke();
    r?.set('speed', `${fmt(speed, 1)} m/s`);
    r?.set('mass', `${fmt(st.mass, 1)} × Jupiter`);
    return moving;
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  st.t = 0;
  api.note({ dip: 'A Jupiter-sized planet crossing a Sun-like star', size: 'A Sun-like star, any planet', period: 'A star like the Sun, watched for twelve years', wobble: 'A planet at Jupiter’s distance, seen from the side' }[id]);
  if (id === 'dip' || id === 'size') {
    st.rp = 11;
    if (id === 'size') ui.slider({ label: 'Planet’s width', min: 1, max: 20, step: 0.5, value: 11, format: (v) => `${fmt(v, 1)} × Earth`, onInput(v) { st.rp = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'depth', label: 'Dip' }, { key: 'size', label: 'Planet' }]);
  } else if (id === 'period') {
    st.period = 1;
    ui.slider({ label: 'Its year', min: 0.2, max: 4, step: 0.1, value: 1, format: (v) => `${fmt(v, 1)} years`, onInput(v) { st.period = v; st.t = 0; api.invalidate(); } });
    st.readout = api.readout([{ key: 'year', label: 'Time between dips' }, { key: 'dist', label: 'Distance from its star' }]);
  } else if (id === 'wobble') {
    st.mass = 1;
    ui.slider({ label: 'Planet’s mass', min: 0.1, max: 10, step: 0.1, value: 1, format: (v) => `${fmt(v, 1)} × Jupiter`, onInput(v) { st.mass = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'speed', label: 'Star’s swing' }, { key: 'mass', label: 'Planet' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

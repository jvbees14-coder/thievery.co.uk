// ---------------------------------------------------------------------------
// Measuring the distance to the stars: the scene.
//
// Chapter 1: two eyes 6.5 cm apart and a finger at some distance, its
// image thrown onto a far wall; the shift is 2·atan(3.25 cm ÷ distance).
// Chapter 2: Earth round the Sun with one near star shifting against a
// field of far ones, much exaggerated. Chapter 3: parallax in arcseconds is
// 1 ÷ parsecs, and a parsec is 3.2616 light years. Chapter 4: the distance
// at which a 2p coin (25.9 mm) is as wide as a star's parallax.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, glow, TOKENS } from '../shared/draw.js';
import { seeded } from '../shared/plot.js';

const LY = 3.2616;
const STARS = [
  { name: 'Proxima Centauri', p: 0.768 },
  { name: 'Sirius', p: 0.379 },
  { name: '61 Cygni', p: 0.286 },
  { name: 'Vega', p: 0.130 },
  { name: 'Polaris', p: 0.0075 },
];
const st = { eye: 'left', finger: 60, t: 0, ly: 4.25, star: 0, field: null, readout: null };

function field() {
  const r = seeded(11);
  return Array.from({ length: 70 }, () => [r(), r(), 0.5 + r() * 1.5]);
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let more = false;
  if (ch === 'blink') {
    const eyeY = h - 50, wallY = 80, cx = w / 2;
    const sep = Math.min(80, w * 0.14);
    // Distances: the wall stands for 3 m; the finger from 10 to 70 cm.
    const toY = (cm) => eyeY - ((eyeY - wallY) * cm) / 300;
    const fy = toY(st.finger);
    ctx.strokeStyle = col['separator-strong'];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(30, wallY);
    ctx.lineTo(w - 30, wallY);
    ctx.stroke();
    label(ctx, 'The wall', 30, wallY - 14, col['label-tertiary'], bg, { size: 11 });
    const eyes = { left: cx - sep / 2, right: cx + sep / 2 };
    const ex = eyes[st.eye];
    // Where the finger appears on the wall, from the open eye.
    const hit = (from) => from + ((cx - from) * (eyeY - wallY)) / (eyeY - fy);
    for (const [k, x] of Object.entries(eyes)) {
      const open = k === st.eye;
      ctx.strokeStyle = open ? alpha(col.accent, 0.8) : alpha(col['label-tertiary'], 0.3);
      ctx.lineWidth = open ? 1.5 : 1;
      ctx.setLineDash(open ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, eyeY);
      ctx.lineTo(hit(x), wallY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.ellipse(x, eyeY, 14, open ? 8 : 2, 0, 0, TAU);
      ctx.fillStyle = open ? col.label : col['label-tertiary'];
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hit(x), wallY + 8, 6, 0, TAU);
      ctx.fillStyle = open ? col.accent : alpha(col['label-tertiary'], 0.4);
      ctx.fill();
    }
    ctx.fillStyle = col['hiw-ink-2'];
    ctx.beginPath();
    ctx.roundRect(cx - 6, fy - 20, 12, 40, 6);
    ctx.fill();
    label(ctx, 'Finger', cx + 14, fy, col['hiw-ink-2'], bg, { size: 12 });
    const deg = (2 * Math.atan(3.25 / st.finger) * 180) / Math.PI;
    r?.set('shift', `${fmt(deg, 1)}°`);
    r?.set('dist', `${st.finger} cm`);
  } else if (ch === 'orbit') {
    if (api.playing && api.motion) { st.t += f.dt * 0.25; more = true; }
    if (!st.field) st.field = field();
    const sky = { x0: 20, x1: w - 20, y0: 60, y1: h * 0.52 };
    ctx.fillStyle = col.back;
    ctx.fillRect(sky.x0, sky.y0, sky.x1 - sky.x0, sky.y1 - sky.y0);
    for (const [x, y, s] of st.field) glow(ctx, sky.x0 + x * (sky.x1 - sky.x0), sky.y0 + y * (sky.y1 - sky.y0), col['label-secondary'], s * 0.8, 3, 0.3);
    const a = st.t * TAU;
    const shift = Math.cos(a) * (sky.x1 - sky.x0) * 0.12;
    const nx = (sky.x0 + sky.x1) / 2 + shift, ny = (sky.y0 + sky.y1) / 2;
    glow(ctx, nx, ny, col.warning, 4, 4, 0.7);
    label(ctx, 'Near star', nx, ny + 18, col.warning, null, { size: 11, align: 'center' });
    // Below: the Sun and Earth's orbit, seen from above.
    const cx = w / 2, cy = h * 0.76, R = Math.min(w * 0.3, h * 0.18);
    ctx.strokeStyle = col.separator;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * 0.5, 0, 0, TAU);
    ctx.stroke();
    glow(ctx, cx, cy, col.warning, 8, 3, 0.5);
    const ex = cx - Math.cos(a) * R, ey = cy + Math.sin(a) * R * 0.5;
    ctx.beginPath();
    ctx.arc(ex, ey, 7, 0, TAU);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
    ctx.strokeStyle = alpha(col.warning, 0.5);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    ctx.setLineDash([]);
    const months = ['January', 'April', 'July', 'October'];
    r?.set('month', months[Math.floor(((st.t % 1) + 1) % 1 * 4)]);
  } else if (ch === 'parsec') {
    const pc = st.ly / LY;
    const p = 1 / pc;
    // A side view: the orbit's radius as a short base, the star up the page.
    const bx = w * 0.5, by = h - 60, base = Math.min(w * 0.18, 120);
    const top = 70, sy = top + ((h - 120 - top) * Math.min(1, (st.ly - 1) / 40));
    ctx.strokeStyle = col['label-secondary'];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx - base, by);
    ctx.lineTo(bx, sy);
    ctx.lineTo(bx, by);
    ctx.stroke();
    glow(ctx, bx, by, col.warning, 7, 3, 0.5);
    ctx.beginPath();
    ctx.arc(bx - base, by, 6, 0, TAU);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
    glow(ctx, bx, sy, col.label, 4, 3, 0.4);
    label(ctx, 'Sun', bx + 10, by + 4, col['label-secondary'], bg, { size: 11 });
    label(ctx, 'Earth', bx - base, by + 18, col['label-secondary'], bg, { size: 11, align: 'center' });
    label(ctx, '1 AU, 150 million km', bx - base / 2, by + 36, col['label-tertiary'], bg, { size: 11, align: 'center' });
    label(ctx, `The angle at the star: ${fmt(p, 3)}″`, bx + 14, sy, col.accent, bg, { size: 13, weight: 700 });
    label(ctx, 'Not to scale: a parsec is 206,265 times the base', 12, h - 14, col['label-tertiary'], bg, { size: 11 });
    r?.set('pc', `${fmt(pc, 2)} parsecs`);
    r?.set('p', `${fmt(p, 3)}″`);
  } else if (ch === 'tiny') {
    const s = STARS[st.star];
    const rad = (s.p / 3600) * (Math.PI / 180);
    const km = 0.0259 / rad / 1000;
    const cx = w / 2, cy = h * 0.4;
    // A 2p coin, drawn at a fixed size, and a line saying how far it is.
    ctx.beginPath();
    ctx.arc(cx, cy, 50, 0, TAU);
    ctx.fillStyle = col.ornament;
    ctx.fill();
    ctx.strokeStyle = col['separator-strong'];
    ctx.stroke();
    label(ctx, '2p', cx, cy, col.label, null, { size: 18, weight: 700, align: 'center' });
    label(ctx, `seen from ${fmt(km, km < 10 ? 1 : 0)} km away`, cx, cy + 80, col.label, bg, { size: 16, weight: 700, align: 'center' });
    label(ctx, `is as wide as ${s.name}’s shift of ${s.p}″`, cx, cy + 104, col['label-secondary'], bg, { size: 13, align: 'center' });
    r?.set('dist', `${fmt(LY / s.p, 1)} light years`);
    r?.set('coin', `${fmt(km, 1)} km`);
  }
  return more;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ blink: 'Seen from above: two eyes and a finger', orbit: 'The shift exaggerated a million times', parsec: 'The triangle behind the parsec', tiny: 'Real parallaxes of some well-known stars' }[id]);
  if (id === 'blink') {
    ui.choice({ label: 'Open eye', options: [{ id: 'left', label: 'Left' }, { id: 'right', label: 'Right' }], value: st.eye, onChange(v) { st.eye = v; api.invalidate(); } });
    ui.slider({ label: 'Finger’s distance', min: 10, max: 70, value: st.finger, format: (v) => `${v} cm`, onInput(v) { st.finger = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'shift', label: 'Jump between eyes' }, { key: 'dist', label: 'Finger' }]);
  } else if (id === 'orbit') {
    st.readout = api.readout([{ key: 'month', label: 'Month' }]);
  } else if (id === 'parsec') {
    ui.slider({ label: 'Star’s distance', min: 1, max: 40, step: 0.25, value: st.ly, format: (v) => `${fmt(v, 2)} light years`, onInput(v) { st.ly = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'pc', label: 'Distance' }, { key: 'p', label: 'Parallax' }]);
  } else if (id === 'tiny') {
    ui.choice({ label: 'Star', options: STARS.map((s, i) => ({ id: String(i), label: s.name })), value: String(st.star), onChange(v) { st.star = Number(v); api.invalidate(); } });
    st.readout = api.readout([{ key: 'dist', label: 'Distance' }, { key: 'coin', label: 'The coin would be' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

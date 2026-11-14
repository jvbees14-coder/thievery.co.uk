// ---------------------------------------------------------------------------
// Why the sea comes in twice a day: the scene.
//
// Chapters 1 and 2 draw the Moon's pull at points round the Earth, first as
// it is and then with the pull on the Earth's centre taken away, which
// leaves the stretch that makes two bulges. Chapter 3 spins the Earth under
// them and graphs the water at London. Chapter 4 runs a month and adds the
// Sun. Chapter 5 is real tidal ranges, which the equilibrium tide does not
// predict, side by side.
// ---------------------------------------------------------------------------

import { mount, Smooth, fmt, TAU, alpha } from '../engine.js';
import { label, setFace, TOKENS, arrow } from '../shared/draw.js';
import { angles, tideAt, drawEarth, drawMoon, LONDON, SUN_SHARE } from './art.js';

const st = {
  hours: 30,
  bulge: new Smooth(0, 3),
  readout: null,
  history: [],
};

const RATE = { pull: 0.6, bulges: 0.6, twice: 4, sun: 30, coast: 0 };

function phaseName(a) {
  let e = ((a.moon - a.sun) % TAU + TAU) % TAU;
  const names = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return names[Math.round(e / (TAU / 8)) % 8];
}

function pullArrows(ctx, cx, cy, R, moonX, moonY, col, tidal) {
  // The Moon is drawn far closer than it is, so its pull here is worked
  // out at the drawn distance; the pattern is the same, only stronger.
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    pts.push([cx + Math.cos(a) * R * 0.98, cy - Math.sin(a) * R * 0.98]);
  }
  const pull = (x, y) => {
    const dx = moonX - x, dy = moonY - y, d = Math.hypot(dx, dy);
    return [dx / d ** 3, dy / d ** 3];
  };
  const c = pull(cx, cy);
  const all = tidal ? pts : [...pts, [cx, cy]];
  const vec = (x, y) => {
    const p = pull(x, y);
    return tidal ? [p[0] - c[0], p[1] - c[1]] : p;
  };
  // The longest arrow is half the Earth's radius; the rest in proportion.
  const longest = Math.max(...all.map(([x, y]) => Math.hypot(...vec(x, y))));
  const k = (R * 0.5) / longest;
  for (const [x, y] of all) {
    const v = vec(x, y);
    const vx = v[0] * k, vy = v[1] * k;
    if (Math.hypot(vx, vy) < 2) continue;
    arrow(ctx, x, y, x + vx, y + vy, x === cx && y === cy ? col['accent-strong'] : col.accent, 1.6, 6);
  }
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  let moving = st.bulge.step(dt, !api.motion);
  if (api.playing && api.motion && RATE[ch]) {
    st.hours += dt * RATE[ch];
    moving = true;
  }
  const a = angles(st.hours);

  if (ch === 'coast') {
    drawCoasts(ctx, w, h, col, bg);
  } else {
    const graph = ch === 'twice' || ch === 'sun';
    const cy = graph ? h * 0.38 : h * 0.5;
    const R = Math.min(w * 0.2, h * (graph ? 0.18 : 0.24));
    const cx = w * 0.4;
    const room = Math.min(cx, w - cx, cy, (graph ? h * 0.64 : h) - cy) - R * 0.35;
    const moonD = Math.max(R * 1.6, Math.min(R * 3, room));
    const spin = ch !== 'sun';
    drawEarth(ctx, cx, cy, R, col, a, { bulge: st.bulge.v, sun: ch === 'sun', spin });
    const [mx, my] = drawMoon(ctx, cx, cy, moonD, a.moon, R * 0.27, col, a);
    label(ctx, 'Moon', mx, my + R * 0.27 + 14, col['label-secondary'], bg, { size: 12, align: 'center' });
    if (ch === 'pull' || ch === 'bulges') pullArrows(ctx, cx, cy, R, mx, my, col, ch === 'bulges');
    if (ch === 'sun') {
      const sx = cx + Math.cos(a.sun) * Math.min(w, h) * 0.6, sy = cy - Math.sin(a.sun) * Math.min(w, h) * 0.6;
      const ex = cx + Math.cos(a.sun) * R * 1.6, ey = cy - Math.sin(a.sun) * R * 1.6;
      arrow(ctx, sx, sy, ex, ey, col.warning, 1.5, 8);
      label(ctx, 'Sunlight', (sx + ex) / 2, (sy + ey) / 2 - 12, col.warning, bg, { size: 12, align: 'center' });
    }
    // London, carried round by the Earth.
    if (spin) {
      const lat = (LONDON.lat * Math.PI) / 180;
      const phi = (LONDON.lon * Math.PI) / 180 + a.spin;
      const px = cx + Math.cos(phi) * Math.cos(lat) * R, py = cy - Math.sin(phi) * Math.cos(lat) * R;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, TAU);
      ctx.fillStyle = col.label;
      ctx.fill();
      label(ctx, 'London', px + 8, py - 8, col.label, bg, { size: 12 });
    }
    if (graph) drawGraph(ctx, w, h, col, bg, ch === 'sun');
  }

  const r = st.readout;
  if (r) {
    const phi = (LONDON.lon * Math.PI) / 180 + a.spin;
    const day = Math.floor(st.hours / 24), hh = Math.floor(st.hours % 24), mm = Math.floor((st.hours * 60) % 60);
    r.set('time', `Day ${day + 1}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    r.set('level', `${fmt(tideAt(phi, a, false) * 100)}%`);
    r.set('phase', phaseName(a));
    const range = Math.hypot(1 + SUN_SHARE * Math.cos(2 * (a.moon - a.sun)), SUN_SHARE * Math.sin(2 * (a.moon - a.sun)));
    r.set('range', `${fmt(range, 2)} × the Moon's alone`);
  }
  return moving;
}

// The water at London, or the size of the tides, over the last while.
function drawGraph(ctx, w, h, col, bg, month) {
  const x0 = 16, x1 = w - 16, y0 = h * 0.7, gh = h * 0.2;
  const span = month ? 30 * 24 : 48;
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + gh / 2);
  ctx.lineTo(x1, y0 + gh / 2);
  ctx.stroke();
  ctx.beginPath();
  const n = month ? 240 : 300;
  for (let i = 0; i <= n; i++) {
    const t = st.hours - span + (span * i) / n;
    const a = angles(t);
    let v;
    if (month) {
      v = Math.hypot(1 + SUN_SHARE * Math.cos(2 * (a.moon - a.sun)), SUN_SHARE * Math.sin(2 * (a.moon - a.sun))) / (1 + SUN_SHARE);
      v = v * 2 - 1;
    } else v = tideAt((LONDON.lon * Math.PI) / 180 + a.spin, a, false);
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + gh / 2 - (v * gh) / 2;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = 1.75;
  ctx.stroke();
  label(ctx, month ? 'Size of the tides, last 30 days' : 'Water at London, last 48 hours', x0, y0 - 10, col['label-secondary'], bg, { size: 12, weight: 500 });
  label(ctx, 'now', x1, y0 + gh + 12, col['label-tertiary'], bg, { size: 11, weight: 500, align: 'right' });
}

const COASTS = [
  { name: 'Open ocean (equilibrium)', m: 0.5 },
  { name: 'Severn Estuary, UK', m: 14 },
  { name: 'Bay of Fundy, Canada', m: 16 },
];
function drawCoasts(ctx, w, h, col, bg) {
  const base = h * 0.82, top = h * 0.16, scale = (base - top) / 17;
  const bw = Math.min(90, w / 6);
  COASTS.forEach((c, i) => {
    const x = w * (0.22 + i * 0.28);
    const bh = c.m * scale;
    ctx.fillStyle = alpha(col['hiw-ink-1'], 0.35);
    ctx.fillRect(x - bw / 2, base - bh, bw, bh);
    ctx.strokeStyle = col['hiw-ink-1'];
    ctx.strokeRect(x - bw / 2, base - bh, bw, bh);
    label(ctx, `${c.m < 1 ? '0.5' : c.m} m`, x, base - bh - 12, col.label, bg, { size: 14, weight: 700, align: 'center' });
    label(ctx, c.name, x, base + 16, col['label-secondary'], bg, { size: 11, weight: 500, align: 'center' });
  });
  // A person, for scale.
  const px = w * 0.06, ph = 1.8 * scale;
  ctx.fillStyle = col['label-secondary'];
  ctx.beginPath();
  ctx.arc(px, base - ph + ph * 0.1, ph * 0.1, 0, TAU);
  ctx.fill();
  ctx.fillRect(px - ph * 0.08, base - ph * 0.78, ph * 0.16, ph * 0.78);
  label(ctx, '1.8 m', px, base + 16, col['label-tertiary'], bg, { size: 11, weight: 500, align: 'center' });
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.bulge.set(id === 'pull' ? 0 : 1, !api.motion);
  api.note({
    pull: 'Moon far closer than it is; arrows show its pull',
    bulges: 'Bulges drawn hundreds of thousands of times too big',
    twice: 'One day in about six seconds',
    sun: "A month in a minute; the Earth's spin not shown",
    coast: 'Spring tidal ranges',
  }[id]);
  if (id === 'twice' || id === 'sun') {
    ui.slider({
      label: id === 'sun' ? 'Day of the month' : 'Hour',
      min: 0,
      max: id === 'sun' ? 29.5 : 48,
      step: id === 'sun' ? 0.1 : 0.25,
      value: id === 'sun' ? (st.hours / 24) % 29.5 : st.hours % 48,
      format: (v) => (id === 'sun' ? `day ${fmt(v, 1)}` : `${fmt(v, 2)} h`),
      onInput(v) {
        st.hours = id === 'sun' ? v * 24 : v;
        api.invalidate();
      },
    });
  }
  const rows = {
    pull: [],
    bulges: [],
    twice: [{ key: 'time', label: 'Time' }, { key: 'level', label: 'Water at London' }],
    sun: [{ key: 'phase', label: 'Moon' }, { key: 'range', label: 'Tides' }],
    coast: [],
  }[id];
  st.readout = api.readout(rows);
  if (id === 'pull') api.status('The near side is pulled hardest, the far side least.');
  if (id === 'bulges') api.status('Take away the pull on the centre, and the Earth is stretched.');
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

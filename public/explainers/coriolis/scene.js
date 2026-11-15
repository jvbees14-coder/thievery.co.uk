// ---------------------------------------------------------------------------
// Why storms spin: the scene.
//
// Chapter 1 rolls a ball straight across a turning table and draws its path
// as seen from the room and as seen by someone riding the table. Chapter 2
// is the same on a turning Earth, where the sideways push is 2Ω·v·sin(lat).
// Chapter 3 lets air flow into a low and turn; chapter 4 is the arithmetic
// for a bath. Positions are in ordinary maths axes (y up) and flipped when
// drawn.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const OMEGA = 7.2921e-5;   // the Earth's turn, radians a second
const st = { ride: false, t: 0, lat: 52, north: true, parcels: [], readout: null };

function seedParcels() {
  st.parcels = Array.from({ length: 70 }, (_, i) => {
    const a = (i / 70) * TAU, r = 0.85 + (i % 5) * 0.03;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, trail: [] };
  });
}
seedParcels();

function drawTurntable(ctx, w, h, col, bg) {
  const cx = w / 2, cy = (h + 50) / 2, R = Math.min(w, h - 80) * 0.42;
  const spin = 0.6, T = (st.t % 3.2);          // the table turns 0.6 rad a second; a roll lasts 3.2 s
  const tableAngle = st.ride ? 0 : spin * st.t;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fillStyle = col['bg-elevated'];
  ctx.fill();
  ctx.strokeStyle = col.separator;
  ctx.stroke();
  // Marks on the table so its turning shows.
  for (let i = 0; i < 8; i++) {
    const a = tableAngle + (i / 8) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.9, cy - Math.sin(a) * R * 0.9);
    ctx.lineTo(cx + Math.cos(a) * R, cy - Math.sin(a) * R);
    ctx.stroke();
  }
  // The ball rolls straight from the middle (in the room's view).
  const path = [];
  for (let s = 0; s <= T; s += 0.03) {
    let x = (s / 3.2) * R * 0.95, y = 0;
    if (st.ride) {
      const a = -spin * s;          // seen from the table, the room turns backwards
      [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    }
    path.push([cx + x, cy - y]);
  }
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  path.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
  ctx.stroke();
  const last = path[path.length - 1];
  ctx.beginPath();
  ctx.arc(...last, 7, 0, TAU);
  ctx.fillStyle = col.accent;
  ctx.fill();
  label(ctx, st.ride ? 'Seen riding the table: it curves' : 'Seen from the room: a straight line', w / 2, h - 16, col['label-secondary'], bg, { size: 12, align: 'center' });
}

function drawLatitude(ctx, w, h, col, bg) {
  // Something moving north at 10 m/s for six hours, deflected by 2Ω·sin(lat).
  const f = 2 * OMEGA * Math.sin((st.lat * Math.PI) / 180);
  let x = 0, y = 0, vx = 0, vy = 10;
  const pts = [[0, 0]];
  for (let s = 0; s < 6 * 3600; s += 60) {
    const ax = f * vy, ay = -f * vx;   // a turn to the right in the north
    vx += ax * 60;
    vy += ay * 60;
    x += vx * 60;
    y += vy * 60;
    pts.push([x, y]);
  }
  // Scaled so the whole path fits, sideways and up.
  const maxX = Math.max(1, ...pts.map((p) => Math.abs(p[0]))), maxY = Math.max(216000, ...pts.map((p) => p[1]));
  const scale = Math.min((h - 140) / maxY, (w / 2 - 30) / maxX), ox = w / 2, oy = h - 50;
  ctx.strokeStyle = col['label-tertiary'];
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox, oy - 216000 * scale);
  ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, 'Straight on', ox + 6, oy - 216000 * scale, col['label-tertiary'], bg, { size: 11 });
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, ox + px * scale, oy - py * scale));
  ctx.stroke();
  label(ctx, 'Six hours heading north at 10 m/s', ox, oy + 20, col['label-secondary'], bg, { size: 11, align: 'center' });
  return Math.hypot(...pts[pts.length - 1].map((v, i) => (i === 0 ? v : 0)));
}

function drawStorm(ctx, w, h, col, bg, dt, api) {
  const cx = w / 2, cy = (h + 50) / 2, R = Math.min(w, h - 80) * 0.45;
  const f = st.north ? 1.2 : -1.2;
  if (api.playing && api.motion) {
    const step = Math.min(dt, 0.05) * 4;
    for (const p of st.parcels) {
      const r = Math.hypot(p.x, p.y) || 1e-6;
      // Pulled towards the low, turned by the Earth's spin, slowed by friction.
      const pull = 1.2;
      p.vx += (-pull * (p.x / r) + f * p.vy - 0.6 * p.vx) * step;
      p.vy += (-pull * (p.y / r) - f * p.vx - 0.6 * p.vy) * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.trail.push([p.x, p.y]);
      if (p.trail.length > 90) p.trail.shift();
      if (r < 0.06) {
        const a = Math.random() * TAU;
        Object.assign(p, { x: Math.cos(a) * 0.9, y: Math.sin(a) * 0.9, vx: 0, vy: 0, trail: [] });
      }
    }
  }
  label(ctx, 'L', cx, cy, col.danger, null, { size: 20, weight: 800, align: 'center' });
  for (const p of st.parcels) {
    ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.6);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    p.trail.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, cx + x * R, cy - y * R));
    ctx.stroke();
  }
  label(ctx, st.north ? 'Northern hemisphere: turns anticlockwise' : 'Southern hemisphere: turns clockwise', w / 2, h - 16, col['label-secondary'], bg, { size: 12, align: 'center' });
}

function drawSink(ctx, w, h, col, bg) {
  // Three pushes on bathwater, on a scale of powers of ten:
  // gravity; a swirl of 1 cm/s round a 10 cm plughole left over from
  // filling (v²/r); and the Earth's spin on water moving at 10 cm/s.
  const x0 = 30, x1 = w - 20, X = (lg) => x0 + ((lg + 6) / 7) * (x1 - x0);
  const cor = 2 * OMEGA * 0.1 * Math.sin((52 * Math.PI) / 180);
  const rows = [
    ['Gravity', 9.81, col['label-secondary']],
    ['A leftover swirl of 1 cm/s round the plughole', 0.01 ** 2 / 0.1, col['hiw-ink-2']],
    ['The Earth’s spin, on water moving at 10 cm/s', cor, col.accent],
  ];
  rows.forEach(([name, a, c], i) => {
    const y = 110 + i * 70;
    label(ctx, name, x0, y - 14, col['label-secondary'], bg, { size: 11 });
    ctx.fillStyle = c;
    ctx.fillRect(x0, y, Math.max(3, X(Math.log10(a)) - x0), 18);
  });
  for (let e = -6; e <= 1; e++) label(ctx, e === 0 ? '1' : e === 1 ? '10' : `1/${fmt(10 ** -e)}`, X(e), 110 + 3 * 70, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Metres per second, each second', x1, 110 + 3 * 70 + 16, col['label-tertiary'], bg, { size: 11, align: 'right' });
  return cor;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (ch === 'turntable') {
    if (api.playing && api.motion) {
      st.t += dt;
      moving = true;
    } else st.t = 3.19;
    drawTurntable(ctx, w, h, col, bg);
  } else if (ch === 'earth') {
    const off = drawLatitude(ctx, w, h, col, bg);
    r?.set('push', `${fmt(2 * OMEGA * Math.sin((st.lat * Math.PI) / 180) * 1e4, 2)} × 10⁻⁴ per second`);
    r?.set('off', `${fmt(off / 1000, 0)} km ${st.lat >= 0 ? 'to the right' : 'to the left'}`);
  } else if (ch === 'storms') {
    drawStorm(ctx, w, h, col, bg, dt, api);
    moving = api.playing && api.motion;
  } else if (ch === 'sinks') {
    const cor = drawSink(ctx, w, h, col, bg);
    r?.set('cor', `${cor.toExponential(1)} m/s²`);
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ turntable: 'A ball rolled across a turning table', earth: 'Moving north on the spinning Earth', storms: 'Air drawn into an area of low pressure', sinks: 'Pushes on water in a bath, compared' }[id]);
  st.readout = null;
  if (id === 'turntable') ui.toggle({ label: 'Ride on the table', checked: st.ride, onChange(v) { st.ride = v; api.invalidate(); } });
  if (id === 'earth') {
    ui.slider({ label: 'Latitude', min: -80, max: 80, value: st.lat, format: (v) => (v === 0 ? 'Equator' : `${Math.abs(v)}° ${v > 0 ? 'north' : 'south'}`), onInput(v) { st.lat = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'push', label: 'Turning rate, 2Ω·sin(latitude)' }, { key: 'off', label: 'Drifted after six hours' }]);
  }
  if (id === 'storms') {
    seedParcels();
    ui.choice({ label: 'Hemisphere', options: [{ id: 'n', label: 'Northern' }, { id: 's', label: 'Southern' }], value: st.north ? 'n' : 's', onChange(v) { st.north = v === 'n'; seedParcels(); api.invalidate(); } });
  }
  if (id === 'sinks') st.readout = api.readout([{ key: 'cor', label: 'The Earth’s push on bathwater' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });


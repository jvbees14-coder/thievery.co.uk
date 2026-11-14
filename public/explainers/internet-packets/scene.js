// ---------------------------------------------------------------------------
// How a message crosses the internet: the scene.
//
// A message from London to New York is cut into packets, and each packet
// is routed on its own across a small network of real places, by the
// quickest path at the moment it is sent (each link's delay is its length
// in glass at two thirds of the speed of light, plus a varying queue). So
// packets take different routes, arrive out of order and are put back in
// order by number. Some can be lost; the sender notices the missing
// acknowledgement and sends them again. The map is Natural Earth's.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, clamp, TAU } from '../engine.js';
import { label, setFace, TOKENS, glow } from '../shared/draw.js';
import { rings } from '../map-projections/art.js';

const D = Math.PI / 180;
const KM_PER_MS = 204;          // light in optical fibre: c divided by about 1.47
const PAYLOAD = 1460;           // bytes of message in a packet (1500 less 40 of headers)
const SLOW = 40;                // drawn this many times slower

const NODES = [
  { id: 'lon', name: 'London', lon: -0.13, lat: 51.51 },
  { id: 'ams', name: 'Amsterdam', lon: 4.9, lat: 52.37 },
  { id: 'par', name: 'Paris', lon: 2.35, lat: 48.86 },
  { id: 'dub', name: 'Dublin', lon: -6.26, lat: 53.35 },
  { id: 'bude', name: 'Bude', lon: -4.54, lat: 50.83 },
  { id: 'hal', name: 'Halifax', lon: -63.57, lat: 44.65 },
  { id: 'bos', name: 'Boston', lon: -71.06, lat: 42.36 },
  { id: 'nyc', name: 'New York', lon: -74.0, lat: 40.71 },
];
const LINKS = [['lon', 'ams'], ['lon', 'par'], ['lon', 'bude'], ['lon', 'dub'], ['ams', 'dub'], ['par', 'bude'], ['bude', 'nyc'], ['bude', 'hal'], ['dub', 'hal'], ['dub', 'bos'], ['ams', 'nyc'], ['hal', 'bos'], ['bos', 'nyc'], ['hal', 'nyc']];

function km(a, b) {
  const p1 = a.lat * D, p2 = b.lat * D, dl = (b.lon - a.lon) * D;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const node = (id) => NODES.find((n) => n.id === id);
const linkMs = LINKS.map(([a, b]) => km(node(a), node(b)) / KM_PER_MS + 0.5);

function route() {
  // Dijkstra on the links' delays, each with a random queue added now.
  const extra = linkMs.map((ms) => ms * (1 + Math.random() * 0.9));
  const dist = new Map(NODES.map((n) => [n.id, Infinity]));
  const prev = new Map();
  dist.set('lon', 0);
  const left = new Set(NODES.map((n) => n.id));
  while (left.size) {
    let u = null;
    for (const id of left) if (u === null || dist.get(id) < dist.get(u)) u = id;
    left.delete(u);
    LINKS.forEach(([a, b], i) => {
      if (a !== u && b !== u) return;
      const v = a === u ? b : a;
      const alt = dist.get(u) + extra[i];
      if (alt < dist.get(v)) {
        dist.set(v, alt);
        prev.set(v, { from: u, ms: extra[i] });
      }
    });
  }
  const path = [];
  let at = 'nyc';
  while (at !== 'lon') {
    const p = prev.get(at);
    path.unshift({ from: p.from, to: at, ms: p.ms });
    at = p.from;
  }
  return path;
}

const st = {
  kb: 12,
  loss: 0,
  clock: 0,
  packets: [],
  nextSeq: 0,
  sendTimer: 0,
  received: new Set(),
  resent: 0,
  lost: 0,
  readout: null,
  gen: 0,
};
const total = () => Math.ceil((st.kb * 1000) / PAYLOAD);

function reset() {
  st.gen++;
  st.packets = [];
  st.nextSeq = 0;
  st.sendTimer = 0;
  st.received = new Set();
  st.resent = 0;
  st.lost = 0;
  st.clock = 0;
}

function send(seq, again) {
  const path = route();
  const tripMs = path.reduce((s, l) => s + l.ms, 0);
  const lostAt = Math.random() < st.loss ? Math.random() * 0.8 + 0.1 : null;
  st.packets.push({ seq, path, tripMs, t: 0, lostAt, done: false, again, fade: 1 });
  if (again) st.resent++;
}

function project(w, h) {
  const lon0 = -80, lon1 = 12, lat0 = 33, lat1 = 62;
  const k = Math.cos(48 * D);
  const sx = w / ((lon1 - lon0) * k), sy = h / (lat1 - lat0);
  const s = Math.min(sx, sy);
  const ox = (w - (lon1 - lon0) * k * s) / 2, oy = (h - (lat1 - lat0) * s) / 2;
  return (lon, lat) => [ox + (lon - lon0) * k * s, oy + (lat1 - lat) * s];
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const run = api.playing && api.motion;
  const mapH = ch === 'split' ? h * 0.55 : h * 0.78;
  const P = project(w, mapH);

  // The land.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, mapH);
  ctx.clip();
  ctx.beginPath();
  for (const r of rings()) {
    r.forEach(([l, p], i) => {
      const [x, y] = P(l / D, p / D);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
  }
  ctx.fillStyle = alpha(col.accent, 0.18);
  ctx.fill('evenodd');
  ctx.restore();

  // The links and places.
  LINKS.forEach(([a, b]) => {
    const p = P(node(a).lon, node(a).lat), q = P(node(b).lon, node(b).lat);
    ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.35);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  });
  for (const n of NODES) {
    const [x, y] = P(n.lon, n.lat);
    ctx.beginPath();
    ctx.arc(x, y, n.id === 'lon' || n.id === 'nyc' ? 5 : 3.5, 0, TAU);
    ctx.fillStyle = n.id === 'lon' || n.id === 'nyc' ? col.label : col['label-secondary'];
    ctx.fill();
    const big = n.id === 'lon' || n.id === 'nyc';
    // Names sit inwards from the edge they are nearest, so none is cut off.
    const left = x < w / 2;
    if (big) label(ctx, n.name, clamp(x, 40, w - 40), y + 16, col.label, bg, { size: 13, align: 'center' });
    else if (w > 520) label(ctx, n.name, x + (left ? 8 : -8), y - 10, col['label-tertiary'], bg, { size: 11, align: left ? 'left' : 'right' });
  }

  // Sending, travelling, arriving.
  if (run && ch !== 'speed') {
    st.clock += dt;
    st.sendTimer -= dt;
    if (st.nextSeq < total() && st.sendTimer <= 0) {
      send(st.nextSeq++, false);
      st.sendTimer = 0.18;
    }
    for (const p of st.packets) {
      if (p.done) {
        p.fade -= dt;
        continue;
      }
      p.t += (dt * 1000) / SLOW;
      if (p.lostAt !== null && p.t >= p.lostAt * p.tripMs) {
        p.done = true;
        p.dead = true;
        st.lost++;
        // No acknowledgement comes back, so after a wait it is sent again.
        const gen = st.gen;
        setTimeout(() => gen === st.gen && send(p.seq, true), 2200);
      } else if (p.t >= p.tripMs) {
        p.done = true;
        st.received.add(p.seq);
      }
    }
    st.packets = st.packets.filter((p) => !p.done || p.fade > 0);
  }
  for (const p of st.packets) {
    let t = Math.min(p.t, p.tripMs);
    let seg = p.path[p.path.length - 1], frac = 1;
    for (const s of p.path) {
      if (t <= s.ms) {
        seg = s;
        frac = t / s.ms;
        break;
      }
      t -= s.ms;
    }
    const a = P(node(seg.from).lon, node(seg.from).lat), b = P(node(seg.to).lon, node(seg.to).lat);
    const x = a[0] + (b[0] - a[0]) * frac, y = a[1] + (b[1] - a[1]) * frac;
    ctx.globalAlpha = p.done ? Math.max(0, p.fade) : 1;
    if (p.dead) label(ctx, '✕', x, y, col.danger, bg, { size: 16, weight: 700, align: 'center' });
    else {
      glow(ctx, x, y, p.again ? col.warning : col['accent-strong'], 3.5, 3, 0.6);
      if (w > 480) label(ctx, String(p.seq + 1), x + 8, y - 8, col['label-secondary'], bg, { size: 10 });
    }
    ctx.globalAlpha = 1;
  }

  // The receiver's queue: packets by number, in order or waiting for a gap.
  const n = total();
  const qy = ch === 'split' ? h * 0.62 : h * 0.84;
  const bw = Math.min(22, (w - 24) / n);
  let inOrder = 0;
  while (st.received.has(inOrder)) inOrder++;
  for (let i = 0; i < n; i++) {
    const x = 12 + i * bw;
    ctx.fillStyle = st.received.has(i) ? (i < inOrder ? col.success : col.warning) : alpha(col['label-secondary'], 0.2);
    ctx.fillRect(x + 1, qy, bw - 2, 14);
  }
  label(ctx, 'New York has: green in order, amber waiting for a gap', 12, qy + 28, col['label-tertiary'], bg, { size: 11, weight: 500 });
  if (ch === 'split') {
    label(ctx, `${fmt(st.kb)} KB message = ${n} packets of up to ${fmt(PAYLOAD)} bytes`, w / 2, h * 0.92, col.label, bg, { size: 13, align: 'center' });
  }

  if (ch === 'speed') {
    const a = P(node('lon').lon, node('lon').lat), b = P(node('nyc').lon, node('nyc').lat);
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = col.danger;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const r = st.readout;
  if (r) {
    const d = km(node('lon'), node('nyc'));
    r.set('packets', fmt(n));
    r.set('arrived', `${fmt(st.received.size)} of ${fmt(n)}`);
    r.set('inorder', fmt(inOrder));
    r.set('lost', fmt(st.lost));
    r.set('resent', fmt(st.resent));
    r.set('dist', `${fmt(d)} km`);
    r.set('oneway', `${fmt(d / KM_PER_MS, 1)} ms`);
    r.set('vacuum', `${fmt(d / 299.792, 1)} ms`);
    r.set('rtt', `${fmt((2 * d) / KM_PER_MS, 1)} ms`);
  }
  if (inOrder === n && n > 0 && ch !== 'speed' && st.clock > 0) api.status('Every packet is in, in order: the message is whole.');
  return run;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  reset();
  st.loss = id === 'loss' ? 0.15 : 0;
  api.note(id === 'speed' ? 'Great-circle distance, light in glass' : `Slowed about ${SLOW} times; queues varied at random`);
  if (id === 'split' || id === 'routes') {
    ui.slider({ label: 'Message size', min: 1, max: 40, value: st.kb, format: (v) => `${v} KB`, onInput: (v) => { st.kb = v; reset(); api.invalidate(); } });
  }
  if (id === 'loss') {
    ui.slider({ label: 'Packets lost', min: 0, max: 40, value: Math.round(st.loss * 100), format: (v) => `${v}%`, onInput: (v) => { st.loss = v / 100; api.invalidate(); } });
  }
  if (id !== 'speed') ui.button({ label: 'Send again', onClick: () => { reset(); api.status(''); api.invalidate(); } });
  const rows = {
    split: [{ key: 'packets', label: 'Packets' }, { key: 'arrived', label: 'Arrived' }],
    routes: [{ key: 'arrived', label: 'Arrived' }, { key: 'inorder', label: 'In order so far' }],
    loss: [{ key: 'lost', label: 'Lost' }, { key: 'resent', label: 'Sent again' }, { key: 'inorder', label: 'In order so far' }],
    speed: [{ key: 'dist', label: 'London to New York' }, { key: 'vacuum', label: 'Light, in a vacuum' }, { key: 'oneway', label: 'Light, in glass' }, { key: 'rtt', label: 'There and back, at best' }],
  }[id];
  st.readout = api.readout(rows);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

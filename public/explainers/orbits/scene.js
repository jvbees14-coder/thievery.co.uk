// ---------------------------------------------------------------------------
// How orbits work: the scene.
//
// The Earth to scale, and a ball fired sideways from 300 km up, its path
// worked out by art.js. Chapters 1 and 4 change the speed; chapter 2 is the
// space station going round; chapter 3 changes the height of a circular
// orbit, out to geostationary.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { R, fly, circular, period } from './art.js';

const H = 300;
const st = { v: 6, flight: null, k: 0, alt: 400, phase: 0, readout: null };

function refly() {
  st.flight = fly(st.v, H, 8 * 3600);
  st.k = 0;
}

function earth(ctx, cx, cy, r, col) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = col['hiw-ink-1'];
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.1, Math.PI * 1.1);
  ctx.fillStyle = alpha(col.back, 0.45);
  ctx.fill();
}

function drawFlight(ctx, w, h, col, bg, api) {
  const f = st.flight;
  // Fit the Earth, or the path if it goes further (up to a limit).
  let reach = R + H;
  for (const [x, y] of f.pts) reach = Math.max(reach, Math.min(Math.hypot(x, y), 6 * R));
  const scale = (Math.min(w, h - 80) * 0.46) / reach;
  const cx = w / 2, cy = 60 + (h - 60) / 2;
  earth(ctx, cx, cy, R * scale, col);
  const n = Math.min(f.pts.length, Math.max(2, Math.floor(st.k)));
  ctx.strokeStyle = f.end === 'ground' ? col.danger : f.end === 'escape' ? col.warning : col.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  f.pts.slice(0, n).forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * scale, cy - y * scale) : ctx.moveTo(cx + x * scale, cy - y * scale)));
  ctx.stroke();
  const [bx, by] = f.pts[n - 1];
  ctx.beginPath();
  ctx.arc(cx + bx * scale, cy - by * scale, 5, 0, TAU);
  ctx.fillStyle = col.label;
  ctx.fill();
  // The launch point.
  ctx.fillStyle = col['label-secondary'];
  ctx.fillRect(cx - 4, cy - (R + H) * scale - 4, 8, 8);
  return n >= f.pts.length;
}

function drawCircle(ctx, w, h, col, bg, alt, dt, api) {
  const r = R + alt;
  const scale = (Math.min(w, h - 80) * 0.44) / Math.max(r, R * 1.15);
  const cx = w / 2, cy = 60 + (h - 60) / 2;
  earth(ctx, cx, cy, R * scale, col);
  ctx.strokeStyle = alpha(col.accent, 0.6);
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, r * scale, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // One orbit every 12 seconds of watching, whatever the height.
  if (api.playing && api.motion) st.phase += (dt / 12) * TAU;
  const x = cx + Math.cos(st.phase) * r * scale, y = cy - Math.sin(st.phase) * r * scale;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, TAU);
  ctx.fillStyle = col.label;
  ctx.fill();
  // Which way it is going, and which way it is falling.
  const len = 40;
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.sin(st.phase) * len, y - Math.cos(st.phase) * len);
  ctx.stroke();
  ctx.strokeStyle = col.danger;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(st.phase) * len * 0.7, y + Math.sin(st.phase) * len * 0.7);
  ctx.stroke();
  label(ctx, 'Going', x - Math.sin(st.phase) * len * 1.2, y - Math.cos(st.phase) * len * 1.2, col.accent, bg, { size: 11, align: 'center' });
  label(ctx, 'Falling', x - Math.cos(st.phase) * len, y + Math.sin(st.phase) * len, col.danger, bg, { size: 11, align: 'center' });
}

const hm = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (ch === 'cannon' || ch === 'escape') {
    if (!st.flight) refly();
    if (api.playing && api.motion) st.k += dt * 120;
    else st.k = st.flight.pts.length;
    const done = drawFlight(ctx, w, h, col, bg, api);
    moving = !done && api.playing && api.motion;
    r?.set('speed', `${fmt(st.v, 1)} km/s`);
    r?.set('end', done ? { ground: 'Falls back', orbit: 'Goes round', escape: 'Escapes' }[st.flight.end] : '…');
  } else {
    const alt = ch === 'falling' ? 400 : st.alt;
    drawCircle(ctx, w, h, col, bg, alt, dt, api);
    moving = api.playing && api.motion;
    r?.set('alt', `${fmt(alt)} km`);
    r?.set('speed', `${fmt(circular(R + alt), 2)} km/s`);
    r?.set('period', hm(period(R + alt)));
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ cannon: 'Fired sideways from 300 km up, no air', falling: 'The space station, 400 km up', height: 'A circular orbit at any height', escape: 'Fired faster still' }[id]);
  if (id === 'cannon' || id === 'escape') {
    st.v = id === 'cannon' ? 6 : 10.5;
    refly();
    ui.slider({
      label: 'Speed',
      min: id === 'cannon' ? 1 : 9,
      max: id === 'cannon' ? 9 : 12,
      step: 0.1,
      value: st.v,
      format: (v) => `${fmt(v, 1)} km/s`,
      onInput(v) { st.v = v; refly(); api.invalidate(); },
    });
    ui.button({ label: 'Fire again', onClick() { st.k = 0; api.invalidate(); } });
    st.readout = api.readout([{ key: 'speed', label: 'Speed' }, { key: 'end', label: 'What happens' }]);
  } else {
    if (id === 'height') {
      const steps = [200, 400, 1000, 2000, 5000, 10000, 20000, 35786, 50000];
      ui.slider({ label: 'Height', min: 0, max: steps.length - 1, value: steps.indexOf(35786), format: (i) => `${fmt(steps[i])} km`, onInput(i) { st.alt = steps[i]; api.invalidate(); } });
      st.alt = 35786;
    }
    st.readout = api.readout([{ key: 'alt', label: 'Height' }, { key: 'speed', label: 'Speed' }, { key: 'period', label: 'Once round' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });


// ---------------------------------------------------------------------------
// How ocean waves travel: the scene.
//
// Linear wave theory. In deep water a wave of length λ travels at
// √(gλ/2π) and the water under it moves in circles that shrink with depth
// as e^(−2πz/λ). In water shallower than about a twentieth of a wavelength,
// every wave travels at √(gd), set by the depth d alone; coming ashore it
// slows, bunches up and grows (Green's law: height ∝ d^(−1/4)) until it
// breaks, roughly when it is 0.78 times as high as the water is deep.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const G = 9.81;
const st = { t: 0, lambda: 60, depth: 4000, readout: null };
const deepSpeed = (L) => Math.sqrt((G * L) / TAU);
const shallowSpeed = (d) => Math.sqrt(G * d);

function water(ctx, w, y0, h, col) {
  const grad = ctx.createLinearGradient(0, y0, 0, y0 + h);
  grad.addColorStop(0, alpha(col['focus-ring'], 0.35));
  grad.addColorStop(1, alpha(col['focus-ring'], 0.08));
  return grad;
}

function drawCircles(ctx, w, h, col, bg) {
  // A strip of sea, the screen showing 200 m across.
  // Heights are drawn much larger than life so the circles can be followed.
  const surf = 150, scale = w / 200, k = TAU / st.lambda, c = deepSpeed(st.lambda), A = 16;
  const yOf = (x) => surf - A * Math.cos(k * x - k * c * st.t);
  ctx.fillStyle = water(ctx, w, surf, h - surf, col);
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let px = 0; px <= w; px += 3) ctx.lineTo(px, yOf(px / scale));
  ctx.lineTo(w, h);
  ctx.fill();
  ctx.strokeStyle = col['focus-ring'];
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let px = 0; px <= w; px += 3) (px ? ctx.lineTo : ctx.moveTo).call(ctx, px, yOf(px / scale));
  ctx.stroke();
  // Floating markers at several depths, each going round its own circle.
  for (let i = 0; i < 6; i++) {
    const x0 = 20 + i * 35;
    for (const z of [0, 8, 20, 40]) {
      const r = A * Math.exp(-k * z), cx = x0 * scale, cy = surf + z * scale * 1.2;
      if (cy > h - 10) continue;
      const ph = k * x0 - k * c * st.t;
      ctx.strokeStyle = alpha(col.label, 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0.5, r), 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + r * Math.sin(ph), cy - r * Math.cos(ph), 3.5, 0, TAU);
      ctx.fillStyle = col.accent;
      ctx.fill();
    }
  }
  label(ctx, 'Gold dots: bits of water. The shape moves on; the water goes round.', w / 2, h - 16, col['label-secondary'], bg, { size: 11, align: 'center' });
}

function drawRace(ctx, w, h, col, bg) {
  const lanes = [[st.lambda, col['hiw-ink-1']], [st.lambda / 4, col['hiw-ink-2']]];
  lanes.forEach(([L, c], i) => {
    const y = 120 + i * ((h - 160) / 2), k = TAU / L, sp = deepSpeed(L), scale = w / 400, A = Math.min(18, L * scale * 0.08);
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let px = 0; px <= w; px += 3) {
      const x = px / scale;
      const yy = y - A * Math.cos(k * x - k * sp * st.t);
      px ? ctx.lineTo(px, yy) : ctx.moveTo(px, yy);
    }
    ctx.stroke();
    // A marker riding one crest.
    const crest = ((sp * st.t) % 400) * scale;
    ctx.beginPath();
    ctx.arc(crest, y - A, 5, 0, TAU);
    ctx.fillStyle = c;
    ctx.fill();
    label(ctx, `${fmt(L, 0)} m apart: ${fmt(sp, 1)} m/s`, 16, y - A - 22, c, bg, { size: 12, weight: 700 });
  });
}

function drawShore(ctx, w, h, col, bg) {
  // Depth falls from 20 m on the left to the beach on the right.
  const sea = 120, bottom = (x) => sea + (h - sea - 20) * (1 - x / w) * 0.9;
  const depthAt = (x) => Math.max(0.3, 20 * (1 - x / w));
  ctx.fillStyle = water(ctx, w, sea, h - sea, col);
  ctx.beginPath();
  ctx.moveTo(0, sea);
  ctx.lineTo(w, sea);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) ctx.lineTo(x, bottom(x));
  ctx.lineTo(w, h);
  ctx.fill();
  // The wave: phase built up step by step, as it slows in shallow water.
  ctx.strokeStyle = col['focus-ring'];
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  let phase = 0, broke = null;
  const metres = 300 / w;
  for (let x = 0; x <= w; x += 2) {
    const d = depthAt(x), c = shallowSpeed(d);
    phase += (TAU / (c * 8)) * 2 * metres * 1;       // a wave every 8 seconds
    const H = 1.0 * (20 / d) ** 0.25;
    if (!broke && H > 0.78 * d) broke = x;
    const y = sea - H * 9 * Math.cos(phase - st.t * (TAU / 8));
    x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    if (broke && x > broke + 10) break;
  }
  ctx.stroke();
  if (broke) label(ctx, 'Breaks here', broke, sea - 40, col.danger, bg, { size: 12, weight: 700, align: 'center' });
  label(ctx, '20 m deep', 10, sea + 20, col['label-tertiary'], bg, { size: 11 });
  label(ctx, 'Beach', w - 10, h - 30, col['label-tertiary'], bg, { size: 11, align: 'right' });
}

function drawTsunami(ctx, w, h, col, bg) {
  const x0 = 60, x1 = w - 20, y0 = 90, y1 = h - 50;
  const X = (d) => x0 + (Math.log10(d) / 4) * (x1 - x0), Y = (v) => y1 - (v / 900) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  for (const v of [0, 300, 600, 900]) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(v));
    ctx.lineTo(x1, Y(v));
    ctx.stroke();
    label(ctx, `${v} km/h`, x0 - 6, Y(v), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  for (const d of [1, 10, 100, 1000, 10000]) label(ctx, `${fmt(d)} m`, X(d), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Depth of the sea', x1, y1 + 30, col['label-tertiary'], bg, { size: 11, align: 'right' });
  ctx.strokeStyle = col.danger;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let e = 0; e <= 4; e += 0.02) (e ? ctx.lineTo : ctx.moveTo).call(ctx, X(10 ** e), Y(shallowSpeed(10 ** e) * 3.6));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(X(st.depth), Y(shallowSpeed(st.depth) * 3.6), 7, 0, TAU);
  ctx.fillStyle = col.accent;
  ctx.fill();
  label(ctx, 'A jet airliner cruises at about 900', x0 + 6, Y(900) + 12, col['label-tertiary'], bg, { size: 11 });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (api.playing && api.motion && ch !== 'tsunami') {
    st.t += dt;
    moving = true;
  }
  if (ch === 'circles') drawCircles(ctx, w, h, col, bg);
  else if (ch === 'speed') drawRace(ctx, w, h, col, bg);
  else if (ch === 'shore') drawShore(ctx, w, h, col, bg);
  else if (ch === 'tsunami') drawTsunami(ctx, w, h, col, bg);
  const c = deepSpeed(st.lambda);
  r?.set('speed', `${fmt(c, 1)} m/s, ${fmt(c * 3.6, 0)} km/h`);
  r?.set('period', `${fmt(st.lambda / c, 1)} s`);
  r?.set('ts', `${fmt(shallowSpeed(st.depth) * 3.6, 0)} km/h`);
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ circles: 'Deep water, seen from the side', speed: 'Two waves in deep water', shore: 'A wave coming ashore', tsunami: 'How fast a wave crosses water of a given depth' }[id]);
  st.readout = null;
  if (id === 'circles' || id === 'speed') {
    ui.slider({ label: 'Distance between crests', min: 10, max: 200, step: 5, value: st.lambda, format: (v) => `${v} m`, onInput(v) { st.lambda = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'speed', label: 'Speed' }, { key: 'period', label: 'A crest passes every' }]);
  } else if (id === 'tsunami') {
    ui.slider({ label: 'Depth', min: 0, max: 4, step: 0.05, value: Math.log10(st.depth), format: (e) => `${fmt(Math.round(10 ** e))} m`, onInput(e) { st.depth = 10 ** e; api.invalidate(); } });
    st.readout = api.readout([{ key: 'ts', label: 'A tsunami travels at' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

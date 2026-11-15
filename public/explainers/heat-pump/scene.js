// ---------------------------------------------------------------------------
// How a heat pump works: the scene.
//
// Chapter 1 is the loop: refrigerant boiling in the outdoor coil, squeezed
// by the compressor, condensing in the indoor coil, and let out through the
// valve, drawn as dots coloured by how hot they are. Chapter 2 is propane's
// boiling point against pressure. Chapter 3 compares where the heat comes
// from with an electric heater's; chapter 4 is how the efficiency falls as
// the weather gets colder and the radiators hotter.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU, clamp } from '../engine.js';
import { label, setFace, arrow, box, mix, TOKENS } from '../shared/draw.js';
import { boilsAt, pressureFor, cop } from './art.js';

const st = { t: 0, p: 4, air: 7, flow: 45, readout: null };

// The loop, as a rounded rectangle; the dots go round it clockwise.
function loopPoint(u, x0, y0, x1, y1) {
  const W = x1 - x0, H = y1 - y0, P = 2 * (W + H);
  let d = ((u % 1) + 1) % 1 * P;
  if (d < W) return [x0 + d, y0, 'top', d / W];
  d -= W;
  if (d < H) return [x1, y0 + d, 'right', d / H];
  d -= H;
  if (d < W) return [x1 - d, y1, 'bottom', d / W];
  d -= W;
  return [x0, y1 - d, 'left', d / H];
}

// Temperature of the refrigerant on each side of the loop, for an outdoor
// coil at about -2 °C and an indoor coil at about 50 °C. The compressor is
// half-way along the top and the valve half-way along the bottom.
function tempAt(side, f) {
  if (side === 'top') return f < 0.5 ? 0 : lerpT(0, 75, (f - 0.5) * 4);
  if (side === 'right') return lerpT(75, 50, f * 1.5);
  if (side === 'bottom') return f < 0.5 ? 50 : -2;
  return lerpT(-2, 0, f);
}
const lerpT = (a, b, f) => a + (b - a) * clamp(f, 0, 1);
const tempColour = (col, t) => (t < 25 ? mix(col['focus-ring'], col.warning, clamp((t + 5) / 30, 0, 1)) : mix(col.warning, col.danger, clamp((t - 25) / 50, 0, 1)));

function drawLoop(ctx, w, h, col, bg) {
  const x0 = w * 0.22, x1 = w * 0.78, y0 = h * 0.24, y1 = h * 0.82;
  // Outside and inside.
  ctx.fillStyle = alpha(col['focus-ring'], 0.08);
  ctx.fillRect(0, 0, w / 2, h);
  ctx.fillStyle = alpha(col.danger, 0.06);
  ctx.fillRect(w / 2, 0, w / 2, h);
  ctx.strokeStyle = col['separator-strong'];
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(w / 2, 50);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, 'Outside', w * 0.25, h - 14, col['label-tertiary'], null, { size: 11, align: 'center' });
  label(ctx, 'Inside', w * 0.75, h - 14, col['label-tertiary'], null, { size: 11, align: 'center' });
  // The pipe.
  ctx.strokeStyle = col.separator;
  ctx.lineWidth = 10;
  box(ctx, x0, y0, x1 - x0, y1 - y0, 10);
  ctx.stroke();
  ctx.lineWidth = 1;
  // The dots of refrigerant.
  const n = 60;
  for (let i = 0; i < n; i++) {
    const u = i / n + st.t;
    const [x, y, side, along] = loopPoint(u, x0, y0, x1, y1);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, TAU);
    ctx.fillStyle = tempColour(col, tempAt(side, along));
    ctx.fill();
  }
  // The parts. Positions as fractions of the way round from top left.
  const part = (u, name, sub, dx, dy) => {
    const [x, y] = loopPoint(u, x0, y0, x1, y1);
    box(ctx, x - 44, y - 15, 88, 30, 8);
    ctx.fillStyle = col['bg-elevated-2'];
    ctx.fill();
    ctx.strokeStyle = col.separator;
    ctx.stroke();
    label(ctx, name, x, y, col.label, null, { size: 12, weight: 700, align: 'center' });
    if (sub) label(ctx, sub, x + dx, y + dy, col['label-secondary'], bg, { size: 11, align: 'center' });
  };
  const W = x1 - x0, H = y1 - y0, P = 2 * (W + H);
  part((W * 0.5) / P, 'Compressor', 'Squeezes it: 75 °C', 0, -28);
  part((W + H * 0.5) / P, 'Indoor coil', '', 0, 0);
  part((2 * W + H - W * 0.5) / P, 'Valve', 'Lets it out: −2 °C', 0, 28);
  part((2 * W + 2 * H - H * 0.5) / P, 'Outdoor coil', '', 0, 0);
  // Heat in from the air, and out into the house.
  const ym = (y0 + y1) / 2;
  for (const dy of [0, 18, 36]) {
    arrow(ctx, 6, ym + 64 + dy, x0 - 8, ym + 64 + dy, alpha(col['focus-ring'], 0.8), 2, 7);
    arrow(ctx, x1 + 8, ym + 64 + dy, w - 6, ym + 64 + dy, alpha(col.danger, 0.8), 2, 7);
  }
  label(ctx, 'Heat from the air, 7 °C', 8, ym + 44, col['label-secondary'], bg, { size: 11 });
  label(ctx, 'Heat into the house', w - 8, ym + 44, col['label-secondary'], bg, { size: 11, align: 'right' });
}

function drawBoiling(ctx, w, h, col, bg) {
  const x0 = 54, x1 = w - 20, y0 = 60, y1 = h - 40;
  const X = (p) => x0 + (p / 22) * (x1 - x0), Y = (t) => y1 - ((t + 45) / 110) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  for (const t of [-40, -20, 0, 20, 40, 60]) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(t));
    ctx.lineTo(x1, Y(t));
    ctx.stroke();
    label(ctx, `${t} °C`, x0 - 6, Y(t), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  for (const p of [1, 5, 10, 15, 20]) label(ctx, `${p}`, X(p), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Pressure, times the air’s', x1, y1 + 28, col['label-tertiary'], bg, { size: 11, align: 'right' });
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let p = 1; p <= 21; p += 0.2) {
    const pt = [X(p), Y(boilsAt(p))];
    p === 1 ? ctx.moveTo(...pt) : ctx.lineTo(...pt);
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  // The two coils' pressures.
  for (const [t, name] of [[-2, 'Outdoor coil'], [50, 'Indoor coil']]) {
    const p = pressureFor(t);
    ctx.beginPath();
    ctx.arc(X(p), Y(t), 5, 0, TAU);
    ctx.fillStyle = tempColour(col, t);
    ctx.fill();
    label(ctx, name, X(p) + 10, Y(t) + 14, col['label-secondary'], bg, { size: 11 });
  }
  const t = boilsAt(st.p);
  ctx.beginPath();
  ctx.arc(X(st.p), Y(t), 8, 0, TAU);
  ctx.strokeStyle = col.label;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineWidth = 1;
}

function drawBars(ctx, w, h, col, bg) {
  const c = cop(7, 45);
  const rows = [
    { name: 'Electric heater', parts: [[1, 'Electricity', col.accent]] },
    { name: 'Heat pump', parts: [[1, 'Electricity', col.accent], [c - 1, 'From the outdoor air', col['focus-ring']]] },
  ];
  const x0 = 20, x1 = w - 20, unit = (x1 - x0) / 4;
  rows.forEach((r, i) => {
    const y = 90 + i * 110;
    label(ctx, r.name, x0, y, col.label, bg, { size: 14, weight: 700 });
    let x = x0;
    for (const [v, name, colr] of r.parts) {
      box(ctx, x, y + 16, v * unit - 2, 34, 6);
      ctx.fillStyle = colr;
      ctx.fill();
      label(ctx, name, x + 6, y + 64, colr, bg, { size: 11 });
      x += v * unit;
    }
    const total = r.parts.reduce((a, p) => a + p[0], 0);
    label(ctx, `${fmt(total, 1)} units of heat`, x1, y, col['label-secondary'], bg, { size: 12, align: 'right' });
  });
  label(ctx, 'Each fed 1 unit of electricity. Outdoors 7 °C, radiators 45 °C.', x0, h - 20, col['label-tertiary'], bg, { size: 11 });
}

function drawCold(ctx, w, h, col, bg) {
  const x0 = 44, x1 = w - 20, y0 = 80, y1 = h - 40;
  const X = (t) => x0 + ((t + 15) / 30) * (x1 - x0), Y = (c) => y1 - (c / 6) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  for (let c = 1; c <= 6; c++) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(c));
    ctx.lineTo(x1, Y(c));
    ctx.stroke();
    label(ctx, String(c), x0 - 6, Y(c), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  for (const t of [-15, -10, -5, 0, 5, 10, 15]) label(ctx, `${t} °C`, X(t), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  const curve = (flow, colr, wdt) => {
    ctx.strokeStyle = colr;
    ctx.lineWidth = wdt;
    ctx.beginPath();
    for (let t = -15; t <= 15; t += 0.5) {
      const pt = [X(t), Y(cop(t, flow))];
      t === -15 ? ctx.moveTo(...pt) : ctx.lineTo(...pt);
    }
    ctx.stroke();
  };
  curve(35, alpha(col['label-tertiary'], 0.5), 1.5);
  curve(55, alpha(col['label-tertiary'], 0.5), 1.5);
  curve(st.flow, col.accent, 3);
  label(ctx, '35 °C radiators', X(15), Y(cop(15, 35)) - 12, col['label-tertiary'], bg, { size: 11, align: 'right' });
  label(ctx, '55 °C', X(15), Y(cop(15, 55)) + 12, col['label-tertiary'], bg, { size: 11, align: 'right' });
  ctx.beginPath();
  ctx.arc(X(st.air), Y(cop(st.air, st.flow)), 7, 0, TAU);
  ctx.fillStyle = col['hiw-ink-1'];
  ctx.fill();
  label(ctx, 'Units of heat per unit of electricity', x0, y0 - 16, col['label-tertiary'], bg, { size: 11 });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (ch === 'cycle') {
    if (api.playing && api.motion) {
      st.t = (st.t + dt * 0.05) % 1;
      moving = true;
    }
    drawLoop(ctx, w, h, col, bg);
  } else if (ch === 'boiling') {
    drawBoiling(ctx, w, h, col, bg);
    r?.set('boils', `${fmt(boilsAt(st.p), 0)} °C`);
  } else if (ch === 'cop') {
    drawBars(ctx, w, h, col, bg);
    r?.set('cop', fmt(cop(7, 45), 1));
  } else if (ch === 'cold') {
    drawCold(ctx, w, h, col, bg);
    r?.set('cop', fmt(cop(st.air, st.flow), 1));
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({
    cycle: 'The refrigerant’s loop, coloured by temperature',
    boiling: 'Propane, the refrigerant in many heat pumps',
    cop: 'Where the heat comes from',
    cold: 'Efficiency through the winter',
  }[id]);
  if (id === 'boiling') {
    ui.slider({
      label: 'Pressure',
      min: 1,
      max: 20,
      step: 0.1,
      value: st.p,
      format: (v) => `${fmt(v, 1)} times the air’s`,
      onInput(v) { st.p = v; api.invalidate(); },
    });
    st.readout = api.readout([{ key: 'boils', label: 'Boils at' }]);
  } else if (id === 'cop') {
    st.readout = api.readout([{ key: 'cop', label: 'Heat per unit of electricity' }]);
  } else if (id === 'cold') {
    ui.slider({ label: 'Outdoors', min: -15, max: 15, value: st.air, format: (v) => `${v} °C`, onInput(v) { st.air = v; api.invalidate(); } });
    ui.slider({ label: 'Radiator water', min: 35, max: 55, value: st.flow, format: (v) => `${v} °C`, onInput(v) { st.flow = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'cop', label: 'Heat per unit of electricity' }]);
  } else {
    st.readout = null;
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });


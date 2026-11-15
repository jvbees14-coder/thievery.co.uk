// ---------------------------------------------------------------------------
// How bridges stand up: the scene.
//
// Chapter 1 is a plain beam sagging under a load, its top squeezed and its
// bottom stretched. Chapter 2 is a Warren truss solved by art.js, every
// member coloured by whether it is stretched or squeezed and as thick as
// the force in it. Chapter 3 hangs a chain and turns it upside down into an
// arch. Chapter 4 is a suspension bridge's cable and how hard it pulls.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, arrow, TOKENS } from '../shared/draw.js';
import { warren, solve } from './art.js';

const TRUSS = warren(6, 0.9);
const st = { span: 10, at: 3, flip: false, sag: 0.1, readout: null };

function key(ctx, x, y, col, bg) {
  ctx.fillStyle = col.danger;
  ctx.fillRect(x, y - 3, 18, 6);
  label(ctx, 'Stretched', x + 24, y, col['label-secondary'], bg, { size: 11 });
  ctx.fillStyle = col['focus-ring'];
  ctx.fillRect(x + 100, y - 3, 18, 6);
  label(ctx, 'Squeezed', x + 124, y, col['label-secondary'], bg, { size: 11 });
}

function drawBeam(ctx, w, h, col, bg) {
  const x0 = 40, x1 = w - 40, y = h * 0.45, len = x1 - x0;
  // The sag grows with the cube of the span; drawn exaggerated.
  const sag = Math.min(h * 0.25, 18 * (st.span / 10) ** 3);
  const curve = (dy, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const u = i / 60, s = sag * Math.sin(Math.PI * u);
      i ? ctx.lineTo(x0 + u * len, y + dy + s) : ctx.moveTo(x0, y + dy + s);
    }
    ctx.stroke();
  };
  curve(-10, col['focus-ring']);
  curve(10, col.danger);
  ctx.fillStyle = col['bg-elevated-2'];
  for (const x of [x0, x1]) {
    ctx.beginPath();
    ctx.moveTo(x, y + 14);
    ctx.lineTo(x - 14, y + 40);
    ctx.lineTo(x + 14, y + 40);
    ctx.fill();
  }
  arrow(ctx, w / 2, y - 80, w / 2, y - 18 + sag, col.label, 3, 12);
  label(ctx, 'Load', w / 2 + 10, y - 70, col.label, bg, { size: 12, weight: 700 });
  key(ctx, x0, h - 30, col, bg);
}

function drawTruss(ctx, w, h, col, bg) {
  const { forces, reactions } = solve(TRUSS, st.at, 1);
  const x0 = 30, x1 = w - 30, unit = (x1 - x0) / TRUSS.n, base = h * 0.62;
  const P = ([x, y]) => [x0 + x * unit, base - y * unit];
  const big = Math.max(...forces.map(Math.abs));
  TRUSS.members.forEach(([a, b], k) => {
    const f = forces[k];
    const [xa, ya] = P(TRUSS.nodes[a]), [xb, yb] = P(TRUSS.nodes[b]);
    ctx.strokeStyle = Math.abs(f) < 1e-6 ? col['label-tertiary'] : f > 0 ? col.danger : col['focus-ring'];
    ctx.lineWidth = 1.5 + (Math.abs(f) / big) * 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(xa, ya);
    ctx.lineTo(xb, yb);
    ctx.stroke();
  });
  ctx.lineCap = 'butt';
  for (const p of TRUSS.nodes) {
    ctx.beginPath();
    ctx.arc(...P(p), 4, 0, TAU);
    ctx.fillStyle = col.label;
    ctx.fill();
  }
  const [lx, ly] = P(TRUSS.nodes[st.at]);
  arrow(ctx, lx, ly + 70, lx, ly + 12, col.label, 3, 10);
  label(ctx, 'Load', lx + 8, ly + 60, col.label, bg, { size: 12, weight: 700 });
  key(ctx, x0, 80, col, bg);
  return { forces, reactions };
}

function drawArch(ctx, w, h, col, bg) {
  const x0 = 50, x1 = w - 50, a = 0.35;
  const top = 100, depth = h * 0.45;
  const cosh = (x) => (Math.exp(x) + Math.exp(-x)) / 2;
  const yOf = (u) => (cosh((u - 0.5) / a) - 1) / (cosh(0.5 / a) - 1);
  ctx.strokeStyle = st.flip ? col['focus-ring'] : col.danger;
  ctx.lineWidth = st.flip ? 10 : 4;
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const u = i / 80, s = 1 - yOf(u);
    const y = st.flip ? top + depth - s * depth : top + s * depth;
    i ? ctx.lineTo(x0 + u * (x1 - x0), y) : ctx.moveTo(x0, y);
  }
  ctx.stroke();
  ctx.fillStyle = col['bg-elevated-2'];
  const yEnd = st.flip ? top + depth : top;
  ctx.fillRect(x0 - 16, yEnd - 6, 24, 12);
  ctx.fillRect(x1 - 8, yEnd - 6, 24, 12);
  label(ctx, st.flip ? 'The same shape upside down: squeezed all along, an arch' : 'A chain hanging under its own weight: stretched all along', w / 2, h - 30, col['label-secondary'], bg, { size: 12, align: 'center' });
}

function drawSuspension(ctx, w, h, col, bg) {
  const x0 = 40, x1 = w - 40, deck = h * 0.72, towerTop = deck - (x1 - x0) * st.sag - 20;
  const span = x1 - x0, d = span * st.sag;
  // Towers.
  ctx.fillStyle = col['focus-ring'];
  ctx.fillRect(x0 - 6, towerTop, 12, deck - towerTop + 30);
  ctx.fillRect(x1 - 6, towerTop, 12, deck - towerTop + 30);
  // The main cable, a parabola, and its hangers.
  ctx.strokeStyle = col.danger;
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const u = i / 60, y = towerTop + 4 * d * u * (1 - u);
    i ? ctx.lineTo(x0 + u * span, y) : ctx.moveTo(x0, y);
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = alpha(col.danger, 0.6);
  for (let i = 1; i < 20; i++) {
    const u = i / 20, y = towerTop + 4 * d * u * (1 - u);
    ctx.beginPath();
    ctx.moveTo(x0 + u * span, y);
    ctx.lineTo(x0 + u * span, deck);
    ctx.stroke();
  }
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fillRect(x0 - 20, deck, span + 40, 8);
  key(ctx, x0, 70, col, bg);
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'beam') {
    drawBeam(ctx, w, h, col, bg);
    r?.set('sag', `${fmt((st.span / 10) ** 3, 2)} times`);
  } else if (ch === 'truss') {
    const { forces } = drawTruss(ctx, w, h, col, bg);
    const t = Math.max(...forces), c = -Math.min(...forces);
    r?.set('t', `${fmt(t, 2)} × the load`);
    r?.set('c', `${fmt(c, 2)} × the load`);
  } else if (ch === 'arch') {
    drawArch(ctx, w, h, col, bg);
  } else if (ch === 'suspension') {
    drawSuspension(ctx, w, h, col, bg);
    r?.set('pull', `${fmt(1 / (8 * st.sag), 2)} × the deck`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ beam: 'A plank across a gap, sag exaggerated', truss: 'A Warren truss, six triangles long', arch: 'A hanging chain', suspension: 'A suspension bridge' }[id]);
  if (id === 'beam') {
    ui.slider({ label: 'Span', min: 5, max: 20, step: 0.5, value: st.span, format: (v) => `${v} m`, onInput(v) { st.span = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'sag', label: 'Sag, against a 10 m span' }]);
  } else if (id === 'truss') {
    ui.slider({ label: 'Where the load is', min: 1, max: 5, value: st.at, format: (v) => `Joint ${v}`, onInput(v) { st.at = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 't', label: 'Hardest stretch' }, { key: 'c', label: 'Hardest squeeze' }]);
  } else if (id === 'arch') {
    st.flip = false;
    ui.toggle({ label: 'Turn it upside down', checked: false, onChange(v) { st.flip = v; api.invalidate(); } });
  } else if (id === 'suspension') {
    ui.slider({ label: 'Cable sag, against the span', min: 0.05, max: 0.2, step: 0.005, value: st.sag, format: (v) => `1 in ${fmt(1 / v, 0)}`, onInput(v) { st.sag = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'pull', label: 'Cable’s sideways pull, against the deck’s weight' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

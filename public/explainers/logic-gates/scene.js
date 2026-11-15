// ---------------------------------------------------------------------------
// How computers add up: the scene.
//
// Chapter 1 is a transistor as a switch; chapter 2 is one gate of the
// reader's choice with its truth table; chapter 3 is four full adders in a
// row adding two numbers, carries and all; chapter 4 is a latch made of two
// NOR gates, which remembers one bit.
// ---------------------------------------------------------------------------

import { mount, alpha, TAU } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';
import { GATES, ripple, latch, drawGate } from './art.js';

const st = { input: 0, gate: 'AND', a: 1, b: 0, A: 6, B: 7, q: 0, S: 0, R: 0, readout: null };

function lamp(ctx, x, y, r, on, col, text) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = on ? col.accent : col['bg-elevated-2'];
  ctx.fill();
  ctx.strokeStyle = on ? col['accent-strong'] : col.separator;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (text != null) label(ctx, String(text), x, y, on ? col['stock-ink'] : col['label-secondary'], null, { size: Math.max(11, r * 0.8), weight: 800, align: 'center', mono: true });
}
function wire(ctx, pts, on, col) {
  ctx.strokeStyle = on ? col.accent : col['label-tertiary'];
  ctx.lineWidth = on ? 3 : 2;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

function drawSwitch(ctx, w, h, col, bg) {
  const cy = h / 2 + 20, x0 = w * 0.15, x1 = w * 0.85;
  // The supply, through the transistor, to the lamp.
  const tx = w / 2;
  wire(ctx, [[x0, cy], [tx - 30, cy]], true, col);
  wire(ctx, [[tx + 30, cy], [x1 - 22, cy]], !!st.input, col);
  label(ctx, 'Power', x0, cy - 18, col['label-secondary'], bg, { size: 12 });
  // The transistor: a channel that conducts only while its gate is on.
  box(ctx, tx - 30, cy - 12, 60, 24, 4);
  ctx.fillStyle = st.input ? alpha(col.accent, 0.4) : col['bg-elevated'];
  ctx.fill();
  ctx.strokeStyle = col['label-secondary'];
  ctx.stroke();
  wire(ctx, [[tx, cy - 12], [tx, cy - 70]], !!st.input, col);
  lamp(ctx, tx, cy - 84, 14, st.input, col, st.input);
  label(ctx, 'Input', tx, cy - 112, col['label-secondary'], bg, { size: 12, align: 'center' });
  label(ctx, 'Transistor', tx, cy + 30, col['label-tertiary'], bg, { size: 11, align: 'center' });
  lamp(ctx, x1, cy, 22, st.input, col, st.input);
  label(ctx, 'Output', x1, cy + 36, col['label-secondary'], bg, { size: 12, align: 'center' });
}

function drawOneGate(ctx, w, h, col, bg) {
  const one = st.gate === 'NOT';
  const out = one ? GATES.NOT(st.a) : GATES[st.gate](st.a, st.b);
  const s = Math.min(110, w * 0.22), gx = w * 0.42 - s / 2, gy = h * 0.34 + 10;
  const ya = one ? gy : gy - s * 0.25, yb = gy + s * 0.25;
  wire(ctx, [[w * 0.12, ya], [gx + (st.gate.includes('OR') ? s * 0.12 : 0), ya]], !!st.a, col);
  lamp(ctx, w * 0.12, ya, 13, st.a, col, st.a);
  label(ctx, 'A', w * 0.12 - 24, ya, col['label-secondary'], bg, { size: 12, align: 'right' });
  if (!one) {
    wire(ctx, [[w * 0.12, yb], [gx + (st.gate.includes('OR') ? s * 0.12 : 0), yb]], !!st.b, col);
    lamp(ctx, w * 0.12, yb, 13, st.b, col, st.b);
    label(ctx, 'B', w * 0.12 - 24, yb, col['label-secondary'], bg, { size: 12, align: 'right' });
  }
  const tip = drawGate(ctx, st.gate, gx, gy, s, col, out);
  label(ctx, st.gate, gx + s * 0.38, gy, col.label, null, { size: 12, weight: 700, align: 'center' });
  wire(ctx, [[tip, gy], [w * 0.84, gy]], !!out, col);
  lamp(ctx, w * 0.86, gy, 18, out, col, out);
  // The truth table.
  const rows = one ? [[0], [1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
  const tx = w / 2 - (one ? 60 : 90), ty = h * 0.62, rh = 24, cw = 60;
  const heads = one ? ['A', 'Out'] : ['A', 'B', 'Out'];
  heads.forEach((t, i) => label(ctx, t, tx + i * cw + cw / 2, ty, col['label-tertiary'], bg, { size: 12, weight: 700, align: 'center' }));
  rows.forEach((r, j) => {
    const o = one ? GATES.NOT(r[0]) : GATES[st.gate](r[0], r[1]);
    const now = r[0] === st.a && (one || r[1] === st.b);
    const y = ty + (j + 1) * rh;
    if (now) {
      box(ctx, tx, y - rh / 2 + 1, heads.length * cw, rh - 2, 4);
      ctx.fillStyle = col['accent-tint'];
      ctx.fill();
    }
    [...r, o].forEach((v, i) => label(ctx, String(v), tx + i * cw + cw / 2, y, i === r.length ? (o ? col.accent : col['label-secondary']) : col.label, null, { size: 13, weight: 700, align: 'center', mono: true }));
  });
}

function drawAdder(ctx, w, h, col, bg) {
  const res = ripple(st.A, st.B);
  const n = 4, left = 52, bw = Math.min(90, (w - left - 20) / n - 14), gap = (w - left - 20 - n * bw) / (n - 1);
  const y = h * 0.45;
  for (let i = 0; i < n; i++) {
    // The lowest bit on the right, as numbers are written.
    const k = n - 1 - i, r = res.bits[k];
    const x = left + i * (bw + gap);
    box(ctx, x, y - 26, bw, 52, 8);
    ctx.fillStyle = col['bg-elevated-2'];
    ctx.fill();
    ctx.strokeStyle = col.separator;
    ctx.stroke();
    label(ctx, 'Full adder', x + bw / 2, y, col['label-secondary'], null, { size: 11, align: 'center' });
    lamp(ctx, x + bw * 0.3, y - 64, 12, r.a, col, r.a);
    lamp(ctx, x + bw * 0.7, y - 64, 12, r.b, col, r.b);
    wire(ctx, [[x + bw * 0.3, y - 52], [x + bw * 0.3, y - 26]], !!r.a, col);
    wire(ctx, [[x + bw * 0.7, y - 52], [x + bw * 0.7, y - 26]], !!r.b, col);
    wire(ctx, [[x + bw / 2, y + 26], [x + bw / 2, y + 52]], !!r.sum, col);
    lamp(ctx, x + bw / 2, y + 66, 14, r.sum, col, r.sum);
    label(ctx, `${2 ** k}s`, x + bw / 2, y + 96, col['label-tertiary'], bg, { size: 11, align: 'center' });
    // The carry, out of the left side into the next adder along.
    const cx0 = x, cx1 = i === 0 ? 22 : x - gap + bw;
    wire(ctx, i === 0 ? [[cx0, y + 12], [cx1, y + 12], [cx1, y + 52]] : [[cx0, y + 12], [cx1, y + 12]], !!r.carry, col);
    if (r.carry && i > 0) label(ctx, 'carry', (cx0 + cx1) / 2, y + 24, col.accent, bg, { size: 10, align: 'center' });
  }
  lamp(ctx, 22, y + 66, 14, res.carry, col, res.carry);
  label(ctx, '16s', 22, y + 96, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Each pair of lamps on top: a bit of A and a bit of B', w / 2, y - 98, col['label-tertiary'], bg, { size: 11, align: 'center' });
  return res;
}

function drawLatch(ctx, w, h, col, bg) {
  const { Q, Qn } = latch(st.S, st.R, st.q);
  st.q = Q;
  const s = Math.min(90, w * 0.18), gx = w * 0.42, y1 = h * 0.34 + 10, y2 = h * 0.66;
  const t1 = drawGate(ctx, 'NOR', gx, y1, s, col, Q);
  const t2 = drawGate(ctx, 'NOR', gx, y2, s, col, Qn);
  // Inputs.
  wire(ctx, [[w * 0.14, y1 - s * 0.25], [gx + s * 0.12, y1 - s * 0.25]], !!st.R, col);
  wire(ctx, [[w * 0.14, y2 + s * 0.25], [gx + s * 0.12, y2 + s * 0.25]], !!st.S, col);
  lamp(ctx, w * 0.12, y1 - s * 0.25, 12, st.R, col, st.R);
  lamp(ctx, w * 0.12, y2 + s * 0.25, 12, st.S, col, st.S);
  label(ctx, 'Reset', w * 0.12, y1 - s * 0.25 - 22, col['label-secondary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Set', w * 0.12, y2 + s * 0.25 + 22, col['label-secondary'], bg, { size: 11, align: 'center' });
  // Each output fed back into the other gate.
  const xr = Math.min(w - 50, t1 + 40);
  wire(ctx, [[t1, y1], [xr, y1]], !!Q, col);
  wire(ctx, [[t2, y2], [xr - 20, y2]], !!Qn, col);
  wire(ctx, [[xr - 10, y1], [xr - 10, y1 + s * 0.45], [gx - 20, y2 - s * 0.5], [gx - 20, y2 - s * 0.25], [gx + s * 0.12, y2 - s * 0.25]], !!Q, col);
  wire(ctx, [[xr - 30, y2], [xr - 30, y2 - s * 0.45], [gx - 34, y1 + s * 0.5], [gx - 34, y1 + s * 0.25], [gx + s * 0.12, y1 + s * 0.25]], !!Qn, col);
  lamp(ctx, xr + 18, y1, 18, Q, col, Q);
  label(ctx, 'Remembered', xr + 18, y1 - 32, col['label-secondary'], bg, { size: 11, align: 'center' });
  return Q;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'switch') drawSwitch(ctx, w, h, col, bg);
  else if (ch === 'gates') drawOneGate(ctx, w, h, col, bg);
  else if (ch === 'adder') {
    const res = drawAdder(ctx, w, h, col, bg);
    r?.set('sum', `${st.A} + ${st.B} = ${res.total}`);
    r?.set('binary', res.total.toString(2).padStart(5, '0'));
  } else if (ch === 'memory') {
    const Q = drawLatch(ctx, w, h, col, bg);
    r?.set('q', String(Q));
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ switch: 'One transistor', gates: 'One gate', adder: 'Four full adders in a row', memory: 'Two NOR gates, each feeding the other' }[id]);
  st.readout = null;
  if (id === 'switch') {
    ui.toggle({ label: 'Input', checked: !!st.input, onChange(v) { st.input = v ? 1 : 0; api.invalidate(); } });
  } else if (id === 'gates') {
    ui.choice({
      label: 'Gate',
      options: ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'].map((g) => ({ id: g, label: g })),
      value: st.gate,
      onChange(v) { st.gate = v; api.invalidate(); },
    });
    ui.toggle({ label: 'Input A', checked: !!st.a, onChange(v) { st.a = v ? 1 : 0; api.invalidate(); } });
    ui.toggle({ label: 'Input B', checked: !!st.b, onChange(v) { st.b = v ? 1 : 0; api.invalidate(); } });
  } else if (id === 'adder') {
    ui.slider({ label: 'A', min: 0, max: 15, value: st.A, onInput(v) { st.A = v; api.invalidate(); } });
    ui.slider({ label: 'B', min: 0, max: 15, value: st.B, onInput(v) { st.B = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'sum', label: 'Sum' }, { key: 'binary', label: 'The lamps read' }]);
  } else if (id === 'memory') {
    const pulse = (k) => {
      st[k] = 1;
      api.invalidate();
      setTimeout(() => { st[k] = 0; api.invalidate(); }, 500);
    };
    ui.button({ label: 'Set', onClick: () => pulse('S') });
    ui.button({ label: 'Reset', onClick: () => pulse('R') });
    st.readout = api.readout([{ key: 'q', label: 'Remembered' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

// ---------------------------------------------------------------------------
// How an electric motor works: the scene.
//
// Everything is seen end on, looking along the motor's shaft: a north pole
// on the left, a south on the right, the field running across between them.
// Chapter 1 is one wire and the push on it; chapters 2 to 4 are a coil,
// simulated by art.js, without and then with a commutator, and then under
// load. The simulation runs fifty times slower than life, so the turning
// can be followed; the readouts are real speeds.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, arrow, box, TOKENS } from '../shared/draw.js';
import { force, stepMotor, rpm } from './art.js';

const SLOW = 50;
const st = {
  I: 2,
  B: 0.5,
  flip: false,
  s: { angle: 0.05, omega: 0 },
  load: 0,
  last: { I: 0, torque: 0, back: 0 },
  readout: null,
};

function poles(ctx, w, h, col, bg) {
  const pw = Math.min(70, w * 0.13), ph = h * 0.5, y = h / 2 - ph / 2 + 16;
  box(ctx, 12, y, pw, ph, 8);
  ctx.fillStyle = alpha(col.danger, 0.75);
  ctx.fill();
  box(ctx, w - 12 - pw, y, pw, ph, 8);
  ctx.fillStyle = alpha(col['focus-ring'], 0.75);
  ctx.fill();
  label(ctx, 'N', 12 + pw / 2, h / 2 + 16, col.stock, null, { size: 22, weight: 800, align: 'center' });
  label(ctx, 'S', w - 12 - pw / 2, h / 2 + 16, col.stock, null, { size: 22, weight: 800, align: 'center' });
  // The field, from north to south.
  ctx.strokeStyle = alpha(col['label-tertiary'], 0.5);
  ctx.lineWidth = 1;
  for (let k = 1; k < 6; k++) {
    const fy = y + (k / 6) * ph;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(18 + pw, fy);
    ctx.lineTo(w - 18 - pw, fy);
    ctx.stroke();
    ctx.setLineDash([]);
    arrow(ctx, w / 2 + (w * 0.3), fy, w / 2 + w * 0.3 + 1, fy, alpha(col['label-tertiary'], 0.6), 1, 6);
  }
  return { cx: w / 2, cy: h / 2 + 16, span: Math.min(w / 2 - pw - 40, ph / 2 - 10) };
}

/** A wire end on: a dot for current coming towards you, a cross for going away. */
function wireEnd(ctx, x, y, r, out, col) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fill();
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (out) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.3, 0, TAU);
    ctx.fillStyle = col.accent;
    ctx.fill();
  } else {
    const d = r * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - d, y - d);
    ctx.lineTo(x + d, y + d);
    ctx.moveTo(x + d, y - d);
    ctx.lineTo(x - d, y + d);
    ctx.stroke();
  }
}

function drawWire(ctx, w, h, col, bg) {
  const { cx, cy } = poles(ctx, w, h, col, bg);
  const out = !st.flip;
  wireEnd(ctx, cx, cy, 16, out, col);
  const F = force(st.B, st.I, 0.1);
  const len = Math.min(h * 0.32, F * 600);
  // Current towards you, field to the right: pushed up.
  if (len > 2) arrow(ctx, cx, cy + (out ? -20 : 20), cx, cy + (out ? -20 - len : 20 + len), col['hiw-ink-1'], 3, 10);
  label(ctx, 'Force', cx + 14, cy + (out ? -24 - len / 2 : 24 + len / 2), col['hiw-ink-1'], bg, { size: 12, weight: 700 });
  label(ctx, out ? 'Current coming towards you' : 'Current going away from you', cx, h - 22, col['label-secondary'], bg, { size: 11, align: 'center' });
}

function drawCoil(ctx, w, h, col, bg, commutator) {
  const { cx, cy, span } = poles(ctx, w, h, col, bg);
  const a = st.s.angle;
  const x1 = cx + Math.cos(a) * span, y1 = cy - Math.sin(a) * span;
  const x2 = cx - Math.cos(a) * span, y2 = cy + Math.sin(a) * span;
  ctx.strokeStyle = alpha(col.accent, 0.5);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // Which way the current runs in each side at this moment.
  const c = Math.cos(a);
  const sign = commutator ? (c >= 0 ? 1 : -1) : 1;
  const I = st.last.I * sign;
  wireEnd(ctx, x1, y1, 13, I >= 0, col);
  wireEnd(ctx, x2, y2, 13, I < 0, col);
  const len = Math.min(span * 0.7, Math.abs(I) * 14);
  if (len > 3) {
    const up = I >= 0 ? -1 : 1;
    arrow(ctx, x1, y1 + up * 16, x1, y1 + up * (16 + len), col['hiw-ink-1'], 2.5, 8);
    arrow(ctx, x2, y2 - up * 16, x2, y2 - up * (16 + len), col['hiw-ink-1'], 2.5, 8);
  }
  // The shaft, and for the commutator the split ring and its brushes.
  if (commutator) {
    const rr = 14;
    for (const half of [0, Math.PI]) {
      ctx.beginPath();
      ctx.arc(cx, cy, rr, -a + half + 0.25 + Math.PI / 2, -a + half + Math.PI - 0.25 + Math.PI / 2);
      ctx.strokeStyle = col.warning;
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    ctx.fillStyle = col['label-secondary'];
    ctx.fillRect(cx - 5, cy - rr - 14, 10, 9);
    ctx.fillRect(cx - 5, cy + rr + 5, 10, 9);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, TAU);
  ctx.fillStyle = col.label;
  ctx.fill();
  label(ctx, 'Slowed down 50 times', w - 14, h - 16, col['label-tertiary'], bg, { size: 11, align: 'right' });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (ch === 'force') {
    drawWire(ctx, w, h, col, bg);
    r?.set('force', `${fmt(force(st.B, st.I, 0.1), 3)} N`);
  } else {
    const commutator = ch !== 'coil';
    if (api.playing && api.motion) {
      const dt = Math.min(f.dt, 0.05) / SLOW, n = 20;
      for (let i = 0; i < n; i++) st.last = stepMotor(st.s, dt / n, { load: ch === 'speed' ? st.load : 0, commutator });
      moving = true;
    } else if (!st.last.I) {
      st.last = stepMotor({ ...st.s }, 0, { commutator });
    }
    drawCoil(ctx, w, h, col, bg, commutator);
    r?.set('speed', `${fmt(Math.abs(rpm(st.s.omega)), 0)} rpm`);
    r?.set('current', `${fmt(Math.abs(st.last.I), 2)} A`);
    r?.set('torque', `${fmt(st.last.torque * 1000, 0)} mN m`);
    r?.set('back', `${fmt(Math.abs(st.last.back), 1)} V`);
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({
    force: 'Looking along a wire, 10 cm of it in the field',
    coil: 'A coil on a shaft, no commutator',
    commutator: 'The same coil, with a commutator',
    speed: 'Running, with something to drive',
  }[id]);
  const restart = () => {
    st.s = { angle: 0.05, omega: 0 };
    st.last = { I: 0, torque: 0, back: 0 };
    api.invalidate();
  };
  if (id === 'force') {
    ui.slider({ label: 'Current', min: 0, max: 5, step: 0.1, value: st.I, format: (v) => `${fmt(v, 1)} A`, onInput(v) { st.I = v; api.invalidate(); } });
    ui.slider({ label: 'Magnet strength', min: 0, max: 1, step: 0.05, value: st.B, format: (v) => `${fmt(v, 2)} tesla`, onInput(v) { st.B = v; api.invalidate(); } });
    ui.toggle({ label: 'Reverse the current', checked: st.flip, onChange(v) { st.flip = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'force', label: 'Push on the wire' }]);
  } else {
    restart();
    if (id === 'speed') {
      ui.slider({
        label: 'Load',
        min: 0,
        max: 0.2,
        step: 0.01,
        value: st.load,
        format: (v) => (v ? `${fmt(v * 1000, 0)} mN m` : 'None'),
        onInput(v) { st.load = v; api.invalidate(); },
      });
    }
    ui.button({ label: 'Start again', onClick: restart });
    const rows = [{ key: 'speed', label: 'Speed' }, { key: 'current', label: 'Current' }];
    if (id === 'speed') rows.push({ key: 'back', label: 'Voltage it makes itself' });
    else rows.push({ key: 'torque', label: 'Turning force' });
    st.readout = api.readout(rows);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

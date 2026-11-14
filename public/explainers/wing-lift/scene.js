// ---------------------------------------------------------------------------
// How a wing makes lift: the scene.
//
// Specks of air are carried by the exact ideal flow round the aerofoil
// (flow.js), drawn so the oncoming air is level and the wing tilts up by
// the angle of attack. Chapter 2 releases a line of specks all at once, so
// the reader can see the air over the top arrive first. Chapter 3 colours
// the pressure (Bernoulli, from the speed). Past about 15 degrees the scene
// stalls the wing by hand, which the ideal flow cannot do, and says so.
// ---------------------------------------------------------------------------

import { mount, fmt, clamp, alpha } from '../engine.js';
import { label, setFace, TOKENS, ramp, arrow } from '../shared/draw.js';
import { outline, circulation, velocity, liftCoefficient, streamlines } from './flow.js';

const D = Math.PI / 180;
const STALL = 15;           // degrees, roughly, for a wing like this
const RHO = 1.225;          // kg/m³, air at sea level
const AREA = 16.2;          // m², the wing of a typical four-seat light aircraft
const MASS = 1100;          // kg, that aircraft fully loaded

const st = {
  alphaDeg: 6,
  speed: 45,                // m/s
  specks: [],
  line: [],
  lineAge: 0,
  field: null,
  fieldFor: null,
  readout: null,
};

const SHAPE = outline(160);

function viewOf(w, h) {
  const s = Math.min(w / 7.2, h / 3.6);
  return { s, cx: w * 0.46, cy: h * 0.5 };
}
// The picture is turned so the oncoming air is level and the wing tilts.
function toScreen(v, a, z) {
  const c = Math.cos(-a), s = Math.sin(-a);
  const x = z[0] * c - z[1] * s, y = z[0] * s + z[1] * c;
  return [v.cx + x * v.s, v.cy - y * v.s];
}
function fromScreen(v, a, px, py) {
  const x = (px - v.cx) / v.s, y = -(py - v.cy) / v.s;
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

function seed(v, a, w, h) {
  st.specks = [];
  for (let i = 0; i < 260; i++) st.specks.push(spawn(v, a, w, h, Math.random() * w));
}
function spawn(v, a, w, h, x = -10) {
  return { z: fromScreen(v, a, x, Math.random() * h), trail: [] };
}

function stalled() {
  return st.alphaDeg > STALL;
}
function cl() {
  const base = liftCoefficient(circulation(st.alphaDeg * D));
  if (!stalled()) return base;
  // Past the stall the real lift falls away; this is a rough shape, not a calculation.
  const peak = liftCoefficient(circulation(STALL * D));
  return peak * Math.max(0.55, 1 - (st.alphaDeg - STALL) * 0.06);
}

function step(sp, a, g, dt) {
  const v1 = velocity(sp.z, a, g);
  if (!v1) return false;
  const mid = [sp.z[0] + v1[0] * dt * 0.5, sp.z[1] + v1[1] * dt * 0.5];
  const v2 = velocity(mid, a, g) || v1;
  sp.z = [sp.z[0] + v2[0] * dt, sp.z[1] + v2[1] * dt];
  return true;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const a = st.alphaDeg * D;
  const g = circulation(Math.min(a, STALL * D));
  const v = viewOf(w, h);
  const run = api.playing && api.motion;
  if (!st.specks.length) seed(v, a, w, h);

  // Pressure, from the speed of the air: blue where it is low.
  if (ch === 'pressure') {
    const key = `${w}x${h}@${st.alphaDeg}`;
    if (st.fieldFor !== key) {
      st.field = [];
      const n = 10;
      for (let y = 0; y < h; y += n) {
        for (let x = 0; x < w; x += n) {
          const vel = velocity(fromScreen(v, a, x + n / 2, y + n / 2), a, g);
          if (!vel) continue;
          const cp = 1 - (vel[0] ** 2 + vel[1] ** 2);
          st.field.push([x, y, cp]);
        }
      }
      st.fieldFor = key;
    }
    for (const [x, y, cp] of st.field) {
      const t = clamp((cp + 1.2) / 2.2, 0, 1);
      ctx.fillStyle = alpha(ramp([col['hiw-ink-1'], col['hiw-scene-bg'], col['hiw-ink-2']], t), 0.55);
      ctx.fillRect(x, y, 10, 10);
    }
  }

  // Streamlines: the paths the air follows. Faint under the moving specks,
  // and the whole picture when nothing moves.
  const lines = streamlines(st.alphaDeg);
  ctx.strokeStyle = alpha(col['hiw-ink-1'], run ? 0.18 : 0.6);
  ctx.lineWidth = 1;
  for (const line of lines) {
    ctx.beginPath();
    line.forEach((z, i) => {
      const q = toScreen(v, a, z);
      if (i) ctx.lineTo(q[0], q[1]);
      else ctx.moveTo(q[0], q[1]);
    });
    ctx.stroke();
  }

  // The specks of air.
  const speedScale = 1.2;
  const flowDt = run ? dt * speedScale : 0;
  ctx.lineCap = 'round';
  for (const sp of st.specks) {
    if (flowDt) {
      if (!step(sp, a, g, flowDt)) Object.assign(sp, spawn(v, a, w, h));
      if (stalled()) {
        const [sx, sy] = toScreen(v, a, sp.z);
        const behind = sx > v.cx - v.s * 0.2 && sy < v.cy + v.s * 0.1 && sy > v.cy - v.s * 1.4;
        if (behind) {
          sp.z[0] -= flowDt * 0.6 + (Math.random() - 0.5) * 0.04;
          sp.z[1] += (Math.random() - 0.5) * 0.08;
        }
      }
      sp.trail.push(sp.z.slice());
      if (sp.trail.length > 10) sp.trail.shift();
    }
    const p = toScreen(v, a, sp.z);
    if (p[0] > w + 20 || p[1] < -40 || p[1] > h + 40) Object.assign(sp, spawn(v, a, w, h));
    if (sp.trail.length > 1) {
      const vel = velocity(sp.z, a, g);
      const speed = vel ? Math.hypot(vel[0], vel[1]) : 1;
      ctx.strokeStyle = ramp([col['label-tertiary'], col['hiw-ink-1'], col['accent-strong']], clamp((speed - 0.6) / 0.9, 0, 1));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      sp.trail.forEach((z, i) => {
        const q = toScreen(v, a, z);
        if (i) ctx.lineTo(q[0], q[1]);
        else ctx.moveTo(q[0], q[1]);
      });
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';

  // Chapter 2: a line of air released together, either side of the wing.
  if (ch === 'myth') {
    if (run) {
      st.lineAge += dt;
      if (st.lineAge > 5 || !st.line.length) {
        st.lineAge = 0;
        st.line = [];
        for (let i = 0; i < 26; i++) st.line.push({ z: fromScreen(v, a, v.cx - v.s * 3.2, v.cy + (i - 12.5) * v.s * 0.07), alive: true });
      }
      for (const sp of st.line) if (sp.alive) sp.alive = step(sp, a, g, dt * speedScale);
    }
    // Drawn as one line, broken where neighbours have been parted by the wing.
    ctx.beginPath();
    st.line.forEach((sp, i) => {
      const q = toScreen(v, a, sp.z);
      const prev = st.line[i - 1];
      const apart = prev && Math.hypot(prev.z[0] - sp.z[0], prev.z[1] - sp.z[1]) > 0.45;
      if (i && !apart) ctx.lineTo(q[0], q[1]);
      else ctx.moveTo(q[0], q[1]);
    });
    ctx.strokeStyle = col.danger;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // The wing.
  ctx.beginPath();
  SHAPE.forEach((z, i) => {
    const q = toScreen(v, a, z);
    if (i) ctx.lineTo(q[0], q[1]);
    else ctx.moveTo(q[0], q[1]);
  });
  ctx.closePath();
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fill();
  ctx.strokeStyle = col.label;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Lift, as an arrow, and the air turned downwards behind the wing.
  if (ch === 'angle' || ch === 'numbers' || ch === 'pressure') {
    const c = cl();
    const len = clamp(c * v.s * 0.55, 0, h * 0.4);
    arrow(ctx, v.cx, v.cy, v.cx, v.cy - len, stalled() ? col.danger : col.success, 3, 10);
    label(ctx, 'Lift', v.cx + 10, v.cy - len + 6, stalled() ? col.danger : col.success, bg, { size: 13 });
  }
  if (ch === 'pressure') {
    label(ctx, 'Lower pressure', v.cx, v.cy - v.s * 0.9, col.label, bg, { size: 12, align: 'center' });
    label(ctx, 'Higher pressure', v.cx, v.cy + v.s * 0.7, col.label, bg, { size: 12, align: 'center' });
  }
  if (stalled()) label(ctx, 'Stalled', w - 20, 70, col.danger, bg, { size: 14, weight: 700, align: 'right' });

  const r = st.readout;
  if (r) {
    const c = cl();
    const lift = 0.5 * RHO * st.speed ** 2 * AREA * c;
    r.set('alpha', `${fmt(st.alphaDeg)}°`);
    r.set('cl', fmt(c, 2));
    r.set('speed', `${fmt(st.speed)} m/s (${fmt(st.speed * 1.94384)} knots)`);
    r.set('lift', `${fmt(lift / 9.81)} kg`);
    r.set('fly', lift / 9.81 >= MASS ? 'Yes' : 'Not yet');
  }
  return run;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.fieldFor = null;
  if (id === 'flow' || id === 'myth') st.alphaDeg = 6;
  api.note({
    flow: 'Ideal flow, worked out exactly',
    myth: 'The red line was released all at once',
    pressure: 'Blue: low pressure. Pink: high.',
    angle: 'Past about 15°, drawn as stalled by hand',
    numbers: 'A 16.2 m² wing, sea-level air',
  }[id]);
  if (id === 'angle' || id === 'numbers' || id === 'pressure') {
    ui.slider({
      label: 'Angle of attack',
      min: -4,
      max: 22,
      value: st.alphaDeg,
      format: (x) => `${x}°`,
      onInput(x) {
        st.alphaDeg = x;
        st.specks = [];
        st.fieldFor = null;
        api.status(x > STALL ? 'Too steep: the air can no longer follow the top of the wing.' : '');
        api.invalidate();
      },
    });
  }
  if (id === 'numbers') {
    ui.slider({ label: 'Airspeed', min: 0, max: 70, value: st.speed, format: (x) => `${x} m/s`, onInput: (x) => { st.speed = x; api.invalidate(); } });
  }
  const rows = {
    flow: [],
    myth: [],
    pressure: [{ key: 'cl', label: 'Lift coefficient' }],
    angle: [{ key: 'alpha', label: 'Angle of attack' }, { key: 'cl', label: 'Lift coefficient' }],
    numbers: [{ key: 'speed', label: 'Airspeed' }, { key: 'lift', label: 'Lift' }, { key: 'fly', label: 'Lifts 1,100 kg?' }],
  }[id];
  st.readout = api.readout(rows);
  st.specks = [];
  st.line = [];
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

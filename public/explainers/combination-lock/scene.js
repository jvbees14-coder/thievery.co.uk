// ---------------------------------------------------------------------------
// How a safe's dial lock works: the scene.
//
// Three wheels on one spindle behind a dial of 100 numbers. The dial turns
// a drive cam; each wheel is pushed by the one before it once their pins
// meet, which leaves each free to lag up to SLACK numbers either way, so
// almost a whole turn of play between neighbours. Positions are kept
// unwrapped (a full turn is 100), and turning is a chain of clamps. The
// combination sets where each wheel's gate is cut; when all three gates
// sit under the fence it drops and the bolt can be drawn.
//
// "Left" here turns the numbers upwards. The far wheel holds the first
// number of the combination and the near wheel the last, as in real locks.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU, clamp } from '../engine.js';
import { label, setFace, arrow, TOKENS } from '../shared/draw.js';
import { plot } from '../shared/plot.js';

const SLACK = 49.5;
const COMBO = [25, 70, 40];
const st = { d: 0, wheels: [0, 0, 0], gates: [0, 0, 0], tol: 1, queue: [], speed: 150, readout: null, last: null, park: 60, found: false };

// Where each gate must be cut so that the standard dialling lines it up.
function cut(combo) {
  const [A, B, C] = combo;
  const m = (x) => ((x % 100) + 100) % 100;
  return [m(C - SLACK), m(B + 2 * SLACK), m(A - 3 * SLACK)];
}

function turnTo(d) {
  st.d = d;
  let prev = d;
  for (let i = 0; i < 3; i++) {
    st.wheels[i] = clamp(st.wheels[i], prev - SLACK, prev + SLACK);
    prev = st.wheels[i];
  }
}

const reading = (v) => ((Math.round(v) % 100) + 100) % 100;
const offGate = (i) => {
  const x = (((st.wheels[i] - st.gates[i]) % 100) + 100) % 100;
  return Math.min(x, 100 - x);
};
const open = () => [0, 1, 2].every((i) => offGate(i) <= st.tol);

/** The moves that dial a combination from wherever the dial is. */
function dialling(combo) {
  const [A, B, C] = combo;
  const up = (from, to, turns) => from + turns * 100 + ((((to - from) % 100) + 100) % 100);
  const down = (from, to, turns) => from - turns * 100 - ((((from - to) % 100) + 100) % 100);
  const a = up(st.d, A, 3);
  const b = down(a, B, 2);
  const c = up(b, C, 1);
  return [a, b, c];
}

function wheel(ctx, x, y, R, angle, gate, col, bg, name, lined) {
  // Angle in numbers: the gate is drawn where it is now, 0 at the top.
  const rot = ((angle - gate) / 100) * TAU;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fillStyle = col['bg-elevated'];
  ctx.fill();
  ctx.strokeStyle = lined ? col.success : col['separator-strong'];
  ctx.lineWidth = lined ? 3 : 1.5;
  ctx.stroke();
  ctx.rotate(-rot);
  ctx.fillStyle = col['hiw-scene-bg'];
  ctx.beginPath();
  ctx.moveTo(-R * 0.12, -R - 2);
  ctx.lineTo(-R * 0.12, -R * 0.78);
  ctx.lineTo(R * 0.12, -R * 0.78);
  ctx.lineTo(R * 0.12, -R - 2);
  ctx.fill();
  // The pin that picks up the next wheel.
  ctx.fillStyle = col.ornament;
  ctx.beginPath();
  ctx.arc(R * 0.55, R * 0.3, R * 0.07, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, R * 0.12, 0, TAU);
  ctx.fillStyle = col['label-tertiary'];
  ctx.fill();
  label(ctx, name, x, y + R + 16, col['label-secondary'], bg, { size: 11, align: 'center' });
}

function dial(ctx, x, y, R, col, bg) {
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fill();
  ctx.strokeStyle = col['separator-strong'];
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let n = 0; n < 100; n += 2) {
    const a = ((n - st.d) / 100) * TAU - Math.PI / 2;
    const long = n % 10 === 0;
    ctx.strokeStyle = long ? col.label : col['label-tertiary'];
    ctx.lineWidth = long ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * R * (long ? 0.78 : 0.86), y + Math.sin(a) * R * (long ? 0.78 : 0.86));
    ctx.lineTo(x + Math.cos(a) * R * 0.95, y + Math.sin(a) * R * 0.95);
    ctx.stroke();
    if (long) label(ctx, `${n}`, x + Math.cos(a) * R * 0.62, y + Math.sin(a) * R * 0.62, col.label, null, { size: 10, align: 'center' });
  }
  // The index mark at the top.
  ctx.fillStyle = col.danger;
  ctx.beginPath();
  ctx.moveTo(x, y - R - 2);
  ctx.lineTo(x - 6, y - R - 12);
  ctx.lineTo(x + 6, y - R - 12);
  ctx.fill();
  label(ctx, `${reading(st.d)}`, x, y, col.label, null, { size: 18, weight: 700, align: 'center' });
}

function geom(w, h) {
  const R = Math.min(w * 0.11, h * 0.16);
  return { dx: w * 0.2, dy: h * 0.42, dR: Math.min(w * 0.15, h * 0.24), R, wy: h * 0.42, wx: [w * 0.47, w * 0.67, w * 0.87] };
}

function lockView(ctx, w, h, col, bg) {
  const g = geom(w, h);
  dial(ctx, g.dx, g.dy, g.dR, col, bg);
  label(ctx, 'The dial', g.dx, g.dy + g.dR + 18, col['label-secondary'], bg, { size: 11, align: 'center' });
  const names = w < 560 ? ['Near', 'Middle', 'Far'] : ['Near wheel (3rd number)', 'Middle (2nd)', 'Far wheel (1st)'];
  for (let i = 0; i < 3; i++) wheel(ctx, g.wx[i], g.wy, g.R, st.wheels[i], st.gates[i], col, bg, names[i], offGate(i) <= st.tol);
  // The fence, resting on the wheels' rims, dropping when every gate is under it.
  const drop = open() ? g.R * 0.2 : 0;
  ctx.fillStyle = open() ? col.success : col.accent;
  ctx.fillRect(g.wx[0] - g.R * 0.14, g.wy - g.R - 16 + drop, g.wx[2] - g.wx[0] + g.R * 0.28, 12);
  label(ctx, open() ? 'The fence drops: open' : 'The fence', (g.wx[0] + g.wx[2]) / 2, g.wy - g.R - 32, open() ? col.success : col.accent, bg, { size: 12, weight: 700, align: 'center' });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let more = false;
  if (st.queue.length) {
    const target = st.queue[0];
    const step = (api.motion ? st.speed * f.dt : Infinity) * Math.sign(target - st.d);
    if (Math.abs(target - st.d) <= Math.abs(step) || !api.motion) {
      turnTo(target);
      st.queue.shift();
      if (!st.queue.length) api.status(open() ? 'All three gates are under the fence. The lock opens.' : `Stopped at ${reading(st.d)}.`);
    } else turnTo(st.d + step);
    more = st.queue.length > 0;
  }
  if (ch === 'odds') {
    const tol = st.tol;
    const per = 100 / (2 * tol + 1);
    const tries = Math.ceil(per) ** 3;
    const g = plot(ctx, col, bg, { x0: 80, x1: w - 20, y0: 80, y1: h - 44 },
      { min: -0.5, max: 3.5, ticks: [0, 1, 2, 3], fmt: (v) => ['Exact', '±1', '±2', '±3'][v], name: 'How close the lock lets you be' },
      { min: 0, max: 6, ticks: [2, 3, 4, 5, 6], fmt: (v) => fmt(10 ** v), name: 'Combinations to try (each line is ten times the last)' });
    for (let t = 0; t <= 3; t++) {
      const n = Math.ceil(100 / (2 * t + 1)) ** 3;
      const bw = (g.X(1) - g.X(0)) * 0.5;
      ctx.fillStyle = t === tol ? col.accent : alpha(col['hiw-ink-1'], 0.6);
      ctx.fillRect(g.X(t) - bw / 2, g.Y(Math.log10(n)), bw, g.Y(0) - g.Y(Math.log10(n)));
      label(ctx, fmt(n), g.X(t), g.Y(Math.log10(n)) - 12, t === tol ? col.accent : col['label-secondary'], bg, { size: 11, align: 'center' });
    }
    r?.set('tries', fmt(tries));
    r?.set('time', `${fmt((tries * 20) / 86400, 1)} days`);
  } else if (ch === 'feel') {
    // Parking the far wheel at each number and reading where the contact
    // points fall: the gap narrows where the gate passes under the fence.
    const g = plot(ctx, col, bg, { x0: 60, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0, max: 100, ticks: [0, 20, 40, 60, 80, 100], name: 'Where the far wheel is parked' },
      { min: 0, max: 4, ticks: [0, 1, 2, 3, 4], name: 'Gap between contact points, in numbers' });
    const gate = COMBO[0];
    const gap = (p) => {
      const x = Math.min(Math.abs(p - gate), 100 - Math.abs(p - gate));
      return 3.2 - 0.5 * Math.exp(-((x / 1.6) ** 2)) + 0.05 * Math.sin(p * 1.7);
    };
    ctx.strokeStyle = col['hiw-ink-1'];
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let p = 0; p <= 100; p += 2.5) (p ? ctx.lineTo : ctx.moveTo).call(ctx, g.X(p), g.Y(gap(p)));
    ctx.stroke();
    for (let p = 0; p <= 100; p += 2.5) {
      ctx.beginPath();
      ctx.arc(g.X(p), g.Y(gap(p)), 3, 0, TAU);
      ctx.fillStyle = Math.abs(p - gate) < 2 ? col.danger : col['hiw-ink-1'];
      ctx.fill();
    }
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.X(st.park), g.y0);
    ctx.lineTo(g.X(st.park), g.y1);
    ctx.stroke();
    if (st.found) label(ctx, 'Narrower here', g.X(gate), g.Y(gap(gate)) + 22, col.danger, bg, { size: 12, weight: 700, align: 'center' });
    r?.set('gap', `${fmt(gap(st.park), 2)} numbers`);
  } else {
    lockView(ctx, w, h, col, bg);
    r?.set('dial', `${reading(st.d)}`);
    r?.set('lined', `${[0, 1, 2].filter((i) => offGate(i) <= st.tol).length} of 3`);
  }
  return more;
}

const handles = {
  list(api) {
    if (api.chapter !== 'wheels' && api.chapter !== 'dialling') return [];
    const c = api.scene.canvas.getBoundingClientRect();
    const g = geom(c.width, c.height);
    const a = -Math.PI / 2 + 0.6;
    return [{ id: 'dial', x: g.dx + Math.cos(a) * g.dR * 0.8, y: g.dy + Math.sin(a) * g.dR * 0.8, r: g.dR, label: 'The dial' }];
  },
  drag(id, x, y, api) {
    const c = api.scene.canvas.getBoundingClientRect();
    const g = geom(c.width, c.height);
    const a = Math.atan2(y - g.dy, x - g.dx);
    if (st.last !== null) {
      let da = a - st.last;
      if (da > Math.PI) da -= TAU;
      if (da < -Math.PI) da += TAU;
      // Turning the dial clockwise brings lower numbers to the top.
      turnTo(st.d - (da / TAU) * 100);
    }
    st.last = a;
    api.invalidate();
  },
  nudge(id, dx, dy, api) {
    turnTo(st.d + Math.sign(dx || -dy) * (Math.abs(dx || dy) > 1 ? 10 : 1));
    api.invalidate();
  },
  changed(s) {
    if (!s.dragging) st.last = null;
  },
};

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  st.queue = [];
  st.gates = cut(COMBO);
  api.note({ wheels: 'A dial of 100 numbers and three wheels', dialling: `This lock’s combination is ${COMBO.join('–')}`, odds: 'Trying every combination at 20 seconds a go', feel: 'The far wheel parked at each number in turn' }[id]);
  if (id === 'wheels' || id === 'dialling') {
    st.tol = 1;
    if (id === 'wheels') {
      st.d = 0;
      st.wheels = [0, 0, 0];
      ui.button({ label: 'Left a full turn', onClick() { st.queue.push(st.d + 100); api.invalidate(); } });
      ui.button({ label: 'Right a full turn', onClick() { st.queue.push(st.d - 100); api.invalidate(); } });
    } else {
      ui.button({ label: `Dial ${COMBO.join('–')}`, onClick() { st.queue.push(...dialling(COMBO)); api.status('Left at least three full turns to 25, right past 70 twice, left past 40 once.'); api.invalidate(); } });
      ui.button({ label: 'Spin it', onClick() { st.queue.push(st.d + 100 * 3 + 37); api.invalidate(); } });
    }
    ui.hint('Drag the dial round, or select it and use the arrow keys.');
    st.readout = api.readout([{ key: 'dial', label: 'Dial' }, { key: 'lined', label: 'Gates under the fence' }]);
  } else if (id === 'odds') {
    ui.choice({
      label: 'Lock opens within',
      options: [{ id: '0', label: 'Exact' }, { id: '1', label: '±1' }, { id: '2', label: '±2' }],
      value: '1',
      onChange(v) { st.tol = Number(v); api.invalidate(); },
    });
    st.tol = 1;
    st.readout = api.readout([{ key: 'tries', label: 'Combinations' }, { key: 'time', label: 'Trying them all' }]);
  } else if (id === 'feel') {
    st.park = 60;
    st.found = false;
    ui.slider({ label: 'Park the far wheel at', min: 0, max: 99, value: st.park, onInput(v) { st.park = v; if (Math.abs(v - COMBO[0]) <= 1) st.found = true; api.invalidate(); } });
    ui.button({ label: 'Show me', onClick() { st.found = true; api.invalidate(); } });
    st.readout = api.readout([{ key: 'gap', label: 'Gap between contact points' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw, handles });

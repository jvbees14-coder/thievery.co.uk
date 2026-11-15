// ---------------------------------------------------------------------------
// When to add the milk: the scene.
//
// Newton's law of cooling: a drink loses heat at a rate proportional to how
// much hotter it is than the room, so T(t) = room + (T0 − room)·e^(−kt).
// The cup here is 250 ml of coffee at 90 °C in a 20 °C room, cooling to
// 60 °C in ten minutes (k ≈ 0.056 a minute); the milk is 50 ml from the
// fridge at 5 °C, mixed in by volume, as if both were water. A real cup
// also loses heat by steam and radiation, which this ignores.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const K = -Math.log(40 / 70) / 10;
const st = { room: 20, wait: 10, k: K, readout: null };
const cool = (T0, t, k = st.k, room = st.room) => room + (T0 - room) * Math.exp(-k * t);
const mix = (coffee, milk) => (coffee * 250 + milk * 50) / 300;

function chart(ctx, w, h, col, bg, curves, marks = []) {
  const x0 = 50, x1 = w - 20, y0 = 80, y1 = h - 40, T = 30;
  const X = (t) => x0 + (t / T) * (x1 - x0), Y = (c) => y1 - (c / 100) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  for (const c of [0, 20, 40, 60, 80, 100]) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(c));
    ctx.lineTo(x1, Y(c));
    ctx.stroke();
    label(ctx, `${c} °C`, x0 - 6, Y(c), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  for (const t of [0, 5, 10, 15, 20, 25, 30]) label(ctx, `${t}`, X(t), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Minutes', x1, y1 + 28, col['label-tertiary'], bg, { size: 11, align: 'right' });
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.6);
  ctx.beginPath();
  ctx.moveTo(x0, Y(st.room));
  ctx.lineTo(x1, Y(st.room));
  ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, 'The room', x1, Y(st.room) - 10, col['hiw-ink-1'], bg, { size: 11, align: 'right' });
  curves.forEach(({ fn, c, name }, i) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let t = 0; t <= T; t += 0.1) (t ? ctx.lineTo : ctx.moveTo).call(ctx, X(t), Y(fn(t)));
    ctx.stroke();
    // Labels at different points along the curves, so two never sit together.
    const at = T * (0.45 + 0.3 * i);
    if (name) label(ctx, name, X(at), Y(fn(at)) - 12, c, bg, { size: 11, weight: 700 });
  });
  for (const [t, c, v] of marks) {
    ctx.beginPath();
    ctx.arc(X(t), Y(v), 6, 0, TAU);
    ctx.fillStyle = c;
    ctx.fill();
  }
  return { X, Y };
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'curve' || ch === 'mug') {
    chart(ctx, w, h, col, bg, [{ fn: (t) => cool(90, t), c: col.danger, name: '' }], [[st.wait, col.danger, cool(90, st.wait)]]);
    r?.set('temp', `${fmt(cool(90, st.wait), 1)} °C`);
    const toDrink = st.room < 60 ? Math.log((90 - st.room) / (60 - st.room)) / st.k : Infinity;
    r?.set('drink', Number.isFinite(toDrink) ? `${fmt(toDrink, 1)} min` : 'Never');
  } else if (ch === 'rate') {
    const g = chart(ctx, w, h, col, bg, [{ fn: (t) => cool(90, t), c: col.danger, name: '' }]);
    // Tangents at a few times: steep when hot, shallow when nearly at room temperature.
    for (const t of [0, 8, 20]) {
      const T0 = cool(90, t), slope = -st.k * (T0 - st.room);
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(g.X(t - 3), g.Y(T0 - slope * 3));
      ctx.lineTo(g.X(t + 3), g.Y(T0 + slope * 3));
      ctx.stroke();
      label(ctx, `${fmt(-slope, 1)} °C a minute`, g.X(t) + 8, g.Y(T0) - 14, col.accent, bg, { size: 11 });
    }
  } else if (ch === 'milk') {
    const now = (t) => cool(mix(90, 5), t);
    const laterThen = (t) => (t < st.wait ? cool(90, t) : cool(mix(cool(90, st.wait), 5), t - st.wait));
    chart(ctx, w, h, col, bg, [
      { fn: now, c: col['hiw-ink-1'], name: 'Milk straight away' },
      { fn: laterThen, c: col.danger, name: 'Milk when you drink it' },
    ], [[st.wait, col['hiw-ink-1'], now(st.wait)], [st.wait, col.danger, mix(cool(90, st.wait), 5)]]);
    r?.set('now', `${fmt(now(st.wait), 1)} °C`);
    r?.set('later', `${fmt(mix(cool(90, st.wait), 5), 1)} °C`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ curve: '250 ml of coffee at 90 °C', rate: 'How fast it cools at each moment', milk: '50 ml of milk from the fridge, now or later', mug: 'Different cups' }[id]);
  st.k = K;
  st.readout = null;
  if (id === 'curve') {
    ui.slider({ label: 'Room temperature', min: 0, max: 35, value: st.room, format: (v) => `${v} °C`, onInput(v) { st.room = v; api.invalidate(); } });
    ui.slider({ label: 'Minutes', min: 0, max: 30, value: st.wait, onInput(v) { st.wait = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'temp', label: 'Coffee' }, { key: 'drink', label: 'Down to 60 °C after' }]);
  } else if (id === 'milk') {
    st.room = 20;
    ui.slider({ label: 'You drink it after', min: 1, max: 30, value: st.wait, format: (v) => `${v} min`, onInput(v) { st.wait = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'now', label: 'Milk straight away' }, { key: 'later', label: 'Milk just before drinking' }]);
  } else if (id === 'mug') {
    st.room = 20;
    const kinds = { thin: K * 1.4, mug: K, lid: K * 0.55, flask: K * 0.08 };
    ui.choice({
      label: 'Cup',
      options: [{ id: 'thin', label: 'Thin cup' }, { id: 'mug', label: 'Mug' }, { id: 'lid', label: 'Mug with a lid' }, { id: 'flask', label: 'Vacuum flask' }],
      value: 'mug',
      onChange(v) { st.k = kinds[v]; api.invalidate(); },
    });
    ui.slider({ label: 'Minutes', min: 0, max: 30, value: st.wait, onInput(v) { st.wait = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'temp', label: 'Coffee' }, { key: 'drink', label: 'Down to 60 °C after' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

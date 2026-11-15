// ---------------------------------------------------------------------------
// How a neural network learns: the scene.
//
// A square of points in two colours, and the regions a model paints them.
// Chapter 1 is one neuron with its weights on sliders; chapter 2 lets it
// learn by the perceptron rule; chapter 3 gives it a pattern no straight
// line can split; chapter 4 trains a small network on it, live.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { seeded, dataset, neuron, perceptronStep, network, forward, train, accuracy } from './art.js';

const st = {
  w: [0.6, 0.5, 0.1], pts: [], kind: 'clusters',
  net: null, epochs: 0, steps: 0, acc: 0,
  sliders: [], readout: null,
};

function load(kind, seed = 4) {
  st.kind = kind;
  st.pts = dataset(kind, 120, seeded(seed));
}

function frame(w, h) {
  const size = Math.min(w - 32, h - 90), x0 = (w - size) / 2, y0 = 70;
  return { size, x0, y0, X: (x) => x0 + ((x + 1) / 2) * size, Y: (y) => y0 + ((1 - y) / 2) * size };
}

function paint(ctx, F, col, predict) {
  const n = 36, cell = F.size / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = -1 + ((i + 0.5) / n) * 2, y = 1 - ((j + 0.5) / n) * 2;
      const p = predict(x, y);
      ctx.fillStyle = alpha(p > 0.5 ? col['hiw-ink-2'] : col['hiw-ink-1'], 0.08 + Math.abs(p - 0.5) * 0.3);
      ctx.fillRect(F.x0 + i * cell, F.y0 + j * cell, cell + 0.5, cell + 0.5);
    }
  }
}

function dots(ctx, F, col, predict) {
  for (const [x, y, c] of st.pts) {
    const ok = (predict(x, y) > 0.5 ? 1 : 0) === c;
    ctx.beginPath();
    ctx.arc(F.X(x), F.Y(y), 4.5, 0, TAU);
    ctx.fillStyle = c ? col['hiw-ink-2'] : col['hiw-ink-1'];
    ctx.fill();
    if (!ok) {
      ctx.strokeStyle = col.label;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function drawLine(ctx, F, col) {
  // w0·x + w1·y + w2 = 0, drawn across the square.
  const [a, b, c] = st.w;
  ctx.save();
  ctx.beginPath();
  ctx.rect(F.x0, F.y0, F.size, F.size);
  ctx.clip();
  ctx.strokeStyle = col.label;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (Math.abs(b) > Math.abs(a)) {
    ctx.moveTo(F.X(-1.2), F.Y((-c + 1.2 * a) / b));
    ctx.lineTo(F.X(1.2), F.Y((-c - 1.2 * a) / b));
  } else {
    ctx.moveTo(F.X((-c + 1.2 * b) / a), F.Y(-1.2));
    ctx.lineTo(F.X((-c - 1.2 * b) / a), F.Y(1.2));
  }
  ctx.stroke();
  ctx.restore();
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const ch = api.chapter;
  const r = st.readout;
  const F = frame(w, h);
  let moving = false;
  let predict;
  if (ch === 'layers') {
    if (api.playing && api.motion && st.acc < 1 && st.epochs < 4000) {
      for (let i = 0; i < 4; i++) train(st.net, st.pts, 1.0);
      st.epochs += 4;
      moving = true;
    }
    predict = (x, y) => forward(st.net, x, y).out;
    st.acc = accuracy((x, y) => (predict(x, y) > 0.5 ? 1 : 0), st.pts);
    r?.set('epochs', fmt(st.epochs));
  } else {
    if (ch === 'learn' && api.playing && api.motion) {
      st.tick = (st.tick || 0) + f.dt;
      if (st.tick > 0.25) {
        st.tick = 0;
        if (perceptronStep(st.w, st.pts, 0.08)) st.steps++;
        st.sliders.forEach((s, i) => s?.set(st.w[i]));
      }
      moving = true;
    }
    predict = (x, y) => neuron(st.w, x, y);
    st.acc = accuracy(predict, st.pts);
    r?.set('steps', fmt(st.steps));
  }
  paint(ctx, F, col, predict);
  if (ch !== 'layers') drawLine(ctx, F, col);
  dots(ctx, F, col, predict);
  ctx.strokeStyle = col.separator;
  ctx.lineWidth = 1;
  ctx.strokeRect(F.x0, F.y0, F.size, F.size);
  r?.set('acc', `${fmt(st.acc * 100, 0)}%`);
  return moving;
}

function weightSliders(ui, api) {
  const names = ['Weight on across', 'Weight on up', 'Bias'];
  st.sliders = names.map((name, i) =>
    ui.slider({ label: name, min: -1, max: 1, step: 0.01, value: st.w[i], format: (v) => fmt(v, 2), onInput(v) { st.w[i] = v; api.invalidate(); } }));
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ neuron: 'One neuron: a straight dividing line', learn: 'The neuron learning', xor: 'A pattern no line can split', layers: 'Eight hidden neurons, trained live' }[id]);
  st.steps = 0;
  if (id === 'neuron' || id === 'learn') load('clusters');
  if (id === 'xor') load('xor');
  if (id === 'learn') st.w = [-0.5, 0.7, 0.4];
  if (id !== 'layers') {
    weightSliders(ui, api);
    if (id === 'learn') ui.button({ label: 'Learn from one mistake', onClick() { if (perceptronStep(st.w, st.pts, 0.08)) st.steps++; st.sliders.forEach((s, i) => s?.set(st.w[i])); api.invalidate(); } });
    st.readout = api.readout(id === 'learn'
      ? [{ key: 'acc', label: 'Points right' }, { key: 'steps', label: 'Corrections' }]
      : [{ key: 'acc', label: 'Points right' }]);
  } else {
    const restart = (kind) => {
      load(kind, 9);
      st.net = network(8, seeded(Math.floor(Math.random() * 1e6)));
      st.epochs = 0;
      st.acc = 0;
      api.invalidate();
    };
    restart(st.kind === 'xor' ? 'xor' : 'circle');
    ui.choice({ label: 'Pattern', options: [{ id: 'circle', label: 'Ring' }, { id: 'xor', label: 'Crossed' }], value: st.kind, onChange: restart });
    ui.button({ label: 'Start training again', onClick() { restart(st.kind); } });
    st.readout = api.readout([{ key: 'acc', label: 'Points right' }, { key: 'epochs', label: 'Passes through the data' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

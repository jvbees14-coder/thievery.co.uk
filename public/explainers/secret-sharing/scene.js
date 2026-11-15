// ---------------------------------------------------------------------------
// How to split a secret: the scene.
//
// A graph whose vertical axis holds the secret. Chapter 1 is a straight
// line through the secret and five shares; chapter 2 keeps one share and
// draws the many lines that pass through it; chapter 3 lets the reader set
// how many shares are needed and hand some in; chapter 4 does the same
// curve's arithmetic modulo 31, where the shares look like noise.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { lagrange, deal } from './art.js';

const N = 5;
const st = { secret: 4.2, k: 2, shares: [], have: new Set([1, 2]), readout: null, chips: null };

function redeal() {
  st.secret = Math.round((1 + Math.random() * 8) * 10) / 10;
  st.shares = deal(st.secret, st.k, N);
}
redeal();

function plot(ctx, w, h, col, bg) {
  const x0 = 50, x1 = w - 20, y0 = 70, y1 = h - 36;
  const have = st.shares.filter(([x]) => st.have.has(x));
  const ys = [0, st.secret, ...have.map((p) => p[1])];
  const top = Math.max(10, ...ys) * 1.1, bot = Math.min(0, ...ys) * 1.1;
  const X = (x) => x0 + (x / (N + 0.5)) * (x1 - x0), Y = (y) => y1 - ((y - bot) / (top - bot)) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X(0), y0);
  ctx.lineTo(X(0), y1);
  ctx.moveTo(x0, Y(0));
  ctx.lineTo(x1, Y(0));
  ctx.stroke();
  label(ctx, 'The secret is here', X(0) + 8, y0 + 4, col['label-tertiary'], bg, { size: 11 });
  for (let x = 1; x <= N; x++) label(ctx, `Person ${x}`, X(x), y1 + 16, col['label-tertiary'], bg, { size: 11, align: 'center' });

  const curve = (pts, c, width) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const x = (i / 120) * (N + 0.4), y = lagrange(pts, x);
      i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y));
    }
    ctx.stroke();
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20);
  ctx.clip();
  let found = null;
  if (have.length >= st.k) {
    const pts = have.slice(0, st.k);
    curve(pts, col.accent, 2.5);
    found = lagrange(pts, 0);
  } else {
    // Every curve through what is held, each with a different secret.
    for (let i = 0; i < 9; i++) {
      const guess = bot + ((i + 0.5) / 9) * (top - bot);
      const extra = [];
      for (let j = 1; extra.length < st.k - 1 - have.length; j++) if (!st.have.has(j)) extra.push([j + 0.5, 2 + ((i * 37 + j * 11) % 7)]);
      curve([[0, guess], ...have, ...extra].slice(0, st.k), alpha(col['hiw-ink-4'], 0.55), 1.5);
    }
  }
  ctx.restore();
  for (const [x, y] of st.shares) {
    const held = st.have.has(x);
    ctx.beginPath();
    ctx.arc(X(x), Y(y), held ? 7 : 5, 0, TAU);
    ctx.fillStyle = held ? col['hiw-ink-1'] : alpha(col['label-tertiary'], 0.4);
    ctx.fill();
  }
  if (found != null) {
    ctx.beginPath();
    ctx.arc(X(0), Y(found), 8, 0, TAU);
    ctx.fillStyle = col.accent;
    ctx.fill();
  }
  return found;
}

// Chapter 4: the same idea modulo 31, with whole numbers.
const P = 31;
const st4 = { secret: 17, coef: [5, 23] };
const f31 = (x) => (st4.secret + st4.coef[0] * x + st4.coef[1] * x * x) % P;
function drawField(ctx, w, h, col, bg) {
  const x0 = 50, x1 = w - 20, y0 = 70, y1 = h - 36;
  const X = (x) => x0 + (x / (N + 0.5)) * (x1 - x0), Y = (y) => y1 - (y / (P - 1)) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  for (let y = 0; y < P; y += 5) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(y));
    ctx.lineTo(x1, Y(y));
    ctx.stroke();
    label(ctx, String(y), x0 - 8, Y(y), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  for (let x = 1; x <= N; x++) {
    ctx.beginPath();
    ctx.arc(X(x), Y(f31(x)), 7, 0, TAU);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
    label(ctx, String(f31(x)), X(x) + 12, Y(f31(x)), col.label, bg, { size: 12, weight: 700 });
    label(ctx, `Person ${x}`, X(x), y1 + 16, col['label-tertiary'], bg, { size: 11, align: 'center' });
  }
  label(ctx, '?', X(0), Y(15), col.accent, null, { size: 22, weight: 800, align: 'center' });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const r = st.readout;
  if (api.chapter === 'field') {
    drawField(ctx, w, h, col, bg);
    return false;
  }
  const found = plot(ctx, w, h, col, bg);
  r?.set('held', `${st.have.size} of ${N}`);
  r?.set('needed', String(st.k));
  r?.set('secret', found == null ? 'Could be anything' : fmt(found, 1));
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ split: 'A straight line: any two shares will do', one: 'One share, and the lines through it', threshold: 'Choose how many shares are needed', field: 'Whole numbers, counted round 31' }[id]);
  if (id === 'field') {
    ui.button({ label: 'New secret', onClick() { st4.secret = Math.floor(Math.random() * P); st4.coef = [1 + Math.floor(Math.random() * 30), 1 + Math.floor(Math.random() * 30)]; api.invalidate(); } });
    st.readout = null;
    api.invalidate();
    return;
  }
  st.k = id === 'threshold' ? Math.max(st.k, 3) : 2;
  st.have = new Set(id === 'one' ? [2] : id === 'split' ? [1, 2, 3, 4, 5] : [1, 3]);
  redeal();
  if (id === 'threshold') {
    ui.slider({ label: 'Shares needed', min: 2, max: 5, value: st.k, onInput(v) { st.k = v; redeal(); api.invalidate(); } });
  }
  if (id !== 'split') {
    ui.chips({
      label: 'Shares handed in',
      items: [1, 2, 3, 4, 5].map((x) => ({ id: x, label: `Person ${x}`, pressed: st.have.has(x) })),
      onChange(x, on) {
        on ? st.have.add(x) : st.have.delete(x);
        api.invalidate();
      },
    });
  }
  ui.button({ label: 'New secret', onClick() { redeal(); api.invalidate(); } });
  st.readout = api.readout([{ key: 'held', label: 'Shares handed in' }, { key: 'needed', label: 'Needed' }, { key: 'secret', label: 'The secret' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

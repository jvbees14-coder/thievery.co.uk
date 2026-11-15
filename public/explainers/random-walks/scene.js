// ---------------------------------------------------------------------------
// Random walks: the scene.
//
// Chapter 1 is one walker tossing a coin for each step, drawn as position
// against time. Chapter 2 is five hundred of them at once and where they
// have got to. Chapter 3 is a gambler betting £1 on red until they double
// their £10 or lose it. Chapter 4 is a walk on a flat grid.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const MAX = 400;
const st = { one: [0], many: [], gamblers: [], fair: false, plane: [[0, 0]], acc: 0, readout: null };
const coin = () => (Math.random() < 0.5 ? 1 : -1);

function reset(ch) {
  st.acc = 0;
  if (ch === 'walk') st.one = [0];
  if (ch === 'spread') st.many = { pos: new Array(500).fill(0), steps: 0 };
  if (ch === 'ruin') st.gamblers = Array.from({ length: 40 }, () => [10]);
  if (ch === 'plane') st.plane = [[0, 0]];
}

function tick(ch) {
  if (ch === 'walk' && st.one.length < MAX) st.one.push(st.one[st.one.length - 1] + coin());
  if (ch === 'spread' && st.many.steps < MAX) {
    st.many.pos = st.many.pos.map((x) => x + coin());
    st.many.steps++;
  }
  if (ch === 'ruin') {
    const p = st.fair ? 0.5 : 18 / 37;
    for (const g of st.gamblers) {
      const v = g[g.length - 1];
      if (v > 0 && v < 20) g.push(v + (Math.random() < p ? 1 : -1));
    }
  }
  if (ch === 'plane' && st.plane.length < 5000) {
    const [x, y] = st.plane[st.plane.length - 1], k = Math.floor(Math.random() * 4);
    st.plane.push(k === 0 ? [x + 1, y] : k === 1 ? [x - 1, y] : k === 2 ? [x, y + 1] : [x, y - 1]);
  }
}

function axes(ctx, x0, x1, y0, y1, col) {
  ctx.strokeStyle = col.separator;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (api.playing && api.motion) {
    st.acc += dt * (ch === 'plane' ? 120 : ch === 'ruin' ? 40 : 30);
    while (st.acc >= 1) {
      tick(ch);
      st.acc -= 1;
    }
    moving = true;
  }

  if (ch === 'walk') {
    const x0 = 40, x1 = w - 16, y0 = 70, y1 = h - 30, mid = (y0 + y1) / 2, k = (y1 - y0) / 2 / 40;
    axes(ctx, x0, x1, y0, y1, col);
    ctx.strokeStyle = alpha(col.separator, 1);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, mid);
    ctx.lineTo(x1, mid);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'Start', x0 - 6, mid, col['label-tertiary'], bg, { size: 11, align: 'right' });
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    st.one.forEach((v, i) => {
      const p = [x0 + (i / MAX) * (x1 - x0), mid - v * k];
      i ? ctx.lineTo(...p) : ctx.moveTo(...p);
    });
    ctx.stroke();
    const v = st.one[st.one.length - 1];
    r?.set('steps', fmt(st.one.length - 1));
    r?.set('where', v === 0 ? 'Back at the start' : `${Math.abs(v)} step${Math.abs(v) === 1 ? '' : 's'} ${v > 0 ? 'up' : 'down'}`);
  } else if (ch === 'spread') {
    const x0 = 20, x1 = w - 20, y1 = h - 40, y0 = 80, mid = (x0 + x1) / 2;
    const span = 70, per = (x1 - x0) / (2 * span);
    const bins = new Map();
    for (const p of st.many.pos) bins.set(p, (bins.get(p) || 0) + 1);
    const top = Math.max(...bins.values());
    for (const [p, c] of bins) {
      if (Math.abs(p) > span) continue;
      const bh = (c / Math.max(top, 25)) * (y1 - y0);
      ctx.fillStyle = col['hiw-ink-1'];
      ctx.fillRect(mid + p * per - per * 0.9, y1 - bh, per * 1.8, bh);
    }
    axes(ctx, x0, x1, y1, y1, col);
    const typ = Math.sqrt(st.many.steps);
    ctx.strokeStyle = col.accent;
    ctx.setLineDash([4, 4]);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(mid + s * typ * per, y0);
      ctx.lineTo(mid + s * typ * per, y1);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    label(ctx, 'Start', mid, y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
    label(ctx, '√steps', mid + typ * per + 6, y0 + 6, col.accent, bg, { size: 11 });
    const rms = Math.sqrt(st.many.pos.reduce((s, x) => s + x * x, 0) / st.many.pos.length);
    r?.set('steps', fmt(st.many.steps));
    r?.set('typical', `${fmt(rms, 1)} steps`);
  } else if (ch === 'ruin') {
    const x0 = 44, x1 = w - 16, y0 = 70, y1 = h - 30;
    const longest = Math.max(30, ...st.gamblers.map((g) => g.length));
    const X = (i) => x0 + (i / longest) * (x1 - x0), Y = (v) => y1 - (v / 20) * (y1 - y0);
    axes(ctx, x0, x1, y0, y1, col);
    for (const [v, name] of [[20, '£20'], [10, '£10'], [0, '£0']]) label(ctx, name, x0 - 6, Y(v), col['label-tertiary'], bg, { size: 11, align: 'right' });
    for (const g of st.gamblers) {
      const end = g[g.length - 1];
      ctx.strokeStyle = alpha(end >= 20 ? col.success : end <= 0 ? col.danger : col['hiw-ink-1'], 0.6);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      g.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
      ctx.stroke();
    }
    const done = st.gamblers.filter((g) => g[g.length - 1] >= 20).length;
    const broke = st.gamblers.filter((g) => g[g.length - 1] <= 0).length;
    r?.set('doubled', `${done} of 40`);
    r?.set('broke', `${broke} of 40`);
    r?.set('odds', st.fair ? '50%' : '37%');
  } else if (ch === 'plane') {
    const cell = Math.max(2, Math.min(w, h - 80) / 90);
    const cx = w / 2, cy = (h + 50) / 2;
    ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.7);
    ctx.lineWidth = Math.max(1, cell * 0.35);
    ctx.beginPath();
    st.plane.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * cell, cy + y * cell) : ctx.moveTo(cx, cy)));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, TAU);
    ctx.fillStyle = col.success;
    ctx.fill();
    const [x, y] = st.plane[st.plane.length - 1];
    ctx.beginPath();
    ctx.arc(cx + x * cell, cy + y * cell, 5, 0, TAU);
    ctx.fillStyle = col.accent;
    ctx.fill();
    const visits = st.plane.slice(1).filter(([a, b]) => !a && !b).length;
    r?.set('steps', fmt(st.plane.length - 1));
    r?.set('home', visits ? `${visits} time${visits === 1 ? '' : 's'}` : 'Not yet');
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({
    walk: 'One walker, a coin toss per step',
    spread: 'Five hundred walkers',
    ruin: 'Forty gamblers, £1 on red each time',
    plane: 'A walk on a flat grid; green is home',
  }[id]);
  reset(id);
  if (id === 'ruin') {
    ui.toggle({ label: 'A fair coin instead of roulette', checked: st.fair, onChange(v) { st.fair = v; reset('ruin'); api.invalidate(); } });
  }
  ui.button({ label: id === 'ruin' ? 'Play it out' : 'Jump ahead', onClick() { for (let i = 0; i < (id === 'ruin' ? 5000 : id === 'plane' ? 1000 : MAX); i++) tick(id); api.invalidate(); } });
  ui.button({ label: 'Start again', onClick() { reset(id); api.invalidate(); } });
  st.readout = api.readout({
    walk: [{ key: 'steps', label: 'Steps' }, { key: 'where', label: 'Now' }],
    spread: [{ key: 'steps', label: 'Steps' }, { key: 'typical', label: 'Typical distance from the start' }],
    ruin: [{ key: 'doubled', label: 'Doubled their money' }, { key: 'broke', label: 'Went broke' }, { key: 'odds', label: 'Chance of doubling' }],
    plane: [{ key: 'steps', label: 'Steps' }, { key: 'home', label: 'Back home' }],
  }[id]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

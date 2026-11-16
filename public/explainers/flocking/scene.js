// ---------------------------------------------------------------------------
// How flocks move without a leader: the scene.
//
// Craig Reynolds' boids. Each bird sees only its neighbours (those within
// a radius, or in chapter 4 its k nearest) and steers by three rules:
// keep clear of any too close (separation), turn towards their average
// heading (alignment), and drift towards their average position
// (cohesion). Speeds are held between limits, and the field wraps round at
// the edges. "Order" is the length of the birds' average heading: 1 when
// all fly the same way, near 0 when they fly every way at once.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { seeded } from '../shared/plot.js';

const N = 140;
const st = { birds: [], sep: false, ali: false, coh: false, k: 0, radius: 60, hawk: null, readout: null, W: 600, H: 400 };

function reset(seed = 4) {
  const r = seeded(seed);
  st.birds = Array.from({ length: N }, () => {
    const a = r() * TAU;
    return { x: r() * st.W, y: r() * st.H, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 };
  });
}

function neighbours(b, i) {
  const out = [];
  for (let j = 0; j < N; j++) {
    if (j === i) continue;
    const o = st.birds[j];
    let dx = o.x - b.x, dy = o.y - b.y;
    if (dx > st.W / 2) dx -= st.W; else if (dx < -st.W / 2) dx += st.W;
    if (dy > st.H / 2) dy -= st.H; else if (dy < -st.H / 2) dy += st.H;
    const d2 = dx * dx + dy * dy;
    if (st.k || d2 < st.radius * st.radius) out.push({ o, dx, dy, d2 });
  }
  if (st.k) {
    out.sort((a, b2) => a.d2 - b2.d2);
    out.length = Math.min(out.length, st.k);
  }
  return out;
}

function step(dt) {
  const next = st.birds.map((b, i) => {
    let ax = 0, ay = 0;
    const near = neighbours(b, i);
    if (near.length) {
      let cx = 0, cy = 0, vx = 0, vy = 0;
      for (const n of near) {
        cx += n.dx; cy += n.dy; vx += n.o.vx; vy += n.o.vy;
        if (st.sep && n.d2 < 18 * 18) { const d = Math.sqrt(n.d2) || 1; ax -= (n.dx / d) * (18 - d) * 9; ay -= (n.dy / d) * (18 - d) * 9; }
      }
      const m = near.length;
      if (st.ali) { ax += (vx / m - b.vx) * 1.4; ay += (vy / m - b.vy) * 1.4; }
      if (st.coh) { ax += (cx / m) * 0.9; ay += (cy / m) * 0.9; }
    }
    if (st.hawk) {
      const dx = b.x - st.hawk.x, dy = b.y - st.hawk.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 120) { ax += (dx / d) * 900; ay += (dy / d) * 900; }
    }
    // A little wander, so nothing settles into a crystal.
    ax += (Math.random() - 0.5) * 40;
    ay += (Math.random() - 0.5) * 40;
    let vx = b.vx + ax * dt, vy = b.vy + ay * dt;
    const s = Math.sqrt(vx * vx + vy * vy) || 1;
    const lim = Math.min(110, Math.max(45, s));
    vx = (vx / s) * lim;
    vy = (vy / s) * lim;
    return { x: (b.x + vx * dt + st.W) % st.W, y: (b.y + vy * dt + st.H) % st.H, vx, vy };
  });
  st.birds = next;
  if (st.hawk) {
    st.hawk.t -= dt;
    st.hawk.x += st.hawk.vx * dt;
    if (st.hawk.t <= 0) st.hawk = null;
  }
}

function order() {
  let x = 0, y = 0;
  for (const b of st.birds) { const s = Math.hypot(b.vx, b.vy) || 1; x += b.vx / s; y += b.vy / s; }
  return Math.hypot(x, y) / N;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const r = st.readout;
  if (st.W !== w || st.H !== h) {
    const sx = w / st.W, sy = h / st.H;
    for (const b of st.birds) { b.x *= sx; b.y *= sy; }
    st.W = w;
    st.H = h;
  }
  const moving = api.playing && api.motion;
  if (moving) {
    const dt = Math.min(f.dt, 1 / 30);
    step(dt);
  }
  for (const b of st.birds) {
    const a = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, 3.5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-5, -3.5);
    ctx.closePath();
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
    ctx.restore();
  }
  if (st.hawk) {
    ctx.beginPath();
    ctx.arc(st.hawk.x, st.hawk.y, 9, 0, TAU);
    ctx.fillStyle = col.danger;
    ctx.fill();
    ctx.strokeStyle = alpha(col.danger, 0.3);
    ctx.beginPath();
    ctx.arc(st.hawk.x, st.hawk.y, 120, 0, TAU);
    ctx.stroke();
  }
  // One bird's neighbourhood, picked out.
  const b0 = st.birds[0];
  ctx.strokeStyle = alpha(col.accent, 0.8);
  ctx.lineWidth = 1;
  for (const n of neighbours(b0, 0)) {
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y);
    ctx.lineTo(b0.x + n.dx, b0.y + n.dy);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(b0.x, b0.y, 6, 0, TAU);
  ctx.fillStyle = col.accent;
  ctx.fill();
  const o = order();
  r?.set('order', `${fmt(o * 100)}%`);
  r?.set('sees', `${neighbours(b0, 0).length}`);
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  st.hawk = null;
  api.note({ wander: 'Each bird on its own', align: 'Keep clear, and match your neighbours’ heading', cohere: 'All three rules', seven: 'Watching a fixed number of neighbours' }[id]);
  const rules = { wander: [false, false, false], align: [true, true, false], cohere: [true, true, true], seven: [true, true, true] }[id];
  [st.sep, st.ali, st.coh] = rules;
  st.k = id === 'seven' ? 7 : 0;
  reset(4);
  if (id === 'align' || id === 'cohere') {
    ui.toggle({ label: 'Keep clear', checked: st.sep, onChange(v) { st.sep = v; api.invalidate(); } });
    ui.toggle({ label: 'Match heading', checked: st.ali, onChange(v) { st.ali = v; api.invalidate(); } });
    if (id === 'cohere') ui.toggle({ label: 'Stay close', checked: st.coh, onChange(v) { st.coh = v; api.invalidate(); } });
  }
  if (id === 'seven') {
    ui.slider({ label: 'Neighbours watched', min: 1, max: 20, value: 7, onInput(v) { st.k = v; api.invalidate(); } });
    ui.button({ label: 'Send a hawk', onClick() { const s = st.birds[0]; st.hawk = { x: s.x - 150, y: s.y, vx: 160, t: 2.5 }; api.invalidate(); } });
  }
  ui.button({ label: 'Scatter them', onClick() { reset(Math.floor(Math.random() * 1e6)); api.invalidate(); } });
  if (!api.motion) ui.button({ label: 'Run 5 seconds', onClick() { for (let i = 0; i < 150; i++) step(1 / 30); api.invalidate(); } });
  st.readout = api.readout([{ key: 'order', label: 'Flying the same way' }, { key: 'sees', label: 'The gold bird watches' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

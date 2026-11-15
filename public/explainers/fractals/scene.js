// ---------------------------------------------------------------------------
// How long is a coastline?: the scene.
//
// Chapter 1 builds Helge von Koch's snowflake (1904) a step at a time.
// Chapter 2 counts its edge and its area. Chapter 3 walks a pair of
// dividers along a made-up fractal coast, as Lewis Fry Richardson measured
// real ones; chapter 4 plots measured length against ruler length on
// logarithmic scales, where the slope gives the fractal dimension.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const st = { level: 3, ruler: 0.08, readout: null };

function koch(level) {
  // Start with a triangle; replace each edge by four, a third as long.
  let pts = [0, 1, 2].map((i) => [Math.cos(-Math.PI / 2 + (i * TAU) / 3), Math.sin(-Math.PI / 2 + (i * TAU) / 3)]);
  for (let l = 0; l < level; l++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      const dx = (bx - ax) / 3, dy = (by - ay) / 3;
      const p1 = [ax + dx, ay + dy], p2 = [ax + 2 * dx, ay + 2 * dy];
      // The point of the new bump, pushed outwards.
      const px = p1[0] + dx * 0.5 + dy * (Math.sqrt(3) / 2), py = p1[1] + dy * 0.5 - dx * (Math.sqrt(3) / 2);
      next.push([ax, ay], p1, [px, py], p2);
    }
    pts = next;
  }
  return pts;
}

// A fixed fractal coast: midpoint displacement, each new bump the same
// share of its segment at every scale, from a seeded generator (mulberry32).
const COAST = (() => {
  let a = 5;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  };
  let pts = [[0, 0.5], [1, 0.5]];
  for (let k = 0; k < 11; k++) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay, r = rand();
      next.push(pts[i], [mx - dy * r, my + dx * r]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
})();
const LOW = Math.min(...COAST.map((p) => p[1])), HIGH = Math.max(...COAST.map((p) => p[1]));

/** Walk dividers of a given span along the coast; return the points stepped on. */
function divide(span) {
  const out = [COAST[0]];
  let [cx, cy] = COAST[0], i = 1;
  while (i < COAST.length) {
    while (i < COAST.length && Math.hypot(COAST[i][0] - cx, COAST[i][1] - cy) < span) i++;
    if (i >= COAST.length) break;
    [cx, cy] = COAST[i];
    out.push([cx, cy]);
  }
  return out;
}

function drawKoch(ctx, w, h, col, level) {
  const pts = koch(level), R = Math.min(w, h - 80) * 0.42, cx = w / 2, cy = (h + 60) / 2;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, cx + x * R, cy + y * R));
  ctx.closePath();
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.2);
  ctx.fill();
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawCoast(ctx, w, h, col, bg) {
  const x0 = 20, x1 = w - 20, y0 = 80, y1 = h - 40, X = (x) => x0 + x * (x1 - x0);
  // Same scale both ways, centred in the height.
  const k = x1 - x0, mid = (y0 + y1) / 2, Y = (y) => mid + (y - (LOW + HIGH) / 2) * k;
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  COAST.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(x), Y(y)));
  ctx.stroke();
  const steps = divide(st.ruler);
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  steps.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(x), Y(y)));
  ctx.stroke();
  for (const [x, y] of steps) {
    ctx.beginPath();
    ctx.arc(X(x), Y(y), 3, 0, TAU);
    ctx.fillStyle = col.accent;
    ctx.fill();
  }
  return steps.length - 1;
}

function drawLogLog(ctx, w, h, col, bg) {
  const x0 = 60, x1 = w - 20, y0 = 80, y1 = h - 40;
  const spans = [0.005, 0.008, 0.012, 0.02, 0.03, 0.05, 0.08, 0.12, 0.2];
  const pts = spans.map((s) => [Math.log10(s), Math.log10((divide(s).length - 1) * s)]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const lx = Math.min(...xs), hx = Math.max(...xs), ly = Math.min(...ys) - 0.05, hy = Math.max(...ys) + 0.05;
  const X = (v) => x0 + ((v - lx) / (hx - lx)) * (x1 - x0), Y = (v) => y1 - ((v - ly) / (hy - ly)) * (y1 - y0);
  // Least-squares slope.
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  ctx.strokeStyle = col.separator;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = alpha(col.accent, 0.6);
  ctx.beginPath();
  ctx.moveTo(X(lx), Y(my + slope * (lx - mx)));
  ctx.lineTo(X(hx), Y(my + slope * (hx - mx)));
  ctx.stroke();
  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.arc(X(x), Y(y), 5, 0, TAU);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
  }
  label(ctx, 'Shorter ruler →', x0, y1 + 16, col['label-tertiary'], bg, { size: 11 });
  label(ctx, '← Longer ruler', x1, y1 + 16, col['label-tertiary'], bg, { size: 11, align: 'right' });
  label(ctx, 'Length measured (on a log scale)', x0, y0 - 14, col['label-tertiary'], bg, { size: 11 });
  return 1 - slope;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'snowflake' || ch === 'length') {
    drawKoch(ctx, w, h, col, st.level);
    r?.set('edges', fmt(3 * 4 ** st.level));
    r?.set('perimeter', `${fmt((4 / 3) ** st.level, 2)} times the triangle’s`);
    const area = 1 + (3 / 5) * (1 - (4 / 9) ** st.level);
    r?.set('area', `${fmt(area, 3)} times the triangle’s`);
  } else if (ch === 'coastline') {
    const n = drawCoast(ctx, w, h, col, bg);
    r?.set('steps', fmt(n));
    r?.set('len', fmt(n * st.ruler * 100, 0));
  } else if (ch === 'dimension') {
    const d = drawLogLog(ctx, w, h, col, bg);
    r?.set('dim', fmt(d, 2));
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ snowflake: 'Each step adds a bump to every edge', length: 'The edge grows, the area doesn’t', coastline: 'A made-up coast, 100 units across', dimension: 'Length against ruler, both on log scales' }[id]);
  st.readout = null;
  if (id === 'snowflake' || id === 'length') {
    ui.slider({ label: 'Steps', min: 0, max: 6, value: st.level, onInput(v) { st.level = v; api.invalidate(); } });
    st.readout = api.readout(id === 'snowflake'
      ? [{ key: 'edges', label: 'Edges' }]
      : [{ key: 'perimeter', label: 'Edge length' }, { key: 'area', label: 'Area' }]);
  } else if (id === 'coastline') {
    ui.slider({ label: 'Ruler', min: 0.5, max: 20, step: 0.5, value: st.ruler * 100, format: (v) => `${v} units`, onInput(v) { st.ruler = v / 100; api.invalidate(); } });
    st.readout = api.readout([{ key: 'steps', label: 'Steps of the ruler' }, { key: 'len', label: 'Coast measured, in units' }]);
  } else if (id === 'dimension') {
    st.readout = api.readout([{ key: 'dim', label: 'Fractal dimension of this coast' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

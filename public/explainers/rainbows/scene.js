// ---------------------------------------------------------------------------
// How a rainbow works: the scene.
//
// Chapters 1 to 3 are one raindrop, drawn large, with rays traced through it
// by art.js: one ray, then many (and a count of where they come out), then
// one ray split into colours. Chapters 4 and 5 are the view from the ground
// with the Sun behind you: the bow is a circle round the point opposite the
// Sun, so it sinks as the Sun climbs.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, arrow, TOKENS } from '../shared/draw.js';
import { SPECTRUM, WATER, bowAngle, bowOf, rayPath } from './art.js';

const st = { b: 0.86, sun: 15, readout: null };
const DEG = Math.PI / 180;

function drawDrop(ctx, cx, cy, R, col) {
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.12);
  ctx.fill();
  ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.7);
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawRay(ctx, cx, cy, R, b, n, k, colr, width, reach) {
  const { pts, dir } = rayPath(cx, cy, R, b, n, k);
  ctx.strokeStyle = colr;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0][0] - reach, pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  const end = pts[pts.length - 1];
  ctx.lineTo(end[0] + Math.cos(dir) * reach, end[1] + Math.sin(dir) * reach);
  ctx.stroke();
  return { end, dir };
}

function dropLayout(w, h) {
  const R = Math.min(w * 0.3, h * 0.3);
  return { cx: w * 0.58, cy: h * 0.46, R };
}

function drawOneRay(ctx, w, h, col, bg) {
  const { cx, cy, R } = dropLayout(w, h);
  drawDrop(ctx, cx, cy, R, col);
  const { end, dir } = drawRay(ctx, cx, cy, R, st.b, WATER, 1, col.accent, 2.5, w);
  arrow(ctx, 12, cy - st.b * R, 40, cy - st.b * R, col.accent, 2, 7);
  label(ctx, 'Sunlight', 12, cy - st.b * R - 14, col.accent, bg, { size: 11 });
  // The angle between the ray going back and the sunlight coming in.
  const back = Math.PI;
  ctx.strokeStyle = col['label-secondary'];
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(end[0], end[1]);
  ctx.lineTo(end[0] - R * 0.9, end[1]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(end[0], end[1], R * 0.6, back, dir, true);
  ctx.stroke();
  label(ctx, `${fmt(bowAngle(st.b), 1)}°`, end[0] - R * 0.7, end[1] + R * 0.22, col.label, bg, { size: 13, weight: 700, align: 'right' });
}

function drawManyRays(ctx, w, h, col, bg) {
  const { cx, cy, R } = dropLayout(w, h * 0.8);
  drawDrop(ctx, cx, cy, R, col);
  const best = bowOf(WATER, 1);
  for (let b = 0.04; b < 1; b += 0.04) {
    const near = best - bowAngle(b) < 1.5;
    drawRay(ctx, cx, cy, R, b, WATER, 1, near ? col.accent : alpha(col['label-tertiary'], 0.55), near ? 2 : 1, w);
  }
  // Where a great many rays come out, counted, weighting each part of the
  // drop by how much sunlight falls on it.
  const bins = new Array(46).fill(0);
  const N = 20000;
  for (let j = 0; j < N; j++) bins[Math.floor(bowAngle(Math.sqrt((j + 0.5) / N)))]++;
  const x0 = 24, x1 = w - 16, y1 = h - 26, top = h * 0.8;
  const max = Math.max(...bins), bw = (x1 - x0) / bins.length;
  bins.forEach((c, i) => {
    const bh = (c / max) * (y1 - top);
    ctx.fillStyle = i === Math.floor(best) ? col.accent : col['hiw-ink-1'];
    ctx.fillRect(x0 + i * bw + 1, y1 - bh, bw - 2, bh);
  });
  for (const a of [0, 10, 20, 30, 42]) label(ctx, `${a}°`, x0 + (a + 0.5) * bw, y1 + 12, a === 42 ? col.accent : col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Where the light comes back out', x0, top - 10, col['label-tertiary'], bg, { size: 11 });
}

function drawColours(ctx, w, h, col, bg) {
  const { cx, cy, R } = dropLayout(w, h);
  drawDrop(ctx, cx, cy, R, col);
  arrow(ctx, 12, cy - st.b * R, 40, cy - st.b * R, col.label, 2, 7);
  label(ctx, 'White sunlight', 12, cy - st.b * R - 14, col.label, bg, { size: 11 });
  // The spread between the colours is drawn five times wider than it is.
  const wide = (n) => WATER + (n - WATER) * 5;
  for (const c of SPECTRUM) drawRay(ctx, cx, cy, R, st.b, wide(c.n), 1, col[c.token], 2, w);
  // The fan, labelled at its ends.
  const red = rayPath(cx, cy, R, st.b, wide(SPECTRUM[0].n), 1), vio = rayPath(cx, cy, R, st.b, wide(SPECTRUM[5].n), 1);
  const L = Math.min(w, h) * 0.55;
  const at = (p) => [p.pts[p.pts.length - 1][0] + Math.cos(p.dir) * L, p.pts[p.pts.length - 1][1] + Math.sin(p.dir) * L];
  const [rx, ry] = at(red), [vx, vy] = at(vio);
  label(ctx, 'Red', Math.max(30, rx), Math.min(h - 12, ry) + 10, col.danger, bg, { size: 12, weight: 700, align: 'center' });
  label(ctx, 'Violet', Math.max(30, vx), Math.min(h - 12, vy) - 10, col['hiw-ink-4'], bg, { size: 12, weight: 700, align: 'center' });
}

function drawSky(ctx, w, h, col, bg, second) {
  const horizon = h * 0.72;
  const pxPerDeg = Math.min(w / 120, (horizon - 50) / 56);
  const ax = w / 2, ay = horizon + st.sun * pxPerDeg;      // the point opposite the Sun
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, horizon);
  ctx.clip();
  // The sky inside the bow is brighter: every drop in there sends some light back.
  ctx.beginPath();
  ctx.arc(ax, ay, 40.6 * pxPerDeg, 0, TAU);
  ctx.fillStyle = alpha(col.label, 0.07);
  ctx.fill();
  // Each band is widened by the Sun's own radius, a quarter of a degree, as real bows are.
  const band = (colours, inner, outer) => {
    inner -= 0.25;
    outer += 0.25;
    const k = colours.length, step = (outer - inner) / k;
    colours.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(ax, ay, (inner + (i + 0.5) * step) * pxPerDeg, 0, TAU);
      ctx.strokeStyle = col[c.token];
      ctx.lineWidth = step * pxPerDeg + 0.6;
      ctx.stroke();
    });
  };
  // The first bow: violet inside, red outside.
  band([...SPECTRUM].reverse(), bowOf(SPECTRUM[5].n), bowOf(SPECTRUM[0].n));
  if (second) {
    // The second: red inside, violet outside, and fainter.
    ctx.globalAlpha = 0.55;
    band(SPECTRUM, bowOf(SPECTRUM[0].n, 2), bowOf(SPECTRUM[5].n, 2));
    ctx.globalAlpha = 1;
    label(ctx, 'Darker band', ax, ay - 46.5 * pxPerDeg, col['label-secondary'], null, { size: 11, align: 'center' });
  }
  ctx.restore();
  // The ground, and you.
  ctx.fillStyle = col['bg-elevated'];
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.strokeStyle = col['separator-strong'];
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(w, horizon);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ax, ay, 4, 0, TAU);
  ctx.fillStyle = col['label-tertiary'];
  ctx.fill();
  label(ctx, 'Opposite the Sun', ax, ay + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, `The Sun is ${st.sun}° up, behind you`, 16, h - 16, col['label-secondary'], bg, { size: 11 });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'drop') {
    drawOneRay(ctx, w, h, col, bg);
    r?.set('angle', `${fmt(bowAngle(st.b), 1)}°`);
  } else if (ch === 'angle') {
    drawManyRays(ctx, w, h, col, bg);
    r?.set('most', `${fmt(bowOf(WATER, 1), 1)}°`);
  } else if (ch === 'colours') {
    drawColours(ctx, w, h, col, bg);
    r?.set('red', `${fmt(bowAngle(st.b, SPECTRUM[0].n), 1)}°`);
    r?.set('violet', `${fmt(bowAngle(st.b, SPECTRUM[5].n), 1)}°`);
  } else if (ch === 'bow' || ch === 'double') {
    drawSky(ctx, w, h, col, bg, ch === 'double');
    const top = bowOf(SPECTRUM[0].n) - st.sun;
    r?.set('top', top > 0 ? `${fmt(top, 0)}°` : 'Below the horizon');
    const top2 = bowOf(SPECTRUM[5].n, 2) - st.sun;
    r?.set('top2', top2 > 0 ? `${fmt(top2, 0)}°` : 'Below the horizon');
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({
    drop: 'One raindrop, drawn large',
    angle: 'Rays across the whole drop',
    colours: 'One ray of white light; the colours’ spread drawn 5 times wider',
    bow: 'Looking away from the Sun',
    double: 'Looking away from the Sun',
  }[id]);
  if (id === 'drop' || id === 'colours') {
    ui.slider({
      label: 'Where the ray strikes',
      min: 0.02,
      max: 0.99,
      step: 0.01,
      value: st.b,
      format: (v) => (v < 0.15 ? 'Middle' : v > 0.9 ? 'Edge' : `${Math.round(v * 100)}% out`),
      onInput(v) {
        st.b = v;
        api.invalidate();
      },
    });
  }
  if (id === 'bow' || id === 'double') {
    ui.slider({
      label: 'Height of the Sun',
      min: 0,
      max: 60,
      value: st.sun,
      format: (v) => `${v}°`,
      onInput(v) {
        st.sun = v;
        api.invalidate();
      },
    });
  }
  st.readout = api.readout({
    drop: [{ key: 'angle', label: 'Comes back at' }],
    angle: [{ key: 'most', label: 'Most light comes back at' }],
    colours: [{ key: 'red', label: 'Red comes back at' }, { key: 'violet', label: 'Violet comes back at' }],
    bow: [{ key: 'top', label: 'Top of the bow, above the horizon' }],
    double: [{ key: 'top', label: 'First bow, above the horizon' }, { key: 'top2', label: 'Second bow' }],
  }[id]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

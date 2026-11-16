// ---------------------------------------------------------------------------
// Sailing into the wind: the scene.
//
// The model is art.js. Chapters 1 to 3 draw the boat from above on a
// chosen heading, with the true wind (always from the top of the screen),
// the apparent wind it feels, and in chapter 3 the sail's push split into
// a forward part and a sideways part the keel cancels. Chapter 4 draws the
// polar (speed on every heading) and a zigzag course upwind.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, arrow, TOKENS } from '../shared/draw.js';
import { speed, upwind, apparent, LUFF } from './art.js';

const W = 10;
const st = { heading: 80, readout: null, t: 0 };
const rad = (d) => (d * Math.PI) / 180;

function boat(ctx, x, y, size, heading, col, sailAngle, flap) {
  ctx.save();
  ctx.translate(x, y);
  // Heading 0 is straight up the screen (into the wind); positive turns right.
  ctx.rotate(rad(heading));
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.42, -size * 0.2, size * 0.28, size * 0.75);
  ctx.lineTo(-size * 0.28, size * 0.75);
  ctx.quadraticCurveTo(-size * 0.42, -size * 0.2, 0, -size);
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fill();
  ctx.strokeStyle = col['separator-strong'];
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // The boom swings from the mast towards the stern, out to leeward.
  ctx.translate(0, -size * 0.25);
  ctx.rotate(sailAngle);
  ctx.strokeStyle = flap ? alpha(col.label, 0.5) : col.label;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  if (flap) {
    for (let i = 1; i <= 8; i++) ctx.lineTo(Math.sin(i * 1.7) * 3, (size * 0.8 * i) / 8);
  } else ctx.quadraticCurveTo(-size * 0.12 * Math.sign(sailAngle || 1), size * 0.4, 0, size * 0.85);
  ctx.stroke();
  ctx.restore();
}

function scene(ctx, w, h, col, bg, api, split) {
  const hd = st.heading;
  const v = speed(W, hd);
  const ap = apparent(W, hd, v);
  const cx = w * 0.5, cy = h * 0.6, size = Math.min(70, h * 0.16);
  // True wind arrows down the screen.
  for (let i = 0; i < 4; i++) {
    const x = w * (0.12 + i * 0.25);
    arrow(ctx, x, 60, x, 100, alpha(col['label-tertiary'], 0.8), 1.5);
  }
  label(ctx, `True wind, ${W} knots`, w - 12, 114, col['label-tertiary'], bg, { size: 11, align: 'right' });
  // Apparent wind: the direction it comes from, relative to the boat.
  // The wind comes over the left of the bow; the sail swings out to the right.
  const awDir = rad(hd) - rad(ap.angle);
  const flap = ap.angle < LUFF;
  const sail = flap ? 0 : -rad(Math.min(85, Math.max(8, ap.angle - 20)));
  boat(ctx, cx, cy, size, hd, col, sail, flap);
  const L = 40 + ap.speed * 4;
  const fx = cx + Math.sin(awDir) * (size + L), fy = cy - Math.cos(awDir) * (size + L);
  arrow(ctx, fx, fy, cx + Math.sin(awDir) * size * 0.8, cy - Math.cos(awDir) * size * 0.8, col['hiw-ink-1'], 2.5, 9);
  label(ctx, 'Apparent wind', fx, fy - 12, col['hiw-ink-1'], bg, { size: 11, weight: 700, align: 'center' });
  // The boat's own motion.
  const mx = cx + Math.sin(rad(hd)) * (size + 10 + v * 8), my = cy - Math.cos(rad(hd)) * (size + 10 + v * 8);
  if (v > 0.1) {
    arrow(ctx, cx + Math.sin(rad(hd)) * size, cy - Math.cos(rad(hd)) * size, mx, my, col.accent, 3, 10);
    label(ctx, `${fmt(v, 1)} kn`, mx + 8, my, col.accent, bg, { size: 12, weight: 700 });
  }
  if (split && !flap) {
    // The sail's force: lift across the apparent wind, leaning forwards.
    const b = rad(ap.angle);
    const fwd = Math.sin(b) - 0.2 * Math.cos(b);
    const sideways = Math.cos(b) + 0.2 * Math.sin(b);
    const K = 70;
    const hx = Math.sin(rad(hd)), hy = -Math.cos(rad(hd));
    const sx = -hy, sy = hx;
    arrow(ctx, cx, cy, cx + hx * fwd * K, cy + hy * fwd * K, col.success, 3, 10);
    arrow(ctx, cx, cy, cx + sx * sideways * K, cy + sy * sideways * K, col.danger, 3, 10);
    arrow(ctx, cx, cy, cx - sx * sideways * K, cy - sy * sideways * K, alpha(col['hiw-ink-4'], 0.9), 3, 10);
    label(ctx, 'Forward', cx + hx * fwd * K + 10, cy + hy * fwd * K, col.success, bg, { size: 11, weight: 700 });
    label(ctx, 'Sideways', cx + sx * sideways * K + sx * 30, cy + sy * sideways * K + sy * 16, col.danger, bg, { size: 11, weight: 700, align: 'center' });
    label(ctx, 'Keel', cx - sx * sideways * K - sx * 24, cy - sy * sideways * K - sy * 14, col['hiw-ink-4'], bg, { size: 11, weight: 700, align: 'center' });
    return { v, ap, fwdShare: fwd / Math.hypot(fwd, sideways) };
  }
  return { v, ap };
}

function polar(ctx, w, h, col, bg) {
  const cx = w * 0.3, cy = h * 0.5, R = Math.min(w * 0.26, h * 0.4);
  const S = R / 7;
  for (const k of [2, 4, 6]) {
    ctx.strokeStyle = col.separator;
    ctx.beginPath();
    ctx.arc(cx, cy, k * S, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    label(ctx, `${k} kn`, cx + 4, cy - k * S - 6, col['label-tertiary'], bg, { size: 10 });
  }
  // The no-go zone.
  ctx.fillStyle = alpha(col.danger, 0.12);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R, -Math.PI / 2 - rad(30), -Math.PI / 2 + rad(30));
  ctx.fill();
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let a = 0; a <= 180; a++) {
    const v = speed(W, a);
    const x = cx + Math.sin(rad(a)) * v * S, y = cy - Math.cos(rad(a)) * v * S;
    (a ? ctx.lineTo : ctx.moveTo).call(ctx, x, y);
  }
  ctx.stroke();
  const v = speed(W, st.heading);
  ctx.beginPath();
  ctx.arc(cx + Math.sin(rad(st.heading)) * v * S, cy - Math.cos(rad(st.heading)) * v * S, 6, 0, TAU);
  ctx.fillStyle = col.danger;
  ctx.fill();
  label(ctx, 'Wind ↓', cx, cy - R - 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Speed on every heading', cx, h - 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  // A zigzag towards a mark straight upwind.
  const zx = w * 0.75, zy0 = h - 40, zy1 = 80;
  const ang = rad(st.heading);
  const leg = 50;
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = 2;
  ctx.beginPath();
  let x = zx, y = zy0, dir = 1;
  ctx.moveTo(x, y);
  if (st.heading < 90 && v > 0.1) {
    while (y > zy1) {
      x += dir * Math.sin(ang) * leg;
      y -= Math.cos(ang) * leg;
      ctx.lineTo(x, Math.max(zy1, y));
      if (Math.abs(x - zx) > Math.sin(ang) * leg * 0.4) dir = -dir;
      if (y <= zy1) break;
    }
  }
  ctx.stroke();
  ctx.fillStyle = col.accent;
  ctx.beginPath();
  ctx.arc(zx, zy1, 6, 0, TAU);
  ctx.fill();
  label(ctx, 'Mark, upwind', zx + 10, zy1, col.accent, bg, { size: 11 });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'tack') {
    polar(ctx, w, h, col, bg);
    r?.set('speed', `${fmt(speed(W, st.heading), 1)} knots`);
    r?.set('up', `${fmt(Math.max(0, upwind(W, st.heading)), 1)} knots`);
    return false;
  }
  const out = scene(ctx, w, h, col, bg, api, ch === 'keel');
  r?.set('speed', `${fmt(out.v, 1)} knots`);
  r?.set('felt', `${fmt(out.ap.speed, 1)} knots, ${fmt(out.ap.angle)}° off the bow`);
  if (ch === 'keel') r?.set('fwd', out.fwdShare ? `${fmt(out.fwdShare * 100)}% of the push` : '–');
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  st.heading = { run: 180, wing: 80, keel: 45, tack: 43 }[id];
  api.note({ run: 'Looking down; the wind blows from the top', wing: 'Looking down; the wind blows from the top', keel: 'The sail’s push, split in two', tack: 'The boat’s speed on every heading, in a 10-knot wind' }[id]);
  ui.slider({ label: 'Angle to the wind', min: id === 'tack' ? 20 : 0, max: id === 'tack' ? 90 : 180, value: st.heading, format: (v) => `${v}°`, onInput(v) { st.heading = v; api.invalidate(); } });
  if (id === 'tack') st.readout = api.readout([{ key: 'speed', label: 'Boat speed' }, { key: 'up', label: 'Gain straight upwind' }]);
  else if (id === 'keel') st.readout = api.readout([{ key: 'speed', label: 'Boat speed' }, { key: 'fwd', label: 'Forward part' }, { key: 'felt', label: 'Wind felt' }]);
  else st.readout = api.readout([{ key: 'speed', label: 'Boat speed' }, { key: 'felt', label: 'Wind felt' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

// ---------------------------------------------------------------------------
// Drawing light backwards: the scene.
//
// A real ray tracer, small: a camera, a ball of radius 1 resting on a flat
// floor, and one point light. For every pixel a ray leaves the eye; the
// nearest thing it meets decides the pixel. Chapter 2 shades by the cosine
// of the angle between the surface and the light; chapter 3 sends a second
// ray to the light and darkens the point if anything is in the way;
// chapter 4 makes the ball a mirror and follows the bounced ray. On the
// left, a side view of the slice through the middle of the picture, with
// one chosen ray's path drawn through it.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS, mix } from '../shared/draw.js';

const EYE = [0, 1.2, -4.5];
const BALL = [0, 1, 0], R = 1;
const IW = 96, IH = 64;
const st = { light: 40, row: 30, shade: false, shadow: false, mirror: false, readout: null, img: null, key: '' };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => mul(a, 1 / Math.sqrt(dot(a, a)));

function lightPos() {
  const a = (st.light * Math.PI) / 180;
  return [2.5 * Math.cos(a), 1 + 3.5 * Math.sin(a) + 0.5, -1.5];
}

/** The nearest hit along a ray: { t, what: 'ball' | 'floor', p, n } or null. */
function hit(o, d) {
  let best = null;
  const oc = sub(o, BALL);
  const b = dot(oc, d), c = dot(oc, oc) - R * R;
  const disc = b * b - c;
  if (disc > 0) {
    const t = -b - Math.sqrt(disc);
    if (t > 1e-4) {
      const p = add(o, mul(d, t));
      best = { t, what: 'ball', p, n: norm(sub(p, BALL)) };
    }
  }
  if (d[1] < -1e-6) {
    const t = -o[1] / d[1];
    if (t > 1e-4 && (!best || t < best.t) && Math.abs(o[2] + d[2] * t) < 8 && Math.abs(o[0] + d[0] * t) < 8) {
      best = { t, what: 'floor', p: add(o, mul(d, t)), n: [0, 1, 0] };
    }
  }
  return best;
}

/** Brightness 0 to 1 and which surface, for a ray. */
function trace(o, d, depth = 0) {
  const hh = hit(o, d);
  if (!hh) return { what: 'sky', v: 0.25 + 0.3 * Math.max(0, d[1]) };
  if (st.mirror && hh.what === 'ball' && depth < 3) {
    const rd = sub(d, mul(hh.n, 2 * dot(d, hh.n)));
    const back = trace(hh.p, rd, depth + 1);
    return { what: back.what, v: back.v * 0.85, mirrored: true };
  }
  if (!st.shade) return { what: hh.what, v: hh.what === 'ball' ? 0.75 : 0.45, p: hh.p };
  const L = lightPos();
  const toL = sub(L, hh.p);
  const dist = Math.sqrt(dot(toL, toL));
  const ld = mul(toL, 1 / dist);
  let lit = Math.max(0, dot(hh.n, ld));
  if (st.shadow && lit > 0) {
    const block = hit(hh.p, ld);
    if (block && block.t < dist) lit = 0;
  }
  const check = hh.what === 'floor' ? ((Math.floor(hh.p[0] * 1.2) + Math.floor(hh.p[2] * 1.2)) & 1 ? 0.85 : 1) : 1;
  return { what: hh.what, v: (0.12 + 0.88 * lit) * check, p: hh.p };
}

function rayFor(px, py) {
  const aspect = IW / IH, fov = 0.55;
  const x = ((px + 0.5) / IW - 0.5) * 2 * fov * aspect;
  const y = (0.5 - (py + 0.5) / IH) * 2 * fov;
  return norm([x, y, 1]);
}

function render(col) {
  const key = [st.light, st.shade, st.shadow, st.mirror, col.back, col.stock].join('|');
  if (key === st.key) return st.img;
  const ramps = {
    ball: Array.from({ length: 33 }, (_, i) => mix(col.back, col['hiw-ink-1'], i / 32)),
    floor: Array.from({ length: 33 }, (_, i) => mix(col.back, col.stock, i / 32)),
    sky: Array.from({ length: 33 }, (_, i) => mix(col.back, col['hiw-ink-4'], i / 32)),
  };
  const img = [];
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) {
    const res = trace(EYE, rayFor(x, y));
    img.push(ramps[res.what][Math.round(Math.min(1, res.v) * 32)]);
  }
  st.key = key;
  st.img = img;
  return img;
}

function side(ctx, x0, y0, wd, ht, col, bg) {
  // The slice x = 0: z runs left to right, y up. Fit z from −5 to 3, y from 0 to 5.
  const Z = (z) => x0 + ((z + 5) / 8) * wd, Y = (y) => y0 + ht - (y / 5) * ht;
  ctx.strokeStyle = col['separator-strong'];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, Y(0));
  ctx.lineTo(x0 + wd, Y(0));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(Z(BALL[2]), Y(BALL[1]), (R / 8) * wd, 0, TAU);
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.35);
  ctx.fill();
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.stroke();
  const L = lightPos();
  ctx.beginPath();
  ctx.arc(Z(L[2]), Y(L[1]), 7, 0, TAU);
  ctx.fillStyle = col.warning;
  ctx.fill();
  label(ctx, 'Light', Z(L[2]) + 10, Y(L[1]) - 10, col.warning, bg, { size: 11 });
  // The screen the pixels sit on, one unit in front of the eye.
  const sz = EYE[2] + 1;
  ctx.strokeStyle = col['label-tertiary'];
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(Z(sz), Y(EYE[1] - 0.55));
  ctx.lineTo(Z(sz), Y(EYE[1] + 0.55));
  ctx.stroke();
  label(ctx, 'Screen', Z(sz), Y(EYE[1] + 0.55) - 12, col['label-tertiary'], bg, { size: 11, align: 'center' });
  ctx.beginPath();
  ctx.arc(Z(EYE[2]), Y(EYE[1]), 6, 0, TAU);
  ctx.fillStyle = col.label;
  ctx.fill();
  label(ctx, 'Eye', Z(EYE[2]), Y(EYE[1]) + 16, col.label, bg, { size: 11, align: 'center' });
  // A fan of rays down the middle column, and the chosen one's whole path.
  for (let row = 0; row < IH; row += 8) {
    const d = rayFor(IW / 2 - 0.5, row);
    const hh = hit(EYE, d);
    const t = hh ? hh.t : 9;
    ctx.strokeStyle = alpha(col['label-tertiary'], 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Z(EYE[2]), Y(EYE[1]));
    ctx.lineTo(Z(EYE[2] + d[2] * t), Y(EYE[1] + d[1] * t));
    ctx.stroke();
  }
  const d = rayFor(IW / 2 - 0.5, st.row);
  let o = EYE, dir = d, out = 'sky';
  for (let bounce = 0; bounce < 3; bounce++) {
    const hh = hit(o, dir);
    const t = hh ? hh.t : 9;
    const end = add(o, mul(dir, t));
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(Z(o[2]), Y(o[1]));
    ctx.lineTo(Z(end[2]), Y(end[1]));
    ctx.stroke();
    if (!hh) break;
    out = hh.what;
    if (st.shadow && st.shade && !(st.mirror && hh.what === 'ball')) {
      const toL = sub(L, hh.p);
      const dist = Math.sqrt(dot(toL, toL));
      const blk = hit(hh.p, mul(toL, 1 / dist));
      const blocked = blk && blk.t < dist && dot(hh.n, toL) > 0;
      const facing = dot(hh.n, toL) > 0;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = blocked || !facing ? col.danger : col.success;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Z(hh.p[2]), Y(hh.p[1]));
      ctx.lineTo(Z(L[2]), Y(L[1]));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!(st.mirror && hh.what === 'ball')) break;
    dir = sub(dir, mul(hh.n, 2 * dot(dir, hh.n)));
    o = hh.p;
  }
  return out;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const r = st.readout;
  const wide = w > 640;
  const sw = wide ? w * 0.48 : w - 40, sh = wide ? h - 110 : (h - 100) * 0.45;
  const what = side(ctx, 20, 74, sw, sh, col, bg);
  if (wide) label(ctx, 'Side view, through the middle of the picture', 20, 60, col['label-secondary'], bg, { size: 11 });
  const img = render(col);
  const ix = wide ? 40 + sw : 20, iy = wide ? 74 : 96 + sh;
  const pw = Math.min((wide ? w - ix - 20 : w - 40) / IW, (wide ? h - 110 : h - iy - 20) / IH);
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) {
    ctx.fillStyle = img[y * IW + x];
    ctx.fillRect(ix + x * pw, iy + y * pw, pw + 0.4, pw + 0.4);
  }
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(ix + (IW / 2 - 1) * pw, iy + st.row * pw, pw, pw);
  label(ctx, `The picture, ${IW} × ${IH} rays`, ix, iy - 14, col['label-secondary'], bg, { size: 11 });
  r?.set('rays', fmt(IW * IH * (st.shadow ? 2 : 1)));
  r?.set('hit', { ball: 'The ball', floor: 'The floor', sky: 'Nothing (sky)' }[what]);
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  st.shade = id !== 'rays';
  st.shadow = id === 'shadow' || id === 'mirror';
  st.mirror = id === 'mirror';
  st.key = '';
  api.note({ rays: 'One ray per pixel, and what each meets first', shade: 'Brighter where the surface faces the light', shadow: 'A second ray to the light from every point', mirror: 'The ball made a mirror' }[id]);
  ui.slider({ label: 'Follow the ray for row', min: 0, max: IH - 1, value: st.row, onInput(v) { st.row = v; api.invalidate(); } });
  if (id !== 'rays') ui.slider({ label: 'Light', min: 5, max: 175, value: st.light, format: (v) => `${v}°`, onInput(v) { st.light = v; api.invalidate(); } });
  if (id === 'mirror') ui.toggle({ label: 'Mirror ball', checked: true, onChange(v) { st.mirror = v; api.invalidate(); } });
  st.readout = api.readout([{ key: 'hit', label: 'The gold ray ends on' }, { key: 'rays', label: 'Rays cast' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

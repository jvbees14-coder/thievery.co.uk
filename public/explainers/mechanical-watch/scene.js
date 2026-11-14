// ---------------------------------------------------------------------------
// How a mechanical watch keeps time: the scene.
//
// The balance swings at the real 4 Hz, slowed for the eye; every time it
// passes the middle it flicks the pallet fork across, and the escape wheel
// steps forward half a tooth. Everything downstream is driven by those
// steps, so the seconds hand ticks eight times a second, as it does on a
// real 28,800-beat watch. Chapter 1 can take the escapement away and let
// the spring run free.
// ---------------------------------------------------------------------------

import { mount, Smooth, fmt, signed, TAU, clamp, alpha } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { HZ, AMPLITUDE, TEETH, gear, escapeWheel, balance, fork, dial } from './art.js';

const st = {
  t: 0,               // seconds of watch time
  slow: 6,            // shown this many times slower in the close-ups
  beats: 0,
  lastSign: 1,
  escape: new Smooth(0, 30),
  free: false,
  freeAngle: 0,
  reserve: 1,
  rate: 4,            // seconds a day, for chapter 5
  month: 0,
  readout: null,
};

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const run = api.playing && api.motion;
  let moving = st.escape.step(dt, !api.motion);

  const slow = ch === 'gears' ? 1 : st.slow;
  if (run && !st.free) {
    st.t += dt / slow;
    moving = true;
  }
  const theta = AMPLITUDE * Math.sin(TAU * HZ * st.t) * (st.free ? 0 : 1);
  const sign = Math.sign(theta) || st.lastSign;
  if (sign !== st.lastSign) {
    st.beats++;
    st.lastSign = sign;
    st.escape.set(st.beats * (TAU / TEETH / 2));
  }
  if (st.free && run) {
    st.freeAngle += dt * 40;
    st.reserve = Math.max(0, st.reserve - dt * 0.25);
    if (st.reserve <= 0) st.free = false;
    moving = true;
  }

  if (ch === 'gears') {
    const R = Math.min(w * 0.3, h * 0.4);
    dial(ctx, w * 0.36, h * 0.5, R, 10 * 3600 + 8 * 60 + st.beats / 8, col);
    // The train, small, beside the dial.
    const gx = w * 0.78, e = st.escape.v;
    escapeWheel(ctx, gx, h * 0.22, Math.min(w, h) * 0.06, e, col);
    gear(ctx, gx, h * 0.45, Math.min(w, h) * 0.09, 60, -e / 7.5, col, col['label-secondary']);
    gear(ctx, gx, h * 0.72, Math.min(w, h) * 0.12, 80, (e / 7.5) / 8, col, col['label-secondary']);
    label(ctx, 'Escape wheel', gx, h * 0.22 + Math.min(w, h) * 0.06 + 14, col['label-secondary'], bg, { size: 11, align: 'center' });
    label(ctx, 'Seconds wheel', gx, h * 0.45 + Math.min(w, h) * 0.09 + 14, col['label-secondary'], bg, { size: 11, align: 'center' });
    label(ctx, 'Towards the hours', gx, h * 0.72 + Math.min(w, h) * 0.12 + 14, col['label-secondary'], bg, { size: 11, align: 'center' });
  } else if (ch === 'accuracy') {
    if (run) {
      st.month = (st.month + dt * 1.5) % 31;
      moving = true;
    }
    const x0 = 40, x1 = w - 20, yMid = h * 0.5, span = h * 0.36;
    const maxS = 20 * 31;
    ctx.fillStyle = alpha(col.success, 0.15);
    ctx.beginPath();
    ctx.moveTo(x0, yMid);
    ctx.lineTo(x1, yMid - (6 * 31 / maxS) * span);
    ctx.lineTo(x1, yMid + (4 * 31 / maxS) * span);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = col.separator;
    ctx.beginPath();
    ctx.moveTo(x0, yMid);
    ctx.lineTo(x1, yMid);
    ctx.stroke();
    const xNow = x0 + ((x1 - x0) * st.month) / 31;
    ctx.strokeStyle = col['hiw-ink-1'];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, yMid);
    ctx.lineTo(xNow, yMid - ((st.rate * st.month) / maxS) * span);
    ctx.stroke();
    label(ctx, 'Chronometer limits', x1 - 4, yMid - (6 * 31 / maxS) * span - 12, col.success, bg, { size: 11, align: 'right' });
    label(ctx, `${signed(st.rate * st.month, 0)} s`, xNow + 6, yMid - ((st.rate * st.month) / maxS) * span, col.label, bg, { size: 13 });
    label(ctx, 'Day 1', x0, h - 18, col['label-tertiary'], bg, { size: 11 });
    label(ctx, 'Day 31', x1, h - 18, col['label-tertiary'], bg, { size: 11, align: 'right' });
    label(ctx, 'fast', 10, yMid - span * 0.8, col['label-tertiary'], bg, { size: 11 });
    label(ctx, 'slow', 10, yMid + span * 0.8, col['label-tertiary'], bg, { size: 11 });
  } else {
    // The escapement close up: escape wheel, fork, balance.
    const s = Math.min(w / 2.6, h / 1.6);
    const ex = w * 0.28, ey = h * 0.62, er = s * 0.3;
    const fx = ex + er * 0.35, fy = ey - er * 1.75;
    const bx = w * 0.7, by = h * 0.4, br = s * 0.42;
    const tilt = clamp(theta / 0.45, -1, 1);
    const wheelAngle = st.free ? st.freeAngle : st.escape.v;
    if (ch === 'spring') {
      gear(ctx, w * 0.2, h * 0.3, s * 0.32, 72, -wheelAngle / 60, col, col['label-secondary']);
      label(ctx, `Mainspring: ${fmt(st.reserve * 100)}% wound`, w * 0.2, h * 0.3 + s * 0.32 + 16, col['label-secondary'], bg, { size: 12, align: 'center' });
    }
    if (ch !== 'spring' || !st.free) {
      if (ch !== 'spring') escapeWheel(ctx, ex, ey, er, wheelAngle, col);
      if (ch !== 'spring') fork(ctx, fx, fy, ex, ey, er, bx, by, br, tilt, col);
      balance(ctx, bx, by, br, theta, col);
    }
    if (ch === 'spring') escapeWheel(ctx, w * 0.62, h * 0.66, s * 0.18, wheelAngle, col);
    if (ch === 'escapement') {
      label(ctx, 'Escape wheel', ex, ey + er + 16, col.accent, bg, { size: 12, align: 'center' });
      label(ctx, 'Pallet fork', fx, fy - 18, col['label-secondary'], bg, { size: 12, align: 'center' });
      label(ctx, 'Balance and hairspring', bx, by + br + 18, col.accent, bg, { size: 12, align: 'center' });
    }
  }

  const r = st.readout;
  if (r) {
    r.set('beats', fmt(st.beats));
    r.set('angle', `${signed((theta * 180) / Math.PI, 0)}°`);
    r.set('reserve', `${fmt(st.reserve * 100)}%`);
    r.set('month', `${signed(st.rate * 31, 0)} s`);
    r.set('rate', `${signed(st.rate, 0)} s a day`);
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.free = false;
  st.reserve = 1;
  api.note({ spring: 'Slowed six times', balance: 'Slowed six times', escapement: 'Slowed six times', gears: 'Real speed: eight ticks a second', accuracy: 'A month in about 20 seconds' }[id]);
  if (id === 'spring') {
    ui.button({
      label: 'Take away the escapement',
      onClick() {
        st.free = true;
        st.reserve = 1;
        api.status('With nothing holding it back, the spring empties in moments.');
        api.invalidate();
      },
    });
    ui.button({ label: 'Wind it again', onClick: () => { st.free = false; st.reserve = 1; api.status(''); api.invalidate(); } });
  }
  if (id === 'balance' || id === 'escapement') {
    ui.slider({ label: 'Slow down by', min: 1, max: 20, value: st.slow, format: (v) => `${v}×`, onInput: (v) => { st.slow = v; api.note(`Slowed ${v} times`); } });
  }
  if (id === 'accuracy') {
    ui.slider({ label: 'Daily rate', min: -20, max: 20, value: st.rate, format: (v) => `${signed(v)} s`, onInput: (v) => { st.rate = v; api.invalidate(); } });
  }
  const rows = {
    spring: [{ key: 'reserve', label: 'Wound' }],
    balance: [{ key: 'angle', label: 'Balance at' }, { key: 'beats', label: 'Beats' }],
    escapement: [{ key: 'beats', label: 'Beats, so steps of the wheel' }],
    gears: [{ key: 'beats', label: 'Beats' }],
    accuracy: [{ key: 'rate', label: 'Gains' }, { key: 'month', label: 'After a month' }],
  }[id];
  st.readout = api.readout(rows);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

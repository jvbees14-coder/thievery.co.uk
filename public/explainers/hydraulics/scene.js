// ---------------------------------------------------------------------------
// How hydraulics multiply force: the scene.
//
// Two cylinders joined by a pipe full of oil. Pressure is force over area
// and is the same everywhere in the oil (Pascal), so a push on the small
// piston comes out of the big one multiplied by the ratio of their areas.
// The oil doesn't squash, so what one piston gains in force it loses in
// travel. Chapter 4 is a car's brakes: one pedal, four wheels.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, box, arrow, TOKENS } from '../shared/draw.js';

const CAR = 1500;   // kg
const st = { push: 20, ratio: 50, pressed: 0, readout: null };

function rig(ctx, w, h, col, bg, ratio, travel) {
  // Small cylinder on the left, big one on the right.
  const base = h - 50, smallW = 30, bigW = Math.min(w * 0.4, smallW * Math.sqrt(ratio));
  const xs = w * 0.18, xb = w * 0.62;
  const lift = travel / ratio, fill = 80;
  ctx.fillStyle = alpha(col.warning, 0.5);
  ctx.fillRect(xs - smallW / 2, base - fill + travel, smallW, fill - travel);
  ctx.fillRect(xb - bigW / 2, base - fill - lift, bigW, fill + lift);
  ctx.fillRect(xs, base - 18, xb - xs, 18);
  ctx.strokeStyle = col['separator-strong'];
  ctx.lineWidth = 2;
  ctx.strokeRect(xs - smallW / 2, base - 220, smallW, 220);
  ctx.strokeRect(xb - bigW / 2, base - 220, bigW, 220);
  // Pistons.
  ctx.fillStyle = col['label-secondary'];
  ctx.fillRect(xs - smallW / 2, base - fill + travel - 10, smallW, 10);
  ctx.fillRect(xb - bigW / 2, base - fill - lift - 10, bigW, 10);
  return { xs, xb, smallTop: base - fill + travel - 10, bigTop: base - fill - lift - 10, bigW };
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'brakes') {
    // A pedal pushing a small piston; four bigger ones at the wheels.
    const cx = w / 2, cy = h * 0.5;
    ctx.strokeStyle = alpha(col.warning, 0.8);
    ctx.lineWidth = 5;
    const wheels = [[cx - w * 0.3, cy - h * 0.22], [cx + w * 0.3, cy - h * 0.22], [cx - w * 0.3, cy + h * 0.22], [cx + w * 0.3, cy + h * 0.22]];
    for (const [x, y] of wheels) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    const squeeze = st.pressed;
    for (const [x, y] of wheels) {
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, TAU);
      ctx.fillStyle = col['bg-elevated-2'];
      ctx.fill();
      ctx.fillStyle = squeeze ? col.danger : col['label-tertiary'];
      ctx.fillRect(x - 30 + squeeze * 4, y - 10, 8, 20);
      ctx.fillRect(x + 22 - squeeze * 4, y - 10, 8, 20);
    }
    box(ctx, cx - 14, cy - 14, 28, 28, 4);
    ctx.fillStyle = col.accent;
    ctx.fill();
    label(ctx, 'Pedal', cx, cy + 28, col.accent, bg, { size: 12, weight: 700, align: 'center' });
    return false;
  }
  const ratio = ch === 'pascal' ? 1 : st.ratio;
  const travel = ch === 'distance' ? st.pressed * 70 : 0;
  const g = rig(ctx, w, h, col, bg, ratio, travel);
  arrow(ctx, g.xs, g.smallTop - 60, g.xs, g.smallTop - 4, col.accent, 3, 10);
  label(ctx, `Push: ${fmt(st.push, 0)} kg`, g.xs, g.smallTop - 72, col.accent, bg, { size: 12, weight: 700, align: 'center' });
  const out = st.push * ratio;
  if (ch === 'lift' || ch === 'distance') {
    box(ctx, g.xb - 60, g.bigTop - 46, 120, 46, 8);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
    label(ctx, `Car, ${fmt(CAR)} kg`, g.xb, g.bigTop - 23, col['stock-ink'], null, { size: 12, weight: 700, align: 'center' });
  } else {
    arrow(ctx, g.xb, g.bigTop - 4, g.xb, g.bigTop - 60, col.success, 3, 10);
    label(ctx, `Lifts: ${fmt(out, 0)} kg`, g.xb, g.bigTop - 72, col.success, bg, { size: 12, weight: 700, align: 'center' });
  }
  r?.set('out', `${fmt(out)} kg`);
  r?.set('lifts', out >= CAR ? 'Yes' : `No, ${fmt(CAR - out)} kg short`);
  r?.set('travel', `${fmt(st.pressed * 100, 0)} cm down, ${fmt((st.pressed * 100) / st.ratio, 1)} cm up`);
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ pascal: 'Two cylinders the same size, joined by oil', lift: 'A small cylinder and a big one', distance: 'Pushing the small piston down', brakes: 'A car’s brakes, from above' }[id]);
  st.readout = null;
  st.pressed = 0;
  if (id === 'pascal') {
    ui.slider({ label: 'Push', min: 1, max: 50, value: st.push, format: (v) => `${v} kg`, onInput(v) { st.push = v; api.invalidate(); } });
  } else if (id === 'lift') {
    ui.slider({ label: 'Push', min: 1, max: 50, value: st.push, format: (v) => `${v} kg`, onInput(v) { st.push = v; api.invalidate(); } });
    ui.slider({ label: 'Big piston’s area, against the small one', min: 2, max: 100, value: st.ratio, format: (v) => `${v} times`, onInput(v) { st.ratio = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'out', label: 'Force on the big piston' }, { key: 'lifts', label: 'Lifts the car' }]);
  } else if (id === 'distance') {
    st.ratio = 50;
    st.push = 30;
    ui.slider({ label: 'Push the small piston down', min: 0, max: 1, step: 0.01, value: 0, format: (v) => `${Math.round(v * 100)} cm`, onInput(v) { st.pressed = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'travel', label: 'Small piston, big piston' }]);
  } else if (id === 'brakes') {
    ui.toggle({ label: 'Press the pedal', checked: false, onChange(v) { st.pressed = v ? 1 : 0; api.invalidate(); } });
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

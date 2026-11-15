// ---------------------------------------------------------------------------
// How bicycle gears work: the scene.
//
// The drive side of a road bike, turning: chainring, chain, sprocket and
// back wheel. Chapter 1 changes the two gears; chapter 2 puts the bike on a
// hill and asks how hard the pedals must be pushed; chapter 3 sets the pace
// of pedalling; chapter 4 lays out all 22 gears of a 2 × 11 bike.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';
import { RINGS, CASSETTE, ratio, metres, kmh, pedalForce, drawDrive } from './art.js';

const st = { ring: 50, sprocket: 17, crank: 0, grade: 0.08, rpm: 90, readout: null };

function drawRange(ctx, w, h, col, bg) {
  const x0 = 60, x1 = w - 20, y0 = 90;
  const X = (m) => x0 + ((m - 2) / 8) * (x1 - x0);
  for (let m = 2; m <= 10; m++) label(ctx, `${m} m`, X(m), h - 30, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Distance for one turn of the pedals', x1, h - 14, col['label-tertiary'], bg, { size: 11, align: 'right' });
  RINGS.forEach((ring, i) => {
    const y = y0 + 40 + i * Math.max(60, (h - y0 - 120) / 2);
    label(ctx, `${ring} teeth`, x0 - 8, y, col.label, bg, { size: 12, weight: 700, align: 'right' });
    ctx.strokeStyle = col.separator;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    for (const s of CASSETTE) {
      const m = metres(ring, s), on = ring === st.ring && s === st.sprocket;
      ctx.beginPath();
      ctx.arc(X(m), y, on ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = on ? col.accent : i ? col['hiw-ink-1'] : col['hiw-ink-4'];
      ctx.fill();
    }
  });
  // Where the two rows overlap.
  const lo = metres(50, 30), hi = metres(34, 11);
  const gap = Math.max(60, (h - y0 - 120) / 2);
  box(ctx, X(lo), y0 + 20, X(hi) - X(lo), gap + 40, 6);
  ctx.fillStyle = alpha(col.warning, 0.1);
  ctx.fill();
  label(ctx, 'Both rings cover this', (X(lo) + X(hi)) / 2, y0 + 40 + gap / 2, col.warning, bg, { size: 11, align: 'center' });
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
    // Pedalling at the chosen pace, slowed by half so it can be followed.
    st.crank += dt * (st.rpm / 60) * Math.PI * 2 * 0.5;
    moving = true;
  }
  if (ch === 'range') {
    drawRange(ctx, w, h, col, bg);
  } else {
    const g = drawDrive(ctx, w, h * 0.92, col, st.ring, st.sprocket, st.crank);
    label(ctx, `${st.ring} teeth`, g.cx, g.cy + g.R1 * 1.45 + 14, col.accent, bg, { size: 12, weight: 700, align: 'center' });
    label(ctx, `${st.sprocket} teeth`, g.rx, g.ry + g.RW + 16, col['hiw-ink-1'], bg, { size: 12, weight: 700, align: 'center' });
    if (ch === 'hills') {
      // The slope, drawn under everything.
      ctx.strokeStyle = col['separator-strong'];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, h - 20);
      ctx.lineTo(w, h - 20 - w * st.grade);
      ctx.stroke();
    }
  }
  const pushN = pedalForce(st.ring, st.sprocket, st.grade);
  r?.set('ratio', `${fmt(ratio(st.ring, st.sprocket), 2)} turns`);
  r?.set('metres', `${fmt(metres(st.ring, st.sprocket), 2)} m`);
  r?.set('push', `${fmt(pushN, 0)} N, like lifting ${fmt(pushN / 9.81, 0)} kg`);
  r?.set('speed', `${fmt(kmh(st.ring, st.sprocket, st.rpm), 1)} km/h`);
  return moving;
}

function gearControls(ui, api) {
  ui.choice({ label: 'Front chainring', options: RINGS.map((n) => ({ id: String(n), label: `${n} teeth` })), value: String(st.ring), onChange(v) { st.ring = Number(v); api.invalidate(); } });
  ui.slider({ label: 'Back sprocket', min: 0, max: CASSETTE.length - 1, value: CASSETTE.indexOf(st.sprocket), format: (i) => `${CASSETTE[i]} teeth`, onInput(i) { st.sprocket = CASSETTE[i]; api.invalidate(); } });
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ ratio: 'A road bike’s drive side, pedalled at half speed', hills: 'Riding up a hill, 85 kg of rider and bike', cadence: 'Choose how fast you pedal', range: 'Every gear on a 2 × 11 bike' }[id]);
  gearControls(ui, api);
  if (id === 'hills') {
    ui.slider({ label: 'Hill', min: 0, max: 0.15, step: 0.01, value: st.grade, format: (v) => `${Math.round(v * 100)}%`, onInput(v) { st.grade = v; api.invalidate(); } });
  }
  if (id === 'cadence') {
    ui.slider({ label: 'Pedalling', min: 40, max: 120, step: 5, value: st.rpm, format: (v) => `${v} turns a minute`, onInput(v) { st.rpm = v; api.invalidate(); } });
  }
  st.readout = api.readout({
    ratio: [{ key: 'ratio', label: 'Wheel turns per pedal turn' }, { key: 'metres', label: 'Distance per pedal turn' }],
    hills: [{ key: 'push', label: 'Average push on the pedals' }],
    cadence: [{ key: 'speed', label: 'Speed' }, { key: 'metres', label: 'Distance per pedal turn' }],
    range: [{ key: 'metres', label: 'Chosen gear' }],
  }[id]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

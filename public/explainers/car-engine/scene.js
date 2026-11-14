// ---------------------------------------------------------------------------
// How a car engine works: the scene.
//
// One cylinder through the four strokes, then the crank's arithmetic at a
// chosen speed, then the ideal efficiency against the compression ratio
// (the air-standard Otto cycle, 1 − r^(1−γ) with γ = 1.4), then four
// cylinders firing in the usual 1-3-4-2 order so the crank is pushed every
// half turn.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { STROKE, STROKES, strokeOf, drawCylinder } from './art.js';

const GAMMA = 1.4;
const otto = (r) => 1 - r ** (1 - GAMMA);
const ORDER = [0, 2, 3, 1];   // cylinders 1, 3, 4, 2: each fires a quarter-cycle after the last

const st = { deg: 0, rpm: 3000, ratio: 10, slow: true, readout: null };

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const run = api.playing && api.motion;
  // Shown at a speed an eye can follow: one cycle in two or three seconds,
  // whatever speed the readout says the engine is doing.
  if (run) st.deg = (st.deg + dt * (ch === 'cylinders' ? 300 : 260)) % 720;

  if (ch === 'cylinders') {
    const gap = Math.min(w / 4.4, 150);
    for (let i = 0; i < 4; i++) {
      const offset = ORDER.indexOf(i) * 180;
      drawCylinder(ctx, w / 2 + (i - 1.5) * gap, h * 0.08, h * 0.78, st.deg - offset, col, { ratio: st.ratio });
      const s = strokeOf(st.deg - offset);
      label(ctx, `${i + 1}: ${STROKES[s]}`, w / 2 + (i - 1.5) * gap, h * 0.93, s === 2 ? col.danger : col['label-secondary'], bg, { size: 12, align: 'center' });
    }
  } else if (ch === 'compression') {
    const x = w * 0.28;
    drawCylinder(ctx, x, h * 0.06, h * 0.86, st.deg, col, { ratio: st.ratio });
    // The ideal efficiency against compression ratio.
    const gx0 = w * 0.52, gx1 = w - 20, gy0 = h * 0.18, gy1 = h * 0.8;
    const X = (r) => gx0 + ((r - 4) / 12) * (gx1 - gx0), Y = (e) => gy1 - (e / 0.7) * (gy1 - gy0);
    ctx.strokeStyle = col.separator;
    ctx.beginPath();
    ctx.moveTo(gx0, gy0);
    ctx.lineTo(gx0, gy1);
    ctx.lineTo(gx1, gy1);
    ctx.stroke();
    ctx.beginPath();
    for (let r = 4; r <= 16; r += 0.25) (r === 4 ? ctx.moveTo(X(r), Y(otto(r))) : ctx.lineTo(X(r), Y(otto(r))));
    ctx.strokeStyle = col['hiw-ink-1'];
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(st.ratio), Y(otto(st.ratio)), 5, 0, Math.PI * 2);
    ctx.fillStyle = col['accent-strong'];
    ctx.fill();
    label(ctx, `${fmt(otto(st.ratio) * 100, 1)}%`, X(st.ratio) + 8, Y(otto(st.ratio)) - 12, col.label, bg, { size: 13 });
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = col.warning;
    ctx.beginPath();
    ctx.moveTo(gx0, Y(0.4));
    ctx.lineTo(gx1, Y(0.4));
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'Best real petrol engines, about 40%', gx1, Y(0.4) + 12, col.warning, bg, { size: 11, align: 'right' });
    label(ctx, 'Ideal efficiency', gx0, gy0 - 12, col['label-secondary'], bg, { size: 12 });
    label(ctx, 'Compression ratio 4 to 16', (gx0 + gx1) / 2, gy1 + 16, col['label-tertiary'], bg, { size: 11, align: 'center' });
  } else {
    drawCylinder(ctx, w * 0.42, h * 0.05, h * 0.88, st.deg, col, { ratio: st.ratio, labels: true, bg });
    const s = strokeOf(st.deg);
    label(ctx, STROKES[s], w * 0.82, h * 0.25, s === 2 ? col.danger : col.label, bg, { size: 20, weight: 700, align: 'center' });
    label(ctx, ['Piston down, air and fuel in', 'Both valves shut, piston up', 'Spark, burn, piston pushed down', 'Piston up, burnt gas out'][s], w * 0.82, h * 0.25 + 26, col['label-secondary'], bg, { size: 12, align: 'center' });
    // Four marks showing where in the two turns we are.
    STROKES.forEach((name, i) => {
      const y = h * 0.5 + i * 22;
      ctx.fillStyle = i === s ? (i === 2 ? col.danger : col.accent) : alpha(col['label-secondary'], 0.25);
      ctx.fillRect(w * 0.72, y - 6, 12, 12);
      label(ctx, name, w * 0.72 + 20, y, i === s ? col.label : col['label-secondary'], bg, { size: 12, weight: i === s ? 700 : 500 });
    });
  }

  const r = st.readout;
  if (r) {
    r.set('rpm', `${fmt(st.rpm)} rpm`);
    r.set('fires', `${fmt(st.rpm / 120, 1)} a second`);
    r.set('speed', `${fmt((2 * STROKE / 1000) * (st.rpm / 60), 1)} m/s`);
    r.set('stroke', `${fmt(1000 * 60 / st.rpm / 2, 1)} ms`);
    r.set('ideal', `${fmt(otto(st.ratio) * 100, 1)}%`);
    r.set('total', `${fmt((st.rpm / 120) * 4, 0)} a second`);
  }
  return run;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note(id === 'compression' ? 'Ideal air-standard cycle' : 'Shown slowed right down');
  if (id === 'four') {
    ui.slider({ label: 'Turn the crank', min: 0, max: 720, step: 5, value: Math.round(st.deg), format: (v) => `${v}°`, onInput: (v) => { st.deg = v; api.invalidate(); } });
  }
  if (id === 'crank' || id === 'cylinders') {
    ui.slider({ label: 'Engine speed', min: 800, max: 6500, step: 100, value: st.rpm, format: (v) => `${fmt(v)} rpm`, onInput: (v) => { st.rpm = v; api.invalidate(); } });
  }
  if (id === 'compression') {
    ui.slider({ label: 'Compression ratio', min: 6, max: 16, step: 0.5, value: st.ratio, format: (v) => `${fmt(v, 1)} : 1`, onInput: (v) => { st.ratio = v; api.invalidate(); } });
  }
  const rows = {
    four: [],
    crank: [{ key: 'rpm', label: 'Speed' }, { key: 'fires', label: 'This cylinder fires' }, { key: 'stroke', label: 'Each stroke takes' }, { key: 'speed', label: 'Average piston speed' }],
    compression: [{ key: 'ideal', label: 'Ideal efficiency' }],
    cylinders: [{ key: 'rpm', label: 'Speed' }, { key: 'total', label: 'Power strokes, four cylinders' }],
  }[id];
  st.readout = api.readout(rows);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

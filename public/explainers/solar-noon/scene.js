// ---------------------------------------------------------------------------
// Why noon isn't at twelve: the scene.
//
// The equation of time, by the usual approximation: with B = 360°·(d − 81)/365,
// sundial time minus clock time ≈ 9.87·sin 2B − 7.53·cos B − 1.5·sin B
// minutes. The first term comes from the Earth's tilt, the others from its
// oval orbit. Chapter 4 plots the Sun at clock noon in Greenwich through
// the year: across, the equation of time (a quarter of a degree a minute);
// up, its height, from the declination.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const D = Math.PI / 180;
const B = (d) => (360 * (d - 81)) / 365;
const tiltPart = (d) => 9.87 * Math.sin(2 * B(d) * D);
const orbitPart = (d) => -7.53 * Math.cos(B(d) * D) - 1.5 * Math.sin(B(d) * D);
const eot = (d) => tiltPart(d) + orbitPart(d);
const declination = (d) => -23.44 * Math.cos((TAU * (d + 10)) / 365);
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const dateOf = (d) => new Date(Date.UTC(2025, 0, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

const st = { day: 307, readout: null };

function chart(ctx, w, h, col, bg, lines) {
  const x0 = 50, x1 = w - 16, y0 = 80, y1 = h - 40;
  const X = (d) => x0 + ((d - 1) / 364) * (x1 - x0), Y = (m) => (y0 + y1) / 2 - (m / 18) * ((y1 - y0) / 2);
  ctx.strokeStyle = col.separator;
  for (const m of [-15, -10, -5, 0, 5, 10, 15]) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(m));
    ctx.lineTo(x1, Y(m));
    ctx.stroke();
    label(ctx, `${m > 0 ? '+' : ''}${m}`, x0 - 6, Y(m), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  MONTHS.forEach((m, i) => label(ctx, m, X(15 + i * 30.4), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' }));
  label(ctx, 'Minutes the sundial is ahead of the clock', x0, y0 - 16, col['label-tertiary'], bg, { size: 11 });
  for (const [fn, c, wd] of lines) {
    ctx.strokeStyle = c;
    ctx.lineWidth = wd;
    ctx.beginPath();
    for (let d = 1; d <= 365; d++) (d === 1 ? ctx.moveTo : ctx.lineTo).call(ctx, X(d), Y(fn(d)));
    ctx.stroke();
  }
  const main = lines[lines.length - 1][0];
  ctx.beginPath();
  ctx.arc(X(st.day), Y(main(st.day)), 6, 0, TAU);
  ctx.fillStyle = col.label;
  ctx.fill();
}

function figure(ctx, w, h, col, bg) {
  // The Sun's place at 12:00 GMT in London, every few days.
  const cx = w / 2, top = 80, bot = h - 40;
  const lat = 51.48;
  const alt = (d) => 90 - lat + declination(d);
  const minA = 90 - lat - 23.44, maxA = 90 - lat + 23.44;
  const Y = (a) => bot - ((a - minA + 2) / (maxA - minA + 4)) * (bot - top);
  const span = (bot - top) / (maxA - minA + 4);   // pixels per degree, the same both ways
  const X = (d) => cx - eot(d) * 0.25 * span;
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx, bot);
  ctx.stroke();
  label(ctx, 'Due south', cx + 6, bot, col['label-tertiary'], bg, { size: 11 });
  for (let d = 1; d <= 365; d += 4) {
    ctx.beginPath();
    ctx.arc(X(d), Y(alt(d)), 3.5, 0, TAU);
    ctx.fillStyle = alpha(col.accent, 0.7);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(X(st.day), Y(alt(st.day)), 9, 0, TAU);
  ctx.fillStyle = col.accent;
  ctx.fill();
  label(ctx, 'June', X(172) + 14, Y(alt(172)), col['label-secondary'], bg, { size: 11 });
  label(ctx, 'December', X(355) + 14, Y(alt(355)), col['label-secondary'], bg, { size: 11 });
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
    st.day = ((st.day - 1 + dt * 25) % 365) + 1;
    st.slider?.set(Math.round(st.day));
    moving = true;
  }
  const faint = alpha(col['label-tertiary'], 0.5);
  if (ch === 'noon') chart(ctx, w, h, col, bg, [[eot, col.accent, 3]]);
  else if (ch === 'tilt') chart(ctx, w, h, col, bg, [[eot, faint, 1.5], [tiltPart, col['hiw-ink-1'], 3]]);
  else if (ch === 'orbit') chart(ctx, w, h, col, bg, [[eot, faint, 1.5], [tiltPart, faint, 1.5], [orbitPart, col['hiw-ink-2'], 3]]);
  else if (ch === 'figure') figure(ctx, w, h, col, bg);
  const d = Math.round(st.day), e = eot(d);
  r?.set('date', dateOf(d));
  r?.set('eot', `${fmt(Math.abs(e), 1)} min ${e >= 0 ? 'ahead' : 'behind'}`);
  const noon = 12 * 60 - e;
  r?.set('noon', `${String(Math.floor(noon / 60)).padStart(2, '0')}:${String(Math.floor(noon % 60)).padStart(2, '0')}`);
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ noon: 'A sundial against a clock, through the year', tilt: 'The part caused by the tilt', orbit: 'The part caused by the oval orbit', figure: 'The Sun at 12:00 GMT in Greenwich, all year' }[id]);
  st.slider = ui.slider({ label: 'Day', min: 1, max: 365, value: Math.round(st.day), format: (v) => dateOf(v), onInput(v) { st.day = v; api.invalidate(); } });
  st.readout = api.readout([{ key: 'date', label: 'Date' }, { key: 'eot', label: 'Sundial against clock' }, { key: 'noon', label: 'Sun highest in Greenwich, GMT' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

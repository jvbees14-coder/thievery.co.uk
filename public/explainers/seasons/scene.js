// ---------------------------------------------------------------------------
// Why there are seasons: the scene.
//
// One day of the year, shared by every chapter. Chapter 1 is the orbit seen
// from above, the axis always leaning the same way; chapter 2 is a beam of
// noon sunlight landing on the ground; chapter 3 is the length of the day
// through the year at a chosen latitude; chapter 4 is the orbit drawn to
// scale, to show how little the distance changes.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, glow, TOKENS } from '../shared/draw.js';
import { TILT, declination, noonHeight, dayLength, distance, dateOf, MONTHS, ECC } from './art.js';

const LONDON = 51.5;
const st = { day: 172, lat: LONDON, readout: null };

function drawEarth(ctx, x, y, r, sunX, sunY, col) {
  const toSun = Math.atan2(sunY - y, sunX - x);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = col['hiw-ink-1'];
  ctx.fill();
  // The night half.
  ctx.beginPath();
  ctx.arc(x, y, r, toSun + Math.PI / 2, toSun + (3 * Math.PI) / 2);
  ctx.closePath();
  ctx.fillStyle = alpha(col.back, 0.65);
  ctx.fill();
  // The axis, always leaning the same way: north tilted to the right.
  const t = (TILT * Math.PI) / 180;
  ctx.strokeStyle = col.label;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - Math.sin(t) * r * 1.5, y + Math.cos(t) * r * 1.5);
  ctx.lineTo(x + Math.sin(t) * r * 1.5, y - Math.cos(t) * r * 1.5);
  ctx.stroke();
  label(ctx, 'N', x + Math.sin(t) * r * 1.5 + 4, y - Math.cos(t) * r * 1.5 - 8, col.label, null, { size: 11, weight: 700 });
  // The equator.
  ctx.strokeStyle = alpha(col.label, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(t) * r, y - Math.sin(t) * r);
  ctx.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
  ctx.stroke();
}

function drawOrbit(ctx, w, h, col, bg, toScale) {
  const cx = w / 2, cy = h / 2 + 20;
  const rx = Math.min(w * 0.5 - 48, (h - 80) * 0.75), ry = toScale ? rx * Math.sqrt(1 - ECC * ECC) : rx * 0.45;
  // The Sun sits at a focus; drawn to scale that is barely off centre.
  const sx = toScale ? cx + rx * ECC : cx, sy = cy;
  ctx.strokeStyle = col.separator;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.stroke();
  glow(ctx, sx, sy, col.accent, toScale ? 10 : 18, 2.4, 0.6);
  ctx.beginPath();
  ctx.arc(sx, sy, toScale ? 10 : 18, 0, TAU);
  ctx.fillStyle = col.accent;
  ctx.fill();
  // Where the Earth is: the June solstice on the left of the Sun, so the
  // north end of the axis leans towards it then. Perihelion (3 January) is
  // nearly opposite, on the right.
  const a = Math.PI + (TAU * (st.day - 172)) / 365;
  const ex = cx + Math.cos(a) * rx, ey = cy - Math.sin(a) * ry;
  if (!toScale) {
    for (const [d, name] of [[172, 'June'], [265, 'September'], [355, 'December'], [80, 'March']]) {
      const b = Math.PI + (TAU * (d - 172)) / 365;
      // June and December sit under their points, March and September outside theirs.
      const side = d === 172 || d === 355;
      const lx = cx + Math.cos(b) * rx, ly = side ? cy + 40 : cy - Math.sin(b) * (ry + 22);
      label(ctx, name, lx, ly, col['label-tertiary'], bg, { size: 11, align: 'center' });
    }
  } else {
    label(ctx, 'Closest, early January', cx + rx - 24, cy + 40, col['label-tertiary'], bg, { size: 11, align: 'right' });
    label(ctx, 'Farthest, early July', cx - rx + 24, cy + 40, col['label-tertiary'], bg, { size: 11 });
  }
  drawEarth(ctx, ex, ey, toScale ? 12 : 22, sx, sy, col);
}

function drawBeam(ctx, w, h, col, bg) {
  const e = Math.max(1, noonHeight(LONDON, st.day));
  const ground = h - 60, gx = w / 2;
  const rad = (e * Math.PI) / 180;
  const beam = Math.min(w, h) * 0.18;
  const foot = beam / Math.sin(rad);
  // The footprint on the ground.
  ctx.fillStyle = alpha(col.accent, 0.35);
  ctx.fillRect(gx - foot / 2, ground - 4, foot, 8);
  // The beam itself, coming down from the upper left.
  const len = Math.min(w, h) * 0.7;
  const dx = -Math.cos(rad), dy = -Math.sin(rad);
  ctx.beginPath();
  ctx.moveTo(gx - foot / 2, ground);
  ctx.lineTo(gx - foot / 2 + dx * len, ground + dy * len);
  ctx.lineTo(gx + foot / 2 + dx * len, ground + dy * len);
  ctx.lineTo(gx + foot / 2, ground);
  ctx.closePath();
  ctx.fillStyle = alpha(col.accent, 0.18);
  ctx.fill();
  ctx.strokeStyle = alpha(col.accent, 0.7);
  for (let k = 0; k <= 4; k++) {
    const f = -0.5 + k / 4;
    ctx.beginPath();
    ctx.moveTo(gx + f * foot, ground);
    ctx.lineTo(gx + f * foot + dx * len, ground + dy * len);
    ctx.stroke();
  }
  ctx.strokeStyle = col['separator-strong'];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, ground);
  ctx.lineTo(w, ground);
  ctx.stroke();
  ctx.lineWidth = 1;
  // The angle.
  ctx.beginPath();
  ctx.arc(gx + foot / 2, ground, 40, Math.PI, Math.PI + rad);
  ctx.strokeStyle = col['label-secondary'];
  ctx.stroke();
  label(ctx, `${fmt(e, 0)}°`, gx + foot / 2 - 50, ground - 14, col.label, bg, { size: 13, weight: 700, align: 'right' });
  label(ctx, 'The same beam of sunlight, at noon in London', w / 2, ground + 26, col['label-tertiary'], bg, { size: 11, align: 'center' });
}

function drawDaylight(ctx, w, h, col, bg) {
  const x0 = 44, x1 = w - 16, y0 = 60, y1 = h - 36;
  const X = (d) => x0 + ((d - 1) / 364) * (x1 - x0), Y = (hr) => y1 - (hr / 24) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  ctx.lineWidth = 1;
  for (const hr of [0, 6, 12, 18, 24]) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(hr));
    ctx.lineTo(x1, Y(hr));
    ctx.stroke();
    label(ctx, `${hr}h`, x0 - 6, Y(hr), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  MONTHS.forEach((m, i) => label(ctx, m, X(15 + i * 30.4), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' }));
  const curve = (lat, colr, width) => {
    ctx.strokeStyle = colr;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let d = 1; d <= 365; d++) {
      const p = [X(d), Y(dayLength(lat, d))];
      d === 1 ? ctx.moveTo(...p) : ctx.lineTo(...p);
    }
    ctx.stroke();
  };
  curve(0, alpha(col['label-tertiary'], 0.6), 1.5);
  curve(st.lat, col.accent, 3);
  label(ctx, 'Equator', x1, Y(12) - 10, col['label-tertiary'], bg, { size: 11, align: 'right' });
  ctx.beginPath();
  ctx.arc(X(st.day), Y(dayLength(st.lat, st.day)), 6, 0, TAU);
  ctx.fillStyle = col['hiw-ink-1'];
  ctx.fill();
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  let moving = false;
  if (api.playing && api.motion) {
    st.day = ((st.day - 1 + dt * 30) % 365) + 1;
    st.slider?.set(Math.round(st.day));
    moving = true;
  }
  if (ch === 'tilt') drawOrbit(ctx, w, h, col, bg, false);
  else if (ch === 'angle') drawBeam(ctx, w, h, col, bg);
  else if (ch === 'daylight') drawDaylight(ctx, w, h, col, bg);
  else if (ch === 'distance') drawOrbit(ctx, w, h, col, bg, true);

  const r = st.readout, d = Math.round(st.day);
  if (r) {
    r.set('date', dateOf(d));
    const dec = declination(d);
    r.set('lean', Math.abs(dec) < 1 ? 'Neither' : dec > 0 ? 'Northern' : 'Southern');
    const e = noonHeight(LONDON, d);
    r.set('noon', `${fmt(e, 0)}°`);
    r.set('spread', `${fmt(Math.sin((noonHeight(LONDON, 172) * Math.PI) / 180) / Math.sin((Math.max(1, e) * Math.PI) / 180), 1)}×`);
    const len = dayLength(st.lat, d);
    r.set('length', len >= 24 ? 'All day' : len <= 0 ? 'None' : `${Math.floor(len)}h ${String(Math.round((len % 1) * 60)).padStart(2, '0')}m`);
    r.set('dist', `${fmt(distance(d), 1)} million km`);
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({
    tilt: 'The orbit from above, not to scale',
    angle: 'Noon in London, 51.5° north',
    daylight: 'Sunrise to sunset through the year',
    distance: 'The orbit drawn to scale',
  }[id]);
  st.slider = ui.slider({
    label: 'Day of the year',
    min: 1,
    max: 365,
    value: Math.round(st.day),
    format: (v) => dateOf(v),
    onInput(v) {
      st.day = v;
      api.invalidate();
    },
  });
  if (id === 'daylight') {
    ui.slider({
      label: 'Latitude',
      min: 0,
      max: 75,
      value: st.lat,
      format: (v) => `${v}° north`,
      onInput(v) {
        st.lat = v;
        api.invalidate();
      },
    });
  }
  const rows = {
    tilt: [{ key: 'date', label: 'Date' }, { key: 'lean', label: 'Hemisphere leaning to the Sun' }, { key: 'noon', label: 'Noon Sun in London' }],
    angle: [{ key: 'date', label: 'Date' }, { key: 'noon', label: 'Noon Sun' }, { key: 'spread', label: 'Spread out, compared with June' }],
    daylight: [{ key: 'date', label: 'Date' }, { key: 'length', label: 'Daylight' }],
    distance: [{ key: 'date', label: 'Date' }, { key: 'dist', label: 'Distance to the Sun' }, { key: 'lean', label: 'Hemisphere leaning to the Sun' }],
  }[id];
  st.readout = api.readout(rows);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

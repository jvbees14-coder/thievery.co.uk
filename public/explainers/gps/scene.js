// ---------------------------------------------------------------------------
// How GPS finds you: the scene.
//
// Two pictures, and a crossfade between them.
//
//   The globe (chapters 1 and 2): the Earth and all 32 satellites in three
//   dimensions, drawn by globe.js. Time runs fast so the orbits can be seen
//   moving, and in chapter 2 each satellite in view sends out a ring.
//
//   The slice (chapters 3 to 6): a flat cut through the Earth and three
//   satellites, in kilometres, seen through a camera that can glide from
//   the whole orbit down to a few hundred metres round the reader's pin.
//   In a slice every sphere is a circle, which is the whole reason for it:
//   circles can be dragged about and seen to meet.
//
// Every number on screen is worked out from the positions on screen, with
// the real speed of light. Two things are not shown at their real speed,
// and the scene says so in its corner: the orbits are sped up, and the
// signals are slowed down (at their real speed a signal crosses the whole
// picture in a fifteenth of a second).
//
// The figures and where they come from are in the sources at the bottom
// of the page, server/views/how-it-works/gps.html.
// ---------------------------------------------------------------------------

import { mount, Smooth, alpha, fmt, signed, clamp, lerp, ease, TAU } from '../engine.js';
import * as G from './globe.js';

const { RE, A, C } = G;
const DEG = Math.PI / 180;

const HOME = { lat: 51.5074, lon: -0.1278 }; // London, where the site is from
const SLOW = 20;                // signals are drawn this many times slower than light
const KM_PER_US = C / 1e6;      // 0.29979 km of light travel in a microsecond
const SIGMA_M = 5;              // a typical error on one range, in metres, for the fix's quality
// Relativity, in microseconds a day, for a GPS clock against one on the ground
// (Ashby, 2003): its speed slows it, the weaker gravity up there speeds it up.
const SPECIAL = -7.2;
const GENERAL = 45.7;
const NET = SPECIAL + GENERAL;
const DAY_IN = 16;              // seconds the scene takes to play one day in chapter 6

// --- a timer that eases ----------------------------------------------------------------

class Tween {
  constructor(dur) {
    this.dur = dur;
    this.p = 1;
  }
  restart() {
    this.p = 0;
  }
  step(dt, instant) {
    if (this.p >= 1) return false;
    this.p = instant ? 1 : Math.min(1, this.p + dt / this.dur);
    return true;
  }
  get e() {
    return ease.inOut(this.p);
  }
}

// --- the slice: three satellites, a pin, and a camera --------------------------------------

const SATS = [
  { id: 'A', ink: 'hiw-ink-1', angle: 135 * DEG, home: 135 * DEG },
  { id: 'B', ink: 'hiw-ink-2', angle: 58 * DEG, home: 58 * DEG },
  { id: 'C', ink: 'hiw-ink-3', angle: 98 * DEG, home: 98 * DEG },
];
for (const s of SATS) {
  s.on = true;
  s.show = new Smooth(0, 5);
}

const st = {
  t: 0,                         // simulated seconds, for the globe
  clock: 0,                     // seconds of animation, for the signals
  rate: new Smooth(900, 2),     // how much faster than life the globe runs
  yaw: new Smooth(0, 1.6),
  view: 1,                      // 1 the globe, 0 the slice
  viewFrom: 1,
  viewTo: 1,
  fade: new Tween(1.1),
  pin: 90 * DEG,
  cam: { from: { x: 0, y: 0, s: 1 }, to: null, target: null, tween: new Tween(1.8) },
  bias: 1,                      // the receiver's clock error, microseconds
  solve: false,
  solved: new Smooth(0, 2.4),
  rel: { special: true, general: true, fixed: false, hours: 0, hold: 0 },
  highlight: new Set(),
  arrivals: new Map(),          // satellite id -> travel time of the last signal, ms
  readout: null,
  ui: {},
};

const satPos = (s) => [A * Math.cos(s.angle), A * Math.sin(s.angle)];
const pinPos = () => [RE * Math.cos(st.pin), RE * Math.sin(st.pin)];
const up = () => [Math.cos(st.pin), Math.sin(st.pin)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const elev = (s) => {
  const p = pinPos(), q = satPos(s), n = up();
  const d = [q[0] - p[0], q[1] - p[1]];
  return Math.asin((d[0] * n[0] + d[1] * n[1]) / Math.hypot(d[0], d[1]));
};
const inView = (s) => elev(s) > 0;

// Where the camera should be for a chapter, given the canvas's size. The
// slice's cameras are in kilometres: a centre and pixels per kilometre.
function camFor(id, w, h) {
  const p = pinPos(), n = up();
  if (id === 'clock') return { x: p[0], y: p[1] + 0.25, s: Math.min(w, h) / 2 / 1.9 };
  if (id === 'einstein') return { x: p[0] + n[0] * 5, y: p[1] + n[1] * 5, s: Math.min(w, h) / 2 / 16.5 };
  // The whole orbit's upper half, with the Earth in the bottom of the frame.
  const top = A * 1.06, bottom = -RE * 1.25;
  return { x: 0, y: (top + bottom) / 2, s: Math.min(w / (2 * A * 1.08), h / (top - bottom)) };
}

// The camera between two shots. Zooming in, the place being zoomed to moves
// steadily to the middle of the screen while the scale grows; zooming out,
// the place being left does. Interpolating the centre and the scale
// separately would throw the pin off screen half way through a zoom of a
// thousand times, which is what this one is.
function camNow(w, h) {
  const { from: a, tween } = st.cam;
  const b = st.cam.target ? camFor(st.cam.target, w, h) : a;
  const e = tween.e;
  const s = Math.exp(lerp(Math.log(a.s), Math.log(b.s), e));
  if (b.s >= a.s) {
    const k = ((1 - e) * a.s) / s;
    return { x: b.x - k * (b.x - a.x), y: b.y - k * (b.y - a.y), s };
  }
  const k = (e * b.s) / s;
  return { x: a.x + k * (b.x - a.x), y: a.y + k * (b.y - a.y), s };
}
let lastCam = { x: 0, y: 0, s: 1 };
function aimCamera(id, instant) {
  st.cam.from = { ...lastCam };
  st.cam.target = id;
  st.cam.tween.restart();
  if (instant) st.cam.tween.p = 1;
}

const toS = (cam, w, h, x, y) => [w / 2 + (x - cam.x) * cam.s, h / 2 - (y - cam.y) * cam.s];
const toW = (cam, w, h, sx, sy) => [cam.x + (sx - w / 2) / cam.s, cam.y - (sy - h / 2) / cam.s];

// A circle of any size. One a few thousand kilometres across seen from a
// few hundred metres away would be millions of pixels round, which a
// canvas draws badly, so only the stretch of it near the screen is drawn.
function circlePath(ctx, w, h, sx, sy, R) {
  if (R < 3000) {
    ctx.moveTo(sx + R, sy);
    ctx.arc(sx, sy, R, 0, TAU);
    return;
  }
  const dx = w / 2 - sx, dy = h / 2 - sy;
  const d = Math.hypot(dx, dy), diag = Math.hypot(w, h);
  if (Math.abs(d - R) > diag) return;
  const mid = Math.atan2(dy, dx);
  const span = Math.min(Math.PI, (1.6 * diag) / R);
  for (let i = 0; i <= 64; i++) {
    const a = mid - span + (2 * span * i) / 64;
    const x = sx + R * Math.cos(a), y = sy + R * Math.sin(a);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
}
// The same, filled: a ring segment thick enough to cover the screen.
function discPath(ctx, w, h, sx, sy, R) {
  if (R < 3000) {
    ctx.moveTo(sx + R, sy);
    ctx.arc(sx, sy, R, 0, TAU);
    return;
  }
  const dx = w / 2 - sx, dy = h / 2 - sy;
  const mid = Math.atan2(dy, dx), diag = Math.hypot(w, h);
  const span = Math.min(Math.PI, (1.6 * diag) / R);
  const inner = R - 3 * diag;
  for (let i = 0; i <= 64; i++) {
    const a = mid - span + (2 * span * i) / 64;
    const x = sx + R * Math.cos(a), y = sy + R * Math.sin(a);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  for (let i = 64; i >= 0; i--) {
    const a = mid - span + (2 * span * i) / 64;
    ctx.lineTo(sx + inner * Math.cos(a), sy + inner * Math.sin(a));
  }
  ctx.closePath();
}

/** Where two circles cross, or null. */
function meet(c1, r1, c2, r2) {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1];
  const d = Math.hypot(dx, dy);
  if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const mx = c1[0] + (a * dx) / d, my = c1[1] + (a * dy) / d;
  return [
    [mx + (hh * dy) / d, my - (hh * dx) / d],
    [mx - (hh * dy) / d, my + (hh * dx) / d],
  ];
}

/**
 * How good a fix is, from where the satellites are: the dilution of
 * precision, times a typical error on one range. Satellites bunched in one
 * part of the sky cross at shallow angles and the fix smears out along them.
 */
function fixQuality(sats) {
  const p = pinPos();
  let a = 0, b = 0, d = 0;
  for (const s of sats) {
    const q = satPos(s);
    const r = dist(p, q);
    const ux = (p[0] - q[0]) / r, uy = (p[1] - q[1]) / r;
    a += ux * ux;
    b += ux * uy;
    d += uy * uy;
  }
  const det = a * d - b * b;
  if (sats.length < 2 || det < 1e-9) return Infinity;
  return SIGMA_M * Math.sqrt((a + d) / det);
}

// --- drawing helpers -------------------------------------------------------------------------

let FONT = 'system-ui, sans-serif';
function text(ctx, s, x, y, col, bg, { size = 12, weight = 600, align = 'left', base = 'middle' } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = alpha(bg, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = col;
  ctx.fillText(s, x, y);
}

function pinMark(ctx, x, y, col, label, t, below = false) {
  const pulse = (t % 2) / 2;
  ctx.beginPath();
  ctx.arc(x, y, 6 + pulse * 14, 0, TAU);
  ctx.strokeStyle = alpha(col.label, 0.5 * (1 - pulse));
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, TAU);
  ctx.fillStyle = col.label;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, TAU);
  ctx.fillStyle = col['hiw-scene-bg'];
  ctx.fill();
  if (label) text(ctx, label, x + 10, below ? y + 16 : y - 12, col.label, col['hiw-scene-bg'], { size: 13 });
}

function focusRing(ctx, x, y, col) {
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, TAU);
  ctx.strokeStyle = col['focus-ring'];
  ctx.lineWidth = 3;
  ctx.stroke();
}

function scaleBar(ctx, cam, w, h, col) {
  const want = (w * 0.22) / cam.s;
  const pow = 10 ** Math.floor(Math.log10(want));
  const km = [1, 2, 5, 10].map((m) => m * pow).filter((v) => v <= want).pop() || pow;
  const px = km * cam.s;
  const x = 14, y = h - 40;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y);
  ctx.lineTo(x + px, y);
  ctx.lineTo(x + px, y - 4);
  ctx.strokeStyle = col['label-secondary'];
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const words = km >= 1 ? `${fmt(km, km < 10 && km % 1 ? 1 : 0)} km` : `${fmt(km * 1000)} m`;
  text(ctx, words, x, y - 12, col['label-secondary'], col['hiw-scene-bg'], { size: 12, weight: 500 });
}

// --- the globe --------------------------------------------------------------------------------

const homeAngle = (t) => HOME.lon * DEG + (TAU * t) / G.SIDEREAL_DAY;

function utc(t) {
  // The globe's clock starts at noon; the label carries it to the microsecond.
  const s = 12 * 3600 + t;
  const hh = Math.floor(s / 3600) % 24, mm = Math.floor(s / 60) % 60, ss = s % 60;
  const pad = (n, k = 2) => String(n).padStart(k, '0');
  const whole = Math.floor(ss);
  return `${pad(hh)}:${pad(mm)}:${pad(whole)}.${pad(Math.floor((ss - whole) * 1e6), 6)}`;
}

function pickHighlight(t) {
  const you = G.groundAt(HOME.lat, HOME.lon, t);
  const keep = [...st.highlight].filter((i) => G.elevation(G.satAt(G.SATS[i], t), you) > 8 * DEG);
  if (keep.length === 4) return;
  const ranked = G.SATS.map((s, i) => [i, G.elevation(G.satAt(s, t), you)])
    .filter(([i, e]) => e > 15 * DEG && !keep.includes(i))
    .sort((a, b) => b[1] - a[1]);
  st.highlight = new Set([...keep, ...ranked.slice(0, 4 - keep.length).map(([i]) => i)]);
}

function drawGlobe(ctx, f, api, fadeIn) {
  const col = api.colours;
  const ink = G.inks(col);
  const cam = G.fit(f.w, f.h, st.yaw.v);
  cam.scale *= 1 + (1 - fadeIn) * 0.6;
  const t = st.t;
  const you = G.groundAt(HOME.lat, HOME.lon, t);
  const ch = api.chapter;
  const signals = ch === 'shout';
  if (signals) pickHighlight(t);
  const placed = G.drawGlobe(ctx, cam, t, ink, { highlight: signals ? st.highlight : null, dim: signals ? 0.6 : 0 });
  const q = G.project(cam, you);
  const youShown = q[2] > 0;

  let inViewCount = 0, nearest = Infinity;
  G.SATS.forEach((s) => {
    const p = G.satAt(s, t);
    if (G.elevation(p, you) > 0) {
      inViewCount++;
      nearest = Math.min(nearest, G.distance(p, you));
    }
  });

  if (signals) {
    const boxes = [];
    // Each satellite in view sends out a ring, its signal spreading at (a
    // twentieth of) the speed of light. A ring is a sphere seen side on.
    let i = 0;
    for (const idx of st.highlight) {
      const p = G.satAt(G.SATS[idx], t);
      const sq = placed[idx];
      const d = G.distance(p, you);
      if (youShown) {
        ctx.beginPath();
        ctx.setLineDash([2, 5]);
        ctx.moveTo(sq[0], sq[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.strokeStyle = alpha(col.accent, 0.35);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const period = 2.6;
      const travel = (d / C) * SLOW;
      for (let k = 0; k < 2; k++) {
        const age = ((st.clock + i * 0.65 + k * period) % (period * 2));
        const r = age * (C / SLOW);
        const fade = clamp(1 - r / (d * 1.25), 0, 1);
        if (fade <= 0) continue;
        ctx.beginPath();
        ctx.arc(sq[0], sq[1], r * cam.scale, 0, TAU);
        ctx.strokeStyle = alpha(col.accent, 0.14 * fade);
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = alpha(col['accent-strong'], 0.8 * fade);
        ctx.lineWidth = 1.25;
        ctx.stroke();
        if (youShown && Math.abs(age - travel) < 0.12) {
          ctx.beginPath();
          ctx.arc(q[0], q[1], 16, 0, TAU);
          ctx.fillStyle = alpha(col.accent, 0.25);
          ctx.fill();
        }
      }
      // What the signal carries: who sent it, and when, to the microsecond.
      // Labels sit on the far side of the satellite from the Earth and step
      // out of each other's way.
      const flip = sq[0] < cam.cx;
      const lx = sq[0] + (flip ? -12 : 12);
      let ly = sq[1];
      const box = (y) => ({ x0: flip ? lx - 112 : lx, x1: flip ? lx : lx + 112, y0: y - 16, y1: y + 16 });
      const clash = (b) => boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
      for (let k = 0; k < 6 && clash(box(ly)); k++) ly += sq[1] < cam.cy ? -34 : 34;
      boxes.push(box(ly));
      text(ctx, `G${String(G.SATS[idx].prn).padStart(2, '0')}`, lx, ly - 8, col['accent-strong'], col['hiw-scene-bg'], { size: 12, weight: 700, align: flip ? 'right' : 'left' });
      text(ctx, utc(t - d / C), lx, ly + 8, col['label-secondary'], col['hiw-scene-bg'], { size: 11, weight: 500, align: flip ? 'right' : 'left' });
      i++;
    }
  }

  if (youShown) pinMark(ctx, q[0], q[1], col, 'You', st.clock);

  const r = st.readout;
  if (r && ch === 'big-picture') {
    r.set('view', fmt(inViewCount));
    r.set('clock', utc(t).slice(0, 5));
  }
  if (r && ch === 'shout') {
    r.set('view', fmt(inViewCount));
    r.set('near', `${fmt(nearest)} km`);
    r.set('time', `${fmt((nearest / C) * 1000, 1)} ms`);
  }
}

// --- the slice ----------------------------------------------------------------------------------

function drawSlice(ctx, f, api) {
  const { w, h } = f;
  const base = ctx.globalAlpha;
  const col = api.colours;
  const bg = col['hiw-scene-bg'];
  const cam = camNow(w, h);
  lastCam = cam;
  const ch = api.chapter;
  const P = pinPos();
  const [px, py] = toS(cam, w, h, P[0], P[1]);
  const [ox, oy] = toS(cam, w, h, 0, 0);

  // A grid, once the view is small enough for one to say something.
  const span = w / cam.s;
  if (span < 400) {
    const step = 10 ** Math.floor(Math.log10(span / 4));
    const g = step * cam.s;
    ctx.beginPath();
    const [gx0, gy0] = toS(cam, w, h, Math.floor(cam.x / step) * step, Math.floor(cam.y / step) * step);
    for (let x = gx0 - Math.ceil(gx0 / g) * g; x < w; x += g) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = gy0 - Math.ceil(gy0 / g) * g; y < h; y += g) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.strokeStyle = alpha(col.separator, 0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // The orbit, then the Earth.
  ctx.beginPath();
  circlePath(ctx, w, h, ox, oy, A * cam.s);
  ctx.setLineDash([3, 6]);
  ctx.strokeStyle = alpha(col['label-secondary'], 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  discPath(ctx, w, h, ox, oy, RE * cam.s);
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fill();
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.12);
  ctx.fill();
  ctx.beginPath();
  circlePath(ctx, w, h, ox, oy, RE * cam.s);
  ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.12);
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.7);
  ctx.lineWidth = 1.25;
  ctx.stroke();

  const shown = SATS.filter((s) => s.show.v > 0.01);
  const live = SATS.filter((s) => s.on && s.show.target > 0 && inView(s));

  // Chapter 3: one satellite, one signal at a time, and a stopwatch.
  if (ch === 'delay') {
    const s = SATS[0];
    const S = satPos(s);
    const [sx, sy] = toS(cam, w, h, S[0], S[1]);
    const d = dist(S, P);
    const visible = inView(s);
    ctx.beginPath();
    ctx.setLineDash([2, 5]);
    ctx.moveTo(sx, sy);
    ctx.lineTo(px, py);
    ctx.strokeStyle = alpha(visible ? col.accent : col.danger, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    if (visible) {
      const period = 2.2;
      const travel = (d / C) * SLOW;
      const age = st.clock % period;
      if (age < travel) {
        const k = age / travel;
        const x = lerp(sx, px, k), y = lerp(sy, py, k);
        const tail = 0.22;
        const k0 = Math.max(0, k - tail);
        const g = ctx.createLinearGradient(lerp(sx, px, k0), lerp(sy, py, k0), x, y);
        g.addColorStop(0, alpha(col.accent, 0));
        g.addColorStop(1, alpha(col['accent-strong'], 0.95));
        ctx.beginPath();
        ctx.moveTo(lerp(sx, px, k0), lerp(sy, py, k0));
        ctx.lineTo(x, y);
        ctx.strokeStyle = g;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
        G.satDot(ctx, x, y, col['accent-strong'], 1.2, 1);
        // The wavefront the dot is riding on, faintly.
        ctx.beginPath();
        circlePath(ctx, w, h, sx, sy, age * (C / SLOW) * cam.s);
        ctx.strokeStyle = alpha(col.accent, 0.18 * (1 - k));
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (age < travel + 0.5) {
        const k = (age - travel) / 0.5;
        ctx.beginPath();
        ctx.arc(px, py, 6 + k * 26, 0, TAU);
        ctx.strokeStyle = alpha(col['accent-strong'], 0.8 * (1 - k));
        ctx.lineWidth = 2;
        ctx.stroke();
        st.arrivals.set('A', (d / C) * 1000);
      }
      const mx = (sx + px) / 2, my = (sy + py) / 2;
      text(ctx, `${fmt(d)} km`, mx + 10, my, col.label, bg, { size: 13 });
      text(ctx, `${fmt((d / C) * 1000, 2)} ms`, mx + 10, my + 17, col['accent-strong'], bg, { size: 13 });
    }
    if (st.readout) {
      st.readout.set('dist', visible ? `${fmt(d)} km` : '–');
      st.readout.set('time', visible ? `${fmt((d / C) * 1000, 2)} ms` : '–');
      st.readout.set('elev', `${fmt(elev(s) / DEG)}°`);
    }
    api.status(visible ? '' : 'Below your horizon: the Earth is in the way.');
  }

  // Chapter 4: ranges become circles, and circles meet.
  if (ch === 'trilateration') {
    for (const s of live) {
      const S = satPos(s);
      const [sx, sy] = toS(cam, w, h, S[0], S[1]);
      const r = dist(S, P);
      const ink = col[s.ink];
      // A ring on its way out to the circle, so the circle is plainly the
      // place the signal has reached.
      const period = 2.8, i = SATS.indexOf(s);
      const age = (st.clock + i * 0.9) % period;
      const rr = age * (C / SLOW);
      if (rr < r) {
        ctx.beginPath();
        circlePath(ctx, w, h, sx, sy, rr * cam.s);
        ctx.strokeStyle = alpha(ink, 0.35 * (rr / r));
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.beginPath();
      circlePath(ctx, w, h, sx, sy, r * cam.s);
      ctx.strokeStyle = alpha(ink, 0.18 * s.show.v);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = alpha(ink, 0.9 * s.show.v);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    trilaterationStatus(ctx, cam, w, h, live, col);
  }

  // Chapter 5: the receiver's clock is out, so every range is out by the
  // same distance, and the circles no longer share a point.
  if (ch === 'clock') {
    const off = (st.bias - st.solved.v) * KM_PER_US;
    const circles = SATS.map((s) => ({ s, c: satPos(s), r: dist(satPos(s), P) + off }));
    for (const { s, c, r } of circles) {
      const [sx, sy] = toS(cam, w, h, c[0], c[1]);
      ctx.beginPath();
      circlePath(ctx, w, h, sx, sy, r * cam.s);
      ctx.strokeStyle = alpha(col[s.ink], 0.18);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = col[s.ink];
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Its name, where the line leaves the side of the screen nearest
      // its satellite.
      const toward = Math.atan2(c[1] - P[1], c[0] - P[0]);
      const along = toward + Math.PI / 2;
      const reach = (Math.min(w, h) * 0.42) / cam.s;
      const base = [c[0] - Math.cos(toward) * r, c[1] - Math.sin(toward) * r];
      const lp = toS(cam, w, h, base[0] + Math.cos(along) * reach, base[1] + Math.sin(along) * reach);
      text(ctx, s.id, clamp(lp[0], 16, w - 16), clamp(lp[1] - 10, 60, h - 64), col[s.ink], bg, { size: 13, weight: 700, align: 'center' });
    }
    const corners = [];
    for (let i = 0; i < 3; i++) {
      const a = circles[i], b = circles[(i + 1) % 3];
      const m = meet(a.c, a.r, b.c, b.r);
      if (m) corners.push(dist(m[0], P) < dist(m[1], P) ? m[0] : m[1]);
    }
    let gap = NaN;
    if (corners.length === 3) {
      const pts = corners.map((c) => toS(cam, w, h, c[0], c[1]));
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fillStyle = alpha(col.danger, 0.16);
      ctx.fill();
      gap = Math.max(dist(corners[0], corners[1]), dist(corners[1], corners[2]), dist(corners[2], corners[0])) * 1000;
      if (gap > 15) {
        const g = [(pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3];
        ctx.beginPath();
        ctx.arc(g[0], g[1], 7, 0, TAU);
        ctx.strokeStyle = col.danger;
        ctx.lineWidth = 2;
        ctx.stroke();
        text(ctx, 'Best guess', g[0] + 12, g[1] + 14, col.danger, bg, { size: 12 });
      }
    }
    if (st.readout) {
      st.readout.set('bias', `${signed(st.bias, 2)} μs`);
      st.readout.set('range', `${signed(off * 1000)} m`);
      st.readout.set('gap', Number.isFinite(gap) ? `${fmt(gap)} m` : '–');
      st.readout.set('found', st.solve ? `${signed(st.solved.v, 2)} μs` : '–');
    }
    const done = st.solve && Math.abs(st.solved.v - st.bias) < 0.005;
    api.status(
      st.solve
        ? done ? `Clock error found: ${signed(st.bias, 2)} μs. The circles meet again.` : 'Solving for the clock error…'
        : Math.abs(st.bias) < 0.005 ? 'A perfect clock: the circles meet.' : 'The circles no longer meet in one place.',
    );
  }

  // Chapter 6: the satellites' clocks drift, and every range drifts with them.
  if (ch === 'einstein') {
    const rate = (st.rel.special ? SPECIAL : 0) + (st.rel.general ? GENERAL : 0) - (st.rel.fixed ? NET : 0);
    const offUs = (rate * st.rel.hours) / 24;
    const errKm = offUs * KM_PER_US;
    for (const s of SATS) {
      const c = satPos(s);
      const r = dist(c, P) - errKm;
      const [sx, sy] = toS(cam, w, h, c[0], c[1]);
      ctx.beginPath();
      circlePath(ctx, w, h, sx, sy, r * cam.s);
      ctx.strokeStyle = alpha(col[s.ink], 0.18);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = col[s.ink];
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // A dimension line from the pin to the circle of the satellite overhead.
    if (Math.abs(errKm) > 0.05) {
      const c = satPos(SATS[2]);
      const d = dist(c, P);
      const u = [(c[0] - P[0]) / d, (c[1] - P[1]) / d];
      const end = toS(cam, w, h, P[0] + u[0] * errKm, P[1] + u[1] * errKm);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(end[0], end[1]);
      ctx.strokeStyle = col.label;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      for (const e of [[px, py], end]) {
        ctx.beginPath();
        ctx.moveTo(e[0] - 6, e[1]);
        ctx.lineTo(e[0] + 6, e[1]);
        ctx.stroke();
      }
      text(ctx, `${fmt(Math.abs(errKm), 1)} km`, (px + end[0]) / 2 - 10, (py + end[1]) / 2, col.label, bg, { size: 13, weight: 700, align: 'right' });
    }
    if (st.readout) {
      st.readout.set('hours', `${fmt(st.rel.hours, 1)} h`);
      st.readout.set('ahead', `${signed(offUs, 1)} μs`);
      st.readout.set('err', `${fmt(Math.abs(errKm), 2)} km`);
      st.readout.set('rate', `${signed(rate, 1)} μs`);
    }
    api.status(
      Math.abs(rate) < 0.01
        ? 'Corrected: the satellite clocks keep step with the ground.'
        : `Every range is now ${fmt(Math.abs(errKm), 1)} km ${errKm > 0 ? 'short' : 'long'}.`,
    );
  }

  // The satellites themselves, over everything else.
  for (const s of shown) {
    const S = satPos(s);
    const [sx, sy] = toS(cam, w, h, S[0], S[1]);
    if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;
    const ink = col[s.ink];
    ctx.globalAlpha = base * s.show.v * (s.on ? 1 : 0.4);
    G.satDot(ctx, sx, sy, ink, 1.5, s.on ? 1 : 0.3);
    const blocked = s.on && !inView(s) && ch !== 'delay';
    const name = blocked ? `${s.id} · below horizon` : s.id;
    const right = sx > w - 150;
    text(ctx, name, sx + (right ? -12 : 12), clamp(sy - 12, 64, h - 20), ink, bg, { size: 13, weight: 700, align: right ? 'right' : 'left' });
    ctx.globalAlpha = base;
    if (api.handles?.focused && api.handles.selected === s.id) focusRing(ctx, sx, sy, col);
  }

  const close = ch === 'clock' || ch === 'einstein';
  pinMark(ctx, px, py, col, close ? 'You, really' : 'You', st.clock, close);
  if (api.handles?.focused && api.handles.selected === 'pin' && (ch === 'delay' || ch === 'trilateration')) focusRing(ctx, px, py, col);
  scaleBar(ctx, cam, w, h, col);
}

const liveSats = () => SATS.filter((s) => s.on && inView(s));

function trilatWords() {
  const live = liveSats();
  const P = pinPos();
  const n = live.length;
  if (n === 0) return 'No satellites in view: no fix.';
  if (n === 1) return `One satellite: you are somewhere on circle ${live[0].id}.`;
  if (n >= 3) return 'Three satellites: one place.';
  const [a, b] = live;
  const m = meet(satPos(a), dist(satPos(a), P), satPos(b), dist(satPos(b), P));
  if (!m) return 'Two satellites, but the circles do not cross.';
  const other = dist(m[0], P) < dist(m[1], P) ? m[1] : m[0];
  const height = Math.hypot(other[0], other[1]) - RE;
  return Math.abs(height) > 300
    ? `Two satellites: two places. The other is ${fmt(Math.abs(height))} km ${height > 0 ? 'up in space' : 'underground'}, so it is this one.`
    : 'Two satellites: two places, both on the ground. A third settles it.';
}

function trilaterationStatus(ctx, cam, w, h, live, col) {
  const P = pinPos();
  const bg = col['hiw-scene-bg'];
  const n = live.length;
  if (n === 2) {
    const [a, b] = live;
    const m = meet(satPos(a), dist(satPos(a), P), satPos(b), dist(satPos(b), P));
    if (m) {
      const other = dist(m[0], P) < dist(m[1], P) ? m[1] : m[0];
      const [x, y] = toS(cam, w, h, other[0], other[1]);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, TAU);
      ctx.strokeStyle = col.label;
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, '?', x + 10, y, col.label, bg, { size: 14, weight: 700 });
    }
  }
  const q = fixQuality(live);
  if (st.readout) {
    st.readout.set('used', fmt(n));
    st.readout.set('fix', n >= 2 && Number.isFinite(q) ? `± ${q < 1000 ? fmt(q, q < 20 ? 1 : 0) : fmt(q)} m` : '–');
    let angle = '–';
    if (n >= 2) {
      let best = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = satPos(live[i]), b = satPos(live[j]);
        const ua = Math.atan2(a[1] - P[1], a[0] - P[0]), ub = Math.atan2(b[1] - P[1], b[0] - P[0]);
        let d = Math.abs(ua - ub) % Math.PI;
        if (d > Math.PI / 2) d = Math.PI - d;
        best = Math.max(best, d);
      }
      angle = `${fmt(best / DEG)}°`;
    }
    st.readout.set('angle', angle);
  }
  for (const s of SATS) st.ui.chips?.note(s.id, s.on && !inView(s) ? 'below horizon' : '');
}

// --- the chapters ------------------------------------------------------------------------------------

const GLOBE = new Set(['big-picture', 'shout']);
const SHOWS = {
  delay: ['A'],
  trilateration: ['A', 'B', 'C'],
  clock: ['A', 'B', 'C'],
  einstein: ['A', 'B', 'C'],
};

function chapter(id, api) {
  // The chapter the page opens on (from a link to #clock, say) is simply
  // there: a crossfade from a picture nobody saw is no use.
  const instant = !api.motion || !st.prev;
  const wantGlobe = GLOBE.has(id) ? 1 : 0;
  if (wantGlobe !== st.viewTo) {
    st.viewFrom = st.view;
    st.viewTo = wantGlobe;
    st.fade.restart();
    if (instant) st.fade.p = 1;
  }
  for (const s of SATS) s.show.set((SHOWS[id] || []).includes(s.id) && (id !== 'trilateration' || s.on) ? 1 : 0, instant);
  // Where things stand when a chapter opens: chapter 3's satellite starts
  // just risen, and the last two chapters start from the tidy layout
  // whatever was dragged where before.
  if (id === 'delay' && !inView(SATS[0])) SATS[0].angle = 140 * DEG;
  if (id === 'trilateration' && st.prev === 'delay') SATS[0].angle = SATS[0].home;
  if (id === 'clock' || id === 'einstein') {
    for (const s of SATS) s.angle = s.home;
    st.pin = 90 * DEG;
  }
  st.prev = id;
  if (!wantGlobe) aimCamera(id, instant || st.view > 0.5);

  const ui = api.controls();
  st.ui = {};
  st.readout = null;
  api.status('');

  if (id === 'big-picture') {
    st.rate.set(900, instant);
    st.yaw.set(homeAngle(st.t) + 140 * DEG, instant);
    api.note('Time sped up 900 times');
    st.readout = api.readout([
      { key: 'count', label: 'Satellites', value: '32' },
      { key: 'alt', label: 'Height', value: '20,200 km' },
      { key: 'period', label: 'Once round', value: '11 h 58 min' },
      { key: 'speed', label: 'Speed', value: `${fmt(G.SPEED, 2)} km/s` },
      { key: 'view', label: 'Above your horizon' },
      { key: 'clock', label: 'Simulated time (UTC)' },
    ]);
  }
  if (id === 'shout') {
    st.rate.set(30, instant);
    api.note(`Signals slowed ${SLOW} times`);
    st.readout = api.readout([
      { key: 'speed', label: 'Signal speed', value: '299,792 km/s' },
      { key: 'view', label: 'Satellites in view' },
      { key: 'near', label: 'Nearest one' },
      { key: 'time', label: 'Its signal takes' },
    ]);
  }
  if (id === 'delay') {
    api.note(`Signals slowed ${SLOW} times · orbit sped up 400 times`);
    st.readout = api.readout([
      { key: 'dist', label: 'Distance', colour: api.colours['hiw-ink-1'] },
      { key: 'time', label: 'Travel time' },
      { key: 'elev', label: 'Above the horizon' },
    ]);
    ui.hint?.('Drag the satellite or the pin.');
  }
  if (id === 'trilateration') {
    api.note('Drag the satellites or the pin');
    st.ui.chips = ui.chips({
      label: 'Satellites',
      items: SATS.map((s) => ({ id: s.id, label: s.id, colour: api.colours[s.ink], pressed: s.on })),
      onChange(sid, on) {
        const s = SATS.find((x) => x.id === sid);
        s.on = on;
        s.show.set(on ? 1 : 0, !api.motion);
        api.invalidate();
        announce(api);
      },
    });
    ui.button({
      label: 'Put them back',
      onClick() {
        for (const s of SATS) {
          s.angle = s.home;
          s.on = true;
          s.show.set(1, !api.motion);
          st.ui.chips.set(s.id, true);
        }
        st.pin = 90 * DEG;
        api.invalidate();
        announce(api);
      },
    });
    st.readout = api.readout([
      { key: 'used', label: 'Satellites used' },
      { key: 'fix', label: 'Fix good to' },
      { key: 'angle', label: 'Best crossing angle' },
    ]);
    announce(api);
  }
  if (id === 'clock') {
    st.solve = false;
    st.solved.set(0, true);
    api.note('Zoomed in about 7,000 times');
    ui.slider({
      label: 'Clock error',
      min: -3,
      max: 3,
      step: 0.05,
      value: st.bias,
      format: (v) => `${signed(v, 2)} μs`,
      onInput(v) {
        st.bias = v;
        if (st.solve) st.solved.set(v, !api.motion);
        api.invalidate();
      },
    });
    st.ui.solve = ui.toggle({
      label: 'Solve for the clock error',
      hint: 'Uses one more satellite than the position needs.',
      onChange(on) {
        st.solve = on;
        st.solved.set(on ? st.bias : 0, !api.motion);
        api.invalidate();
      },
    });
    st.readout = api.readout([
      { key: 'bias', label: 'Clock error' },
      { key: 'range', label: 'Each range out by' },
      { key: 'gap', label: 'Circles miss by' },
      { key: 'found', label: 'Found by solving' },
    ]);
  }
  if (id === 'einstein') {
    api.note(`One day in ${DAY_IN} seconds`);
    const r = st.rel;
    ui.toggle({ label: 'Speed (special relativity)', checked: r.special, hint: `${signed(SPECIAL, 1)} μs a day`, onChange: (on) => { r.special = on; api.invalidate(); } });
    ui.toggle({ label: 'Gravity (general relativity)', checked: r.general, hint: `${signed(GENERAL, 1)} μs a day`, onChange: (on) => { r.general = on; api.invalidate(); } });
    ui.toggle({ label: 'Relativity corrections', checked: r.fixed, hint: 'Clocks tuned slow before launch', onChange: (on) => { r.fixed = on; api.invalidate(); } });
    st.ui.hours = ui.slider({
      label: 'Time since the clocks agreed',
      min: 0,
      max: 24,
      step: 0.1,
      value: r.hours,
      format: (v) => `${fmt(v, 1)} h`,
      onInput(v) {
        r.hours = v;
        r.hold = 0;
        api.invalidate();
      },
    });
    st.readout = api.readout([
      { key: 'hours', label: 'Time since synced' },
      { key: 'rate', label: 'Drift per day' },
      { key: 'ahead', label: 'Satellite clock ahead' },
      { key: 'err', label: 'Range error' },
    ]);
  }
}

// The status line is a live region, so it is written when something the
// reader did changes it, never every frame.
// A drag calls this many times a second, so it waits for a pause.
let announcing = 0;
function announce(api) {
  clearTimeout(announcing);
  announcing = setTimeout(() => {
    if (api.chapter === 'trilateration') api.status(trilatWords());
  }, 250);
}

// --- every frame -------------------------------------------------------------------------------------

function draw(ctx, f, api) {
  FONT = api.colours['font-text'] || FONT;
  const still = !api.motion;
  const run = api.playing;
  let moving = false;

  // The clocks.
  moving = st.rate.step(f.dt, still) || moving;
  if (run) {
    st.clock += f.dt;
    st.t += f.dt * st.rate.v;
    moving = true;
  }
  // The camera on the globe: still in chapter 1 while the Earth turns
  // under it; in chapter 2 it follows the reader round.
  if (api.chapter === 'shout') st.yaw.set(homeAngle(st.t) + 100 * DEG);
  moving = st.yaw.step(f.dt, still) || moving;

  if (st.fade.step(f.dt, still)) moving = true;
  st.view = lerp(st.viewFrom, st.viewTo, st.fade.e);
  if (st.cam.tween.step(f.dt, still)) moving = true;
  for (const s of SATS) moving = s.show.step(f.dt, still) || moving;
  moving = st.solved.step(f.dt, still) || moving;

  // Chapter 3's satellite crosses the sky, and is hurried round the far
  // side of the Earth rather than left there for a minute and a half.
  if (api.chapter === 'delay' && run && api.handles?.dragging !== 'A') {
    const s = SATS[0];
    const speed = inView(s) ? 400 : 6000;
    s.angle -= (f.dt * speed * TAU) / G.PERIOD;
    if (s.angle < -Math.PI) s.angle += TAU;
  }
  // Chapter 6 plays a day, waits a moment at the end of it, and starts again.
  if (api.chapter === 'einstein' && run) {
    const r = st.rel;
    if (r.hours >= 24) {
      r.hold += f.dt;
      if (r.hold > 2) {
        r.hours = 0;
        r.hold = 0;
      }
    } else r.hours = Math.min(24, r.hours + (f.dt * 24) / DAY_IN);
    st.ui.hours?.set(Math.round(r.hours * 10) / 10);
  }

  if (st.view > 0.001) {
    ctx.globalAlpha = ease.out(st.view);
    drawGlobe(ctx, f, api, st.view);
    ctx.globalAlpha = 1;
  }
  if (st.view < 0.999) {
    ctx.save();
    ctx.globalAlpha = ease.out(1 - st.view);
    drawSlice(ctx, f, api);
    ctx.restore();
  }
  return moving;
}

// --- dragging --------------------------------------------------------------------------------------

const handles = {
  list(api) {
    const ch = api.chapter;
    if (ch !== 'delay' && ch !== 'trilateration') return [];
    const { w, h } = api.scene;
    const out = [];
    for (const s of SATS) {
      if (s.show.target < 1) continue;
      const [x, y] = toS(lastCam, w, h, ...satPos(s));
      out.push({ id: s.id, x, y, r: 22, label: `Satellite ${s.id}` });
    }
    const [x, y] = toS(lastCam, w, h, ...pinPos());
    out.push({ id: 'pin', x, y, r: 22, label: 'You' });
    return out;
  },
  drag(id, x, y, api) {
    const [wx, wy] = toW(lastCam, api.scene.w, api.scene.h, x, y);
    const a = Math.atan2(wy, wx);
    if (id === 'pin') st.pin = a;
    else SATS.find((s) => s.id === id).angle = a;
    announce(api);
  },
  nudge(id, dx, dy, api) {
    const step = (dx || -dy) * DEG;
    if (id === 'pin') st.pin -= step;
    else SATS.find((s) => s.id === id).angle -= step;
    announce(api);
  },
};

// --- go ------------------------------------------------------------------------------------------------

mount({
  colours: G.TOKENS,
  setup() {
    st.yaw.set(homeAngle(0) + 140 * DEG, true);
    st.cam.from = { x: 0, y: 0, s: 0.01 };
  },
  chapter,
  draw,
  handles,
});

// ---------------------------------------------------------------------------
// Why every map is wrong: the scene.
//
// The world through four projections, gliding from one to another (every
// point eases from where one projection puts it to where the next does).
// Greenland can be picked up on the Mercator map and carried across the
// globe; it is moved on the sphere, by a rotation, so its true shape and
// size are kept and only the map changes them. The sizes compared in the
// numbers are the areas of the drawn shapes, worked out from the screen.
// ---------------------------------------------------------------------------

import { mount, Smooth, fmt, TAU, alpha, lerp, ease, clamp } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { landDots } from '../shared/earth.js';
import { PROJECTIONS, fitted, rings, ringAt, carry, polyArea, drawWorld, drawGrid, drawTissot } from './art.js';

const D = Math.PI / 180;
const GREENLAND = () => ringAt(-42, 72);
const AUSTRALIA = () => ringAt(134, -25);
const TRUE_RATIO = 2.166 / 7.688;   // Greenland's area over Australia's

const st = {
  proj: 'mercator',
  from: 'mercator',
  morph: 1,
  spin: 0,
  globe: new Smooth(1, 2.5),
  home: null,
  at: null,
  tissot: false,
  readout: null,
};

function centroid(r) {
  let x = 0, y = 0, z = 0;
  for (const [l, p] of r) {
    x += Math.cos(p) * Math.cos(l);
    y += Math.cos(p) * Math.sin(l);
    z += Math.sin(p);
  }
  return [Math.atan2(y, x), Math.atan2(z, Math.hypot(x, y))];
}

function project(w, h) {
  const a = fitted(st.from, w, h), b = fitted(st.proj, w, h);
  const e = ease.inOut(st.morph);
  if (e >= 1) return b.to;
  return (l, p) => {
    const p1 = a.to(l, p), p2 = b.to(l, p);
    return [lerp(p1[0], p2[0], e), lerp(p1[1], p2[1], e)];
  };
}

function choose(id, api) {
  if (id === st.proj) return;
  st.from = st.proj;
  st.proj = id;
  st.morph = api.motion ? 0 : 1;
  api.invalidate();
}

function drawGlobe(ctx, w, h, col, spin) {
  const R = Math.min(w, h) * 0.4, cx = w / 2, cy = h / 2;
  const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
  g.addColorStop(0, col['bg-elevated-2']);
  g.addColorStop(1, col.bg);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  const dots = landDots(1.8);
  const tilt = 0.35, ct = Math.cos(tilt), stl = Math.sin(tilt);
  const cs = Math.cos(spin), sn = Math.sin(spin);
  ctx.fillStyle = alpha(col.accent, 0.8);
  for (let i = 0; i < dots.length; i += 4) {
    const x = dots[i] * cs - dots[i + 1] * sn, y = dots[i] * sn + dots[i + 1] * cs, z = dots[i + 2];
    const depth = y * ct - z * stl;
    if (depth > -0.05) continue;
    const sy = y * stl + z * ct;
    ctx.fillRect(cx + x * R - 1, cy - sy * R - 1, 2, 2);
  }
  ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.6);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const still = !api.motion;
  let moving = st.globe.step(dt, still);
  if (st.morph < 1) {
    st.morph = Math.min(1, st.morph + dt / 1.4);
    moving = true;
  }
  if (!st.home) {
    st.home = centroid(GREENLAND());
    st.at = st.home.slice();
  }

  if (st.globe.v > 0.01) {
    if (api.playing && api.motion) {
      st.spin += dt * 0.25;
      moving = true;
    }
    ctx.globalAlpha = st.globe.v;
    drawGlobe(ctx, w, h, col, st.spin);
    ctx.globalAlpha = 1;
  }
  if (st.globe.v < 0.99) {
    ctx.save();
    ctx.globalAlpha = 1 - st.globe.v;
    const to = project(w, h);
    drawGrid(ctx, to, col, st.proj === 'mercator' ? 82 : 90);
    const gl = GREENLAND(), au = AUSTRALIA();
    drawWorld(ctx, to, col, { skip: gl });
    // Greenland where it has been carried to, with a ghost where it lives.
    const move = carry(st.home, st.at);
    const moved = gl.map(move);
    const draws = (r) => r.map(([l, p]) => to(l, p));
    if (st.at[1] !== st.home[1] || st.at[0] !== st.home[0]) {
      ctx.beginPath();
      draws(gl).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = alpha(col['hiw-ink-1'], 0.7);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const shape = draws(moved);
    ctx.beginPath();
    shape.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = alpha(col['hiw-ink-1'], 0.55);
    ctx.fill();
    ctx.strokeStyle = col['hiw-ink-1'];
    ctx.lineWidth = 1.25;
    ctx.stroke();
    const [gx, gy] = to(...move(st.home));
    label(ctx, 'Greenland', gx, gy, col.label, bg, { size: 12, align: 'center' });
    if (api.handles?.focused) {
      ctx.strokeStyle = col['focus-ring'];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(gx, gy, 18, 0, TAU);
      ctx.stroke();
    }
    if (st.tissot) drawTissot(ctx, to, col);
    ctx.restore();

    if (st.readout) {
      const ratio = polyArea(shape) / polyArea(draws(au));
      st.readout.set('proj', PROJECTIONS[st.proj].name);
      st.readout.set('lat', `${fmt(Math.abs(st.at[1] / D))}° ${st.at[1] >= 0 ? 'N' : 'S'}`);
      st.readout.set('looks', `${fmt(ratio, 2)} × Australia`);
      st.readout.set('is', `${fmt(TRUE_RATIO, 2)} × Australia`);
    }
  }
  return moving;
}

const handles = {
  list(api) {
    const ch = api.chapter;
    if (!['mercator', 'tissot', 'equal', 'choose'].includes(ch) || !PROJECTIONS[st.proj].inverse || st.morph < 1 || !st.home) return [];
    const { w, h } = api.scene;
    const [x, y] = fitted(st.proj, w, h).to(...carry(st.home, st.at)(st.home));
    return [{ id: 'greenland', x, y, r: 28, label: 'Greenland' }];
  },
  drag(id, x, y, api) {
    const fit = fitted(st.proj, api.scene.w, api.scene.h);
    const [l, p] = fit.from(x, y);
    st.at = [clamp(l, -150 * D, 150 * D), clamp(p, -72 * D, 76 * D)];
    api.invalidate();
  },
  nudge(id, dx, dy, api) {
    st.at = [clamp(st.at[0] + dx * 2 * D, -150 * D, 150 * D), clamp(st.at[1] - dy * 2 * D, -72 * D, 76 * D)];
    api.invalidate();
  },
};

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  // The chapter the page opens on is simply there, with no fade from the globe.
  st.globe.set(id === 'peel' ? 1 : 0, !api.motion || !st.opened);
  if (!st.opened && id !== 'peel') st.morph = 1;
  st.opened = true;
  st.tissot = id === 'tissot';
  const want = { peel: 'mercator', mercator: 'mercator', tissot: 'mercator', equal: 'equalEarth', choose: st.proj }[id];
  if (want !== st.proj) choose(want, api);
  api.note(id === 'peel' ? '' : PROJECTIONS[st.proj].inverse ? 'Drag Greenland, or focus the map and use the arrows' : '');
  if (id === 'tissot' || id === 'equal' || id === 'choose') {
    const options = id === 'equal' ? ['mercator', 'mollweide', 'equalEarth'] : id === 'tissot' ? ['mercator', 'plate', 'equalEarth'] : Object.keys(PROJECTIONS);
    ui.choice({
      label: 'Projection',
      options: options.map((p) => ({ id: p, label: PROJECTIONS[p].name })),
      value: st.proj,
      onChange(p) {
        choose(p, api);
        api.note(PROJECTIONS[p].inverse ? 'Drag Greenland, or focus the map and use the arrows' : 'Greenland stays where you left it');
      },
    });
  }
  if (id !== 'peel') {
    ui.button({ label: 'Greenland to the equator', onClick: () => { st.at = [st.home[0], 2 * D]; api.invalidate(); } });
    ui.button({ label: 'Send it home', onClick: () => { st.at = st.home.slice(); api.invalidate(); } });
  }
  if (id === 'tissot') ui.toggle({ label: 'Show the circles', checked: st.tissot, onChange: (on) => { st.tissot = on; api.invalidate(); } });
  st.readout = id === 'peel' ? null : api.readout([
    { key: 'proj', label: 'Projection' },
    { key: 'lat', label: 'Greenland now at' },
    { key: 'looks', label: 'Greenland looks' },
    { key: 'is', label: 'Greenland really is' },
  ]);
  if (id === 'peel') api.readout([]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw, handles });

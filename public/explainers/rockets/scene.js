// ---------------------------------------------------------------------------
// Why rockets are mostly fuel: the scene.
//
// Tsiolkovsky: Δv = ve · ln(m0 / mf). Chapter 1 burns a rocket in empty
// space at a steady rate and plots its speed; chapter 2 draws Δv against
// the share of fuel; chapter 3 checks a fuel against the 9.4 km/s a launch
// to low orbit needs; chapter 4 splits that Δv equally between n stages,
// each with tanks and engines a share ε of its fuelled mass, and works out
// what share of the launch mass is left as payload.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { plot, curve } from '../shared/plot.js';

const DV = 9.4;
const st = { ve: 3, fuel: 0.9, burn: 0, stages: 2, eps: 0.08, parts: [], readout: null };

/** Payload share of launch mass for n equal stages, or 0 if it cannot be done. */
export function payload(n, eps, ve = 3, dv = DV) {
  const R = Math.exp(dv / n / ve);
  if (1 - R * eps <= 0) return 0;
  const k = (R - 1) / (1 - R * eps);
  return 1 / (1 + k) ** n;
}

function rocket(ctx, x, y, wd, ht, fuelShare, col, flame) {
  // Body: a nose, then the tank (filled to the fuel share), then the engine.
  const nose = ht * 0.16;
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.strokeStyle = col['separator-strong'];
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + wd / 2, y + nose);
  ctx.lineTo(x + wd / 2, y + ht);
  ctx.lineTo(x - wd / 2, y + ht);
  ctx.lineTo(x - wd / 2, y + nose);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const tank = ht - nose - 6;
  const fh = tank * fuelShare;
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.75);
  ctx.fillRect(x - wd / 2 + 3, y + ht - 3 - fh, wd - 6, fh);
  if (flame > 0) {
    ctx.fillStyle = alpha(col.warning, 0.85);
    ctx.beginPath();
    ctx.moveTo(x - wd * 0.3, y + ht);
    ctx.lineTo(x, y + ht + flame);
    ctx.lineTo(x + wd * 0.3, y + ht);
    ctx.fill();
  }
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let more = false;
  if (ch === 'push') {
    // Fuel share 90%, burnt at a steady rate over 10 seconds of animation.
    const moving = api.playing && api.motion;
    if (moving && st.burn < 1) {
      st.burn = Math.min(1, st.burn + f.dt / 8);
      more = true;
    }
    if (!api.motion) st.burn = 1;
    const m0 = 1;
    const m = m0 - st.fuel * st.burn;
    const v = st.ve * Math.log(m0 / m);
    const g = plot(ctx, col, bg, { x0: w * 0.38, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], fmt: (t) => `${t}%`, name: 'Fuel burnt' },
      { min: 0, max: 12, ticks: [0, 3, 6, 9, 12], fmt: (s) => `${s}`, name: 'Speed gained, km/s' });
    curve(ctx, g, (p) => (p / 100 <= st.burn ? st.ve * Math.log(1 / (1 - st.fuel * (p / 100))) : NaN), 0, 100, col.accent, 3);
    // Exhaust: particles streaming out at the exhaust speed.
    const rx = w * 0.17, ry = 70, rw = Math.min(46, w * 0.08), rh = Math.min(h - 200, 220);
    if (st.burn < 1) {
      for (let i = 0; i < 18; i++) {
        const k = ((f.t * st.ve * 0.5 + i / 18) % 1);
        ctx.beginPath();
        ctx.arc(rx + Math.sin(i * 7.3) * rw * 0.2, ry + rh + 10 + k * 90, 2.5, 0, TAU);
        ctx.fillStyle = alpha(col.warning, 1 - k);
        ctx.fill();
      }
    }
    rocket(ctx, rx, ry, rw, rh, (st.fuel * (1 - st.burn)) / m, col, st.burn < 1 ? 26 : 0);
    r?.set('speed', `${fmt(v, 2)} km/s`);
    r?.set('fuel', `${fmt((1 - st.burn) * 100)}% left`);
  } else if (ch === 'equation' || ch === 'orbit') {
    const g = plot(ctx, col, bg, { x0: w * 0.32, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: (v) => `${Math.round(v * 100)}%`, name: 'Share of the full rocket that is fuel' },
      { min: 0, max: 14, ticks: [0, 2, 4, 6, 8, 10, 12, 14], name: 'Speed it can reach, km/s' });
    if (ch === 'orbit') {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = col.danger;
      ctx.beginPath();
      ctx.moveTo(g.x0, g.Y(DV));
      ctx.lineTo(g.x1, g.Y(DV));
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, 'To orbit: 9.4 km/s', g.x0 + 6, g.Y(DV) - 12, col.danger, bg, { size: 12, weight: 700 });
    }
    curve(ctx, g, (s) => st.ve * Math.log(1 / (1 - s)), 0, 0.995, col.accent, 3, 300);
    const need = 1 - Math.exp(-DV / st.ve);
    const share = ch === 'orbit' ? need : st.fuel;
    const v = st.ve * Math.log(1 / (1 - share));
    ctx.fillStyle = col.danger;
    ctx.beginPath();
    ctx.arc(g.X(share), g.Y(Math.min(14, v)), 6, 0, TAU);
    ctx.fill();
    rocket(ctx, w * 0.15, 70, Math.min(46, w * 0.08), Math.min(h - 160, 240), share, col, 0);
    label(ctx, `${fmt(share * 100, 1)}% fuel`, w * 0.15, 70 + Math.min(h - 160, 240) + 22, col.label, bg, { size: 12, weight: 700, align: 'center' });
    if (ch === 'equation') {
      r?.set('speed', `${fmt(v, 1)} km/s`);
      r?.set('ratio', `${fmt(1 / (1 - share), 1)} ×`);
    } else {
      r?.set('fuel', `${fmt(need * 100, 1)}%`);
      r?.set('ratio', `${fmt(1 / (1 - need), 1)} ×`);
    }
  } else if (ch === 'stages') {
    const share = payload(st.stages, st.eps);
    // The stack, drawn to scale by mass: each stage's height is its share.
    const R = Math.exp(DV / st.stages / 3);
    const k = (R - 1) / (1 - R * st.eps);
    const parts = [];
    let above = 1;
    for (let i = 0; i < st.stages; i++) { const m = k * above; parts.unshift(m); above += m; }
    const total = above;
    const x = w * 0.22, top = 50, ht = h - 110, wd = Math.min(70, w * 0.12);
    if (share > 0) {
      let y = top + ht;
      parts.forEach((m, i) => {
        const sh = (m / total) * ht;
        y -= sh;
        ctx.fillStyle = alpha(i % 2 ? col['hiw-ink-4'] : col['hiw-ink-1'], 0.75);
        ctx.fillRect(x - wd / 2, y, wd, sh);
        ctx.strokeStyle = col['separator-strong'];
        ctx.strokeRect(x - wd / 2, y, wd, sh);
        if (sh > 16) label(ctx, `Stage ${i + 1}`, x + wd / 2 + 8, y + sh / 2, col.label, bg, { size: 12 });
      });
      const ph = Math.max(3, (1 / total) * ht);
      ctx.fillStyle = col.accent;
      ctx.fillRect(x - wd / 2, y - ph, wd, ph);
      label(ctx, 'Payload', x + wd / 2 + 8, y - ph / 2, col.accent, bg, { size: 12, weight: 700 });
    } else {
      label(ctx, 'Cannot reach orbit', x, top + ht / 2, col.danger, bg, { size: 14, weight: 700, align: 'center' });
    }
    const g = plot(ctx, col, bg, { x0: w * 0.5, x1: w - 20, y0: 80, y1: h - 44 },
      { min: 0.5, max: 4.5, ticks: [1, 2, 3, 4], name: 'Stages' },
      { min: 0, max: 0.05, ticks: [0, 0.01, 0.02, 0.03, 0.04, 0.05], fmt: (v) => `${Math.round(v * 100)}%`, name: 'Payload share of launch mass' });
    for (let n = 1; n <= 4; n++) {
      const p = payload(n, st.eps);
      const bw = (g.X(2) - g.X(1)) * 0.5;
      ctx.fillStyle = n === st.stages ? col.accent : alpha(col['hiw-ink-1'], 0.6);
      ctx.fillRect(g.X(n) - bw / 2, g.Y(p), bw, g.Y(0) - g.Y(p));
      label(ctx, p ? `${fmt(p * 100, 1)}%` : 'None', g.X(n), g.Y(p) - 12, n === st.stages ? col.accent : col['label-secondary'], bg, { size: 11, align: 'center' });
    }
    r?.set('share', share ? `${fmt(share * 100, 2)}%` : 'Cannot reach orbit');
    r?.set('per', share ? `${fmt(1 / share)} kg` : '–');
  }
  return more;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ push: 'A rocket in empty space, 90% fuel', equation: 'Speed gained, against how much is fuel', orbit: 'A launch to low orbit', stages: 'Tanks and engines weigh something too' }[id]);
  const fuels = [{ id: '3', label: 'Kerosene, 3 km/s' }, { id: '4.4', label: 'Hydrogen, 4.4 km/s' }];
  if (id === 'push') {
    st.burn = 0;
    st.fuel = 0.9;
    ui.slider({ label: 'Exhaust speed', min: 1, max: 5, step: 0.1, value: st.ve, format: (v) => `${fmt(v, 1)} km/s`, onInput(v) { st.ve = v; api.invalidate(); } });
    ui.button({ label: 'Burn again', onClick() { st.burn = 0; api.invalidate(); } });
    st.readout = api.readout([{ key: 'speed', label: 'Speed gained' }, { key: 'fuel', label: 'Fuel' }]);
  } else if (id === 'equation') {
    st.ve = 3;
    st.fuel = 0.9;
    ui.slider({ label: 'Fuel', min: 10, max: 98, value: 90, format: (v) => `${v}% of the rocket`, onInput(v) { st.fuel = v / 100; api.invalidate(); } });
    st.readout = api.readout([{ key: 'speed', label: 'Speed it can reach' }, { key: 'ratio', label: 'Full ÷ empty' }]);
  } else if (id === 'orbit') {
    st.ve = 3;
    ui.choice({ label: 'Fuel', options: fuels, value: '3', onChange(v) { st.ve = Number(v); api.invalidate(); } });
    st.readout = api.readout([{ key: 'fuel', label: 'Fuel share needed' }, { key: 'ratio', label: 'Full ÷ empty' }]);
  } else if (id === 'stages') {
    st.ve = 3;
    st.stages = 2;
    st.eps = 0.08;
    ui.slider({ label: 'Stages', min: 1, max: 4, value: 2, onInput(v) { st.stages = v; api.invalidate(); } });
    ui.slider({ label: 'Tanks and engines', min: 3, max: 12, value: 8, format: (v) => `${v}% of each stage`, onInput(v) { st.eps = v / 100; api.invalidate(); } });
    st.readout = api.readout([{ key: 'share', label: 'Reaches orbit' }, { key: 'per', label: 'Launch mass per kg in orbit' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

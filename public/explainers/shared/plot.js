// ---------------------------------------------------------------------------
// How it works: a chart's axes, for the scenes that are mostly a chart.
//
// Half the explainers end up drawing the same thing: a box, a few ruled
// lines with numbers on them, a name on each axis, then bars or a curve.
// plot() draws the frame and hands back the two scales; the scene draws
// what goes in it. Every colour is a token, passed in as `col`.
// ---------------------------------------------------------------------------

import { alpha } from '../engine.js';
import { label } from './draw.js';

/**
 * Draw the axes and return { X, Y, x0, x1, y0, y1 }.
 * box: { x0, x1, y0, y1 } in pixels (y0 at the top).
 * x, y: { min, max, ticks: [values], fmt(v), name }.
 */
export function plot(ctx, col, bg, box, x, y) {
  const { x0, x1, y0, y1 } = box;
  const X = (v) => x0 + ((v - x.min) / (x.max - x.min)) * (x1 - x0);
  const Y = (v) => y1 - ((v - y.min) / (y.max - y.min)) * (y1 - y0);
  ctx.lineWidth = 1;
  for (const v of y.ticks || []) {
    ctx.strokeStyle = col.separator;
    ctx.beginPath();
    ctx.moveTo(x0, Y(v));
    ctx.lineTo(x1, Y(v));
    ctx.stroke();
    label(ctx, (y.fmt || String)(v), x0 - 6, Y(v), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  ctx.strokeStyle = alpha(col['label-tertiary'], 0.6);
  ctx.beginPath();
  ctx.moveTo(x0, y1);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  for (const v of x.ticks || []) label(ctx, (x.fmt || String)(v), X(v), y1 + 13, col['label-tertiary'], bg, { size: 11, align: 'center' });
  if (x.name) label(ctx, x.name, x1, y1 + 29, col['label-tertiary'], bg, { size: 11, align: 'right' });
  if (y.name) label(ctx, y.name, x0, y0 - 14, col['label-tertiary'], bg, { size: 11, align: 'left' });
  return { X, Y, x0, x1, y0, y1 };
}

/** A curve through f(x) from a to b. */
export function curve(ctx, g, f, a, b, colour, width = 2.5, steps = 200) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const v = a + ((b - a) * i) / steps;
    const yv = f(v);
    if (!Number.isFinite(yv)) continue;
    (i ? ctx.lineTo : ctx.moveTo).call(ctx, g.X(v), g.Y(yv));
  }
  ctx.stroke();
}

/** A seeded generator (mulberry32), for anything whose result the writing quotes. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

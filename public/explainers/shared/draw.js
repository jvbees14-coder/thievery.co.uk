// ---------------------------------------------------------------------------
// How it works: small drawing helpers every scene ends up wanting.
//
// The engine draws nothing itself; a scene does. These are the pieces that
// were being written again in each one: a label that stays legible over
// lines (a halo in the scene's own background), a soft glowing dot, an
// arrow, a rounded box, and the type face read off the page.
// ---------------------------------------------------------------------------

import { alpha, TAU } from '../engine.js';

let FACE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Set the face once per frame from the tokens: setFace(api.colours['font-text']). */
export function setFace(face) {
  if (face) FACE = face;
}
export function font(size = 12, weight = 600, mono = false) {
  return `${weight} ${size}px ${mono ? 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace' : FACE}`;
}

/** Text with a halo, so it reads over whatever is drawn under it. */
export function label(ctx, text, x, y, col, halo, { size = 12, weight = 600, align = 'left', base = 'middle', mono = false } = {}) {
  ctx.font = font(size, weight, mono);
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if (halo) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = alpha(halo, 0.85);
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = col;
  ctx.fillText(text, x, y);
}

/** A point of light: a soft glow round a bright core. */
export function glow(ctx, x, y, col, r = 3, spread = 4, strength = 0.55) {
  if (strength > 0) {
    const R = r * spread;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, alpha(col, strength));
    g.addColorStop(1, alpha(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - R, y - R, R * 2, R * 2);
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = col;
  ctx.fill();
}

/** A line with a head on the end. */
export function arrow(ctx, x1, y1, x2, y2, col, width = 1.5, head = 7) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - Math.cos(a) * head * 0.6, y2 - Math.sin(a) * head * 0.6);
  ctx.strokeStyle = col;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(a - 0.45) * head, y2 - Math.sin(a - 0.45) * head);
  ctx.lineTo(x2 - Math.cos(a + 0.45) * head, y2 - Math.sin(a + 0.45) * head);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
}

/** A rounded rectangle, as a path. */
export function box(ctx, x, y, w, h, r = 6) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

/** Every token a scene is likely to want, for mount({ colours }). */
export const TOKENS = [
  'bg', 'bg-grouped', 'bg-elevated', 'bg-elevated-2', 'hiw-scene-bg',
  'hiw-ink-1', 'hiw-ink-2', 'hiw-ink-3', 'hiw-ink-4', 'hiw-signal',
  'ornament', 'accent', 'accent-strong', 'accent-tint',
  'label', 'label-secondary', 'label-tertiary', 'separator', 'separator-strong',
  'danger', 'success', 'warning', 'focus-ring', 'font-text',
  'stock', 'stock-edge', 'stock-ink', 'stock-red', 'back', 'back-edge',
];

/** The same tokens' dark values, for drawing where there is no page to read
    them from (the share pictures). Copied from tokens.css. */
export const DARK = {
  bg: '#0a0c14', 'bg-grouped': '#10131d', 'bg-elevated': '#171b28', 'bg-elevated-2': '#202536', 'hiw-scene-bg': '#10131d',
  'hiw-ink-1': '#7fd3cc', 'hiw-ink-2': '#e9a2b8', 'hiw-ink-3': '#8fc9b2', 'hiw-ink-4': '#c3a9eb', 'hiw-signal': '#d9b563',
  ornament: 'rgba(212, 175, 90, 0.55)', accent: '#d9b563', 'accent-strong': '#f1d382', 'accent-tint': 'rgba(212, 175, 90, 0.1)',
  label: '#f1ead9', 'label-secondary': '#b8b09e', 'label-tertiary': '#968f7f', separator: 'rgba(212, 175, 90, 0.2)', 'separator-strong': '#7a6e58',
  danger: '#f08a8f', success: '#8fc9b2', warning: '#e8b25a', 'focus-ring': '#8ab4ff', 'font-text': 'system-ui, sans-serif',
  stock: '#f7f0de', 'stock-edge': '#c9bfa5', 'stock-ink': '#111420', 'stock-red': '#9a2231', back: '#1c2130', 'back-edge': '#3a4157',
};

/** A colour as [r, g, b, a], from #rgb, #rrggbb, rgb() or rgba(). */
export function rgba(colour) {
  const c = String(colour).trim();
  if (c[0] === '#') {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const m = c.match(/[\d.]+/g) || [128, 128, 128];
  return [Number(m[0]), Number(m[1]), Number(m[2]), m[3] !== undefined ? Number(m[3]) : 1];
}

/** Somewhere between two colours: t = 0 is a, 1 is b. */
export function mix(a, b, t) {
  const p = rgba(a), q = rgba(b);
  const k = (i) => Math.round(p[i] + (q[i] - p[i]) * t);
  return `rgba(${k(0)}, ${k(1)}, ${k(2)}, ${(p[3] + (q[3] - p[3]) * t).toFixed(3)})`;
}

/** Along a list of colours: t from 0 to 1 runs from the first to the last. */
export function ramp(colours, t) {
  const n = colours.length - 1;
  const x = Math.min(n - 1e-9, Math.max(0, t * n));
  const i = Math.floor(x);
  return mix(colours[i], colours[i + 1], x - i);
}

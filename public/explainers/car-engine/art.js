// ---------------------------------------------------------------------------
// The four-stroke engine: one cylinder, cut in half.
//
// The crank angle runs from 0 to 720 degrees (two turns) per cycle, with
// 0 at the top of the intake stroke. The piston's height comes from the
// real crank-and-rod geometry, not a sine wave, so it lingers a moment
// longer at the bottom than at the top, as real pistons do. The engine is
// a generic one: 86 mm bore and stroke, a 145 mm connecting rod.
// ---------------------------------------------------------------------------

import { TAU, alpha } from '../engine.js';
import { mix } from '../shared/draw.js';

export const STROKE = 86;   // mm
export const ROD = 145;     // mm
export const STROKES = ['Intake', 'Compression', 'Power', 'Exhaust'];

/** Distance from the crank's centre to the piston pin, in mm. */
export function pistonPin(theta) {
  const r = STROKE / 2;
  return r * Math.cos(theta) + Math.sqrt(ROD * ROD - (r * Math.sin(theta)) ** 2);
}

export function strokeOf(deg) {
  return Math.floor((((deg % 720) + 720) % 720) / 180);
}

/** How far a valve is open: intake during stroke 0, exhaust during stroke 3. */
export function valveLift(deg, which) {
  const d = ((deg % 720) + 720) % 720;
  const [a, b] = which === 'in' ? [-10, 200] : [520, 730];
  const dd = d < 100 && which === 'out' ? d + 720 : d;
  if (dd < a || dd > b) return 0;
  return Math.sin(((dd - a) / (b - a)) * Math.PI);
}

/**
 * The cylinder at crank angle `deg`, in a box at (x, y) of height h.
 * `ratio` is the compression ratio, which sets how small the space above
 * the piston gets at the top.
 */
export function drawCylinder(ctx, x, y, h, deg, col, { ratio = 10, labels = false, bg } = {}) {
  const k = h / 330;             // pixels per mm
  const bore = 86 * k;
  const theta = (deg * Math.PI) / 180;
  const clearance = STROKE / (ratio - 1);    // mm above the piston at the top
  const pinTop = pistonPin(0);
  const crankY = y + h - 50 * k;
  const pinY = crankY - pistonPin(theta) * k;
  const pistonTop = pinY - 28 * k;
  const headY = crankY - (pinTop + 28 + clearance) * k;
  const s = strokeOf(deg);

  // The gas above the piston.
  const d = ((deg % 720) + 720) % 720;
  let gas = alpha(col['hiw-ink-1'], 0.25);
  if (s === 1) gas = alpha(col['hiw-ink-1'], 0.25 + 0.4 * ((d - 180) / 180));
  if (s === 2) gas = mix(col.danger, col.warning, Math.min(1, (d - 360) / 120));
  if (s === 3) gas = alpha(col['label-secondary'], 0.35);
  ctx.fillStyle = s === 2 ? alpha(gas, 0.75 - 0.5 * ((d - 360) / 180)) : gas;
  ctx.fillRect(x - bore / 2, headY, bore, pistonTop - headY);

  // The cylinder walls and head.
  ctx.strokeStyle = col['separator-strong'];
  ctx.lineWidth = Math.max(2, 4 * k);
  ctx.beginPath();
  ctx.moveTo(x - bore / 2 - 2, headY);
  ctx.lineTo(x - bore / 2 - 2, crankY - (pistonPin(Math.PI) - 40) * k);
  ctx.moveTo(x + bore / 2 + 2, headY);
  ctx.lineTo(x + bore / 2 + 2, crankY - (pistonPin(Math.PI) - 40) * k);
  ctx.stroke();
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fillRect(x - bore / 2 - 18 * k, headY - 30 * k, bore + 36 * k, 30 * k);

  // Valves, opened by the camshaft.
  const valve = (side, lift, ink) => {
    const vx = x + side * bore * 0.25;
    const vy = headY + lift * 10 * k;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(2, 3 * k);
    ctx.beginPath();
    ctx.moveTo(vx, vy - 40 * k);
    ctx.lineTo(vx, vy);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.fillRect(vx - bore * 0.16, vy - 2 * k, bore * 0.32, 4 * k);
  };
  valve(-1, valveLift(deg, 'in'), col['hiw-ink-1']);
  valve(1, valveLift(deg, 'out'), col['label-secondary']);
  // The spark plug, which flashes at the top of compression.
  const spark = d > 350 && d < 375;
  ctx.fillStyle = spark ? col['accent-strong'] : col['label-tertiary'];
  ctx.fillRect(x - 3 * k, headY - 40 * k, 6 * k, 38 * k);
  if (spark) {
    const g = ctx.createRadialGradient(x, headY + 4 * k, 0, x, headY + 4 * k, 26 * k);
    g.addColorStop(0, alpha(col['accent-strong'], 0.9));
    g.addColorStop(1, alpha(col['accent-strong'], 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - 30 * k, headY - 20 * k, 60 * k, 50 * k);
  }

  // The piston, rod and crank.
  ctx.fillStyle = col.accent;
  ctx.fillRect(x - bore / 2, pistonTop, bore, 40 * k);
  ctx.fillStyle = mix(col.accent, col['hiw-scene-bg'], 0.4);
  for (let i = 0; i < 3; i++) ctx.fillRect(x - bore / 2, pistonTop + (4 + i * 6) * k, bore, 2 * k);
  const cx = x + Math.sin(theta) * (STROKE / 2) * k;
  const cy = crankY - Math.cos(theta) * (STROKE / 2) * k;
  ctx.strokeStyle = col['label-secondary'];
  ctx.lineWidth = Math.max(4, 12 * k);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, pinY);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(x, crankY, (STROKE / 2 + 14) * k, 0, TAU);
  ctx.strokeStyle = alpha(col['label-secondary'], 0.4);
  ctx.lineWidth = Math.max(2, 4 * k);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, crankY);
  ctx.lineTo(cx, cy);
  ctx.strokeStyle = col['hiw-ink-2'];
  ctx.lineWidth = Math.max(4, 14 * k);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, crankY, Math.max(3, 8 * k), 0, TAU);
  ctx.fillStyle = col['hiw-ink-2'];
  ctx.fill();

  if (labels && bg) {
    const put = (t, lx, ly, ink, align = 'left') => {
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = alpha(bg, 0.85);
      ctx.strokeText(t, lx, ly);
      ctx.fillStyle = ink;
      ctx.fillText(t, lx, ly);
    };
    put('Intake valve', x - bore * 0.7, headY - 20 * k, col['hiw-ink-1'], 'right');
    put('Exhaust valve', x + bore * 0.7, headY - 20 * k, col['label-secondary']);
    put('Piston', x + bore * 0.62, pistonTop + 20 * k, col.accent);
    put('Crankshaft', x + (STROKE / 2 + 20) * k, crankY + 30 * k, col['hiw-ink-2']);
  }
  return { headY, pistonTop, crankY };
}

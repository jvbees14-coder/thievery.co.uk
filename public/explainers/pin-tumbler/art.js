// ---------------------------------------------------------------------------
// The pin tumbler lock: its geometry, in lock units, and how to draw it.
//
// The lock is drawn side on, cut down the middle. Units are arbitrary (the
// lock is 100 wide); `view` maps them to the canvas. Five pin stacks stand
// in chambers above the keyway: a key pin (brass, different lengths), a
// driver pin (steel, all the same) and a spring. The shear line is the
// boundary between the plug, which turns, and the shell, which does not.
// The plug turns only when every gap between a key pin and its driver lies
// exactly on that line.
// ---------------------------------------------------------------------------

import { alpha } from '../engine.js';
import { mix } from '../shared/draw.js';

export const PINS = [22, 36, 50, 64, 78];      // chamber centres
export const KEY_PIN = [7, 10, 6, 11, 8];      // key pin lengths
export const DRIVER = 9;
export const SHEAR = 32;                        // y of the shear line
export const REST = 47;                         // y of a key pin's foot at rest
export const NEED = KEY_PIN.map((L) => REST - SHEAR - L);   // the lift that puts each gap on the line
export const WRONG = [6, 8, 4, 6, 2];          // a key cut for a different lock
export const PLUG = { x0: 5, x1: 95, y0: SHEAR, y1: 58 };
export const CHAMBER_TOP = 6;
export const PIN_W = 6;

/** How high a key lifts a pin at distance u along its blade (0 at the bow). */
export function keyLift(cuts, u) {
  if (u < 0 || u > 90) return 0;
  let lift = 12;
  cuts.forEach((c, i) => {
    lift = Math.min(lift, c + Math.abs(u - (PINS[i] - 5)) * 1.1);
  });
  return Math.max(0, Math.min(lift, (90 - u) * 1.6));
}

/** Each pin's lift with a key pushed in a fraction `s` of the way. */
export function liftsFor(cuts, s) {
  const tip = 5 + 90 * s;
  return PINS.map((x) => keyLift(cuts, x - (tip - 90)));
}

export function makeView(w, h) {
  const scale = Math.min(w / 108, h / 74);
  return { scale, ox: (w - 100 * scale) / 2, oy: (h - 66 * scale) / 2 };
}

/**
 * The cross-section. `lifts` is each key pin's lift; `drivers` (optional)
 * where each driver's foot is when it is held apart from its key pin (a
 * set pin); `turn` from 0 to 1 how far the plug has turned, drawn as a
 * tint; `shift` nudges each chamber sideways, to show tolerances.
 */
export function drawLock(ctx, view, col, { lifts, drivers = [], key = null, keyS = 0, turn = 0, shift = [], highlight = -1, spools = false, pick = null }) {
  const { scale: k, ox, oy } = view;
  const X = (x) => ox + x * k, Y = (y) => oy + y * k;
  const steel = col['label-secondary'];
  const shell = col['bg-elevated-2'];

  // The shell, and the chambers cut into it.
  ctx.fillStyle = shell;
  ctx.strokeStyle = col['separator-strong'];
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(X(3), Y(3), 94 * k, 58 * k, 6 * k) : ctx.rect(X(3), Y(3), 94 * k, 58 * k);
  ctx.fill();
  ctx.stroke();

  // The plug.
  ctx.fillStyle = mix(shell, col.accent, 0.08 + turn * 0.25);
  ctx.fillRect(X(PLUG.x0), Y(PLUG.y0), (PLUG.x1 - PLUG.x0) * k, (PLUG.y1 - PLUG.y0) * k);
  // The keyway.
  ctx.fillStyle = col['hiw-scene-bg'];
  ctx.fillRect(X(PLUG.x0), Y(REST), (PLUG.x1 - PLUG.x0 - 4) * k, 10 * k);

  PINS.forEach((px, i) => {
    const cx = px + (shift[i] || 0);
    // The chamber.
    ctx.fillStyle = col['hiw-scene-bg'];
    ctx.fillRect(X(cx - PIN_W / 2 - 0.5), Y(CHAMBER_TOP), (PIN_W + 1) * k, (REST - CHAMBER_TOP) * k);
    const lift = lifts[i];
    const keyTop = REST - lift - KEY_PIN[i];
    const driverFoot = drivers[i] != null ? drivers[i] : keyTop;
    const driverTop = driverFoot - DRIVER;
    // The spring, squeezed between the top of the chamber and the driver.
    ctx.beginPath();
    const coils = 7, sy0 = CHAMBER_TOP + 0.5, sy1 = driverTop;
    for (let c = 0; c <= coils * 2; c++) {
      const y = sy0 + ((sy1 - sy0) * c) / (coils * 2);
      const x = cx + (c % 2 ? 1 : -1) * (PIN_W / 2 - 0.8);
      if (c) ctx.lineTo(X(x), Y(y));
      else ctx.moveTo(X(cx), Y(y));
    }
    ctx.strokeStyle = alpha(steel, 0.8);
    ctx.lineWidth = Math.max(1, k * 0.35);
    ctx.stroke();
    // The driver pin.
    ctx.fillStyle = i === highlight ? col.danger : steel;
    if (spools) {
      ctx.fillRect(X(cx - PIN_W / 2), Y(driverTop), PIN_W * k, 2 * k);
      ctx.fillRect(X(cx - PIN_W / 4), Y(driverTop + 2), (PIN_W / 2) * k, (DRIVER - 4) * k);
      ctx.fillRect(X(cx - PIN_W / 2), Y(driverFoot - 2), PIN_W * k, 2 * k);
    } else {
      ctx.fillRect(X(cx - PIN_W / 2), Y(driverTop), PIN_W * k, DRIVER * k);
    }
    // The key pin, with a rounded foot.
    ctx.fillStyle = col.accent;
    ctx.beginPath();
    const kx = X(cx - PIN_W / 2), ky = Y(keyTop), kw = PIN_W * k, kh = KEY_PIN[i] * k;
    ctx.moveTo(kx, ky);
    ctx.lineTo(kx + kw, ky);
    ctx.lineTo(kx + kw, ky + kh - kw / 2);
    ctx.lineTo(kx + kw / 2, ky + kh);
    ctx.lineTo(kx, ky + kh - kw / 2);
    ctx.closePath();
    ctx.fill();
  });

  // The shear line.
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = col['accent-strong'];
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(X(PLUG.x0), Y(SHEAR));
  ctx.lineTo(X(PLUG.x1), Y(SHEAR));
  ctx.stroke();
  ctx.setLineDash([]);

  // The key, coming in from the left.
  if (key) {
    const tip = 5 + 90 * keyS;
    ctx.beginPath();
    const base = REST + 9;
    ctx.moveTo(X(tip - 90 - 12), Y(base));
    for (let u = -12; u <= 90; u += 0.5) {
      const x = tip - 90 + u;
      const top = REST - (u < 0 ? 12 : keyLift(key, u));
      ctx.lineTo(X(x), Y(top));
    }
    ctx.lineTo(X(tip), Y(base));
    ctx.closePath();
    ctx.fillStyle = alpha(col['hiw-ink-1'], 0.85);
    ctx.fill();
  }

  // A pick and a tension wrench, for picking.
  if (pick) {
    ctx.strokeStyle = col['hiw-ink-1'];
    ctx.lineWidth = Math.max(1.5, k * 0.9);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(X(-6), Y(REST + 8.5));
    ctx.lineTo(X(14), Y(REST + 8.5));
    ctx.stroke();
    if (pick.at != null) {
      const px = PINS[pick.at];
      ctx.beginPath();
      ctx.moveTo(X(-6), Y(REST + 5));
      ctx.lineTo(X(px - 4), Y(REST + 5));
      ctx.lineTo(X(px), Y(REST - pick.lift + 0.5));
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
}

/** The lock seen end on: the shell, the plug, its keyway, turning. */
export function drawEnd(ctx, x, y, r, col, turn, label) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fill();
  ctx.strokeStyle = col['separator-strong'];
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn * Math.PI / 2);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = mix(col['bg-elevated-2'], col.accent, 0.12 + turn * 0.3);
  ctx.fill();
  ctx.fillStyle = col['hiw-scene-bg'];
  ctx.fillRect(-r * 0.08, -r * 0.45, r * 0.16, r * 0.9);
  ctx.restore();
  if (label) {
    ctx.fillStyle = col['label-secondary'];
    ctx.font = `500 11px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + r + 14);
  }
}

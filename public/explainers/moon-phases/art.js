// ---------------------------------------------------------------------------
// The phases of the Moon: the arithmetic and the Moon's face.
//
// A month of phases is the synodic month, 29.53 days; one turn against the
// stars is the sidereal month, 27.32 days. The Moon's orbit is tilted 5.1°
// to the Earth's, which is why most new moons miss the Sun.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

export const SYNODIC = 29.53, SIDEREAL = 27.32, TILT = 5.145;
export const MOON_KM = 384400, EARTH_R = 6371;
/** The Moon moves 30.67° along its tilted orbit, measured from where it
    crosses the Earth's, from one new moon to the next. */
export const NODE_STEP = 360 * (SYNODIC / 346.62);
/** A new moon closer than this to a crossing gives a solar eclipse
    somewhere on Earth (the limit runs from about 15.4° to 18.5°). */
export const ECLIPSE_LIMIT = 16.5;

export const lit = (age) => (1 - Math.cos((TAU * age) / SYNODIC)) / 2;

export function phaseName(age) {
  const a = ((age % SYNODIC) + SYNODIC) % SYNODIC, f = a / SYNODIC;
  if (f < 0.0339 || f > 0.9661) return 'New moon';
  if (f < 0.2161) return 'Waxing crescent';
  if (f < 0.2839) return 'First quarter';
  if (f < 0.4661) return 'Waxing gibbous';
  if (f < 0.5339) return 'Full moon';
  if (f < 0.7161) return 'Waning gibbous';
  if (f < 0.7839) return 'Last quarter';
  return 'Waning crescent';
}

/** The Moon as it looks from the northern hemisphere: lit on the right while waxing. */
export function drawFace(ctx, x, y, r, age, col) {
  const f = (((age % SYNODIC) + SYNODIC) % SYNODIC) / SYNODIC;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  // The dark side is the card back's navy, which is dark on either scheme.
  ctx.fillStyle = col.back;
  ctx.fill();
  const waxing = f < 0.5;
  const k = Math.cos(TAU * f);           // 1 at new, -1 at full
  ctx.beginPath();
  // The lit half-disc, on the right while waxing.
  ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !waxing);
  // Back along the terminator, an ellipse of half-width r·|k|.
  ctx.ellipse(x, y, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, waxing ? k > 0 : k < 0);
  ctx.closePath();
  ctx.fillStyle = col.stock;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.strokeStyle = col.separator;
  ctx.lineWidth = 1;
  ctx.stroke();
}

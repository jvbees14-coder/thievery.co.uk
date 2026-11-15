// ---------------------------------------------------------------------------
// Bicycle gears: the arithmetic and the drawing.
//
// One turn of the pedals pulls the chain round by the chainring's teeth;
// the sprocket turns once for every one of its own teeth that passes, and
// the back wheel turns with it. So the wheel turns chainring ÷ sprocket
// times for each turn of the pedals, and the bike goes that many wheel
// circumferences (2.105 m for a 700×25 road tyre). The push the road gets
// is the push on the pedal × crank length ÷ wheel radius × sprocket ÷
// chainring: what a high gear gives in distance it takes back in force.
// ---------------------------------------------------------------------------

export const WHEEL = 2.105, CRANK = 0.1725, RADIUS = WHEEL / (2 * Math.PI);
export const RIDER = 85;   // rider and bike, kg
export const RINGS = [50, 34], CASSETTE = [11, 12, 13, 14, 15, 17, 19, 21, 24, 27, 30];

export const ratio = (ring, sprocket) => ring / sprocket;
export const metres = (ring, sprocket) => ratio(ring, sprocket) * WHEEL;
export const kmh = (ring, sprocket, rpm) => (metres(ring, sprocket) * rpm * 60) / 1000;
/** Average push on the pedal, in newtons, to climb a slope of `grade` (0.08 = 8%) slowly. */
export function pedalForce(ring, sprocket, grade) {
  const road = RIDER * 9.81 * Math.sin(Math.atan(grade));
  return road * (RADIUS / CRANK) * (ring / sprocket);
}

/** The drive side of a bike: chainring, chain, sprocket, back wheel. */
export function drawDrive(ctx, w, h, col, ring, sprocket, crank, { wheel = true } = {}) {
  const k = Math.min(w / 640, h / 360);
  const cx = w * 0.32, cy = h * 0.55, rx = w * 0.72, ry = cy;
  const R1 = ring * 1.6 * k, R2 = sprocket * 1.6 * k, RW = Math.min(170 * k, h * 0.42);
  if (wheel) {
    ctx.strokeStyle = col['separator-strong'];
    ctx.lineWidth = Math.max(4, 8 * k);
    ctx.beginPath();
    ctx.arc(rx, ry, RW, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    const turn = crank * (ring / sprocket);
    for (let i = 0; i < 16; i++) {
      const a = turn + (i / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.cos(a) * RW, ry + Math.sin(a) * RW);
      ctx.stroke();
    }
  }
  // The chain: the two straight runs between the rings.
  ctx.strokeStyle = col['label-tertiary'];
  ctx.lineWidth = Math.max(2, 3 * k);
  ctx.beginPath();
  ctx.moveTo(cx, cy - R1);
  ctx.lineTo(rx, ry - R2);
  ctx.moveTo(cx, cy + R1);
  ctx.lineTo(rx, ry + R2);
  ctx.stroke();
  const teeth = (x, y, r, n, a, c) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = col['bg-elevated-2'];
    ctx.fill();
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = c;
    for (let i = 0; i < n; i++) {
      const t = a + (i / n) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(t) * r, y + Math.sin(t) * r, Math.max(1.2, 2 * k), 0, Math.PI * 2);
      ctx.fill();
    }
  };
  teeth(cx, cy, R1, ring, crank, col.accent);
  teeth(rx, ry, R2, sprocket, crank * (ring / sprocket), col['hiw-ink-1']);
  // The crank and pedal.
  const L = R1 * 1.25;
  ctx.strokeStyle = col.label;
  ctx.lineWidth = Math.max(4, 7 * k);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(crank) * L, cy + Math.sin(crank) * L);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = col.label;
  ctx.fillRect(cx + Math.cos(crank) * L - 10 * k, cy + Math.sin(crank) * L - 4 * k, 20 * k, 8 * k);
  return { cx, cy, rx, ry, R1, R2, RW };
}

// ---------------------------------------------------------------------------
// Logic gates: the rules and the drawing.
//
// A gate takes ones and noughts and gives one out. A full adder is two
// XORs, two ANDs and an OR; four of them in a row add two four-bit
// numbers. A set-reset latch is two NOR gates, each fed by the other.
// ---------------------------------------------------------------------------

export const GATES = {
  AND: (a, b) => a & b,
  OR: (a, b) => a | b,
  NOT: (a) => 1 - a,
  NAND: (a, b) => 1 - (a & b),
  NOR: (a, b) => 1 - (a | b),
  XOR: (a, b) => a ^ b,
};

export function fullAdder(a, b, c) {
  const x = a ^ b;
  return { sum: x ^ c, carry: (a & b) | (x & c) };
}

/** Add two numbers bit by bit, as a row of full adders would. */
export function ripple(A, B, bits = 4) {
  const out = [];
  let c = 0;
  for (let i = 0; i < bits; i++) {
    const a = (A >> i) & 1, b = (B >> i) & 1;
    const r = fullAdder(a, b, c);
    out.push({ a, b, cin: c, sum: r.sum, carry: r.carry });
    c = r.carry;
  }
  return { bits: out, carry: c, total: out.reduce((n, r, i) => n + (r.sum << i), 0) + (c << bits) };
}

/** Settle a NOR latch: S and R the inputs, q the state it was in. */
export function latch(S, R, q) {
  let Q = q, Qn = 1 - q;
  for (let i = 0; i < 4; i++) {
    Q = GATES.NOR(R, Qn);
    Qn = GATES.NOR(S, Q);
  }
  return { Q, Qn };
}

/** A gate's symbol, facing right, its left edge at x and centred on y. */
export function drawGate(ctx, kind, x, y, s, col, on) {
  const base = kind.replace(/^N(?!OT)/, '');
  const bubble = kind === 'NOT' || kind === 'NAND' || kind === 'NOR';
  ctx.beginPath();
  if (base === 'AND') {
    ctx.moveTo(x, y - s / 2);
    ctx.lineTo(x + s * 0.5, y - s / 2);
    ctx.arc(x + s * 0.5, y, s / 2, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x, y + s / 2);
    ctx.closePath();
  } else if (base === 'OR' || base === 'XOR') {
    ctx.moveTo(x, y - s / 2);
    ctx.quadraticCurveTo(x + s * 0.6, y - s / 2, x + s, y);
    ctx.quadraticCurveTo(x + s * 0.6, y + s / 2, x, y + s / 2);
    ctx.quadraticCurveTo(x + s * 0.25, y, x, y - s / 2);
  } else {
    ctx.moveTo(x, y - s / 2);
    ctx.lineTo(x + s * 0.85, y);
    ctx.lineTo(x, y + s / 2);
    ctx.closePath();
  }
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fill();
  ctx.strokeStyle = on ? col.accent : col['label-secondary'];
  ctx.lineWidth = 2;
  ctx.stroke();
  if (base === 'XOR') {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.12, y - s / 2);
    ctx.quadraticCurveTo(x + s * 0.13, y, x - s * 0.12, y + s / 2);
    ctx.stroke();
  }
  const tip = base === 'NOT' ? x + s * 0.85 : x + s;
  if (bubble) {
    ctx.beginPath();
    ctx.arc(tip + s * 0.07, y, s * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = col['bg-elevated-2'];
    ctx.fill();
    ctx.stroke();
    return tip + s * 0.14;
  }
  return tip;
}

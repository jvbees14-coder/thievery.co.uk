// ---------------------------------------------------------------------------
// The electric motor: the physics.
//
// A wire carrying a current I across a magnetic field B, over a length L,
// is pushed with a force F = BIL at right angles to both. A coil of N turns
// is two such wires going opposite ways, so the pushes make it turn, with a
// torque of 2rF·cos θ (θ the coil's angle from lying along the field). A
// commutator reverses the current every half turn, so the torque never
// changes sign. Spinning, the coil also makes a voltage of its own that
// opposes the supply (k·ω), so the current, and the torque, fall as it
// speeds up.
// ---------------------------------------------------------------------------

export const MOTOR = {
  V: 12,          // supply, volts
  R: 1.5,         // coil resistance, ohms
  k: 0.06,        // volts per rad/s, and newton-metres per amp
  J: 0.0004,      // moment of inertia, kg m²
  drag: 0.00002,  // friction, N m per rad/s
};

/** Force on a wire, in newtons. */
export const force = (B, I, L) => B * I * L;

/**
 * One small step of a spinning coil. `s` is { angle, omega }, `load` an
 * extra torque against it in N m, `commutator` whether the current flips
 * every half turn. Returns the current and torque at this moment.
 */
export function stepMotor(s, dt, { load = 0, commutator = true } = {}) {
  const { V, R, k, J, drag } = MOTOR;
  const c = Math.cos(s.angle);
  // The sign the current takes in the coil: fixed without a commutator,
  // flipped each half turn with one.
  const sign = commutator ? (c >= 0 ? 1 : -1) : 1;
  const back = k * s.omega * c * sign;           // the coil's own voltage
  const I = (V - back) / R;
  const torque = k * I * c * sign;
  const net = torque - drag * s.omega - (s.omega > 0 ? load : 0);
  s.omega += (net / J) * dt;
  if (commutator && s.omega < 0) s.omega = 0;
  s.angle += s.omega * dt;
  return { I, torque, back };
}

export const rpm = (omega) => (omega * 60) / (2 * Math.PI);

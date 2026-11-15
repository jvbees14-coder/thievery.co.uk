// ---------------------------------------------------------------------------
// Neural networks: one neuron, then a small network, trained for real.
//
// Points on a square from −1 to 1, each labelled 0 or 1. A single neuron
// says 1 when w1·x + w2·y + b > 0, a straight dividing line, and learns by
// the perceptron rule (Rosenblatt, 1958): nudge the weights towards any
// point it gets wrong. The network has one hidden layer of tanh neurons and
// a sigmoid output, trained by gradient descent on the cross-entropy, with
// the gradients worked out by backpropagation.
// ---------------------------------------------------------------------------

export function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function dataset(kind, n = 120, rand = Math.random) {
  const pts = [];
  while (pts.length < n) {
    const x = rand() * 2 - 1, y = rand() * 2 - 1;
    let c;
    if (kind === 'clusters') {
      const d0 = Math.hypot(x + 0.45, y + 0.35), d1 = Math.hypot(x - 0.45, y - 0.35);
      if (Math.min(d0, d1) > 0.42) continue;
      c = d1 < d0 ? 1 : 0;
    } else if (kind === 'xor') {
      if (Math.abs(x) < 0.1 || Math.abs(y) < 0.1) continue;
      c = (x > 0) !== (y > 0) ? 1 : 0;
    } else {
      const r = Math.hypot(x, y);
      if (Math.abs(r - 0.55) < 0.08) continue;
      c = r < 0.55 ? 1 : 0;
    }
    pts.push([x, y, c]);
  }
  return pts;
}

// --- one neuron ---

export const neuron = (w, x, y) => (w[0] * x + w[1] * y + w[2] > 0 ? 1 : 0);
/** One step of the perceptron rule on a wrongly classified point; false if none left. */
export function perceptronStep(w, pts, rate = 0.2, rand = Math.random) {
  const wrong = pts.filter(([x, y, c]) => neuron(w, x, y) !== c);
  if (!wrong.length) return false;
  const [x, y, c] = wrong[Math.floor(rand() * wrong.length)];
  const s = c ? 1 : -1;
  w[0] += rate * s * x;
  w[1] += rate * s * y;
  w[2] += rate * s;
  return true;
}

// --- a small network ---

export function network(hidden = 8, rand = Math.random) {
  const r = () => (rand() * 2 - 1) * 0.9;
  return {
    W1: Array.from({ length: hidden }, () => [r(), r()]),
    b1: Array.from({ length: hidden }, r),
    W2: Array.from({ length: hidden }, r),
    b2: 0,
  };
}
export function forward(net, x, y) {
  const h = net.W1.map(([a, b], i) => Math.tanh(a * x + b * y + net.b1[i]));
  const z = h.reduce((s, v, i) => s + v * net.W2[i], net.b2);
  return { h, out: 1 / (1 + Math.exp(-z)) };
}
/** One pass of gradient descent over every point. */
export function train(net, pts, rate = 0.5) {
  const n = pts.length, H = net.W2.length;
  const gW1 = net.W1.map(() => [0, 0]), gb1 = new Array(H).fill(0), gW2 = new Array(H).fill(0);
  let gb2 = 0;
  for (const [x, y, c] of pts) {
    const { h, out } = forward(net, x, y);
    const d = out - c;
    gb2 += d;
    for (let i = 0; i < H; i++) {
      gW2[i] += d * h[i];
      const dh = d * net.W2[i] * (1 - h[i] * h[i]);
      gW1[i][0] += dh * x;
      gW1[i][1] += dh * y;
      gb1[i] += dh;
    }
  }
  for (let i = 0; i < H; i++) {
    net.W2[i] -= (rate * gW2[i]) / n;
    net.W1[i][0] -= (rate * gW1[i][0]) / n;
    net.W1[i][1] -= (rate * gW1[i][1]) / n;
    net.b1[i] -= (rate * gb1[i]) / n;
  }
  net.b2 -= (rate * gb2) / n;
}
export const accuracy = (pred, pts) => pts.filter(([x, y, c]) => pred(x, y) === c).length / pts.length;

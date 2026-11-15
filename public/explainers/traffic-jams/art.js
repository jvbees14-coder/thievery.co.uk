// ---------------------------------------------------------------------------
// Traffic jams: cars on a ring road.
//
// Each car follows the one in front by the Intelligent Driver Model
// (Treiber, Hennecke and Helbing, 2000): it speeds up towards the speed it
// wants, and brakes harder the closer it is to the car ahead and the faster
// it is closing on it. Drivers react a little late and not quite evenly,
// which is modelled as a small random wobble. On a crowded ring that is
// enough for a jam to grow out of nothing, as in Sugiyama and colleagues'
// experiment of 2008: 22 cars on a 230 m circle.
// ---------------------------------------------------------------------------

export const ROAD = 230, CAR = 4.5;
export const IDM = { v0: 11, T: 1.2, a: 0.6, b: 1.5, s0: 2, delta: 4 };

/** Cars evenly spaced at an even speed: the calm start. */
export function ring(n, rand = Math.random) {
  const gap = ROAD / n;
  return Array.from({ length: n }, (_, i) => ({ x: i * gap + (rand() - 0.5) * 0.1, v: 5, a: 0, calm: false }));
}

function accel(car, ahead, dx, p) {
  const s = Math.max(0.1, dx - CAR);
  const dv = car.v - ahead.v;
  const want = p.s0 + Math.max(0, car.v * p.T + (car.v * dv) / (2 * Math.sqrt(p.a * p.b)));
  return p.a * (1 - (car.v / p.v0) ** p.delta - (want / s) ** 2);
}

/**
 * Move every car on by dt seconds. `noise` is the size of the wobble in
 * m/s²; a car marked calm drives steadily at the average speed.
 */
export function step(cars, dt, { noise = 0.3, rand = Math.random } = {}) {
  const n = cars.length;
  const avg = meanSpeed(cars);
  // Cars are kept in order round the ring; each follows the next.
  const acc = cars.map((c, i) => {
    const ahead = cars[(i + 1) % n];
    let dx = ahead.x - c.x;
    if (dx <= 0) dx += ROAD;
    let a = accel(c, ahead, dx, IDM);
    if (c.calm) {
      // The steady driver holds the traffic's average speed, letting the gap
      // ahead open and close rather than braking into it, and only brakes
      // harder when the car-following rule says it must.
      a = Math.min(a, 0.5 * (avg - c.v));
    } else a += (rand() - 0.5) * 2 * noise;
    return a;
  });
  cars.forEach((c, i) => {
    c.a = acc[i];
    c.v = Math.max(0, c.v + acc[i] * dt);
    c.x = (c.x + c.v * dt) % ROAD;
  });
}

export const spread = (cars) => {
  const m = cars.reduce((s, c) => s + c.v, 0) / cars.length;
  return Math.sqrt(cars.reduce((s, c) => s + (c.v - m) ** 2, 0) / cars.length);
};
export const meanSpeed = (cars) => cars.reduce((s, c) => s + c.v, 0) / cars.length;

// ---------------------------------------------------------------------------
// How JPEG shrinks a photo: the arithmetic, apart from drawing.
//
// A greyscale picture drawn from a few shapes, cut into 8 × 8 blocks; each
// block's discrete cosine transform (DCT-II, orthonormal), its division by
// the standard's luminance table scaled for a quality from 1 to 100 (the
// Independent JPEG Group's rule), rounding, and the way back. Nothing here
// touches the page, so the counts quoted can be checked in Node.
// ---------------------------------------------------------------------------

export const N = 64;

// Table K.1 of the JPEG standard (ITU-T T.81): luminance quantisation.
export const TABLE = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

export function table(quality) {
  const q = Math.min(100, Math.max(1, quality));
  const s = q < 50 ? 5000 / q : 200 - 2 * q;
  return TABLE.map((t) => Math.max(1, Math.floor((t * s + 50) / 100)));
}

/** The picture: brightness 0 to 255 for each of 64 × 64 pixels. */
export function picture() {
  const img = new Float64Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 70 + y * 1.6; // a sky growing lighter downwards
    if ((x - 44) ** 2 + (y - 18) ** 2 < 100) v = 235; // a sun
    if (y > 40 - 6 * Math.sin(x / 9)) v = 60 + ((x * 7 + y * 13) % 9) * 3; // dark hills with texture
    if (x > 8 && x < 20 && y > 22 && y < 52) v = 200; // a pale wall
    if (x > 11 && x < 17 && y > 30 && y < 40) v = 40; // its window
    img[y * N + x] = v;
  }
  return img;
}

const C = (k) => (k === 0 ? Math.SQRT1_2 : 1);
const COS = Array.from({ length: 8 }, (_, x) => Array.from({ length: 8 }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / 16)));

export function block(img, bx, by) {
  const b = new Float64Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) b[y * 8 + x] = img[(by * 8 + y) * N + bx * 8 + x] - 128;
  return b;
}

export function dct(b) {
  const out = new Float64Array(64);
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
    let s = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += b[y * 8 + x] * COS[x][u] * COS[y][v];
    out[v * 8 + u] = 0.25 * C(u) * C(v) * s;
  }
  return out;
}

export function idct(c) {
  const out = new Float64Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    let s = 0;
    for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) s += C(u) * C(v) * c[v * 8 + u] * COS[x][u] * COS[y][v];
    out[y * 8 + x] = 0.25 * s;
  }
  return out;
}

/** The whole picture through JPEG at a quality: { img, zeros, total, error }. */
export function squeeze(img, quality) {
  const T = table(quality);
  const out = new Float64Array(N * N);
  let zeros = 0, err = 0;
  for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) {
    const c = dct(block(img, bx, by));
    const q = c.map((v, i) => Math.round(v / T[i]));
    zeros += q.filter((v) => v === 0).length;
    const back = idct(q.map((v, i) => v * T[i]));
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const p = Math.min(255, Math.max(0, back[y * 8 + x] + 128));
      out[(by * 8 + y) * N + bx * 8 + x] = p;
      err += (p - img[(by * 8 + y) * N + bx * 8 + x]) ** 2;
    }
  }
  return { img: out, zeros, total: N * N, error: Math.sqrt(err / (N * N)) };
}

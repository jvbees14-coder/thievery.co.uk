// ---------------------------------------------------------------------------
// QR codes: a real encoder, byte mode, versions 1 to 10.
//
// Written from the standard (ISO/IEC 18004) the way Project Nayuki's
// well-known reference library lays it out: choose the smallest version
// that fits, add Reed-Solomon error correction block by block, interleave,
// draw the fixed patterns, lay the bits in the two-column zigzag, then try
// all eight masks and keep the one with the lowest penalty. It returns
// everything the scene wants to show along the way, not just the picture.
// ---------------------------------------------------------------------------

export const LEVELS = ['L', 'M', 'Q', 'H'];
const FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };
// Error-correction codewords per block, and blocks, for versions 1 to 10.
const ECC_PER_BLOCK = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};
const BLOCKS = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};
export const RECOVERS = { L: 7, M: 15, Q: 25, H: 30 };

// --- arithmetic in GF(256), the field Reed-Solomon codes live in -------------------

export function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
export function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}
export function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)));
  }
  return result;
}

// --- sizes -----------------------------------------------------------------------------

const sizeOf = (ver) => ver * 4 + 17;
function rawDataModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
export function dataCodewords(ver, ecl) {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver - 1] * BLOCKS[ecl][ver - 1];
}
function alignmentPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = sizeOf(ver) - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

// --- the encoder ---------------------------------------------------------------------

/**
 * Encode text. Returns null if it is too long for version 10 at this level.
 * Otherwise { ver, size, modules, kind, order, dataCount, eccCount, mask,
 * penalties }: `kind[y][x]` names what each module is for (finder,
 * separator, timing, alignment, format, version, dark, data, ecc) and
 * `order[y][x]` the position of a data module's bit in the stream.
 */
export function encode(text, ecl = 'M', forceMask = null) {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  for (; ver <= 10; ver++) {
    const ccBits = ver <= 9 ? 8 : 16;
    if (4 + ccBits + bytes.length * 8 <= dataCodewords(ver, ecl) * 8) break;
  }
  if (ver > 10) return null;
  const capacity = dataCodewords(ver, ecl) * 8;

  // The bit stream: mode, count, data, terminator, padding.
  const bits = [];
  const put = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // Error correction, block by block, then interleaved.
  const numBlocks = BLOCKS[ecl][ver - 1];
  const eccLen = ECC_PER_BLOCK[ecl][ver - 1];
  const raw = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const all = [];
  const isEcc = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((b, j) => {
      if (i !== shortLen - eccLen || j >= numShort) {
        all.push(b[i]);
        isEcc.push(i >= shortLen - eccLen);
      }
    });
  }

  // The fixed patterns.
  const size = sizeOf(ver);
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const kind = Array.from({ length: size }, () => new Array(size).fill(null));
  const order = Array.from({ length: size }, () => new Array(size).fill(-1));
  const set = (x, y, dark, k) => {
    modules[y][x] = dark;
    kind[y][x] = k;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0, 'timing');
    set(i, 6, i % 2 === 0, 'timing');
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4, d === 4 ? 'separator' : 'finder');
    }
  }
  const al = alignmentPositions(ver);
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, 'alignment');
  }));
  const drawFormat = (mask) => {
    const d = (FORMAT_BITS[ecl] << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412;
    const bit = (i) => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i), 'format');
    set(8, 7, bit(6), 'format');
    set(8, 8, bit(7), 'format');
    set(7, 8, bit(8), 'format');
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i), 'format');
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i), 'format');
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i), 'format');
    set(8, size - 8, true, 'dark');
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((b >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3), c = Math.floor(i / 3);
      set(a, c, dark, 'version');
      set(c, a, dark, 'version');
    }
  }

  // The data, in the zigzag: two columns at a time, up and down, from the right.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (kind[y][x] === null && i < all.length * 8) {
          modules[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          kind[y][x] = isEcc[i >>> 3] ? 'ecc' : 'data';
          order[y][x] = i;
          i++;
        } else if (kind[y][x] === null) {
          kind[y][x] = 'data';
          order[y][x] = i++;
        }
      }
    }
  }

  // Masks: flip the data modules by a pattern, and keep the best.
  const flip = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (kind[y][x] !== 'data' && kind[y][x] !== 'ecc') continue;
      const c = [
        (x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0,
        (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, ((x * y) % 2) + ((x * y) % 3) === 0,
        (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
      ][m];
      if (c) modules[y][x] = !modules[y][x];
    }
  };
  const penalties = [];
  for (let m = 0; m < 8; m++) {
    flip(m);
    drawFormat(m);
    penalties.push(penalty(modules, size));
    flip(m);
  }
  const mask = forceMask ?? penalties.indexOf(Math.min(...penalties));
  flip(mask);
  drawFormat(mask);
  return { ver, size, modules, kind, order, mask, penalties, dataCount: data.length, eccCount: all.length - data.length, bytes: bytes.length, capacity: dataCodewords(ver, ecl) };
}

function penalty(mod, size) {
  let score = 0;
  const line = (get) => {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    // Finder-like stretches: dark-light-dark-dark-dark-light-dark with four light on a side.
    for (let i = 0; i + 11 <= size; i++) {
      const s = Array.from({ length: 11 }, (_, k) => (get(i + k) ? 1 : 0)).join('');
      if (s === '10111010000' || s === '00001011101') score += 40;
    }
  };
  for (let y = 0; y < size; y++) line((x) => mod[y][x]);
  for (let x = 0; x < size; x++) line((y) => mod[y][x]);
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = mod[y][x];
    if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3;
  }
  let dark = 0;
  for (const row of mod) for (const v of row) if (v) dark++;
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

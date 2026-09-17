// ---------------------------------------------------------------------------
// The home-screen icons, drawn rather than fetched.
//
//   npm run icons
//
// The site's mark is a brass diamond on ink, and it already exists twice: once
// as the inline SVG favicon in every page's <head>, and once in the wordmark.
// A phone asking to put the site on a home screen wants neither of those — it
// wants PNGs at fixed sizes, and Apple in particular will not take an SVG.
//
// Rather than keep binaries nobody can regenerate, the mark is written down
// here as the handful of numbers it actually is and rasterised on demand. Two
// diamonds, a rounded square and a 4x4 supersample for the edges; the PNG is
// assembled by hand because zlib is in the standard library and an image
// library for this would be a third dependency for nine hundred bytes of
// output.
//
// If the mark ever changes, change it here and run this again.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'icons');

// --- the mark, on the 32-unit grid the favicon uses ------------------------

const INK = [0x0a, 0x0c, 0x14];
const BRASS = [0xd4, 0xaf, 0x5a];
const GRID = 32;
const CORNER = 6; // the rounded square's radius
const OUTER = { cx: 16, cy: 16, w: 10, h: 12, stroke: 1 }; // half-width, half-height
const INNER = { cx: 16, cy: 16, w: 5, h: 6 };

// A diamond is everything whose scaled distance from the centre is under one.
const diamond = (x, y, d) => Math.abs(x - d.cx) / d.w + Math.abs(y - d.cy) / d.h;

// How far from the outline of a diamond, in roughly the units the grid uses.
// The gradient of the function above is constant, so one divide converts.
function fromEdge(x, y, d) {
  const slope = Math.hypot(1 / d.w, 1 / d.h);
  return Math.abs(diamond(x, y, d) - 1) / slope;
}

function insideRounded(x, y) {
  const r = CORNER;
  const dx = Math.max(r - x, x - (GRID - r), 0);
  const dy = Math.max(r - y, y - (GRID - r), 0);
  return Math.hypot(dx, dy) <= r;
}

/** The colour at one point on the grid, or null for outside the tile. */
function sample(x, y) {
  if (!insideRounded(x, y)) return null;
  if (diamond(x, y, INNER) <= 1) return BRASS;
  if (fromEdge(x, y, OUTER) <= OUTER.stroke) return BRASS;
  return INK;
}

// --- rasterising -----------------------------------------------------------

const SUB = 4; // samples per pixel per axis, which is plenty at these sizes

function raster(size) {
  const px = Buffer.alloc(size * size * 4);
  const step = GRID / size;
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const gx = (pxi + (sx + 0.5) / SUB) * step;
          const gy = (py + (sy + 0.5) / SUB) * step;
          const c = sample(gx, gy);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 255;
        }
      }
      const n = SUB * SUB;
      const at = (py * size + pxi) * 4;
      const covered = a / 255;
      // Straight alpha, so the colour is the average of the samples that
      // actually landed on the tile rather than of all of them.
      px[at] = covered ? Math.round(r / covered) : 0;
      px[at + 1] = covered ? Math.round(g / covered) : 0;
      px[at + 2] = covered ? Math.round(b / covered) : 0;
      px[at + 3] = Math.round(a / n);
    }
  }
  return px;
}

// --- writing a PNG ---------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const tagged = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tagged));
  return Buffer.concat([length, tagged, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // eight bits a channel
  ihdr[9] = 6; // truecolour with alpha
  // The remaining three are compression, filter and interlace, all zero.

  // One filter byte in front of every row, and the filter is "none": these are
  // tiny and flat, and zlib does the work.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- and out ---------------------------------------------------------------

fs.mkdirSync(OUT, { recursive: true });
for (const size of [180, 192, 512]) {
  const file = path.join(OUT, `icon-${size}.png`);
  const bytes = png(size, raster(size));
  fs.writeFileSync(file, bytes);
  console.log(`  wrote ${path.relative(path.join(__dirname, '..'), file)} (${bytes.length} bytes)`);
}
console.log('\nIcons written. They are committed, so this only needs running if the mark changes.\n');

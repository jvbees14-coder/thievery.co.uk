// ---------------------------------------------------------------------------
// Steganography: a message in the last bit of every pixel.
//
// A small greyscale picture (a sun over hills, with a little grain, as real
// photos have), each pixel a brightness from 0 to 255: eight bits. The
// message's bytes are written, bit by bit, into the lowest bit of the
// pixels in reading order. That changes any pixel by at most 1 in 255.
// ---------------------------------------------------------------------------

export const W = 96, H = 64;

export function picture() {
  let s = 17;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const px = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 200 - y * 1.6;                                        // sky, darker downwards
      if (Math.hypot(x - 68, y - 18) < 9) v = 250;                  // the sun
      const hill1 = 44 + 8 * Math.sin(x / 11), hill2 = 52 + 5 * Math.sin(x / 7 + 2);
      if (y > hill1) v = 120 - (y - hill1) * 1.2;
      if (y > hill2) v = 80 - (y - hill2) * 1.5;
      v += (rand() - 0.5) * 6;                                      // grain
      px[y * W + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return px;
}

export const bytesOf = (text) => [...new TextEncoder().encode(text)];

/** A copy of the picture with `text` hidden in the lowest bits. */
export function hide(px, text) {
  const out = px.slice(), bytes = bytesOf(text);
  const bits = [];
  for (const b of [bytes.length, ...bytes]) for (let k = 7; k >= 0; k--) bits.push((b >> k) & 1);
  bits.forEach((bit, i) => { if (i < out.length) out[i] = (out[i] & 0xfe) | bit; });
  return { out, used: bits.length };
}

/** Read a hidden message back: a length byte, then that many bytes. */
export function reveal(px) {
  const byteAt = (i) => {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | (px[i * 8 + k] & 1);
    return b;
  };
  const n = byteAt(0);
  const bytes = Array.from({ length: n }, (_, i) => byteAt(i + 1));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export function paint(ctx, x0, y0, w, h, px, col, mix, fn = (v) => v / 255) {
  const cell = Math.min(w / W, h / H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      ctx.fillStyle = mix(col.back, col.stock, fn(px[y * W + x], x, y));
      ctx.fillRect(x0 + x * cell, y0 + y * cell, cell + 0.4, cell + 0.4);
    }
  }
  return cell;
}

// ---------------------------------------------------------------------------
// Passwords: hashing, guessing speeds, and how big a search is.
//
// The hashes are real SHA-256, worked out in the browser by the Web Crypto
// API, from what the reader types; nothing typed is sent anywhere or kept.
// The speeds are one graphics card's published hashcat benchmarks; the
// times are simple arithmetic on them, the worst case of trying everything.
// ---------------------------------------------------------------------------

import { alpha } from '../engine.js';
import { mix } from '../shared/draw.js';

// Guesses a second on one NVIDIA RTX 4090, hashcat 6.2.6 benchmarks
// (Chick3nman's published run). bcrypt is at cost 5 there; every step up in
// cost doubles the work, so cost 10 is 32 times slower and cost 12 128 times.
export const SPEEDS = [
  { id: 'md5', name: 'MD5', rate: 164.1e9 },
  { id: 'sha256', name: 'SHA-256', rate: 21.98e9 },
  { id: 'bcrypt5', name: 'bcrypt, cost 5', rate: 184e3 },
  { id: 'bcrypt10', name: 'bcrypt, cost 10', rate: 184e3 / 32 },
  { id: 'bcrypt12', name: 'bcrypt, cost 12', rate: 184e3 / 128 },
];

// The most common passwords in breached accounts (NCSC, 2019, from Have I
// Been Pwned): these and anything like them are tried first, so they fall
// at once whatever their length.
export const COMMON = ['123456', '123456789', 'qwerty', 'password', '1111111', '12345678', '111111', '1234567', 'abc123', 'password1', '12345', '123123', 'iloveyou', '000000', 'qwerty123', 'letmein', 'monkey', 'dragon', 'football', 'liverpool', 'arsenal', 'chelsea', 'ashley', 'michael', 'daniel', 'jessica', 'charlie', 'admin', 'welcome', 'sunshine'];

export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}
export const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The alphabet a password seems to draw from, and so how many there are of its length. */
export function searchSize(pw) {
  let set = 0;
  if (/[a-z]/.test(pw)) set += 26;
  if (/[A-Z]/.test(pw)) set += 26;
  if (/[0-9]/.test(pw)) set += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) set += 33;
  return { set, count: set ** pw.length };
}
export function isCommon(pw) {
  const p = pw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return COMMON.includes(pw.toLowerCase()) || COMMON.some((c) => p === c || p === `${c}1` || p === `${c}123`);
}

/** Seconds as a phrase a person can feel. */
export function duration(s) {
  if (!Number.isFinite(s) || s > 13.8e9 * 3.156e7) return 'longer than the age of the universe';
  if (s < 1) return 'under a second';
  const units = [
    ['year', 3.156e7], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1],
  ];
  for (const [name, size] of units) {
    if (s >= size) {
      const n = s / size;
      if (name === 'year' && n >= 1e6) {
        const big = n >= 1e9 ? `${(n / 1e9).toLocaleString('en-GB', { maximumFractionDigits: 1 })} billion` : `${(n / 1e6).toLocaleString('en-GB', { maximumFractionDigits: 1 })} million`;
        return `${big} years`;
      }
      const r = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
      return `${r.toLocaleString('en-GB')} ${name}${r === 1 ? '' : 's'}`;
    }
  }
  return 'under a second';
}

/** A hash as a 16 by 16 grid of its 256 bits; bits that just changed glow. */
export function drawBits(ctx, x, y, size, bytes, prev, col, ink, glow = 1) {
  const cell = size / 16;
  for (let i = 0; i < 256; i++) {
    const on = bytes ? (bytes[i >> 3] >> (7 - (i & 7))) & 1 : 0;
    const was = prev ? (prev[i >> 3] >> (7 - (i & 7))) & 1 : on;
    const cx = x + (i % 16) * cell, cy = y + Math.floor(i / 16) * cell;
    ctx.fillStyle = on ? ink : alpha(col['label-secondary'], 0.12);
    if (on !== was && glow > 0) ctx.fillStyle = mix(on ? ink : col['label-secondary'], col['accent-strong'], 0.6 * glow);
    ctx.fillRect(cx + 1, cy + 1, cell - 2, cell - 2);
  }
}

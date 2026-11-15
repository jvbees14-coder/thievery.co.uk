// ---------------------------------------------------------------------------
// The one-time pad: letters only.
//
// Each letter of the message is moved along the alphabet by the matching
// letter of the key (A by 0, B by 1 ... Z by 25), wrapping round. Taking
// the key away again gives the message back. With a key as long as the
// message, truly random and never used twice, the result can be any message
// at all of that length, which is what Claude Shannon proved in 1949.
// ---------------------------------------------------------------------------

export const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const n = (c) => ABC.indexOf(c);
const mod = (x) => ((x % 26) + 26) % 26;

export const letters = (s) => s.toUpperCase().replace(/[^A-Z]/g, '');
export const add = (a, b) => [...a].map((c, i) => ABC[mod(n(c) + n(b[i] ?? 'A'))]).join('');
export const sub = (a, b) => [...a].map((c, i) => ABC[mod(n(c) - n(b[i] ?? 'A'))]).join('');
export const randomKey = (len, rand = Math.random) => Array.from({ length: len }, () => ABC[Math.floor(rand() * 26)]).join('');

/** Rows of letters in boxes, one row per string, aligned. */
export function drawRows(ctx, x0, y0, w, rows, col, label) {
  const len = Math.max(...rows.map((r) => r.text.length), 1);
  const cell = Math.min(30, (w - 8) / len), size = Math.max(10, cell * 0.55);
  rows.forEach((row, k) => {
    const y = y0 + k * (cell + 26);
    label(ctx, row.name, x0, y - 9, col['label-tertiary'], null, { size: 11 });
    [...row.text].forEach((ch, i) => {
      const x = x0 + i * cell;
      ctx.fillStyle = row.fill || col['bg-elevated'];
      ctx.fillRect(x + 1, y, cell - 2, cell);
      label(ctx, ch, x + cell / 2, y + cell / 2, row.ink || col.label, null, { size, weight: 700, align: 'center', mono: true });
    });
  });
  return y0 + rows.length * (cell + 26);
}

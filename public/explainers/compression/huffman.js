// ---------------------------------------------------------------------------
// Compression: Huffman coding, done properly, on whatever the reader types.
//
// Count each character, then repeatedly join the two least common into one
// node until a single tree is left. Reading a character's path from the
// root (0 for left, 1 for right) gives its code: common characters near the
// top get short codes, rare ones long. Ties are broken by order of first
// appearance, so the same text always gives the same tree.
// ---------------------------------------------------------------------------

export function counts(text) {
  const m = new Map();
  for (const c of text) m.set(c, (m.get(c) || 0) + 1);
  return [...m.entries()].map(([ch, n], i) => ({ ch, n, order: i }));
}

/**
 * The merges, in order, so the scene can play them back one at a time.
 * Each step is { a, b, node } where node = { n, left: a, right: b }.
 */
export function build(text) {
  const leaves = counts(text).map((c) => ({ ...c, leaf: true }));
  let pool = leaves.slice();
  const steps = [];
  let made = 0;
  const key = (x) => [x.n, x.leaf ? 0 : 1, x.leaf ? x.order : x.id];
  const less = (x, y) => {
    const a = key(x), b = key(y);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  };
  while (pool.length > 1) {
    pool.sort((x, y) => (less(x, y) ? -1 : less(y, x) ? 1 : 0));
    const [a, b] = pool;
    const node = { n: a.n + b.n, left: a, right: b, leaf: false, id: made++ };
    steps.push({ a, b, node });
    pool = [node, ...pool.slice(2)];
  }
  const root = pool[0] || null;
  return { leaves, steps, root };
}

/** Each character's code, from a finished tree. */
export function codes(root) {
  const out = new Map();
  if (!root) return out;
  if (root.leaf) {
    out.set(root.ch, '0');
    return out;
  }
  const walk = (node, path) => {
    if (node.leaf) out.set(node.ch, path);
    else {
      walk(node.left, path + '0');
      walk(node.right, path + '1');
    }
  };
  walk(root, '');
  return out;
}

/** Bits a character takes in UTF-8, the way the text would normally be stored. */
export const utf8Bits = (ch) => new TextEncoder().encode(ch).length * 8;

/** The Shannon entropy of the text's characters: the best any such code can do, on average. */
export function entropy(text) {
  const cs = counts(text);
  const total = [...text].length;
  return cs.reduce((s, c) => s - (c.n / total) * Math.log2(c.n / total), 0);
}

export const shown = (ch) => (ch === ' ' ? '␣' : ch === '\n' ? '↵' : ch);

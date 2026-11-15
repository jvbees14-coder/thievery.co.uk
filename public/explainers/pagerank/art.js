// ---------------------------------------------------------------------------
// PageRank: the web and the sum.
//
// A small web of eight pages. A page's rank is the share of its time a
// random surfer spends there: following a link from the page they are on
// with probability d (the damping, 0.85 in Brin and Page's paper), or
// jumping to any page at all otherwise. A page with no links out sends its
// surfer to any page at random. The ranks are found by repeating the sum
// until it settles (power iteration).
// ---------------------------------------------------------------------------

export const PAGES = [
  { name: 'Home', x: 0.5, y: 0.22 },
  { name: 'News', x: 0.2, y: 0.36 },
  { name: 'Recipes', x: 0.8, y: 0.36 },
  { name: 'Blog', x: 0.12, y: 0.66 },
  { name: 'Shop', x: 0.42, y: 0.56 },
  { name: 'Forum', x: 0.88, y: 0.66 },
  { name: 'Wiki', x: 0.62, y: 0.78 },
  { name: 'Fan page', x: 0.3, y: 0.86 },
];
/** LINKS[i] is the list of pages page i links to. */
export const LINKS = [
  [1, 2, 4],    // Home
  [0, 4],       // News
  [0, 6],       // Recipes
  [1],          // Blog
  [0],          // Shop
  [2, 6],       // Forum
  [0, 2],       // Wiki
  [3],          // Fan page
];

export function inLinks(links = LINKS) {
  const n = links.length, c = new Array(n).fill(0);
  links.forEach((out) => out.forEach((j) => c[j]++));
  return c;
}

/** One round of the sum. */
export function step(rank, d = 0.85, links = LINKS) {
  const n = links.length, next = new Array(n).fill((1 - d) / n);
  links.forEach((out, i) => {
    if (!out.length) for (let j = 0; j < n; j++) next[j] += (d * rank[i]) / n;
    else for (const j of out) next[j] += (d * rank[i]) / out.length;
  });
  return next;
}
export function pagerank(d = 0.85, links = LINKS, rounds = 200) {
  let r = new Array(links.length).fill(1 / links.length);
  for (let k = 0; k < rounds; k++) r = step(r, d, links);
  return r;
}

/** Where a random surfer goes next. */
export function hop(from, d = 0.85, links = LINKS, rand = Math.random) {
  const out = links[from];
  if (!out.length || rand() > d) return { to: Math.floor(rand() * links.length), jump: true };
  return { to: out[Math.floor(rand() * out.length)], jump: false };
}

// ---------------------------------------------------------------------------
// Sorting: three ways to put a row in order.
//
// Each sort is a generator over an array, sorting it in place and yielding
// at every comparison ('compare', i, j) and every move ('swap', i, j or
// 'write', i), so a scene can play it a step at a time and count. Bubble
// sort swaps neighbours; merge sort (John von Neumann, 1945) merges sorted
// halves; quicksort (Tony Hoare, 1959) splits round a pivot.
// ---------------------------------------------------------------------------

export function* bubble(a) {
  for (let end = a.length - 1; end > 0; end--) {
    let swapped = false;
    for (let i = 0; i < end; i++) {
      yield ['compare', i, i + 1];
      if (a[i] > a[i + 1]) {
        [a[i], a[i + 1]] = [a[i + 1], a[i]];
        swapped = true;
        yield ['swap', i, i + 1];
      }
    }
    yield ['done', end];
    if (!swapped) return;
  }
}

export function* merge(a, lo = 0, hi = a.length) {
  if (hi - lo < 2) return;
  const mid = (lo + hi) >> 1;
  yield* merge(a, lo, mid);
  yield* merge(a, mid, hi);
  const left = a.slice(lo, mid), right = a.slice(mid, hi);
  let i = 0, j = 0, k = lo;
  while (i < left.length && j < right.length) {
    yield ['compare', lo + i, mid + j];
    a[k] = left[i] <= right[j] ? left[i++] : right[j++];
    yield ['write', k++];
  }
  while (i < left.length) { a[k] = left[i++]; yield ['write', k++]; }
  while (j < right.length) { a[k] = right[j++]; yield ['write', k++]; }
}

export function* quick(a, lo = 0, hi = a.length - 1, rand = Math.random) {
  if (lo >= hi) return;
  // A pivot chosen at random, moved to the end, then everything smaller
  // moved in front of it.
  const p = lo + Math.floor(rand() * (hi - lo + 1));
  [a[p], a[hi]] = [a[hi], a[p]];
  yield ['swap', p, hi];
  let s = lo;
  for (let i = lo; i < hi; i++) {
    yield ['compare', i, hi];
    if (a[i] < a[hi]) {
      [a[i], a[s]] = [a[s], a[i]];
      yield ['swap', i, s];
      s++;
    }
  }
  [a[s], a[hi]] = [a[hi], a[s]];
  yield ['swap', s, hi];
  yield ['pivot', s];
  yield* quick(a, lo, s - 1, rand);
  yield* quick(a, s + 1, hi, rand);
}

export const SORTS = { bubble, merge, quick };

export function shuffled(n, rand = Math.random) {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Comparisons a sort makes on a shuffled row of n. */
export function count(name, n, rand = Math.random) {
  const a = shuffled(n, rand);
  let c = 0;
  for (const ev of SORTS[name](a)) if (ev[0] === 'compare') c++;
  return c;
}

// ---------------------------------------------------------------------------
// Drawing the lines: the map and the plans, apart from drawing.
//
// Fifty voters in a grid five rows by ten columns: the six left-hand
// columns vote purple (30, 60%) and the four right-hand ones gold (20, 40%).
// Each plan gives every square a district from 0 to 4, ten squares each.
// A district needs six votes to win outright; with ten it cannot tie at
// more than five, and a five-five tie is counted as nobody's. Wasted votes
// are every vote for a loser and every winner's vote beyond five, as in
// Stephanopoulos and McGhee's efficiency gap.
// ---------------------------------------------------------------------------

export const ROWS = 5, COLS = 10;
export const party = (r, c) => (c < 6 ? 'P' : 'G');

/** Each plan as a function from a square to its district. */
export const PLANS = {
  rows: { name: 'Five rows', of: (r) => r },
  columns: { name: 'Pairs of columns', of: (r, c) => Math.floor(c / 2) },
  rigged: {
    name: 'Packed and cracked',
    of: (r, c) => {
      if (c < 4) return Math.floor(c / 2);
      // The 6 × 5 block to the right, read along its rows in tens.
      return 2 + Math.floor((r * 6 + (c - 4)) / 10);
    },
  },
};

export function tally(plan) {
  const d = Array.from({ length: 5 }, () => ({ P: 0, G: 0 }));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) d[PLANS[plan].of(r, c)][party(r, c)]++;
  let seats = { P: 0, G: 0 }, waste = { P: 0, G: 0 };
  for (const x of d) {
    if (x.P > x.G) { seats.P++; waste.P += x.P - 5; waste.G += x.G; }
    else if (x.G > x.P) { seats.G++; waste.G += x.G - 5; waste.P += x.P; }
  }
  return { districts: d, seats, waste, gap: (waste.P - waste.G) / (ROWS * COLS) };
}

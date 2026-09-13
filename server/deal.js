// ---------------------------------------------------------------------------
// How the deck is shared out.
//
// A round uses 26 cards: Ace to King in one red suit and one black suit. The
// table has three or four *hands* — never more, because a hand has to be big
// enough to hide something — and the cards are split between them as evenly
// as the count allows. The split is shuffled before every round so the short
// hand lands somewhere new each time. A host who prefers fixed hands can
// override all of this from the lobby.
//
// People and hands are not the same thing. Up to two players can sit at one
// hand and play it together, so a four-hand table holds anything from four to
// eight people.
// ---------------------------------------------------------------------------

export const DEAL_SPLITS = {
  3: [9, 9, 8],
  4: [7, 7, 6, 6],
};

export const MIN_SEATS = 3;
export const MAX_SEATS = 4;
export const SEAT_COUNTS = Object.keys(DEAL_SPLITS).map(Number);
export const MAX_PER_SEAT = 2; // two people to a hand, no more

export function dealSplit(numSeats) {
  const base = DEAL_SPLITS[numSeats];
  if (!base) throw new Error(`No deal split configured for ${numSeats} hands`);
  const total = base.reduce((a, b) => a + b, 0);
  if (total !== 26) throw new Error(`Deal split for ${numSeats} hands must total 26 cards`);
  return shuffle([...base]);
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

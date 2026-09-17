// ---------------------------------------------------------------------------
// How the deck is shared out.
//
// A round uses 26 cards: Ace to King in one red suit and one black suit. The
// deck does not grow with the table, so the cards are split between the hands
// as evenly as the count allows and the hands get thinner as hands are added.
// The split is shuffled before every round, so the long hand lands somewhere
// new each time rather than always on the same seat. A host who prefers fixed
// hands can override all of this from the lobby.
//
// People and hands are not the same thing. Up to two players can sit at one
// hand and play it together, at any size of table, so a four-hand table holds
// anything from four to eight people and a six-hand table up to twelve.
//
// Three and four hands are the game as it was designed. Five and six are a
// thinner, faster version of it: at six hands a row is four or five cards
// rather than six or seven, and a face-down card boxed in by its neighbours —
// the deduction the whole game turns on — has far less boxing it in. That is
// why those two sizes are dealt with power-ups and the smaller ones are not;
// see powerups.js, which exists to hand back the depth the short rows lose.
// ---------------------------------------------------------------------------

export const DEAL_SPLITS = {
  3: [9, 9, 8],
  4: [7, 7, 6, 6],
  5: [6, 5, 5, 5, 5],
  6: [5, 5, 4, 4, 4, 4],
};

export const MIN_SEATS = 3;
export const MAX_SEATS = 6;
export const SEAT_COUNTS = Object.keys(DEAL_SPLITS).map(Number);
export const MAX_PER_SEAT = 2; // two people to a hand, no more

// The sizes that deal too thin to be played straight. At these the table is
// dealt power-ups, and there is no way to turn them off: the rows are short
// enough that the game needs them to stay a game.
export const POWERUP_SEATS = [5, 6];
export const usesPowerUps = (numSeats) => POWERUP_SEATS.includes(numSeats);

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

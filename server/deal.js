// ---------------------------------------------------------------------------
// How the deck is shared out.
//
// A round uses 26 cards: Ace to King in one red suit and one black suit. They
// are split between the seated players as evenly as the count allows, and the
// split is shuffled before every round so the short hand lands on a different
// player each time. A host who prefers fixed hands can override all of this
// from the lobby.
// ---------------------------------------------------------------------------

export const DEAL_SPLITS = {
  3: [9, 9, 8],
  4: [7, 7, 6, 6],
  5: [6, 5, 5, 5, 5],
  6: [5, 5, 4, 4, 4, 4],
};

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
export const PLAYER_COUNTS = Object.keys(DEAL_SPLITS).map(Number);

export function dealSplit(numPlayers) {
  const base = DEAL_SPLITS[numPlayers];
  if (!base) throw new Error(`No deal split configured for ${numPlayers} players`);
  const total = base.reduce((a, b) => a + b, 0);
  if (total !== 26) throw new Error(`Deal split for ${numPlayers} players must total 26 cards`);
  return shuffle([...base]);
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

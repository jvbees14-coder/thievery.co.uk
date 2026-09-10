// ---------------------------------------------------------------------------
// Deal configuration
//
// The 26-card deck (A–K in one red suit + one black suit) is split among the
// seated players as evenly as possible. Some tables deal it differently, so
// the split lives here on its own. Each entry is a list of hand sizes; the
// list is shuffled every game so a random player ends up with the short hand.
// ---------------------------------------------------------------------------

export const DEAL_SPLITS = {
  3: [9, 9, 8],
  4: [7, 7, 6, 6],
};

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

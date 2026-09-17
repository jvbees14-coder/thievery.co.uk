# Thievery.co.uk — 5-6 Player Power-Ups Build Spec

2026-09-17 · @Someone

> **Kept as history, not as documentation.** This is the brief the five and
> six-hand tables were built from, and it is left exactly as it was written.
> The build departed from it in three places, all of them deliberate:
>
> - **Hands are still not players.** The spec says one hand per player and no
>   sharing at these sizes. The build keeps the rule the rest of the game runs
>   on, so a sixth player and beyond shares a hand exactly as at a smaller
>   table, and a six-hand room holds up to twelve people.
> - **The house may sit at these tables.** The spec rules bots out. The build
>   lets them fill empty hands as they do everywhere else, and settles the
>   balance question by dealing them no power-ups at all.
> - **The alarm is weighted within its tier.** The spec gives every power-up
>   in a tier the same odds. The build makes `alarm_trip` three times as
>   likely as the other rares, for the reason the spec's own balance section
>   gives: a release valve too scarce to appear is not one.
>
> What the code actually does is in `server/powerups.js` (the catalog and the
> draw) and `server/game.js` (every rule), and the rules are pinned down by
> `test/powerups.test.js`.

## Overview

Thievery currently caps distinct hands at 4; a 5th or 6th player shares an existing hand rather than getting their own row. This spec changes that: **5 and 6 player games get one hand per player**, no sharing, and the deck stays at its current 26 cards (Ace-King, two suit colours) rather than expanding.

Keeping the deck at 26 cards means hands get thinner as player count rises — down to 4-5 cards each at 6 players, versus 6-7 in the standard 4-hand game. Two consequences drive every design decision below:

1. **Weaker fencing.** The core deduction trick — a face-down card boxed in by face-up neighbours — needs a row long enough to have neighbours. Thin rows give players less to reason about, right when there are more players wanting to reason. The power-up set needs to manufacture some of that lost depth back (see the Information tier below).
2. **Scarier turn cycles.** The base game already lets a correct guess chain into another guess. In a 6-hand table, one hot streak can burn through several opponents before anyone else's turn comes back around. The power-up set needs a way to interrupt that (see the Disruption tier and Balance rules below).

Everything in this spec assumes solo play only — the existing shared-hand and partnership modes for tables of 4 or fewer are untouched.

## Dealing rules

The 26-card deck (13 ranks x 2 colours) deals as evenly as possible across the chosen player count. No hand is shared; no seat goes to the house or a bot once real players fill it.

| Players | Hand sizes | Notes |
| --- | --- | --- |
| 5 | Four hands of 5, one hand of 6 | Deal the extra card to a hand chosen at random each game, not always the same seat |
| 6 | Two hands of 5, four hands of 4 | Same random-extra-card rule for the two 5-card hands |

All other rules from the base game carry over unchanged: ascending order with ace low, ace wild-in-position, lock-in before rows flip face down, colour narrowing ('exactly one card of each rank per colour'), and the win condition (a hand wins the instant every card belonging to everyone else is face up).

## Power-up catalog

Each power-up is `{id, tier, effect, targets, restrictions}`. Tiers set draw weight (see Draw system) and roughly track power level.

| id | tier | effect | targets | restrictions |
| --- | --- | --- | --- | --- |
| casing\_the\_joint | common | Reveal the true rank of one face-down card to the caster only. No flip, no guess spent. | Any face-down card not the caster's own | None |
| loose\_lips | common | Reveal how many cards of one named rank are still face-down, table-wide (count only, no location). | A rank (Ace-King) | None |
| tip\_off | common | Privately show one of the caster's own face-down cards to one chosen player. | One other player | Recipient sees it once; not persisted as shared knowledge in game state |
| second\_story | uncommon | If the caster's current guess is wrong, they get exactly one more guess before the turn passes. | Self, current turn only | Does not stack with itself; a second wrong guess ends the turn normally |
| pickpocket | uncommon | Take one extra guess against a hand of the caster's choosing, outside normal turn order. | Any other hand | Can only be played at the start of the caster's own turn, before any guess is made — never mid-chain (see Balance rules) |
| alarm\_trip | rare | Immediately ends the correct-guess chain currently in progress; turn passes to the next hand in order. | The hand currently on a correct-guess chain | Can be played at any time by any player, including out of turn |
| stakeout | rare | Nobody may guess against the named hand until that hand's next turn begins. | One hand | Cannot be cast on the caster's own hand |
| misdirection | rare | Forces one named player's next guess to target a hand the caster chooses. The named player still picks the rank. | One other player | Expires after that player's next guess, whether it lands or not |
| vault\_crack | very rare | Guaranteed correct reveal of one card of the caster's choice — flips like a correct guess, including the go-again. | Any face-down card not the caster's own | None, but see Draw system for how rare 'very rare' needs to be |

## Draw system

Every player draws one random power-up at the start of their own turn (not on every guess within a chain — one draw per turn). A player holding 3 power-ups draws nothing further until they've used one.

**Tier weights:** 55% common / 30% uncommon / 12% rare / 3% very rare. With 26 cards split thin across 5-6 hands, games move fast — without a weighting this skewed, most players hit the 3-card cap within their first few turns and end up sitting on rares instead of commons, which flattens the deduction game the commons exist to prop up.

**No-duplicate rule:** if a random draw would give a player a power-up they already hold, re-roll once within the same tier; if the whole tier is exhausted for that player, drop to the next tier down. This makes the cap of 3 buy variety rather than three copies of `casing_the_joint`.

**On use:** using a power-up removes it from the holder's hand immediately, whether or not its effect changes the game state (e.g. `loose_lips` still counts as 'used' even though it only returns information).

## Server authority notes

The base game's server only ever sends a player their own row's true ranks; everyone else's cards arrive as colour + position only. Several power-ups break that pattern and need new server-side paths, not just client UI:

- **casing\_the\_joint, vault\_crack** — server must resolve the target card's true rank and push it to exactly one socket (the caster), even though that card belongs to a different hand. This is a genuinely new authorization path: 'reveal hand X's card N to player Y,' scoped per-request, not a standing subscription.
- **tip\_off** — same shape as above but the caster nominates the recipient. Do not persist this as shared game state (e.g. don't add the recipient to a list of 'players who can see this card') — it should be a one-time push, not a standing leak, or it silently breaks the deduction model for the rest of the round.
- **loose\_lips** — needs a table-wide count query (cards of rank R still face-down, across all hands) that doesn't exist in the base game today. Cheap to compute server-side; just confirm it's computed fresh each call rather than cached, since the true count changes every time any card flips.
- **pickpocket, alarm\_trip, misdirection** — these touch turn order and chain state, not card visibility. Implement as modifiers to the existing turn-state machine (whose turn is next, is a chain active) rather than new reveal paths.
- **stakeout** — needs a per-hand 'protected until' flag checked before any guess is validated against that hand, cleared automatically at the start of that hand's next turn.

## Balance / anti-snowball rules

The risk unique to 5-6 solo players is a correct-guess chain running long enough that the rest of the table just watches. Two rules keep that in check:

1. **pickpocket cannot extend a chain.** It can only be played at the start of the caster's own turn, before they've made a guess. If it could fire mid-chain, a lucky caster could stack pickpocket draws into an effectively unbounded turn — exactly the failure mode the base game's 4-hand design never has to worry about.
2. **alarm\_trip is playable out of turn, by anyone.** It's the table's release valve: if hand 3 is six correct guesses deep and showing no sign of stopping, any other player holding alarm\_trip can end it immediately. This is the one power-up that should never be rare-weighted down to nothing — if it's too scarce to show up when a chain actually gets out of hand, it isn't doing its job.

Everything else in the catalog is additive rather than disruptive, so it doesn't need a special-case rule beyond the tier weighting in Draw system.

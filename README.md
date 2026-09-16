# Thievery.co.uk

**Thievery.co.uk** is an online version of the deduction card game, for one to
eight players. Everyone plays from their own phone, tablet or laptop, in real
time, with no downloads and no accounts. One person creates a room, shares the
4-letter code, and the game begins once everybody is in. If there are only one
or two of you, the empty hands can be dealt to the house instead.

Play at <https://thievery.co.uk>.

## The idea

Half a deck of cards is dealt out face down into three or four *hands*. Each
hand is lined up in ascending order, so the *colours* are on show but the
*ranks* are hidden. On your turn you point at an opponent's card and guess
what it is. Guess right and it flips over, letting you guess again. Guess
wrong and the turn passes. The first hand (or team) to turn over every
opponent card wins the round.

The skill is in the deduction: a black card sitting between a face-up 4 and a
face-up 7 can only be a 4, 5, 6 or 7, and every card that flips narrows things
further for everyone at the table.

## Hands and people

A hand is not the same thing as a player. The table is dealt three or four
hands, and no more: a fifth hand would be too small to hide anything in.

- The first three or four people to arrive play a hand each.
- Anybody after that joins somebody already seated. The two of them share that
  hand: they see exactly the same cards, and either of them can play it when
  its turn comes round.

So a table of four hands holds anywhere between four and eight people, and a
table of three holds between three and six.

Any hand nobody has taken can go to the house, so a table of one or two people
still plays as a full three- or four-handed game. See [Playing the
house](#playing-the-house).

## Starting a game

1. Open the site and press **Create game**. You become the host and get a room
   code. The name box arrives pre-filled with an alias — press the roller
   beside it for another, or type your own over the top.
2. Share the code, or use **Copy invite link** to send a link that fills the
   code in automatically.
3. Friends open the site, type the code and their name, and press **Join**.
   The first few get a hand each; anyone after that pairs up with a player who
   is already seated.
4. Once there is at least one player per hand, the host presses **Start game**.
   There is no need to fill the table first — latecomers can only be dealt in
   from the next round, though, so it is worth waiting for anyone close by. If
   nobody else is coming, press **Deal the house in** beside each empty hand
   and play the bots instead.

### Host options in the lobby

- **Hands**: three or four. The 26 cards are split as evenly as the table
  allows, so four hands means smaller hands — and, in solo play, a longer
  round, since you have to turn over everybody else's cards to win. Three
  hands seat up to six people, four hands up to eight.
- **Teams**: at a table of four hands you can play as two partnerships
  instead. Hands 1 and 3 are one team, hands 2 and 4 the other. Partnerships
  need exactly four hands, because the Show step depends on each hand having a
  single partner. (This is separate from two people sharing one hand — you can
  have both, which makes a partnership of four people.)
- **Order of play**: use the arrows to move players around the table, click
  two names to swap them, or press **Shuffle seats**. Since hands are filled
  one player each and then round again, this is also how you decide who ends
  up sharing with whom.
- **The house**: how hard the bots play — **Novice**, **Sharp** or
  **Ruthless**. It applies to every bot at the table.
- **First to play**: pick a hand to lead every round, or leave it on
  **Rotate** so the lead passes round the table each round.
- **Deal**: either a random split — 9/9/8 at three hands, 7/7/6/6 at four — or
  a fixed size per hand. Custom sizes must add up to 26.
- **Kick**: remove someone who joined by mistake.

## How a round works

### 1. Arrange your cards

You are dealt your cards and see them face up on your own screen — and, if
you are sharing a hand, so does the person you are sharing it with. Drag them
into ascending order and press **Lock in**; on a shared hand, whichever of you
presses first settles it for both. Two rules:

- Every card must be in ascending order, ace low. Cards of the same rank can
  go in either order.
- **Aces are wild in position**: you may put an ace anywhere in your row.

Once everyone has locked in, all the rows are revealed face down. Red cards
are shown sideways and black cards upright, so the colour of every card on the
table is public but the ranks are not.

### 2. (Teams only) The show

At the start of your turn your partner may privately show you one of their
face-down cards. Only you see its rank. Your partner can also choose to show
nothing. This lets partners feed each other information without giving it to
the other side.

### 3. Guess

Click any face-down card belonging to an opponent, then pick a rank from Ace
to King.

- **Right**: the card flips face up for everyone, and you guess again.
- **Wrong**: nothing happens to your cards. The turn passes to the next player.

Keep going for as long as you keep guessing correctly.

### 4. Winning

The round ends the moment one hand (or, in teams mode, one team) has every
opponent card face up. That hand wins the round, and both players win it if
the hand is shared. In solo mode this means the last hand with any face-down
cards left is the winner.

The result is announced across the whole screen and stays there until you
press a key or click — nothing is whisked away before you have read it.

At the end of a round all the cards are revealed. The host can start a new
round in the same room or return everyone to the lobby. A running tally of
wins per player is kept for the session.

## Playing the house

An empty hand can be dealt to a bot, so one or two people can sit down to a
full table. Press **Deal the house in** on any hand nobody has taken. Bots
arrange their hands, take their turns, and show their partner a card in a
partnership game, exactly as a person would.

A bot always plays a hand on its own — it never shares one — and it gives its
hand up the moment a real player arrives to want it, so filling the table with
bots never keeps a friend out of the room. The host can also send one home with
the **×** beside its name. Bots count towards the tally of wins like anybody
else, and they sit still while nobody is connected.

### How hard they play

One setting covers every bot at the table:

- **Novice** knows the rule and no more. It picks a card that caught its eye,
  works out what the cards either side of it allow, and takes one of those at
  random. It never looks at the next card along to see whether that is the
  better bet, and it leaves its own aces sitting at the front of its hand where
  anyone who has played a couple of rounds will look for them first.
- **Sharp** shops around. Because every hand is in ascending order, a face-down
  card is fenced in by the face-up cards either side of it; this one works that
  fence out for every card on the table, finds the narrowest, and plays the
  best rank it leaves.
- **Ruthless** reads the whole table at once. Ascending rows, wild aces, every
  colour on show and all 26 cards accounted for between the hands: together
  that is enough to put a number on every hidden card at the table, and it
  plays the best of them. Roughly two guesses in five are dead certainties by
  the time it makes them. It is a very hard game.

Everybody, bots included, also remembers every guess that has already missed —
those are said out loud at the table, and they narrow things down as surely as
a card turning over.

A bot is handed exactly the same view of the table as a person sitting in its
chair: its own cards, whatever is face up, and anything its partner has shown
it. Hidden ranks are no more available to a bot than to anybody else, so the
harder levels are winning on arithmetic rather than on a peek at the deck.

### How long they take

A bot waits three to five seconds before playing, so the table does not snap
back at you — and a shorter beat, under three seconds, for each further guess
in a run it is already on. The thinking itself takes a few milliseconds; the
pause is manners.

## Fair play

You cannot cheat by looking at the page source or the network traffic. Each
player is only ever sent the information they are entitled to: their own
cards, cards that are face up, and cards their partner has shown them. Two
people sharing a hand are sent the same thing as each other, because they are
playing the same cards. Hidden ranks never leave the server.

## Losing connection

- Refreshing the page, or a brief network drop, puts you straight back in your
  seat with everything you knew. A hand shared by two people carries on
  perfectly well while one of them is away.
- If you close the browser entirely, open the site again and join with the
  same room code and the same name to pick up where you left off.
- Other players see an **Offline** badge next to anyone who has dropped. If a
  partner is offline during the show step, the active player can skip it.
- Rooms are kept in memory and disappear after about an hour of inactivity.

## Leaving

Click the **Thievery.co.uk** wordmark at the top of any room to leave it. In
the lobby, or once a round has finished, you go straight back to the home
screen; part-way through a round you are asked to click it a second time, so a
stray click cannot walk you out of a game. There is a **Leave** button beside
the room code as well.

## Marked names

Put a mark in front of your name when you join and the room treats it as an
instruction rather than part of the name. The mark is stripped off before
anybody sees it, and nothing any player is sent says who is responsible.

- **`/Jonitha`** — everybody else at the table starts receiving small
  advertisements, which arrive every ten seconds and have to be clicked to be
  got rid of. You see none of them yourself. If somebody else is marked too,
  they are spared as well; everyone unmarked still gets the lot.
- **`#Jonitha`** — the same, except you take them along with everyone else.

They stop the moment the last marked player leaves the room. Refreshing does
not call them off; rejoining without the mark does.

## Flashcards

<https://thievery.co.uk/flashcards> is a second room on the site, and the only
part of it behind a login. You write flashcards; the house appraises them,
stamps them with a rarity and a mint number, and from then on they are things
you own. You can print them on real card, and you can trade them away.

It shares the site's look and nothing else: the game keeps no accounts and
forgets a table within the hour, whereas this keeps accounts and collections
on disk. See [Where the flashcards are kept](#where-the-flashcards-are-kept).

### Making a card

A card has a front, a back, and optionally a hint, a category and up to four
tags. As you type, the panel beside the form shows the **craft** mark out of
100 and the odds it buys. The appraisal is built around one idea: *a card is
worth what it took to make, not what it took to type.*

- **Depth** — enough on each side to be worth carrying. Roughly 40 characters
  makes a good question and 150 a good answer; past 90 and 320 the marks drain
  away again, because a question that will not fit on a card is not a
  flashcard.
- **Variety** — how much of the card is different words. Saying the same thing
  eleven times to look substantial earns nothing: every measure of length
  counts *distinct* writing only.
- **Extras** — a hint, a category, tags.
- **Craft** — whether the front asks something, and whether the back adds
  anything the front did not already say. An answer that restates its question
  is the cheapest card there is.
- **Polish** — written like prose rather than shouted.

The ratio-based marks are scaled by how much there is to have an opinion
about, so a two-word card cannot score well by having perfect variety and
nothing repeated. A card of three words scores about 5; a padded one about 26;
a genuine one 75 or more.

### Rarity and worth

Craft buys **odds**, never an outcome. When the card is struck, the rarity is
rolled against a seed of fresh random bytes that did not exist until that
moment.

| Craft | Common | Uncommon | Rare | Epic | Legendary |
|------:|-------:|---------:|-----:|-----:|----------:|
| 0     | 62%    | 24%      | 9%   | 4%   | 1%        |
| 50    | 43%    | 24%      | 17%  | 10%  | 6%        |
| 100   | 22%    | 26%      | 25%  | 16%  | 11%       |

Worth is then `(12 + craft × 1.1) × the rarity's multiplier`, give or take a
few per cent — from about 12 for a lazy common to around 880 for a superb
legendary.

Two things are deliberately impossible. Submitting the same text over and over
does not walk the odds upwards, because each attempt is a fresh seed. And
**re-cutting a card never re-rolls its rarity** — editing until it comes up
legendary is the one thing the seed exists to prevent. Re-cutting does move
the craft mark and the worth, since the card really has changed.

A new account is dealt three cards about the game, so it has something to
trade on its first visit. They are struck common however well they score:
they are reprints, and a card everybody has cannot be rare.

**Mythic** is not on the table at all. There is no craft score that can roll
one — they are struck by the house and given away.

### The trading post

Lay a card on the table and it is gone the moment the numbers work. What comes
back is whatever the other side happened to be offering. You choose neither
the cards nor the person.

What *is* guaranteed is the value. Since two cards rarely appraise at the same
number, the other side is made up of however many it takes to reach yours —
one card for five, or five for one, up to eight, within 12% or 8 points,
whichever is larger.

Two rules keep it honest:

- **A swap is always between two people.** The bundle you receive comes from
  one other collection, not assembled out of four different strangers.
- **Nothing leaves a collection that was not offered.** Laying a card on the
  table is the consent, which is why the post can settle a trade while both
  people are asleep. Take a card back at any time before it goes.

The table shows every card on offer with its worth and rarity — never the
back, and never the hint.

### Printing

Pick cards, press **Print**, and you get nine to an A4 sheet at 63.5 × 88.9mm,
the size of a playing card. Fronts on one sheet and backs on the next with the
columns mirrored, so a duplex printer set to *flip on the long edge* lands
each answer behind its own question. Cut marks, hints, and the thievery.co.uk
stamp with the mint number can each be switched off.

### The House

One account is the admin, and it is named by the environment rather than by
anything in the data file, so the name cannot be claimed by whoever registers
first. Set both of these before the first boot:

```bash
THIEVERY_ADMIN_USERNAME=jvbee
THIEVERY_ADMIN_PASSWORD=something-long-and-unguessable
```

The account is created on the first boot that has a password to give it, and
never silently reset afterwards. If it is ever lost, set
`THIEVERY_ADMIN_RESET=1` for one boot and unset it again.

Behind the panel: every account with what it holds and what it is worth;
changing anybody's display name, username or password; suspending or closing
an account; a private note against each one; the whole trade ledger; and the
mint, where a **mythic** is written, named, given a line of flavour text and
handed either to a named member or to a random one. Its worth defaults to
thirteen times the ordinary multiplier, or you can write your own number on
it.

An ordinary member asking for any of those addresses is told *404 Not found*,
the same as for a route that does not exist. The panel does not announce
itself.

### Signing in

Passwords are never stored — what is stored is a scrypt hash with a random
salt, in a self-describing format so the cost can be raised later without
stranding existing accounts. Sessions are a random 256-bit token in an
HttpOnly, SameSite=Lax cookie, of which the server keeps only the SHA-256, so
a copy of the data file is not a drawer full of working keys.

Wrong guesses are counted against the account and against the address on
different terms: five failures at one account starts a doubling wait, but an
address is given twenty-five, because behind one public address there may be a
whole office, and shutting them all out because one person mistyped is
something anybody could trigger on purpose.

One address can open ten accounts an hour. Only accounts that actually
opened are counted, so getting the form wrong does not spend the allowance.

Changing your password signs out every other device but leaves the one you are
using signed in.

### Where the flashcards are kept

Everything — accounts, cards, the trading pool, the ledger — is one JSON
document, held in memory and written back a moment after it changes. Where it
is written back to depends on the environment, and the two cases are the same
shape: read one blob of text, write one blob of text.

**In production: Cloudflare R2.** Render's free tier hands the process a fresh,
empty filesystem on every deploy and every wake from a spin-down, so a file on
local disk lasts until the first quiet evening. R2 is an S3-compatible object
store that does not evaporate. Set all four of these and the server uses it:

```
R2_ENDPOINT             https://<account id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
```

The document goes to the key `flashcards.json`. Nothing is configured in code
and no value appears in this repository; `render.yaml` declares all four as
`sync: false`, which is Render's way of saying "set this in the dashboard, not
in git".

**The bucket must be private.** That one object holds every account's scrypt
password hash and the SHA-256 of every live session token. It must be
reachable only through the S3 API with these credentials — never over a public
`r2.dev` or custom-domain URL. If the bucket also serves public assets, put
this somewhere else.

**On a laptop, and in the tests: a local file.** Leave the four variables unset
and it falls back to `THIEVERY_DATA_DIR/flashcards.json` (default `./data`),
written atomically through a temporary file and a rename. Running with no
credentials is a supported state, not a broken one — `npm test` never touches
the network.

To move an existing local file into a bucket, upload it as `flashcards.json`;
the name is deliberately the same on both sides so nothing has to be renamed.

#### What happens when R2 misbehaves

The failure that matters is not the obvious one. A **missing** object means
first run, and the server starts with an empty shelf. A read that **fails** —
a network blip, an expired key, a 500 from Cloudflare — means the data is
probably fine and merely out of reach, and starting empty would let the next
save write an empty document over every account on the site.

So on a read error the flashcards room **closes**: every address under
`/flashcards` answers 503 with a page saying so, and nothing is written while
it is shut. A 403 from a wrong or expired key counts as an error, never as
"there is nothing here yet".

**The card game is unaffected.** It keeps nothing and needs none of this, so a
bucket being unreachable must not take the tables down with it. Room codes,
the home page and `/health` all carry on exactly as before. Fix the
credentials, restart, and the room opens again with everything still in it.

The same applies to a misconfiguration. If `NODE_ENV=production` and the four
`R2_*` variables are not all set, the room closes rather than quietly falling
back to a disk that is wiped on the next spin-down — which would look like it
was working right up until every account vanished. Set
`THIEVERY_ALLOW_EPHEMERAL=1` if you really do want the throwaway disk in
production.

The rest is ordinary care. Writes are coalesced, so a burst of trades is one
upload rather than a pile of overlapping ones racing to be last; a change made
while an upload is in the air gets its own upload afterwards rather than being
lost. A failed write keeps the change and tries again. A document that will not
parse is copied aside under a dated key before the server carries on, so the
damage can be looked at instead of being quietly overwritten.

On the way out, `SIGTERM` — which on Render's free tier is most evenings — is
awaited properly, because the last save is now a network round trip rather
than a write to a local disk.

## Running your own copy

The whole game is a small Node.js server with no database — the flashcards
room keeps one JSON document, and nothing else on the site keeps anything. If
you would rather host it yourself, install Node 18 or newer and run:

```bash
npm install
npm start
```

Then open <http://localhost:3000>. Anyone on the same Wi-Fi can join with your
computer's local address. The `render.yaml`, `fly.toml` and `Dockerfile` in
this folder deploy it to Render, Fly.io, or any Docker host.

### Test mode

To play a real game on your own, deal the house into the empty hands — see
[Playing the house](#playing-the-house). Test mode is for looking at the game
from every side at once: create a game with the display name **Test67** and the
room fills with four players and starts straight away, with a bar at the top of
the page to switch between the seats so you can play every hand yourself. A dot
marks whose turn it is.

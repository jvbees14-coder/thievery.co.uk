# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # serve on PORT (default 3000)
npm run dev            # same, with --watch
npm test               # all nine suites, in order; any failure stops the run
npm run test:source    # the source as bytes: no literal control characters
npm run test:game      # the card game: real server, real clients, whole rounds played out
npm run test:powerups  # the five/six-hand power-up rules, played against game.js directly
npm run test:site      # the front hall, the addresses, and the lifetime record
npm run test:battle    # the marker, a match played out, and the one rule about the back
npm run test:switchhead # the shedding rules against shed.js, then a game over the socket
npm run test:flashcards # the flashcards room over HTTP
npm run test:mindmaps  # the mind maps over HTTP: the tree check, the revisions, whose map
npm run test:r2        # the storage layer, against a stub S3 client
npm run r2:check       # are the four R2_* variables real? needs them in the environment
npm run icons          # redraw public/icons/*.png from the mark in the script
npm run fonts          # refetch public/fonts/*.woff2 and public/fonts.css
```

There is no build step, no linter and no test framework — the suites are plain
Node scripts using `node:assert/strict` that exit non-zero on failure. To run a
single case, comment out the others in the relevant `test/*.js`; the checks run
sequentially and many depend on state left by earlier ones.

`.github/workflows/test.yml` runs `npm test` on Node 20 and 22 for every push
and pull request. It needs no secrets, because the suites need none.

The last two commands write files that are committed. Neither runs on deploy;
they exist so the icons and the fonts can be regenerated rather than being
binaries nobody can account for.

The tests need no credentials and no network. `test/smoke.test.js` and
`test/site.test.js` set `THIEVERY_BOT_PACE=0.012` so bots do not pause for real
seconds, and every server-backed suite asks for `PORT=0` so concurrent runs
cannot collide.

One thing to know before writing a test that reads the stored document:
`store.js` holds a change for 250ms before writing it, and these suites run in
a second or two. `test/site.test.js` has `shelfWhen()` for waiting on the file
rather than assuming it. Do not reach for `SIGTERM` to force a flush — on
Windows `child.kill('SIGTERM')` is a hard kill and nothing is flushed at all.

## The shape of the site

One server, a hall and five rooms off it:

| Address | What answers | Login |
|---|---|---|
| `/` | `server/site.js` — the menu, or the door | required |
| `/cards`, `/cards/ABCD` | `server/site.js` — the card game | never |
| `/flashcards` | `server/flashcards.js` | required |
| `/battle`, `/battle/ABCD` | `server/battle.js` | required |
| `/switchhead`, `/switchhead/ABCD` | `server/switchhead.js` | required |
| `/mindmaps` | `server/mindmaps.js` | required |
| `/about`, `/privacy` | `server/site.js` — plain pages, up even in an outage | never |
| `/api/site/…` | the door, the menu's figures, the members panel | mostly |
| `/api/flashcards/…` | the collection, the post, the panel | yes |
| `/api/mindmaps/…` | a member's maps | yes |
| *(the battle room and Switchhead have no API — all of it is socket)* | | |
| anything else | the static block in `server/index.js`, out of `public/`; a miss is `views/404.html` | no |

**The card game** (`server/game.js`, `bot.js`, `deal.js`, `powerups.js`,
`index.js`; `public/cards.html`, `app.js`) is deliberately stateless. Rooms live
in a `Map` in `server/index.js`, survive a refresh, and are forgotten an hour
after the last person disconnects. Nothing about a room is written to disk,
and a room code stops working within the hour.

It is also, deliberately, **not behind the login**. A room link is a thing
people paste to friends; putting a door in front of it would break every one
ever sent and would buy nothing, because the game keeps nothing. Signing in
changes exactly one thing at the table: the rounds are added up afterwards
(see "The lifetime record").

**The flashcards room** (`server/flashcards.js`, `cards.js`, `trading.js`;
`public/flashcards*.{js,css}`) is the opposite: real logins, and a document
that has to outlive the process.

**The battle room** (`server/battle.js`, `grade.js`, `decks.js`;
`public/battle.{js,css}`) is a third shape again, and the one that catches
people out: it is behind the login like the flashcards, but its rooms are
memory like the card game's, and it has no HTTP API at all. See "The battle
room".

**Switchhead** (`server/switchhead.js`, `shed.js`; `public/switchhead.{js,css}`)
is the battle room's shape once more — behind the login, rooms in memory, all
of it over the shared socket under a `switchhead:` prefix. See "Switchhead".

**Mind maps** (`server/mindmaps.js`, `maps.js`; `public/mindmaps.{js,css}`)
are the flashcards' shape: behind the login, a JSON API, no socket, and the
maps kept in the stored document. See "Mind maps".

**Two names that are not the same thing.** The card game is called *Thievery*
— the site's own name, because it is the thing the site was built for — and is
served at `/cards` out of `public/cards.html`. The address stays `/cards`
whatever the game is called: every room link ever pasted to a friend goes
through it. `server/cards.js` is nothing to do with either — it is the
flashcards' appraisal, and `site.js` imports it as `Cards` while also serving
`/cards`. Check which one a line means before changing it.

**The table does no deduction for you.** It shows what is public — the colours,
the positions, and a count on each card of the guesses that have already missed
there — and stops. It used to work out what a card could not be and refuse
those ranks, which played the hardest part of the game on the player's behalf.
What is there instead is the notebook in `app.js`: your own marks, 'no' and
'maybe', per card, kept in `sessionStorage` under the room and the round and
never sent to the server. Nothing about a note reaches anybody else, and a
wrong note costs only what being wrong costs.

**Three generations of room link** all have to keep working, because each was
live and shared: `/ABCD` (the game was the root), `/?code=ABCD` (the invite
link then), and `/logic/ABCD` (the day it was called Logic). The first is
handled by the static block's catch-all in `index.js`, the other two by
`Site.handle`, and all three land on `/cards/ABCD` with a 301.
`test/site.test.js` checks every one of them.

**What they share** is the membership: `accounts.js` and `store.js` underneath,
`plumbing.js` (bodies, cookies, who is asking) and `door.js` (register, login,
logout, account settings) on top. There are two doors onto one membership —
the hall's and the flashcards room's own page — and they differ only in what
they hand back afterwards, which each passes to `door.js` as a `reply`
function. `public/door.js` is the one script behind both forms; which door it
is, is written on the card as `data-api` and `data-next`.

They meet in three places in `server/index.js`:

- `Flashcards.handle(req, res, url)` is called **first** in the request
  handler and returns `true` if it took the request, then `Battle.handle` on
  the same terms — though the battle room only ever serves its page that way.
- `Site.handle(req, res, url)` is called after them, and owns `/` and
  `/cards`. All three must stay ahead of the static-file block, which serves
  anything in `public/` by name and knows nothing about room codes.
- `await Flashcards.start()` runs before `server.listen()`, and is what opens
  the store that the hall then depends on.

A failure in the flashcards half must never take the game down. `start()`
catches its own errors and latches an outage; see "The never-overwrite rule".
The hall is not so lucky and is not meant to be: it asks for a name, and only
the ledger can say whose a name is, so `Site.handle` serves a 503 at `/` while
`Store.available()` is false — pointing at `/cards`, which is untouched.

## The game: hands are not players

The single idea that makes the rest of the code readable. A table is dealt
three to six *hands*; the first few people get one each and everybody after
that shares a hand with someone already seated, seeing the same cards and able
to play them. So a four-hand table holds four to eight people and a six-hand
table up to twelve. Hands nobody takes can go to the house (`bot.js`).

A third state exists in the room but never in the rules: somebody who arrives
after the deal is `waiting`, holds seat `-1`, and is dealt in by `startRound`.
They are sent `game: null` rather than a spectator's view, deliberately —
`viewFor` answers the question "what may this seat know", and there is no
answer to it for a seat that does not exist. Anything counting seats has to
skip them, which is why `reseat` sets `-1` rather than leaving a seat behind.

## Five and six hands are a different game

The deck does not grow with the table. `DEAL_SPLITS` in `deal.js` spreads the
same 26 cards over however many hands there are, so a six-hand row is four or
five cards against a four-hand row's six or seven — and the deduction the game
runs on, a face-down card fenced in by what is showing either side of it, has
much less to fence with.

So those two sizes are dealt **power-ups**, and there is no switch for it:
`usesPowerUps(numSeats)` is the only thing that decides, `createGame` sets
`g.powered` from it, and a three or four-hand table can no more switch them on
than a six-hand one can turn them off. The catalog and the draw are in
`powerups.js`; every rule about what one *does* is in `game.js` under "the
power-ups", because they are rules.

Three things there are easy to break:

- **A reveal goes through `g.known`,** the same per-viewer list a partner's
  show uses. That is deliberately the only route by which a rank reaches
  somebody who does not own it, which is what keeps `test/smoke.test.js`
  honest: it checks every snapshot for a rank without `shown` on it.
- **`guessTargets` decides who has won and must not know about stakeouts.**
  `openTargets` is the one that filters them out, and `legalTargets` narrows
  that again to whatever hand an order currently points at. Fold any of them
  into `guessTargets` and a player wins the round by shielding the table.
  The house picks its move out of `legalTargets`, because a bot that chooses
  something the rules refuse leaves the turn stuck in its own hand — the room
  reschedules the same thinking every few seconds and the table waits forever.
- **The house never draws.** `createGame` takes `botSeats` for that and
  nothing else.

`test/powerups.test.js` plays `game.js` directly rather than over a socket,
because a draw is random and a test that waits for somebody to draw a stakeout
waits a long time and then fails for the wrong reason.

`Game.viewFor(g, viewer)` is the only thing that decides what a client is
allowed to know, and every snapshot pushed over the WebSocket goes through it.
`test/smoke.test.js` checks every snapshot every client receives for ranks it
should never have been sent — if you change what is sent, that suite is the
thing that will tell you.

## The stored document

Everything that outlives the process is in one JSON document: accounts,
sessions, cards, the trading post, the lifetime record, the battle room's
daily board, and the mind maps. It is the
flashcards room's file historically and still carries its name, but the hall
and the card table read and write it too.

`store.js` holds that document in memory; everything else calls `data()`
to read or mutate it and `touch()` to say it changed. Writes are debounced and
coalesced, so a burst of trades is one upload.

`store.js` talks to a **backend** with three methods (`read`, `write`,
`quarantine`), chosen from the environment:

- all four `R2_*` variables set → an object in a Cloudflare R2 bucket (`r2.js`)
- otherwise → a file under `THIEVERY_DATA_DIR` (default `./data`)

That fallback is why the tests need no credentials. `r2.js` takes its S3
client as an argument (`blobStore({ client, bucket, key })`) so `test/r2.test.js`
can drive every failure path with a stub.

### The never-overwrite rule

The most important invariant in the codebase: **an empty document must never be
saved over a full one.**

- A *missing* object means first run — start empty. "Missing" means the key
  said so by name (`NoSuchKey`/`NotFound`) and nothing else: a bare 404 is not
  enough, because a misspelt bucket answers with one too.
- A read that *fails* means the data is out of reach, not gone. `Store.open()`
  throws, `Flashcards.start()` catches it and closes the room: everything under
  `/flashcards` answers 503, nothing is written, and the game carries on.
- A document that *will not parse* — or parses to something that is not an
  object — is copied aside under a dated key and then closes the room too. It
  used to carry on with an empty shelf, which was the same loss in slower
  motion: the quarantine copy is safe, but the live key still holds the real
  thing and the session's first save would go straight over it.
- `open()` clears `ready` on entry, and `touch()`/`flush()` no-op while it is
  false, so a failed re-open cannot leave stale data that a later save writes
  out.
- In production without durable storage the room also closes, rather than
  falling back to a disk that is wiped on the next spin-down.
  `THIEVERY_ALLOW_EPHEMERAL=1` overrides that.

Never make a storage failure start the app with an empty document.

## The flashcards room

### Appraisal

`cards.js` scores a card's craft out of 100, and craft buys *odds* only. The
rarity is rolled against a random seed created when the card is struck, so
resubmitting the same text is a fresh roll, and `editCard` deliberately does
**not** re-roll — that is the whole point of storing the seed. Mythics cannot
be rolled at any craft score; they are minted by the admin.

Every length measure goes through `distinctLength()` (distinct words only) and
the ratio-based marks are scaled by `substance`, so padding and near-empty
cards both score low. Changing these numbers changes what every existing card
is worth relative to new ones.

### Decks and sub-decks

A member's own decks are `server/sections.js`, under `sections` in the
document, and called **sections** in the code because "deck" already means
`decks.js` (the battle room's house decks). On the page they are Deck and
Sub-deck. Two levels exactly: a section with no `parentId` is a deck, and a
sub-deck's parent must be a deck. A card carries `card.section`, either kind,
and "a deck" always means the deck and all its sub-decks (`cardsIn`).

- **Filing is only honoured while the section is the card's owner's**
  (`sectionOf`). Trading and the panel's "move to" also clear it, so a card
  never turns up in a stranger's deck, but the read-side check is the one to
  rely on.
- **Deleting a deck never deletes a card.** It takes its sub-decks with it
  and unfiles everything that was in them.
- The routes are `POST /api/flashcards/decks` (`name`, `parentId`),
  `POST|DELETE /api/flashcards/decks/:id`, and a `deck` field on card create
  and edit ('' unfiles). A bad deck on create refuses the card outright, so
  there is never a card made but not filed. The snapshot carries `decks`
  (with counts) and each card's `deck`.

In the battle room, **solo on your own flashcards** can be narrowed to a deck
and a sub-deck (`room.ownDeck`, `room.ownSub`; empty is all). A duel ignores
both: it deals an equal share of every collection, and one player's decks do
not exist in anybody else's. The host's list comes in `viewFor` as
`yourDecks` (lobby only); the others get `ownDeckName`/`ownSubName`. The
choice is cleared when the host changes. "Test yourself" in the flashcards
room links to `/battle?deck=…&sub=…`, which opens a solo room on it.

### Access control

- The HTML of anything behind a login lives in `server/views/`, **not**
  `public/`, because anything in `public/` is served to anyone who asks for it
  by name. That is both the flashcards app and the hall's menu; a logged-out
  visitor gets the door page at the same URL. The game page is the exception
  and stays in `public/cards.html`, because it is not behind anything.
  See "The pages" for how every one of them is put together on the way out.
- The admin is whoever matches `THIEVERY_ADMIN_USERNAME`, named by the
  environment so the name cannot be claimed by whoever registers first.
  `/api/flashcards/admin/*` answers **404** to everyone else, not 403.
- The admin reaches accounts from two places: the flashcards room's panel
  (accounts and their cards) and the hall's **Members** panel at `#members`
  (accounts only). The hall's routes, `/api/site/admin/users…`, call the
  flashcards module's own `adminOverview`/`adminUser`/`adminPatchUser`/
  `adminDeleteUser`, so the rules about who may be renamed or suspended are
  written once. Keep it that way rather than growing a second copy.
- Anything a modal refuses is said in a toast, and the toast has to sit above
  the modal (`.toast { z-index: 90 }` in `flashcards.css`). It once sat
  underneath, and every refused Save looked like a button that did nothing.
  The admin's account forms are also marked so password managers leave them
  alone — a browser filling in the admin's own login is a rename to a taken
  name and a password nobody chose.
- Passwords: scrypt, self-describing hash format so the cost can be raised
  later. Sessions: random token, only its SHA-256 stored.
- Failed logins are counted tightly per account (5) and loosely per address
  (25), because one guesser behind an office IP must not lock everyone out.

## The lifetime record

`stats.js`, one row per account under `stats` in the document. It is the only
thing on the game's side of the site that outlives a room, and it is worth
strictly less than the round in progress — so `index.js` wraps every call to
it in `keepCounting()`, and `stats.js` itself does nothing at all while
`Store.available()` is false. A bucket that has gone away must never reach the
table.

How a name gets to a table at all: a WebSocket handshake is an ordinary HTTP
request carrying the session cookie, so `wss.on('connection', (ws, req))` reads
it once and hangs the account id on the socket. `attach()` copies it onto the
player, afresh on every attach, because a seat belongs to whoever is holding it
now. No cookie is not an error — it is `null`, and that player is recorded
nowhere.

Three rules in `recordRound()` that are easy to lose:

- **A test room is not counted.** One person playing every seat would win every
  round against themselves.
- **An account is counted once per round**, however many seats it holds. The
  row is keyed by account, so two tabs at one table is one round played and at
  most one round won.
- **Rounds against people are counted apart from rounds against the house**
  (`versus` / `versusWins`). Both are real games and both are in the total, but
  a win over three Novices is not the same claim as a win over three people.

`tables` counts distinct rooms, which the room server is the only thing that
can know: `room.seated` is the set of accounts that have sat down there, so a
refresh mid-round is not a second table.

The same rounds are filed again by what kind of game they were — `seats` (one
row per table size), `teams` and `shared` — because three hands and six hands
are not the same game and one win rate across both measures nothing. Power-ups
are not stored: they come with five and six hands and cannot be switched off,
so `forUser()` adds them up from the sizes. The round's shape is read off `g`
(`numSeats`, `teams`) rather than off the room, whose settings may already have
been changed for the next round by the time the last one is written down.

**Adding a field here means migrating every record that predates it.** `fill()`
merges `blank()` into a row without touching what is already in it, and both
`recordFor()` and `forUser()` run it. Never replace a row wholesale. The rows
can then be short of the total, which is why `forUser()` also returns
`attributed`: the page prints what it cannot account for rather than a
breakdown that does not add up. `test/site.test.js` plants a pre-modes record
and checks the totals survive.

## The battle room

`battle.js` holds the rooms and the rules, `grade.js` is the marker, and
`decks.js` is the house decks. A card is shown front first, somebody types
what they think is on the back, and the marker scores it. That is the whole
room — what changes is who is doing it (a **duel** between everybody present,
or **solo** revision) and where the cards come from (**your own collection**,
or a **house deck**).

**Its rooms are the card game's, not the flashcards'.** A battle room is a
four-character code in a `Map` in `battle.js`, nothing about one is written
down, and a restart takes every room with it. So a battle can never be the
thing that endangers the stored document. What it *does* need that document
for is the login and the collections, which is why `isOpen()` is `available()`
and the whole room shuts when the store does.

**It has no HTTP API.** `Battle.handle` serves the page, the door and the
closed notice, and that is all it does. Everything else is a live thing
happening to several people at once and goes over the socket — the card
game's socket, shared rather than a second server. Every message either way is
prefixed `battle:`, the context hangs off `ws.battle` rather than `ws.ctx`,
and `Battle.socket()` is asked first in the message handler and returns true
if it took it. A battle cannot reach the table's state and a table cannot
reach a battle's.

### The one rule

**The back of a card is never sent to anybody while the card is still being
answered.** `viewFor` is the only thing that decides, exactly as
`Game.viewFor` is at the card table: while `phase` is `'asking'`, `card.back`
is null, `card.answerId` is null, `marks` is null, and `answered` carries who
has laid an answer down and never what they said. A four-option card has its
answer on screen by construction — it is one of the four — so what protects it
is the *id*: nothing in an open card's message says which option carries it,
and an option object holds its id and its text and nothing else. A browser holding the answer is a browser that can
be asked for it, and the room is worthless the moment that is true.

`test/battle.test.js` keeps every message every client receives and searches
the lot for the back of a card that was still open when it was sent — both
the declared field and the text itself, anywhere in the message under any
key. One thing is scrubbed before that search and only one: `yours`, a
player's own answer read back to them, because somebody who typed the right
answer put it there themselves. Break the rule and the suite names the card.

### The marker

`grade.js` is pure — two strings in, a mark out, nothing read and nothing
written — which is why most of what "fair" means here is testable as
arithmetic. Its own header explains every dial; the shape is a weighted
F-measure over fuzzily matched word stems, leaning on recall, lifted a little
by following the card's phrasing, and capped hard by two kinds of
contradiction. What matters from outside:

- **Word order does not decide it**, and phrasing can only ever *lift* a
  mark, never lower one. A right answer in your own words is a right answer.
- **Padding does not pay.** The precision half of the F-measure is the only
  thing standing between this room and a player who answers every card with
  the dictionary, so think hard before weakening it.
- **A typo is forgiven; a figure is not.** Numbers match exactly or not at
  all, and an answer stating a *different* figure from the card is capped —
  "Hastings was in 1067" is not a near miss. Written-out numbers are read as
  digits, so "three" and "3" agree.
- **Negation is checked separately**, and an answer that inverts the card is
  capped below a pass. Note that `not` is a **negator**, not a stop word: it
  carries full weight, and tidying it into `STOP` would be a real bug.
- **Stop words are weighed light, not dropped.** Dropping them is the obvious
  refactor and it is wrong — but so is weighing them heavily, which lets a
  card whose answer is one word be passed by getting that word wrong.

Changing any dial in that file changes every mark on the site, including the
ones already added up in `stats`.

### Two kinds of card

A deck says which kind it deals, and every card in it is that kind:

- **`text`** — a front and a back. You type; `grade.js` marks how close you
  got, out of 100. A member's own flashcards are always this.
- **`choice`** — a front and two to eight options (`MIN_OPTIONS`/`MAX_OPTIONS`;
  most have four, QASC has eight), one right. You pick. It is 100 or
  nought, and it is deliberately **not** run through the marker: "close" is
  something an answer can be and a choice cannot.

The second kind exists because of what is in `server/decks/`. Flattening those
into `text` cards was the obvious move and it is the wrong one — half of those
questions are "which of the following…", and a question that cannot be read
without its options is not a flashcard, it is a broken one.

Both kinds come out of `markOf` in the same shape, so the totals, standings,
reveal and record all read one sort of mark. A choice's working (`found`,
`missed`, `extra`) is empty, because there is none to show.

### The decks

`decks.js` is fixed sets in the source — not in the document, so a house deck
cannot be traded, lost with an account, or put out of reach by a bucket. There
are two sources, and every house deck on the site is `choice`:
- **`server/decks/*.csv`**, 57 subject papers of four-option questions — the
  MMLU set of Hendrycks et al., MIT licensed — read at boot as published, so a
  deck can be checked against its source with `diff`. About 150ms and 14,000
  cards. They live under `server/` and not beside the tests **because the
  Dockerfile copies `server/` and `public/` and nothing else**; a deck the
  image does not carry is a deck nobody can play.
- **`server/decks/*.deck.json`**, five converted grade-school science sets,
  about 31,000 choice cards: ARC easy and challenge (CC BY-SA 4.0), OpenBookQA
  (Apache 2.0), QASC (CC BY 4.0) and SciQ (**CC BY-NC 3.0, non-commercial**:
  the site must stay free of ads and charges while it carries SciQ). Made once
  by `scripts/decks-import.js`; `scripts/decks-topics*.js` put a `topic` on the
  cards they were sure of. All five are credited on `/about`, and a new set
  must be too.

**The lobby lists subjects, not sources.** `topicDecks` gathers every choice
card into a topic deck (`topic-biology` and so on): an MMLU paper by the map
in `SUBJECT_TOPICS`, a converted card by its own `topic`, and a converted card
with none into **General science** by the deck it came from (`CATCH_ALL`), so
no question is left out of every list. `catalog()` marks topics, and any
deck with `house: true`, `listed`; the sources stay in the catalog unlisted, because
rooms, the record and `stats.battle.decks` hold their ids. The daily deck
picks from the topics, so adding cards to a topic changes that day's ten.

**The battle suite brings its own `text` decks.** The site used to carry two
short hand-written ones, `bones` and `capitals`; they were taken off the site
and now live in `test/fixtures/decks/`, read from `THIEVERY_EXTRA_DECKS`,
which `test/battle.test.js` sets before it first imports `decks.js` (and
which the server it spawns inherits). The one-rule audit's text search needs
a house deck you type into, and the site no longer has one. A stats row for
either id reads as "A retired deck". `DEFAULT_DECK` is the first `house`
deck if there is one (so, in the suite, `bones`) and otherwise the first
topic.

An id is load-bearing and must never be reused or renamed, because a room being
set up holds that string. CSV decks are `mmlu-` plus the hyphenated subject.
`Decks.check()` runs at boot and stops the process on a malformed deck rather
than letting it turn up mid-match as a card no answer can score against.

Three things about the dealing worth knowing:

- **A choice card's options are shuffled when the match is dealt**, in
  `asChoiceCard`, not in the deck. A set where the answer is often "C" teaches
  people to pick C — and two players on the same card must see the same screen,
  so the shuffle is per match, never per viewer.
- **Each option carries its own id**, so what somebody picked cannot be knocked
  sideways by the list being reordered under them. An id that is not on the
  card is *refused*, not marked wrong: it means the page and the room disagree
  about what is on screen, and scoring that as nought would hide a real fault.
- **`pick()`, not `shuffled()`, draws a preset hand.** The papers run to 1,534
  questions and a match wants ten; a partial Fisher-Yates costs ten steps
  rather than sorting the deck, and the cards are cut to length before they are
  built rather than after.

### Fairness in a duel on members' own cards

The obvious way to build this is the wrong one: a duel on the challenger's
collection is a duel the challenger wrote the answers to. So `dealFrom` takes
**an equal share from every player's collection** — a card from each in turn,
round by round, so that forty cards do not crowd out three — and shuffles the
lot at the end, so whose card is whose cannot be read off the order they
arrive in. Everybody carries the same edge, and the lobby says so on the page
rather than only here.

### After a match, and the ways to settle one

- **Rematch** (`battle:rematch`) deals again on the same settings at once;
  **go over the misses** (`battle:retry`) deals only the cards somebody
  marked below `PASS` — the start of the marker's "Close" band, 65 — as fresh
  copies with their options reshuffled. Both are the host's, like
  `battle:again`.
- **Sudden death** (`room.rule === 'sudden'`) puts a player out on the card
  where they fall below `PASS`. It is decided in `closeCard`, on final marks,
  never when an answer arrives. `p.outAt` is the card they went out on, and
  `inAt(room, p, at)` — not `isPlaying` — is what asks whether a card is in
  front of somebody. Standings put how long you lasted ahead of the marks.
- **The clock** was always there (`CLOCKS`); ten and fifteen seconds are the
  quick-fire settings, meant for multiple-choice subjects.

### Watchers

A code for a match already running lets you in to **watch** (`p.watcher`)
rather than being refused. A watcher is in `room.players`, gets the same
`viewFor` as anybody and so the same protection from the one rule, is never
in `m.playing` and never in the standings, and is dropped the moment they
leave. `toLobby` sits them down if there is a seat. `seated(room)` is the
people who would be dealt in; count seats with it, not with `players`.

### The daily deck

`daily.js`: ten house cards, the same for everybody on a UTC day. Which deck
and which ten are worked out from the date by a seeded generator — nothing is
stored in advance, so a restart or a second process agrees without asking —
and that generator also shuffles the options, so everybody sees the same
screen. `battle:daily` opens a room of its own, solo, untimed, on marks, and
starts it.

The board is the only thing written: `daily[YYYY-MM-DD][userId]` in the
stored document, **first go of the day only**, pruned to a fortnight on every
write. A retry is revision and is never filed there. The hall's battle tile and
the door both show it via `Daily.forUser`, which strips account ids.

The record also files battle matches **by deck** (`stats.battle.decks`, keyed
by deck id or `'mine'`), and `site.js` turns that into names, averages and a
best deck (five cards minimum) for the Stats panel.

### The question list

`battle:browse` (a deck id, a search, an offset) answers with `battle:bank`:
twenty-five questions of a listed deck **with their answers**. It is the one
place a house card's answer leaves the server while no card of it is open,
which is why it is fenced in `browse()`:

- It is refused to anybody **connected** and playing in a match that has not
  ended (`inLiveMatch`). Not to a watcher, and not to somebody who has walked
  away from a seat, or a half-done solo run would lock them out for an hour.
- **Today's daily ten are left out** (`hiddenToday`, by card object, which
  covers every topic that shares them), because the daily board is the score
  strangers compare.

It cannot stop two friends at one table cheating together, and does not try.
The page reaches it at `/battle#questions`, from the front door only. The
one-rule audit in `test/battle.test.js` watches state messages, so it does not
see the bank; the bank has its own checks after the daily ones.

### Two smaller things

- **A card is not left open by somebody who has gone.** `allAnswered` counts
  only the players still connected, and a disconnect asks the question again
  — or a duel stalls forever on somebody who shut their laptop.
- **Marks decide a match; the clock only breaks a tie.** The room grades an
  answer on how close it is to the card, and a duel won by the faster typist
  would be grading something else.

## Switchhead

The old shedding game with two things done to it: every ten to fifteen turns (by default; the host sets both)
two players' hands swap, and on a separate count of ten to fifteen turns
the goal turns over between getting rid of your cards and hanging on to
them. Both counts (`swapIn`, `flipIn`) run in `advance` in `shed.js`, which
is the rules and is pure, with an injectable `rand`; `switchhead.js` is the
rooms and the record, and has no timer. The header of
`shed.js` has every rule; what is easy to break:

- **A swap leaves no trace.** `shuffleHands` writes nothing to the log and
  the swap reaches the table inside the push for the move that ended the
  count — no message type of its own, no animation in the page (the stylesheet deliberately has no
  transition on a card). Adding any indication breaks the game's one idea.
  Only hands with cards in are swapped, so a swap can never put somebody out.
  Neither count is ever sent.
- **The goal flip is the opposite**: logged, and the loudest thing on the
  page.
- **Places fill from both ends.** Going out while the goal is `win` takes the
  best place left; while it is `lose`, the worst. The last one holding cards
  takes what remains. With no flips that is the ordinary game. Picking the
  pile up is allowed on any turn, because otherwise "lose" is a goal nobody
  can pursue.
- **The two counts are the host's to set.** `room.timings` holds four whole
  numbers, `swapMin`/`swapMax` and `flipMin`/`flipMax`, each from 1 to 50
  and ten to fifteen by default; `Shed.cleanTimings` is the only check, and
  `createGame` stores them on `g.timings` for `advance` to redraw from.
  Moving one end of a range past the other drags the other with it. The
  ranges are sent; the counts drawn from them never are.
- **Twos, tens and four of a kind are fixed**; sevens, fours and fives are the
  host's (`OPTIONAL`). A five's cover is the same player's, straight away:
  higher than five or a two, never a see-through four.
- **`viewFor` sends no face-down card to anybody, owner included,** and only
  a count of anybody else's hand. `test/switchhead.test.js` walks every
  message for a card object anywhere outside the allowed paths.

The record is `stats.switchhead` (`recordSwitchhead`), migrated by `fill()`
like the battle block: first place is `wins`, last is `heads`.

## Mind maps

A map is a tree of bubbles under `maps` in the document, and the page sends
the whole tree back on every save (`POST /api/mindmaps/maps/:id` with
`nodes` and `rev`). `Maps.clean` is the one check on its shape (one bubble
in the middle, every parent present, no loops, the limits in `maps.js`) and
it drops an empty bubble together with whatever hangs off it. Everything
about drawing, placing and exporting is in `public/mindmaps.js`; the
server never renders a map.

- **A save names the revision it was made from.** A stale one is a 409, not
  an overwrite, so a second tab cannot quietly throw away the first's work.
- **A press means three things** in `mindmaps.js`: let go quickly and it
  edits, hold for 450ms and it adds a branch, move and it drags the bubble
  with its branches. The hold timer must be cancelled from the gesture that
  started it; cancelling it from the current one (already cleared by then)
  made every click grow a branch.
- **Only a new branch is placed.** Nothing else moves when one is added, so
  a dragged bubble stays put. Tidy lays out the whole map, and asks first.
- **Colours are written on the elements**, read from the `--mm-*` tokens
  (redefined in `plain.css`), so an exported copy looks like the screen. The
  export also embeds the EB Garamond file, because an SVG drawn into a
  canvas for the PNG cannot fetch anything.
- **Printing** points the sheet at the map's own bounds on `beforeprint`.
  `flashcards.css`, loaded for the bar, hides everything but its own card
  sheet in print, and `mindmaps.css` has to put `<main>` back.
- A deleted account takes its maps (`adminDeleteUser` calls
  `Maps.removeAllFor`).

## The pages

Every page is read through `server/views.js` (`readView`, or `render` for
`public/cards.html`), which does two things:

- **Puts in the shared pieces.** `{{bar:<room>}}` is the one site bar, with
  every room on it and the current one marked; `{{bar:public}}` is the same
  without the account menu; `{{foot}}` is the footer; `{{contact}}` is
  the contact address as a link (admin@thievery.co.uk, or `THIEVERY_CONTACT_EMAIL`). The bar used to be copied into each
  view and drifted until every room linked to a different set of the others.
  Change it in `views.js`, never in a view.
- **Takes the HTML comments out.** The views are annotated for whoever
  maintains them, and a visitor can read anything that reaches the browser.
  `test/site.test.js` fails if any page is served with `<!--` or `{{` in it.
  Comments in `public/*.js` and `*.css` still reach the browser; there is no
  build step to strip them.

`/cards.html` is redirected to `/cards` so the game page is never served raw.

`public/prefs.js` is loaded in every `<head>`, after the stylesheets, and
holds the two per-browser choices, both set in the hall's **Account** panel
(`/#account`, which the account menu links to from every room):

- **The colour scheme**: the Vault, or the plain design in `plain.css`,
  which does nothing unless `<html>` has `data-theme="plain"`. prefs.js only
  sets that on a page that links `plain.css`, which every view does and
  `public/cards.html` deliberately does not: the card table keeps the Vault.
  Radios carry `[data-theme-choice]`. The key, `thievery-theme`, is the one
  the old corner switch used.
- **Banner animations**: `data-motion="still"` on `<html>`, under which
  `style.css` stills the banners and the shake, and `app.js` asks
  `window.thieveryStill()` before the confetti. Controls are
  `[data-motion-check]` checkboxes and `[data-motion-toggle]` buttons (the
  card table's top bar; the on/off word is drawn by CSS from `.motion-state`).

Both live in localStorage because the card table has no account to keep them
against. A new element styled with a literal colour rather than a token
needs a rule in `plain.css` too.

New accounts start with an empty collection. They used to be dealt three
cards about the rules; `Cards.sweepWelcome()` runs on every boot and deletes
any card whose history has a `welcomed` event, wherever it now is.

## Environment

| Variable | Effect |
|---|---|
| `PORT` | default 3000; `0` asks for any free port |
| `THIEVERY_DATA_DIR` | local store location; ignored when R2 is configured |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | all four required together; values are trimmed on read |
| `THIEVERY_ADMIN_USERNAME` / `_PASSWORD` | admin account, created on the first boot that has a password |
| `THIEVERY_ADMIN_RESET=1` | reset that password for one boot |
| `THIEVERY_ALLOW_EPHEMERAL=1` | permit the throwaway disk in production |
| `THIEVERY_BOT_PACE` | bot think-time multiplier; the game suite sets it low |
| `THIEVERY_CONTACT_EMAIL` | overrides the address About and Privacy give, which is admin@thievery.co.uk |

R2 keys are 32 hex characters and secrets 64 — a `cfut_`-prefixed value is a
Cloudflare API token, not an S3 credential.

Deployment is `render.yaml` (native Node, the live host) and `fly.toml` /
`Dockerfile` (the Docker path). The Dockerfile copies `server/` and `public/`
only, so anything the server reads at runtime must live under one of those.
Render's build uses `--omit=dev`; `wrangler` is a dev dependency and pulls in
~120MB of platform binaries that the server never loads.

## House style

Read a neighbouring file before writing a new one — the voice is consistent
and deliberate. Comments are prose in full sentences explaining *why*, with a
header block at the top of each module and `// --- section ---` dividers.
British spelling throughout, in code comments and user-facing copy alike. In
comments, the domain vocabulary is a card table: hands, the house, striking a
card, the trading post, laying a card down.

**User-facing copy is a different voice, and much plainer.** It was rewritten
because it read as generated. The rules for it:

- Say what the player needs and stop. Never explain *why* a thing is built
  the way it is ("lives in memory only", "an empty ledger must never be saved
  over a full one"); that belongs in a comment.
- Controls say what they do: Create card, Edit, Delete, Start, Submit,
  Withdraw, Add a bot. Flavour belongs in headlines and banners, not buttons.
- "The house" is not used on the page for the home page, the bots, the admin
  or the marker. They are Home, bots, Admin and "we".
- Em-dashes are rare: at most one on a page. Use a full stop, a colon or
  brackets.
- Small capitals are for primary buttons and field labels only; other
  buttons are set in the body face.
- No stock examples (photosynthesis) and no promises about features that do
  not exist.

Dependencies are `ws` and `@aws-sdk/client-s3`, there are no dev dependencies,
and that is meant to stay true. The fonts and the icons are served out of
`public/` rather than fetched from anywhere at runtime, so the site makes no
third-party request at all.

Keep `\uXXXX` escapes as escapes in source. A literal control character —
easily introduced when writing a regex or a string containing `\u0000` — makes
git treat the whole file as binary and the diff disappears. `server/cards.js`
has two such escapes in `hash01` and `clean`.

It is worth knowing how this one bites: almost every tool that writes a file
will turn the escape into the character it stands for, and nothing looks wrong
afterwards until a diff comes back empty and git calls the file binary.
`test/source.test.js` reads every text file as bytes and fails on any literal
control character, so `npm test` catches it. When it fires, the fix is to put
the six characters back — not to delete the line.

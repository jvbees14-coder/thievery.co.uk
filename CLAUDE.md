# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # serve on PORT (default 3000)
npm run dev            # same, with --watch
npm test               # all five suites, in order; any failure stops the run
npm run test:source    # the source as bytes: no literal control characters
npm run test:game      # the card game: real server, real clients, whole rounds played out
npm run test:powerups  # the five/six-hand power-up rules, played against game.js directly
npm run test:flashcards # the flashcards room over HTTP
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

The tests need no credentials and no network. `test/smoke.test.js` sets
`THIEVERY_BOT_PACE=0.012` so bots do not pause for real seconds, and both
server-backed suites ask for `PORT=0` so concurrent runs cannot collide.

## The two halves

The repo is one server hosting two things that share almost nothing but a look
and a port:

**The card game** (`server/game.js`, `bot.js`, `deal.js`, `powerups.js`,
`index.js`; `public/index.html`, `app.js`) is deliberately stateless. Rooms live in a
`Map` in `server/index.js`, survive a refresh, and are forgotten an hour after
the last person disconnects. Nothing is written to disk, there are no accounts,
and a room code stops working within the hour.

**The flashcards room** (`server/flashcards.js`, `accounts.js`, `cards.js`,
`trading.js`, `store.js`, `r2.js`; `public/flashcards*.{js,css}`;
`server/views/`) is the opposite: real logins, and a document that has to
outlive the process.

They meet in exactly two places in `server/index.js`:

- `Flashcards.handle(req, res, url)` is called **first** in the request
  handler and returns `true` if it took the request. This must stay ahead of
  the static-file block, whose catch-all serves the game page for any
  extensionless path — otherwise `/flashcards` falls through to the game.
- `await Flashcards.start()` runs before `server.listen()`.

A failure in the flashcards half must never take the game down. `start()`
catches its own errors and latches an outage; see "The never-overwrite rule".

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

## The flashcards room

`store.js` holds one JSON document in memory; everything else calls `data()`
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

### Access control

- The app's HTML lives in `server/views/`, **not** `public/`, because anything
  in `public/` is served to anyone who asks for it by name. A logged-out
  visitor gets the door page at the same URL.
- The admin is whoever matches `THIEVERY_ADMIN_USERNAME`, named by the
  environment so the name cannot be claimed by whoever registers first.
  `/api/flashcards/admin/*` answers **404** to everyone else, not 403.
- Passwords: scrypt, self-describing hash format so the cost can be raised
  later. Sessions: random token, only its SHA-256 stored.
- Failed logins are counted tightly per account (5) and loosely per address
  (25), because one guesser behind an office IP must not lock everyone out.

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
British spelling throughout, in code comments and user-facing copy alike. The
domain vocabulary is a card table: hands, the house, striking a card, the
trading post, laying a card down.

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

# Audit before the revamp

Written on 2026-09-30 on the `revamp/hig` branch, before any file other than
this one was changed. It records what is actually in the repo, and where
that differs from what the revamp brief (`thievery-revamp-prompt.md`)
assumes.

## 1. Stack

| Question | Answer |
|---|---|
| Framework | None. Plain HTML, CSS and browser JS; a Node 20+ server using `node:http`. |
| Build tool | None. What is in `public/` is what is served. There is no bundler, no minifier and no hashed filenames. |
| Dependencies | `ws` and `@aws-sdk/client-s3`. There are no dev dependencies, and CLAUDE.md says that is meant to stay true. |
| Tests | Nine plain Node suites (`npm test`), using `node:assert/strict`. CI runs them on Node 20 and 22. |
| Hosting | One Node process on **Render** (free plan, `render.yaml`). It serves every page, every asset, the JSON APIs and the WebSocket. `fly.toml` and a `Dockerfile` are kept as a second path. |
| Cloudflare | **DNS for the domain, and R2 for storage.** There is no Pages project, no Worker, no `_redirects` and no `wrangler.toml`. `wrangler` is not a dependency. |
| GitHub | Source, plus `.github/workflows/test.yml`. |
| CORS | Not relevant. The pages, the APIs and the socket share one origin, so there is no cross-origin traffic and no CORS configuration. |

## 2. Routes

Every one of these must still answer the same way afterwards.

| Address | Served by | Login |
|---|---|---|
| `/` | `server/site.js`. Signed in: the hall (`views/menu.html`). Signed out: the door (`views/menu-door.html`). 503 page while storage is down. | Yes |
| `/cards`, `/cards/ABCD` | `site.js` renders `public/cards.html`. **This is the card game.** | Never |
| `/ABCD`, `/?code=ABCD`, `/logic/ABCD` | 301 to `/cards/ABCD` (three generations of room link) | Never |
| `/cards.html` | 301 to `/cards` | Never |
| `/flashcards` | `server/flashcards.js` | Yes |
| `/battle`, `/battle/ABCD` | `server/battle.js` | Yes |
| `/switchhead`, `/switchhead/ABCD` | `server/switchhead.js` | Yes |
| `/mindmaps` | `server/mindmaps.js` | Yes |
| `/about`, `/privacy` | `site.js`, plain pages, up during an outage | Never |
| `/health` | Render's health check | Never |
| `/api/site/…`, `/api/flashcards/…`, `/api/mindmaps/…` | JSON APIs | Mostly |
| anything else | the static block in `server/index.js`, from `public/`; a miss is `views/404.html` | Never |

`test/site.test.js` checks the redirects, the door/menu split, the footer on
every page, and that no page is served with `<!--` or `{{` in it.

## 3. How the game talks to the server

- One WebSocket on the same origin. Messages are JSON `{ type, ... }`.
- Card game types (`server/index.js`): `create`, `join`, `ping`/`pong`,
  `leave`, `lobby:seats`, `lobby:teams`, `lobby:deal`, `lobby:handSize`,
  `lobby:first`, `lobby:bot`, `lobby:botLevel`, `lobby:shuffle`,
  `lobby:swap`, `lobby:kick`, `lobby:start`, `arrange:lock`, `show`,
  `show:skip`, `guess`, `powerup`, `test:switch`, `newRound`, `turn:pass`,
  `toLobby`. The battle room and Switchhead share the socket under
  `battle:` and `switchhead:` prefixes.
- What a client may see is decided only by `Game.viewFor`, and
  `test/smoke.test.js` checks every snapshot for leaked ranks.
- Refresh and rejoin already work: rooms live in memory, survive a refresh
  and are forgotten an hour after the last person leaves.
- The session cookie rides on the socket handshake, so a signed-in player's
  rounds are counted. Nothing else changes when signed in.
- **None of this needs to change for the revamp.** Every item in the brief's
  game section can be done in `public/app.js`, `public/cards.html` and CSS.

## 4. How flashcards are stored and traded

- Everything that outlives the process (accounts, sessions, cards, the
  trading post, stats, decks, mind maps, the daily board) is one JSON
  document, held by `server/store.js` and written to an R2 object, or to
  `./data` locally and in the tests.
- The never-overwrite rule (CLAUDE.md) is the most important invariant in
  the code. The revamp does not touch `store.js`, `r2.js` or any API.
- Trading: `server/trading.js`, over `/api/flashcards/…`. Cards are listed,
  offers are made and accepted through the API.
- Deleting a card is a `DELETE` on the API. An undo toast can be done
  entirely in the page by holding the request for a few seconds, with no
  server change.

## 5. The design as it stands

- **Two themes, chosen by an in-app switch.** "The Vault" (`style.css`: ink
  navy, brass, ivory, art deco, all serif) is the default. "Plain"
  (`plain.css`: light, system sans, blue accent) is chosen in the Account
  panel and kept in `localStorage` by `public/prefs.js`. Neither follows the
  OS setting.
- **The card table keeps the Vault regardless.** `public/cards.html` does not
  link `plain.css`.
- **Four self-hosted OFL typefaces**: Limelight, Cinzel, EB Garamond and
  Cutive Mono (22 woff2 files, about 600 KB in all). The mind-map export
  embeds EB Garamond.
- **Tokens exist but are partial.** `style.css` names about 30 variables, but
  there are still roughly 200 literal colours across the stylesheets
  (106 of them in `plain.css`, which redefines the Vault).
- One shared bar and footer, written once in `server/views.js`.
- A "banner animations" switch (`data-motion="still"`), also in
  `localStorage`. It does not yet follow `prefers-reduced-motion` on its own
  everywhere.
- `lang="en"` on every page, not `en-GB`.
- `window.confirm()` is used for deleting a mind map and for leaving with
  unsaved changes. `aria-live` is used in two places only.
- All static assets are served `Cache-Control: no-cache` with
  `Last-Modified`, so every load revalidates. There is no long caching,
  because there are no hashed filenames to make it safe.
- SEO: `robots.txt`, `sitemap.xml`, a manifest, a 1200×630 `og-image.png`,
  and VideoGame JSON-LD on `/cards`. The members' pages are `noindex`.

## 6. The two concepts the brief asks about

Neither exists. There is no confession booth and no time-thief stopwatch
anywhere in the code, the views, the tests or the docs. Following the brief,
neither will be built.

## 7. Where the brief and the repo disagree

These need a decision from the owner. Each item says what I would do by
default.

1. **The game is not at `/`.** `/` is the members' hall (or its door for a
   visitor). The game is at `/cards`, with no login. The brief's section
   on `/` applies to `/cards`. `/` stays the hall.
2. **The account wall.** The brief says never to require an account before
   someone can try things. Four rooms (flashcards, battle, Switchhead, mind
   maps) and the hall require one, and that is enforced server-side
   against a data model keyed by account. Removing it is a backend change,
   which the brief says to stop and ask about. The card game already needs
   no account.
3. **An in-app theme switch.** The brief says follow the OS and have no
   toggle. The Account panel has one, and the Vault is dark only.
4. **Typefaces.** The brief allows two in total (system plus one display
   face). The site uses four, and the mind-map export depends on one.
5. **The copy voice.** CLAUDE.md's house style was written on 2026-09-24 to
   make the copy *plainer*, because it read as generated: no explaining,
   jokes only in headlines and banners, rare em-dashes. The brief asks for "a
   charming rogue" with jokes in empty states, loading, 404 and win screens.
   These can live together (the brief also wants errors and data copy
   plain), but VOICE.md has to replace or amend the CLAUDE.md rules, not
   contradict them.
6. **Test tooling.** The brief wants Playwright, axe and Lighthouse. The repo
   has no dev dependencies on purpose. They can be run with `npx` from the
   scratchpad without being added to `package.json`.
7. **Testing against the real backend.** Creating, trading and deleting a
   flashcard on the live site writes to the real document in R2. I would
   rather do the end-to-end checks against a local server (same code, file
   storage) and only look at the live site read-only, unless the owner says
   otherwise.
8. **Five nav items.** There are five rooms plus Home and the account menu.
   A five-item bottom bar is Play, Flashcards, Battle, Switchhead and Mind
   maps, with Home on the wordmark and the account in the top corner.
9. **`/tools`.** With no tools yet, the index would list the existing rooms
   (Flashcards, Mind maps, Battle) plus the template for the next one.
10. **Caching.** There is no build step to hash filenames. The safe version is
    a `?v=<commit>` query put into asset URLs by `views.js` at boot, plus
    `immutable` caching on a versioned request. That is a small change in
    `server/index.js` (headers only), not a contract change.

## 8. What will not change

- Every route, redirect, API path, payload, socket message type, env var and
  cookie.
- `Game.viewFor`, the battle room's one rule, `store.js`, `r2.js`,
  `trading.js`, `grade.js`.
- `views.js` stays the only place the bar and foot are written, and pages
  are still served without comments.
- The nine test suites keep passing at every commit.

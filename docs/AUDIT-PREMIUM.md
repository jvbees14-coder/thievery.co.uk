# Audit for the premium polish pass

Written on 2026-11-05, before anything else was changed. `docs/AUDIT.md` is
the earlier audit (2026-09-30, for the HIG revamp) and is left as it was;
this one starts from where that revamp ended up.

Screenshots were taken locally with Playwright at 375, 768 and 1440px, light
and dark, signed out and signed in (a throwaway local account, in `./data`,
never the live store). Lighthouse ran on the local server and, read-only, on
the live site. axe-core ran on 12 pages in both schemes. The screenshots are
in the session scratchpad, not the repo, so the repo gains no binaries.

## 1. How the site is built, in plain English

- **One Node process does everything.** No framework, no build step. The
  pages are HTML files with a few `{{placeholders}}` filled in by
  `server/views.js`; CSS and browser JS are served as written from `public/`.
- **Hosting:** Render, free plan (`render.yaml`), which sleeps after 15
  minutes. Cloudflare sits in front (DNS and proxy: responses carry
  `Server: cloudflare` and are Brotli-compressed on the way out).
- **Storage:** accounts, flashcards, trades, stats, mind maps and the daily
  board are one JSON document in a **Cloudflare R2 bucket**, not on Render's
  disk and not in a Postgres database. So nothing is lost on spin-down and
  nothing expires after 30 days. The code refuses to open on a throwaway disk
  in production. **No data-loss risk found.**
- **Where things are:** the card game is at `/cards` (not `/`, which is the
  members' hall, or a public front page when signed out). Flashcards,
  Battle, Switchhead and Mind maps need an account; the card game and
  Gerrymander never do.

### Corrections to the brief

| The brief says | What is true |
|---|---|
| The card game is at the root | It is at `/cards`. `/` is the front page (signed out) or the hall (signed in). Every old room link redirects to `/cards/ABCD`. |
| Propose a design system and a `/styleguide` | Both exist since 2026-09-30: `public/tokens.css`, `docs/DESIGN.md`, `/styleguide` (noindex). The direction is "the Vault, refined": ink navy and brass after dark, ivory and darker brass by day. |
| Avoid system fonts as the brand face; offer a theme toggle | Both were deliberate owner decisions on 2026-09-30: Limelight for headlines, the device's own font for text, light or dark follows the device, the card table always dark. The brief now asks for the opposite of both (see section 9). |
| Worry about free Postgres expiring / ephemeral disk | Not used. Storage is R2. |
| Build a waking-up screen | Render shows its own page while waking, served before our code runs, so we cannot style it. See section 7. |

## 2. Scores now

Lighthouse, mobile emulation:

| Page | Perf | A11y | Best pr. | SEO | FCP | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| `/` live | 89 | 100 | 100 | 100 | 2.3 s | 2.5 s | 0 | 180 ms |
| `/cards` live | 92 | 100 | 100 | 100 | 2.2 s | 2.6 s | 0 | 0 ms |
| `/` local | 90 | 100 | 100 | 100 | 2.6 s | 3.0 s | 0 | 120 ms |
| `/cards` local | 90 | 100 | 100 | 100 | 2.6 s | 3.2 s | 0 | 0 ms |
| `/about` local | 94 | 100 | 100 | 100 | 2.1 s | 2.7 s | 0 | 60 ms |
| `/flashcards` local | 93 | 100 | 100 | 100 | 2.3 s | 2.7 s | 0 | 80 ms |

Local runs are uncompressed (the live site gets Brotli from Cloudflare), so
the live numbers are the ones that count. INP cannot be measured in a lab;
TBT stands in for it.

The common drag on every page is **render-blocking**: six stylesheets and
three scripts in every `<head>`, about 1.3 to 1.5 s of potential saving, and
85 to 132 KiB of CSS each page does not use (`style.css` is 1,384 lines and
loaded everywhere).

axe-core (WCAG 2.0/2.1/2.2 A and AA, plus best practice): **no violations on
any of the 12 pages, light or dark.** No horizontal scrolling at 375px on
any page.

## 3. Inventory: how consistent the styling is

Counted across every stylesheet in `public/` and every view, leaving out
`tokens.css` (where literal values belong).

| What | Distinct values | Uses | Comment |
|---|---|---|---|
| Literal colours outside the tokens | 42 | 92 | Most are artwork (card gloss, rarity foils, print sheet). Worst offenders: `flashcards.css` (`#b9b0997f` ×16), `cards.html` (`#d4af5a` ×6). |
| Font sizes | 73 | 331 | The type-scale tokens are used 160 times; the rest are literal px, including half sizes (12.5, 13.5, 14.5px) that sit between the scale's steps. |
| Border radii | 24 | 149 | Four radius tokens exist; beside them are 3px ×19, 2px ×12, 5, 6, 7, 9, 10, 12, 13, 20, 22px. |
| Box shadows | 49 | 80 | Three elevation tokens; most shadows are one-offs. **The dark scheme's elevation tokens are single pure-black layers**; only the light scheme's are layered and tinted. |
| Padding / margin / gap with px | 168 | 443 | A 4px space scale (`--space-1` to `--space-8`) exists and is mostly unused; 10px, 6px, 14px and 18px are common and are not on it. |
| Durations | 33 | 108 | `--dur-quick/base/slow` exist; most rules write `0.15s`, `0.2s` and so on directly. Game banners run 2.6 to 3.2 s (fine for a moment); the deal is 0.6 s. |
| Font families | 3 real | 136 | Device font, Limelight, device mono. Clean. But two names for each: the old `--caps`, `--display`, `--body`, `--mono` aliases (74 uses) beside `--font-*` (30). |
| z-index | 23 | 47 | No layer tokens; values run 1 to 95. |
| `transition: all` | 0 | 0 | None. |

**Summary:** the system exists and the shared shell uses it; the older room
stylesheets (`style.css`, `flashcards.css`, `battle.css`, `switchhead.css`,
`mindmaps.css`) mostly predate it and were aliased rather than converted.
That half-converted state is the main source of "nearly but not quite"
consistency.

## 4. The 15 things that most cheapen it

Ranked by how much they would be noticed. Screenshot names refer to the
scratchpad set (`<page>-<width>-<scheme>.png`).

1. **Numbers set in Limelight are hard to read.** The flashcards ledger's
   "0" draws as a half-filled disc (◐), so an empty collection's stats look
   like broken icons (`flashcards-1440-dark`). Nowhere on the site uses
   `tabular-nums`, so scores, timers and counts jitter as they change.
   *Fix:* numbers in the text face with tabular figures; Limelight for words.
2. **Headlines break badly.** The front page's hero breaks as "Steal their /
   cards / before they / steal yours." with "cards" alone on a line
   (`home-door-1440-light`). No heading anywhere uses `text-wrap: balance`,
   no paragraph `text-wrap: pretty`. *Fix:* both, site-wide, in one rule.
3. **The card game's own front door is the plainest page.** `/cards` at
   desktop is one small panel in a large empty dark field
   (`cards-1440-dark`). The signed-out home page sells the game far better
   than the game's page does. *Fix:* give the landing card the hero's fan of
   cards and a proper stage.
4. **Dark-mode depth is flat.** Every raised surface in dark uses a single
   pure-black shadow, so panels look stuck on rather than lifted. *Fix:*
   layered, navy-tinted dark elevations, and a hairline top light.
5. **Radii drift.** 24 values; a panel at 14px holding a field at 8px
   holding a chip at 3px or 999px. *Fix:* map everything to the four tokens,
   nested radius ≤ parent.
6. **The room-code field has three looks.** Spaced capitals "C O D E" on the
   front page and the hall, unspaced "CODE" on `/cards`; on the front page
   the field and the Join button differ in height and weight. *Fix:* one
   code-field component.
7. **Type sizes between the steps.** 12.5, 13.5 and 14.5px sit beside 12, 13,
   14 and 15px, so neighbouring text is subtly mismatched. *Fix:* snap to
   the scale.
8. **The bar's link row shifts.** Signed out it is centred; signed in it
   jumps left to make room for the account pill. Gerrymander has an extra
   gap before it on both (`home-door-1440-light`, `hall-1440-light`).
9. **The hall's "Today's ten" panel** has a large empty band, and its two
   headings ("Today's ten", "Miscellany") are the same face at nearly the
   same size, so neither leads (`hall-1440-light`). The Gerrymander tile's
   "Nothing to sign in to" reads as an error.
10. **Spacing off the grid.** 10, 14 and 18px paddings everywhere make
    rhythm vary room to room. *Fix:* snap to the 4px scale room by room.
11. **Motion values are ad hoc.** 33 durations and seven easings written
    inline. Nothing is slow or broken, but nothing feels like one hand made
    it. *Fix:* use the duration and easing tokens; add the strong ease-out
    `cubic-bezier(0.23, 1, 0.32, 1)` as the default.
12. **No press feedback on buttons.** Hover and focus are designed;
    `:active` mostly is not. *Fix:* a small scale-down on press, motion
    allowing.
13. **Two names for every token.** `--brass` and `--accent`, `--caps` and
    `--font-text`. Harmless to visitors but it is how drift gets back in.
14. **Hidden duplicate `<h1>`s.** Battle has three in the markup,
    Switchhead and Mind maps two (one per view, only one shown at a time).
    Screen readers that list headings may see more than one. *Fix:* check,
    and demote the hidden ones.
15. **`og:site_name` says "Thievery.co.uk"** while the JSON-LD and titles say
    "Thievery". Small, but Google reads site names from both.

## 5. States

| State | Exists? | Notes |
|---|---|---|
| 404 | Yes | "This page has been stolen." with links home. Good. |
| Server error / storage down | Yes | Each members' room has a "back soon" page; `/` serves one at 503. |
| Empty | Yes | Flashcards ("Your vault is empty"), maps, hall tiles. Spoilt by item 1. |
| Loading | Partly | Rooms render from the server; little skeleton work needed. No show-delay/minimum-time logic. |
| Game disconnected / reconnecting | Yes | Status pill with a countdown; after several tries says the server is starting up. Seat badges show who is offline. |
| Room not found | Plain | `Room QQQQ not found`, shown as written. Could be warmer. |
| Offline (whole device) | No | Pages simply fail to load. |
| Slow cold start | Render's page | See section 7. |

## 6. Accessibility

No axe violations; Lighthouse accessibility 100 everywhere. Skip link,
`:focus-visible` rings, reduced-motion handling, `prefers-contrast`, a
banner-motion switch and a screen-reader announcer at the table all exist.
Remaining:

- Duplicate `<h1>` in hidden views (item 14).
- Targets under 24px are all inline links inside sentences, which WCAG 2.5.8
  exempts. The 44px touch aim is met by the tab bar and buttons.
- Not yet done in this audit: a full keyboard-only walk through a whole
  round. Phase 4 will.

## 7. Hosting, cold starts and search

**Measured today:** the first request to `https://thievery.co.uk/` took
**32.5 seconds** (the service was asleep). Requests after that took 0.2 to
0.5 s.

- Because every page, including `/robots.txt`, `/sitemap.xml`, `/about` and
  the share images, comes from the one sleeping process, a crawler that
  arrives while it sleeps gets Render's holding behaviour. Render documents
  answering `robots.txt` with "disallow all" while asleep. I did not wait 15
  minutes to watch it happen, so this is documented, not observed.
- **Moving the public pages to a static host is harder than the brief
  assumes.** `/` is not a static page: it is the front page or the hall
  depending on the cookie. `/cards`, the door pages and the tools are
  rendered with versioned asset links at boot. A static split means a build
  step that the project deliberately does not have.
- **A cheaper fix that is free:** Cloudflare is already proxying. A Cache
  Rule could keep `/robots.txt`, `/sitemap.xml`, `/og/*`, `/icons/*`,
  `/fonts/*` and any request with `?v=` at Cloudflare's edge, so those
  answer instantly even while Render sleeps. It needs no code. `/`,
  `/cards` and anything with a cookie must not be cached.
- **Keep-alive pinging** would stop the sleep but spends free instance
  hours (750 a month covers one service running all month, just) and Render
  does not support it officially. Owner's call.
- **Wake-early ping:** the front page could fetch `/health` as soon as it
  loads, but the front page is itself served by the sleeping process, so by
  the time it runs the server is already awake. It only helps from a page
  served elsewhere (for example a cached one).

## 8. SEO and metadata

| Item | State |
|---|---|
| Titles | Every page has one; the front page starts with "Thievery". |
| H1 | One visible H1 on public pages; the front page's is the slogan, not the word "Thievery" (the wordmark in the bar is a link, not a heading). |
| Descriptions, canonical | Present on public pages. |
| OG/Twitter images | Seven 1200×630 JPEGs, one per room. |
| JSON-LD | `WebSite` (name "Thievery", alternateName "Thievery.co.uk") on the front page; `VideoGame` on `/cards`; door pages and tools have their own. |
| `og:site_name` | "Thievery.co.uk" (item 15). |
| robots.txt, sitemap | Present; sitemap lists 10 URLs. Both sleep with the server. |
| Favicons | SVG, 180, 192, 512 PNG and a manifest. |
| Crawlable "How to play" / rules page | **Missing.** The rules are a disclosure inside `/cards` and short steps on the front page. |
| Terms / fair play page | **Missing.** Privacy and About exist. |
| Utility tools | `/tools` exists and lists the rooms; **no tool pages are built yet** (`server/tools.js` is ready for them, see `docs/ADDING_A_TOOL.md`). |

## 9. Decisions the owner needs to make before Phase 2

1. **Direction.** Refine the existing Vault (my recommendation: the bones
   are good and the problems are consistency, not concept) or explore two
   or three new directions as the brief asks.
2. **Body typeface.** The device font was chosen on 2026-09-30; the brief now
   bans it as a brand face. Keep it, or add one self-hosted text face (about
   30 to 60 KB more per first visit).
3. **Theme toggle.** Light/dark follows the device by your earlier choice;
   the brief asks for a manual switch too.
4. **Hosting.** Cloudflare Cache Rule (free, no code, you click a few
   buttons), keep-alive pinging, a static split, or leave it.
5. **Sound and "Calm mode".** The table has no sound now. Adding effects
   means choosing CC0 sounds. "Calm mode" overlaps the existing "Banner
   animations" switch; I would extend that one rather than add a second.
6. **New pages.** A crawlable How to play/rules page and a fair-play/terms
   page, and which utility tools to build (I will propose a list in Phase 2).

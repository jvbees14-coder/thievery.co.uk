# Verification of the premium polish pass

Run on 2026-11-05 against branch `premium-polish` at `aa818db`, compared with
`main` at `1ceed21` (the last commit before the branch). Both were served
locally in production mode from clean checkouts, with throwaway data. The
live site was not touched.

The audit this answers is `docs/AUDIT-PREMIUM.md`.

## The checklist

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Everything that worked still works | PASS | `npm test` on a clean checkout of the branch: all nine suites pass: 269 named checks across eight of them, and the card game played out over real sockets with 1,004 snapshots checked for leaked ranks, power-ups, the site, Battle, Switchhead, flashcards, mind maps and storage. |
| 2 | Builds and deploys on the free host | PASS, deploy not run | There is no build step; the server starts in production mode and serves every page. Nothing in `render.yaml` changed. Not deployed: that is the owner's call. |
| 3 | Values in changed files come from tokens | PASS, with artwork excepted | Literal font sizes 133 → 22, radii 81 → 28, spacing 443 → 84, short transition durations 33 → 9, layer numbers 21 → 0. What remains is the cards, banners, corner marks and illustrations, or deliberate 1-2px nudges. Literal colours are unchanged at 92, all artwork. |
| 4 | Lighthouse mobile: performance ≥ 90, accessibility ≥ 95, best practices ≥ 95, SEO 100, CLS ≤ 0.1, LCP ≤ 2.5 s | PARTIAL | Accessibility, best practices and SEO 100 on all three pages; CLS 0. Performance, median of three, uncompressed: front page 91 → 89, `/cards` 90 → 89, `/flashcards` 93 → 92. LCP 2.85-3.15 s in the lab (live, before the branch: 2.5-2.6 s). The branch adds 3.9 KB of CSS once compressed, about 20 ms on the simulated phone. The cost that keeps these near 90 was there before: seven stylesheets and two scripts that block the first paint. See "Not done". |
| 5 | No serious or critical axe violations | PASS | axe-core 4.10, WCAG 2.0/2.1/2.2 A and AA: none on 12 pages in light and dark (24 runs), nor on Gerrymander, the error page, the closed rooms or the 404. |
| 6 | Keyboard-only walk-through with a visible focus ring | PASS | Tab through ten pages (front page, card table landing and lobby, hall, flashcards, Battle, Switchhead, mind maps, About, 404): 198 stops, every one on screen, uncovered and ringed. |
| 7 | Reduced motion and both schemes | PASS | Under reduced motion and under the site's own still setting the front page and card table start no entrance animation (measured: 0 running). Every page shot in light and dark. |
| 8 | 404, error, empty and loading states | PASS | All four exist and are screenshotted. The error page is new; loading placeholders on flashcards appear only after 200 ms (measured: invisible at 0.1 s, shown at 0.8 s, gone when the data lands). |
| 9 | Favicon, share images, titles, descriptions, canonicals, sitemap, robots, structured data | PASS locally | Every public page has all of them; `og:site_name` is Thievery everywhere; every share image is described. JSON-LD parses on every page. Not yet run through Google's validator, which needs the pages live. |
| 10 | No broken internal links, no typos | PASS | Every internal link from 16 pages answers. A British-English spellcheck of every page's text finds only proper names (dataset authors, MMLU, QASC, Switchhead). |
| 11 | 375 / 768 / 1440 look intentional, no sideways scroll | PASS | No page scrolls sideways at 320, 375, 768 or 1440. Two older faults at 320 were fixed on the way. |

## The site-specific checks

| Check | Result | Evidence |
|---|---|---|
| Cold start: a waking state, never a blank screen | NOT ADDRESSED | Render shows its own page while the service wakes (measured: 32.5 s on 2026-11-05), served before any of our code runs. |
| Public pages and robots.txt load while the server sleeps | NOT ADDRESSED, plan documented | Every page comes from the one sleeping service. The audit's free fix is a Cloudflare cache rule for `/robots.txt`, `/sitemap.xml` and the versioned assets. |
| Connection indicator, reconnection and resync after a 10 s drop | PASS | Dropped mid-round: "Lost the connection to the game server. Retrying in 2s" at once; reconnected 2.4 s after the network came back, same address, same hand. |
| Effects respect reduced motion; sound muted by default | PASS for what exists | Every animation added is off under reduced motion and the still setting. The table has no sound, so there is nothing to mute. |
| Input feels instant, rejected moves roll back | NOT ADDRESSED | Lives in `public/app.js`, which another session was editing throughout. |
| No copy reads as encouraging real theft | PASS | Every mention of stealing is about cards; About says "The only thing stolen here is cards". |

## Found and fixed during the pass

- The two-column card-table landing (batch d) had pushed the 404, the error
  page and every closed room's notice to the left on a wide screen; scoped
  to the page with the hand of cards.
- The front page's queen did not lift at the end of its entrance; the lift
  now names both its ends.
- At 320 px the front page scrolled sideways under its card fan, and the
  hall's two-up tiles could not hold a room name.

## Not done, and why

- **The in-game effects** the brief describes (deal and steal animation,
  a shake on being robbed, sound with a mute, instant input with rollback)
  are all in `public/app.js`, which another session had uncommitted edits
  in for the whole of this pass.
- **Performance above 90 on every page** needs the stylesheets that block
  the first paint cut down or split (the shared ones are loaded everywhere
  and most of each is unused on any one page). A change to how every page
  is put together, so worth its own piece of work.
- **Cold starts and the sleeping robots.txt**: hosting decisions for the
  owner (see the audit, section 7).
- **New pages** (a separate How to play, a fair-play page) were not made
  without the owner's say; the rules are already crawlable inside `/cards`.
- `CLAUDE.md` still describes the Vault's old token names as aliases. They
  are gone. It was being edited by another session, so it was left alone.

## A note for the Gerrymander project

One of its level packs is called "County Lines". It is a pun on county
boundaries, but in Britain the phrase is also the name for a kind of drug
dealing. Worth a look there.

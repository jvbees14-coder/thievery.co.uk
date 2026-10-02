# Design

How the site looks and behaves, and why. The tokens themselves are in
`public/tokens.css`; every shared component is drawn on `/styleguide`, which
is not linked or indexed and is the quickest way to see all of it at once.

## The direction: the Vault, refined

Ink navy and brass after dark, ivory paper and darker brass by day. The
Vault's character lives in the **content layer**: the faint sunburst behind
the page, the brass corner marks on a panel, the card backs and card stock,
the banners, the share pictures. The **controls stay quiet**. Brass on a
control means one of three things and nothing else:

1. it is the primary action on this view,
2. it is what is selected,
3. it is a badge.

Decorative brass (corner marks, rules either side of a heading) uses
`--ornament`, a different token, so the accent never means two things.

The wordmark appears once, in the bar at the top. The game's own landing card
repeats it because that page is the game's front door, and the bar is hidden
once you are at a table.

## Principles, and which won

These follow Apple's Human Interface Guidelines, translated for the web.

| Principle | What it came to here |
|---|---|
| Purpose | The card game is the hero. The logged-out home page leads with it, and its primary button needs no account. |
| Agency | One tap to a table. Deleting a flashcard or a map is undone rather than confirmed. Leaving a round in progress is the one thing asked about. |
| Responsibility | Nothing asked for that is not needed; `/privacy` lists every key the browser keeps. |
| Familiarity | One bar, one set of icons, one button system, one toast. Every action says something back. |
| Flexibility | Touch, mouse and keyboard all play the whole game. The device decides light or dark, contrast, motion and transparency. |
| Simplicity | One or two prominent buttons per view. Advanced settings behind a disclosure. |
| Craft | A 4px grid, one type scale, and states for empty, loading and error. |
| Delight | *Cheeky thrill*. The jokes are in moments (win and lose banners, empty states, the 404, the footer's last line), never in a label. |

Where two pulled against each other:

- **Familiarity over Delight for controls.** Buttons are plain verbs
  ("Create game", "Play again", "New card"), even where a joke would fit.
- **Immersion over following the device, at the card table.** The table stays
  dark (`data-scheme="dark"` on `/cards`) because the felt, the card backs
  and the banners are the game's artwork. Everywhere else follows the device.
- **Honesty over reassurance, on connection.** When the socket drops the pill
  says so and counts to the next try, and after a few tries says the server is
  starting up again, rather than a spinner that says nothing.
- **Existing links over tidiness.** Every room keeps its address; the tools
  index links to them rather than moving them under `/tools`.

## Colour

Semantic tokens only; a stylesheet that writes a literal colour needs a reason.

| Token | Means |
|---|---|
| `--bg`, `--bg-grouped`, `--bg-elevated`, `--bg-elevated-2` | The page, a grouped area, a panel or card, something raised on a panel |
| `--label`, `--label-secondary`, `--label-tertiary` | Text, from most to least important |
| `--separator`, `--separator-strong` | A hairline; the edge of anything you type into or press |
| `--fill`, `--fill-strong` | A recessed well: inside a field, a list row |
| `--accent`, `--accent-strong`, `--accent-contrast`, `--accent-tint`, `--accent-edge` | Primary, selected, badge; its hover; text on it; its washes |
| `--ornament` | Decorative brass, never on a control |
| `--success`, `--warning`, `--danger` (+ `-tint`, `-edge`) | State, always with a word or a mark beside it |
| `--focus-ring` | The focus ring, and nothing else |
| `--team-a`, `--team-b`, `--watcher`, `--r-*` | Teams, watchers and flashcard rarities |
| `--glass`, `--glass-blur`, `--glass-edge` | The material controls float on |
| `--stock-*`, `--back-*` | Card stock and card backs: artwork |
| `--mm-*` | The mind-map sheet, read by the script so exports match the screen |

Light, dark and more contrast are all in `tokens.css`, under
`prefers-color-scheme` and `prefers-contrast`. There is no in-page switch.

The literal colours left in the stylesheets are artwork: the gloss on a card,
the banner bands, the joke pop-ups, the print sheet and the mind-map print.

### Contrast

Worked out from `tokens.css` by `node scripts/contrast.mjs`. Text needs 4.5:1
(7:1 is the aim for small text) and the edge of a control 3:1
(`--separator-strong`). Run it again after changing a colour and paste the
result here.

| Text | On | Dark | Light | Dark, more contrast | Light, more contrast |
|---|---|---:|---:|---:|---:|
| `--label` | `--bg` | 16.28 | 15.45 | 19.52 | 18.33 |
| `--label` | `--bg-elevated` | 14.31 | 17.28 | 17.16 | 20.49 |
| `--label-secondary` | `--bg` | 9.06 | 9.08 | 14.15 | 13.28 |
| `--label-secondary` | `--bg-elevated` | 7.96 | 10.15 | 12.44 | 14.85 |
| `--label-tertiary` | `--bg` | 6.07 | 6.23 | 11.14 | 10.73 |
| `--label-tertiary` | `--bg-elevated` | 5.34 | 6.97 | 9.79 | 12.00 |
| `--accent` | `--bg` | 9.99 | 6.41 | 13.37 | 10.16 |
| `--accent` | `--bg-elevated` | 8.78 | 7.17 | 11.75 | 11.36 |
| `--accent-contrast` | `--accent` | 9.26 | 7.17 | 12.40 | 11.36 |
| `--success` | `--bg-elevated` | 9.12 | 6.56 | 12.14 | 9.84 |
| `--warning` | `--bg-elevated` | 8.94 | 6.28 | 8.94 | 6.28 |
| `--danger` | `--bg-elevated` | 7.14 | 6.79 | 9.90 | 10.20 |
| `--danger-contrast` | `--danger-strong` | 5.80 | 6.79 | 5.80 | 6.79 |
| `--focus-ring` | `--bg` | 9.35 | 5.76 | 9.35 | 5.76 |
| `--focus-ring` | `--bg-elevated` | 8.21 | 6.44 | 8.21 | 6.44 |
| `--separator-strong` | `--bg-elevated` | 3.43 | 3.59 | 9.02 | 9.68 |
| `--team-a` | `--bg-elevated` | 9.88 | 6.42 | 9.88 | 6.42 |
| `--team-b` | `--bg-elevated` | 8.44 | 6.95 | 8.44 | 6.95 |
| `--watcher` | `--bg-elevated` | 8.33 | 6.95 | 8.33 | 6.95 |
| `--r-common` | `--bg-elevated` | 7.96 | 6.97 | 7.96 | 6.97 |
| `--r-uncommon` | `--bg-elevated` | 9.12 | 6.56 | 9.12 | 6.56 |
| `--r-rare` | `--bg-elevated` | 9.88 | 6.42 | 9.88 | 6.42 |
| `--r-epic` | `--bg-elevated` | 8.33 | 6.95 | 8.33 | 6.95 |
| `--r-legendary` | `--bg-elevated` | 8.78 | 6.22 | 8.78 | 6.22 |
| `--r-mythic` | `--bg-elevated` | 8.44 | 6.95 | 8.44 | 6.95 |

`--label-tertiary` falls short of 7:1 in the default schemes (5.3 to 7.0). It
is only used for small print that repeats something said elsewhere, and it
passes AA everywhere.

Colour is never the only cue. A red card lies on its side and carries a
diamond; a black one stands up and carries a spade. Whose turn it is is a lit
row, the words "Your turn" or "Their turn", and an arrow. A card on offer says
"On offer" with a clock. An error has a "!" and says what to do.

## Type

Two typefaces. The device's own (`--font-text`: SF on Apple devices, Segoe UI
on Windows, Roboto on Android) for everything read, and **Limelight**
(`--font-display`, one self-hosted woff2, SIL OFL) for the wordmark and
headlines of Title 3 and up. Monospace is the device's own too, for room codes
and the game log.

| Token | Size | Use |
|---|---|---|
| `--text-large-title` | 34 | Page titles in the display face |
| `--text-title-1` | 28 | |
| `--text-title-2` | 22 | Section heads, empty-state headlines |
| `--text-title-3` | 20 | Ledes |
| `--text-headline` | 17 semibold | |
| `--text-body` | 17 | Body |
| `--text-callout` | 16 | Buttons, fields |
| `--text-subhead` | 15 | Secondary lines, the nav |
| `--text-footnote` | 13 | Hints, small print |
| `--text-caption` | 12 | The floor. Nothing is smaller. |

All in `rem`, so they follow the reader's own text size. Weights are 400, 500,
600 and 700 only. Body line height is 1.5. Spaced capitals are gone except in
the game's banners.

## Layout

Space is `--space-1` to `--space-8` (4, 8, 12, 16, 24, 32, 48, 64). Layout
responds to width, never to the device: the bar's links become a tab bar at
900px and below, panels stack, grids reflow with `auto-fill`. Every page is
checked at 320, 375, 768 and 1440 for horizontal scroll (there is none).
`viewport-fit=cover` is on every page and the bar, tab bar, table and toasts
pad by `env(safe-area-inset-*)`.

## Materials

The bar and the tab bar are glass (`--glass`, a translucent fill with
`backdrop-filter`), on a pseudo-element so the bar never becomes the frame its
fixed children are measured against. A soft shadow appears under the bar only
once the page has scrolled under it. Nothing in the content layer is glass.
`prefers-reduced-transparency` and more contrast swap the glass for solid.
In Chromium browsers the phone's tab bar also bends what is under its edges,
through an SVG displacement map drawn to its size (`shell.js`); Safari and
Firefox discard a backdrop filter that names one, so they never get it.

## Motion

Short and for a reason: 150 to 300ms, `--ease-out` or a restrained spring.
Nothing animates on hover beyond a colour. The flourishes are kept for the
defining moments: a card dealt, a card flipped by somebody else, a guess that
misses, the banners, the confetti on a win. Only transform and opacity move.

Under `prefers-reduced-motion`, or the site's own "Animate banners" switch
(which starts off when the device asks for less motion): slides become fades,
the shake and the confetti stop, and nothing loops. No animation ever blocks
input.

## Components

All in `public/style.css` and `public/shell.css`, all on `/styleguide`.

- **Buttons.** `.btn` (secondary), `.btn.primary`, `.btn.ghost` (plain),
  `.btn.danger`, `.btn.small`, `.btn.icon-only`. At least 44px tall (32 for
  small), a hover, a pressed state, a disabled state, and the shared focus
  ring. A destructive action is never primary. Labels are verbs.
- **Focus.** One ring, `--focus-ring`, 3px outside the element, on every
  focusable thing. It is `!important` on purpose.
- **Fields.** A visible label, a hint under it, `aria-invalid` and a
  `.field-error` beside it that says how to fix it. Names are checked as they
  are typed; passwords when you leave the field.
- **Navigation.** The bar: wordmark, five rooms, the account menu. On a phone
  the rooms are a tab bar of five, always visible. Navigation only; never an
  action.
- **Sheets.** `<dialog class="sheet">` with `showModal()`: focus is trapped and
  returned by the browser. Closes on its ✕, Escape, a press on the veil, or a
  drag down from the grip on a phone, all through `sheet:close`, which a sheet
  holding unsaved work can cancel. `.sheet.alert` is the small question form,
  with a specific title and specific buttons ("Leave game" / "Cancel").
- **Toasts.** `window.thieveryToast()` in `shell.js`. At the bottom, in reach,
  read out politely. One with an action (Undo) stays at least 8 seconds and
  pauses while pointed at or focused. The older top toast (`.toast`) is for a
  refusal, above everything.
- **Empty, loading.** `.empty-state` with an icon, a headline, one line and
  the button. `.skeleton`, `.spinner` and `.progress` for loading.
- **Controls.** `public/controls.css` and `controls.js`, borrowed from an
  iPhone's settings screens, each built on a real control so a room's script
  reads and sets it as before. `.switch` is a checkbox with `role="switch"`;
  `<select data-segmented>` gets a segmented control drawn beside it;
  `<input type="number" data-stepper>` gets a minus and a plus;
  `<input type="search" data-cancel>` gets a Cancel on a phone;
  `<h1 data-large-title>` hands over to a small title in the bar on a phone
  once it has scrolled away. A `.list-group` of `.list-row`s is the inset
  grouped list, for settings. `data-actions="<selector>"` gives anything a
  menu of its own buttons on a long press or a right click, and
  `data-swipe="<selector>"` lets a row be slid left to uncover them. A sheet
  marked `data-detents` opens half way up on a phone and its grip pulls it to
  the top. The card table keeps its own brass `.seg`.
- **Icons.** One set, drawn on a 24 grid with a 1.75 round stroke, in
  `server/views.js` (`ICONS`) and put in with `{{icon:name}}`. An icon-only
  button always has an `aria-label` and a `title`.

## The card table

- The landing card's primary button is Create game, or Join game when the
  link carried a room code. The rules are below it, folded away.
- In a room the site's bar, tab bar and foot step aside. The top of the table
  has the room, Invite, Full screen and Menu; the action panel is pinned to
  the bottom on a phone.
- The menu: full screen, invite, Animate banners, Larger cards, Vibrate,
  the keyboard shortcuts, the rules, Leave room.
- Keys: Tab and arrows walk the cards (and carry your own along the row while
  arranging), Enter or Space picks, A 2–9 0 J Q K name a rank, L locks in, N
  opens a note, Esc puts back what you picked or opens the menu, F is full
  screen, ? lists them.
- Screen readers hear every move through `#announce`; every card has a label
  such as "black card, position 3, can be picked".
- Tips appear once each (`thievery-tips` in localStorage).
- The game has no sound, so there is nothing to mute.

## Checked with

- `npm test` (all nine suites) at every commit.
- axe (WCAG 2.2 A and AA) on every page in both schemes and on the game's
  lobby, table and menu: no violations.
- Lighthouse, mobile, on a production-mode server:

  | Page | Performance | Accessibility | Best practices | SEO |
  |---|---:|---:|---:|---:|
  | `/` (signed out) | 96 | 100 | 100 | 100 |
  | `/cards` | 93 | 100 | 100 | 100 |
  | `/tools` | 98 | 100 | 100 | 100 |
  | `/flashcards` (signed out) | 96 | 100 | 100 | 100 |
  | `/flashcards` (signed in) | 93 | 100 | 100 | 63* |

  \* A member's own flashcards are `noindex` on purpose.

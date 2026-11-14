# Adding an explainer

An explainer is a page at `/how-it-works/<slug>` that teaches how something
works by letting the reader play with it: a live canvas scene pinned beside
writing cut into chapters, with controls and live numbers under the scene.
Every chapter changes what the scene shows. There are nineteen; read a short
one (`compression`, `touchscreen`) beside this guide, and `gps` for the most
elaborate.

Everything that is the same from one explainer to the next is shared, so a
new one is **a scene, a thumbnail and some writing**. No dependencies, no
build step, no login, nothing stored.

## The pieces

| File | What it is |
|---|---|
| `server/explainers.js` | The list (`EXPLAINERS`) and the index's sections (`GROUPS`). Nothing unlisted is served. |
| `server/views/how-it-works.html` | The index at `/how-it-works`, its cards built from the list. |
| `server/views/how-it-works/_page.html` | The page every explainer's writing is poured into: head, share tags, title, stage. |
| `server/views/how-it-works/_stage.html` | The scene, controls, numbers and step buttons, shared by every page. |
| `server/views/how-it-works/<slug>.html` | Your writing: chapters, sources, glossary. Nothing else. |
| `public/explainers.css` | The section's styles, in the site's tokens. |
| `public/explainers/engine.js` | Scene loop, chapters, controls, readouts, glossary, dragging. |
| `public/explainers/shared/draw.js` | Labels with halos, glowing dots, arrows, colour mixing, the token list. |
| `public/explainers/shared/earth.js`, `land.js` | Natural Earth's coastlines: land dots for globes, rings for flat maps. |
| `public/explainers/<slug>/scene.js` | Your scene. |
| `public/explainers/<slug>/thumb.js` | Your index thumbnail, which also draws your share picture. |
| `scripts/og-explainers.mjs`, `scripts/og/explainer.html` | The share pictures, for every listed explainer. |

## 1. Pick a slug

Short, lower case, hyphens: `bicycle-gears`. It becomes the address, the
folder, the view's name and the share picture's (`how-it-works-bicycle-gears.jpg`).
It must never change once the page is live.

## 2. Write the page

`server/views/how-it-works/bicycle-gears.html` holds only the writing. Its
shape, top to bottom:

```html
<!-- A note for maintainers: what this is, and the chapter ids. -->
        <section class="hiw-chapter" id="ratios" aria-labelledby="h-ratios">
          <p class="hiw-chapter-num">Chapter 1</p>
          <h2 id="h-ratios">Gear ratios</h2>
          <p>Short paragraphs. A word that needs explaining is a
             <button class="hiw-term" data-term="cadence">term</button>.</p>
          <p class="hiw-try"><strong>Try it.</strong> What to do with the scene.</p>
        </section>
        ...more chapters...
<!-- end of chapters -->
    <section class="hiw-sources" aria-labelledby="h-sources">
      <h2 id="h-sources">Sources and notes</h2>
      <p>What is to scale, what is sped up or simplified.</p>
      <ol><li>Publisher, <a href="..." rel="noopener">Title</a>: which figures came from it.</li></ol>
    </section>

    <template id="hiw-glossary">
      <p data-def="cadence" data-title="Cadence">One or two sentences.</p>
    </template>
```

The line `<!-- end of chapters -->` matters: everything above it goes in the
writing column, everything below it after the layout. Each chapter's **id**
is the name the scene switches on, and the address a reader can link to
(`/how-it-works/bicycle-gears#ratios`). `test/site.test.js` checks that the
scene mentions every id and that the count matches the list.

The writing follows `docs/VOICE.md`: plain, short paragraphs, sentence case,
at most one em-dash on the page. **Check every figure** and say where it came
from in the sources. If a source doesn't say it, don't either.

(`gps.html` is a whole page, written before `_page.html` existed. A view
that starts with `<!doctype` is used as it is.)

## 3. Write the scene

`public/explainers/bicycle-gears/scene.js`, an ES module that calls `mount()`:

```js
import { mount, Smooth, fmt } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const st = { teeth: 34, spin: new Smooth(0, 4), readout: null };

function chapter(id, api) {
  const ui = api.controls();             // clears the last chapter's
  api.note(id === 'ratios' ? 'Drawn to scale' : '');
  ui.slider({ label: 'Rear sprocket', min: 11, max: 34, value: st.teeth,
    format: (v) => `${v} teeth`, onInput: (v) => { st.teeth = v; api.invalidate(); } });
  st.readout = api.readout([{ key: 'ratio', label: 'Gear ratio' }]);
}

function draw(ctx, { w, h, dt }, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const moving = st.spin.step(dt, !api.motion);   // reduced motion snaps
  // ... draw in CSS pixels; the engine has already scaled for the screen
  label(ctx, 'Chainring', w / 2, h / 2, col.label, col['hiw-scene-bg']);
  st.readout?.set('ratio', fmt(50 / st.teeth, 2));
  return moving || (api.playing && api.motion);   // true while anything moves
}

mount({ colours: TOKENS, chapter, draw });
```

What the engine gives you, through `api`:

- **`api.controls()`** returns builders that put real, labelled inputs under
  the scene: `slider`, `toggle` (the site's switch), `choice` (one of a few,
  as pressed buttons), `chips` (things to switch on and off, each with a
  colour), `text` (a field to type into), `button` (consecutive buttons share
  a row) and `hint`.
- **`api.readout(rows)`** builds the live numbers panel. Call `.set(key, text)`
  every frame if you like: it only touches the page when the text changes.
- **`api.status(text)`** is the line along the bottom of the scene, and a live
  region. Write to it when the reader does something, never every frame.
- **`api.note(text)`** is the small label in the top corner: the scale, or
  what is sped up.
- **`api.colours`**, **`api.motion`** (false under reduced motion or the
  site's still setting), **`api.playing`** (the Pause button),
  **`api.invalidate()`** (ask for a frame), **`api.chapter`**, **`api.scene`**
  (its `w` and `h`).
- **Dragging.** Pass `handles: { list(api), drag(id, x, y, api), nudge(id, dx, dy, api) }`
  to `mount`. `list` returns what can be held right now, each
  `{ id, x, y, r, label }` in canvas pixels. The engine handles mouse and
  touch (a touch on a handle drags, anywhere else scrolls the page) and the
  keyboard: the canvas takes focus, N picks the next handle, the arrows call
  `nudge`. Draw a ring in `--focus-ring` round `api.handles.selected` while
  `api.handles.focused`.

What it does for you, so a scene never has to: the canvas's size and pixel
ratio, a loop that sleeps off screen, in a background tab and when your
`draw` returns false, the chapters (scrolled to on a wide screen, stepped
through with buttons on a phone, kept in the address), the glossary
pop-ups, and repainting when the device switches between light and dark.

**Rules for a scene.**

- Colours come from tokens, never literals. Pass `TOKENS` from
  `shared/draw.js` as `colours`; the section's own inks are `hiw-ink-1` to
  `hiw-ink-4`, each an existing token with a light and a dark value. A shape
  that must stay light whatever the scheme (a QR code, a playing card) uses
  `stock` and `stock-ink`.
- Use `Smooth` (or your own eased timer) for anything that changes, and pass
  `!api.motion` as its `instant` so reduced motion snaps rather than glides.
- Nothing moves by itself unless `api.playing && api.motion`, and anything
  that only moves by itself needs a slider or button for people who have
  motion turned off.
- Labels go through `label()` from `shared/draw.js`, which gives them a halo
  in the scene's background so they read over lines.
- Keep it cheap: a mid-range phone draws it 60 times a second. Gradients and
  a few thousand small shapes are fine; shadows and filters are not.
- Put the drawing the thumbnail also needs in a module of its own
  (`art.js`, `flow.js`...): `scene.js` calls `mount()` when it loads, so
  nothing else can import it.

## 4. The thumbnail and the share picture

`public/explainers/bicycle-gears/thumb.js`:

```js
import { TOKENS } from '../shared/draw.js';
export const colours = TOKENS;
export function thumb(ctx, w, h, t, col) { /* the scene, small, at time t */ }
export function share(ctx, w, h, t, col) { /* optional: a still for the share picture */ }
```

`thumb` draws the moving picture on the index card (stilled under reduced
motion). The share picture is drawn by `share` if there is one, otherwise by
`thumb`, in the dark scheme's colours, at 540 by 540.

## 5. List it

In `server/explainers.js`, add to `EXPLAINERS`:

```js
{
  slug: 'bicycle-gears',
  group: 'machines',          // one of GROUPS' ids
  name: 'How bicycle gears work',
  hook: 'One line for the card and the share picture.',
  lede: 'A sentence or two under the title.',
  description: 'The meta description: what the explainer covers.',
  chapters: 5,
  minutes: 5,
  alt: 'What the thumbnail shows.',
},
```

The view and thumbnail are found by the slug. The server reads views once
at boot, so restart it to see the HTML change (the `thievery-watch` launch
configuration restarts by itself); scripts and styles only need a reload.

## 6. The rest

```
npx -y -p playwright node scripts/og-explainers.mjs how-it-works-bicycle-gears
```

draws the share picture into `public/og/`. Then:

- Add the address to `public/sitemap.xml`.
- Look at every chapter at 320px, 375px and 1280px, in light and dark, with
  the keyboard alone, and with reduced motion on.
- `npm test`.

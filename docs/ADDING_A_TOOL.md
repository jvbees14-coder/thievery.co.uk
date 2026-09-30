# Adding a tool

A tool is one page with one job, at `/tools/<slug>`, listed on `/tools`. The
twist, if there is one, is in what it tells you, never in its buttons. It
needs no server code unless it has to keep something, and if it does, see
the last section first.

## 1. Pick a slug

Short, lower case, hyphens only: `tip-splitter`. It becomes the address, the
file names and the share picture's name, and it must never change once the
tool is live, because links to it will be out in the world.

## 2. Copy the layout

```
cp server/views/tools/_layout.html server/views/tools/tip-splitter.html
```

Replace everything in capitals:

- `TOOL NAME` in the title, the headings and the JSON-LD
- `SLUG` in the canonical address, `og:url` and the script tag
- the one-line description, which is also the meta description
- `THE ONE-LINE JOKE, OR A PLAIN SUBTITLE`
- the form: a visible `<label>` on every field, a verb on the button
- the empty state inside `#tool-result`, which is where the joke can go
- "How it works": two or three plain sentences

Keep the shape: title, one line, the tool above the fold on a phone, the
result in the live region, "How it works" folded underneath.

## 3. Write the script

`public/tools/tip-splitter.js`, loaded with `defer`. Plain browser JS, no
libraries. Write the answer into `#tool-result`; it is a live region, so a
screen reader hears it. Anything the tool remembers goes in localStorage
under a `thievery-` key, wrapped in `try`, and gets a row in the table on
`/privacy`.

Styles, if the layout's are not enough, go in `public/tools.css` under a
comment naming the tool. Tokens only (see `docs/DESIGN.md`).

## 4. List it

In `server/tools.js`, add to `TOOLS`:

```js
{
  slug: 'tip-splitter',
  view: 'tip-splitter.html',
  icon: 'tools',            // or add one to ICONS in server/views.js
  name: 'Tip splitter',
  blurb: 'Split a bill fairly. Or at least evenly.',
  login: false,
},
```

Nothing is served until it is listed, so a half-made file in the folder is
safe.

## 5. The rest

- Add the address to `public/sitemap.xml`.
- Add the page to `PAGES` in `scripts/og/card.html` and
  `scripts/og-images.mjs`, run `npx -y -p playwright node scripts/og-images.mjs`,
  and point the page's `og:image` at `/og/<slug>.jpg`.
- Look at it at 320px and 1440px, in light and dark, with the keyboard alone.
- `npm test`. `test/site.test.js` fails any page served with a comment or a
  `{{` left in it.

## If people can submit things

A tool that takes submissions from strangers (a confessions wall, a
leaderboard) needs more than a page:

- **Anonymous by design.** Store the submission and a time, and nothing that
  identifies anybody: no IP address, no account id unless it is a members'
  tool.
- **Rate limits** in memory, per IP, the way `server/door.js` counts sign-ups,
  cleared on restart and never written down.
- **Moderation**: a length cap, a word list, and a way for the admin to remove
  things, reached from the existing admin panel rather than a second one.
- **A notice by the form**: don't post anything illegal, and don't name or
  describe real people.
- It will live in the stored document, so read "The never-overwrite rule" in
  CLAUDE.md before writing any of it, and add a suite under `test/`.

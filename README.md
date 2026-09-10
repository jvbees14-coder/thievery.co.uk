# Logic — online multiplayer

A browser version of **Logic**, the 3–4 player deduction card game. One player
creates a room and gets a 4-letter code; everyone else joins with the code and
plays in real time from their own browser.

- Solo mode (3 or 4 players) or two partnerships (4 players, 1 & 3 vs 2 & 4).
- The server is the only place hidden ranks live. Each client is sent a
  personalised snapshot containing only what that player is allowed to know, so
  nothing can be peeked at with devtools.
- Refreshing or dropping the connection re-joins the same seat automatically.
  Closing the browser entirely and coming back works too: rejoin with the room
  code and the same name.
- Running win tally per player across rounds in a session.
- Host lobby controls: order of play (arrow buttons or click-to-swap), who
  leads each round, and either a random deal split or a custom hand size per
  player (must total 26).
- A correct guess earns another guess; the turn only passes on a miss. Aces
  may be placed anywhere in a player's row.
- Arrange your row by dragging cards (mouse or touch). The row only accepts
  positions the rules allow, and the server re-validates on lock-in.

## Run it locally

Requires Node 18+ (tested on Node 24).

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # same, but restarts when server files change
npm test           # end-to-end smoke test (boots the server, plays two full games)
```

Open <http://localhost:3000> in several tabs to try it: each tab is a separate
player. To let friends on the same Wi-Fi join, give them
`http://<your-LAN-IP>:3000`.

## Project layout

```
server/index.js   HTTP static server + WebSocket room/lobby handling
server/game.js    Pure game rules + viewFor() (the per-player privacy filter)
server/deal.js    Deal split (7/7/6/6 and 9/9/8) — change here if your table deals differently
public/           index.html, style.css, app.js — the client, no build step
test/smoke.test.js  Drives real WebSocket clients through complete games
```

### Protocol in one paragraph

Clients send small JSON actions (`create`, `join`, `lobby:start`,
`arrange:lock`, `show`, `guess`, `reveal`, `declare:start`, `declare:name`,
`newRound`, …). After every action the server validates it against the
authoritative game object and broadcasts a fresh `state` message to each
player in the room, built by `viewFor(game, seat)`. A card's rank is only
included if the viewer owns it, it is face up, or their partner has shown it
to them. Colours are withheld until everyone has locked in their row.

## Why a small Node server instead of Firebase

The hard requirement is that players can't see each other's hidden ranks.
With a realtime database the browser talks to the database directly, so to
keep ranks private you would need per-card security rules *and* Cloud
Functions to validate guesses and flips (the client can't be trusted to check
"was my guess right?" without being given the answer). At that point you are
writing a server anyway, just spread across rules, functions and a schema.

A single ~400-line Node process with the `ws` library keeps all the rules in
one file, has no database at all (rooms are in memory and vanish after an hour
of inactivity, which is fine for a party game), and deploys as one container.
The trade-off is that state does not survive a server restart and you can't
scale past one instance without adding sticky sessions or Redis. For a group
of friends that is not a concern.

## Deploying so friends can join over the internet

WebSockets need a long-running process, so **Vercel/Netlify serverless
functions are not a good fit**. Any host that runs a plain Node process works.
The app reads `PORT` from the environment and serves everything from one port,
with a `/health` endpoint for health checks.

### Render (easiest, free tier)

1. Push this folder to a GitHub repo.
2. On <https://dashboard.render.com> choose **New → Blueprint**, pick the repo.
   It reads `render.yaml` and creates the web service.
3. You get a URL like `https://logic.onrender.com`. Share `https://…/?code=ABCD`
   links straight from the lobby's "Copy invite link" button.

The free instance sleeps after 15 minutes idle; the first visit takes ~30 s to
wake. Rooms are in memory, so a sleep/restart clears them.

### Custom domain (thievery.co.uk on Cloudflare)

`render.yaml` already lists `thievery.co.uk` and `www.thievery.co.uk`, so the
Blueprint deploy creates the service with both domains attached. Render then
shows the DNS records it needs under **Settings -> Custom Domains**. Add them
in the Cloudflare dashboard (DNS -> Records):

| Type  | Name  | Content                  |
|-------|-------|--------------------------|
| A     | `@`   | the IP Render shows (currently `216.24.57.1`) |
| CNAME | `www` | `logic.onrender.com` (your service's onrender hostname) |

Either proxy setting works. If you leave the orange cloud (proxied) on, set
Cloudflare **SSL/TLS -> Overview** to **Full (strict)**, otherwise you get a
redirect loop. If Render's certificate check stalls, switch the records to
"DNS only" until the certificate is issued, then re-enable the proxy.

Render redirects `www` to the bare domain automatically, and the client
switches to `wss://` on its own, so nothing in the code changes.

### Fly.io

```bash
fly launch --copy-config --no-deploy   # uses fly.toml + Dockerfile
fly deploy
```

### Railway

New project → Deploy from GitHub → it detects `npm start`. Nothing else needed.

### Anything with Docker

```bash
docker build -t logic .
docker run -p 3000:3000 logic
```

All of these terminate TLS for you, and the client switches to `wss://`
automatically when the page is served over HTTPS.

## House rules you might want to tweak

- **Deal split**: `server/deal.js`.
- **Room code length/alphabet**: `newRoomCode()` in `server/index.js`.
- **Who may skip the Show step**: `skipShow()` in `server/game.js` (currently
  the partner, or the active player only if their partner is offline).
- **Failed solo declare**: currently nobody wins the round; change
  `finishRound()` in `server/game.js` if you'd rather award it to the others.

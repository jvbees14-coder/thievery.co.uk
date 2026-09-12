# Thievery.co.uk

**Thievery.co.uk** is an online version of the deduction card game, for three
to six players. Everyone plays from their own phone, tablet or laptop, in real
time, with no downloads and no accounts. One person creates a room, shares the
4-letter code, and the game begins as soon as the last player joins.

Play at <https://thievery.co.uk>.

## The idea

Half a deck of cards is dealt out face down. Each player lines their cards up
in ascending order, so the *colours* are on show but the *ranks* are hidden.
On your turn you point at an opponent's card and guess what it is. Guess right
and it flips over, letting you guess again. Guess wrong and the turn passes.
The first player (or team) to turn over every opponent card wins the round.

The skill is in the deduction: a black card sitting between a face-up 4 and a
face-up 7 can only be a 4, 5, 6 or 7, and every card that flips narrows things
further for everyone at the table.

## Starting a game

1. Open the site and press **Create game**. You become the host and get a room
   code. The name box arrives pre-filled with an alias — press the roller
   beside it for another, or type your own over the top.
2. Share the code, or use **Copy invite link** to send a link that fills the
   code in automatically.
3. Friends open the site, type the code and their name, and press **Join**.
4. When the right number of players is in the room, the host presses
   **Start game**.

### Host options in the lobby

- **Players**: anything from 3 to 6. The 26 cards are split as evenly as the
  table allows, so bigger tables mean smaller hands — and, in solo play, a
  longer round, since you have to turn over everybody else's cards to win.
- **Teams**: at a table of four you can play as two partnerships instead.
  Seats 1 and 3 are one team, seats 2 and 4 the other. Partnerships need
  exactly four players, because the Show step depends on each player having a
  single partner.
- **Order of play**: use the arrows to move players around the table, click
  two names to swap them, or press **Shuffle seats**.
- **First to play**: pick a player to lead every round, or leave it on
  **Rotate** so the lead passes round the table each round.
- **Deal**: either a random split — 9/9/8 at three, 7/7/6/6 at four, 6/5/5/5/5
  at five, 5/5/4/4/4/4 at six — or a fixed hand size per player. Custom sizes
  must add up to 26.
- **Kick**: remove someone who joined by mistake.

## How a round works

### 1. Arrange your cards

You are dealt your cards and see them face up on your own screen. Drag them
into ascending order and press **Lock in**. Two rules:

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

The round ends the moment one player (or, in teams mode, one team) has every
opponent card face up. That player or team wins the round. In solo mode this
means the last person with any face-down cards left is the winner.

The result is announced across the whole screen and stays there until you
press a key or click — nothing is whisked away before you have read it.

At the end of a round all the cards are revealed. The host can start a new
round in the same room or return everyone to the lobby. A running tally of
wins per player is kept for the session.

## Fair play

You cannot cheat by looking at the page source or the network traffic. Each
player is only ever sent the information they are entitled to: their own
cards, cards that are face up, and cards their partner has shown them. Hidden
ranks never leave the server.

## Losing connection

- Refreshing the page, or a brief network drop, puts you straight back in your
  seat with everything you knew.
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

## Running your own copy

The whole game is a small Node.js server with no database. If you would rather
host it yourself, install Node 18 or newer and run:

```bash
npm install
npm start
```

Then open <http://localhost:3000>. Anyone on the same Wi-Fi can join with your
computer's local address. The `render.yaml`, `fly.toml` and `Dockerfile` in
this folder deploy it to Render, Fly.io, or any Docker host.

### Test mode

To try the game out on your own, create a game with the display name
**Test67**. The room fills with four players and starts straight away, and a
bar at the top of the page lets you switch between the seats so you can play
every hand yourself. A dot marks whose turn it is.

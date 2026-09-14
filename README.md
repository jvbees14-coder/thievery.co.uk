# Thievery.co.uk

**Thievery.co.uk** is an online version of the deduction card game, for one to
eight players. Everyone plays from their own phone, tablet or laptop, in real
time, with no downloads and no accounts. One person creates a room, shares the
4-letter code, and the game begins once everybody is in. If there are only one
or two of you, the empty hands can be dealt to the house instead.

Play at <https://thievery.co.uk>.

## The idea

Half a deck of cards is dealt out face down into three or four *hands*. Each
hand is lined up in ascending order, so the *colours* are on show but the
*ranks* are hidden. On your turn you point at an opponent's card and guess
what it is. Guess right and it flips over, letting you guess again. Guess
wrong and the turn passes. The first hand (or team) to turn over every
opponent card wins the round.

The skill is in the deduction: a black card sitting between a face-up 4 and a
face-up 7 can only be a 4, 5, 6 or 7, and every card that flips narrows things
further for everyone at the table.

## Hands and people

A hand is not the same thing as a player. The table is dealt three or four
hands, and no more: a fifth hand would be too small to hide anything in.

- The first three or four people to arrive play a hand each.
- Anybody after that joins somebody already seated. The two of them share that
  hand: they see exactly the same cards, and either of them can play it when
  its turn comes round.

So a table of four hands holds anywhere between four and eight people, and a
table of three holds between three and six.

Any hand nobody has taken can go to the house, so a table of one or two people
still plays as a full three- or four-handed game. See [Playing the
house](#playing-the-house).

## Starting a game

1. Open the site and press **Create game**. You become the host and get a room
   code. The name box arrives pre-filled with an alias — press the roller
   beside it for another, or type your own over the top.
2. Share the code, or use **Copy invite link** to send a link that fills the
   code in automatically.
3. Friends open the site, type the code and their name, and press **Join**.
   The first few get a hand each; anyone after that pairs up with a player who
   is already seated.
4. Once there is at least one player per hand, the host presses **Start game**.
   There is no need to fill the table first — latecomers can only be dealt in
   from the next round, though, so it is worth waiting for anyone close by. If
   nobody else is coming, press **Deal the house in** beside each empty hand
   and play the bots instead.

### Host options in the lobby

- **Hands**: three or four. The 26 cards are split as evenly as the table
  allows, so four hands means smaller hands — and, in solo play, a longer
  round, since you have to turn over everybody else's cards to win. Three
  hands seat up to six people, four hands up to eight.
- **Teams**: at a table of four hands you can play as two partnerships
  instead. Hands 1 and 3 are one team, hands 2 and 4 the other. Partnerships
  need exactly four hands, because the Show step depends on each hand having a
  single partner. (This is separate from two people sharing one hand — you can
  have both, which makes a partnership of four people.)
- **Order of play**: use the arrows to move players around the table, click
  two names to swap them, or press **Shuffle seats**. Since hands are filled
  one player each and then round again, this is also how you decide who ends
  up sharing with whom.
- **The house**: how hard the bots play — **Novice**, **Sharp** or
  **Ruthless**. It applies to every bot at the table.
- **First to play**: pick a hand to lead every round, or leave it on
  **Rotate** so the lead passes round the table each round.
- **Deal**: either a random split — 9/9/8 at three hands, 7/7/6/6 at four — or
  a fixed size per hand. Custom sizes must add up to 26.
- **Kick**: remove someone who joined by mistake.

## How a round works

### 1. Arrange your cards

You are dealt your cards and see them face up on your own screen — and, if
you are sharing a hand, so does the person you are sharing it with. Drag them
into ascending order and press **Lock in**; on a shared hand, whichever of you
presses first settles it for both. Two rules:

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

The round ends the moment one hand (or, in teams mode, one team) has every
opponent card face up. That hand wins the round, and both players win it if
the hand is shared. In solo mode this means the last hand with any face-down
cards left is the winner.

The result is announced across the whole screen and stays there until you
press a key or click — nothing is whisked away before you have read it.

At the end of a round all the cards are revealed. The host can start a new
round in the same room or return everyone to the lobby. A running tally of
wins per player is kept for the session.

## Playing the house

An empty hand can be dealt to a bot, so one or two people can sit down to a
full table. Press **Deal the house in** on any hand nobody has taken. Bots
arrange their hands, take their turns, and show their partner a card in a
partnership game, exactly as a person would.

A bot always plays a hand on its own — it never shares one — and it gives its
hand up the moment a real player arrives to want it, so filling the table with
bots never keeps a friend out of the room. The host can also send one home with
the **×** beside its name. Bots count towards the tally of wins like anybody
else, and they sit still while nobody is connected.

### How hard they play

One setting covers every bot at the table:

- **Novice** knows the rule and no more. It picks a card that caught its eye,
  works out what the cards either side of it allow, and takes one of those at
  random. It never looks at the next card along to see whether that is the
  better bet, and it leaves its own aces sitting at the front of its hand where
  anyone who has played a couple of rounds will look for them first.
- **Sharp** shops around. Because every hand is in ascending order, a face-down
  card is fenced in by the face-up cards either side of it; this one works that
  fence out for every card on the table, finds the narrowest, and plays the
  best rank it leaves.
- **Ruthless** reads the whole table at once. Ascending rows, wild aces, every
  colour on show and all 26 cards accounted for between the hands: together
  that is enough to put a number on every hidden card at the table, and it
  plays the best of them. Roughly two guesses in five are dead certainties by
  the time it makes them. It is a very hard game.

Everybody, bots included, also remembers every guess that has already missed —
those are said out loud at the table, and they narrow things down as surely as
a card turning over.

A bot is handed exactly the same view of the table as a person sitting in its
chair: its own cards, whatever is face up, and anything its partner has shown
it. Hidden ranks are no more available to a bot than to anybody else, so the
harder levels are winning on arithmetic rather than on a peek at the deck.

### How long they take

A bot waits three to five seconds before playing, so the table does not snap
back at you — and a shorter beat, under three seconds, for each further guess
in a run it is already on. The thinking itself takes a few milliseconds; the
pause is manners.

## Fair play

You cannot cheat by looking at the page source or the network traffic. Each
player is only ever sent the information they are entitled to: their own
cards, cards that are face up, and cards their partner has shown them. Two
people sharing a hand are sent the same thing as each other, because they are
playing the same cards. Hidden ranks never leave the server.

## Losing connection

- Refreshing the page, or a brief network drop, puts you straight back in your
  seat with everything you knew. A hand shared by two people carries on
  perfectly well while one of them is away.
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

## Marked names

Put a mark in front of your name when you join and the room treats it as an
instruction rather than part of the name. The mark is stripped off before
anybody sees it, and nothing any player is sent says who is responsible.

- **`/Jonitha`** — everybody else at the table starts receiving small
  advertisements, which arrive every few seconds and have to be clicked to be
  got rid of. You see none of them yourself. If somebody else is marked too,
  they are spared as well; everyone unmarked still gets the lot.
- **`#Jonitha`** — the same, except you take them along with everyone else.

They stop the moment the last marked player leaves the room. Refreshing does
not call them off; rejoining without the mark does.

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

To play a real game on your own, deal the house into the empty hands — see
[Playing the house](#playing-the-house). Test mode is for looking at the game
from every side at once: create a game with the display name **Test67** and the
room fills with four players and starts straight away, with a bar at the top of
the page to switch between the seats so you can play every hand yourself. A dot
marks whose turn it is.

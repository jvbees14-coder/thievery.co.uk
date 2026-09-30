# Voice

How the site talks. CLAUDE.md's "House style" points here for anything a
visitor reads.

## Who is talking

A charming rogue. Confident, dry and a little mischievous, never mean, and
never actually criminal. The name is a joke; the site is a card game, some
flashcards and a few tools. Nothing here explains how to steal anything that
is not a playing card.

## Where the jokes go

Jokes live in **moments**, where nobody is trying to get something done:

- the end of a round (the win and lose banners, a random line after the facts)
- empty states ("Your vault is empty.")
- the 404 ("This page has been stolen.")
- loading and waiting, when there is a wait
- the last line of the footer, which changes each load

Everywhere else is **plain and direct**:

- buttons and links, fields and their labels
- errors, confirmations and warnings
- anything about data, accounts or privacy

If a line has to be read to get something done, it is not a joke.

## Rules

- **Buttons say what they do**, as a verb: Create game, Join game, Play
  again, New card, Save, Delete, Withdraw, Add a bot, Leave game. Never
  "Let's go!", never "OK" when there is a better word, never "Click here".
- **Sentence case** for every heading, button, label and tab. Capitals for
  the first word and for names (Thievery, Battle, Switchhead) only.
- **Errors say what happened and how to fix it**, next to the thing that went
  wrong, without blame and without "Oops". "Use at least 10 characters." not
  "Invalid password". "Lost the connection to the game server. Retrying in
  5s." not "We're having trouble".
- **"You"** for the reader. **No "we" in an error.** "We" is fine for the
  site speaking about itself (the privacy page, the marker in Battle).
- **Avoid "my" and "your" in labels** unless it would be unclear without
  them: "Cards", "Stats". A headline can use them ("Your vault is empty.").
- **"The house"** is not used on the page for the home page, the bots, the
  admin or the marker. They are Home, bots, Admin and "we".
- **UK English**: colour, organise, licence (noun), programme only for a
  broadcast.
- **Em-dashes are rare**: at most one on a page. Use a full stop, a colon or
  brackets.
- **Say what the reader needs and stop.** Never explain why a thing is built
  the way it is; that belongs in a code comment.
- **No stock examples** and no promises about features that do not exist.
- **Humour that includes people.** No in-jokes a stranger would not get, no
  stereotypes, no slang that shuts anyone out. Gender-neutral wording
  throughout; people are "they".

## Examples

| Where | Plain | With the voice |
|---|---|---|
| Win banner | Heist complete. You flipped every card. | *…* Act natural. |
| Lose banner | Busted. Sneak flipped your last card. | *…* Next time, wear gloves. |
| Empty collection | | Your vault is empty. Nothing to steal yet. |
| 404 | | This page has been stolen. |
| Connection lost | Lost the connection to the game server. Retrying in 4s. | (no joke: the reader needs to know) |
| Delete toast | Deleted "What river runs through Paris?". [Undo] | (no joke) |
| Field error | Use 3 to 20 letters, numbers, dots, dashes or underscores. | (no joke) |

/* Thievery.co.uk — Switchhead, as you see it.
 *
 * One socket, one snapshot, four screens, the same bargain as the battle
 * room: every message is the whole room cut down to what this player may
 * know, and the page redraws from it.
 *
 * Two things worth knowing before changing anything here.
 *
 * **The hands swap without a word.** When two hands change places the server
 * simply sends the new state, and this page simply draws it. There is no
 * animation, no toast, no flash of a changed card — adding one would be
 * adding the very indication the game is built on not having. All the page
 * does is drop any selected card that is no longer in the hand, so that Play
 * cannot send cards that have gone.
 *
 * **The goal turning over is the opposite**: it is the loudest thing on the
 * page, because a goal nobody noticed change is not a goal.
 *
 * The socket is shared with the card table and the battle room, which is why
 * everything in and out of here is prefixed `switchhead:`. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

  let state = null;
  let catalog = null;
  let ws = null;
  let whoami = '';
  let superseded = false;
  let lastFlips = 0;

  // What is picked. In play: the cards about to go down, all of one rank.
  // Before the start: one card from the hand and one from the face-up row,
  // which are swapped the moment both are chosen.
  const picked = new Set();
  let swapPick = { hand: null, up: null };

  // --- talking to the house --------------------------------------------------

  function connect() {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${scheme}//${location.host}`);

    ws.addEventListener('open', () => {
      say({ type: 'switchhead:hello' });
      const code = (location.pathname.match(/^[/]switchhead[/]([A-Za-z0-9]{4})$/) || [])[1];
      if (code) say({ type: 'switchhead:join', code: code.toUpperCase() });
      else render();
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'switchhead:you') {
        whoami = msg.name;
        $('#who').textContent = whoami;
        return;
      }
      if (msg.type === 'switchhead:catalog') {
        catalog = msg;
        if (state && !state.game) drawLobby();
        return;
      }
      if (msg.type === 'switchhead:state') {
        const before = state;
        state = msg.state;
        if (location.pathname !== '/switchhead/' + state.code) history.replaceState(null, '', '/switchhead/' + state.code);
        tidyPicks(before);
        render();
        return;
      }
      if (msg.type === 'switchhead:superseded') {
        superseded = true;
        toast('You opened this room in another tab. Reload this one to take it back.');
        ws.close();
        return;
      }
      if (msg.type === 'switchhead:error') toast(msg.message);
    });

    ws.addEventListener('close', () => {
      if (superseded) return;
      toast('Connection lost. Trying again…');
      setTimeout(connect, 1500);
    });
    ws.addEventListener('error', () => {});
  }

  function say(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  let toastTimer = 0;
  function toast(message, kind = '') {
    const el = $('#toast');
    el.textContent = message;
    el.className = 'toast' + (kind === 'info' ? ' info' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 4200);
  }

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Keep only picks that are still in front of this player. After a swap
  // that is usually none of them, and that is the whole of what the page
  // does about it.
  function tidyPicks(before) {
    const you = state.game && state.game.you;
    if (!you) {
      picked.clear();
      swapPick = { hand: null, up: null };
      return;
    }
    const inHand = new Set(you.hand.map((c) => c.id));
    const inUp = new Set(you.up.map((c) => c.id));
    for (const id of [...picked]) if (!inHand.has(id) && !inUp.has(id)) picked.delete(id);
    // A turn that has moved on leaves nothing picked for the next one.
    if (before && before.game && before.game.turn !== state.game.turn) picked.clear();
    if (swapPick.hand && !inHand.has(swapPick.hand)) swapPick.hand = null;
    if (swapPick.up && !inUp.has(swapPick.up)) swapPick.up = null;
  }

  // --- a card ----------------------------------------------------------------

  const FACE = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
  const RANK_NAME = { 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' };
  const face = (r) => FACE[r] || String(r);
  const cardName = (c) => `${RANK_NAME[c.rank] || c.rank} of ${SUIT_NAME[c.suit]}`;

  // One card, face up. `act` makes it a button.
  function cardHtml(c, { act = '', on = false, dim = false, small = false, extra = '', style = '' } = {}) {
    const red = c.suit === 'H' || c.suit === 'D';
    const cls = `sh-card${red ? ' is-red' : ''}${on ? ' is-on' : ''}${dim ? ' is-dim' : ''}${small ? ' is-small' : ''}${extra}`;
    const inner = `<span class="sh-rank">${face(c.rank)}</span><span class="sh-suit">${SUIT[c.suit]}</span>`;
    const css = style ? ` style="${style}"` : '';
    if (!act) return `<span class="${cls}"${css} title="${esc(cardName(c))}">${inner}</span>`;
    return `<button class="${cls}" type="button" data-act="${act}" data-id="${esc(c.id)}" aria-pressed="${on}" aria-label="${esc(cardName(c))}">${inner}</button>`;
  }

  const backHtml = (small = false) => `<span class="sh-card is-back${small ? ' is-small' : ''}" aria-hidden="true"></span>`;

  // --- which screen ----------------------------------------------------------

  function screenFor(s) {
    if (!s) return 'door';
    if (!s.game) return 'lobby';
    return s.game.phase === 'ended' ? 'end' : 'table';
  }

  function render() {
    $('#who').textContent = state ? state.you.name : whoami;
    const which = screenFor(state);
    for (const name of ['door', 'lobby', 'table', 'end']) $('#screen-' + name).hidden = name !== which;
    if (which === 'lobby') drawLobby();
    if (which === 'table') drawTable();
    if (which === 'end') drawEnd();
  }

  // --- the lobby -------------------------------------------------------------

  function drawLobby() {
    const s = state;
    if (!s) return;
    const host = s.you.host;
    $('#room-code').textContent = s.code;
    $('#players').innerHTML = s.players
      .map(
        (p) => `<li class="btl-player${p.connected ? '' : ' is-away'}">
          <span class="btl-player-name">${esc(p.name)}</span>
          ${p.host ? '<span class="btl-tag">host</span>' : ''}
          ${p.watching ? '<span class="btl-tag is-away">watching</span>' : ''}
          ${p.connected ? '' : '<span class="btl-tag is-away">away</span>'}
        </li>`
      )
      .join('');

    // Every special card, as a card. The three that are always in play are
    // drawn locked, with the rule on them, rather than as switches that
    // happen to be stuck: a disabled switch invites somebody to wonder why.
    if (catalog) {
      $('#specials').innerHTML = catalog.specials
        .map((sp) => {
          const on = sp.fixed || !!s.specials[sp.key];
          const face = `<span class="sh-special-face">${esc(sp.face)}</span>`;
          const words = `<span class="sh-special-words"><b>${esc(sp.name)}</b><span>${esc(sp.say)}</span>
            <i>${sp.fixed ? 'Always in play' : on ? 'In play' : 'Left out'}</i></span>`;
          if (sp.fixed) {
            return `<div class="sh-special is-fixed is-on" title="Always in play">
              ${face}<span class="sh-lock" aria-hidden="true">&#128274;</span>${words}</div>`;
          }
          return `<button class="sh-special${on ? ' is-on' : ''}" type="button" data-act="special" data-key="${esc(sp.key)}"
            aria-pressed="${on}"${host ? '' : ' disabled'}>${face}${words}</button>`;
        })
        .join('');
    }

    // The timings. An input somebody is typing in is left alone, or a push
    // arriving mid-keystroke would put the old number back under them.
    for (const input of document.querySelectorAll('[data-timing]')) {
      if (catalog && catalog.counts) {
        input.min = String(catalog.counts.lowest);
        input.max = String(catalog.counts.highest);
      }
      if (document.activeElement !== input && s.timings) input.value = String(s.timings[input.dataset.timing]);
      input.disabled = !host;
    }

    $('#start').hidden = !host;
    $('#host-note').hidden = host;
    const people = s.players.filter((p) => !p.watching).length;
    const enough = people >= s.minPlayers;
    $('#start').disabled = !enough;
    $('#start').textContent = enough ? `Deal to ${plural(people, 'player', 'players')}` : 'Waiting for someone to join';
  }

  for (const input of document.querySelectorAll('[data-timing]')) {
    input.addEventListener('change', () => {
      const value = Number(input.value);
      if (!Number.isInteger(value)) {
        if (state && state.timings) input.value = String(state.timings[input.dataset.timing]);
        return;
      }
      say({ type: 'switchhead:settings', timing: input.dataset.timing, value });
    });
  }

  // --- the table -------------------------------------------------------------

  const GOALS = {
    win: { word: 'Get rid of your cards', say: 'Going out now takes the best place left.' },
    lose: { word: 'Hang on to them', say: 'The goal has flipped. Going out now takes the worst place left.' },
  };

  function drawTable() {
    const s = state;
    const g = s.game;
    const you = g.you;
    const swapping = g.phase === 'swap';
    const myTurn = !!you && !swapping && g.turn === you.seat && you.place == null;

    // --- the goal
    const goal = GOALS[g.goal];
    $('#goal').className = `sh-goal is-${g.goal}${g.flips !== lastFlips ? ' is-new' : ''}`;
    $('#goal-word').textContent = swapping ? 'Arrange your cards' : goal.word;
    $('#goal-say').textContent = swapping
      ? 'Swap cards between your hand and your face-up row, then press Ready.'
      : goal.say;
    lastFlips = g.flips;

    const banner = s.you.watching
      ? 'You’re watching. You’ll join the next game if there’s room.'
      : you && you.place != null
        ? `You’re out in ${ordinal(you.place)} place. Watching the rest.`
        : '';
    $('#table-banner').textContent = banner;
    $('#table-banner').hidden = !banner;

    // --- everybody else
    const away = new Set(s.players.filter((p) => !p.connected).map((p) => p.seat));
    $('#others').innerHTML = g.seats
      .filter((st) => !you || st.seat !== you.seat)
      .map((st) => {
        const turn = !swapping && g.turn === st.seat && st.place == null;
        const tags = [
          turn ? '<span class="btl-tag">to play</span>' : '',
          swapping && st.ready ? '<span class="btl-tag">ready</span>' : '',
          st.place != null ? `<span class="btl-tag is-away">${ordinal(st.place)}</span>` : '',
          away.has(st.seat) ? '<span class="btl-tag is-away">away</span>' : '',
        ].join('');
        return `<div class="panel sh-other${turn ? ' is-turn' : ''}${st.place != null ? ' is-out' : ''}">
          <p class="sh-other-name">${esc(st.name)} ${tags}</p>
          <p class="sh-other-counts">${plural(st.hand, 'card', 'cards')} in hand · ${st.down} face down</p>
          <div class="sh-row is-small">${st.up.map((c) => cardHtml(c, { small: true })).join('') || '<span class="sh-none">no face-up cards</span>'}</div>
        </div>`;
      })
      .join('');

    // --- the middle of the table
    $('#deck-say').textContent = g.deck ? plural(g.deck, 'card', 'cards') + ' to draw' : 'The deck is out';
    $('#burnt-say').textContent = g.burnt ? `${g.burnt} burnt` : 'Nothing burnt';
    $('#pile').innerHTML = g.pile.cards.length
      ? g.pile.cards.map((c, i) => cardHtml(c, { extra: ' sh-fan', style: `--i:${i}` })).join('')
      : '<span class="sh-pile-empty">Empty</span>';
    $('#pile-say').textContent = g.pile.count ? plural(g.pile.count, 'card', 'cards') + ' in the pile' : 'The pile is empty';
    $('#need').textContent = swapping ? '' : need(g);

    // --- your own
    $('#mine').hidden = !you;
    if (you) drawMine(s, g, you, swapping, myTurn);
    else $('#nudge-btn').hidden = true;

    $('#log').innerHTML = [...g.log]
      .reverse()
      .map((l) => `<li class="sh-log-row${l.kind ? ' is-' + esc(l.kind) : ''}">${esc(l.text)}</li>`)
      .join('');
  }

  // What will go on the pile, in words. The server sends the ranks it would
  // accept; this only says them out loud.
  function need(g) {
    if (g.cover) return 'The five must be covered: higher than a five, or a two.';
    const top = g.pile.top;
    if (!top) return 'The pile is empty, so anything goes.';
    const always = ['twos', 'tens'];
    if (g.specials.four) always.push('fours');
    if (g.specials.five) always.push('fives');
    const tail = ` (${always.join(', ')} always go)`;
    if (g.specials.seven && top.rank === 7) return 'After a seven: lower than a seven' + tail + '.';
    return `On ${RANK_NAME[top.rank] ? 'a ' + RANK_NAME[top.rank] : 'a ' + top.rank}: that or higher` + tail + '.';
  }

  function drawMine(s, g, you, swapping, myTurn) {
    const legal = new Set(g.legal);
    const from = you.from;

    $('#mine-head').textContent = 'Your cards';
    $('#turn-say').textContent = swapping
      ? you.ready
        ? 'Ready. Waiting for the others.'
        : 'Arrange, then say ready.'
      : you.place != null
        ? `Out: ${ordinal(you.place)}`
        : myTurn
          ? g.cover
            ? 'Your turn: cover the five'
            : 'Your turn'
          : `${g.seats[g.turn].name} to play`;
    $('#mine').classList.toggle('is-turn', myTurn);

    // Face down: backs, and only ever a count from the server. Pressable
    // when they are what you are playing from.
    const blind = myTurn && from === 'down';
    $('#down-say').textContent = you.down ? `(${you.down})` : '';
    $('#my-down').innerHTML =
      Array.from({ length: you.down }, (_, i) =>
        blind
          ? `<button class="sh-card is-back is-live" type="button" data-act="blind" data-index="${i}" aria-label="Turn over face-down card ${i + 1}"></button>`
          : backHtml()
      ).join('') || '<span class="sh-none">none left</span>';

    // Face up. Before the start they are one half of a swap; in play they
    // are pressable once the hand is empty.
    const upLive = swapping ? !you.ready : myTurn && from === 'up';
    $('#my-up').innerHTML =
      you.up
        .map((c) =>
          upLive
            ? cardHtml(c, {
                act: swapping ? 'swap-up' : 'pick',
                on: swapping ? swapPick.up === c.id : picked.has(c.id),
                dim: !swapping && !legal.has(c.rank),
              })
            : cardHtml(c)
        )
        .join('') || '<span class="sh-none">none left</span>';

    // The hand, lowest to highest, ace high: the server sends it in that
    // order and it is drawn as sent.
    const handLive = swapping ? !you.ready : myTurn && from === 'hand';
    $('#my-hand').innerHTML =
      you.hand
        .map((c) =>
          handLive
            ? cardHtml(c, {
                act: swapping ? 'swap-hand' : 'pick',
                on: swapping ? swapPick.hand === c.id : picked.has(c.id),
                dim: !swapping && !legal.has(c.rank),
              })
            : cardHtml(c, { dim: !swapping && myTurn && from !== 'hand' })
        )
        .join('') || '<span class="sh-none">empty</span>';

    // --- the buttons
    $('#ready-btn').hidden = !swapping || you.ready;
    $('#play-btn').hidden = swapping || !myTurn || from === 'down';
    $('#pickup-btn').hidden = swapping || !myTurn;
    $('#play-btn').disabled = !picked.size;
    $('#play-btn').textContent = picked.size > 1 ? `Play ${picked.size}` : 'Play';
    $('#pickup-btn').disabled = !g.pile.count;

    $('#acts-say').textContent = swapping
      ? you.ready
        ? ''
        : 'Pick a card in your hand and one in your face-up row to swap them.'
      : myTurn
        ? from === 'down'
          ? 'Your hand and face-up row are gone. Turn a face-down card over.'
          : g.goal === 'lose'
            ? 'The goal is to lose. Picking up the pile is a move.'
            : 'Pick one card, or several of one rank, and play.'
        : '';

    // Somebody has gone away and the table is waiting on them.
    const stuck = swapping
      ? s.players.find((p) => !p.connected && p.seat >= 0 && !g.seats[p.seat].ready)
      : s.players.find((p) => !p.connected && p.seat === g.turn);
    $('#nudge-btn').hidden = !stuck;
    if (stuck) {
      $('#nudge-btn').textContent = swapping ? `${stuck.name} is away: start without them` : `${stuck.name} is away: skip their turn`;
      $('#nudge-btn').dataset.id = stuck.id;
    }
  }

  // --- the finishing order ---------------------------------------------------

  function drawEnd() {
    const s = state;
    const rows = s.game.standings || [];
    const you = s.game.you;
    const mine = you && rows.find((r) => r.seat === you.seat);
    const head = rows[rows.length - 1];
    $('#end-head').textContent = mine
      ? mine.place === 1
        ? 'You went out first'
        : mine.head
          ? 'You are the Switchhead'
          : `You finished ${ordinal(mine.place)}`
      : `${head ? head.name : 'Nobody'} is the Switchhead`;
    $('#standings').innerHTML = rows
      .map(
        (r) => `<li class="btl-standing${r.place === 1 ? ' is-won' : ''}${mine && r.seat === mine.seat ? ' is-yours' : ''}">
          <span class="btl-standing-rank">${r.place}</span>
          <span class="btl-standing-name">${esc(r.name)}</span>
          <span class="btl-standing-avg">${r.head ? 'the Switchhead · ' : ''}${plural(r.pickups, 'pile', 'piles')} picked up</span>
          <b class="btl-standing-total">${r.place === 1 ? 'first' : r.head ? 'last' : ordinal(r.place)}</b>
        </li>`
      )
      .join('');
    $('#end-note').textContent = s.game.flips
      ? `The goal flipped ${plural(s.game.flips, 'time', 'times')}.`
      : 'The goal never flipped.';
    $('#end-host').hidden = !s.you.host;
    $('#end-guest').hidden = s.you.host;
  }

  // --- what a click means ----------------------------------------------------

  document.addEventListener('click', (ev) => {
    if (ev.target.closest('#who')) {
      const menu = $('#who-menu');
      menu.hidden = !menu.hidden;
      $('#who').setAttribute('aria-expanded', String(!menu.hidden));
      return;
    }
    if (!ev.target.closest('#who-menu')) $('#who-menu').hidden = true;
  });

  document.addEventListener('click', async (ev) => {
    const button = ev.target.closest('button[data-act]');
    if (!button || button.disabled) return;
    const act = button.dataset.act;
    const g = state && state.game;

    if (act === 'special') {
      say({ type: 'switchhead:settings', special: button.dataset.key, on: button.getAttribute('aria-pressed') !== 'true' });
      return;
    }
    if (act === 'pick') {
      const id = button.dataset.id;
      const all = [...g.you.hand, ...g.you.up];
      const card = all.find((c) => c.id === id);
      if (!card) return;
      if (picked.has(id)) picked.delete(id);
      else {
        // Cards go down together only if they are one rank, so picking a
        // different rank starts the choice again.
        const rank = [...picked].map((p) => all.find((c) => c.id === p)).find(Boolean)?.rank;
        if (rank !== undefined && rank !== card.rank) picked.clear();
        picked.add(id);
      }
      drawTable();
      return;
    }
    if (act === 'play') {
      if (!picked.size) return;
      say({ type: 'switchhead:play', cards: [...picked] });
      picked.clear();
      return;
    }
    if (act === 'pickup') {
      say({ type: 'switchhead:pickup' });
      picked.clear();
      return;
    }
    if (act === 'blind') {
      say({ type: 'switchhead:blind', index: Number(button.dataset.index) });
      return;
    }
    if (act === 'swap-hand' || act === 'swap-up') {
      const side = act === 'swap-hand' ? 'hand' : 'up';
      swapPick[side] = swapPick[side] === button.dataset.id ? null : button.dataset.id;
      if (swapPick.hand && swapPick.up) {
        say({ type: 'switchhead:swap', hand: swapPick.hand, up: swapPick.up });
        swapPick = { hand: null, up: null };
      }
      drawTable();
      return;
    }
    if (act === 'ready') {
      say({ type: 'switchhead:ready' });
      return;
    }
    if (act === 'nudge') {
      say({ type: 'switchhead:nudge', id: button.dataset.id });
      return;
    }
    if (act === 'signout') {
      await fetch('/api/site/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/';
      return;
    }
    if (act === 'leave') {
      say({ type: 'switchhead:leave' });
      state = null;
      history.replaceState(null, '', '/switchhead');
      render();
      return;
    }
    if (act === 'copy') {
      const link = `${location.origin}/switchhead/${state.code}`;
      try {
        await navigator.clipboard.writeText(link);
        toast('Link copied.', 'info');
      } catch {
        toast(link, 'info');
      }
    }
  });

  $('#open-room').addEventListener('click', () => say({ type: 'switchhead:create' }));

  $('#join').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const code = $('#code').value.trim().toUpperCase();
    if (code.length !== 4) return toast('A room code is four characters.');
    say({ type: 'switchhead:join', code });
  });

  $('#start').addEventListener('click', () => say({ type: 'switchhead:start' }));
  $('#rematch').addEventListener('click', () => say({ type: 'switchhead:rematch' }));
  $('#again').addEventListener('click', () => say({ type: 'switchhead:again' }));

  connect();
})();

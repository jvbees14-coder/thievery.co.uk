/* Thievery.co.uk — the battle room, as you see it.
 *
 * One socket, one snapshot, four screens. Every message from the house is the
 * whole state of the room cut down to what this player may know, and the page
 * redraws from it — there is nothing to patch and nothing to get out of step,
 * which is the same bargain the card table makes.
 *
 * The one thing worth knowing before changing anything here: **while a card
 * is being answered, this page does not have the back of it.** The server
 * sends `card.back` as null until every answer is in. That is not a courtesy
 * the page is extending to the player, it is the only reason the room means
 * anything, and no amount of care in this file could make up for the server
 * sending it early. Nothing below should ever be written as though the back
 * were available before `phase` leaves 'asking'.
 *
 * The socket is shared with the card game, which is why every message in and
 * out of here is prefixed `battle:`. Anything without that prefix is the
 * table's business and is ignored. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

  let state = null; // the last snapshot
  let catalog = null; // decks and settings, sent once when the socket opens
  let ws = null;
  let clockTimer = 0;
  let sent = false; // an answer is in flight, so the box stays shut
  let whoami = ''; // the display name, which the door needs before any room does
  let today = null; // the daily deck, as the door shows it
  // Set when another tab has taken this room over. The address bar carries
  // the room code, so a tab that quietly reconnected would walk straight back
  // in, take the room back, and the two would trade it between them forever.
  let superseded = false;

  // --- talking to the house --------------------------------------------------

  function connect() {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${scheme}//${location.host}`);

    ws.addEventListener('open', () => {
      // Who we are, which the front door needs before there is any room to
      // be in. Asked for rather than remembered: the page is the same one
      // for everybody and the account is the server's to state.
      say({ type: 'battle:hello' });

      // A code in the address is a link somebody pasted, so it is walked into
      // rather than typed. Anything else is the front door.
      const code = (location.pathname.match(/^\/battle\/([A-Za-z0-9]{4})$/) || [])[1];
      if (code) say({ type: 'battle:join', code: code.toUpperCase() });
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

      if (msg.type === 'battle:you') {
        whoami = msg.name;
        today = msg.daily || null;
        $('#who').textContent = whoami;
        drawToday();
        return;
      }
      if (msg.type === 'battle:catalog') {
        catalog = msg;
        fillPickers();
        if (browsing()) askBank(0);
        return;
      }
      if (msg.type === 'battle:bank') {
        drawBank(msg);
        return;
      }
      if (msg.type === 'battle:state') {
        const was = state && state.match ? state.match.at : -1;
        const wasPhase = state && state.match ? state.match.phase : null;
        state = msg.state;
        if (location.pathname !== '/battle/' + state.code) history.replaceState(null, '', '/battle/' + state.code);
        // A new card, or a card that has just turned over, means the box is
        // free again and whatever was typed in it is spent.
        const now = state.match ? state.match.at : -1;
        if (now !== was || (state.match && state.match.phase !== wasPhase)) sent = false;
        render();
        return;
      }
      if (msg.type === 'battle:superseded') {
        superseded = true;
        toast('You opened this room in another tab. Reload this one to take it back.');
        ws.close();
        return;
      }
      if (msg.type === 'battle:error') toast(msg.message);
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

  // One row of a board, the door's and the result screen's alike.
  const boardRow = (r) =>
    `<li class="btl-board-row${r.you ? ' is-yours' : ''}">
      <span class="btl-board-place">${ordinal(r.place)}</span>
      <span class="btl-board-name">${esc(r.name)}${r.you ? ' <i>you</i>' : ''}</span>
      <b>${r.points}</b>
    </li>`;

  // --- the lobby's pickers ---------------------------------------------------

  function fillPickers() {
    if (!catalog) return;
    // Two groups: the subjects, each gathered from every question set that
    // has anything on it, and the few decks written here. The sets the
    // subjects are drawn from are not offered on their own; which set a
    // question came from is a detail nobody revising should have to know.
    const group = (label, decks) =>
      decks.length
        ? `<optgroup label="${esc(label)}">` +
          decks
            .map((d) => `<option value="${esc(d.id)}">${esc(d.name)} (${d.count.toLocaleString('en-GB')} cards)</option>`)
            .join('') +
          '</optgroup>'
        : '';
    $('#deck').innerHTML =
      group('Subjects', catalog.decks.filter((d) => d.topic)) +
      group('Our own decks', catalog.decks.filter((d) => d.house));
    const kept = $('#bank-deck').value;
    $('#bank-deck').innerHTML = $('#deck').innerHTML;
    if (kept) $('#bank-deck').value = kept;
    $('#length').innerHTML = catalog.lengths.map((n) => `<option value="${n}">${n} cards</option>`).join('');
    $('#clock').innerHTML = catalog.clocks
      .map((n) => `<option value="${n}">${n === 0 ? 'Untimed' : n + ' seconds'}${n && n <= 15 ? ' (quick-fire)' : ''}</option>`)
      .join('');
  }

  // --- today's ten -----------------------------------------------------------

  function drawToday() {
    const d = today;
    $('#today').hidden = !d || !d.deck;
    if (!d || !d.deck) return;
    $('#today-deck').textContent = d.deck.name;
    const most = d.length * 100;
    $('#today-say').textContent = d.yours
      ? `You scored ${d.yours.points} out of ${most}, ${ordinal(d.yours.place)} of ${d.entrants}.`
      : d.entrants
        ? `${plural(d.entrants, 'person has', 'people have')} played it today. Ten cards, untimed, just you.`
        : 'Nobody has played it yet today. Ten cards, untimed, just you.';
    $('#today-play').textContent = d.yours ? 'Play again for practice' : 'Play today’s ten';
    $('#today-board').innerHTML = d.top.map(boardRow).join('');
  }

  // --- which screen ----------------------------------------------------------

  function screenFor(s) {
    if (!s) return 'door';
    if (!s.match) return 'lobby';
    return s.match.phase === 'ended' ? 'end' : 'card';
  }

  function render() {
    // The bar's name comes off the socket rather than being baked into the
    // page, because the page is the same one for everybody.
    $('#who').textContent = state ? state.you.name : whoami;

    const which = !state && browsing() ? 'bank' : screenFor(state);
    for (const name of ['door', 'bank', 'lobby', 'card', 'end']) {
      $('#screen-' + name).hidden = name !== which;
    }
    if (which === 'lobby') drawLobby();
    if (which === 'card') drawCard();
    if (which === 'end') drawEnd();
    if (which !== 'card') stopClock();
  }

  // --- the lobby -------------------------------------------------------------

  function drawLobby() {
    const s = state;
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

    // The settings are the host's. Everybody else reads them.
    for (const b of document.querySelectorAll('.btl-opt')) {
      const on = s[b.dataset.set] === b.dataset.value;
      b.classList.toggle('is-on', on);
      b.disabled = !host;
      b.setAttribute('aria-pressed', String(on));
    }
    $('#deck').value = s.presetId;
    $('#length').value = String(s.length);
    $('#clock').value = String(s.clock);
    for (const el of [$('#deck'), $('#length'), $('#clock')]) el.disabled = !host;

    $('#deck-field').hidden = s.source !== 'preset';
    $('#mine-note').hidden = s.source !== 'mine';
    const deck = catalog && catalog.decks.find((d) => d.id === s.presetId);
    $('#deck-blurb').textContent = deck
      ? deck.blurb +
        (deck.kind === 'choice'
          ? ' Multiple choice.'
          : ' Type the answer and get a mark for how close you are.')
      : '';

    // The two things a setting can quietly get wrong, said where it is set.
    $('#rule-note').hidden = s.rule !== 'sudden';
    $('#rule-note').textContent =
      s.mode === 'solo'
        ? `Alone, it is a run: how many in a row you can get before one falls under ${s.pass}.`
        : `Under ${s.pass} on a card and you are out. Marks only break a tie between people who lasted as long.`;
    const quick = s.clock && s.clock <= 15;
    const typed = s.source === 'mine' || (deck && deck.kind !== 'choice');
    $('#clock-note').textContent =
      quick && typed
        ? 'Quick-fire works best with multiple-choice subjects.'
        : 'Time limit per card.';

    $('#start').hidden = !host;
    $('#host-note').hidden = host;
    const alone = s.players.filter((p) => !p.watching).length < 2;
    $('#start').textContent =
      s.mode === 'solo' ? 'Start revising' : alone ? 'Waiting for someone to join' : 'Start';
    $('#start').disabled = s.mode === 'duel' && alone;
  }

  // --- a card ----------------------------------------------------------------

  function drawCard() {
    const s = state;
    const m = s.match;
    const open = m.phase === 'asking';

    $('#card-count').textContent =
      (s.daily ? 'Today’s ten · ' : '') + (s.rule === 'sudden' ? 'Sudden death · ' : '') + `Card ${m.at + 1} of ${m.total}`;

    // Whoever is not answering is told why, so an empty space where the box
    // should be never reads as the page having broken.
    const banner = s.you.watching
      ? 'You’re watching. You’ll join the next match if there’s room.'
      : m.inMatch && m.outAt
        ? `You went out on card ${m.outAt}. Watching the rest.`
        : !m.inMatch
          ? 'Watching this one.'
          : '';
    $('#card-banner').textContent = banner;
    $('#card-banner').hidden = !banner;
    $('#card-front').textContent = m.card.front;
    $('#card-owner').textContent = m.card.ownerName ? `From ${m.card.ownerName}'s collection` : '';
    $('#card-owner').hidden = !m.card.ownerName;

    // The hint is shown while the card is open and is no use afterwards.
    $('#card-hint').hidden = !(open && m.card.hint);
    if (open && m.card.hint) $('#card-hint').textContent = m.card.hint;

    const answered = m.yours && m.yours.done !== false;
    const mine = !!m.yours;

    // Two kinds of card, and the page shows exactly one of them. A choice
    // is picked from a list; a text card is typed into a box. Whichever is
    // not this card's kind is off the page rather than merely hidden behind
    // it, so there is no stray control to tab into.
    const choice = m.card.kind === 'choice';

    // A spectator — somebody who joined a solo run, or is waiting out a match
    // they are not in — gets neither the box nor the wait.
    const yours = open && !mine && m.playing;
    $('#answer-form').hidden = !yours || choice;
    $('#choices').hidden = !choice || !open;
    $('#waiting').hidden = !open || !mine;
    if (open && mine) {
      const outstanding = m.answered.filter((a) => !a.done).length;
      $('#waiting-on').textContent = outstanding
        ? plural(outstanding, 'one more answer', 'more answers')
        : 'the marks';
    }
    if (!open || !mine) $('#answer').value = answered ? '' : $('#answer').value;
    syncAnswerButton();

    if (choice) $('#choices').innerHTML = (m.card.options || []).map((o) => choiceRow(o, m, mine)).join('');

    // --- the reveal
    $('#reveal').hidden = open;
    if (!open) {
      // For a choice, the options stay on screen through the reveal — marked
      // up rather than swapped out, so the answer lands where the question
      // was and there is nothing to re-read.
      if (choice) $('#choices').hidden = false;
      $('#back-label').textContent = choice ? 'The right answer' : 'The answer';
      $('#card-back').textContent = m.card.back == null ? '' : m.card.back;
      $('#marks').innerHTML = m.marks.map((mk) => markRow(mk, s.you.id)).join('');
      $('#next').hidden = !s.you.host;
      $('#next-note').hidden = s.you.host;
      $('#next').textContent = m.at + 1 >= m.total ? 'See the result' : 'Next card';
    }

    // --- the running total, only once there is one
    const totals = m.totals.filter(() => m.at > 0 || !open);
    $('#running').innerHTML =
      m.at === 0 && open
        ? ''
        : [...totals]
            .sort((a, b) => b.total - a.total)
            .map((t) => `<li${t.out ? ' class="is-out"' : ''}><span>${esc(t.name)}</span><b>${t.total}</b></li>`)
            .join('');

    runClock();
  }

  // One option. While the card is open it is a button; once it is closed it
  // is a row that says whether it was the right one and whether you took it.
  function choiceRow(option, m, mine) {
    const open = m.phase === 'asking';
    const picked = m.yours && m.yours.chose === option.id;
    if (open) {
      return `<button class="btl-choice-opt${picked ? ' is-picked' : ''}" type="button"
        data-act="choose" data-option="${esc(option.id)}"${mine ? ' disabled' : ''}>
        <span class="btl-choice-text">${esc(option.text)}</span>
      </button>`;
    }
    const right = m.card.answerId === option.id;
    return `<div class="btl-choice-opt is-shut${right ? ' is-right' : ''}${picked ? ' is-picked' : ''}">
      <span class="btl-choice-text">${esc(option.text)}</span>
      <span class="btl-choice-tag">${right ? 'the answer' : picked ? 'you picked this' : ''}</span>
    </div>`;
  }

  function markRow(mk, youId) {
    const yours = mk.id === youId;
    const said = mk.text ? esc(mk.text) : '<i>nothing laid down</i>';
    const working = [];
    if (mk.missed && mk.missed.length) working.push(`missed <b>${esc(mk.missed.join(', '))}</b>`);
    if (mk.extra && mk.extra.length) working.push(`not on the card: ${esc(mk.extra.join(', '))}`);
    if (mk.flipped) working.push('<b>this says the opposite of the card</b>');
    return `<article class="btl-mark is-${esc(mk.band || 'missed')}${yours ? ' is-yours' : ''}">
      <header class="btl-mark-head">
        <span class="btl-mark-who">${esc(mk.name)}${yours ? ' <i>you</i>' : ''}${mk.out ? ' <i class="is-out">out</i>' : ''}</span>
        <span class="btl-mark-score">${mk.points == null ? 0 : mk.points}<small>/100</small></span>
      </header>
      <p class="btl-mark-said">${said}</p>
      <p class="btl-mark-band">${esc(mk.bandLabel || '')}${working.length ? ' · ' + working.join(' · ') : ''}</p>
    </article>`;
  }

  // --- the clock -------------------------------------------------------------
  //
  // Drawn from the deadline the server sent rather than counted down here, so
  // a tab that was asleep comes back showing the truth. When it reaches nought
  // the page does nothing at all: the server closes the card, and a page that
  // closed it too would be a second opinion on the one thing there must only
  // ever be one of.

  function stopClock() {
    if (clockTimer) {
      clearInterval(clockTimer);
      clockTimer = 0;
    }
  }

  function runClock() {
    stopClock();
    const m = state.match;
    if (!m || m.phase !== 'asking' || !m.deadline) {
      $('#clock-say').textContent = m && m.phase === 'asking' ? 'Untimed' : '';
      $('#clock-run').style.width = '0%';
      return;
    }
    const span = m.deadline - Date.now();
    const tick = () => {
      const left = Math.max(0, state.match.deadline - Date.now());
      $('#clock-say').textContent = `${Math.ceil(left / 1000)}s`;
      $('#clock-run').style.width = `${Math.max(0, Math.min(100, (left / span) * 100))}%`;
      if (left <= 0) stopClock();
    };
    tick();
    clockTimer = setInterval(tick, 200);
  }

  // --- the scoreboard --------------------------------------------------------

  function drawEnd() {
    const s = state;
    const rows = s.match.standings || [];
    const you = rows.find((r) => r.id === s.you.id);
    const solo = rows.length < 2;
    const won = you && you.won;
    const sudden = s.rule === 'sudden';

    $('#end-eyebrow').textContent = s.daily
      ? `Today’s ten · ${s.daily.deck}`
      : (sudden ? 'Sudden death · ' : '') + (s.match.retry ? 'The misses, again' : solo ? 'Revision' : 'The duel');
    $('#end-head').textContent = solo
      ? you
        ? sudden
          ? you.out
            ? `${plural(you.run, 'card', 'cards')} in a row`
            : `All ${you.cards}, and never out`
          : `${Math.round(you.total / Math.max(1, you.cards))} out of 100, on average`
        : 'Match over'
      : won
        ? rows.filter((r) => r.won).length > 1
          ? 'A dead heat'
          : 'You took it'
        : `${rows.find((r) => r.won)?.name || 'Nobody'} took it`;

    $('#standings').innerHTML = rows
      .map(
        (r, i) => `<li class="btl-standing${r.won ? ' is-won' : ''}${r.id === s.you.id ? ' is-yours' : ''}">
          <span class="btl-standing-rank">${i + 1}</span>
          <span class="btl-standing-name">${esc(r.name)}</span>
          <span class="btl-standing-avg">${
            sudden ? (r.out ? `out on card ${r.out}` : 'still standing') + ' · ' : ''
          }${Math.round(r.total / Math.max(1, r.cards))} avg</span>
          <b class="btl-standing-total">${r.total}</b>
        </li>`
      )
      .join('');

    $('#end-note').textContent = solo
      ? 'Every card you answered is below, with the right answer.'
      : sudden
        ? 'Whoever lasts longest wins. Marks break a tie, then time.'
        : 'Highest marks win. Time only breaks a tie.';

    // What happens next is the host's to say.
    const host = s.you.host;
    $('#end-host').hidden = !host;
    $('#end-guest').hidden = host;
    $('#retry').hidden = !s.match.missed;
    $('#retry').textContent = s.match.missed
      ? `Go over the ${plural(s.match.missed, 'miss', 'misses')}`
      : '';
    $('#rematch').textContent = s.daily ? 'Play today’s ten again' : 'Rematch';

    // The day's board, and whether this run went on it.
    $('#end-daily').hidden = !s.daily;
    if (s.daily) {
      $('#end-board').innerHTML = s.daily.board.map(boardRow).join('') ||
        '<li class="btl-board-row"><span></span><span>Nobody yet.</span><b></b></li>';
      const on = s.daily.board.find((r) => r.you);
      $('#end-daily-note').textContent = s.match.retry
        ? 'Practice rounds don’t go on the board.'
        : on
          ? `Your first go of the day stands at ${ordinal(on.place)}. Later goes are practice.`
          : 'Only your first try each day goes on the board.';
    }

    $('#review').innerHTML = (s.match.review || [])
      .map(
        (c) => `<article class="panel btl-review-card">
          <p class="btl-review-front">${esc(c.front)}</p>
          <p class="btl-review-back"><b>The back:</b> ${esc(c.back)}</p>
          <p class="btl-review-said"><b>You said:</b> ${c.text ? esc(c.text) : '<i>nothing</i>'} · ${c.points}/100</p>
        </article>`
      )
      .join('');
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
    const button = ev.target.closest('button[data-act], button[data-set]');
    if (!button) return;

    if (button.dataset.set) {
      say({ type: 'battle:settings', [button.dataset.set]: button.dataset.value });
      return;
    }

    const act = button.dataset.act;
    if (act === 'choose') {
      if (sent) return;
      sent = true;
      // Every option goes dead at once. A second click while the first is in
      // flight would be refused, and being refused for something you did not
      // mean to do twice is a poor way to find that out.
      for (const b of $('#choices').querySelectorAll('button')) b.disabled = true;
      say({ type: 'battle:answer', option: button.dataset.option });
      return;
    }
    if (act === 'signout') {
      await fetch('/api/site/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/';
      return;
    }
    if (act === 'leave') {
      say({ type: 'battle:leave' });
      state = null;
      history.replaceState(null, '', '/battle');
      // Asked again, so the door's board includes whatever was just played.
      say({ type: 'battle:hello' });
      render();
      return;
    }
    if (act === 'daily') {
      say({ type: 'battle:daily' });
      return;
    }
    if (act === 'copy') {
      const link = `${location.origin}/battle/${state.code}`;
      try {
        await navigator.clipboard.writeText(link);
        toast('Link copied.', 'info');
      } catch {
        toast(link, 'info');
      }
    }
  });

  $('#open-room').addEventListener('click', () => say({ type: 'battle:create' }));

  // --- the question list -----------------------------------------------------
  //
  // Only reachable from the front door, at #questions. The server sends a
  // page of twenty-five at a time and refuses the lot to anybody in a match.

  const browsing = () => location.hash === '#questions';
  let bankShown = 0;
  let bankTimer = 0;

  function askBank(offset) {
    if (!catalog || !$('#bank-deck').value) return;
    say({ type: 'battle:browse', deck: $('#bank-deck').value, query: $('#bank-query').value.trim(), offset });
  }

  const LETTER = (i) => String.fromCharCode(65 + i);

  function bankItem(c, kind) {
    if (kind === 'choice') {
      return `<li class="btl-q">
        <p class="btl-q-front">${esc(c.front)}</p>
        <ol class="btl-q-options">${c.options.map((o, i) => `<li><b>${LETTER(i)}</b> ${esc(o)}</li>`).join('')}</ol>
        <details class="btl-q-answer"><summary>Show answer</summary><p>${LETTER(c.answer)}. ${esc(c.options[c.answer])}</p></details>
      </li>`;
    }
    return `<li class="btl-q">
      <p class="btl-q-front">${esc(c.front)}</p>
      ${c.hint ? `<p class="hint">Hint: ${esc(c.hint)}</p>` : ''}
      <details class="btl-q-answer"><summary>Show answer</summary><p>${esc(c.back)}</p></details>
    </li>`;
  }

  function drawBank(msg) {
    // A reply to a search that has since been typed over is thrown away.
    if (msg.deck !== $('#bank-deck').value || msg.query !== $('#bank-query').value.trim()) return;
    const html = msg.cards.map((c) => bankItem(c, msg.kind)).join('');
    if (msg.offset === 0) {
      $('#bank-list').innerHTML = html;
      bankShown = 0;
    } else {
      $('#bank-list').insertAdjacentHTML('beforeend', html);
    }
    bankShown = msg.offset + msg.cards.length;
    $('#bank-count').textContent = msg.total
      ? `${msg.total.toLocaleString('en-GB')} question${msg.total === 1 ? '' : 's'}${msg.query ? ` matching \u201c${msg.query}\u201d` : ''}. Showing ${bankShown.toLocaleString('en-GB')}.`
      : 'No questions match that.';
    $('#bank-more').hidden = bankShown >= msg.total;
  }

  $('#bank-deck').addEventListener('change', () => askBank(0));
  $('#bank-query').addEventListener('input', () => {
    clearTimeout(bankTimer);
    bankTimer = setTimeout(() => askBank(0), 250);
  });
  $('#bank-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    askBank(0);
  });
  $('#bank-more').addEventListener('click', () => askBank(bankShown));
  window.addEventListener('hashchange', () => {
    render();
    if (browsing()) askBank(0);
  });

  $('#join').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const code = $('#code').value.trim().toUpperCase();
    if (code.length !== 4) return toast('A room code is four characters.');
    say({ type: 'battle:join', code });
  });

  $('#start').addEventListener('click', () => say({ type: 'battle:start' }));
  $('#next').addEventListener('click', () => say({ type: 'battle:next' }));
  $('#again').addEventListener('click', () => say({ type: 'battle:again' }));
  $('#rematch').addEventListener('click', () => say({ type: 'battle:rematch' }));
  $('#retry').addEventListener('click', () => say({ type: 'battle:retry' }));

  for (const id of ['#deck', '#length', '#clock']) {
    $(id).addEventListener('change', (ev) => {
      const key = ev.target.dataset.set;
      const raw = ev.target.value;
      say({ type: 'battle:settings', [key]: key === 'presetId' ? raw : Number(raw) });
    });
  }

  $('#answer-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (sent) return;
    // An empty box is not an answer, and laying one down costs the card. It
    // is almost always a stray Return rather than somebody deciding to throw
    // one away, and there is no way back from it — so it simply does not go.
    if (!$('#answer').value.trim()) return;
    sent = true;
    $('#answer-form').querySelector('button').disabled = true;
    say({ type: 'battle:answer', text: $('#answer').value });
    $('#answer').value = '';
  });

  // Enter lays the answer down; shift-enter is a new line, because some backs
  // really are two lines long.
  // The button follows the box, so an empty answer never looks like one that
  // is ready to go.
  $('#answer').addEventListener('input', syncAnswerButton);

  function syncAnswerButton() {
    const button = $('#answer-form').querySelector('button');
    button.disabled = sent || !$('#answer').value.trim();
  }

  $('#answer').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      $('#answer-form').requestSubmit();
    }
  });

  // --- off we go -------------------------------------------------------------

  connect();
})();

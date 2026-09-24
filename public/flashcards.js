/* Thievery.co.uk — the flashcards room, as you see it.
 *
 * One snapshot drives the whole page. Every call that changes something
 * returns the same shape the page was built from, so there is no patching of
 * state in here and nothing to get out of step: the server says what is true
 * and the page is drawn again.
 *
 * The one thing drawn from nothing is the print sheet, which is assembled
 * only when the printer asks for it. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

  let state = null; // the last snapshot
  let editing = null; // the id of the card the make-form is re-cutting
  let panel = null; // the admin overview, when it has been fetched
  const selected = new Set(); // cards ticked for printing

  // --- talking to the house --------------------------------------------------

  async function api(path, { method = 'GET', body = null } = {}) {
    const res = await fetch('/api/flashcards/' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      // A session that has expired underneath us is not an error worth a
      // message; the door is the answer.
      if (res.status === 401) location.href = '/flashcards';
      throw new Error(payload.error || 'Something went wrong. Try again.');
    }
    return payload;
  }

  let toastTimer = 0;
  function toast(message, kind = 'info') {
    const el = $('#toast');
    el.textContent = message;
    el.className = 'toast' + (kind === 'info' ? ' info' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
  }

  // Everything that can fail goes through here, so a thrown message always
  // lands in front of the person who caused it rather than in the console.
  const guard = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  // --- small formatters ------------------------------------------------------

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function when(ts) {
    const secs = Math.round((Date.now() - ts) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return plural(Math.floor(secs / 60), 'minute', 'minutes') + ' ago';
    if (secs < 86400) return plural(Math.floor(secs / 3600), 'hour', 'hours') + ' ago';
    if (secs < 2592000) return plural(Math.floor(secs / 86400), 'day', 'days') + ' ago';
    return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const mintNo = (n) => 'No. ' + String(n).padStart(4, '0');

  // A card's front, cut down to a headline. Banners are read at a glance and a
  // hundred-character question laid across the screen is not a glance. The cut
  // falls back to the last space, because a word broken in half reads as a
  // fault rather than as an abbreviation.
  const snip = (text, n = 46) => {
    const s = String(text);
    if (s.length <= n) return s;
    const cut = s.slice(0, n - 1);
    const space = cut.lastIndexOf(' ');
    return (space > n * 0.6 ? cut.slice(0, space) : cut.trimEnd()) + '…';
  };

  // The worth of a handful of cards, and the best rarity among them.
  const worthOf = (cards) => cards.reduce((n, c) => n + c.value, 0);
  const bestRarity = (cards) =>
    cards.map((c) => c.rarity).sort((a, b) => RARITY_ORDER.indexOf(b) - RARITY_ORDER.indexOf(a))[0] || 'common';

  // --- banners ---------------------------------------------------------------
  // The table's banners, brought through the door: a band slashes across the
  // screen and the word slams onto it. style.css draws and times the whole
  // thing, so what is here is the queue and the three moments this room has to
  // announce — a card struck, a swap settled, a card burnt.
  //
  // None of them wait for a keypress, unlike the one that ends a round at the
  // table. Nothing here is the end of anything, and after a strike the card
  // itself is what you came to look at, so the band says its piece and leaves.

  const BANNER_MS = 2600; // how long one holds the screen, arrival and exit included
  const bannerQueue = [];
  let bannerBusy = false;
  let bannerTimer = 0;
  let bannerThen = null; // what the room does once the screen is its own again

  /**
   * Announce something. `ink` is the colour the band comes up in — the
   * rarity's own, for a strike — and `then` runs when the queue has emptied,
   * which is how the reveal knows to wait its turn.
   */
  function banner(kind, title, sub, { ink = null, then = null } = {}) {
    bannerQueue.push({ kind, title, sub, ink });
    if (then) bannerThen = then;
    if (!bannerBusy) nextBanner();
  }

  function nextBanner() {
    clearTimeout(bannerTimer);
    const el = $('#banner');
    const b = bannerQueue.shift();
    if (!b) {
      bannerBusy = false;
      el.hidden = true;
      el.className = 'banner';
      const then = bannerThen;
      bannerThen = null;
      if (then) then();
      return;
    }
    bannerBusy = true;
    el.hidden = true;
    el.className = `banner fc ${b.kind}`;
    el.style.setProperty('--r-ink', b.ink || 'var(--brass)');
    // The stylesheet times the arrive-hold-leave to the life of the banner
    // rather than guessing at it, so it has to be told what that is.
    el.style.setProperty('--banner-life', `${BANNER_MS}ms`);
    el.innerHTML =
      `<div class="banner-inner"><div class="banner-title">${esc(b.title)}</div><div class="banner-sub">${esc(b.sub)}</div></div>`;
    void el.offsetWidth; // restart the CSS animation
    el.hidden = false;
    bannerTimer = setTimeout(nextBanner, BANNER_MS);
  }

  // --- drawing a card --------------------------------------------------------

  function cardHtml(card, { ops = true } = {}) {
    const tags = (card.tags || []).map((t) => `<span class="fc-tag">${esc(t)}</span>`).join('');
    const title = card.title ? `<p class="fc-title">${esc(card.title)}</p>` : '';
    const hint = card.hint ? `<p class="fc-hint">Hint: ${esc(card.hint)}</p>` : '';
    const flavour = card.flavour ? `<p class="fc-flavour">${esc(card.flavour)}</p>` : '';

    const operations = ops
      ? `<div class="fc-ops">
           ${card.pooled
             ? `<button class="fc-op on" data-act="withdraw" data-id="${card.id}">On offer: withdraw</button>`
             : `<button class="fc-op" data-act="offer" data-id="${card.id}">Offer</button>
                <button class="fc-op" data-act="edit" data-id="${card.id}">Edit</button>
                <button class="fc-op danger" data-act="burn" data-id="${card.id}">Delete</button>`}
         </div>`
      : '';

    return `
      <article class="fc-card${card.pooled ? ' is-pooled' : ''}" data-rarity="${esc(card.rarity)}" data-id="${card.id}">
        <div class="fc-flip">
          <div class="fc-face fc-front" data-act="turn">
            <div class="fc-cardtop">
              <span class="fc-rarity">${esc(card.rarityLabel)}</span>
              <span class="fc-worth">${card.value}</span>
            </div>
            ${title}
            <p class="fc-text">${esc(card.front)}</p>
            ${hint}
            <div class="fc-cardfoot">
              <span>${mintNo(card.mint)}</span>
              ${card.category ? `<span class="fc-sep">&middot;</span><span>${esc(card.category)}</span>` : ''}
              ${tags}
            </div>
          </div>
          <div class="fc-face fc-back" data-act="turn">
            <div class="fc-cardtop">
              <span class="fc-rarity">Answer</span>
              <span class="fc-worth">craft ${card.craft}</span>
            </div>
            <p class="fc-text">${esc(card.back)}</p>
            ${flavour}
            <div class="fc-cardfoot">
              <span>${esc(card.authorName || 'anon')}</span>
              <span class="fc-sep">&middot;</span>
              <span>${card.traded ? plural(card.traded, 'trade', 'trades') : 'never traded'}</span>
            </div>
          </div>
        </div>
        ${operations}
      </article>`;
  }

  // --- the collection --------------------------------------------------------

  function drawLedger() {
    const s = state.stats;
    const rarityStats = RARITY_ORDER.filter((r) => s.byRarity[r])
      .map((r) => `<div class="fc-stat" data-rarity="${r}" style="--r-ink:${state.rarities[r].ink}">
                     <b>${s.byRarity[r]}</b><span>${esc(state.rarities[r].label)}</span></div>`)
      .join('');
    $('#ledger').innerHTML = `
      <div class="fc-stat"><b>${s.count}</b><span>Cards held</span></div>
      <div class="fc-stat"><b>${s.worth.toLocaleString('en-GB')}</b><span>Total value</span></div>
      <div class="fc-stat"><b>${state.pool.filter((p) => p.mine).length}</b><span>On offer</span></div>
      ${rarityStats}`;
  }

  function visibleCards() {
    const term = $('#search').value.trim().toLowerCase();
    const rarity = $('#filter-rarity').value;
    let list = state.cards.filter((c) => {
      if (rarity && c.rarity !== rarity) return false;
      if (!term) return true;
      return [c.front, c.back, c.category, c.title, ...(c.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
    const sort = $('#sort').value;
    const rank = (c) => RARITY_ORDER.indexOf(c.rarity);
    list = list.slice().sort((a, b) => {
      if (sort === 'old') return a.created - b.created;
      if (sort === 'value') return b.value - a.value;
      if (sort === 'craft') return b.craft - a.craft;
      if (sort === 'rarity') return rank(b) - rank(a) || b.value - a.value;
      if (sort === 'mint') return a.mint - b.mint;
      return b.created - a.created;
    });
    return list;
  }

  function drawCollection() {
    drawLedger();
    const list = visibleCards();
    $('#cards').innerHTML = list.map((c) => cardHtml(c)).join('');
    $('#cards-empty').hidden = list.length > 0;
    if (!state.cards.length) {
      $('#cards-empty').innerHTML =
        'Nothing in the collection yet. <button class="linkish" data-goto="make" type="button">Make a card</button>.';
    } else if (!list.length) {
      $('#cards-empty').textContent = 'Nothing matches that.';
    }
  }

  // --- the appraisal dial ----------------------------------------------------

  const PART_LABEL = {
    depth: 'Depth', variety: 'Variety', extras: 'Extras',
    craftsmanship: 'Craft', polish: 'Polish',
  };
  const PART_MAX = { depth: 36, variety: 16, extras: 16, craftsmanship: 20, polish: 12 };

  function drawAppraisal(verdict) {
    $('#craft-num').textContent = verdict.craft;
    $('#craft-fill').style.width = verdict.craft + '%';
    $('#craft-parts').innerHTML = Object.entries(verdict.parts)
      .map(([key, value]) => `
        <li><span>${PART_LABEL[key]}</span>
          <span class="fc-bar-track"><span class="fc-bar-fill" style="width:${Math.round((value / PART_MAX[key]) * 100)}%"></span></span>
          <b>${value}/${PART_MAX[key]}</b></li>`)
      .join('');
    $('#odds').innerHTML = RARITY_ORDER.filter((r) => r !== 'mythic')
      .map((r) => `
        <li style="--r-ink:${state.rarities[r].ink}"><span>${esc(state.rarities[r].label)}</span>
          <span class="fc-bar-track"><span class="fc-bar-fill" style="width:${Math.min(100, verdict.odds[r] * 1.6)}%"></span></span>
          <b>${verdict.odds[r]}%</b></li>`)
      .join('');
  }

  // The appraisal is a round trip on purpose — the algorithm lives on the
  // server and is the same one that will strike the card — so it is held back
  // until the typing stops.
  let appraiseTimer = 0;
  function scheduleAppraisal() {
    clearTimeout(appraiseTimer);
    appraiseTimer = setTimeout(async () => {
      const content = formContent();
      if (!content.front && !content.back) return drawAppraisal({ craft: 0, parts: { depth: 0, variety: 0, extras: 0, craftsmanship: 0, polish: 0 }, odds: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 } });
      try {
        drawAppraisal(await api('appraise', { method: 'POST', body: content }));
      } catch { /* an appraisal that does not arrive is not worth a message */ }
    }, 260);
  }

  function formContent() {
    return {
      front: $('#f-front').value,
      back: $('#f-back').value,
      hint: $('#f-hint').value,
      category: $('#f-category').value,
      tags: $('#f-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
    };
  }

  function countUp() {
    $('#c-front').textContent = `${$('#f-front').value.length}/${state.limits.front}`;
    $('#c-back').textContent = `${$('#f-back').value.length}/${state.limits.back}`;
  }

  function clearForm() {
    for (const id of ['f-front', 'f-back', 'f-hint', 'f-category', 'f-tags']) $('#' + id).value = '';
    editing = null;
    $('#edit-note').hidden = true;
    $('#mint').textContent = 'Create card';
    countUp();
    scheduleAppraisal();
  }

  function loadForEdit(card) {
    $('#f-front').value = card.front;
    $('#f-back').value = card.back;
    $('#f-hint').value = card.hint || '';
    $('#f-category').value = card.category || '';
    $('#f-tags').value = (card.tags || []).join(', ');
    editing = card.id;
    $('#edit-note').hidden = false;
    $('#edit-note').textContent = `Editing ${mintNo(card.mint)}. Its rarity won’t change.`;
    $('#mint').textContent = 'Save changes';
    showTab('make');
    countUp();
    scheduleAppraisal();
  }

  // --- the trading post ------------------------------------------------------

  function offerHtml(entry) {
    return `
      <div class="fc-offer${entry.mine ? ' is-mine' : ''}" data-rarity="${esc(entry.rarity)}">
        <div class="fc-offer-main">
          <div class="fc-offer-front">${esc(entry.front)}</div>
          <div class="fc-offer-meta">
            ${esc(entry.rarityLabel)} &middot; ${mintNo(entry.mint)} &middot;
            ${entry.mine ? 'yours' : esc(entry.ownerName)} &middot; laid ${when(entry.since)}
          </div>
        </div>
        <div class="fc-offer-worth">${entry.value}</div>
        ${entry.mine ? `<button class="fc-op" data-act="withdraw" data-id="${entry.id}">Withdraw</button>` : ''}
      </div>`;
  }

  function tradeHtml(trade) {
    const line = (kind, list) => `
      <div class="fc-trade-line ${kind}">
        <em>${kind === 'gave' ? 'Gave' : 'Got'}</em>
        <ul>${list.map((c) => `<li>${esc(c.front)} <span class="fc-offer-worth">${c.value}</span></li>`).join('')}</ul>
      </div>`;
    return `
      <div class="fc-trade">
        <div class="fc-trade-when">${when(trade.at)} &middot; with ${esc(trade.withName)}</div>
        ${line('gave', trade.gave)}
        ${line('got', trade.got)}
      </div>`;
  }

  function drawTrade() {
    const mine = state.pool.filter((p) => p.mine);
    const theirs = state.pool.filter((p) => !p.mine);
    $('#my-offers').innerHTML = mine.map(offerHtml).join('');
    $('#my-offers-empty').hidden = mine.length > 0;
    $('#mine-count').textContent = mine.length ? plural(mine.length, 'card', 'cards') : '';

    $('#pool').innerHTML = theirs.map(offerHtml).join('');
    $('#pool-empty').hidden = theirs.length > 0;
    $('#pool-count').textContent = theirs.length ? plural(theirs.length, 'card', 'cards') + ' from others' : '';

    $('#trades').innerHTML = state.trades.map(tradeHtml).join('');
    $('#trades-empty').hidden = state.trades.length > 0;
  }

  // --- the print picker ------------------------------------------------------

  function drawPicker() {
    // A card on the table still belongs to you until it goes, so it can still
    // be printed; nothing is filtered out here.
    $('#print-pick').innerHTML = state.cards
      .map((c) => `
        <label class="fc-pick-item${selected.has(c.id) ? ' is-on' : ''}" data-rarity="${esc(c.rarity)}">
          <input type="checkbox" data-id="${c.id}"${selected.has(c.id) ? ' checked' : ''} />
          <span class="fc-pick-body">
            <span class="fc-pick-front">${esc(c.front)}</span>
            <span class="fc-pick-meta">${esc(c.rarityLabel)} &middot; ${mintNo(c.mint)} &middot; ${c.value}</span>
          </span>
        </label>`)
      .join('');
    countSheets();
  }

  function countSheets() {
    const n = selected.size;
    const sheets = Math.ceil(n / 9);
    $('#p-count').textContent = `${n} selected · ${sheets} sheet${sheets === 1 ? '' : 's'}`;
    $('#p-go').disabled = n === 0;
  }

  function printCardHtml(card, side, opts) {
    const stamp = opts.stamp
      ? `<div class="fc-print-foot"><b>thievery.co.uk</b><span>${mintNo(card.mint)}</span></div>`
      : '';
    if (side === 'front') {
      return `
        <div class="fc-print-card front" data-rarity="${esc(card.rarity)}">
          <div class="fc-print-top">
            <span class="fc-print-rarity">${esc(card.rarityLabel)}</span>
            <span class="fc-print-worth">${card.value}</span>
          </div>
          ${card.title ? `<p class="fc-print-name">${esc(card.title)}</p>` : ''}
          <p class="fc-print-text">${esc(card.front)}</p>
          ${opts.hints && card.hint ? `<p class="fc-print-hint">Hint: ${esc(card.hint)}</p>` : ''}
          ${stamp}
        </div>`;
    }
    return `
      <div class="fc-print-card back" data-rarity="${esc(card.rarity)}">
        <div class="fc-print-top">
          <span class="fc-print-rarity">${esc(card.category || 'Answer')}</span>
          <span class="fc-print-worth">${esc(card.authorName || '')}</span>
        </div>
        <p class="fc-print-text">${esc(card.back)}</p>
        ${card.flavour ? `<p class="fc-print-flavour">${esc(card.flavour)}</p>` : ''}
        ${stamp}
      </div>`;
  }

  /**
   * Lay the chosen cards out nine to a sheet.
   *
   * The backs page is the fiddly part. A sheet fed through again comes back
   * mirrored left to right, so a back printed in the same column as its front
   * lands behind the wrong card. Reversing each row of three on the backs page
   * cancels that out, which is what the loop below is doing.
   */
  function buildSheet() {
    const opts = {
      backs: $('#p-backs').checked,
      marks: $('#p-marks').checked,
      hints: $('#p-hints').checked,
      stamp: $('#p-stamp').checked,
    };
    const cards = state.cards.filter((c) => selected.has(c.id));
    const pages = [];
    const blank = '<div class="fc-print-card is-blank"></div>';

    for (let i = 0; i < cards.length; i += 9) {
      const nine = cards.slice(i, i + 9);
      pages.push(`<div class="fc-page${opts.marks ? ' marks' : ''}">
        ${nine.map((c) => printCardHtml(c, 'front', opts)).join('')}
      </div>`);

      if (!opts.backs) continue;
      const mirrored = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 2; col >= 0; col--) {
          const card = nine[row * 3 + col];
          mirrored.push(card ? printCardHtml(card, 'back', opts) : blank);
        }
      }
      pages.push(`<div class="fc-page${opts.marks ? ' marks' : ''}">${mirrored.join('')}</div>`);
    }
    $('#sheet').innerHTML = pages.join('');
  }

  // --- the panel -------------------------------------------------------------

  function drawPanel() {
    if (!panel) return;
    const s = panel.stats;
    $('#panel-stats').innerHTML = `
      <div class="fc-stat"><b>${s.accounts}</b><span>Accounts</span></div>
      <div class="fc-stat"><b>${s.cards}</b><span>Cards in play</span></div>
      <div class="fc-stat"><b>${s.minted}</b><span>Ever made</span></div>
      <div class="fc-stat"><b>${s.pooled}</b><span>On offer</span></div>
      <div class="fc-stat"><b>${s.trades}</b><span>Trades logged</span></div>
      <div class="fc-stat"><b>${s.worth.toLocaleString('en-GB')}</b><span>Total value</span></div>
      ${RARITY_ORDER.filter((r) => s.byRarity[r])
        .map((r) => `<div class="fc-stat" data-rarity="${r}" style="--r-ink:${state.rarities[r].ink}">
                       <b>${s.byRarity[r]}</b><span>${esc(state.rarities[r].label)}</span></div>`)
        .join('')}`;

    $('#usernames').innerHTML = panel.users.map((u) => `<option value="${esc(u.username)}"></option>`).join('');
    $('#acct-count').textContent = plural(panel.users.length, 'account', 'accounts');
    drawAccounts();

    $('#all-trades').innerHTML = panel.trades.length
      ? panel.trades
          .map((t) => `
            <div class="fc-trade">
              <div class="fc-trade-when">${when(t.at)} &middot; ${esc(t.a.name)} &harr; ${esc(t.b.name)} &middot; ${t.value.offered} for ${t.value.returned}</div>
              <div class="fc-trade-line gave"><em>${esc(t.a.name)}</em><ul>${t.a.gave.map((c) => `<li>${esc(c.front)} <span class="fc-offer-worth">${c.value}</span></li>`).join('')}</ul></div>
              <div class="fc-trade-line got"><em>${esc(t.b.name)}</em><ul>${t.b.gave.map((c) => `<li>${esc(c.front)} <span class="fc-offer-worth">${c.value}</span></li>`).join('')}</ul></div>
            </div>`)
          .join('')
      : '<p class="fc-empty">Nothing traded yet.</p>';
  }

  function drawAccounts() {
    const term = $('#acct-search').value.trim().toLowerCase();
    const list = panel.users.filter(
      (u) => !term || u.username.includes(term) || u.displayName.toLowerCase().includes(term)
    );
    $('#accounts').innerHTML = list
      .map((u) => `
        <button class="fc-acct${u.admin ? ' is-admin' : ''}${u.disabled ? ' is-off' : ''}" data-act="acct" data-id="${u.id}" type="button">
          <span class="fc-acct-main">
            <span class="fc-acct-name">${esc(u.displayName)} <span class="fc-acct-meta">@${esc(u.username)}</span>${u.admin ? ' &starf;' : ''}${u.disabled ? ' &mdash; suspended' : ''}</span>
            <span class="fc-acct-meta">${plural(u.cards, 'card', 'cards')} &middot; ${u.pooled} offered &middot; ${u.mythics} mythic &middot; seen ${when(u.lastSeen)}</span>
          </span>
          <span class="fc-acct-worth">${u.worth.toLocaleString('en-GB')}</span>
        </button>`)
      .join('');
  }

  const loadPanel = guard(async () => {
    panel = await api('admin/overview');
    drawPanel();
  });

  // --- modals ----------------------------------------------------------------

  // The body is replaced rather than refilled: a modal attaches its own click
  // handler to it, and refilling would leave the previous one listening.
  function openModal(html) {
    const fresh = document.createElement('div');
    fresh.id = 'modal-body';
    fresh.innerHTML = html;
    $('#modal-body').replaceWith(fresh);
    $('#modal').hidden = false;
  }
  const closeModal = () => { $('#modal').hidden = true; };

  /**
   * A question the room asks in its own voice.
   *
   * The browser's own confirm box works perfectly well and looks like it
   * belongs to a different website — grey, square, and system-font in a room
   * that is neither. Since every one of these is about something that cannot
   * be undone, it is worth the reader actually reading it.
   *
   * Resolves true only if they press the one button that says yes. Escape,
   * the dark behind it and the other button all mean no.
   */
  function ask(question, detail, yesLabel) {
    return new Promise((resolve) => {
      const el = $('#confirm');
      el.innerHTML = `
        <div class="fc-confirm-box" role="alertdialog" aria-modal="true" aria-label="${esc(question)}">
          <h3>${esc(question)}</h3>
          <p class="fc-note">${esc(detail)}</p>
          <div class="fc-actions">
            <button class="btn" data-answer="yes" type="button">${esc(yesLabel)}</button>
            <button class="btn ghost" data-answer="no" type="button">Keep it</button>
          </div>
        </div>`;
      el.hidden = false;
      $('#confirm [data-answer="no"]').focus();

      const done = (answer) => {
        el.hidden = true;
        el.innerHTML = '';
        el.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey, true);
        resolve(answer);
      };
      const onClick = (ev) => {
        if (ev.target.closest('[data-answer="yes"]')) return done(true);
        // The dark behind the box counts as backing out, like the modal.
        if (ev.target === el || ev.target.closest('[data-answer="no"]')) return done(false);
      };
      const onKey = (ev) => {
        if (ev.key !== 'Escape') return;
        ev.stopPropagation(); // and it does not also shut whatever is underneath
        done(false);
      };
      el.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
    });
  }

  function accountModal() {
    const u = state.user;
    openModal(`
      <h3>Account settings</h3>
      <form id="acct-form" class="fc-form" autocomplete="off">
        <div class="field">
          <label for="a-display">Display name</label>
          <input id="a-display" maxlength="24" value="${esc(u.displayName)}" />
        </div>
        <div class="field">
          <label for="a-user">Username</label>
          <input id="a-user" maxlength="20" value="${esc(u.username)}" autocapitalize="none" spellcheck="false" />
        </div>
        <div class="field">
          <label for="a-new">New password <span class="opt">optional</span></label>
          <input id="a-new" type="password" maxlength="200" autocomplete="new-password" />
        </div>
        <div class="field">
          <label for="a-cur">Current password <span class="opt">to change username or password</span></label>
          <input id="a-cur" type="password" maxlength="200" autocomplete="current-password" />
        </div>
        <button class="btn primary" type="submit">Save</button>
        <p class="fc-note">Changing your password signs you out on your other devices.</p>
      </form>`);

    $('#acct-form').addEventListener('submit', guard(async (ev) => {
      ev.preventDefault();
      const body = { displayName: $('#a-display').value, currentPassword: $('#a-cur').value };
      if ($('#a-user').value.toLowerCase() !== u.username) body.username = $('#a-user').value;
      if ($('#a-new').value) body.password = $('#a-new').value;
      state = await api('account', { method: 'POST', body });
      closeModal();
      drawAll();
      toast('Saved.', 'info');
    }));
  }

  const adminAccountModal = guard(async (id) => {
    const detail = await api('admin/users/' + encodeURIComponent(id));
    const a = detail.account;
    openModal(`
      <h3>${esc(a.displayName)} <span class="fc-acct-meta">@${esc(a.username)}</span></h3>
      <p class="fc-note">
        Opened ${when(a.created)} &middot; last seen ${when(a.lastSeen)} &middot;
        ${plural(a.sessions, 'signed-in device', 'signed-in devices')} &middot;
        ${plural(detail.cards.length, 'card', 'cards')}
      </p>
      <form id="ad-form" class="fc-form" autocomplete="off">
        <div class="field">
          <label for="ad-display">Display name</label>
          <input id="ad-display" maxlength="24" value="${esc(a.displayName)}" />
        </div>
        <div class="field">
          <label for="ad-user">Username</label>
          <input id="ad-user" maxlength="20" value="${esc(a.username)}" autocomplete="off" data-lpignore="true" data-1p-ignore autocapitalize="none" spellcheck="false"${a.admin ? ' disabled' : ''} />
          ${a.admin ? '<p class="hint">The admin account is named by THIEVERY_ADMIN_USERNAME, not from here.</p>' : ''}
        </div>
        <div class="field">
          <label for="ad-pass">Set a new password <span class="opt">optional</span></label>
          <input id="ad-pass" type="password" maxlength="200" autocomplete="new-password" data-lpignore="true" data-1p-ignore />
          <p class="hint">Setting one signs the account out everywhere.</p>
        </div>
        <div class="field">
          <label for="ad-note">Your note <span class="opt">never shown to them</span></label>
          <textarea id="ad-note" rows="2" maxlength="500">${esc(a.note)}</textarea>
        </div>
        ${a.admin ? '' : `<label class="fc-check"><input id="ad-off" type="checkbox"${a.disabled ? ' checked' : ''} /> Suspended &mdash; cannot sign in</label>`}
        <div class="fc-actions">
          <button class="btn primary" type="submit">Save</button>
          <button class="btn ghost" data-act="ad-signout" type="button">Sign out everywhere</button>
        </div>
      </form>
      <div class="fc-danger-zone">
        <h4 class="fc-h4">Their cards</h4>
        <div class="fc-offers">
          ${detail.cards.length
            ? detail.cards.map((c) => `
                <div class="fc-offer" data-rarity="${esc(c.rarity)}">
                  <div class="fc-offer-main">
                    <div class="fc-offer-front">${esc(c.front)}</div>
                    <div class="fc-offer-meta">${esc(c.rarityLabel)} &middot; ${mintNo(c.mint)}${c.pooled ? ' &middot; on the table' : ''}</div>
                  </div>
                  <div class="fc-offer-worth">${c.value}</div>
                  <button class="fc-op" data-act="ad-open" data-id="${c.id}">Open</button>
                  <button class="fc-op danger" data-act="ad-burn" data-id="${c.id}">Delete</button>
                </div>`).join('')
            : '<p class="fc-empty">No cards.</p>'}
        </div>
        ${a.admin ? '' : `
          <h4 class="fc-h4">Close the account</h4>
          <p class="fc-note">Deletes the account and every card it holds. There is no undoing it.</p>
          <button class="btn ghost" data-act="ad-delete" data-id="${a.id}" type="button">Delete ${esc(a.username)}</button>`}
      </div>`);

    $('#ad-form').addEventListener('submit', guard(async (ev) => {
      ev.preventDefault();
      const body = { displayName: $('#ad-display').value, note: $('#ad-note').value };
      if (!a.admin) {
        if ($('#ad-user').value.toLowerCase() !== a.username) body.username = $('#ad-user').value;
        body.disabled = $('#ad-off').checked;
      }
      if ($('#ad-pass').value) body.password = $('#ad-pass').value;
      await api('admin/users/' + encodeURIComponent(a.id), { method: 'POST', body });
      closeModal();
      await loadPanel();
      // The admin's own name is in the bar, and a rename that the bar goes on
      // ignoring reads as a rename that did not take.
      if (a.id === state.user.id) {
        state = await api('me');
        drawAll();
      }
      toast('Account updated.', 'info');
    }));

    $('#modal-body').addEventListener('click', guard(async (ev) => {
      const button = ev.target.closest('[data-act]');
      if (!button) return;
      const act = button.dataset.act;
      if (act === 'ad-signout') {
        await api('admin/users/' + encodeURIComponent(a.id), { method: 'POST', body: { signOut: true } });
        toast('Signed out everywhere.', 'info');
      }
      if (act === 'ad-open') {
        return adminCardModal(detail.cards.find((c) => c.id === button.dataset.id), a);
      }
      if (act === 'ad-burn') {
        await api('admin/cards/' + encodeURIComponent(button.dataset.id), { method: 'DELETE' });
        button.closest('.fc-offer').remove();
        await loadPanel();
      }
      if (act === 'ad-delete') {
        const sure = await ask(
          `Close @${a.username}?`,
          `The account goes, and so does every one of the ${plural(detail.cards.length, 'card', 'cards')} it holds. There is no undoing it.`,
          'Close the account',
        );
        if (!sure) return;
        await api('admin/users/' + encodeURIComponent(a.id), { method: 'DELETE' });
        closeModal();
        await loadPanel();
        toast('Account closed.', 'info');
      }
    }));
  });

  /**
   * The house's view of one card: the thing itself, both faces, and the means
   * to put any of it right.
   *
   * It is the author's own re-cut form plus the two things an author may not
   * touch — the rarity the roll gave the card, and the worth the post will
   * honour. The card above the form is the same one the owner sees, drawn by
   * the same function, so there is no second idea of what a card looks like
   * for the panel to drift away from.
   */
  function adminCardModal(card, account) {
    const mythic = card.rarity === 'mythic';
    const facts = [
      esc(card.rarityLabel),
      mintNo(card.mint),
      `craft ${card.craft}`,
      `made ${when(card.created)}`,
      card.edited ? `re-cut ${when(card.edited)}` : null,
      `by ${esc(card.authorName || 'anon')}`,
      card.traded ? plural(card.traded, 'trade', 'trades') : 'never traded',
      card.pooled ? 'on the table' : null,
    ].filter(Boolean).join(' &middot; ');

    openModal(`
      <button class="linkish fc-backlink" data-act="ac-back" type="button">&larr; ${esc(account.displayName)}&rsquo;s cards</button>
      <h3>${esc(card.title || card.front)}</h3>
      <p class="fc-note">${facts}</p>

      <div class="fc-cardshow">${cardHtml(card, { ops: false })}</div>
      <p class="fc-note">Click the card to flip it. Long answers are cut short on the card; the full text is in the form below.</p>

      <form id="ac-form" class="fc-form" autocomplete="off">
        <h4 class="fc-h4">The card</h4>
        <div class="field">
          <label for="ac-front">Front</label>
          <textarea id="ac-front" rows="2" maxlength="${state.limits.front}">${esc(card.front)}</textarea>
        </div>
        <div class="field">
          <label for="ac-back">Back</label>
          <textarea id="ac-back" rows="5" maxlength="${state.limits.back}">${esc(card.back)}</textarea>
        </div>
        <div class="fc-row">
          <div class="field">
            <label for="ac-hint">Hint <span class="opt">optional</span></label>
            <input id="ac-hint" maxlength="${state.limits.hint}" value="${esc(card.hint || '')}" />
          </div>
          <div class="field">
            <label for="ac-category">Category <span class="opt">optional</span></label>
            <input id="ac-category" maxlength="${state.limits.category}" value="${esc(card.category || '')}" />
          </div>
        </div>
        <div class="field">
          <label for="ac-tags">Tags <span class="opt">up to ${state.limits.tags}, comma separated</span></label>
          <input id="ac-tags" value="${esc((card.tags || []).join(', '))}" />
        </div>
        ${mythic ? `
          <div class="fc-row">
            <div class="field">
              <label for="ac-title">Name</label>
              <input id="ac-title" maxlength="48" value="${esc(card.title || '')}" />
            </div>
            <div class="field">
              <label for="ac-flavour">Flavour</label>
              <input id="ac-flavour" maxlength="140" value="${esc(card.flavour || '')}" />
            </div>
          </div>` : ''}

        <h4 class="fc-h4">Admin only</h4>
        <div class="fc-row">
          <div class="field">
            <label for="ac-rarity">Rarity</label>
            <select id="ac-rarity">
              ${RARITY_ORDER.map((r) => `<option value="${r}"${r === card.rarity ? ' selected' : ''}>${esc(state.rarities[r].label)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="ac-value">Value</label>
            <input id="ac-value" type="number" min="1" value="${card.value}" />
          </div>
        </div>
        <div class="field">
          <label for="ac-owner">Held by</label>
          <input id="ac-owner" list="usernames" value="${esc(account.username)}" autocapitalize="none" spellcheck="false" />
        </div>
        <p class="hint">
          Saving re-cuts the card: its craft is scored again and its worth moves with it.
          Leave the worth alone to take that new appraisal, or type a number to overrule it.
          The rarity is never re-rolled &mdash; set it here if it needs setting.
        </p>
        <div class="fc-actions">
          <button class="btn primary" type="submit">Save card</button>
          <button class="btn ghost" data-act="ac-burn" type="button">Delete card</button>
        </div>
      </form>`);

    $('#ac-form').addEventListener('submit', guard(async (ev) => {
      ev.preventDefault();
      const body = {
        front: $('#ac-front').value,
        back: $('#ac-back').value,
        hint: $('#ac-hint').value,
        category: $('#ac-category').value,
        tags: $('#ac-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
      };
      if (mythic) {
        body.title = $('#ac-title').value;
        body.flavour = $('#ac-flavour').value;
      }
      // Only what the admin actually moved is sent. The re-cut works the worth
      // out again, and posting back the number already on the screen would
      // overrule that fresh appraisal with the stale one every single time.
      if ($('#ac-rarity').value !== card.rarity) body.rarity = $('#ac-rarity').value;
      if (Number($('#ac-value').value) !== card.value) body.value = $('#ac-value').value;
      const owner = $('#ac-owner').value.trim();
      if (owner.toLowerCase() !== account.username) body.ownerId = owner;

      const res = await api('admin/cards/' + encodeURIComponent(card.id), { method: 'POST', body });
      await loadPanel();
      if (res.card.ownerId !== account.id) {
        toast(`Moved to ${res.owner.displayName}.`, 'info');
        return adminAccountModal(account.id);
      }
      toast(res.unpooled ? 'Saved. Its value changed, so it was taken off offer.' : 'Saved.', 'info');
      adminCardModal(res.card, account);
    }));

    $('#modal-body').addEventListener('click', guard(async (ev) => {
      const button = ev.target.closest('[data-act]');
      if (!button) return;
      if (button.dataset.act === 'ac-back') return adminAccountModal(account.id);
      if (button.dataset.act === 'ac-burn') {
        const sure = await ask(
          `Burn ${mintNo(card.mint)}?`,
          `${snip(card.front)} (value ${card.value}). This can’t be undone.`,
          'Delete',
        );
        if (!sure) return;
        await api('admin/cards/' + encodeURIComponent(card.id), { method: 'DELETE' });
        await loadPanel();
        toast('Deleted.', 'info');
        return adminAccountModal(account.id);
      }
    }));
  }

  // --- tabs ------------------------------------------------------------------

  function showTab(name) {
    for (const tab of $$('.fc-tab')) tab.classList.toggle('is-on', tab.dataset.tab === name);
    for (const pane of $$('.fc-pane')) pane.hidden = pane.id !== 'tab-' + name;
    if (name === 'print') drawPicker();
    if (name === 'panel' && !panel) loadPanel();
  }

  // --- drawing the lot -------------------------------------------------------

  function drawAll() {
    $('#who').textContent = state.user.displayName;
    $('.fc-tab-admin').hidden = !state.user.admin;
    if (!$('#filter-rarity').dataset.filled) {
      $('#filter-rarity').insertAdjacentHTML(
        'beforeend',
        RARITY_ORDER.map((r) => `<option value="${r}">${esc(state.rarities[r].label)}</option>`).join('')
      );
      $('#filter-rarity').dataset.filled = '1';
    }
    // Cards that have been traded away cannot stay ticked for printing.
    const held = new Set(state.cards.map((c) => c.id));
    for (const id of selected) if (!held.has(id)) selected.delete(id);

    drawCollection();
    drawTrade();
    if (!$('#tab-print').hidden) drawPicker();
    rememberTrades();
  }

  // --- what happened while you were out --------------------------------------
  //
  // The post settles trades while both sides are asleep — that is the whole
  // point of it — so a collection can be a different collection by the next
  // visit, and until now nothing said so. The newest trade this browser has
  // been shown is remembered, and anything past it is announced once.
  //
  // It is a convenience and nothing more, so it is wrapped: a browser with
  // storage turned off simply never gets told, which is where it started.

  const SEEN_TRADE = 'thievery:fc:lastTrade';

  function rememberTrades() {
    const newest = state.trades[0];
    if (!newest) return;
    try {
      localStorage.setItem(SEEN_TRADE, newest.id);
    } catch { /* nothing to remember with; no matter */ }
  }

  function announceMissedTrades(seen) {
    if (!seen || !state.trades.length) return;
    const at = state.trades.findIndex((t) => t.id === seen);
    // Not in the ledger any more means every trade here is newer than the last
    // one we showed.
    const fresh = at === -1 ? state.trades.length : at;
    if (!fresh) return;
    const got = state.trades.slice(0, fresh).flatMap((t) => t.got);
    if (!got.length) return;
    banner(
      'traded',
      'While you were out',
      `${plural(fresh, 'trade', 'trades')} went through: ${plural(got.length, 'card', 'cards')} in, value ${worthOf(got)}`,
      { ink: state.rarities[bestRarity(got)].ink },
    );
  }

  // --- wiring ----------------------------------------------------------------

  document.addEventListener('click', guard(async (ev) => {
    const tab = ev.target.closest('.fc-tab');
    if (tab) return showTab(tab.dataset.tab);

    const goto = ev.target.closest('[data-goto]');
    if (goto) return showTab(goto.dataset.goto);

    // The account menu, and clicking anywhere else to shut it.
    if (ev.target.closest('#who')) {
      const menu = $('#who-menu');
      menu.hidden = !menu.hidden;
      $('#who').setAttribute('aria-expanded', String(!menu.hidden));
      return;
    }
    if (!ev.target.closest('#who-menu')) $('#who-menu').hidden = true;

    // Clicking the dark behind a modal shuts it; there is no button there for
    // closest() to find, so this has to come first.
    if (ev.target.id === 'modal') return closeModal();

    const button = ev.target.closest('[data-act]');
    if (!button) return;
    const act = button.dataset.act;
    const id = button.dataset.id;

    if (act === 'turn') {
      button.closest('.fc-card').classList.toggle('is-turned');
      return;
    }
    if (act === 'signout') {
      await api('logout', { method: 'POST' });
      location.href = '/flashcards';
      return;
    }
    if (act === 'account') {
      $('#who-menu').hidden = true;
      return accountModal();
    }
    if (act === 'modal-close') return closeModal();
    if (act === 'reveal-close') { $('#reveal').hidden = true; return; }

    if (act === 'offer') {
      const result = await api('trade/offer', { method: 'POST', body: { id } });
      const settled = result.settled;
      state = result;
      drawAll();
      if (!settled) {
        toast('Offered. It’ll be swapped as soon as there’s a match.', 'info');
        return;
      }
      // A swap that settled the instant it was offered is the whole point of
      // the post, so it is announced rather than muttered. The band takes the
      // colour of the best thing that came back.
      const swap = state.trades[0];
      const more = settled > 1 ? ` (and ${plural(settled - 1, 'swap', 'swaps')} more)` : '';
      banner(
        'traded',
        'Traded',
        `${plural(swap.got.length, 'card', 'cards')} from ${swap.withName}, worth ${worthOf(swap.got)}${more}`,
        { ink: state.rarities[bestRarity(swap.got)].ink }
      );
      toast('Details are in your trade history.', 'info');
      return;
    }
    if (act === 'withdraw') {
      state = await api('trade/withdraw', { method: 'POST', body: { id } });
      drawAll();
      toast('Offer withdrawn.', 'info');
      return;
    }
    if (act === 'edit') {
      return loadForEdit(state.cards.find((c) => c.id === id));
    }
    if (act === 'burn') {
      const card = state.cards.find((c) => c.id === id);
      const sure = await ask(
        'Delete this card?',
        `${snip(card.front)} (value ${card.value}). This can’t be undone.`,
        'Delete',
      );
      if (!sure) return;
      state = await api('cards/' + encodeURIComponent(id), { method: 'DELETE' });
      drawAll();
      banner('burnt', 'Deleted', snip(card.front));
      return;
    }
    if (act === 'acct') return adminAccountModal(id);
  }));

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!$('#modal').hidden) closeModal();
    if (!$('#reveal').hidden) $('#reveal').hidden = true;
    $('#who-menu').hidden = true;
  });

  // The collection's controls.
  for (const id of ['search', 'filter-rarity', 'sort']) $('#' + id).addEventListener('input', drawCollection);

  // The make form.
  for (const id of ['f-front', 'f-back', 'f-hint', 'f-category', 'f-tags']) {
    $('#' + id).addEventListener('input', () => { countUp(); scheduleAppraisal(); });
  }
  $('#make-clear').addEventListener('click', clearForm);
  $('#make').addEventListener('submit', guard(async (ev) => {
    ev.preventDefault();
    const body = formContent();
    const where = editing ? 'cards/' + encodeURIComponent(editing) : 'cards';
    const wasEditing = editing;
    const result = await api(where, { method: 'POST', body });
    state = result;
    clearForm();
    drawAll();
    if (wasEditing) {
      toast('Saved. Its score has been recalculated.', 'info');
      showTab('collection');
    } else {
      // A new card is worth looking at before it disappears into the pile.
      // The band goes first and says what was rolled — it would lie straight
      // across the card otherwise — and the card is waiting behind it.
      const card = result.card;
      $('#reveal-card').innerHTML = cardHtml(card, { ops: false });
      banner('struck', card.rarityLabel, `${snip(card.front)} · value ${card.value}`, {
        ink: state.rarities[card.rarity].ink,
        then: () => { $('#reveal').hidden = false; },
      });
    }
  }));

  // The print picker.
  $('#print-pick').addEventListener('change', (ev) => {
    const box = ev.target.closest('input[type=checkbox]');
    if (!box) return;
    if (box.checked) selected.add(box.dataset.id);
    else selected.delete(box.dataset.id);
    box.closest('.fc-pick-item').classList.toggle('is-on', box.checked);
    countSheets();
  });
  $('#p-all').addEventListener('click', () => { for (const c of state.cards) selected.add(c.id); drawPicker(); });
  $('#p-none').addEventListener('click', () => { selected.clear(); drawPicker(); });
  $('#p-go').addEventListener('click', () => {
    buildSheet();
    // The sheet is in the document but display:none until the print stylesheet
    // takes over, so there is nothing to wait for beyond the next frame.
    requestAnimationFrame(() => window.print());
  });

  // The panel.
  $('#acct-search').addEventListener('input', () => panel && drawAccounts());
  $('#mythic').addEventListener('submit', guard(async (ev) => {
    ev.preventDefault();
    const result = await api('admin/mythic', {
      method: 'POST',
      body: {
        title: $('#m-title').value,
        front: $('#m-front').value,
        back: $('#m-back').value,
        hint: $('#m-hint').value,
        category: $('#m-category').value,
        flavour: $('#m-flavour').value,
        to: $('#m-to').value.trim() || 'random',
        value: $('#m-value').value,
      },
    });
    const box = $('#mythic-result');
    box.hidden = false;
    box.innerHTML = `Made <b>${esc(result.card.title || result.card.front)}</b> (${mintNo(result.card.mint)}, value ${result.card.value}) and gave it to <b>${esc(result.to.displayName)}</b> (@${esc(result.to.username)}).`;
    ev.target.reset();
    await loadPanel();
  }));

  // --- go --------------------------------------------------------------------

  (async () => {
    // Read before the first draw, because drawing writes it.
    let seenTrade = null;
    try {
      seenTrade = localStorage.getItem(SEEN_TRADE);
    } catch { /* no storage, so nothing was seen */ }

    try {
      state = await api('me');
    } catch {
      location.href = '/flashcards';
      return;
    }
    drawAll();
    countUp();
    scheduleAppraisal();
    announceMissedTrades(seenTrade);
  })();
})();

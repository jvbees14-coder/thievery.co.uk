/* Thievery.co.uk — the board, as you see it.
 *
 * One snapshot drives the whole page, as in the flashcards room: every call
 * that changes something returns the same shape the page was built from, so
 * there is nothing to patch and nothing to get out of step.
 *
 * The one rule of the room — answer before you ask — is enforced by the
 * server and only *shown* here. The form is hidden until the snapshot says
 * mayAsk, which is a courtesy to the person rather than a lock: sending the
 * request anyway gets a 403 with the reason on it. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  let state = null; // the last snapshot

  // --- talking to the house --------------------------------------------------

  async function api(path, { method = 'GET', body = null } = {}) {
    const res = await fetch('/api/polls' + (path ? '/' + path : ''), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      // A session that has died underneath us is not an error worth a
      // message; the door is the answer.
      if (res.status === 401) location.href = '/polls';
      throw new Error(payload.error || 'That did not work.');
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

  const guard = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      toast(err.message || 'That did not work.');
    }
  };

  const plural = (n, one, many) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

  function ago(at) {
    const mins = Math.round((Date.now() - at) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${plural(mins, 'minute', 'minutes')} ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${plural(hours, 'hour', 'hours')} ago`;
    return `${plural(Math.round(hours / 24), 'day', 'days')} ago`;
  }

  // --- the ask form ----------------------------------------------------------

  function optionRow(value = '') {
    const row = document.createElement('div');
    row.className = 'poll-option-row';
    row.innerHTML = `
      <input class="poll-option-in" maxlength="${state.limits.option}" placeholder="An answer" value="${esc(value)}" />
      <button class="icon-btn" type="button" data-act="drop-option" title="Take this answer out" aria-label="Take this answer out">&times;</button>`;
    return row;
  }

  function syncOptionRows() {
    const rows = [...document.querySelectorAll('.poll-option-row')];
    // The minimum is never removable: a poll with one answer is a statement.
    for (const row of rows) row.querySelector('[data-act="drop-option"]').hidden = rows.length <= state.limits.min;
    $('#add-option').hidden = rows.length >= state.limits.max;
  }

  function resetAskForm() {
    $('#question').value = '';
    const box = $('#options');
    box.innerHTML = '';
    for (let i = 0; i < state.limits.min; i++) box.append(optionRow());
    syncOptionRows();
    countQuestion();
  }

  function countQuestion() {
    $('#q-left').textContent = String(state.limits.question - $('#question').value.length);
  }

  // --- drawing ---------------------------------------------------------------

  // A bar per answer, once you have answered. Before that the answers are
  // buttons and there is nothing to read off them, which is the point.
  function answerRow(poll, option) {
    if (poll.yours === null) {
      return `<button class="poll-choice" type="button" data-act="answer" data-poll="${esc(poll.id)}" data-option="${esc(option.id)}">
        ${esc(option.text)}
      </button>`;
    }
    const share = poll.total ? Math.round((option.votes / poll.total) * 100) : 0;
    const yours = poll.yours === option.id;
    return `<div class="poll-result${yours ? ' is-yours' : ''}">
      <div class="poll-result-bar" style="width:${share}%"></div>
      <span class="poll-result-text">${esc(option.text)}${yours ? ' <i>your answer</i>' : ''}</span>
      <span class="poll-result-figure">${share}%<small>${option.votes}</small></span>
    </div>`;
  }

  function pollCard(poll) {
    const answered = poll.yours !== null;
    return `<article class="poll-card${answered ? ' is-answered' : ''}">
      <header class="poll-card-head">
        <h3>${esc(poll.question)}</h3>
        <p class="poll-card-by">
          ${esc(poll.asked)}${poll.mine ? ' <b>&middot; yours</b>' : ''} &middot; ${esc(ago(poll.created))}
          &middot; ${esc(poll.total ? plural(poll.total, 'answer', 'answers') : 'no answers yet')}
        </p>
      </header>
      <div class="poll-card-body">${poll.options.map((o) => answerRow(poll, o)).join('')}</div>
      ${poll.mine ? `<footer class="poll-card-foot">
        <button class="btn ghost" type="button" data-act="drop" data-poll="${esc(poll.id)}">Take it down</button>
      </footer>` : ''}
    </article>`;
  }

  function render() {
    const { user, polls, you } = state;
    $('#who').textContent = user.displayName;

    // --- the form, or the rule that stands in its place
    $('#ask').hidden = !you.mayAsk;
    $('#gate').hidden = you.mayAsk;
    if (!you.mayAsk) {
      $('#gate-note').textContent = polls.length
        ? `${plural(polls.length, 'question is', 'questions are')} on the board below. Any one of them will do.`
        : 'There is nothing on the board yet — the house puts the first question up.';
    }

    // --- the board
    $('#board-say').textContent = polls.length
      ? `${plural(polls.length, 'question', 'questions')} · you have answered ${you.answered} of other people's` +
        (you.asked ? ` and asked ${plural(you.asked, 'one', 'ones')}` : '')
      : 'Nothing up yet.';
    $('#board').innerHTML = polls.length
      ? polls.map(pollCard).join('')
      : `<p class="poll-empty">The board is empty. Nothing to answer, and so &mdash; unless you are the house &mdash; nothing to ask yet either.</p>`;
  }

  function say(message) {
    const el = $('#ask-error');
    el.textContent = message;
    el.hidden = !message;
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

  document.addEventListener(
    'click',
    guard(async (ev) => {
      const button = ev.target.closest('button[data-act]');
      if (!button) return;
      const act = button.dataset.act;

      if (act === 'signout') {
        await fetch('/api/site/logout', { method: 'POST', credentials: 'same-origin' });
        location.href = '/';
        return;
      }
      if (act === 'drop-option') {
        button.closest('.poll-option-row').remove();
        return syncOptionRows();
      }
      if (act === 'answer') {
        // An answer is final, so the buttons go the moment one is pressed:
        // a second click while the request is in flight would be refused,
        // and being refused for something you did not mean to do twice is
        // a poor way to find that out.
        for (const b of button.closest('.poll-card-body').querySelectorAll('button')) b.disabled = true;
        state = await api(`answer/${encodeURIComponent(button.dataset.poll)}`, {
          method: 'POST',
          body: { option: button.dataset.option },
        });
        render();
        return;
      }
      if (act === 'drop') {
        if (button.dataset.sure !== '1') {
          button.dataset.sure = '1';
          button.textContent = 'Sure? Every answer goes with it';
          setTimeout(() => {
            if (button.isConnected) {
              button.dataset.sure = '';
              button.textContent = 'Take it down';
            }
          }, 4000);
          return;
        }
        state = await api(encodeURIComponent(button.dataset.poll), { method: 'DELETE' });
        render();
        toast('Taken down.', 'info');
      }
    })
  );

  $('#add-option').addEventListener('click', () => {
    $('#options').append(optionRow());
    syncOptionRows();
    $('#options').lastElementChild.querySelector('input').focus();
  });

  $('#question').addEventListener('input', countQuestion);

  $('#ask').addEventListener(
    'submit',
    guard(async (ev) => {
      ev.preventDefault();
      say('');
      const options = [...document.querySelectorAll('.poll-option-in')].map((i) => i.value);
      const button = ev.target.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        state = await api('ask', { method: 'POST', body: { question: $('#question').value, options } });
      } catch (err) {
        return say(err.message);
      } finally {
        button.disabled = false;
      }
      render();
      resetAskForm();
      toast('It is on the board.', 'info');
    })
  );

  // --- off we go -------------------------------------------------------------

  guard(async () => {
    state = await api('');
    render();
    resetAskForm();
  })();
})();

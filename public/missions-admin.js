/* Thievery.co.uk Missions: the control room.
 *
 * Draws everything from GET /api/missions/admin, and every change posts and
 * redraws from the whole state the server answers with, so the page never
 * holds an idea of a set that the server does not. The one exception is a
 * set open in the editor: its draft lives here until Save, and a redraw in
 * the meantime draws the draft, not the server's copy.
 *
 * Nothing is built with innerHTML: names and dares are typed by strangers
 * (riders name themselves), so every bit of text goes in as text. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const toast = (text, tone) => (window.thieveryToast ? window.thieveryToast({ text, tone }) : alert(text));

  let S = null;
  let reveal = false;
  let editing = null; // { id, draft }
  const armed = new Set(); // buttons waiting for their second tap

  // --- a small element builder ----------------------------------------------

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k.startsWith('data-')) el.setAttribute(k, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }
  const btn = (label, act, extra = {}) => h('button', { type: 'button', class: 'ms-btn ' + (extra.class || ''), 'data-act': act, ...extra.attrs }, label);

  // --- talking to the server ------------------------------------------------

  async function api(path, { method = 'GET', body } = {}) {
    const q = reveal ? (path.includes('?') ? '&' : '?') + 'reveal=1' : '';
    const init = { method, headers: {} };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch('/api/missions/admin' + path + q, init);
    } catch {
      throw new Error('No connection. Try again.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 404) {
      if (!path) location.reload();
    }
    if (!res.ok) throw new Error(data.error || 'That did not work.');
    return data;
  }

  async function act(path, opts, done) {
    try {
      S = await api(path, opts);
      if (done) done(S);
      draw();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  // --- words ----------------------------------------------------------------

  function ago(at) {
    if (!at) return 'never';
    const mins = Math.round((Date.now() - at) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} h ${mins % 60} min ago`;
    return new Date(at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function until(at) {
    const mins = Math.round((at - Date.now()) / 60000);
    const t = new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return mins <= 0 ? `${t} (any moment)` : `${t} (in ${mins} min)`;
  }
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const STATE_WORD = { running: 'Running', paused: 'Paused', stopped: 'Stopped' };

  function audienceWords(set) {
    const a = set.audience;
    let who = 'Everyone';
    if (a.mode === 'crews') {
      const names = a.crews.map((id) => S.crews.find((c) => c.id === id)?.name).filter(Boolean);
      who = names.length ? names.join(', ') : 'No crews chosen';
    } else if (a.mode === 'riders') {
      who = a.riders.length ? plural(a.riders.length, 'chosen rider') : 'No riders chosen';
    }
    return `${who} (${plural(set.reach, 'rider')}, ${set.reachable} with notifications)${set.pickOne ? ', one at random each time' : ''}`;
  }

  // --- the board --------------------------------------------------------------

  function drawBoard() {
    const withPush = S.riders.filter((r) => r.notifications).length;
    const running = S.sets.filter((s) => s.state === 'running').length;
    const tile = (n, label, tone) => h('div', { class: 'ms-tile' + (tone ? ' is-' + tone : '') }, h('p', { class: 'ms-tile-n', text: String(n) }), h('p', { class: 'ms-tile-label', text: label }));
    const board = $('#ms-board');
    board.replaceChildren(
      h('div', { class: 'ms-tiles' },
        tile(running, running === 1 ? 'set running' : 'sets running', running ? 'go' : ''),
        tile(S.riders.length, S.riders.length === 1 ? 'rider' : 'riders'),
        tile(withPush, 'with notifications', withPush < S.riders.length ? 'warn' : '')
      ),
      h('p', { class: 'ms-board-line' + (S.push === 'ready' ? '' : ' is-bad'), text: S.push === 'ready' ? 'Push is set up.' : S.push }),
      h('p', {
        class: 'ms-board-line' + (S.lastTick || !running ? '' : ' is-warn'),
        text: S.lastTick
          ? `Outside check-in: ${ago(S.lastTick)}.`
          : 'No outside check-in since the server last started. If a set is running, check the cron job.',
      })
    );
    board.hidden = false;
  }

  // --- a set ------------------------------------------------------------------

  function drawSet(set) {
    if (editing && editing.id === set.id) return drawEditor(set);
    const last = set.last
      ? h('p', { class: 'ms-last' },
          h('span', { class: 'ms-last-label', text: 'Last: ' }),
          h('q', { text: set.last.text }),
          ` ${ago(set.last.at)}, to ${set.last.names ? set.last.names.join(', ') : plural(set.last.count, 'rider')}.`)
      : h('p', { class: 'ms-last', text: 'Nothing sent yet.' });
    let next = null;
    if (set.state === 'running') {
      next = h('p', { class: 'ms-next', text: reveal ? (set.nextAt ? `Next: ${until(set.nextAt)}` : 'Next: being worked out') : 'Next: a surprise' });
    }
    const left = set.noRepeat && set.challenges.length ? `, ${set.left} left before repeats` : '';
    return h('article', { class: 'ms-card ms-set is-' + set.state, 'data-id': set.id },
      h('div', { class: 'ms-card-head' },
        h('h3', { text: set.name }),
        h('span', { class: 'ms-badge is-' + set.state, text: STATE_WORD[set.state] })
      ),
      h('ul', { class: 'ms-facts' },
        h('li', { text: `Every ${set.minGap} to ${set.maxGap} minutes` }),
        h('li', { text: `${plural(set.challenges.length, 'challenge')}${left}` }),
        h('li', { text: `To: ${audienceWords(set)}` })
      ),
      last,
      next,
      h('div', { class: 'ms-controls' },
        set.state !== 'running' ? btn(set.state === 'paused' ? 'Resume' : 'Start', 'start', { class: 'ms-btn-go' }) : btn('Pause', 'pause'),
        set.state !== 'stopped' ? btn('Stop', 'stop') : null,
        btn('Send one now', 'send'),
        btn('Edit', 'edit', { class: 'ms-btn-quiet' })
      )
    );
  }

  // --- the editor ---------------------------------------------------------------

  function draftOf(set) {
    return {
      name: set.name,
      minGap: set.minGap,
      maxGap: set.maxGap,
      noRepeat: set.noRepeat,
      pickOne: set.pickOne,
      audience: { mode: set.audience.mode, crews: [...set.audience.crews], riders: [...set.audience.riders] },
      challenges: set.challenges.map((c) => ({ ...c })),
    };
  }

  function drawEditor(set) {
    const d = editing.draft;
    const field = (label, input, hint) => h('div', { class: 'ms-field' }, h('label', { for: input.id, text: label }), input, hint ? h('p', { class: 'ms-small', text: hint }) : null);
    const num = (key) => h('input', { id: `ed-${key}`, type: 'number', inputmode: 'numeric', min: '1', max: '1440', value: String(d[key]), 'data-draft': key, class: 'ms-num' });

    const modes = h('div', { class: 'ms-seg', role: 'radiogroup', 'aria-label': 'Who gets it' },
      ...[['all', 'Everyone'], ['crews', 'Crews'], ['riders', 'Riders']].map(([mode, label]) =>
        h('label', { class: 'ms-seg-opt' }, h('input', { type: 'radio', name: 'ed-mode', value: mode, checked: d.audience.mode === mode, 'data-draft': 'mode' }), h('span', { text: label }))
      )
    );
    let picks = null;
    if (d.audience.mode === 'crews') {
      picks = S.crews.length
        ? h('div', { class: 'ms-chips' }, ...S.crews.map((c) => h('label', { class: 'ms-chip' }, h('input', { type: 'checkbox', value: c.id, checked: d.audience.crews.includes(c.id), 'data-draft': 'crews' }), h('span', { text: `${c.name} (${c.size})` }))))
        : h('p', { class: 'ms-small', text: 'No crews yet. Add one under Crews.' });
    } else if (d.audience.mode === 'riders') {
      picks = S.riders.length
        ? h('div', { class: 'ms-chips' }, ...S.riders.map((r) => h('label', { class: 'ms-chip' }, h('input', { type: 'checkbox', value: r.id, checked: d.audience.riders.includes(r.id), 'data-draft': 'riders' }), h('span', { text: r.name }))))
        : h('p', { class: 'ms-small', text: 'Nobody has joined yet.' });
    }

    const list = h('ol', { class: 'ms-challenges' },
      ...d.challenges.map((c, i) =>
        h('li', { class: 'ms-challenge', 'data-i': String(i) },
          h('textarea', { rows: 2, maxlength: '240', 'aria-label': `Challenge ${i + 1}`, 'data-draft': 'text', value: c.text }),
          h('div', { class: 'ms-row-tools' },
            h('button', { type: 'button', class: 'ms-icon', 'data-act': 'up', 'aria-label': 'Move up', disabled: i === 0, text: '↑' }),
            h('button', { type: 'button', class: 'ms-icon', 'data-act': 'down', 'aria-label': 'Move down', disabled: i === d.challenges.length - 1, text: '↓' }),
            h('button', { type: 'button', class: 'ms-icon is-danger', 'data-act': 'remove', 'aria-label': 'Delete challenge', text: '×' })
          )
        )
      )
    );

    return h('article', { class: 'ms-card ms-editor', 'data-id': set.id },
      h('h3', { text: 'Edit set' }),
      field('Name', h('input', { id: 'ed-name', maxlength: '40', value: d.name, 'data-draft': 'name' })),
      h('fieldset', { class: 'ms-gap' },
        h('legend', { text: 'Time between missions' }),
        h('div', { class: 'ms-gap-row' },
          h('label', { for: 'ed-minGap', text: 'Every' }), num('minGap'),
          h('label', { for: 'ed-maxGap', text: 'to' }), num('maxGap'),
          h('span', { text: 'minutes' })
        ),
        h('p', { class: 'ms-small', text: 'Each gap is picked at random between the two.' })
      ),
      h('label', { class: 'ms-check' }, h('input', { type: 'checkbox', checked: d.noRepeat, 'data-draft': 'noRepeat' }), ' Don’t repeat a challenge until all have been used'),
      h('fieldset', { class: 'ms-who' },
        h('legend', { text: 'Who gets it' }),
        modes,
        picks,
        h('label', { class: 'ms-check' }, h('input', { type: 'checkbox', checked: d.pickOne, 'data-draft': 'pickOne' }), ' Send each one to just one of them, picked at random')
      ),
      h('fieldset', { class: 'ms-list' },
        h('legend', { text: `Challenges (${d.challenges.length})` }),
        d.challenges.length ? list : h('p', { class: 'ms-small', text: 'No challenges yet.' }),
        h('div', { class: 'ms-field' },
          h('label', { for: 'ed-new', text: 'Add challenges' }),
          h('textarea', { id: 'ed-new', rows: 3, placeholder: 'One per line', 'aria-describedby': 'ed-new-hint' }),
          h('p', { class: 'ms-small', id: 'ed-new-hint', text: 'Paste a list to add many at once: each line becomes one challenge.' }),
          btn('Add', 'add-lines')
        )
      ),
      h('div', { class: 'ms-controls' },
        btn('Save', 'save', { class: 'ms-btn-go' }),
        btn('Cancel', 'cancel', { class: 'ms-btn-quiet' }),
        btn(armed.has('delete-set') ? 'Tap again to delete' : 'Delete set', 'delete-set', { class: 'ms-btn-danger' })
      )
    );
  }

  // --- crews and riders -----------------------------------------------------------

  function drawCrews() {
    const base = location.origin + '/missions?crew=';
    $('#ms-crews').replaceChildren(
      ...(S.crews.length
        ? S.crews.map((c) =>
            h('div', { class: 'ms-row', 'data-crew': c.id },
              h('div', { class: 'ms-row-main' },
                h('input', { class: 'ms-row-name', value: c.name, maxlength: '30', 'aria-label': 'Crew name', 'data-rename': 'crew' }),
                h('p', { class: 'ms-small' }, `${plural(c.size, 'rider')} · `, h('a', { href: base + c.slug, text: 'join link' }))
              ),
              h('div', { class: 'ms-row-tools' },
                btn('Copy link', 'copy-crew', { attrs: { 'data-link': base + c.slug } }),
                btn(armed.has('crew-' + c.id) ? 'Tap again' : 'Delete', 'delete-crew', { class: 'ms-btn-danger' })
              )
            )
          )
        : [h('p', { class: 'ms-empty', text: 'No crews. Everyone is in one big gang.' })])
    );
  }

  function drawRiders() {
    $('#ms-riders').replaceChildren(
      ...(S.riders.length
        ? S.riders.map((r) =>
            h('div', { class: 'ms-row', 'data-rider': r.id },
              h('div', { class: 'ms-row-main' },
                h('p', { class: 'ms-row-title' },
                  h('strong', { text: r.name }),
                  h('span', { class: 'ms-badge ' + (r.notifications ? 'is-running' : 'is-off'), text: r.notifications ? 'Notifications on' : 'Notifications off' })
                ),
                h('p', { class: 'ms-small', text: `Joined ${ago(r.joined)} · last seen ${ago(r.seen)}` }),
                S.crews.length
                  ? h('div', { class: 'ms-chips' }, ...S.crews.map((c) => h('label', { class: 'ms-chip' }, h('input', { type: 'checkbox', value: c.id, checked: r.crews.includes(c.id), 'data-rider-crew': r.id }), h('span', { text: c.name }))))
                  : null
              ),
              h('div', { class: 'ms-row-tools' }, btn(armed.has('rider-' + r.id) ? 'Tap again' : 'Remove', 'delete-rider', { class: 'ms-btn-danger' }))
            )
          )
        : [h('p', { class: 'ms-empty', text: 'Nobody yet. Send them the link and look trustworthy.' })])
    );
  }

  function draw() {
    $('#ms-loading').hidden = true;
    drawBoard();
    const sets = $('#ms-sets');
    // Focus survives a redraw of the editor by id, so typing is not
    // interrupted by a refresh of the rest.
    const focused = document.activeElement && document.activeElement.id;
    sets.replaceChildren(...(S.sets.length ? S.sets.map(drawSet) : [h('p', { class: 'ms-empty', text: 'No sets yet. Every heist starts with a plan.' })]));
    drawCrews();
    drawRiders();
    if (focused && document.getElementById(focused)) document.getElementById(focused).focus();
  }

  // --- what the buttons do ----------------------------------------------------------

  // Destructive buttons ask for a second tap rather than a dialog.
  function twice(key) {
    if (armed.has(key)) {
      armed.delete(key);
      return true;
    }
    armed.add(key);
    setTimeout(() => {
      if (armed.delete(key)) draw();
    }, 4000);
    draw();
    return false;
  }

  function move(list, from, to) {
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
  }

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || !S) return;
    const card = b.closest('[data-id]');
    const id = card && card.dataset.id;
    const a = b.dataset.act;

    if (a === 'start' || a === 'pause' || a === 'stop') return act(`/sets/${id}/${a}`, { method: 'POST', body: {} });
    if (a === 'send') {
      b.disabled = true;
      return act(`/sets/${id}/send`, { method: 'POST', body: {} }, (r) => {
        const rep = r.report || {};
        const lost = rep.failed ? `, ${rep.failed} failed` : '';
        toast(rep.to ? `Sent to ${plural(rep.to, 'rider')} (${rep.pushed} pushed${lost}).` : 'Sent, but nobody is in this set’s audience.', rep.to ? 'good' : 'bad');
      });
    }
    if (a === 'edit') {
      editing = { id, draft: draftOf(S.sets.find((s) => s.id === id)) };
      draw();
      document.getElementById('ed-name')?.focus();
      return;
    }
    if (a === 'cancel') {
      editing = null;
      return draw();
    }
    if (a === 'save') return act(`/sets/${id}`, { method: 'POST', body: editing.draft }, () => {
      editing = null;
      toast('Saved.', 'good');
    });
    if (a === 'delete-set') {
      if (!twice('delete-set')) return;
      return act(`/sets/${id}`, { method: 'DELETE' }, () => (editing = null));
    }
    if (a === 'add-lines') {
      const box = document.getElementById('ed-new');
      const lines = box.value.split(String.fromCharCode(10)).map((s) => s.trim()).filter(Boolean);
      if (!lines.length) return box.focus();
      editing.draft.challenges.push(...lines.map((text) => ({ text })));
      box.value = '';
      draw();
      document.getElementById('ed-new')?.focus();
      return;
    }
    if (a === 'up' || a === 'down' || a === 'remove') {
      const i = Number(b.closest('[data-i]').dataset.i);
      const list = editing.draft.challenges;
      if (a === 'remove') list.splice(i, 1);
      else move(list, i, a === 'up' ? i - 1 : i + 1);
      return draw();
    }
    if (a === 'copy-crew') {
      const link = b.dataset.link;
      return navigator.clipboard.writeText(link).then(() => toast('Link copied.', 'good'), () => prompt('Copy this link:', link));
    }
    if (a === 'delete-crew') {
      const crew = b.closest('[data-crew]').dataset.crew;
      if (!twice('crew-' + crew)) return;
      return act(`/crews/${crew}`, { method: 'DELETE' });
    }
    if (a === 'delete-rider') {
      const rider = b.closest('[data-rider]').dataset.rider;
      if (!twice('rider-' + rider)) return;
      return act(`/riders/${rider}`, { method: 'DELETE' });
    }
  });

  // The editor's fields write straight into the draft. Only a change of who
  // gets it redraws, because that changes which boxes are shown.
  function onDraft(ev) {
    const el = ev.target;
    const key = el.dataset && el.dataset.draft;
    if (!key || !editing) return;
    const d = editing.draft;
    if (key === 'name') d.name = el.value;
    else if (key === 'minGap' || key === 'maxGap') d[key] = Number(el.value) || 1;
    else if (key === 'noRepeat' || key === 'pickOne') d[key] = el.checked;
    else if (key === 'text') d.challenges[Number(el.closest('[data-i]').dataset.i)].text = el.value;
    else if (key === 'mode') {
      d.audience.mode = el.value;
      draw();
    } else if (key === 'crews' || key === 'riders') {
      const list = new Set(d.audience[key]);
      if (el.checked) list.add(el.value);
      else list.delete(el.value);
      d.audience[key] = [...list];
    }
  }
  document.addEventListener('input', onDraft);
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.draft === 'mode') return; // handled on input
    if (el.dataset.draft) return onDraft(ev);
    if (el.dataset.riderCrew) {
      const rider = S.riders.find((r) => r.id === el.dataset.riderCrew);
      const crews = new Set(rider.crews);
      if (el.checked) crews.add(el.value);
      else crews.delete(el.value);
      return act(`/riders/${rider.id}`, { method: 'POST', body: { crews: [...crews] } });
    }
    if (el.dataset.rename === 'crew') {
      const crew = el.closest('[data-crew]').dataset.crew;
      return act(`/crews/${crew}`, { method: 'POST', body: { name: el.value } });
    }
  });

  $('#ms-reveal').addEventListener('change', (ev) => {
    reveal = ev.target.checked;
    act('');
  });
  $('#ms-add-set').addEventListener('click', () =>
    act('/sets', { method: 'POST', body: {} }, (r) => {
      const set = r.sets.find((s) => s.id === r.created);
      if (set) editing = { id: set.id, draft: draftOf(set) };
    }).then(() => document.getElementById('ed-name')?.select())
  );
  $('#ms-add-crew').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const input = $('#ms-crew-name');
    if (!input.value.trim()) return input.focus();
    act('/crews', { method: 'POST', body: { name: input.value } }, () => (input.value = ''));
  });

  // Fresh figures every half minute, unless something is being typed.
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (!typing) act('');
  }, 30000);

  act('');
})();

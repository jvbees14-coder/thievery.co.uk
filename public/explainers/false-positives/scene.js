// ---------------------------------------------------------------------------
// Why a positive test can be wrong: the scene.
//
// A thousand people, each a dot: red if ill, teal if well, ringed if their
// test came back positive. Chapter 2 fades everybody who tested negative;
// chapter 3 lets the reader change how common the illness is and how good
// the test is; chapter 4 tests the positives a second time.
// ---------------------------------------------------------------------------

import { mount, fmt } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { N, people, drawPeople, chanceIfPositive } from './art.js';

const st = { prev: 0.01, sens: 0.9, fp: 0.09, readout: null };

function key(ctx, x, y, col, bg) {
  const items = [['Ill', col.danger, false], ['Well', col['hiw-ink-1'], false], ['Tested positive', col['label-tertiary'], true]];
  for (const [name, c, ring] of items) {
    ctx.beginPath();
    ctx.arc(x + 5, y, 5, 0, Math.PI * 2);
    if (ring) {
      ctx.strokeStyle = col.label;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = c;
      ctx.fill();
    }
    label(ctx, name, x + 14, y, col['label-secondary'], bg, { size: 11 });
    x += ctx.measureText(name).width + 34;
  }
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;

  if (ch === 'retest') {
    // Only the people who tested positive, tested again.
    const first = people(st.prev, st.sens, st.fp);
    const ill = first.truePos, well = first.falsePos;
    const again = { ill: Math.round(ill * st.sens), well: Math.round(well * st.fp) };
    const rowsOf = (n, y, colr, pos, title) => {
      label(ctx, title, 20, y - 14, col['label-secondary'], bg, { size: 12, weight: 700 });
      const per = Math.max(10, Math.floor((w - 40) / 16)), cell = (w - 40) / per;
      for (let i = 0; i < n; i++) {
        const x = 20 + (i % per) * cell + cell / 2, yy = y + Math.floor(i / per) * cell + cell / 2;
        ctx.globalAlpha = i < pos ? 1 : 0.18;
        ctx.beginPath();
        ctx.arc(x, yy, cell * 0.36, 0, Math.PI * 2);
        ctx.fillStyle = colr;
        ctx.fill();
        if (i < pos) {
          ctx.strokeStyle = col.label;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, yy, cell * 0.48, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      return y + Math.ceil(n / per) * cell;
    };
    let y = rowsOf(ill, 90, col.danger, again.ill, `Ill, and positive the first time: ${ill}`);
    rowsOf(well, y + 44, col['hiw-ink-1'], again.well, `Well, but positive the first time: ${well}`);
    r?.set('both', `${again.ill + again.well}`);
    r?.set('chance', `${fmt(chanceIfPositive(chanceIfPositive(st.prev, st.sens, st.fp), st.sens, st.fp) * 100, 0)}%`);
    return false;
  }

  const p = people(st.prev, st.sens, st.fp);
  key(ctx, 16, 66, col, bg);
  drawPeople(ctx, 12, 84, w - 24, h - 96, p.list, col, { onlyPositive: ch !== 'crowd' });
  r?.set('ill', `${p.ill} of ${fmt(N)}`);
  r?.set('pos', `${p.truePos + p.falsePos}: ${p.truePos} ill, ${p.falsePos} well`);
  r?.set('chance', `${fmt(chanceIfPositive(st.prev, st.sens, st.fp) * 100, 0)}%`);
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({
    crowd: 'A thousand people, one in a hundred ill',
    positive: 'Only the positive results',
    rarity: 'Change the illness and the test',
    retest: 'The positives, tested again',
  }[id]);
  if (id === 'crowd' || id === 'positive' || id === 'retest') {
    st.prev = 0.01;
    st.sens = 0.9;
    st.fp = 0.09;
  }
  if (id === 'rarity') {
    ui.slider({ label: 'People who are ill', min: 0.001, max: 0.3, step: 0.001, value: st.prev, format: (v) => `${fmt(v * 100, 1)}%`, onInput(v) { st.prev = v; api.invalidate(); } });
    ui.slider({ label: 'Ill people the test catches', min: 0.5, max: 1, step: 0.01, value: st.sens, format: (v) => `${Math.round(v * 100)}%`, onInput(v) { st.sens = v; api.invalidate(); } });
    ui.slider({ label: 'Well people it wrongly flags', min: 0, max: 0.2, step: 0.005, value: st.fp, format: (v) => `${fmt(v * 100, 1)}%`, onInput(v) { st.fp = v; api.invalidate(); } });
  }
  st.readout = id === 'retest'
    ? api.readout([{ key: 'both', label: 'Positive twice' }, { key: 'chance', label: 'Chance of being ill, if positive twice' }])
    : api.readout([{ key: 'ill', label: 'Ill' }, { key: 'pos', label: 'Positive tests' }, { key: 'chance', label: 'Chance of being ill, if positive' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

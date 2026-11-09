import { generate, DIFFS } from '../lib/sudoku-core.js';
import { Stopwatch } from '../lib/util.js';

const BOX = i => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);
const PEERS = [...Array(81).keys()].map(i => [...Array(81).keys()].filter(k => k !== i &&
  (Math.floor(k / 9) === Math.floor(i / 9) || k % 9 === i % 9 || BOX(k) === BOX(i))));
const BORDER = [...Array(81).keys()].map(i =>
  (i % 9 % 3 === 2 && i % 9 < 8 ? ' br' : '') + (Math.floor(i / 9) % 3 === 2 && i < 72 ? ' bb' : ''));

const game = {
  id: 'sudoku', name: 'Sudoku', icon: '🔢',
  desc: 'Jede Zahl von 1 bis 9 genau einmal in jeder Zeile, Spalte und jedem 3×3-Block.',
  help: `<ul><li>Feld antippen, dann Zahl wählen. Auf dem PC gehen auch Tastatur und Pfeiltasten.</li>
    <li><b>Notizen</b> schaltet auf kleine Merkzahlen um (Taste N).</li>
    <li>Falsche Zahlen werden rot markiert und als Fehler gezählt.</li>
    <li><b>Tipp</b> löst ein Feld und kostet 30 Sekunden.</li>
    <li>Leicht bis Extrem: von „nur eine Zahl passt“ bis zu Rätseln, die Ketten oder Ausprobieren erfordern.</li></ul>`,
  variants: Object.entries(DIFFS).map(([id, d]) => ({ id, label: d.label })),
  metric: { type: 'time', better: 'low', label: 'Zeit' },
  abandon: s => s.hist && s.hist.length ? { won: false } : null,

  start(el, ctx) {
    let st = ctx.saved;
    if (!st) {
      const g = generate(ctx.variant);
      st = { puzzle: g.puzzle, solution: g.solution, values: g.puzzle.slice(), notes: new Array(81).fill(0), elapsed: 0, mistakes: 0, hints: 0, hist: [] };
    }
    const sw = new Stopwatch(st.elapsed);
    let sel = -1, notesMode = false, over = false;

    el.innerHTML = `<div class="sd">
      <div class="sd-board">${BORDER.map((b, i) => `<div class="sd-cell${b}" data-i="${i}"></div>`).join('')}</div>
      <div class="tools">
        <button class="btn" data-a="undo">↶ Zurück</button>
        <button class="btn" data-a="erase">⌫ Löschen</button>
        <button class="btn" data-a="notes">✎ Notizen</button>
        <button class="btn" data-a="hint">💡 Tipp</button>
      </div>
      <div class="sd-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button data-d="${d}">${d}</button>`).join('')}</div>
      <div class="tools"><button class="btn small" data-a="new">Neues Spiel</button></div>
    </div>`;
    const cells = [...el.querySelectorAll('.sd-cell')];
    const pad = [...el.querySelectorAll('.sd-pad button')];
    const notesBtn = el.querySelector('[data-a=notes]');

    const save = () => ctx.save({ ...st, elapsed: sw.ms });
    const info = () => ctx.setInfo(`⏱ ${ctx.fmtTime(sw.ms / 1000)} · ✗ ${st.mistakes}`);

    function render() {
      const sv = sel >= 0 ? st.values[sel] : 0;
      const peers = sel >= 0 ? new Set(PEERS[sel]) : new Set();
      cells.forEach((c, i) => {
        const v = st.values[i];
        let cls = 'sd-cell' + BORDER[i];
        if (st.puzzle[i]) cls += ' given';
        if (i === sel) cls += ' sel'; else if (peers.has(i)) cls += ' peer';
        if (sv && v === sv) cls += ' same';
        if (v && v !== st.solution[i]) cls += ' err';
        c.className = cls;
        if (v) c.textContent = v;
        else if (st.notes[i]) c.innerHTML = '<div class="notes">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<span>${st.notes[i] & (1 << d) ? d : ''}</span>`).join('') + '</div>';
        else c.textContent = '';
      });
      pad.forEach((b, k) => {
        const d = k + 1;
        const n = st.values.filter((v, i) => v === d && v === st.solution[i]).length;
        b.classList.toggle('done', n === 9);
      });
      notesBtn.classList.toggle('on', notesMode);
    }

    function pushHist() {
      st.hist.push({ i: sel, v: st.values[sel], n: st.notes.slice() });
      if (st.hist.length > 200) st.hist.shift();
    }

    function clearPeerNotes(i, d) { for (const p of PEERS[i]) st.notes[p] &= ~(1 << d); }

    function input(d) {
      if (over || sel < 0 || st.puzzle[sel]) return;
      if (notesMode) {
        if (st.values[sel]) return;
        pushHist();
        st.notes[sel] ^= 1 << d;
      } else {
        if (st.values[sel] === d) return;
        pushHist();
        st.values[sel] = d;
        st.notes[sel] = 0;
        if (d !== st.solution[sel]) { st.mistakes++; navigator.vibrate && navigator.vibrate(60); }
        else clearPeerNotes(sel, d);
      }
      changed();
    }

    function erase() {
      if (over || sel < 0 || st.puzzle[sel] || (!st.values[sel] && !st.notes[sel])) return;
      pushHist();
      st.values[sel] = 0; st.notes[sel] = 0;
      changed();
    }

    function undo() {
      if (over || !st.hist.length) return;
      const h = st.hist.pop();
      st.values[h.i] = h.v; st.notes = h.n; sel = h.i;
      changed();
    }

    function hint() {
      if (over) return;
      let i = sel >= 0 && !st.puzzle[sel] && st.values[sel] !== st.solution[sel] ? sel : -1;
      if (i < 0) {
        const open = st.values.map((v, k) => v !== st.solution[k] ? k : -1).filter(k => k >= 0);
        if (!open.length) return;
        i = open[Math.floor(Math.random() * open.length)];
      }
      sel = i;
      pushHist();
      st.values[i] = st.solution[i]; st.notes[i] = 0;
      clearPeerNotes(i, st.solution[i]);
      st.hints++;
      sw.add(30000);
      ctx.toast('Tipp: +30 Sekunden');
      changed();
    }

    function changed() {
      render(); info();
      if (st.values.every((v, i) => v === st.solution[i])) {
        over = true; sw.stop(); sel = -1; render();
        const det = [`${st.mistakes} Fehler`]; if (st.hints) det.push(`${st.hints} Tipps`);
        ctx.finish({ won: true, value: sw.sec, detail: det.join(', '), delay: 600 });
      } else save();
    }

    el.addEventListener('click', e => {
      const c = e.target.closest('.sd-cell');
      if (c) { sel = +c.dataset.i; render(); return; }
      const d = e.target.closest('[data-d]');
      if (d) return input(+d.dataset.d);
      const a = e.target.closest('[data-a]');
      if (!a) return;
      ({ undo, erase, hint,
        notes: () => { notesMode = !notesMode; render(); },
        new: () => ctx.restart(game.abandon(st)) })[a.dataset.a]();
    });

    render(); info(); sw.run();
    const iv = setInterval(info, 500);

    return {
      key(e) {
        if (/^[1-9]$/.test(e.key)) input(+e.key);
        else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') erase();
        else if (e.key === 'n' || e.key === 'N') { notesMode = !notesMode; render(); }
        else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) undo();
        else {
          const mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
          if (mv === undefined) return;
          e.preventDefault();
          sel = sel < 0 ? 40 : (sel + mv + 81) % 81;
          render();
        }
      },
      pause() { sw.stop(); if (!over) save(); },
      resume() { if (!over) sw.run(); },
      destroy() { clearInterval(iv); if (!over) { sw.stop(); save(); } }
    };
  }
};
export default game;

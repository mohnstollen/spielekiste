// Schachaufgaben: Runden mit 10 Aufgaben, Aufgabe des Tages und Wiederholung falsch gelöster Aufgaben (Lernkartei).
import * as S from '../storage.js';
import * as C from '../lib/chess-core.js';
import { createBoard, pieceSVG } from '../lib/chess-board.js';
import { PUZZLES } from '../lib/chess-puzzles.js';
import { today, withSeed } from '../lib/util.js';
import * as A from '../lib/chess-ai.js';

const GID = 'aufgaben';
const ROUND = 10, DAILY = 3, MAX_REPEAT = 4;
const INTERVAL = [1, 3, 7, 14];          // Tage bis zur nächsten Wiederholung je Karteifach
const THEMES = {
  gemischt: { label: 'Gemischt', themes: ['mate1', 'mate2', 'win'] },
  matt1: { label: 'Matt in 1', themes: ['mate1'] },
  matt2: { label: 'Matt in 2', themes: ['mate2'] },
  material: { label: 'Material gewinnen', themes: ['win'] }
};
const TASK = { mate1: 'Setze matt in einem Zug!', mate2: 'Setze matt in zwei Zügen!', win: 'Gewinne Material!' };
const TITLE = { mate1: 'Matt in 1', mate2: 'Matt in 2', win: 'Material gewinnen' };
const progKey = pid => `prog:${pid}:${GID}`;
const loadProg = pid => S.get(progKey(pid), { cards: {}, done: {} });
const byId = id => PUZZLES.find(z => z.id === id);

// Neue Runde: erst fällige Wiederholungen, dann ungelöste, dann beliebige Aufgaben
function pickRound(pid, variant) {
  const prog = loadProg(pid), day = today().index, themes = THEMES[variant].themes;
  const pool = PUZZLES.filter(z => themes.includes(z.theme));
  const shuffle = a => a.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const due = shuffle(pool.filter(z => prog.cards[z.id] && prog.cards[z.id].due <= day)).slice(0, MAX_REPEAT);
  const fresh = shuffle(pool.filter(z => !prog.cards[z.id] && !prog.done[z.id] && !due.includes(z)));
  const rest = shuffle(pool.filter(z => !due.includes(z) && !fresh.includes(z)));
  return [...due, ...fresh, ...rest].slice(0, ROUND).map(z => z.id);
}
function pickDaily(seed) {
  return withSeed(seed, () => ['mate1', 'win', 'mate2'].map(t => {
    const pool = PUZZLES.filter(z => z.theme === t);
    return (pool.length ? pool : PUZZLES)[Math.floor(Math.random() * (pool.length || PUZZLES.length))].id;
  }));
}
// Lernkartei: richtig beim ersten Versuch → ein Fach weiter; falsch → morgen wieder
function learn(pid, id, ok) {
  const prog = loadProg(pid), day = today().index, card = prog.cards[id];
  if (ok) {
    prog.done[id] = 1;
    if (card) { card.box++; if (card.box >= INTERVAL.length) delete prog.cards[id]; else card.due = day + INTERVAL[card.box]; }
  } else prog.cards[id] = { box: 0, due: day + 1 };
  S.set(progKey(pid), prog);
}

const game = {
  id: GID, name: 'Schachaufgaben', icon: '🧩',
  desc: 'Matt in 1, Matt in 2 und Material gewinnen: kurze Runden, Aufgabe des Tages und eine Lernkartei für Fehler.',
  help: `<ul><li>Eine Runde hat ${ROUND} Aufgaben. Zuerst siehst du den letzten Zug des Gegners – dann bist du dran.</li>
    <li>Gezählt wird, was du <b>beim ersten Versuch</b> und ohne Tipp löst.</li>
    <li>Falsch gelöste Aufgaben kommen in die <b>Lernkartei</b>: Sie tauchen am nächsten Tag wieder auf, dann nach 3, 7 und 14 Tagen.</li>
    <li>Die <b>Aufgaben des Tages</b> (${DAILY} Stück) sind auf allen Geräten gleich – zu finden unter „Rätsel des Tages“.</li></ul>`,
  variants: Object.entries(THEMES).map(([id, t]) => ({ id, label: t.label })),
  variantsTitle: 'Runde starten',
  metric: { type: 'points', unit: 'gelöst', better: 'high', label: 'Beim ersten Versuch gelöst', always: true },
  daily: { variant: () => 'gemischt', label: () => `${DAILY} Schachaufgaben` },
  abandon: s => s && s.results.length ? { won: false, value: s.results.filter(r => r.ok).length } : null,
  variantInfo(vid, pid) {
    const prog = loadProg(pid), day = today().index, themes = THEMES[vid].themes;
    const pool = PUZZLES.filter(z => themes.includes(z.theme));
    const due = pool.filter(z => prog.cards[z.id] && prog.cards[z.id].due <= day).length;
    const done = pool.filter(z => prog.done[z.id]).length;
    return `${done}/${pool.length} gelöst${due ? ` · ${due} zur Wiederholung` : ''}`;
  },

  start(el, ctx) {
    const pid = ctx.profile.id, daily = !!ctx.daily;
    let st = ctx.saved || { list: daily ? pickDaily(ctx.daily.seed) : pickRound(pid, ctx.variant), i: 0, results: [] };
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
    const clear = () => { timers.forEach(clearTimeout); timers.clear(); };

    el.innerHTML = `<div class="cs">
      <div class="cs-head"><b class="pz-title"></b><div class="cs-bar"><i></i></div></div>
      <div class="cs-prompt"></div>
      <div class="cs-bd"></div>
      <div class="cs-fb" aria-live="polite"></div>
      <div class="cs-btns"><button class="btn" data-a="tip">💡 Tipp</button><button class="btn" data-a="show" hidden>Lösung zeigen</button><button class="btn primary" data-a="next" hidden>Weiter ›</button></div>
      <div class="pz-dots"></div></div>`;
    const $ = s => el.querySelector(s);
    const promptEl = $('.cs-prompt'), fbEl = $('.cs-fb'), bar = $('.cs-bar i');
    const tipBtn = $('[data-a=tip]'), showBtn = $('[data-a=show]'), nextBtn = $('[data-a=next]');
    const board = createBoard($('.cs-bd'));
    const fb = (html, cls = '') => { fbEl.className = 'cs-fb ' + cls; fbEl.innerHTML = html || ''; };
    const dots = () => {
      $('.pz-dots').innerHTML = st.list.map((id, k) => {
        const r = st.results[k];
        return `<span class="${r ? (r.ok ? 'ok' : 'bad') : k === st.i ? 'cur' : ''}">${r ? (r.ok ? '✓' : '✗') : k + 1}</span>`;
      }).join('');
      ctx.setInfo(`${st.results.filter(r => r.ok).length} ✓`);
    };

    function puzzle() {
      clear();
      if (st.i >= st.list.length) return summary();
      const z = byId(st.list[st.i]);
      if (!z) { st.results[st.i] = { id: st.list[st.i], ok: false }; st.i++; return puzzle(); }
      let pos = C.parseFEN(z.fen), k = 0, busy = true, wrong = 0, tipped = false, solved = false, level = 0;
      const me = C.other(pos.turn);
      board.flip(me);
      board.set({ mode: 'none' });
      board.setBoard(pos.b); board.mark({}); board.arrows([]); board.last([]); board.check(-1); board.select(null);
      $('.pz-title').textContent = `${daily ? 'Tagesaufgabe' : 'Aufgabe'} ${st.i + 1}/${st.list.length} · ${TITLE[z.theme]}`;
      bar.style.width = (st.i / st.list.length * 100) + '%';
      promptEl.innerHTML = `${me === 'w' ? 'Weiß' : 'Schwarz'} am Zug: ${TASK[z.theme]}${z.theme === 'win' && z.gain ? ` <small class="muted">(etwa +${z.gain})</small>` : ''}`;
      fb('Der Gegner zieht …');
      tipBtn.hidden = false; showBtn.hidden = true; nextBtn.hidden = true;
      dots();
      const apply = (m) => {
        const n = C.makeMove(pos, m);
        board.setBoard(n.b, [[m.from, m.to], ...(m.flag === 'k' ? [[m.to + 1, m.to - 1]] : m.flag === 'q' ? [[m.to - 2, m.to + 1]] : [])]);
        board.last([m.from, m.to]); board.check(C.inCheck(n) ? C.kingSq(n, n.turn) : -1);
        pos = n;
      };
      // Zug des Gegners vorspielen
      later(() => { apply(C.parseUci(pos, z.pre)); busy = false; fb(''); }, 700);

      const finishPuzzle = ok => {
        solved = true; busy = true;
        if (!st.results[st.i]) {
          st.results[st.i] = { id: z.id, ok };
          if (!daily) learn(pid, z.id, ok);
        }
        board.set({ mode: 'none' });
        tipBtn.hidden = true; showBtn.hidden = true; nextBtn.hidden = false;
        dots(); ctx.save(st);
      };
      async function onMove(f, t) {
        if (busy || solved) return;
        const cands = C.legalMoves(pos, { from: f }).filter(m => m.to === t);
        if (!cands.length) { const why = C.explainIllegal(pos, f, t); if (why) { board.flash(t, 'bad'); fb(why, 'bad'); } return; }
        let m = cands[0];
        if (cands.length > 1) {
          busy = true;
          const q = await ctx.modal({ title: 'Umwandeln in …', html: '', buttons: ['q', 'r', 'b', 'n'].map(x => ({ label: `<span class="cs-promo">${pieceSVG(C.pieceOf(pos.turn, x))}</span>`, value: x })) });
          busy = false;
          if (!q) return;
          m = cands.find(x => x.promo === q);
        }
        const san = C.san(pos, m), before = pos;
        apply(m); board.arrows([]); board.mark({});
        if (z.sol[k].includes(C.uci(m)) || C.status(pos) === 'mate') {
          // Eine andere richtige Lösung als die gespeicherte: bei Matt in 2 antwortet die Engine, sonst ist die Aufgabe gelöst
          const main = C.uci(m) === z.sol[k][0];
          if (k + 1 >= z.sol.length || C.status(pos) || (!main && z.theme !== 'mate2')) {
            const first = !wrong && !tipped;
            finishPuzzle(first);
            return fb(`${first ? 'Richtig!' : 'Gelöst!'} <span class="cs-san">${san}</span>${first ? ' ⭐' : ''}`, 'ok');
          }
          busy = true; fb(`Gut! <span class="cs-san">${san}</span> – der Gegner antwortet …`, 'ok');
          later(() => {
            const r = main ? C.parseUci(pos, z.sol[k + 1]) : A.bestMove(pos, 2);
            const rs = C.san(pos, r);
            apply(r); k += 2; level = 0; busy = false;
            fb(`Der Gegner spielt <span class="cs-san">${rs}</span>. Weiter!`);
          }, 700);
          return;
        }
        wrong++; busy = true;
        fb(`<span class="cs-san">${san}</span> ist nicht die Lösung.${wrong >= 2 ? ' Du kannst dir die Lösung zeigen lassen.' : ' Versuch es noch einmal!'}`, 'bad');
        later(() => {
          pos = before; busy = false;
          board.setBoard(pos.b, [[m.to, m.from]]); board.last([]); board.check(C.inCheck(pos) ? C.kingSq(pos, pos.turn) : -1);
          if (wrong >= 2) showBtn.hidden = false;
        }, 1200);
      }
      board.set({ mode: 'move', onMove, movable: i => !busy && !solved && C.colorOf(pos.b[i]) === me,
        targets: i => C.legalMoves(pos, { from: i }).map(m => m.to) });
      tipBtn.onclick = () => {
        if (busy || solved) return;
        tipped = true;
        const m = C.parseUci(pos, z.sol[k][0]);
        if (level++ === 0) { board.addMark(m.from, 'hint'); fb('💡 Mit dieser Figur geht es.', 'tip'); }
        else board.arrows([[m.from, m.to, 'g']]);
      };
      showBtn.onclick = () => {
        if (solved) return;
        finishPuzzle(false);
        // Restliche Lösung vorspielen
        const rest = z.sol.slice(k).map((x, j) => j % 2 === 0 ? x[0] : x);
        rest.forEach((u, j) => later(() => { apply(C.parseUci(pos, u)); }, 300 + j * 900));
        fb(`Lösung: <span class="cs-san">${(() => { let q = pos; return rest.map(u => { const mm = C.parseUci(q, u), s2 = C.san(q, mm); q = C.makeMove(q, mm); return s2; }).join(' ');})()}</span>`, 'bad');
      };
      nextBtn.onclick = () => { st.i++; ctx.save(st); puzzle(); };
    }

    function summary() {
      clear();
      const ok = st.results.filter(r => r.ok).length;
      if (daily) return ctx.finish({ won: ok > 0, value: ok, detail: `${ok} von ${st.list.length}` });
      const prog = loadProg(pid), day = today().index;
      const tomorrow = Object.values(prog.cards).filter(c => c.due <= day + 1).length;
      el.innerHTML = `<div class="cs-end">
        <div class="result-value">${ok} / ${st.list.length}</div>
        <h2>${ok === st.list.length ? 'Perfekt! 🏆' : ok >= 7 ? 'Stark! 👏' : ok >= 4 ? 'Gut gemacht!' : 'Weiter üben!'}</h2>
        <p class="muted">beim ersten Versuch gelöst</p>
        <div class="pz-dots">${st.results.map((r, k) => `<span class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'}</span>`).join('')}</div>
        ${st.results.some(r => !r.ok) ? `<p class="small">Die falsch gelösten Aufgaben kommen in die Lernkartei.${tomorrow === 1 ? ' Morgen ist eine Aufgabe zur Wiederholung dran.' : tomorrow ? ` Morgen sind ${tomorrow} Aufgaben zur Wiederholung dran.` : ''}</p>` : ''}
        <button class="btn primary wide" data-a="again">Neue Runde</button></div>`;
      $('[data-a=again]').onclick = () => ctx.restart(null);
      ctx.finish({ won: ok >= 7, value: ok, detail: THEMES[ctx.variant].label, quiet: true });
    }

    puzzle();
    return { pause() { ctx.save(st); }, destroy() { clear(); } };
  }
};
export default game;

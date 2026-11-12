// Schachschule: Schach lernen in kleinen Schritten. Kapitel = Varianten, jede Lektion besteht aus Erklärungen und Übungen.
// Der Lernfortschritt (Sterne je Lektion) liegt pro Profil unter prog:<profil>:schachschule.
import * as S from '../storage.js';
import * as C from '../lib/chess-core.js';
import { createBoard, pieceSVG } from '../lib/chess-board.js';
import { CHAPTERS, collectSolve } from '../lib/chess-lessons.js';
import * as A from '../lib/chess-ai.js';

const GID = 'schachschule';
const progKey = pid => `prog:${pid}:${GID}`;
const loadProg = pid => S.get(progKey(pid), { lessons: {}, best: {} });
const lessonKey = (ch, l) => `${ch.id}/${l.id}`;
const starsOf = (prog, ch) => ch.lessons.reduce((a, l) => a + (prog.lessons[lessonKey(ch, l)] || 0), 0);
const starStr = n => '★'.repeat(n) + '☆'.repeat(3 - n);
const idxMarks = m => Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [C.sq(k), v]));
const animPairs = m => {
  const a = [[m.from, m.to]];
  if (m.flag === 'k') a.push([m.to + 1, m.to - 1]);
  if (m.flag === 'q') a.push([m.to - 2, m.to + 1]);
  return a;
};

/* ---------------- Bauernspiel-Computer ---------------- */
export const PAWN_OPTS = { castling: false, ep: false, promo: false };
// Nach einem Zug: 'w' | 'b' (Sieger) | 'draw' | null (geht weiter)
const lastRank = p => { for (let c = 0; c < 8; c++) { if (p.b[c] === 'P') return 'w'; if (p.b[56 + c] === 'p') return 'b'; } return null; };
export function pawnWinner(p) {
  const lr = lastRank(p);
  if (lr) return lr;
  if (!C.legalMoves(p, PAWN_OPTS).length) return p.b.includes(C.pieceOf(p.turn, 'p')) ? 'draw' : C.other(p.turn);
  return null;
}
function pawnEval(p) {   // aus Sicht von Weiß
  const b = p.b, bMax = new Array(8).fill(-1), wMin = new Array(8).fill(9);
  for (let i = 0; i < 64; i++) {
    if (b[i] === 'p') bMax[i & 7] = Math.max(bMax[i & 7], C.rankOf(i));
    else if (b[i] === 'P') wMin[i & 7] = Math.min(wMin[i & 7], C.rankOf(i));
  }
  let s = 0, wd = 99, bd = 99;
  for (let i = 0; i < 64; i++) {
    const x = b[i];
    if (x !== 'P' && x !== 'p') continue;
    const f = i & 7, r = C.rankOf(i), w = x === 'P', adv = w ? r - 1 : 6 - r;
    let passed = true;
    for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) if (w ? bMax[g] > r : wMin[g] < r) passed = false;
    let v = 10 + adv * adv * 1.5;
    if (passed) {
      v += 15 + adv * 6;
      const d = adv === 0 ? 5 : 6 - adv;
      if (w) wd = Math.min(wd, d); else bd = Math.min(bd, d);
    }
    s += w ? v : -v;
  }
  // Wettrennen der Freibauern: Wer zuerst ankommt, gewinnt (Freibauern kann niemand mehr aufhalten)
  if (wd < 99 || bd < 99) {
    const white = p.turn === 'w' ? wd <= bd : wd < bd;
    s += white ? 500 - wd * 10 : -(500 - bd * 10);
  }
  return s;
}
function pawnSearch(p, depth, alpha, beta, ply) {
  if (lastRank(p)) return -(10000 - ply);            // der Gegner hat gerade die letzte Reihe erreicht
  const ms = C.legalMoves(p, PAWN_OPTS);
  if (!ms.length) return p.b.includes(C.pieceOf(p.turn, 'p')) ? 0 : -(10000 - ply);
  if (!depth) return (p.turn === 'w' ? 1 : -1) * pawnEval(p);
  ms.sort((a, b) => (!!b.captured - !!a.captured));
  let best = -Infinity;
  for (const m of ms) {
    const v = -pawnSearch(C.makeMove(p, m), depth - 1, -beta, -alpha, ply + 1);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}
export function pawnBestMove(p, level) {
  const ms = C.legalMoves(p, PAWN_OPTS);
  if (level === 'leicht' && Math.random() < 0.3) return ms[Math.floor(Math.random() * ms.length)];
  const depth = level === 'leicht' ? 2 : 5;
  let best = -Infinity, pick = [];
  for (const m of ms) {
    const v = -pawnSearch(C.makeMove(p, m), depth - 1, -Infinity, Infinity, 1);
    if (v > best) { best = v; pick = [m]; } else if (v === best) pick.push(m);
  }
  return pick[Math.floor(Math.random() * pick.length)];
}

/* ---------------- Spielmodul ---------------- */
const game = {
  id: GID, name: 'Schachschule', icon: '♟️',
  desc: 'Schach lernen in kleinen Schritten – mit Erklärungen und Übungen zum Mitmachen.',
  help: `<ul><li>Jedes Kapitel besteht aus kurzen Lektionen: erst eine Erklärung, dann Übungen am Brett.</li>
    <li>Figuren ziehst du per Antippen (Figur, dann Zielfeld) oder mit dem Finger.</li>
    <li>Für jede Lektion gibt es bis zu drei Sterne. Fehler und Tipps kosten Sterne – du kannst jede Lektion wiederholen.</li>
    <li>Sind alle Lektionen eines Kapitels geschafft, kommen deine Sterne in die Bestenliste.</li>
    <li>Die Kapitel bauen aufeinander auf. Wer schon etwas kann, darf aber springen.</li></ul>`,
  variantsTitle: 'Kapitel',
  variants: CHAPTERS.map((c, i) => ({ id: c.id, label: `${i + 1} · ${c.title}` })),
  metric: { type: 'points', unit: '★', better: 'high', label: 'Sterne im Kapitel' },
  abandon: () => null,
  variantInfo(vid, pid) {
    const ch = CHAPTERS.find(c => c.id === vid), prog = loadProg(pid);
    const done = ch.lessons.filter(l => prog.lessons[lessonKey(ch, l)]).length;
    if (!done) return `${ch.lessons.length} Lektionen`;
    return `${done === ch.lessons.length ? '✓' : `${done}/${ch.lessons.length}`} · ${starsOf(prog, ch)}/${ch.lessons.length * 3} ★`;
  },

  start(el, ctx) {
    const ch = CHAPTERS.find(c => c.id === ctx.variant) || CHAPTERS[0];
    const chNo = CHAPTERS.indexOf(ch) + 1, pid = ctx.profile.id;
    let prog = loadProg(pid);
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
    const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
    const info = () => ctx.setInfo(`${starsOf(prog, ch)}/${ch.lessons.length * 3} ★`);

    /* ---------- Kapitelübersicht ---------- */
    function overview() {
      clearTimers();
      const next = ch.lessons.findIndex(l => !prog.lessons[lessonKey(ch, l)]);
      el.innerHTML = `<div class="cs-ov">
        <p class="muted">${ch.desc}</p>
        ${next >= 0 ? `<button class="btn primary wide" data-l="${next}">▶ ${next ? 'Weiter mit' : 'Los geht’s'}: ${ch.lessons[next].title}</button>`
          : '<p class="cs-done">🎓 Kapitel geschafft! Wiederhole Lektionen, um mehr Sterne zu sammeln.</p>'}
        <ol class="cs-lessons">${ch.lessons.map((l, i) => {
          const st = prog.lessons[lessonKey(ch, l)] || 0;
          return `<li><button data-l="${i}" class="${st ? 'done' : ''} ${i === next ? 'next' : ''}"><span class="n">${st ? '✓' : i + 1}</span>
            <span class="t">${l.title}<small>${l.desc}</small></span><span class="st">${st ? starStr(st) : ''}</span></button></li>`;
        }).join('')}</ol></div>`;
      el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => lesson(+b.dataset.l));
      info();
    }

    /* ---------- Lektion ---------- */
    function lesson(li) {
      clearTimers();
      const L = ch.lessons[li];
      let si = 0, mistakes = 0, tipUsed = false, cur = {};
      el.innerHTML = `<div class="cs">
        <div class="cs-head"><button class="btn small" data-a="ov" title="Zur Übersicht">☰</button><b>${L.title}</b><div class="cs-bar"><i></i></div></div>
        <div class="cs-prompt"></div>
        <div class="cs-bd"></div>
        <div class="cs-opts"></div>
        <div class="cs-fb" aria-live="polite"></div>
        <div class="cs-btns"><button class="btn" data-a="tip">💡 Tipp</button><button class="btn" data-a="x"></button><button class="btn primary" data-a="next">Weiter ›</button></div>
      </div>`;
      const $ = s => el.querySelector(s);
      const promptEl = $('.cs-prompt'), fbEl = $('.cs-fb'), optsEl = $('.cs-opts'), bdWrap = $('.cs-bd'), bar = $('.cs-bar i');
      const tipBtn = $('[data-a=tip]'), xBtn = $('[data-a=x]'), nextBtn = $('[data-a=next]');
      const board = createBoard(bdWrap);
      $('[data-a=ov]').onclick = overview;
      tipBtn.onclick = () => cur.tip && cur.tip();
      xBtn.onclick = () => cur.x && cur.x();
      nextBtn.onclick = () => { if (cur.beforeNext) cur.beforeNext(); si++; run(); };

      const fb = (html, cls = '') => { fbEl.className = 'cs-fb ' + cls; fbEl.innerHTML = html || ''; };
      const ready = html => { if (html != null) fb(html, 'ok'); nextBtn.hidden = false; tipBtn.hidden = true; board.set({ mode: 'none' }); board.select(null); };
      const miss = html => { mistakes++; fb(html, 'bad'); };
      // Tipps nacheinander: erst Hinweistext, dann deutlichere Hilfe. Der erste Tipp kostet einen Punkt.
      const tipper = (...fns) => { const f = fns.filter(Boolean); let k = 0; return () => { if (!tipUsed) { tipUsed = true; mistakes++; } f[Math.min(k++, f.length - 1)](); }; };
      const hintText = s => s.hint && (() => fb('💡 ' + s.hint, 'tip'));
      const showPos = p => { board.setBoard(p.b); board.check(C.inCheck(p) ? C.kingSq(p, p.turn) : -1); };
      function applyMove(p, m) {
        const n = C.makeMove(p, m);
        board.setBoard(n.b, animPairs(m));
        board.last([m.from, m.to]);
        board.check(C.inCheck(n) ? C.kingSq(n, n.turn) : -1);
        return n;
      }
      function askPromo(color) {
        return ctx.modal({ title: 'Umwandeln in …', html: '<p class="muted small">Wähle die neue Figur.</p>',
          buttons: ['q', 'r', 'b', 'n'].map(t => ({ label: `<span class="cs-promo">${pieceSVG(C.pieceOf(color, t))}</span>`, value: t })) });
      }

      function run() {
        clearTimers();
        if (si >= L.steps.length) return finish();
        const s = L.steps[si];
        bar.style.width = (si / L.steps.length * 100) + '%';
        tipUsed = false; cur = {};
        fb(''); optsEl.innerHTML = '';
        nextBtn.hidden = true; tipBtn.hidden = false; xBtn.hidden = true; xBtn.className = 'btn'; bdWrap.hidden = false;
        board.set({ mode: 'none', coords: s.coords !== false, onTap: null, onMove: null, movable: null, targets: null, showTargets: s.showTargets !== false });
        board.select(null); board.mark({}); board.arrows([]); board.stars([]); board.dots([]); board.last([]); board.check(-1);
        promptEl.innerHTML = s.prompt || s.text || '';
        promptEl.classList.toggle('text', s.type === 'intro');
        const p = s.fen ? C.parseFEN(s.fen) : null;
        if (p) showPos(p); else board.setBoard(new Array(64).fill(null));
        if (s.marks) board.mark(idxMarks(s.marks));
        if (s.arrows) board.arrows(s.arrows.map(([a, b, c]) => [C.sq(a), C.sq(b), c]));
        cur = STEP[s.type](s, p) || {};
        window.scrollTo(0, 0);
      }

      const STEP = {
        intro(s, p) {
          if (!p) bdWrap.hidden = true;
          if (s.showMoves) board.dots(C.legalMoves(p, { from: C.sq(s.showMoves), castling: false }).map(m => m.to));
          tipBtn.hidden = true; nextBtn.hidden = false;
          if (!s.demo) return;
          xBtn.hidden = false; xBtn.textContent = '▶ Zeigen';
          return { x() {
            clearTimers(); board.arrows([]); board.mark({}); board.dots([]); board.last([]); showPos(p);
            let q = p;
            s.demo.forEach((u, k) => later(() => { q = applyMove(q, C.parseUci(q, u)); }, 450 + k * 1000));
          } };
        },

        coords(s) {
          const list = [...Array(64).keys()].sort(() => Math.random() - .5).slice(0, s.n);
          let k = 0;
          const ask = () => { board.mark({}); promptEl.innerHTML = `${s.prompt}: <b class="cs-big">${C.sqName(list[k])}</b> <small class="muted">${k + 1}/${list.length}</small>`; };
          ask();
          board.set({ mode: 'tap', onTap: i => {
            if (k >= list.length) return;
            if (i === list[k]) {
              board.flash(i, 'good'); fb('');
              if (++k === list.length) return ready('Alle Felder gefunden! 👍');
              ask();
            } else { board.flash(i, 'bad'); miss(`Das war <b>${C.sqName(i)}</b>. Gesucht ist ${C.sqName(list[k])}.`); }
          } });
          return { tip: () => { if (!tipUsed) { tipUsed = true; mistakes++; } const n = C.sqName(list[k]); board.addMark(list[k], 'hint'); fb(`💡 ${n[0]}-Linie, ${n[1]}. Reihe.`, 'tip'); } };
        },

        find(s, p) {
          const ok = (typeof s.ok === 'function' ? s.ok(p) : s.ok).map(C.sq);
          board.set({ mode: 'tap', onTap: i => {
            if (ok.includes(i)) {
              board.flash(i, 'good');
              if (s.place) { const b = board.state.b.slice(); b[i] = s.place; board.setBoard(b); }
              board.addMark(i, 'good');
              ready(s.success || 'Richtig!');
            } else { board.flash(i, 'bad'); miss(s.wrong ? s.wrong(C.sqName(i)) : 'Das ist nicht das richtige Feld.'); }
          } });
          return { tip: tipper(hintText(s), () => board.addMark(ok[0], 'hint')) };
        },

        mark(s, p) {
          const ok = new Set((typeof s.ok === 'function' ? s.ok(p) : s.ok).map(C.sq));
          const from = s.from ? C.sq(s.from) : null, sel = new Set();
          let tries = 0, solved = false;
          const draw = (extra = {}) => {
            const m = {};
            if (from !== null) m[from] = 'sel';
            sel.forEach(i => { m[i] = 'on'; });
            board.mark(Object.assign(m, extra));
          };
          draw();
          promptEl.innerHTML += ' <small class="muted">Tippe die Felder an und drücke dann „Prüfen“.</small>';
          xBtn.hidden = false; xBtn.textContent = '✔ Prüfen'; xBtn.className = 'btn primary';
          board.set({ mode: 'tap', onTap: i => {
            if (solved || i === from) return;
            if (sel.has(i)) sel.delete(i); else sel.add(i);
            draw();
          } });
          const diff = () => [[...sel].filter(i => !ok.has(i)), [...ok].filter(i => !sel.has(i))];
          return {
            x() {
              if (solved) return;
              const [wrong, missing] = diff();
              if (!wrong.length && !missing.length) {
                solved = true; xBtn.hidden = true;
                draw(Object.fromEntries([...ok].map(i => [i, 'good'])));
                return ready(tries ? 'Jetzt stimmt alles!' : 'Perfekt – alle Felder richtig!');
              }
              tries++;
              const msg = [missing.length && (missing.length === 1 ? 'Ein Feld fehlt noch.' : `${missing.length} Felder fehlen noch.`),
                wrong.length && (wrong.length === 1 ? 'Ein markiertes Feld ist falsch (rot).' : `${wrong.length} markierte Felder sind falsch (rot).`)].filter(Boolean).join(' ');
              miss(msg);
              if (tries >= 3) {
                solved = true; xBtn.hidden = true;
                draw({ ...Object.fromEntries([...ok].map(i => [i, sel.has(i) ? 'good' : 'miss'])), ...Object.fromEntries(wrong.map(i => [i, 'bad'])) });
                ready(null);
                fb(msg + ' Hier ist die Lösung – grün umrandet sind die fehlenden Felder.', 'bad');
                return;
              }
              draw(Object.fromEntries(wrong.map(i => [i, 'bad'])));
            },
            tip: tipper(hintText(s), () => { const [wrong, missing] = diff(); if (missing.length) board.addMark(missing[0], 'hint'); else if (wrong.length) board.addMark(wrong[0], 'hint'); })
          };
        },

        collect(s, p) {
          const OPTS = { castling: false, ep: false, promo: false };
          let pos = { ...C.clone(p), turn: 'w' }, at = s.piece ? C.sq(s.piece) : p.b.findIndex(x => C.colorOf(x) === 'w');
          const stars = new Set((s.stars || []).map(C.sq));
          const par = collectSolve(p, at, [...stars]).length;
          let moves = 0, extra = 0;
          board.stars([...stars]);
          promptEl.innerHTML += ` <small class="muted">Schaffst du es in ${par} ${par === 1 ? 'Zug' : 'Zügen'}?</small>`;
          const left = () => stars.size + pos.b.filter(x => C.colorOf(x) === 'b').length;
          board.set({ mode: 'move', movable: i => i === at && left() > 0,
            targets: i => C.legalMoves(pos, { ...OPTS, from: i }).map(m => m.to),
            onMove: (f, t) => {
              const m = C.legalMoves(pos, { ...OPTS, from: f }).find(x => x.to === t);
              if (!m) { const why = C.explainIllegal(pos, f, t, OPTS); if (why) { board.flash(t, 'bad'); miss(why); } return; }
              pos = { ...C.makeMove(pos, m), turn: 'w', ep: -1 };
              at = t; moves++;
              board.setBoard(pos.b, [[f, t]]); board.last([f, t]); board.arrows([]);
              stars.delete(t); board.stars([...stars]);
              fb(`Züge: ${moves}`);
              if (left()) return;
              xBtn.hidden = false; xBtn.textContent = '↺ Nochmal';
              if (moves <= par) ready(`Geschafft in ${moves} ${moves === 1 ? 'Zug' : 'Zügen'} – kürzer geht es nicht! ⭐`);
              else { extra = 1; ready(`Geschafft in ${moves} Zügen. Es geht auch in ${par} – versuch es nochmal oder mach weiter.`); }
            } });
          return {
            x: () => run(),
            beforeNext: () => { mistakes += extra; },
            tip: tipper(hintText(s), () => {
              const path = collectSolve(pos, at, [...stars]);
              if (path && path.length) board.arrows([[path[0][0], path[0][1], 'b']]);
            })
          };
        },

        move(s, p) { return STEP.seq({ ...s, line: [s.ok] }, p); },

        // Eigene Züge (line[k] = erlaubte Züge oder Prüffunktion), dazwischen antwortet der Computer
        seq(s, p) {
          const opts = s.opts || {};
          let pos = p, k = 0, solved = false, busy = false, lastPre = [], level = 0;
          const isOk = (m, n) => {
            const o = s.line[k];
            return Array.isArray(o) ? (o.some(u => C.uci(m).startsWith(u)) || s.wrong || 'Das ist erlaubt, aber nicht die Lösung. Versuch es noch einmal.') : o(pos, m, n);
          };
          const sols = () => C.legalMoves(pos, opts).filter(m => isOk(m, C.makeMove(pos, m)) === true);
          const setPrompt = () => { if (s.prompts && s.prompts[k]) promptEl.innerHTML = s.prompts[k]; };
          setPrompt();
          async function onMove(f, t) {
            if (busy || solved) return;
            // König auf den eigenen Turm gezogen = Rochade
            if (C.typeOf(pos.b[f]) === 'k' && pos.b[t] === C.pieceOf(pos.turn, 'r')) {
              const to = t > f ? f + 2 : f - 2;
              if (Math.abs(t - f) >= 3 && C.legalMoves(pos, { ...opts, from: f }).some(m => m.to === to)) t = to;
            }
            const cands = C.legalMoves(pos, { ...opts, from: f }).filter(m => m.to === t);
            if (!cands.length) { const why = C.explainIllegal(pos, f, t, opts); if (why) { board.flash(t, 'bad'); miss(why); } return; }
            let m = cands[0];
            if (cands.length > 1) {
              busy = true;
              const q = await askPromo(pos.turn);
              busy = false;
              if (!q || !board.el.isConnected) return;
              m = cands.find(x => x.promo === q);
            }
            const notation = C.san(pos, m), n = applyMove(pos, m), res = isOk(m, n);
            board.arrows([]); board.mark({});
            if (res === true) {
              pos = n;
              if (k === s.line.length - 1 || C.status(pos)) { solved = true; return ready(`${s.success || 'Richtig!'} <span class="cs-san">${notation}</span>`); }
              // Der Computer antwortet
              busy = true; k++; level = 0;
              fb(`Gut! <span class="cs-san">${notation}</span> – Schwarz überlegt …`, 'ok');
              later(() => {
                const r = A.bestMove(pos, 2), rs = C.san(pos, r);
                pos = applyMove(pos, r); lastPre = [r.from, r.to];
                busy = false; setPrompt();
                fb(`Schwarz antwortet <span class="cs-san">${rs}</span>.`);
              }, 700);
              return;
            }
            busy = true;
            miss(`<span class="cs-san">${notation}</span> ${res}`);
            later(() => {
              busy = false;
              board.setBoard(pos.b, animPairs(m).map(([a, b]) => [b, a]));
              board.last(lastPre);
              board.check(C.inCheck(pos) ? C.kingSq(pos, pos.turn) : -1);
            }, 1400);
          }
          board.set({ mode: 'move', onMove, movable: i => !solved && !busy && C.colorOf(pos.b[i]) === pos.turn,
            targets: i => C.legalMoves(pos, { ...opts, from: i }).map(m => m.to) });
          if (s.pre) {
            busy = true;
            s.pre.forEach((u, j) => later(() => {
              const m = C.parseUci(pos, u);
              pos = applyMove(pos, m); lastPre = [m.from, m.to];
              if (j === s.pre.length - 1) busy = false;
            }, 600 + j * 900));
          }
          // Tipps je Zug: Hinweistext (nur beim ersten Zug), dann die Figur, dann der Pfeil
          const levels = [
            k === 0 && s.hint ? () => fb('💡 ' + s.hint, 'tip') : null,
            () => { const m = sols()[0]; if (m) { board.addMark(m.from, 'hint'); fb('💡 Mit dieser Figur geht es.', 'tip'); } },
            () => { const m = sols()[0]; if (m) board.arrows([[m.from, m.to, 'g']]); }];
          return { tip() {
            if (busy || solved) return;
            if (!tipUsed) { tipUsed = true; mistakes++; }
            const avail = levels.filter((f, i) => f && (i > 0 || k === 0));
            avail[Math.min(level++, avail.length - 1)]();
          } };
        },

        // Gegen den verteidigenden Computer matt setzen
        endgame(s, p) {
          const limit = s.limit || 50;
          let pos = p, moves = 0, over = false, thinking = false, extra = 0;
          promptEl.innerHTML += ` <small class="muted">Gut wären höchstens ${s.target} Züge.</small>`;
          fb('Du spielst Weiß und bist am Zug.');
          const fail = msg => { over = true; board.set({ mode: 'none' }); miss(msg); xBtn.hidden = false; xBtn.textContent = '↺ Nochmal'; };
          board.set({ mode: 'move', movable: i => !over && !thinking && C.colorOf(pos.b[i]) === 'w',
            targets: i => C.legalMoves(pos, { from: i }).map(m => m.to),
            onMove: async (f, t) => {
              const cands = C.legalMoves(pos, { from: f }).filter(m => m.to === t);
              if (!cands.length) { const why = C.explainIllegal(pos, f, t); if (why) { board.flash(t, 'bad'); fb(why, 'bad'); } return; }
              let m = cands[0];
              if (cands.length > 1) { thinking = true; const q = await askPromo('w'); thinking = false; if (!q) return; m = cands.find(x => x.promo === q); }
              pos = applyMove(pos, m); moves++; board.arrows([]);
              const st = C.status(pos);
              if (st === 'mate') {
                over = true; xBtn.hidden = false; xBtn.textContent = '↺ Nochmal';
                if (moves <= s.target) return ready(`Schachmatt in ${moves} Zügen! ⭐`);
                extra = 1;
                return ready(`Schachmatt in ${moves} Zügen! Mit etwas Übung schaffst du es in höchstens ${s.target}.`);
              }
              if (st === 'stalemate') return fail('Patt! Schwarz steht nicht im Schach, kann aber nicht ziehen – unentschieden. Lass dem König immer ein Feld.');
              if (moves >= limit) return fail(`${limit} Züge ohne Matt – nach der 50-Züge-Regel ist die Partie remis. Versuch es noch einmal!`);
              thinking = true; fb(`Zug ${moves} · Schwarz überlegt …`);
              later(() => {
                const r = A.bestMove(pos, 2), rs = C.san(pos, r);
                pos = applyMove(pos, r); thinking = false;
                if (C.status(pos) === 'insufficient') return fail('Schwarz hat deine Figur geschlagen – jetzt kann niemand mehr matt setzen. Remis! Achte darauf, dass deine Figuren gedeckt sind oder weit genug weg stehen.');
                fb(`Zug ${moves} · Schwarz zieht <span class="cs-san">${rs}</span>. Du bist dran.`);
              }, 450);
            } });
          return {
            x: () => run(),
            beforeNext: () => { mistakes += extra; },
            tip: tipper(() => {
              if (over || thinking) return;
              const m = A.bestMove(pos, 3);
              board.arrows([[m.from, m.to, 'g']]);
              fb('💡 Ein guter Zug. Überlege, warum!', 'tip');
            })
          };
        },

        quiz(s, p) {
          if (!p) bdWrap.hidden = true;
          const ans = typeof s.answer === 'function' ? s.answer(p) : s.answer;
          const exp = typeof s.explain === 'function' ? s.explain(p) : s.explain;
          optsEl.innerHTML = s.options.map((o, i) => `<button class="btn" data-o="${i}">${o}</button>`).join('');
          let answered = false;
          optsEl.onclick = e => {
            const b = e.target.closest('[data-o]');
            if (!b || answered || b.disabled) return;
            answered = true;
            const i = +b.dataset.o;
            optsEl.querySelector(`[data-o="${ans}"]`).classList.add('good');
            if (i === ans) ready(exp);
            else { b.classList.add('bad'); miss(exp); ready(null); }
          };
          if (s.options.length < 3) { tipBtn.hidden = true; return; }
          // Tipp: eine falsche Antwort ausblenden
          return { tip: tipper(() => {
            const w = [...optsEl.querySelectorAll('[data-o]')].find(b => +b.dataset.o !== ans && !b.disabled);
            if (w) w.disabled = true;
          }) };
        },

        play(s) {
          let pos = C.parseFEN('8/pppppppp/8/8/8/8/PPPPPPPP/8 w - - 0 1'), over = false, thinking = false;
          showPos(pos);
          xBtn.hidden = false; xBtn.textContent = '↺ Neu starten';
          fb('Du spielst Weiß und fängst an.');
          const end = () => {
            const w = pawnWinner(pos);
            if (!w) return false;
            over = true; board.set({ mode: 'none' });
            if (w === 'w') ready('Gewonnen! 🎉');
            else miss(w === 'draw' ? 'Unentschieden – keiner kann mehr ziehen. Versuch es nochmal!' : 'Verloren – diesmal war Schwarz schneller. Neues Spiel?');
            return true;
          };
          board.set({ mode: 'move', movable: i => !over && !thinking && pos.b[i] === 'P',
            targets: i => C.legalMoves(pos, { ...PAWN_OPTS, from: i }).map(m => m.to),
            onMove: (f, t) => {
              const m = C.legalMoves(pos, { ...PAWN_OPTS, from: f }).find(x => x.to === t);
              if (!m) { const why = C.explainIllegal(pos, f, t, PAWN_OPTS); if (why) { board.flash(t, 'bad'); fb(why, 'bad'); } return; }
              pos = applyMove(pos, m); board.arrows([]);
              if (end()) return;
              thinking = true; fb('Der Computer überlegt …');
              later(() => {
                pos = applyMove(pos, pawnBestMove(pos, s.level));
                thinking = false;
                if (!end()) fb('Du bist dran.');
              }, 500);
            } });
          return {
            x: () => run(),
            tip: tipper(() => {
              if (over || thinking) return;
              const m = pawnBestMove(pos, 'stark');
              board.arrows([[m.from, m.to, 'g']]);
              fb('💡 Das empfiehlt der Computer.', 'tip');
            })
          };
        }
      };

      function finish() {
        const stars = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1, k = lessonKey(ch, L);
        prog = loadProg(pid);
        const before = prog.lessons[k] || 0, wasComplete = ch.lessons.every(l => prog.lessons[lessonKey(ch, l)]);
        if (stars > before) prog.lessons[k] = stars;
        const total = starsOf(prog, ch), complete = ch.lessons.every(l => prog.lessons[lessonKey(ch, l)]);
        const improved = complete && total > (prog.best[ch.id] || 0);
        if (improved) prog.best[ch.id] = total;
        S.set(progKey(pid), prog);
        info();
        const nextL = li + 1 < ch.lessons.length ? li + 1 : null;
        el.innerHTML = `<div class="cs-end">
          <div class="cs-stars">${[1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}" style="animation-delay:${i * .15}s">★</span>`).join('')}</div>
          <h2>${['', 'Geschafft!', 'Gut gemacht!', 'Perfekt!'][stars]}</h2>
          <p class="muted">${mistakes ? `${mistakes}× Fehler oder Tipp` : 'Ohne Fehler und ohne Tipp!'}</p>
          ${before && stars > before ? '<p class="hl">Neuer Bestwert für diese Lektion!</p>' : ''}
          ${stars < 3 ? '<p class="muted small">Wiederhole die Lektion für mehr Sterne.</p>' : ''}
          ${nextL !== null ? `<button class="btn primary wide" data-a="nextl">Weiter: ${ch.lessons[nextL].title} ›</button>` : ''}
          <div class="tools"><button class="btn" data-a="again">↺ Nochmal</button><button class="btn" data-a="ov">☰ Übersicht</button></div></div>`;
        const b = s => el.querySelector(s);
        if (b('[data-a=nextl]')) b('[data-a=nextl]').onclick = () => lesson(nextL);
        b('[data-a=again]').onclick = () => lesson(li);
        b('[data-a=ov]').onclick = overview;
        if (improved) ctx.finish({ won: true, value: total, delay: 1300, title: wasComplete ? '⭐ Mehr Sterne!' : '🎓 Kapitel geschafft!',
          detail: `Kapitel ${chNo}: ${ch.title}` });
      }

      run();
    }

    overview();
    return { destroy() { clearTimers(); } };
  }
};
export default game;

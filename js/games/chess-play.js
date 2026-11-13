// Schach gegen den Computer – mit Coach: warnt vor groben Fehlern, erlaubt Zurücknehmen und zeigt nach der Partie einen Rückblick.
import * as S from '../storage.js';
import * as C from '../lib/chess-core.js';
import { createBoard, pieceSVG } from '../lib/chess-board.js';
import { engineMove, analyze } from '../lib/chess-engine.js';

const GID = 'schach';
const LEVELS = {
  leicht: { depth: 1, ms: 300, noise: 120 },
  mittel: { depth: 2, ms: 800, noise: 35 },
  schwer: { depth: 4, ms: 1500, noise: 0 }
};
const WARN = 250;                      // ab diesem Verlust (Hundertstel Bauern) warnt der Coach
const BLUNDER = 300, MISTAKE = 150;    // Einstufung im Rückblick
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const setKey = pid => `prog:${pid}:${GID}`;
const posKey = p => C.toFEN(p).split(' ').slice(0, 4).join(' ');
const pawns = v => (v / 100).toLocaleString('de-DE', { maximumFractionDigits: 1 });

const game = {
  id: GID, name: 'Schach', icon: '♞',
  desc: 'Eine ganze Partie gegen den Computer – auf Wunsch mit Coach, der dich vor groben Fehlern warnt.',
  help: `<ul><li>Ziehe per Antippen (Figur, dann Zielfeld) oder mit dem Finger. Vor dem ersten Zug kannst du deine Farbe wählen.</li>
    <li><b>Coach:</b> Er warnt, wenn ein Zug eine Figur einstellt oder ein Matt zulässt, und wenn du ein Matt übersehen hast. Gefährdete eigene Figuren werden orange umrandet.</li>
    <li><b>↶ Zurück</b> nimmt deinen letzten Zug zurück, <b>💡 Tipp</b> zeigt einen guten Zug.</li>
    <li>Nach der Partie zeigt der <b>Rückblick</b>, wo es bessere Züge gab.</li>
    <li>Remis gibt es bei Patt, zu wenig Material, dreifacher Stellungswiederholung und nach der 50-Züge-Regel.</li>
    <li>Die Bestenliste wertet Siege nach der Zahl deiner Züge.</li></ul>`,
  variants: [{ id: 'leicht', label: 'Leicht' }, { id: 'mittel', label: 'Mittel' }, { id: 'schwer', label: 'Schwer' }],
  metric: { type: 'moves', better: 'low', label: 'Züge bis zum Sieg' },
  abandon: s => s && s.moves.length >= 2 && !s.over ? { won: false } : null,

  start(el, ctx) {
    const pid = ctx.profile.id, lvl = LEVELS[ctx.variant];
    const prefs = S.get(setKey(pid), { coach: true, color: 'w' });
    let st = ctx.saved || { moves: [], color: prefs.color, takebacks: 0, hints: 0, coachSaves: 0, review: [], over: null };
    let alive = true, busy = false, reviewing = null, warnPending = null;
    // Stellungen aus der Zugliste nachspielen
    let positions, sans;
    const rebuild = () => {
      positions = [C.parseFEN(C.START)]; sans = [];
      for (const u of st.moves) { const p = positions[positions.length - 1], m = C.parseUci(p, u); sans.push(C.san(p, m)); positions.push(C.makeMove(p, m)); }
    };
    rebuild();
    const pos = () => positions[positions.length - 1];
    const myTurn = () => !st.over && pos().turn === st.color;

    el.innerHTML = `<div class="cp">
      <div class="cp-bar"><span class="cp-who"></span><span class="cp-cap" data-c="opp"></span></div>
      <div class="cp-bd"></div>
      <div class="cp-bar"><span class="cp-who">👤 Du</span><span class="cp-cap" data-c="me"></span></div>
      <div class="cp-color" hidden>Du spielst: <button class="btn small" data-col="w">♔ Weiß</button><button class="btn small" data-col="b">♚ Schwarz</button></div>
      <div class="cs-fb cp-fb" aria-live="polite"></div>
      <div class="cp-warn" hidden><p></p><div class="tools"><button class="btn primary" data-a="undo-warn">↶ Zurücknehmen</button><button class="btn" data-a="keep">Trotzdem spielen</button></div></div>
      <div class="cp-end" hidden></div>
      <div class="tools cp-tools">
        <button class="btn small" data-a="back">↶ Zurück</button>
        <button class="btn small" data-a="tip">💡 Tipp</button>
        <button class="btn small" data-a="coach"></button>
        <button class="btn small" data-a="resign">⚑ Aufgeben</button>
        <button class="btn small" data-a="new">Neue Partie</button>
      </div>
      <div class="cp-review" hidden></div>
      <div class="cp-moves"></div></div>`;
    const $ = s => el.querySelector(s);
    const fbEl = $('.cp-fb'), warnEl = $('.cp-warn'), endEl = $('.cp-end'), reviewEl = $('.cp-review');
    const board = createBoard($('.cp-bd'), { orientation: st.color });
    $('.cp-who').textContent = `🤖 Computer (${ctx.variantLabel})`;
    const fb = (html, cls = '') => { fbEl.className = 'cs-fb cp-fb ' + cls; fbEl.innerHTML = html || ''; };
    const save = () => { if (!st.over) ctx.save(st); };

    /* ---------- Anzeige ---------- */
    function captured(color) {        // Figuren von `color`, die geschlagen wurden
      const start = { p: 8, n: 2, b: 2, r: 2, q: 1 }, have = { p: 0, n: 0, b: 0, r: 0, q: 0 };
      for (const x of pos().b) if (x && C.colorOf(x) === color && C.typeOf(x) !== 'k') have[C.typeOf(x)]++;
      const out = [];
      for (const t of 'qrbnp') for (let k = Math.max(0, start[t] - have[t]); k > 0; k--) out.push(C.pieceOf(color, t));
      return out;
    }
    function hanging(p, color) {      // eigene Figuren, die ungedeckt oder von Billigerem angegriffen sind
      const out = [];
      for (let i = 0; i < 64; i++) {
        const x = p.b[i];
        if (!x || C.colorOf(x) !== color || C.typeOf(x) === 'k') continue;
        const att = C.attackers(p, i, C.other(color));
        if (!att.length) continue;
        const def = C.attackers(p, i, color), cheapest = Math.min(...att.map(a => VAL[C.typeOf(p.b[a])]));
        if (!def.length || cheapest < VAL[C.typeOf(x)]) out.push(i);
      }
      return out;
    }
    function draw(anim) {
      const p = pos();
      board.setBoard(p.b, anim);
      const last = st.moves.length ? C.parseUci(positions[positions.length - 2], st.moves[st.moves.length - 1]) : null;
      board.last(last ? [last.from, last.to] : []);
      board.check(C.inCheck(p) ? C.kingSq(p, p.turn) : -1);
      board.arrows([]);
      board.mark(prefs.coach && myTurn() ? Object.fromEntries(hanging(p, st.color).map(i => [i, 'warn'])) : {});
      // geschlagene Figuren und Materialbilanz
      const mine = captured(C.other(st.color)), theirs = captured(st.color);
      const val = l => l.reduce((a, x) => a + VAL[C.typeOf(x)], 0), diff = val(mine) - val(theirs);
      const icons = l => l.map(x => `<span class="cp-ico">${pieceSVG(x)}</span>`).join('');
      el.querySelector('[data-c=me]').innerHTML = icons(mine) + (diff > 0 ? ` <b>+${diff}</b>` : '');
      el.querySelector('[data-c=opp]').innerHTML = icons(theirs) + (diff < 0 ? ` <b>+${-diff}</b>` : '');
      // Zugliste
      let h = '';
      sans.forEach((s, i) => { if (i % 2 === 0) h += `<b>${i / 2 + 1}.</b> `; h += `<span>${s}</span> `; });
      $('.cp-moves').innerHTML = h || '<span class="muted">Noch keine Züge.</span>';
      $('.cp-color').hidden = st.moves.length > 0 || !!st.over;
      el.querySelectorAll('[data-col]').forEach(b => b.classList.toggle('on', b.dataset.col === st.color));
      $('[data-a=coach]').textContent = `🎓 Coach: ${prefs.coach ? 'an' : 'aus'}`;
      $('[data-a=coach]').classList.toggle('on', prefs.coach);
      el.querySelectorAll('.cp-tools [data-a]').forEach(b => { if (b.dataset.a !== 'new' && b.dataset.a !== 'coach') b.disabled = !!st.over; });
      ctx.setInfo(st.moves.length ? `Zug ${Math.ceil(st.moves.length / 2)}` : '');
    }
    function status() {
      if (st.over) return;
      if (busy) return fb('Der Computer überlegt …');
      fb(myTurn() ? (C.inCheck(pos()) ? '<b>Schach!</b> Du musst dein König retten.' : 'Du bist am Zug.') : '');
    }

    /* ---------- Spielablauf ---------- */
    function push(m) {
      const p = pos();
      st.moves.push(C.uci(m)); sans.push(C.san(p, m)); positions.push(C.makeMove(p, m));
      draw([[m.from, m.to], ...(m.flag === 'k' ? [[m.to + 1, m.to - 1]] : m.flag === 'q' ? [[m.to - 2, m.to + 1]] : [])]);
    }
    function pop(n) {
      for (let i = 0; i < n && st.moves.length; i++) { st.moves.pop(); sans.pop(); positions.pop(); }
      st.review = st.review.filter(r => r.ply < st.moves.length);
      draw();
    }
    function checkEnd() {
      const p = pos(), s = C.status(p);
      let res = null;
      if (s === 'mate') res = p.turn === st.color ? ['loss', 'Schachmatt – der Computer hat gewonnen.'] : ['win', 'Schachmatt! Du hast gewonnen! 🎉'];
      else if (s === 'stalemate') res = ['draw', 'Patt – unentschieden.'];
      else if (s === 'insufficient') res = ['draw', 'Keiner kann mehr matt setzen – unentschieden.'];
      else if (s === 'fifty') res = ['draw', '50 Züge ohne Schlagen und Bauernzug – unentschieden.'];
      else if (positions.filter(q => posKey(q) === posKey(p)).length >= 3) res = ['draw', 'Dreimal dieselbe Stellung – unentschieden.'];
      if (res) end(...res);
      return !!res;
    }
    function end(result, text) {
      st.over = { result, text };
      busy = false; warnEl.hidden = true;
      board.set({ mode: 'none' });
      draw();
      fb(text, result === 'win' ? 'ok' : result === 'loss' ? 'bad' : '');
      const myMoves = Math.ceil(st.moves.length / 2);
      const extras = [prefs.coach ? 'mit Coach' : 'ohne Coach', st.takebacks ? `${st.takebacks}× zurück` : '', st.hints ? `${st.hints}× Tipp` : ''].filter(Boolean).join(' · ');
      ctx.finish({ won: result === 'win', draw: result === 'draw', value: myMoves, detail: `${ctx.variantLabel} · ${extras}`, quiet: true });
      endEl.hidden = false;
      endEl.innerHTML = `<div class="tools"><button class="btn primary" data-a="review">🔍 Rückblick</button><button class="btn" data-a="new">Neue Partie</button></div>`;
    }

    async function computer() {
      if (st.over || myTurn() || !alive) return;
      busy = true; status();
      const fen = C.toFEN(pos());
      const t0 = Date.now();
      const u = await engineMove(fen, lvl.depth, lvl.ms, lvl.noise);
      await new Promise(r => setTimeout(r, Math.max(0, 450 - (Date.now() - t0))));
      if (!alive || C.toFEN(pos()) !== fen) return;
      busy = false;
      push(C.parseUci(pos(), u));
      save();
      if (!checkEnd()) status();
    }

    async function userMove(f, t) {
      if (busy || !myTurn() || reviewing) return;
      const p = pos();
      if (C.typeOf(p.b[f]) === 'k' && p.b[t] === C.pieceOf(p.turn, 'r') && Math.abs(t - f) >= 3) {
        const to = t > f ? f + 2 : f - 2;
        if (C.legalMoves(p, { from: f }).some(m => m.to === to)) t = to;
      }
      const cands = C.legalMoves(p, { from: f }).filter(m => m.to === t);
      if (!cands.length) { const why = C.explainIllegal(p, f, t); if (why) { board.flash(t, 'bad'); fb(why, 'bad'); } return; }
      let m = cands[0];
      if (cands.length > 1) {
        busy = true;
        const q = await ctx.modal({ title: 'Umwandeln in …', html: '', buttons: ['q', 'r', 'b', 'n'].map(x => ({ label: `<span class="cs-promo">${pieceSVG(C.pieceOf(p.turn, x))}</span>`, value: x })) });
        busy = false;
        if (!q || !alive) return;
        m = cands.find(x => x.promo === q);
      }
      const fen = C.toFEN(p), ply = st.moves.length;
      push(m);
      if (checkEnd()) { st.review.push({ ply, uci: C.uci(m), san: sans[ply], loss: 0, best: C.uci(m), bestSan: sans[ply] }); return; }
      // Analyse für Coach und Rückblick
      busy = true; fb(prefs.coach ? '🎓 Der Coach schaut sich deinen Zug an …' : 'Der Computer überlegt …');
      const a = await analyze(fen, C.uci(m));
      if (!alive || st.moves.length !== ply + 1) return;
      if (a) st.review.push({ ply, uci: C.uci(m), san: sans[ply], loss: a.loss, best: a.best, bestSan: a.bestSan, missedMate: a.missedMate, allowsMate: a.allowsMate });
      if (prefs.coach && a && (a.missedMate || a.allowsMate || a.loss >= WARN)) {
        busy = false;
        let msg;
        if (a.allowsMate) msg = `Vorsicht! Danach kann der Computer <b>matt</b> setzen (${a.replySan}).`;
        else if (a.missedMate) msg = 'Moment! Du hättest hier <b>matt setzen</b> können. Schau noch einmal genau hin.';
        else if (a.replyCaptures) msg = `Vorsicht! Danach schlägt der Computer mit <b>${a.replySan}</b> ${({ p: 'einen Bauern', n: 'einen Springer', b: 'einen Läufer', r: 'einen Turm', q: 'die Dame' })[C.typeOf(a.replyCaptures)] || 'eine Figur'}.`;
        else msg = `Vorsicht! Nach diesem Zug kommst du in Nachteil (etwa ${pawns(a.loss)} Bauern). Der Computer antwortet z. B. mit <b>${a.replySan}</b>.`;
        if (a.reply && !a.missedMate) { const r = C.parseUci(pos(), a.reply); if (r) board.arrows([[r.from, r.to, 'r']]); }
        warnEl.hidden = false; warnEl.querySelector('p').innerHTML = '🎓 ' + msg;
        fb('');
        warnPending = true;
        return;
      }
      busy = false;
      save();
      computer();
    }

    /* ---------- Rückblick ---------- */
    function showReview() {
      const marks = r => r.missedMate ? '#?' : r.loss >= BLUNDER ? '??' : r.loss >= MISTAKE ? '?' : '';
      const items = st.review.filter(r => r.best !== undefined);
      const bad = items.filter(r => marks(r));
      const cnt = k => items.filter(r => marks(r) === k).length;
      reviewing = true;
      reviewEl.hidden = false; endEl.hidden = true;
      reviewEl.innerHTML = `<h3>🔍 Rückblick</h3>
        <p class="small">${bad.length ? `Grobe Fehler (??): <b>${cnt('??')}</b> · Fehler (?): <b>${cnt('?')}</b> · übersehene Matts: <b>${cnt('#?')}</b>. Tippe einen Zug an, um die bessere Fortsetzung zu sehen.`
          : 'Keine groben Fehler – stark gespielt! 👏'}</p>
        <div class="cp-rlist">${items.map((r, i) => `<button class="chip ${marks(r) ? 'bad' : ''}" data-r="${i}">${Math.floor(r.ply / 2) + 1}${r.ply % 2 ? '…' : '.'} ${r.san}${marks(r)}</button>`).join('')}</div>
        <p class="cp-rtext small"></p>
        <div class="tools"><button class="btn" data-a="review-close">Zurück zur Stellung</button><button class="btn primary" data-a="new">Neue Partie</button></div>`;
      reviewEl.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
        const r = items[+b.dataset.r], p = positions[r.ply];
        reviewEl.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('on', x === b));
        board.setBoard(p.b); board.mark({}); board.last([]); board.check(C.inCheck(p) ? C.kingSq(p, p.turn) : -1);
        const pm = C.parseUci(p, r.uci), bm = r.best && C.parseUci(p, r.best);
        board.arrows(marks(r) ? [[pm.from, pm.to, 'r'], ...(bm && r.best !== r.uci ? [[bm.from, bm.to, 'g']] : [])] : [[pm.from, pm.to, 'g']]);
        reviewEl.querySelector('.cp-rtext').innerHTML = r.best === r.uci || !marks(r) ? `<b>${r.san}</b> war gut.`
          : `Gespielt: <b>${r.san}</b> (rot)${r.missedMate ? ' – hier gab es ein Matt!' : r.loss < 50000 ? ` – kostet etwa ${pawns(r.loss)} Bauern` : ''}. Besser: <b>${r.bestSan}</b> (grün).`;
      });
      const first = reviewEl.querySelector('[data-r].bad') || reviewEl.querySelector('[data-r]');
      if (first) first.click();
    }

    /* ---------- Bedienung ---------- */
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-a],[data-col]');
      if (!b || b.disabled) return;
      if (b.dataset.col) {
        if (st.moves.length || busy) return;
        st.color = prefs.color = b.dataset.col; S.set(setKey(pid), prefs);
        board.flip(st.color); draw(); status(); computer();
        return;
      }
      switch (b.dataset.a) {
        case 'undo-warn':
          warnEl.hidden = true; warnPending = null; st.coachSaves++;
          pop(1); save(); status();
          break;
        case 'keep':
          warnEl.hidden = true; warnPending = null; board.arrows([]);
          save(); computer();
          break;
        case 'back': {
          if (busy || warnPending || st.over) return;
          const n = myTurn() ? 2 : 1;
          if (st.moves.length < n || (st.color === 'b' && st.moves.length - n < 1)) return fb('Es gibt noch keinen Zug zum Zurücknehmen.');
          st.takebacks++; pop(n); save(); status();
          break;
        }
        case 'tip': {
          if (busy || !myTurn()) return;
          busy = true; fb('💡 Der Computer sucht einen guten Zug …');
          const fen = C.toFEN(pos()), u = await engineMove(fen, 3, 1200, 0);
          busy = false;
          if (!alive || C.toFEN(pos()) !== fen) return;
          st.hints++;
          const m = C.parseUci(pos(), u);
          board.arrows([[m.from, m.to, 'g']]);
          fb(`💡 Wie wäre es mit <b>${C.san(pos(), m)}</b>?`, 'tip');
          save();
          break;
        }
        case 'coach':
          prefs.coach = !prefs.coach; S.set(setKey(pid), prefs);
          draw(); if (!busy && !warnPending) status();
          break;
        case 'resign':
          if (busy || st.moves.length < 2) return;
          if (await ctx.modal({ title: 'Aufgeben?', html: '<p>Willst du die Partie wirklich aufgeben?</p>', buttons: [{ label: 'Weiterspielen', value: false }, { label: 'Aufgeben', value: true, primary: true }] }))
            end('loss', 'Du hast aufgegeben.');
          break;
        case 'new':
          ctx.restart(game.abandon(st));
          break;
        case 'review': showReview(); break;
        case 'review-close':
          reviewing = false; reviewEl.hidden = true; endEl.hidden = false; draw();
          break;
      }
    });

    board.set({ mode: 'move', onMove: userMove,
      movable: i => !busy && !warnPending && !reviewing && myTurn() && C.colorOf(pos().b[i]) === st.color,
      targets: i => C.legalMoves(pos(), { from: i }).map(m => m.to) });
    draw();
    if (st.over) { board.set({ mode: 'none' }); fb(st.over.text); }
    else { status(); computer(); }

    return {
      pause() { save(); },
      destroy() { alive = false; save(); }
    };
  }
};
export default game;

const N = 8;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const WEIGHTS = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
  10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 1, 1, 1, 1, -2, 10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10, 5, 5, 10, -20, 100];
const DEPTH = { leicht: 1, mittel: 3, schwer: 5 };

// Steine, die ein Zug von p auf i umdreht
export function flips(b, i, p) {
  if (b[i]) return [];
  const r = Math.floor(i / N), c = i % N, out = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === 3 - p) { line.push(rr * N + cc); rr += dr; cc += dc; }
    if (line.length && rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === p) out.push(...line);
  }
  return out;
}
export const movesOf = (b, p) => { const m = []; for (let i = 0; i < 64; i++) if (!b[i] && flips(b, i, p).length) m.push(i); return m; };
function play(b, i, p) { const f = flips(b, i, p); b[i] = p; f.forEach(k => b[k] = p); return f; }
const count = (b, p) => b.reduce((a, v) => a + (v === p), 0);

function evaluate(b) {   // aus Sicht des Computers (2)
  let s = 0;
  for (let i = 0; i < 64; i++) if (b[i] === 2) s += WEIGHTS[i]; else if (b[i] === 1) s -= WEIGHTS[i];
  // Ecken besetzt → angrenzende Felder sind nicht mehr gefährlich
  for (const [corner, adj] of [[0, [1, 8, 9]], [7, [6, 14, 15]], [56, [48, 49, 57]], [63, [54, 55, 62]]])
    if (b[corner]) for (const a of adj) if (b[a] === b[corner]) s += (b[a] === 2 ? 1 : -1) * 30;
  s += 4 * (movesOf(b, 2).length - movesOf(b, 1).length);
  return s;
}
function search(b, depth, alpha, beta, p, passed) {   // Negamax, Wert aus Sicht von p
  const ms = movesOf(b, p);
  if (!ms.length) {
    if (passed) { const d = count(b, 2) - count(b, 1); return (p === 2 ? 1 : -1) * d * 10000; }
    return -search(b, depth, -beta, -alpha, 3 - p, true);
  }
  if (depth === 0) return p === 2 ? evaluate(b) : -evaluate(b);
  let best = -Infinity;
  ms.sort((x, y) => WEIGHTS[y] - WEIGHTS[x]);
  for (const i of ms) {
    const nb = b.slice(); play(nb, i, p);
    const sc = -search(nb, depth - 1, -beta, -alpha, 3 - p, false);
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
export function bestMove(b, level) {
  const ms = movesOf(b, 2);
  if (level === 'leicht' && Math.random() < 0.35) return ms[Math.floor(Math.random() * ms.length)];
  let best = -Infinity, pick = [];
  for (const i of ms) {
    const nb = b.slice(); play(nb, i, 2);
    const sc = -search(nb, DEPTH[level] - 1, -Infinity, Infinity, 1, false);
    if (sc > best) { best = sc; pick = [i]; } else if (sc === best) pick.push(i);
  }
  return pick[Math.floor(Math.random() * pick.length)];
}

const game = {
  id: 'reversi', name: 'Reversi', icon: '⚫',
  desc: 'Schließe gegnerische Steine ein, um sie umzudrehen. Wer am Ende mehr Steine hat, gewinnt.',
  help: `<ul><li>Du spielst Schwarz und beginnst. Erlaubte Felder sind mit einem Punkt markiert.</li>
    <li>Ein Zug muss gegnerische Steine in einer Linie (auch diagonal) zwischen dem neuen und einem eigenen Stein einschließen – diese werden umgedreht.</li>
    <li>Kann jemand nicht ziehen, muss er passen. Das Spiel endet, wenn keiner mehr ziehen kann.</li>
    <li>Ecken sind wertvoll, die Felder daneben gefährlich.</li>
    <li>Die Bestenliste wertet die Zahl deiner Steine bei einem Sieg.</li></ul>`,
  variants: [{ id: 'leicht', label: 'Leicht' }, { id: 'mittel', label: 'Mittel' }, { id: 'schwer', label: 'Schwer' }],
  metric: { type: 'points', unit: 'Steine', better: 'high', label: 'Steine am Ende (bei Sieg)' },
  abandon: s => s.moves > 0 ? { won: false } : null,

  start(el, ctx) {
    let st = ctx.saved;
    if (!st) {
      const b = new Array(64).fill(0);
      b[27] = 2; b[36] = 2; b[28] = 1; b[35] = 1;
      st = { b, turn: 1, moves: 0, last: -1 };
    }
    let over = false, thinking = false, flipped = [], aiTimer = null;

    el.innerHTML = `<div class="rv">
      <div class="rv-score"><span class="rv-me">⚫ <b></b></span><span class="rv-status"></span><span class="rv-ai"><b></b> ⚪</span></div>
      <div class="rv-board">${'<div class="rv-c"><div class="rv-s"></div></div>'.repeat(64)}</div>
      <div class="tools"><button class="btn small" data-a="new">Neues Spiel</button></div></div>`;
    const cells = [...el.querySelectorAll('.rv-c')], status = el.querySelector('.rv-status');
    cells.forEach((c, i) => c.dataset.i = i);

    function render() {
      const legal = st.turn === 1 && !over && !thinking ? new Set(movesOf(st.b, 1)) : new Set();
      cells.forEach((c, i) => {
        const v = st.b[i];
        c.classList.toggle('legal', legal.has(i));
        c.firstChild.className = 'rv-s' + (v === 1 ? ' p1' : v === 2 ? ' p2' : '') + (i === st.last ? ' last' : '') + (flipped.includes(i) ? ' flip' : '');
      });
      flipped = [];
      el.querySelector('.rv-me b').textContent = count(st.b, 1);
      el.querySelector('.rv-ai b').textContent = count(st.b, 2);
      status.textContent = over ? '' : st.turn === 1 ? 'Du bist dran' : 'Computer überlegt …';
      ctx.setInfo(`⚫ ${count(st.b, 1)} : ${count(st.b, 2)} ⚪`);
    }

    function next() {
      const me = movesOf(st.b, 1).length, ai = movesOf(st.b, 2).length;
      if (!me && !ai) return end();
      if (st.turn === 1 && !me) { st.turn = 2; ctx.toast('Du kannst nicht ziehen – du musst passen'); }
      else if (st.turn === 2 && !ai) { st.turn = 1; ctx.toast('Der Computer muss passen'); }
      render(); ctx.save(st);
      if (st.turn === 2) aiTurn();
    }
    function end() {
      over = true; render();
      const me = count(st.b, 1), ai = count(st.b, 2);
      status.textContent = me > ai ? 'Gewonnen!' : me < ai ? 'Verloren' : 'Unentschieden';
      if (me > ai) ctx.finish({ won: true, value: me, detail: `${me}:${ai} gegen ${ctx.variantLabel}`, delay: 900 });
      else if (me < ai) ctx.finish({ won: false, delay: 900, message: `${me}:${ai}` });
      else ctx.finish({ won: false, draw: true, delay: 900 });
    }
    function aiTurn() {
      thinking = true; render();
      aiTimer = setTimeout(() => {
        const i = bestMove(st.b.slice(), ctx.variant);
        thinking = false;
        flipped = play(st.b, i, 2); st.last = i; st.turn = 1;
        next();
      }, 500);
    }
    el.querySelector('.rv-board').addEventListener('click', e => {
      const c = e.target.closest('.rv-c');
      if (!c || over || thinking || st.turn !== 1) return;
      const i = +c.dataset.i;
      if (!flips(st.b, i, 1).length) return;
      flipped = play(st.b, i, 1); st.last = i; st.moves++; st.turn = 2;
      next();
    });
    el.querySelector('[data-a=new]').onclick = () => ctx.restart(game.abandon(st));

    render();
    if (st.turn === 2) aiTurn(); else if (!movesOf(st.b, 1).length) next();
    return {
      pause() { if (!over) ctx.save(st); },
      destroy() { clearTimeout(aiTimer); if (!over) ctx.save(st); }
    };
  }
};
export default game;

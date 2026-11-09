const W = 7, H = 6;
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const DEPTH = { leicht: 2, mittel: 4, schwer: 7 };

// Alle Viererfenster für die Bewertung
const WINDOWS = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const r3 = r + 3 * dr, c3 = c + 3 * dc;
    if (r3 < H && c3 >= 0 && c3 < W) WINDOWS.push([0, 1, 2, 3].map(k => (r + k * dr) * W + c + k * dc));
  }
}

export function drop(b, c, p) {
  for (let r = H - 1; r >= 0; r--) if (!b[r * W + c]) { b[r * W + c] = p; return r * W + c; }
  return -1;
}
export function lineAt(b, i) {   // Gewinnreihe durch Feld i oder null
  const p = b[i], r = Math.floor(i / W), c = i % W;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [i];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < H && cc >= 0 && cc < W && b[rr * W + cc] === p) { cells.push(rr * W + cc); rr += dr * s; cc += dc * s; }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}
function evaluate(b) {   // positiv = gut für den Computer (2)
  let s = 0;
  for (let r = 0; r < H; r++) { const v = b[r * W + 3]; if (v === 2) s += 3; else if (v === 1) s -= 3; }
  for (const w of WINDOWS) {
    let a = 0, h = 0;
    for (const i of w) { if (b[i] === 2) a++; else if (b[i] === 1) h++; }
    if (a && h) continue;
    if (a === 3) s += 5; else if (a === 2) s += 2;
    else if (h === 3) s -= 6; else if (h === 2) s -= 2;
  }
  return s;
}
function search(b, depth, alpha, beta, p) {   // Negamax mit Alpha-Beta, Wert aus Sicht von p
  let best = -Infinity, any = false;
  for (const c of ORDER) {
    const i = drop(b, c, p);
    if (i < 0) continue;
    any = true;
    let sc;
    if (lineAt(b, i)) sc = 100000 + depth;
    else if (depth <= 1) sc = p === 2 ? evaluate(b) : -evaluate(b);
    else sc = -search(b, depth - 1, -beta, -alpha, 3 - p);
    b[i] = 0;
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return any ? best : 0;
}
export function bestMove(b, level) {
  const legal = ORDER.filter(c => !b[c]);
  if (level === 'leicht' && Math.random() < 0.3) return legal[Math.floor(Math.random() * legal.length)];
  const depth = DEPTH[level];
  let best = -Infinity, cols = [];
  for (const c of legal) {
    const i = drop(b, c, 2);
    const sc = lineAt(b, i) ? 100000 + depth : depth <= 1 ? evaluate(b) : -search(b, depth - 1, -Infinity, Infinity, 1);
    b[i] = 0;
    if (sc > best) { best = sc; cols = [c]; } else if (sc === best) cols.push(c);
  }
  return cols[Math.floor(Math.random() * cols.length)];
}

const game = {
  id: 'vier', name: 'Vier gewinnt', icon: '🔴',
  desc: 'Spiele gegen den Computer: Wer zuerst vier Steine in eine Reihe bringt, gewinnt.',
  help: `<ul><li>Tippe in eine Spalte, um deinen roten Stein einzuwerfen.</li>
    <li>Waagerecht, senkrecht oder diagonal – vier in einer Reihe gewinnen.</li>
    <li>Die Bestenliste wertet Siege mit möglichst wenigen Zügen. Die Statistik zeigt Siegquote und Serien.</li>
    <li>Ihr beginnt abwechselnd.</li></ul>`,
  variants: [{ id: 'leicht', label: 'Leicht' }, { id: 'mittel', label: 'Mittel' }, { id: 'schwer', label: 'Schwer' }],
  metric: { type: 'moves', better: 'low', label: 'Züge bis zum Sieg' },
  abandon: s => s.moves > 0 ? { won: false } : null,

  start(el, ctx) {
    let st = ctx.saved;
    if (!st) {
      // abwechselnd beginnen, gemerkt pro Gerät
      let starter = 1;
      try { starter = localStorage.getItem('vier-starter') === '2' ? 2 : 1; localStorage.setItem('vier-starter', starter === 1 ? '2' : '1'); } catch (_) {}
      st = { b: new Array(W * H).fill(0), turn: starter, moves: 0, last: -1 };
    }
    let over = false, thinking = false, win = [], anim = -1, aiTimer = null;

    el.innerHTML = `<div class="c4"><div class="c4-status"></div>
      <div class="c4-board">${[...Array(W * H).keys()].map(i => `<div class="c4-h" data-c="${i % W}"><div class="c4-s"></div></div>`).join('')}</div>
      <div class="tools"><button class="btn small" data-a="new">Neues Spiel</button></div></div>`;
    const holes = [...el.querySelectorAll('.c4-h')], status = el.querySelector('.c4-status');

    function render() {
      holes.forEach((hEl, i) => {
        const s = hEl.firstChild, v = st.b[i];
        s.className = 'c4-s' + (v === 1 ? ' p1' : v === 2 ? ' p2' : '') + (win.includes(i) ? ' win' : '') + (i === st.last && !win.length ? ' last' : '') + (i === anim ? ' drop' : '');
        if (i === anim) s.style.setProperty('--row', Math.floor(i / W) + 1);
      });
      anim = -1;
      status.textContent = over ? '' : st.turn === 1 ? 'Du bist dran 🔴' : 'Computer überlegt … 🟡';
      ctx.setInfo(`Zug ${Math.ceil((st.moves + 1))}`);
    }
    function after(p, i) {
      st.last = i; anim = i;
      const line = lineAt(st.b, i);
      if (line) {
        over = true; win = line; render();
        status.textContent = p === 1 ? 'Gewonnen! 🎉' : 'Der Computer gewinnt.';
        return ctx.finish(p === 1 ? { won: true, value: st.moves, detail: ctx.variantLabel, delay: 900 } : { won: false, delay: 1100 });
      }
      if (st.b.slice(0, W).every(Boolean)) {
        over = true; render(); status.textContent = 'Unentschieden';
        return ctx.finish({ won: false, draw: true, delay: 800 });
      }
      st.turn = 3 - p;
      render(); ctx.save(st);
      if (st.turn === 2) aiTurn();
    }
    function aiTurn() {
      thinking = true;
      aiTimer = setTimeout(() => {
        const c = bestMove(st.b.slice(), ctx.variant);
        thinking = false;
        after(2, drop(st.b, c, 2));
      }, 450);
    }
    el.querySelector('.c4-board').addEventListener('click', e => {
      const hEl = e.target.closest('.c4-h');
      if (!hEl || over || thinking || st.turn !== 1) return;
      const i = drop(st.b, +hEl.dataset.c, 1);
      if (i < 0) return;
      st.moves++;
      after(1, i);
    });
    el.querySelector('[data-a=new]').onclick = () => ctx.restart(game.abandon(st));

    render();
    if (st.turn === 2) aiTurn();
    return {
      key(e) {
        const c = +e.key - 1;
        if (c >= 0 && c < W && !over && !thinking && st.turn === 1) {
          const i = drop(st.b, c, 1);
          if (i >= 0) { st.moves++; after(1, i); }
        }
      },
      pause() { if (!over) ctx.save(st); },
      destroy() { clearTimeout(aiTimer); if (!over) ctx.save(st); }
    };
  }
};
export default game;

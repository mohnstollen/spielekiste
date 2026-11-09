import { onSwipe, KEYDIR } from '../lib/util.js';

const game = {
  id: '2048', name: '2048', icon: '🟧',
  desc: 'Schiebe die Kacheln zusammen. Gleiche Zahlen verschmelzen – schaffst du 2048 und mehr?',
  help: `<ul><li>Wischen (oder Pfeiltasten) schiebt alle Kacheln in eine Richtung.</li>
    <li>Zwei gleiche Kacheln verschmelzen und bringen ihren neuen Wert als Punkte.</li>
    <li>Das Spiel endet, wenn kein Zug mehr möglich ist. Gewertet wird die Punktzahl.</li></ul>`,
  variants: [{ id: '4', label: 'Klassisch 4×4' }, { id: '5', label: 'Groß 5×5' }],
  metric: { type: 'points', better: 'high', label: 'Punkte', always: true },
  abandon: s => s.score > 0 ? { won: false, value: s.score, detail: `Höchste Kachel ${Math.max(...s.grid)}` } : null,

  start(el, ctx) {
    const N = +ctx.variant;
    let st = ctx.saved;
    let over = false, fresh = new Set(), merged = new Set();
    if (!st) { st = { grid: new Array(N * N).fill(0), score: 0, reached: false }; addTile(); addTile(); }

    el.innerHTML = `<div class="g2">
      <div class="g2-score"><div><small>Punkte</small><b class="sc"></b></div><div><small>Höchste Kachel</small><b class="mx"></b></div></div>
      <div class="g2-board" style="--n:${N}">${'<div class="g2-t"></div>'.repeat(N * N)}</div>
      <p class="muted small center">Wischen oder Pfeiltasten</p>
      <div class="tools"><button class="btn small" data-a="new">Neues Spiel</button></div></div>`;
    const tiles = [...el.querySelectorAll('.g2-t')], board = el.querySelector('.g2-board');

    function addTile() {
      const empty = st.grid.map((v, i) => v ? -1 : i).filter(i => i >= 0);
      if (!empty.length) return;
      const i = empty[Math.floor(Math.random() * empty.length)];
      st.grid[i] = Math.random() < 0.9 ? 2 : 4;
      fresh.add(i);
    }
    function line(dir, k) {
      return [...Array(N).keys()].map(j => ({
        left: k * N + j, right: k * N + (N - 1 - j), up: j * N + k, down: (N - 1 - j) * N + k
      })[dir]);
    }
    function canMove() {
      for (let i = 0; i < N * N; i++) {
        if (!st.grid[i]) return true;
        if (i % N < N - 1 && st.grid[i] === st.grid[i + 1]) return true;
        if (i + N < N * N && st.grid[i] === st.grid[i + N]) return true;
      }
      return false;
    }
    function move(dir) {
      if (over || !['left', 'right', 'up', 'down'].includes(dir)) return;
      let moved = false;
      fresh = new Set(); merged = new Set();
      for (let k = 0; k < N; k++) {
        const idx = line(dir, k), vals = idx.map(i => st.grid[i]).filter(Boolean), out = [], mf = [];
        for (let t = 0; t < vals.length; t++) {
          if (t + 1 < vals.length && vals[t] === vals[t + 1]) { out.push(vals[t] * 2); st.score += vals[t] * 2; mf.push(true); t++; }
          else { out.push(vals[t]); mf.push(false); }
        }
        while (out.length < N) out.push(0);
        idx.forEach((i, j) => { if (st.grid[i] !== out[j]) moved = true; st.grid[i] = out[j]; if (mf[j]) merged.add(i); });
      }
      if (!moved) return;
      addTile();
      render();
      if (!st.reached && st.grid.some(v => v >= 2048)) { st.reached = true; ctx.toast('🎉 2048 erreicht – weiter geht’s!'); }
      if (!canMove()) {
        over = true;
        ctx.finish({ won: false, value: st.score, detail: `Höchste Kachel ${Math.max(...st.grid)}`, delay: 800 });
      } else ctx.save(st);
    }
    function render() {
      tiles.forEach((t, i) => {
        const v = st.grid[i];
        t.className = 'g2-t' + (v ? ' v' + (v > 2048 ? 'big' : v) : '') + (fresh.has(i) ? ' new' : '') + (merged.has(i) ? ' pop' : '');
        t.dataset.l = String(v).length;
        t.textContent = v || '';
      });
      el.querySelector('.sc').textContent = st.score.toLocaleString('de-DE');
      el.querySelector('.mx').textContent = Math.max(...st.grid);
      ctx.setInfo(`${st.score.toLocaleString('de-DE')} P`);
    }

    onSwipe(board, move, { min: 28 });
    el.querySelector('[data-a=new]').onclick = () => ctx.restart(game.abandon(st));
    render();
    return {
      key(e) { const d = KEYDIR[e.key]; if (d) { e.preventDefault(); move(d); } },
      pause() { if (!over) ctx.save(st); },
      destroy() { if (!over) ctx.save(st); }
    };
  }
};
export default game;

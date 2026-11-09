import { Stopwatch, shuffle } from '../lib/util.js';

const SYMBOLS = ['🐶', '🐱', '🦊', '🐻', '🐼', '🐸', '🐵', '🦁', '🐷', '🐰', '🦉', '🐙', '🦋', '🐢', '🍎', '🍌', '🍓', '🍉', '🥕', '🌻', '⭐', '🚗', '⚽', '🎈'];
const V = { klein: { cols: 4, rows: 4 }, mittel: { cols: 4, rows: 5 }, gross: { cols: 6, rows: 6 } };

const game = {
  id: 'memory', name: 'Memory', icon: '🧠',
  desc: 'Finde alle Paare. Zwei Karten aufdecken – passen sie zusammen, bleiben sie liegen.',
  help: `<ul><li>Tippe zwei Karten an. Gleiche Bilder bleiben offen, sonst werden sie wieder umgedreht.</li>
    <li>Gewertet werden die Züge (je zwei aufgedeckte Karten). Die Zeit steht als Zusatz in der Bestenliste.</li></ul>`,
  variants: [{ id: 'klein', label: '8 Paare (4×4)' }, { id: 'mittel', label: '10 Paare (4×5)' }, { id: 'gross', label: '18 Paare (6×6)' }],
  metric: { type: 'moves', better: 'low', label: 'Züge' },
  abandon: s => s.moves > 0 ? { won: false } : null,

  start(el, ctx) {
    const { cols, rows } = V[ctx.variant], n = cols * rows;
    let st = ctx.saved;
    if (!st) {
      const sym = shuffle(SYMBOLS.slice()).slice(0, n / 2);
      st = { cards: shuffle([...sym, ...sym]), found: new Array(n).fill(0), moves: 0, elapsed: 0 };
    }
    const sw = new Stopwatch(st.elapsed);
    let open = [], over = false, lock = null;

    el.innerHTML = `<div class="mm">
      <div class="mm-board" style="grid-template-columns:repeat(${cols},1fr);--cols:${cols}">
        ${st.cards.map((s, i) => `<button class="mm-c" data-i="${i}"><span class="mm-in"><span class="mm-back"></span><span class="mm-front">${s}</span></span></button>`).join('')}
      </div>
      <div class="tools"><button class="btn small" data-a="new">Neues Spiel</button></div></div>`;
    const cards = [...el.querySelectorAll('.mm-c')];

    const save = () => ctx.save({ ...st, elapsed: sw.ms });
    const info = () => ctx.setInfo(`${st.moves} ${st.moves === 1 ? 'Zug' : 'Züge'} · ⏱ ${ctx.fmtTime(sw.ms / 1000)}`);
    function render() {
      cards.forEach((c, i) => {
        c.classList.toggle('up', !!st.found[i] || open.includes(i));
        c.classList.toggle('done', !!st.found[i]);
      });
      info();
    }
    function flip(i) {
      if (over || st.found[i] || open.includes(i)) return;
      if (lock) { clearTimeout(lock); lock = null; open = []; }   // schnelles Weitertippen: falsches Paar sofort zudecken
      sw.run();
      open.push(i);
      if (open.length === 2) {
        st.moves++;
        const [a, b] = open;
        if (st.cards[a] === st.cards[b]) {
          st.found[a] = st.found[b] = 1; open = [];
          navigator.vibrate && navigator.vibrate(25);
          if (st.found.every(Boolean)) {
            over = true; sw.stop(); render();
            return ctx.finish({ won: true, value: st.moves, detail: `in ${ctx.fmtTime(sw.ms / 1000)}`, delay: 700 });
          }
        } else lock = setTimeout(() => { lock = null; open = []; render(); }, 900);
        save();
      }
      render();
    }
    el.querySelector('.mm-board').addEventListener('click', e => { const c = e.target.closest('.mm-c'); if (c) flip(+c.dataset.i); });
    el.querySelector('[data-a=new]').onclick = () => ctx.restart(game.abandon(st));

    render();
    if (st.moves) sw.run();
    const iv = setInterval(info, 500);
    return {
      pause() { sw.stop(); if (!over) save(); },
      resume() { if (!over && st.moves) sw.run(); },
      destroy() { clearInterval(iv); clearTimeout(lock); if (!over) { sw.stop(); save(); } }
    };
  }
};
export default game;

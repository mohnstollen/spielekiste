import { Stopwatch, shuffle } from '../lib/util.js';

const V = { anfaenger: { w: 9, h: 9, m: 10 }, mittel: { w: 16, h: 16, m: 40 }, experte: { w: 16, h: 30, m: 99 } };

const game = {
  id: 'minesweeper', name: 'Minesweeper', icon: '💣',
  desc: 'Decke alle Felder ohne Mine auf. Die Zahlen verraten, wie viele Minen angrenzen.',
  help: `<ul><li>Antippen deckt ein Feld auf. Das erste Feld ist immer sicher.</li>
    <li><b>Lange drücken</b> (oder Rechtsklick) setzt eine Fahne. Alternativ oben auf „Markieren“ umschalten.</li>
    <li>Tippst du auf eine Zahl, um die schon genug Fahnen liegen, werden die restlichen Nachbarn aufgedeckt.</li></ul>`,
  variants: [{ id: 'anfaenger', label: 'Anfänger 9×9' }, { id: 'mittel', label: 'Mittel 16×16' }, { id: 'experte', label: 'Experte 16×30' }],
  metric: { type: 'time', better: 'low', label: 'Zeit' },
  abandon: s => s.mines ? { won: false } : null,

  start(el, ctx) {
    const cfg = V[ctx.variant];
    const { w, h, m } = cfg, n = w * h;
    let st = ctx.saved || { mines: null, open: new Array(n).fill(0), flag: new Array(n).fill(0), elapsed: 0 };
    const sw = new Stopwatch(st.elapsed);
    let over = false, flagMode = false, boom = -1;

    const NB = [...Array(n).keys()].map(i => {
      const x = i % w, y = Math.floor(i / w), out = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const X = x + dx, Y = y + dy;
        if (X >= 0 && X < w && Y >= 0 && Y < h) out.push(Y * w + X);
      }
      return out;
    });
    const count = i => NB[i].reduce((a, k) => a + st.mines[k], 0);

    el.innerHTML = `<div class="ms">
      <div class="tools"><button class="btn" data-a="mode"></button><button class="btn small" data-a="new">Neues Spiel</button></div>
      <div class="ms-wrap"><div class="ms-board" style="grid-template-columns:repeat(${w},var(--cs))">${'<div class="ms-c"></div>'.repeat(n)}</div></div>
      <p class="muted small center">Lange drücken = Fahne setzen</p></div>`;
    const board = el.querySelector('.ms-board'), cells = [...board.children], modeBtn = el.querySelector('[data-a=mode]');
    cells.forEach((c, i) => c.dataset.i = i);

    function size() {
      const cs = Math.max(19, Math.min(40, Math.floor((el.clientWidth - 4 - (w - 1) * 2) / w)));
      board.style.setProperty('--cs', cs + 'px');
    }
    const flags = () => st.flag.reduce((a, b) => a + b, 0);
    const info = () => ctx.setInfo(`💣 ${m - flags()} · ⏱ ${ctx.fmtTime(sw.ms / 1000)}`);
    const save = () => ctx.save({ ...st, elapsed: sw.ms });

    function render() {
      modeBtn.textContent = flagMode ? '🚩 Modus: Markieren' : '⛏ Modus: Aufdecken';
      modeBtn.classList.toggle('on', flagMode);
      cells.forEach((c, i) => {
        let cls = 'ms-c', txt = '';
        if (st.open[i]) {
          const k = count(i);
          cls += ' o n' + k; txt = k || '';
        } else if (st.flag[i]) {
          cls += over && st.mines && !st.mines[i] ? ' wrong' : ' f'; txt = '🚩';
        } else if (over && st.mines && st.mines[i]) {
          cls += i === boom ? ' boom' : ' mine'; txt = '💣';
        }
        c.className = cls; c.textContent = txt;
      });
    }

    function placeMines(first) {
      const banned = new Set([first, ...NB[first]]);
      const pool = shuffle([...Array(n).keys()].filter(i => !banned.has(i))).slice(0, m);
      st.mines = new Array(n).fill(0);
      pool.forEach(i => st.mines[i] = 1);
    }

    function reveal(i) {
      if (st.open[i] || st.flag[i] || over) return;
      if (st.mines[i]) return lose(i);
      const stack = [i];
      while (stack.length) {
        const k = stack.pop();
        if (st.open[k] || st.flag[k]) continue;
        st.open[k] = 1;
        if (!count(k)) NB[k].forEach(j => { if (!st.open[j]) stack.push(j); });
      }
    }

    function lose(i) {
      over = true; boom = i; sw.stop();
      navigator.vibrate && navigator.vibrate(200);
      render();
      ctx.finish({ won: false, delay: 1000 });
    }

    function checkWin() {
      if (over) return;
      if (st.open.reduce((a, b) => a + b, 0) === n - m) {
        over = true; sw.stop();
        st.flag = st.mines.slice();
        render(); info();
        ctx.finish({ won: true, value: sw.sec, delay: 600 });
      }
    }

    function toggleFlag(i) {
      if (over || st.open[i]) return;
      st.flag[i] ^= 1;
      navigator.vibrate && navigator.vibrate(20);
      render(); info(); save();
    }

    function tap(i) {
      if (over) return;
      if (flagMode && !st.open[i]) return toggleFlag(i);
      if (!st.mines) { if (st.flag[i]) return; placeMines(i); sw.run(); }
      if (st.open[i]) {
        const k = count(i);
        if (k && NB[i].filter(j => st.flag[j]).length === k) NB[i].forEach(j => reveal(j));
      } else reveal(i);
      if (!over) { render(); checkWin(); if (!over) save(); }
      info();
    }

    // Antippen, langes Drücken, Rechtsklick
    let lp = null, lpFired = false, lastType = 'mouse', px = 0, py = 0;
    board.addEventListener('pointerdown', e => {
      const c = e.target.closest('.ms-c'); if (!c) return;
      lastType = e.pointerType; lpFired = false; px = e.clientX; py = e.clientY;
      clearTimeout(lp);
      if (e.pointerType !== 'mouse') lp = setTimeout(() => { lpFired = true; toggleFlag(+c.dataset.i); }, 380);
    });
    board.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - px, e.clientY - py) > 10) clearTimeout(lp); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => board.addEventListener(t, () => clearTimeout(lp)));
    board.addEventListener('click', e => {
      const c = e.target.closest('.ms-c'); if (!c) return;
      if (lpFired) { lpFired = false; return; }
      tap(+c.dataset.i);
    });
    board.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (lastType !== 'mouse') return;
      const c = e.target.closest('.ms-c'); if (c) toggleFlag(+c.dataset.i);
    });
    el.querySelector('.tools').addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'mode') { flagMode = !flagMode; render(); }
      else ctx.restart(game.abandon(st));
    });

    size(); render(); info();
    if (st.mines) sw.run();
    const iv = setInterval(info, 500);
    return {
      key(e) { if (e.key === 'f' || e.key === ' ') { e.preventDefault(); flagMode = !flagMode; render(); } },
      resize: size,
      pause() { sw.stop(); if (!over) save(); },
      resume() { if (!over && st.mines) sw.run(); },
      destroy() { clearInterval(iv); if (!over) { sw.stop(); save(); } }
    };
  }
};
export default game;

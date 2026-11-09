import { onSwipe, KEYDIR } from '../lib/util.js';

const SPEED = { langsam: 170, normal: 120, schnell: 80 };
const N = 17;
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

const game = {
  id: 'snake', name: 'Snake', icon: '🐍',
  desc: 'Steuere die Schlange zum Futter. Sie wächst mit jedem Happen – nicht gegen Wand oder Schwanz stoßen!',
  help: `<ul><li>Wischen auf dem Spielfeld, Steuerkreuz oder Pfeiltasten lenken die Schlange.</li>
    <li>Tippen aufs Feld (oder Leertaste) pausiert.</li><li>Jeder Happen bringt 10 Punkte.</li></ul>`,
  variants: [{ id: 'langsam', label: 'Gemütlich' }, { id: 'normal', label: 'Normal' }, { id: 'schnell', label: 'Schnell' }],
  metric: { type: 'points', better: 'high', label: 'Punkte', always: true },
  abandon: s => s.score > 0 ? { won: false, value: s.score, detail: `Länge ${s.snake.length}` } : null,

  start(el, ctx) {
    let st = ctx.saved;
    if (!st) { st = { snake: [[7, 8], [6, 8], [5, 8]], dir: 'right', food: null, score: 0 }; placeFood(); }
    let running = false, over = false, timer = null, queue = [], cell = 20;

    el.innerHTML = `<div class="sn">
      <div class="sn-wrap"><canvas></canvas><div class="sn-overlay"></div></div>
      <div class="sn-pad">
        <button data-d="up" style="grid-area:u">▲</button><button data-d="left" style="grid-area:l">◀</button>
        <button data-d="pause" style="grid-area:p">⏯</button><button data-d="right" style="grid-area:r">▶</button>
        <button data-d="down" style="grid-area:d">▼</button></div>
      <div class="tools"><button class="btn small" data-a="new">Neues Spiel</button></div></div>`;
    const wrap = el.querySelector('.sn-wrap'), cv = el.querySelector('canvas'), g = cv.getContext('2d'), ov = el.querySelector('.sn-overlay');

    function placeFood() {
      const free = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!st.snake.some(s => s[0] === x && s[1] === y)) free.push([x, y]);
      st.food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
    }
    function size() {
      const px = Math.min(wrap.clientWidth, 480, Math.max(240, window.innerHeight - 330));
      const dpr = window.devicePixelRatio || 1;
      cv.style.width = cv.style.height = px + 'px';
      cv.width = cv.height = Math.round(px * dpr);
      cell = cv.width / N;
      draw();
    }
    function draw(dead = false) {
      const css = getComputedStyle(document.documentElement), col = v => css.getPropertyValue(v).trim();
      g.fillStyle = col('--surface'); g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = col('--surface2');
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + y) % 2) g.fillRect(x * cell, y * cell, cell, cell);
      if (st.food) {
        g.fillStyle = col('--bad');
        g.beginPath(); g.arc((st.food[0] + .5) * cell, (st.food[1] + .5) * cell, cell * .38, 0, 7); g.fill();
      }
      st.snake.forEach(([x, y], i) => {
        g.fillStyle = i === 0 ? (dead ? col('--bad') : col('--good-dark')) : col('--good');
        const p = cell * .08;
        if (g.roundRect) { g.beginPath(); g.roundRect(x * cell + p, y * cell + p, cell - 2 * p, cell - 2 * p, cell * .25); g.fill(); }
        else g.fillRect(x * cell + p, y * cell + p, cell - 2 * p, cell - 2 * p);
      });
    }
    function overlay() {
      ov.hidden = running || over;
      ov.textContent = st.score || st.snake.length > 3 ? 'Pause – tippen zum Weiterspielen' : 'Tippen oder wischen zum Starten';
    }
    function go() {
      if (over || running) return;
      running = true; overlay();
      timer = setInterval(tick, SPEED[ctx.variant]);
    }
    function halt() {
      if (!running) return;
      running = false; clearInterval(timer); overlay();
      if (!over) ctx.save(st);
    }
    function turn(d) {
      if (over) return;
      const last = queue.length ? queue[queue.length - 1] : st.dir;
      if (d !== last && d !== OPP[last] && queue.length < 3) queue.push(d);
      go();
    }
    function tick() {
      const d = queue.shift();
      if (d) st.dir = d;
      const [hx, hy] = st.snake[0], [dx, dy] = STEP[st.dir], nx = hx + dx, ny = hy + dy;
      const eat = st.food && st.food[0] === nx && st.food[1] === ny;
      const body = eat ? st.snake : st.snake.slice(0, -1);
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || body.some(s => s[0] === nx && s[1] === ny)) return die();
      st.snake.unshift([nx, ny]);
      if (eat) {
        st.score += 10; placeFood();
        navigator.vibrate && navigator.vibrate(15);
        if (!st.food) return die();
      } else st.snake.pop();
      draw();
      ctx.setInfo(`${st.score} P`);
    }
    function die() {
      clearInterval(timer); running = false; over = true;
      navigator.vibrate && navigator.vibrate(150);
      draw(true); overlay();
      ctx.finish({ won: false, value: st.score, detail: `Länge ${st.snake.length}`, delay: 700 });
    }

    onSwipe(wrap, d => d === 'tap' ? (running ? halt() : go()) : turn(d), { min: 18, continuous: true });
    el.querySelector('.sn-pad').addEventListener('click', e => {
      const b = e.target.closest('[data-d]'); if (!b) return;
      if (b.dataset.d === 'pause') running ? halt() : go(); else turn(b.dataset.d);
    });
    el.querySelector('[data-a=new]').onclick = () => { halt(); ctx.restart(game.abandon(st)); };

    size(); overlay(); ctx.setInfo(`${st.score} P`);
    return {
      key(e) {
        const d = KEYDIR[e.key];
        if (d) { e.preventDefault(); turn(d); }
        else if (e.key === ' ' || e.key === 'p') { e.preventDefault(); running ? halt() : go(); }
      },
      resize: size,
      pause: halt,
      destroy() { clearInterval(timer); if (!over) ctx.save(st); }
    };
  }
};
export default game;

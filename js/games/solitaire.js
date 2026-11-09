import { Stopwatch, shuffle } from '../lib/util.js';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K'];
const red = c => c.s === 1 || c.s === 2;

function deal() {
  const deck = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ s, r, u: false });
  shuffle(deck);
  const tab = [];
  for (let i = 0; i < 7; i++) { tab[i] = []; for (let j = 0; j <= i; j++) { const c = deck.pop(); c.u = j === i; tab[i].push(c); } }
  return { stock: deck, waste: [], found: [[], [], [], []], tab, moves: 0, elapsed: 0, hist: [] };
}

const game = {
  id: 'solitaer', name: 'Solitär', icon: '🃏',
  desc: 'Klondike-Patience: Lege alle Karten nach Farbe geordnet von Ass bis König auf die vier Ablagen.',
  help: `<ul><li><b>Antippen</b> legt eine Karte automatisch an die beste Stelle (zuerst auf die Ablage).</li>
    <li><b>Ziehen</b> verschiebt Karten gezielt.</li>
    <li>Im Spielfeld abwechselnd rot/schwarz absteigend anlegen. Freie Spalten nur mit Königen belegen.</li>
    <li>Den Stapel oben links antippen, um Karten aufzudecken.</li>
    <li>Sind alle Karten aufgedeckt, erscheint „Fertigstellen“.</li></ul>`,
  variants: [{ id: '1', label: '1 Karte ziehen' }, { id: '3', label: '3 Karten ziehen' }],
  metric: { type: 'time', better: 'low', label: 'Zeit' },
  abandon: s => s.moves > 0 ? { won: false } : null,

  start(el, ctx) {
    const DRAW = +ctx.variant;
    let st = ctx.saved || deal();
    const sw = new Stopwatch(st.elapsed);
    let over = false, autoTimer = null, drag = null;

    el.innerHTML = `<div class="sol"><div class="sol-table"></div>
      <div class="tools"><button class="btn" data-a="undo">↶ Zurück</button><button class="btn primary" data-a="auto" hidden>⚡ Fertigstellen</button><button class="btn small" data-a="new">Neues Spiel</button></div>
      <p class="muted small center">Antippen = automatisch ablegen · Ziehen = gezielt verschieben</p></div>`;
    const table = el.querySelector('.sol-table'), autoBtn = el.querySelector('[data-a=auto]');

    const save = () => ctx.save({ ...st, elapsed: sw.ms });
    const info = () => ctx.setInfo(`⏱ ${ctx.fmtTime(sw.ms / 1000)} · ${st.moves} Z.`);
    const pile = id => id === 'stock' ? st.stock : id === 'waste' ? st.waste : id[0] === 'f' ? st.found[+id[1]] : st.tab[+id[1]];

    function cardHTML(c, p, idx, x, y) {
      if (!c.u) return `<div class="card down" data-pile="${p}" data-idx="${idx}" style="left:${x}px;top:${y}px"></div>`;
      return `<div class="card${red(c) ? ' red' : ''}" data-pile="${p}" data-idx="${idx}" style="left:${x}px;top:${y}px"><span class="cr">${RANKS[c.r]}<i>${SUITS[c.s]}</i></span><span class="cs">${SUITS[c.s]}</span></div>`;
    }

    function render() {
      const W = table.clientWidth, gap = Math.max(3, Math.round(W * 0.012));
      const cw = Math.floor((W - gap * 8) / 7), ch = Math.round(cw * 1.42);
      const X = col => gap + col * (cw + gap);
      table.style.setProperty('--cw', cw + 'px'); table.style.setProperty('--ch', ch + 'px');
      let html = '';
      // Stapel
      html += `<div class="slot" data-pile="stock" data-idx="-1" style="left:${X(0)}px;top:${gap}px">${st.stock.length ? '' : '↻'}</div>`;
      if (st.stock.length) html += cardHTML(st.stock[st.stock.length - 1], 'stock', st.stock.length - 1, X(0), gap);
      // Ablagestapel (bei „3 ziehen“ aufgefächert)
      const show = Math.min(DRAW === 3 ? 3 : 2, st.waste.length);
      for (let k = st.waste.length - show; k < st.waste.length; k++) {
        const off = DRAW === 3 ? (k - (st.waste.length - show)) * Math.round(cw * 0.3) : 0;
        html += cardHTML(st.waste[k], 'waste', k, X(1) + off, gap);
      }
      // Ablagen
      for (let f = 0; f < 4; f++) {
        html += `<div class="slot found" data-pile="f${f}" data-idx="-1" style="left:${X(3 + f)}px;top:${gap}px">${SUITS[f]}</div>`;
        const fp = st.found[f];
        if (fp.length > 1) html += cardHTML(fp[fp.length - 2], `f${f}`, fp.length - 2, X(3 + f), gap);
        if (fp.length) html += cardHTML(fp[fp.length - 1], `f${f}`, fp.length - 1, X(3 + f), gap);
      }
      // Spielfeld
      const y0 = gap * 3 + ch;
      const avail = Math.max(ch * 4, window.innerHeight - table.getBoundingClientRect().top - y0 - 120);
      let maxH = y0 + ch * 3;
      st.tab.forEach((col, t) => {
        const downs = col.filter(c => !c.u).length, ups = col.length - downs;
        const dOff = Math.round(ch * 0.13);
        let uOff = Math.round(ch * 0.28);
        if (ups > 1 && downs * dOff + (ups - 1) * uOff + ch > avail) uOff = Math.max(Math.round(ch * 0.17), Math.floor((avail - ch - downs * dOff) / (ups - 1)));
        html += `<div class="slot col" data-pile="t${t}" data-idx="-1" style="left:${X(t)}px;top:${y0}px"></div>`;
        let y = y0;
        col.forEach((c, i) => { html += cardHTML(c, `t${t}`, i, X(t), y); y += c.u ? uOff : dOff; });
        maxH = Math.max(maxH, y - (col.length ? (col[col.length - 1].u ? uOff : dOff) : 0) + ch + gap);
      });
      table.style.height = maxH + 'px';
      table.querySelectorAll('.slot.col').forEach(s => s.style.height = (maxH - y0) + 'px');
      table.innerHTML = html;
      table.querySelectorAll('.slot.col').forEach(s => s.style.height = (maxH - y0 - gap) + 'px');
      autoBtn.hidden = !canAuto() || over;
      info();
    }

    function canDrag(p, idx) {
      if (idx < 0 || p === 'stock') return false;
      const a = pile(p);
      if (p === 'waste' || p[0] === 'f') return idx === a.length - 1;
      return a[idx] && a[idx].u;
    }
    const cardsOf = (p, idx) => pile(p).slice(idx);

    function canPlace(cards, to) {
      const c = cards[0];
      if (to[0] === 'f') {
        if (cards.length !== 1) return false;
        const f = st.found[+to[1]];
        return f.length ? f[f.length - 1].s === c.s && c.r === f[f.length - 1].r + 1 : c.r === 1;
      }
      if (to[0] === 't') {
        const t = st.tab[+to[1]];
        if (!t.length) return c.r === 13;
        const top = t[t.length - 1];
        return top.u && red(top) !== red(c) && top.r === c.r + 1;
      }
      return false;
    }

    function snapshot() {
      st.hist.push(JSON.stringify({ stock: st.stock, waste: st.waste, found: st.found, tab: st.tab, moves: st.moves }));
      if (st.hist.length > 150) st.hist.shift();
    }

    function move(from, idx, to) {
      if (from === to) return false;
      const cards = cardsOf(from, idx);
      if (!cards.length || !canPlace(cards, to)) return false;
      snapshot();
      pile(from).splice(idx);
      pile(to).push(...cards);
      if (from[0] === 't') { const t = pile(from); if (t.length && !t[t.length - 1].u) t[t.length - 1].u = true; }
      st.moves++;
      changed();
      return true;
    }

    function autoMove(from, idx) {
      const cards = cardsOf(from, idx);
      if (cards.length === 1 && from[0] !== 'f') {
        for (let f = 0; f < 4; f++) if (canPlace(cards, `f${f}`)) return move(from, idx, `f${f}`);
      }
      const targets = [];
      for (let t = 0; t < 7; t++) {
        const to = `t${t}`;
        if (to === from || !canPlace(cards, to)) continue;
        if (!st.tab[t].length && from[0] === 't' && idx === 0) continue;   // König von freier Spalte zu freier Spalte bringt nichts
        st.tab[t].length ? targets.unshift(to) : targets.push(to);
      }
      return targets.length ? move(from, idx, targets[0]) : false;
    }

    function drawCards() {
      if (!st.stock.length) {
        if (!st.waste.length) return;
        snapshot();
        st.stock = st.waste.reverse().map(c => ({ ...c, u: false }));
        st.waste = [];
      } else {
        snapshot();
        for (let k = 0; k < DRAW && st.stock.length; k++) { const c = st.stock.pop(); c.u = true; st.waste.push(c); }
      }
      st.moves++;
      changed();
    }

    function undo() {
      if (over || !st.hist.length || autoTimer) return;
      Object.assign(st, JSON.parse(st.hist.pop()));
      render(); save();
    }

    const canAuto = () => !st.stock.length && !st.waste.length && st.tab.every(col => col.every(c => c.u));

    function autoFinish() {
      if (autoTimer) return;
      autoTimer = setInterval(() => {
        let best = null;
        st.tab.forEach((col, t) => {
          if (!col.length) return;
          const c = col[col.length - 1];
          for (let f = 0; f < 4; f++) if (canPlace([c], `f${f}`) && (!best || c.r < best.r)) best = { r: c.r, t, f };
        });
        if (!best) { clearInterval(autoTimer); autoTimer = null; return; }
        move(`t${best.t}`, st.tab[best.t].length - 1, `f${best.f}`);
        if (over) { clearInterval(autoTimer); autoTimer = null; }
      }, 90);
    }

    function changed() {
      sw.run();
      render();
      if (st.found.every(f => f.length === 13)) {
        over = true; sw.stop(); autoBtn.hidden = true; info();
        ctx.finish({ won: true, value: sw.sec, detail: `${st.moves} Züge`, delay: 700 });
      } else save();
    }

    function shake(elm) { if (!elm) return; elm.classList.remove('shake'); void elm.offsetWidth; elm.classList.add('shake'); }

    // Ziehen und Antippen
    table.addEventListener('pointerdown', e => {
      if (over || autoTimer || drag) return;
      const t = e.target.closest('[data-pile]');
      if (!t) return;
      drag = { pile: t.dataset.pile, idx: +t.dataset.idx, x0: e.clientX, y0: e.clientY, moving: false, els: null, target: t, id: e.pointerId };
      try { table.setPointerCapture(e.pointerId); } catch (_) {}
    });
    table.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moving) {
        if (Math.hypot(dx, dy) < 8) return;
        if (!canDrag(drag.pile, drag.idx)) { drag = null; return; }
        drag.moving = true;
        drag.els = [...table.querySelectorAll(`.card[data-pile="${drag.pile}"]`)].filter(c => +c.dataset.idx >= drag.idx);
        drag.els.forEach(c => c.classList.add('dragging'));
      }
      drag.els.forEach(c => c.style.transform = `translate(${dx}px,${dy}px)`);
    });
    table.addEventListener('pointerup', e => {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag; drag = null;
      if (d.moving) {
        d.els.forEach(c => c.style.visibility = 'hidden');
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const target = under && under.closest('[data-pile]');
        d.els.forEach(c => c.style.visibility = '');
        if (!(target && move(d.pile, d.idx, target.dataset.pile))) render();
      } else if (d.pile === 'stock') drawCards();
      else if (canDrag(d.pile, d.idx)) { if (!autoMove(d.pile, d.idx)) shake(d.target); }
    });
    table.addEventListener('pointercancel', () => { if (drag) { drag = null; render(); } });

    el.querySelector('.tools').addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'undo') undo();
      else if (a.dataset.a === 'auto') autoFinish();
      else ctx.restart(game.abandon(st));
    });

    render();
    if (st.moves) sw.run();
    const iv = setInterval(info, 500);
    return {
      key(e) {
        if (e.key === ' ') { e.preventDefault(); drawCards(); }
        else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) undo();
      },
      resize: render,
      pause() { sw.stop(); if (!over) save(); },
      resume() { if (!over && st.moves) sw.run(); },
      destroy() { clearInterval(iv); clearInterval(autoTimer); if (!over) { sw.stop(); save(); } }
    };
  }
};
export default game;

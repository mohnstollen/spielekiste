import { Stopwatch } from '../lib/util.js';
import { SUITS, red, cardHTML, layout, columnOffsets, shake, attachDrag, msDeal } from '../lib/cards.js';

// Tagesnummer → klassische Spielnummer 1–32000
export const dailyDeal = dayIndex => (dayIndex * 7919) % 32000 + 1;

function newState(nCells, dealNo) {
  const deck = msDeal(dealNo), tab = [[], [], [], [], [], [], [], []];
  deck.forEach((c, k) => tab[k % 8].push(c));
  return { deal: dealNo, cells: [...Array(nCells)].map(() => []), found: [[], [], [], []], tab, moves: 0, elapsed: 0, hist: [], started: false };
}

const game = {
  id: 'freecell', name: 'FreeCell', icon: '🂡',
  desc: 'Alle Karten liegen offen. Mit Hilfe der freien Zellen alle Karten nach Farbe von Ass bis König ablegen.',
  help: `<ul><li>Im Spielfeld abwechselnd rot/schwarz absteigend anlegen. Freie Spalten nehmen jede Karte.</li>
    <li>Die Zellen oben links nehmen je eine Karte als Zwischenlager.</li>
    <li>Mehrere Karten auf einmal verschieben geht, wenn genug Zellen und Spalten frei sind.</li>
    <li><b>Antippen</b> legt automatisch ab, <b>Ziehen</b> verschiebt gezielt. Sichere Karten wandern von selbst auf die Ablage.</li>
    <li>Jedes Spiel hat eine Nummer (1–32000), wie beim klassischen Windows-FreeCell. Fast alle sind lösbar.</li></ul>`,
  variants: [{ id: '4', label: '4 freie Zellen' }, { id: '3', label: '3 freie Zellen (schwerer)' }],
  metric: { type: 'time', better: 'low', label: 'Zeit' },
  abandon: s => s.moves > 0 ? { won: false } : null,
  daily: { variant: () => '4', label: d => `Spiel #${dailyDeal(d.index)}` },

  start(el, ctx) {
    const NC = +ctx.variant;
    let st = ctx.saved || newState(NC, ctx.daily ? dailyDeal(ctx.daily.index) : 1 + Math.floor(Math.random() * 32000));
    const sw = new Stopwatch(st.elapsed);
    let over = false;

    el.innerHTML = `<div class="sol"><div class="sol-table"></div>
      <div class="tools"><button class="btn" data-a="undo">↶ Zurück</button><button class="btn small" data-a="new">Neues Spiel</button></div>
      <p class="muted small center">Spiel #${st.deal} · Antippen = automatisch · Ziehen = gezielt</p></div>`;
    const table = el.querySelector('.sol-table');

    const save = () => ctx.save({ ...st, elapsed: sw.ms });
    const info = () => ctx.setInfo(`⏱ ${ctx.fmtTime(sw.ms / 1000)} · ${st.moves} Z.`);
    const pile = id => id[0] === 'c' ? st.cells[+id[1]] : id[0] === 'f' ? st.found[+id[1]] : st.tab[+id[1]];

    function render() {
      const { gap, ch, X } = layout(table, 8);
      let html = '';
      st.cells.forEach((c, i) => {
        html += `<div class="slot" data-pile="c${i}" data-idx="-1" style="left:${X(i)}px;top:${gap}px"></div>`;
        if (c.length) html += cardHTML(c[0], `c${i}`, 0, X(i), gap);
      });
      st.found.forEach((f, i) => {
        html += `<div class="slot found" data-pile="f${i}" data-idx="-1" style="left:${X(4 + i)}px;top:${gap}px">${SUITS[i]}</div>`;
        if (f.length > 1) html += cardHTML(f[f.length - 2], `f${i}`, f.length - 2, X(4 + i), gap);
        if (f.length) html += cardHTML(f[f.length - 1], `f${i}`, f.length - 1, X(4 + i), gap);
      });
      const y0 = gap * 3 + ch;
      const avail = Math.max(ch * 4, window.innerHeight - table.getBoundingClientRect().top - y0 - 110);
      let maxH = y0 + ch * 3;
      st.tab.forEach((col, t) => {
        const { uOff } = columnOffsets(ch, 0, col.length, avail);
        html += `<div class="slot col" data-pile="t${t}" data-idx="-1" style="left:${X(t)}px;top:${y0}px"></div>`;
        col.forEach((c, i) => { html += cardHTML(c, `t${t}`, i, X(t), y0 + i * uOff); });
        maxH = Math.max(maxH, y0 + Math.max(0, col.length - 1) * uOff + ch + gap);
      });
      table.style.height = maxH + 'px';
      table.innerHTML = html;
      table.querySelectorAll('.slot.col').forEach(s => s.style.height = (maxH - y0 - gap) + 'px');
      info();
    }

    const isSeq = (arr, idx) => {
      for (let k = idx + 1; k < arr.length; k++)
        if (red(arr[k]) === red(arr[k - 1]) || arr[k].r !== arr[k - 1].r - 1) return false;
      return true;
    };
    const maxMove = toEmpty => {
      const free = st.cells.filter(c => !c.length).length;
      const empty = st.tab.filter(c => !c.length).length - (toEmpty ? 1 : 0);
      return (free + 1) * 2 ** Math.max(0, empty);
    };
    function canDrag(p, idx) {
      if (idx < 0) return false;
      const a = pile(p);
      if (p[0] !== 't') return idx === a.length - 1;
      return idx < a.length && isSeq(a, idx);
    }
    function canPlace(cards, to) {
      const c = cards[0];
      if (to[0] === 'c') return cards.length === 1 && !pile(to).length;
      if (to[0] === 'f') {
        if (cards.length !== 1) return false;
        const f = pile(to);
        return f.length ? f[f.length - 1].s === c.s && c.r === f[f.length - 1].r + 1 : c.r === 1;
      }
      const t = pile(to);
      if (cards.length > maxMove(!t.length)) return false;
      if (!t.length) return true;
      const top = t[t.length - 1];
      return red(top) !== red(c) && top.r === c.r + 1;
    }

    function snapshot() {
      st.hist.push(JSON.stringify({ cells: st.cells, found: st.found, tab: st.tab, moves: st.moves }));
      if (st.hist.length > 200) st.hist.shift();
    }
    function rawMove(from, idx, to) {
      const cards = pile(from).splice(idx);
      pile(to).push(...cards);
    }
    function move(from, idx, to) {
      if (from === to || !canDrag(from, idx)) return false;
      const cards = pile(from).slice(idx);
      if (!cards.length || !canPlace(cards, to)) return false;
      snapshot();
      rawMove(from, idx, to);
      st.moves++;
      autoplay();
      changed();
      return true;
    }

    // Karten, die nie mehr gebraucht werden, automatisch ablegen
    const foundRank = s => { const f = st.found.find(f => f.length && f[0].s === s); return f ? f.length : 0; };
    function safe(c) {
      if (c.r <= 2) return true;
      const opp = red(c) ? [0, 3] : [1, 2];
      return opp.every(s => foundRank(s) >= c.r - 1);
    }
    function autoplay() {
      for (let again = true; again;) {
        again = false;
        const sources = [...st.cells.map((_, i) => `c${i}`), ...st.tab.map((_, i) => `t${i}`)];
        for (const p of sources) {
          const a = pile(p);
          if (!a.length) continue;
          const c = a[a.length - 1];
          if (!safe(c)) continue;
          for (let f = 0; f < 4; f++) if (canPlace([c], `f${f}`)) { rawMove(p, a.length - 1, `f${f}`); again = true; break; }
        }
      }
    }

    function autoMove(from, idx) {
      const cards = pile(from).slice(idx);
      if (cards.length === 1 && from[0] !== 'f')
        for (let f = 0; f < 4; f++) if (canPlace(cards, `f${f}`)) return move(from, idx, `f${f}`);
      const full = [], empty = [];
      for (let t = 0; t < 8; t++) {
        const to = `t${t}`;
        if (to === from || !canPlace(cards, to)) continue;
        if (!st.tab[t].length && from[0] === 't' && idx === 0) continue;
        (st.tab[t].length ? full : empty).push(to);
      }
      if (full.length) return move(from, idx, full[0]);
      if (cards.length === 1 && from[0] !== 'c') {
        const c = st.cells.findIndex(x => !x.length);
        if (c >= 0) return move(from, idx, `c${c}`);
      }
      if (empty.length) return move(from, idx, empty[0]);
      return false;
    }

    function undo() {
      if (over || !st.hist.length) return;
      Object.assign(st, JSON.parse(st.hist.pop()));
      render(); save();
    }

    function changed() {
      if (!st.started) st.started = true;
      sw.run();
      render();
      if (st.found.every(f => f.length === 13)) {
        over = true; sw.stop(); info();
        ctx.finish({ won: true, value: sw.sec, detail: `Spiel #${st.deal}, ${st.moves} Züge`, delay: 600 });
      } else save();
    }

    attachDrag(table, {
      busy: () => over, canDrag, drop: move, render,
      tap: (p, idx, target) => { if (canDrag(p, idx) && !autoMove(p, idx)) shake(target); }
    });
    el.querySelector('.tools').addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'undo') undo(); else ctx.restart(game.abandon(st));
    });

    if (!ctx.saved) autoplay();   // Asse, die zufällig frei liegen, gleich ablegen
    render();
    if (st.started) sw.run();
    const iv = setInterval(info, 500);
    return {
      key(e) { if (e.key === 'z' && (e.ctrlKey || e.metaKey)) undo(); },
      resize: render,
      pause() { sw.stop(); if (!over) save(); },
      resume() { if (!over && st.started) sw.run(); },
      destroy() { clearInterval(iv); if (!over) { sw.stop(); save(); } }
    };
  }
};
export default game;

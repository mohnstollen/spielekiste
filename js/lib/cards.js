// Gemeinsame Bausteine für Kartenspiele: Darstellung, Layout, Ziehen/Antippen, Microsoft-FreeCell-Deal
export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K'];
export const red = c => c.s === 1 || c.s === 2;

export function cardHTML(c, pile, idx, x, y) {
  if (!c.u) return `<div class="card down" data-pile="${pile}" data-idx="${idx}" style="left:${x}px;top:${y}px"></div>`;
  return `<div class="card${red(c) ? ' red' : ''}" data-pile="${pile}" data-idx="${idx}" style="left:${x}px;top:${y}px"><span class="cr">${RANKS[c.r]}<i>${SUITS[c.s]}</i></span><span class="cs">${SUITS[c.s]}</span></div>`;
}

// Kartenmaße aus der Tischbreite für `cols` Spalten
export function layout(table, cols) {
  const W = table.clientWidth, gap = Math.max(3, Math.round(W * 0.012));
  const cw = Math.floor((W - gap * (cols + 1)) / cols), ch = Math.round(cw * 1.42);
  table.style.setProperty('--cw', cw + 'px');
  table.style.setProperty('--ch', ch + 'px');
  return { W, gap, cw, ch, X: col => gap + col * (cw + gap) };
}

// Spalten-Abstände so wählen, dass eine Spalte auf den Bildschirm passt
export function columnOffsets(ch, downs, ups, avail) {
  const dOff = Math.round(ch * 0.13);
  let uOff = Math.round(ch * 0.28);
  if (ups > 1 && downs * dOff + (ups - 1) * uOff + ch > avail)
    uOff = Math.max(Math.round(ch * 0.15), Math.floor((avail - ch - downs * dOff) / (ups - 1)));
  return { dOff, uOff };
}

export function shake(el) {
  if (!el) return;
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
}

// Ziehen mit Finger/Maus und Antippen. Erwartet Elemente mit data-pile / data-idx.
export function attachDrag(table, { busy, canDrag, drop, tap, render }) {
  let drag = null;
  table.addEventListener('pointerdown', e => {
    if (busy() || drag) return;
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
      if (!(target && target.dataset.pile !== d.pile && drop(d.pile, d.idx, target.dataset.pile))) render();
    } else tap(d.pile, d.idx, d.target);
  });
  table.addEventListener('pointercancel', () => { if (drag) { drag = null; render(); } });
}

// Klassische FreeCell-Spielnummern (Microsoft-Algorithmus, 1–32000).
// Liefert 52 Karten in Austeilreihenfolge (Karte k kommt in Spalte k % 8).
export function msDeal(n) {
  let seed = n;
  const rnd = () => { seed = (seed * 214013 + 2531011) & 0x7fffffff; return seed >> 16; };
  const cards = [...Array(52).keys()].reverse();
  for (let i = 0; i < 52; i++) {
    const j = 51 - rnd() % (52 - i);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const SUIT_OF = [3, 2, 1, 0];   // Microsoft: Kreuz, Karo, Herz, Pik → unsere Reihenfolge ♠♥♦♣
  return cards.map(c => ({ s: SUIT_OF[c % 4], r: Math.floor(c / 4) + 1, u: true }));
}

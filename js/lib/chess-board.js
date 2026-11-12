// Schachbrett zum Anzeigen und Bedienen: eigene SVG-Figuren, Antippen oder Ziehen, Markierungen, Pfeile, Animation.
import { colorOf, typeOf, sqName, FILES } from './chess-core.js';

/* ---------------- Figuren (eigene Zeichnung, Raster 45×45) ---------------- */
const BASE = '<rect x="9" y="33" width="27" height="4.5" rx="1.5"/>';
const SHAPES = {
  p: `<path d="M15 34c0-5 2.5-8.5 5-10.5h5c2.5 2 5 5.5 5 10.5z"/><rect x="17.5" y="21" width="10" height="3" rx="1.5"/><circle cx="22.5" cy="15.5" r="5"/>${BASE}`,
  r: `<path d="M14.5 30.5 16 17h13l1.5 13.5z"/><rect x="12" y="29.5" width="21" height="4" rx="1"/><path d="M12 17V9.5h4.5V12h4V9.5h4V12h4V9.5H33V17z"/>${BASE}<path class="d" d="M16 17h13"/>`,
  b: `<path d="M14.5 34c0-6 3-9 4.5-11h7c1.5 2 4.5 5 4.5 11z"/><rect x="16.5" y="20" width="12" height="3.5" rx="1.5"/><path d="M22.5 7.5c-5.5 4.5-7 8.5-5 12.5h10c2-4 .5-8-5-12.5z"/><circle cx="22.5" cy="6" r="2.2"/>${BASE}<path class="d" d="M24.7 11.5 21 16"/>`,
  q: `<path d="M12.5 33.5 10 15l4.8 9.5L16.2 12l4 11.3 2.3-12.5 2.3 12.5 4-11.3 1.4 12.5L35 15l-2.5 18.5z"/><circle cx="10" cy="14" r="2.2"/><circle cx="16.2" cy="11" r="2.2"/><circle cx="22.5" cy="9.8" r="2.2"/><circle cx="28.8" cy="11" r="2.2"/><circle cx="35" cy="14" r="2.2"/>${BASE}<path class="d" d="M13.2 29h18.6"/>`,
  k: `<path class="x" d="M22.5 4.5V12M19 7.8h7"/><path d="M22.5 13c-2.5 0-3.5 2-3.5 3.8 0 2.2 1.5 4 3.5 5.7 2-1.7 3.5-3.5 3.5-5.7 0-1.8-1-3.8-3.5-3.8z"/><path d="M13 33.5c-2-5-3.5-10.5-.5-14 3.5-3.5 7.5-1 10 3.5 2.5-4.5 6.5-7 10-3.5 3 3.5 1.5 9-.5 14z"/>${BASE}<path class="d" d="M14 29.5h17"/>`,
  n: `<path d="M13.5 33.5c0-6 3.5-9.5 6.5-12.5l-.6-2.2c-2.6 2.7-5 4.7-7.8 4.7-2.2 0-3.4-1.6-2.8-3.8 1-3.4 4.6-7.2 7.7-10.2l.5-4 3.1 2.9 1.8-3.6 2.1 3.9c6.4 1.3 10 6.6 10 15.3 0 4-.5 7.4-1 9.5z"/>${BASE}<circle class="f" cx="17" cy="13.8" r="1.1"/><path class="d" d="M24.8 10.8c4.4 1.8 6.7 6.6 6.7 13.7"/>`
};
export function pieceSVG(p) {
  const w = colorOf(p) === 'w';
  return `<svg viewBox="2.5 1.5 40 40" class="cb-svg ${w ? 'pw' : 'pb'}" aria-hidden="true">${SHAPES[typeOf(p)]}</svg>`;
}
const STAR = '<svg viewBox="0 0 24 24" class="cb-star"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>';

/* ---------------- Brett ---------------- */
// opts: orientation 'w'|'b', coords (Beschriftung), onTap(i), onMove(from, to), movable(i) → bool, targets(i) → [Felder]
export function createBoard(el, opts = {}) {
  const o = { orientation: 'w', coords: true, mode: 'none', ...opts };
  el.innerHTML = `<div class="cb"><div class="cb-sqs"></div><div class="cb-pcs"></div><svg class="cb-arrows" viewBox="0 0 8 8"></svg></div>`;
  const root = el.firstChild, sqsEl = root.children[0], pcsEl = root.children[1], arrowsEl = root.children[2];
  const state = { b: new Array(64).fill(null), marks: {}, dots: new Set(), stars: new Set(), arrows: [], last: [], selected: null, check: -1 };
  // Bildschirmposition (0 = oben links) ↔ Feld
  const toScreen = i => o.orientation === 'w' ? i : 63 - i;
  const fromScreen = s => o.orientation === 'w' ? s : 63 - s;

  function drawSquares() {
    let h = '';
    for (let s = 0; s < 64; s++) {
      const i = fromScreen(s), r = s >> 3, c = s & 7, light = (r + c) % 2 === 0;
      const cls = ['cb-sq', light ? 'l' : 'd'];
      if (state.last.includes(i)) cls.push('last');
      if (state.selected === i) cls.push('sel');
      if (state.check === i) cls.push('check');
      if (state.marks[i]) cls.push(...state.marks[i].split(' '));
      let inner = '';
      if (o.coords) {
        if (c === 0) inner += `<span class="cb-rk">${8 - (i >> 3)}</span>`;
        if (r === 7) inner += `<span class="cb-fl">${FILES[i & 7]}</span>`;
      }
      if (state.stars.has(i)) inner += STAR;
      if (state.dots.has(i)) inner += `<span class="cb-dot${state.b[i] ? ' cap' : ''}"></span>`;
      h += `<div class="${cls.join(' ')}" data-s="${i}">${inner}</div>`;
    }
    sqsEl.innerHTML = h;
  }
  function drawPieces() {
    let h = '';
    for (let i = 0; i < 64; i++) {
      const p = state.b[i];
      if (!p) continue;
      const s = toScreen(i);
      h += `<div class="cb-pc" data-p="${i}" data-k="${p}" style="left:${(s & 7) * 12.5}%;top:${(s >> 3) * 12.5}%">${pieceSVG(p)}</div>`;
    }
    pcsEl.innerHTML = h;
  }
  function drawArrows() {
    const pt = i => { const s = toScreen(i); return [(s & 7) + .5, (s >> 3) + .5]; };
    arrowsEl.innerHTML = state.arrows.map(([a, b, col = 'g']) => {
      const [x1, y1] = pt(a), [x2, y2] = pt(b), len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const ex = x2 - ux * .32, ey = y2 - uy * .32, hx = x2 - ux * .02, hy = y2 - uy * .02, px = -uy * .2, py = ux * .2;
      return `<g class="ar ${col}"><line x1="${x1 + ux * .2}" y1="${y1 + uy * .2}" x2="${ex}" y2="${ey}"/><polygon points="${hx},${hy} ${ex + px},${ey + py} ${ex - px},${ey - py}"/></g>`;
    }).join('');
  }
  function draw() { drawSquares(); drawPieces(); drawArrows(); }

  // Figur von a nach b gleiten lassen (nach dem Zeichnen der neuen Stellung)
  function animate(pairs) {
    for (const [a, b] of pairs) {
      const elp = pcsEl.querySelector(`[data-p="${b}"]`);
      if (!elp) continue;
      const sa = toScreen(a), sb = toScreen(b);
      elp.style.transition = 'none';
      elp.style.transform = `translate(${((sa & 7) - (sb & 7)) * 100}%,${((sa >> 3) - (sb >> 3)) * 100}%)`;
      void elp.offsetWidth;
      elp.style.transition = '';
      elp.style.transform = '';
    }
  }

  /* ---- Bedienung ---- */
  let press = null;
  const squareAt = (x, y) => {
    const r = root.getBoundingClientRect();
    const c = Math.floor((x - r.left) / r.width * 8), rr = Math.floor((y - r.top) / r.height * 8);
    return c < 0 || c > 7 || rr < 0 || rr > 7 ? null : fromScreen(rr * 8 + c);
  };
  const select = i => {
    state.selected = i;
    state.dots = new Set(i !== null && o.showTargets !== false && o.targets ? o.targets(i) : []);
    drawSquares();
  };
  const tryMove = (from, to) => { select(null); o.onMove && o.onMove(from, to); };

  root.addEventListener('pointerdown', e => {
    if (press || o.mode === 'none') return;
    const i = squareAt(e.clientX, e.clientY);
    if (i === null) return;
    press = { i, x: e.clientX, y: e.clientY, id: e.pointerId, drag: false, pc: null, wasSel: state.selected === i };
    if (o.mode === 'move' && o.movable && o.movable(i)) {
      if (!press.wasSel) select(i);
      press.pc = pcsEl.querySelector(`[data-p="${i}"]`);
    }
    try { root.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  root.addEventListener('pointermove', e => {
    if (!press || press.id !== e.pointerId || !press.pc) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.drag && Math.hypot(dx, dy) < 6) return;
    press.drag = true;
    press.pc.classList.add('drag');
    press.pc.style.transform = `translate(${dx}px,${dy}px) scale(1.15)`;
  });
  const up = e => {
    if (!press || press.id !== e.pointerId) return;
    const p = press; press = null;
    const i = e.type === 'pointercancel' ? null : squareAt(e.clientX, e.clientY);
    if (p.drag) {
      p.pc.classList.remove('drag');
      p.pc.style.transition = 'none'; p.pc.style.transform = ''; void p.pc.offsetWidth; p.pc.style.transition = '';
      if (i !== null && i !== p.i) tryMove(p.i, i);
      return;
    }
    if (i !== p.i) return;
    if (o.mode === 'tap') { o.onTap && o.onTap(i); return; }
    if (p.pc) { if (p.wasSel) select(null); return; }
    if (state.selected !== null) tryMove(state.selected, i);
    else o.onTap && o.onTap(i);
  };
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);

  draw();
  return {
    el: root,
    get state() { return state; },
    set(o2) { Object.assign(o, o2); },
    // Stellung setzen; anim = [[von, nach], …] lässt Figuren gleiten
    setBoard(b, anim) { state.b = b.slice(); state.selected = null; state.dots = new Set(); draw(); if (anim) animate(anim); },
    mark(map) { state.marks = map || {}; drawSquares(); },
    addMark(i, cls) { state.marks[i] = ((state.marks[i] || '') + ' ' + cls).trim(); drawSquares(); },
    stars(list) { state.stars = new Set(list || []); drawSquares(); },
    dots(list) { state.dots = new Set(list || []); drawSquares(); },
    arrows(list) { state.arrows = list || []; drawArrows(); },
    last(list) { state.last = list || []; drawSquares(); },
    check(i) { state.check = i ?? -1; drawSquares(); },
    select,
    flash(i, cls = 'bad') {
      const e = sqsEl.querySelector(`[data-s="${i}"]`);
      if (!e) return;
      e.classList.remove('flash-good', 'flash-bad'); void e.offsetWidth; e.classList.add('flash-' + cls);
    },
    shake() { root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake'); },
    flip(orientation) { o.orientation = orientation; draw(); },
    sqName
  };
}

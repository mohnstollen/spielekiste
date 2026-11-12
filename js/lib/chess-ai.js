// Kleine Schach-KI: Bewertung, Alpha-Beta-Suche mit Schlagabtausch-Verlängerung und ein Matt-Löser.
// Gedacht für Übungen (Verteidigung in Endspielen, Antworten in Taktikaufgaben, Tipps) – nicht für Turnierstärke.
import * as C from './chess-core.js';

export const MATE = 100000;
const PV = { p: 100, n: 310, b: 320, r: 500, q: 900, k: 0 };
// 0 = Mittelfeld … 6 = Ecke
const edge = i => { const f = i & 7, r = i >> 3; return Math.max(3 - f, f - 4) + Math.max(3 - r, r - 4); };
const dist = (a, b) => Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3)));

// Wie gut drängt die stärkere Seite den allein stehenden König zusammen?
// Rand + Nähe der Könige + Größe des „Kastens“, in den Turm oder Dame den König einsperren.
function mopUp(b, side, k, lone) {
  let v = edge(lone) * 12 + (7 - dist(k, lone)) * 6, box = 64;
  const lf = lone & 7, lr = lone >> 3;
  for (let i = 0; i < 64; i++) {
    const x = b[i];
    if (!x || C.colorOf(x) !== side || !'rq'.includes(C.typeOf(x))) continue;
    const f = i & 7, r = i >> 3;
    const w = lf < f ? f : lf > f ? 7 - f : 8, h = lr < r ? r : lr > r ? 7 - r : 8;
    box = Math.min(box, w * h);
  }
  return v - box * 4;
}

// Bewertung aus Sicht von Weiß (in Hundertstel Bauern)
export function evaluate(p) {
  const b = p.b;
  let s = 0, wPieces = 0, bPieces = 0, wk = -1, bk = -1;
  for (let i = 0; i < 64; i++) {
    const x = b[i];
    if (!x) continue;
    const t = C.typeOf(x), w = x !== t;
    let v = PV[t];
    if (t === 'k') { if (w) wk = i; else bk = i; continue; }
    if (t === 'p') v += (w ? 6 - (i >> 3) : (i >> 3) - 1) * 6;
    else { v -= edge(i) * (t === 'n' || t === 'b' ? 6 : 2); if (w) wPieces++; else bPieces++; }
    s += w ? v : -v;
  }
  // Mattführung: Steht eine Seite mit dem König allein, wird er an den Rand gedrängt und der eigene König rückt heran
  if (wk >= 0 && bk >= 0) {
    const bAlone = !b.some(x => x && x !== 'k' && C.colorOf(x) === 'b'), wAlone = !b.some(x => x && x !== 'K' && C.colorOf(x) === 'w');
    if (bAlone && wPieces) s += mopUp(b, 'w', wk, bk);
    if (wAlone && bPieces) s -= mopUp(b, 'b', bk, wk);
  }
  return s;
}
const score = p => (p.turn === 'w' ? 1 : -1) * evaluate(p);
const orderKey = m => (m.captured ? 10 * PV[C.typeOf(m.captured)] - PV[C.typeOf(m.piece)] + 2000 : 0) + (m.promo ? 1500 : 0);

function quiesce(p, alpha, beta, ply, qd) {
  const ms = C.legalMoves(p);
  if (!ms.length) return C.inCheck(p) ? -(MATE - ply) : 0;
  const stand = score(p);
  if (stand >= beta || qd >= 4) return stand;
  if (stand > alpha) alpha = stand;
  const caps = ms.filter(m => m.captured || m.promo === 'q').sort((a, b) => orderKey(b) - orderKey(a));
  for (const m of caps) {
    const v = -quiesce(C.makeMove(p, m), -beta, -alpha, ply + 1, qd + 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

export function search(p, depth, alpha = -Infinity, beta = Infinity, ply = 0) {
  const ms = C.legalMoves(p);
  if (!ms.length) return C.inCheck(p) ? -(MATE - ply) : 0;
  if (ply && C.insufficient(p)) return 0;
  if (depth <= 0) return quiesce(p, alpha, beta, ply, 0);
  ms.sort((a, b) => orderKey(b) - orderKey(a));
  let best = -Infinity;
  for (const m of ms) {
    const v = -search(C.makeMove(p, m), depth - 1, -beta, -alpha, ply + 1);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

// Bewertung aller Züge (genau bis auf Gleichstand) – für Tipps und die Prüfung von Aufgaben
export function rankMoves(p, depth = 3) {
  const ms = C.legalMoves(p).sort((a, b) => orderKey(b) - orderKey(a));
  let alpha = -Infinity;
  const out = [];
  for (const m of ms) {
    const v = -search(C.makeMove(p, m), depth - 1, -Infinity, -alpha + 1, 1);
    out.push({ m, v });
    if (v > alpha) alpha = v;
  }
  return out.sort((a, b) => b.v - a.v);
}

// Bester Zug; bei Gleichstand zufällig. noise > 0 macht den Computer schwächer.
export function bestMove(p, depth = 3, noise = 0) {
  const r = rankMoves(p, depth);
  if (!r.length) return null;
  const top = r[0].v + (noise ? 0 : 0);
  const pool = noise ? r.filter(x => x.v >= top - noise) : r.filter(x => x.v === top);
  return pool[Math.floor(Math.random() * pool.length)].m;
}

/* ---------------- Matt-Löser ---------------- */
// Setzt der Zug m (für die Seite am Zug) in höchstens n Zügen zwangsläufig matt?
export function matesIn(p, m, n) {
  const q = C.makeMove(p, m);
  if (n === 1 && !C.inCheck(q)) return false;
  const rs = C.legalMoves(q);
  if (!rs.length) return C.inCheck(q);
  if (n === 1) return false;
  return rs.every(r => canMate(C.makeMove(q, r), n - 1));
}
export const canMate = (p, n) => C.legalMoves(p).some(m => matesIn(p, m, n));
export const mateMoves = (p, n) => C.legalMoves(p).filter(m => matesIn(p, m, n));
// Kürzestes erzwungenes Matt (1 … max) oder 0
export function mateDepth(p, max = 3) {
  for (let n = 1; n <= max; n++) if (canMate(p, n)) return n;
  return 0;
}

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

// Feldtabellen aus Sicht von Weiß (Index 0 = a8 … 63 = h1); für Schwarz gespiegelt (i ^ 56)
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  ke: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50]
};

// Bewertung aus Sicht von Weiß (in Hundertstel Bauern)
export function evaluate(p) {
  const b = p.b;
  let s = 0, wPieces = 0, bPieces = 0, wk = -1, bk = -1, heavy = 0;
  for (let i = 0; i < 64; i++) {
    const x = b[i];
    if (!x) continue;
    const t = C.typeOf(x), w = x !== t;
    if (t === 'k') { if (w) wk = i; else bk = i; continue; }
    const v = PV[t] + PST[t][w ? i : i ^ 56];
    if (t !== 'p') { heavy += PV[t]; if (w) wPieces++; else bPieces++; }
    s += w ? v : -v;
  }
  // Mattführung: Steht eine Seite mit dem König allein, wird er an den Rand gedrängt und der eigene König rückt heran
  if (wk >= 0 && bk >= 0) {
    const bAlone = !b.some(x => x && x !== 'k' && C.colorOf(x) === 'b'), wAlone = !b.some(x => x && x !== 'K' && C.colorOf(x) === 'w');
    if (bAlone && wPieces) return s + mopUp(b, 'w', wk, bk);
    if (wAlone && bPieces) return s - mopUp(b, 'b', bk, wk);
  }
  const kt = heavy <= 1300 ? PST.ke : PST.k;          // wenig Material = Endspiel: König in die Mitte
  if (wk >= 0) s += kt[wk];
  if (bk >= 0) s -= kt[bk ^ 56];
  return s;
}
const score = p => (p.turn === 'w' ? 1 : -1) * evaluate(p);
const orderKey = m => (m.captured ? 10 * PV[C.typeOf(m.captured)] - PV[C.typeOf(m.piece)] + 2000 : 0) + (m.promo ? 1500 : 0);

function quiesce(p, alpha, beta, ply, qd) {
  tick();
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

// Zeitlimit: Läuft es ab, bricht die Suche mit TIMEOUT ab (siehe bestMoveTimed)
let deadline = Infinity, nodes = 0;
const TIMEOUT = { timeout: true };
const tick = () => { if ((++nodes & 255) === 0 && Date.now() > deadline) throw TIMEOUT; };

export function search(p, depth, alpha = -Infinity, beta = Infinity, ply = 0) {
  tick();
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
// Werte sind genau für alle Züge, die höchstens `margin` schlechter als der beste sind; schlechtere sind nur Obergrenzen.
export function rankMoves(p, depth = 3, margin = 0) {
  const ms = C.legalMoves(p).sort((a, b) => orderKey(b) - orderKey(a));
  let alpha = -Infinity;
  const out = [];
  for (const m of ms) {
    const v = -search(C.makeMove(p, m), depth - 1, -Infinity, -(alpha - margin) + 1, 1);
    out.push({ m, v });
    if (v > alpha) alpha = v;
  }
  return out.sort((a, b) => b.v - a.v);
}

// Bester Zug; bei Gleichstand zufällig. noise > 0 macht den Computer schwächer.
export function bestMove(p, depth = 3, noise = 0) {
  const r = rankMoves(p, depth, noise);
  if (!r.length) return null;
  const top = r[0].v;
  const pool = r.filter(x => x.v >= top - noise);
  return pool[Math.floor(Math.random() * pool.length)].m;
}

// Schrittweise tiefer suchen, bis maxDepth erreicht oder die Zeit (ms) um ist. Liefert die Rangliste der tiefsten fertigen Suche.
export function rankTimed(p, maxDepth, ms, margin = 0) {
  let best = null, depth = 0;
  const t0 = Date.now();
  for (let d = 1; d <= maxDepth; d++) {
    deadline = d === 1 ? Infinity : t0 + ms;
    try { best = rankMoves(p, d, margin); depth = d; } catch (e) { if (e !== TIMEOUT) throw e; break; } finally { deadline = Infinity; }
    if (Date.now() - t0 > ms / 3) break;          // die nächste Tiefe dauert sicher zu lange
  }
  best = best || [];
  best.depth = depth;
  return best;
}
export function bestMoveTimed(p, maxDepth, ms, noise = 0) {
  const r = rankTimed(p, maxDepth, ms, noise);
  if (!r.length) return null;
  const pool = r.filter(x => x.v >= r[0].v - noise);
  return pool[Math.floor(Math.random() * pool.length)].m;
}

// Coach: Wie gut war der Zug `played` (UCI) in Stellung p? Liefert Verlust gegenüber dem besten Zug,
// die beste Antwort des Gegners und ob ein Matt verpasst oder zugelassen wurde.
export function analyzeMove(p, played, ms = 1500) {
  const r = rankTimed(p, 3, ms);
  const m = C.legalMoves(p).find(x => C.uci(x) === played);
  if (!r.length || !m) return null;
  const after = C.makeMove(p, m);
  let v;
  deadline = Date.now() + ms;
  try { v = -search(after, Math.max(0, r.depth - 1), -Infinity, Infinity, 1); } catch (e) { v = (r.find(x => C.uci(x.m) === played) || r[r.length - 1]).v; } finally { deadline = Infinity; }
  const best = r[0], mateNow = mateMoves(p, 1);
  const missedMate = mateNow.length > 0 && !mateNow.some(x => C.uci(x) === played);
  const allowsMate = !C.status(after) && mateMoves(after, 1).length > 0;
  let reply = null;
  if (!C.status(after)) { const rr = rankTimed(after, 2, ms); reply = rr.length ? rr[0].m : null; }
  return { loss: Math.max(0, best.v - v), best: C.uci(best.m), bestSan: C.san(p, best.m), missedMate, allowsMate,
    reply: reply && C.uci(reply), replySan: reply && C.san(after, reply), replyCaptures: reply && reply.captured };
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

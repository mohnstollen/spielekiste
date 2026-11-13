// Erzeugt die Aufgaben für „Schachaufgaben“ (js/lib/chess-puzzles.js).
// Die Engine spielt mit etwas Zufall gegen sich selbst; Stellungen mit Matt in 1, Matt in 2
// oder einem eindeutig gewinnenden Zug werden gesammelt. Alle erlaubten Lösungszüge sind vorberechnet.
// Aufruf: node tools/make-puzzles.mjs [Anzahl Partien] > js/lib/chess-puzzles.js
// Für parallele Läufe: … [Partien] jsonl [mates] > teil.jsonl – gibt jede gefundene Aufgabe sofort als JSON-Zeile aus;
// „mates“ sucht gezielt Matt in 1 und 2. Die Teile werden danach zusammengeführt und geprüft.
import * as C from '../js/lib/chess-core.js';
import * as A from '../js/lib/chess-ai.js';

const GAMES = +(process.argv[2] || 2000);
const MATES = process.argv[4] === 'mates';                  // Matt-Lauf: nach dem Patzer weiterspielen und Matts suchen
const want = MATES ? { mate1: 40, mate2: 60, win: 0 } : { mate1: 60, mate2: 40, win: 100 };
const got = { mate1: [], mate2: [], win: [] };
const JSONL = process.argv[3] === 'jsonl';
const emit = z => { if (JSONL) process.stdout.write(JSON.stringify({ theme: z.theme, fen: z.preFen, pre: z.pre, sol: z.sol, ...(z.gain ? { gain: z.gain } : {}) }) + '\n'); };
const seen = new Set(), stats = { notunique: 0, nobad: 0 };
const key = p => C.toFEN(p).split(' ').slice(0, 4).join(' ');
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
// Material (Weiß minus Schwarz) – damit Aufgaben nicht aus völlig entschiedenen Stellungen kommen
const material = p => p.b.reduce((a, x) => a + (x ? (C.colorOf(x) === 'w' ? 1 : -1) * VAL[C.typeOf(x)] : 0), 0);

function puzzleAt(p, prev) {
  const k = key(p);
  if (seen.has(k)) return null;
  const pre = prev ? C.uci(prev) : null;
  const side = p.turn, bal = (side === 'w' ? 1 : -1) * material(p);
  if (bal > 4) return null;                                   // schon klar gewonnen – keine Aufgabe
  const m1 = A.mateMoves(p, 1);
  if (m1.length) return { theme: 'mate1', sol: [m1.map(C.uci)] };
  if (A.canMate(p, 2)) {
    const first = A.mateMoves(p, 2);
    if (first.length > 3) return null;                        // zu viele Lösungen = zu leicht
    const after = C.makeMove(p, first[0]);
    const reply = A.bestMove(after, 2);
    const n = C.makeMove(after, reply);
    return { theme: 'mate2', sol: [first.map(C.uci), C.uci(reply), A.mateMoves(n, 1).map(C.uci)] };
  }
  const r = A.rankMoves(p, 3, 250);             // genau für alle Züge bis 2,5 Bauern unter dem besten
  if (r.length < 2 || r[0].v > 50000) return null;
  // Lösungen = alle Züge fast so gut wie der beste; alle anderen müssen deutlich schlechter sein
  const okR = r.filter(x => x.v >= r[0].v - 40), rest = r.find(x => x.v < r[0].v - 40);
  if (r[0].v < 200 || okR.length > 3 || (rest && r[0].v - rest.v < 200)) { stats.notunique++; return null; }
  const ok = okR.map(x => C.uci(x.m));
  const after = C.makeMove(p, r[0].m);
  if (C.status(after)) return null;
  const reply = A.bestMove(after, 3), n = C.makeMove(after, reply);
  const sol = [ok, C.uci(reply)];
  const r2 = A.rankMoves(n, 2, 200);
  if (r2.length > 1 && r2[0].v - r2[1].v >= 150 && r2[0].m.captured) sol.push(r2.filter(x => x.v >= r2[0].v - 40).map(x => C.uci(x.m)));
  else sol.pop();
  return { theme: 'win', sol, gain: Math.round(r[0].v / 100) };
}

// Übliche Eröffnungen als Startpunkt (UCI), danach spielt die Engine
const BOOK = [
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5', 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6', 'e2e4 e7e5 g1f3 g8f6', 'e2e4 c7c5 g1f3 d7d6',
  'e2e4 c7c5 b1c3 b8c6', 'e2e4 e7e6 d2d4 d7d5', 'e2e4 c7c6 d2d4 d7d5', 'e2e4 d7d5 e4d5 d8d5 b1c3',
  'd2d4 d7d5 c2c4 e7e6', 'd2d4 d7d5 c2c4 c7c6', 'd2d4 g8f6 c2c4 e7e6 b1c3', 'd2d4 g8f6 c2c4 g7g6',
  'c2c4 e7e5 b1c3', 'g1f3 d7d5 g2g3', 'e2e4 e7e5 f2f4', 'e2e4 e7e5 b1c3 g8f6', 'd2d4 d7d5 c1f4', 'e2e4 g7g6 d2d4 f8g7'
];
var prevFen, prevFen2;
let g = 0;
while (g < GAMES && Object.keys(want).some(t => got[t].length < want[t])) {
  g++;
  let p = C.parseFEN(C.START);
  const book = BOOK[g % BOOK.length].split(' ');
  for (const u of book) p = C.makeMove(p, C.parseUci(p, u));
  const blunderAt = 8 + Math.floor(Math.random() * 50);       // Halbzug, in dem eine Seite patzt
  let tries = 0, blundered = false;
  for (let ply = book.length; ply < 120; ply++) {
    if (C.status(p)) break;
    let m;
    if (!blundered && ply - book.length >= blunderAt) {
      // Ein echter Fehler: ein Zug, der mindestens 2,5 Bauern kostet (oder Matt zulässt)
      // genaue Werte aller Züge (volles Suchfenster)
      const r = C.legalMoves(p).map(x => ({ m: x, v: -A.search(C.makeMove(p, x), 1, -Infinity, Infinity, 1) })).sort((a, b) => b.v - a.v);
      const needMate = got.mate1.length < want.mate1 || got.mate2.length < want.mate2;
      // Material-Aufgaben nur aus ausgeglichener Stellung; Matt-Patzer dürfen auch aus etwas schlechterer Lage kommen
      const lim = needMate && r.some(x => x.v < -50000) ? 400 : 150;
      const bad = r.filter(x => x.v <= r[0].v - 250 && Math.abs(r[0].v) < lim);
      if (!bad.length) { stats.nobad++; m = r[0].m; if (++tries > 12) break; }
      else {
        // Matt-Aufgaben sind seltener: Patzer bevorzugen, die ein Matt zulassen
        const mating = needMate ? bad.filter(x => A.canMate(C.makeMove(p, x.m), 1) || (bad.length < 12 && A.canMate(C.makeMove(p, x.m), 2))) : [];
        const pool = mating.length && Math.random() < .7 ? mating : bad;
        m = pool[Math.floor(Math.random() * pool.length)].m;
        blundered = true;
        const before = C.toFEN(p);
        const n = C.makeMove(p, m);
        if (C.status(n)) break;
        const z = puzzleAt(n, m);
        if (z && got[z.theme].length < want[z.theme]) {
          seen.add(key(n));
          got[z.theme].push({ preFen: before, pre: C.uci(m), ...z });
          emit(got[z.theme][got[z.theme].length - 1]);
          break;
        }
        if (!MATES) break;
      }
    } else m = A.bestMove(p, 2, 10);
    prevFen2 = C.toFEN(p);
    p = C.makeMove(p, m);
    if (MATES && ply - book.length >= blunderAt - 1) {
      // Steht ein erzwungenes Matt in 1 oder 2 auf dem Brett? (auch aus klar gewonnener Stellung)
      const before = prevFen2, k = key(p);
      if (!seen.has(k) && !C.status(p) && before) {
        const m1 = A.mateMoves(p, 1);
        let z = null;
        if (m1.length && m1.length <= 2 && got.mate1.length < want.mate1) z = { theme: 'mate1', sol: [m1.map(C.uci)] };
        else if (!m1.length && got.mate2.length < want.mate2 && A.canMate(p, 2)) {
          const first = A.mateMoves(p, 2);
          if (first.length <= 2) {
            const after = C.makeMove(p, first[0]), reply = A.bestMove(after, 2), n = C.makeMove(after, reply);
            z = { theme: 'mate2', sol: [first.map(C.uci), C.uci(reply), A.mateMoves(n, 1).map(C.uci)] };
          }
        }
        if (z) { seen.add(k); got[z.theme].push({ preFen: before, pre: C.uci(m), ...z }); emit(got[z.theme][got[z.theme].length - 1]); break; }
      }
    }
  }
  process.stderr.write(`Partie ${g}: ${Object.entries(got).map(([t, l]) => t + ' ' + l.length).join(', ')} ${JSON.stringify(stats)}\n`);
}

const all = [...got.mate1, ...got.mate2, ...got.win].map((z, i) => ({ id: 'a' + (i + 1), ...z }));
// Die Aufgabe beginnt mit der Stellung vor dem letzten Zug des Gegners; dieser Zug wird vorgespielt.
const out = all.map(z => ({ id: z.id, theme: z.theme, fen: z.preFen, pre: z.pre, sol: z.sol, ...(z.gain ? { gain: z.gain } : {}) }));
if (JSONL) process.exit(0);
if (process.argv[3] === 'json') { console.log(JSON.stringify(out)); process.exit(0); }
console.log(`// Automatisch erzeugt von tools/make-puzzles.mjs – nicht von Hand ändern.
// fen: Stellung vor dem Zug des Gegners (pre), danach ist man selbst am Zug.
// sol: [erlaubte Züge, Antwort, erlaubte Züge, …]
export const PUZZLES = [\n${out.map(z => '  ' + JSON.stringify(z)).join(',\n')}\n];`);

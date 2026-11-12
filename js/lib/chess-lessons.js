// Lehrstoff der Schachschule (Phase 1): Kapitel → Lektionen → Schritte.
// Schritt-Typen:
//   intro   Erklärung mit Brett (fen, text, marks, arrows, showMoves, demo)
//   coords  n zufällige Felder antippen (coords: Beschriftung zeigen?)
//   find    ein Feld antippen (ok: Felder oder fn(pos) → Felder; place: Figur, die dort erscheint)
//   mark    alle passenden Felder markieren und prüfen (ok: Felder oder fn(pos))
//   collect mit einer Figur alle Sterne einsammeln und alle schwarzen Figuren schlagen (piece: welche Figur zieht)
//   move    einen Zug finden (ok: ['e2e4'] oder fn(pos, move, nachher) → true | Begründung; pre: Züge vorher)
//   quiz    Auswahlfrage (options, answer: Index oder fn(pos), explain: Text oder fn(pos))
//   play    Partie gegen den Computer (game: 'pawns', level)
//   seq     mehrere eigene Züge, der Computer antwortet dazwischen (line: [ok, ok, …], prompts: Text je Zug)
//   endgame aus der Stellung heraus gegen den verteidigenden Computer matt setzen (target: gute Zugzahl, limit: Höchstzahl)
import * as C from './chess-core.js';
import * as A from './chess-ai.js';

const F = (place, turn = 'w', castle = '-', ep = '-') => `${place} ${turn} ${castle} ${ep} 0 1`;
const EMPTY = F('8/8/8/8/8/8/8/8');
const line = (from, to) => { const a = C.sq(from), b = C.sq(to); return [from, ...C.between(a, b).map(C.sqName), to]; };
const file = f => [1, 2, 3, 4, 5, 6, 7, 8].map(r => f + r);
const rank = r => [...C.FILES].map(f => f + r);
const marks = (list, cls) => Object.fromEntries(list.map(s => [s, cls]));
export const targetsOf = (p, from) => C.legalMoves(p, { from: C.sq(from), castling: false }).map(m => C.sqName(m.to));

/* ---------- Hilfen für die Bewertung von Zügen ---------- */
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const nameOf = x => C.NAME[C.typeOf(x)];
// Wie kann sich die Seite am Zug retten? (für Erklärungen)
function rescue(n) {
  const ms = C.legalMoves(n);
  const m = ms.find(x => C.typeOf(x.piece) === 'k') || ms.find(x => x.captured) || ms[0];
  return m ? C.san(n, m) : '';
}
export function mate(p, m, n) {
  const s = C.status(n);
  if (s === 'mate') return true;
  if (s === 'stalemate') return 'Oh nein – das ist Patt! Schwarz steht nicht im Schach, kann aber nicht ziehen. Unentschieden.';
  if (C.inCheck(n)) return `Das ist Schach, aber kein Matt: Schwarz rettet sich mit ${rescue(n)}.`;
  return 'Das ist kein Schach – also auch kein Matt.';
}
const givesCheck = (p, m, n) => C.inCheck(n) || 'Das ist kein Schach. Der schwarze König muss angegriffen sein.';
const captureOf = type => (p, m) => !m.captured ? 'Das war kein Schlagzug.' : C.typeOf(m.captured) === type || `Du hast ${articleOf(m.captured)} geschlagen. Gesucht war ${articleOf(type)}.`;
const articleOf = x => ({ p: 'den Bauern', n: 'den Springer', b: 'den Läufer', r: 'den Turm', q: 'die Dame', k: 'den König' })[C.typeOf(x)];
const isCapture = (p, m) => !!m.captured || 'Das war kein Schlagzug. Suche eine Figur, die etwas schlagen kann.';
// Schach abwehren auf eine bestimmte Art
const checkers = p => C.attackers(p, C.kingSq(p, p.turn), C.other(p.turn));
const defend = how => (p, m) => {
  const ck = checkers(p)[0], king = C.typeOf(m.piece) === 'k', took = m.to === ck;
  const way = king ? 'weg' : took ? 'schlagen' : 'dazwischen';
  if (way === how) return true;
  return `Das wehrt das Schach auch ab (${({ weg: 'König weggezogen', schlagen: 'Angreifer geschlagen', dazwischen: 'dazwischengezogen' })[way]}). Hier ist aber eine andere Art gesucht.`;
};
// Kein Patt und die Dame nicht hergeben
function noStalemate(p, m, n) {
  if (C.status(n) === 'stalemate') return 'Patt! Schwarz steht nicht im Schach, kann aber nicht ziehen – unentschieden. Das wäre schade.';
  const q = n.b.indexOf('Q');
  if (q >= 0 && C.attacked(n, q, 'b') && !C.attacked(n, q, 'w')) return 'Kein Patt – aber jetzt kann der schwarze König deine Dame schlagen!';
  return true;
}
const castleLegal = mv => p => C.legalMoves(p).some(m => C.uci(m) === mv) ? 0 : 1;
const undefended = p => {
  const out = [];
  for (let i = 0; i < 64; i++) if (C.colorOf(p.b[i]) === 'b' && !C.attacked(p, i, 'b')) out.push(C.sqName(i));
  return out;
};
const subjectOf = x => ({ p: 'Der Bauer', n: 'Der Springer', b: 'Der Läufer', r: 'Der Turm', q: 'Die Dame' })[C.typeOf(x)];
const safeCapture = (p, m, n) => {
  if (!m.captured) return 'Das war kein Schlagzug.';
  const mine = VAL[C.typeOf(m.piece)], theirs = VAL[C.typeOf(m.captured)];
  if (C.attacked(n, m.to, 'b') && mine > theirs)
    return `${subjectOf(m.captured)} war gedeckt: Schwarz schlägt zurück, und du gibst ${articleOf(m.piece)} (${mine}) für ${articleOf(m.captured)} (${theirs}).`;
  return true;
};
const bestCapture = (p, m) => {
  if (!m.captured) return 'Das war kein Schlagzug.';
  const best = Math.max(...C.legalMoves(p).filter(x => x.captured).map(x => VAL[C.typeOf(x.captured)]));
  return VAL[C.typeOf(m.captured)] === best || `${nameOf(m.captured)} = ${VAL[C.typeOf(m.captured)]} – es gibt etwas Wertvolleres zu schlagen.`;
};
// Felder neben dem König, die der Gegner angreift (König dafür vom Brett genommen)
const kingNoGo = p => {
  const k = C.kingSq(p, p.turn), q = C.clone(p);
  q.b[k] = null;
  return C.attacksFrom(p, k).filter(i => C.colorOf(p.b[i]) !== p.turn && C.attacked(q, i, C.other(p.turn))).map(C.sqName);
};
const kindOf = p => { const s = C.status(p); return s === 'mate' ? 1 : s === 'stalemate' ? 2 : C.inCheck(p) ? 0 : 3; };
const kindText = p => [
  `Schach: Der König wird angegriffen, kann sich aber retten, z. B. mit ${rescue(p)}.`,
  'Matt: Der König steht im Schach, und es gibt keine Rettung.',
  'Patt: Kein Schach, aber Schwarz hat keinen erlaubten Zug – unentschieden.',
  'Nichts davon: Kein Schach, und Schwarz kann ganz normal ziehen.'][kindOf(p)];
const mateQuiz = p => C.status(p) === 'mate' ? 'Ja – der König steht im Schach, und nichts hilft mehr.' : `Nein – Schwarz rettet sich mit ${rescue(p)}.`;

/* ---------- Hilfen für Phase 2 (Matt und Taktik) ---------- */
const mate2 = (p, m) => A.matesIn(p, m, 2) || 'Danach kann sich Schwarz noch befreien. Suche einen Zug, nach dem jede Antwort ins Matt führt.';
const wins = (p, m) => (m.captured && VAL[C.typeOf(m.captured)] >= 3) || 'Damit gewinnst du keine Figur. Was steht jetzt ungeschützt?';
// Felder der Figuren von `color`, die an ihren König gefesselt sind
export function pinned(p, color) {
  const k = C.kingSq(p, color), out = [];
  if (k < 0) return out;
  for (let i = 0; i < 64; i++) {
    if (i === k || C.colorOf(p.b[i]) !== color) continue;
    const q = C.clone(p);
    q.b[i] = null;
    if (!C.inCheck(p, color) && C.inCheck(q, color)) out.push(i);
  }
  return out;
}
const pinsKnight = (p, m, n) => pinned(n, 'b').some(i => n.b[i] === 'n') || 'Damit ist der Springer nicht gefesselt. Zwischen deiner Figur, dem Springer und dem König muss eine gerade Linie entstehen.';
// Nach dem Zug darf Schwarz nicht sofort matt setzen können
const noMateThreat = (p, m, n) => {
  const t = A.mateMoves(n, 1);
  return !t.length || `Dann setzt Schwarz mit ${C.san(n, t[0])} matt!`;
};
const canMate1 = p => A.canMate(p, 1) ? 0 : 1;

const KIND = ['Schach', 'Matt', 'Patt', 'Nichts davon'];
const VALUES_TABLE = `<table class="cs-values"><tr><td>Bauer</td><td>1</td></tr><tr><td>Springer</td><td>3</td></tr><tr><td>Läufer</td><td>3</td></tr>
  <tr><td>Turm</td><td>5</td></tr><tr><td>Dame</td><td>9</td></tr><tr><td>König</td><td>unbezahlbar</td></tr></table>`;

// Kürzester Weg für eine Sammel-Aufgabe: Figur auf `from` sammelt alle Sterne und schlägt alle schwarzen Figuren.
// Liefert die Zugfolge [[von, nach], …] oder null.
export function collectSolve(p, from, stars) {
  const targets = [], base = p.b.slice();
  for (let i = 0; i < 64; i++) if (C.colorOf(base[i]) === 'b') { targets.push(i); base[i] = null; }
  const piece = base[from];
  base[from] = null;
  const all = targets.length + stars.length, full = (1 << all) - 1;
  const key = (s, mask) => s * 4096 + mask;
  const start = key(from, 0), prev = new Map([[start, null]]);
  let queue = [[from, 0]];
  while (queue.length) {
    const nextQ = [];
    for (const [s, mask] of queue) {
      if (mask === full) {
        const path = [];
        for (let k = key(s, mask); prev.get(k); k = prev.get(k)[0]) path.unshift(prev.get(k)[1]);
        return path;
      }
      const b = base.slice();
      targets.forEach((t, j) => { if (!(mask & (1 << j))) b[t] = p.b[t]; });
      b[s] = piece;
      const pos = { ...p, b, turn: 'w', ep: -1, castle: '' };
      for (const m of C.legalMoves(pos, { from: s, castling: false, ep: false, promo: false })) {
        let nm = mask;
        const ti = targets.indexOf(m.to), si = stars.indexOf(m.to);
        if (ti >= 0) nm |= 1 << ti;
        if (si >= 0) nm |= 1 << (targets.length + si);
        const k = key(m.to, nm);
        if (prev.has(k)) continue;
        prev.set(k, [key(s, mask), [s, m.to]]);
        nextQ.push([m.to, nm]);
      }
    }
    queue = nextQ;
  }
  return null;
}

/* ================================================================ */
export const CHAPTERS = [
{
  id: 'brett', title: 'Das Brett', desc: 'Felder, Linien, Reihen, Diagonalen und die Grundstellung.',
  lessons: [
    { id: 'felder', title: 'Felder und ihre Namen', desc: 'Jedes Feld hat einen Namen.', steps: [
      { type: 'intro', fen: EMPTY, marks: { h1: 'on' },
        text: 'Das Schachbrett hat <b>64 Felder</b>, abwechselnd hell und dunkel. Es liegt immer so, dass rechts unten ein <b>helles</b> Feld ist. Merkspruch: <i>Hell rechts unten.</i>' },
      { type: 'intro', fen: EMPTY, marks: { ...marks(file('e'), 'area'), ...marks(rank(4), 'area'), e4: 'on' },
        text: 'Die senkrechten Spalten heißen <b>Linien</b> (a bis h), die waagerechten Zeilen <b>Reihen</b> (1 bis 8). Jedes Feld heißt nach seiner Linie und Reihe – hier <b>e4</b>.' },
      { type: 'coords', n: 6, coords: true, prompt: 'Tippe auf das Feld' },
      { type: 'intro', fen: EMPTY, coords: false,
        text: 'Jetzt <b>ohne</b> Beschriftung! Weiß sitzt unten: Die a-Linie ist links, die 1. Reihe ganz unten.' },
      { type: 'coords', n: 6, coords: false, prompt: 'Tippe auf das Feld' }
    ] },
    { id: 'linien', title: 'Linien, Reihen, Diagonalen', desc: 'Die Wege der Figuren.', steps: [
      { type: 'intro', fen: EMPTY, marks: marks(line('a1', 'h8'), 'area'), arrows: [['c8', 'h3', 'b']],
        text: 'Gleichfarbige Felder, die sich schräg an den Ecken berühren, bilden eine <b>Diagonale</b>. Hier ist die lange Diagonale von a1 nach h8 markiert, der Pfeil zeigt eine andere.' },
      { type: 'mark', fen: EMPTY, prompt: 'Markiere alle Felder der <b>d-Linie</b>.', ok: file('d'), hint: 'Eine Linie geht von unten nach oben.' },
      { type: 'mark', fen: EMPTY, prompt: 'Markiere alle Felder der <b>6. Reihe</b>.', ok: rank(6), hint: 'Eine Reihe geht von links nach rechts.' },
      { type: 'mark', fen: EMPTY, prompt: 'Markiere die Diagonale von <b>a1 nach h8</b>.', ok: line('a1', 'h8'), hint: 'Starte links unten und gehe immer ein Feld schräg nach rechts oben.' },
      { type: 'quiz', fen: EMPTY, prompt: 'Welche Farbe haben die Felder der Diagonale a1–h8?', options: ['Hell', 'Dunkel'], answer: 1,
        explain: 'Dunkel. a1 ist ein dunkles Feld – und eine Diagonale hat immer nur eine Farbe.' },
      { type: 'quiz', prompt: 'Wie viele Felder hat eine Linie?', options: ['6', '8', '10'], answer: 1, explain: 'Acht – von der 1. bis zur 8. Reihe.' }
    ] },
    { id: 'grundstellung', title: 'Die Grundstellung', desc: 'So stehen die Figuren am Anfang.', steps: [
      { type: 'intro', fen: C.START,
        text: 'Zu Beginn stehen alle 32 Figuren so: Weiß unten, Schwarz oben. Vorne stehen die <b>Bauern</b>, dahinter die anderen Figuren.' },
      { type: 'intro', fen: C.START, marks: { a1: 'area', h1: 'area', b1: 'area', g1: 'area', c1: 'area', f1: 'area', d1: 'on', e1: 'sel', d8: 'on', e8: 'sel' },
        text: 'In den Ecken stehen die <b>Türme</b>, daneben die <b>Springer</b>, dann die <b>Läufer</b>. In der Mitte: <b>Dame</b> und <b>König</b>. Die Dame steht auf ihrer Farbe – die weiße Dame auf dem hellen Feld d1, die schwarze auf dem dunklen d8.' },
      { type: 'find', fen: F('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR'), place: 'Q', ok: ['d1'], prompt: 'Wohin gehört die <b>weiße Dame</b>?',
        wrong: s => s === 'e1' ? 'Dort steht der König.' : 'Die Dame steht in der Mitte der Grundreihe, auf ihrer eigenen Farbe.' },
      { type: 'find', fen: F('rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'), place: 'k', ok: ['e8'], prompt: 'Wohin gehört der <b>schwarze König</b>?',
        wrong: () => 'Der König steht in der Mitte der Grundreihe, neben der Dame.' },
      { type: 'find', fen: F('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R1BQKB1R'), place: 'N', ok: ['b1', 'g1'], prompt: 'Wo steht ein <b>weißer Springer</b>?',
        wrong: () => 'Die Springer stehen direkt neben den Türmen.' },
      { type: 'find', fen: F('rn1qk1nr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'), place: 'b', ok: ['c8', 'f8'], prompt: 'Wo steht ein <b>schwarzer Läufer</b>?',
        wrong: () => 'Die Läufer stehen zwischen Springer und Dame bzw. König.' },
      { type: 'quiz', fen: C.START, prompt: 'Auf welcher Farbe steht die <b>weiße Dame</b>?', options: ['Hell', 'Dunkel'], answer: 0,
        explain: 'Hell – die Dame steht immer auf ihrer eigenen Farbe.' }
    ] }
  ]
},
{
  id: 'figuren', title: 'Die Figuren', desc: 'Wie Turm, Läufer, Dame, König, Springer und Bauer ziehen.',
  lessons: [
    { id: 'turm', title: 'Der Turm', desc: 'Gerade, so weit er will.', steps: [
      { type: 'intro', fen: F('8/8/8/8/3R4/8/8/8'), showMoves: 'd4',
        text: 'Der <b>Turm</b> zieht gerade: waagerecht oder senkrecht, so weit er will. Die Punkte zeigen, wohin er ziehen kann.' },
      { type: 'intro', fen: F('8/8/3p4/8/1P1R4/8/8/8'), showMoves: 'd4',
        text: 'Über andere Figuren springt er nicht. Eine eigene Figur versperrt den Weg. Eine gegnerische Figur darf er <b>schlagen</b>: Er zieht auf ihr Feld, und sie verlässt das Brett.' },
      { type: 'mark', fen: F('8/8/8/8/8/2R5/8/8'), from: 'c3', prompt: 'Markiere alle Felder, auf die der Turm ziehen kann.', ok: p => targetsOf(p, 'c3') },
      { type: 'collect', fen: F('8/8/8/8/8/8/8/R7'), stars: ['a5', 'e5', 'e8', 'h8'], prompt: 'Sammle mit dem Turm alle Sterne ein.' },
      { type: 'collect', fen: F('8/8/2P5/8/P4P2/8/8/R7'), piece: 'a1', stars: ['a3', 'f3', 'c8', 'h4'], prompt: 'Sammle alle Sterne – die weißen Bauern stehen im Weg.' },
      { type: 'collect', fen: F('p7/8/8/p3p3/8/8/4p3/R7'), prompt: 'Schlage mit dem Turm alle schwarzen Bauern.' }
    ] },
    { id: 'laeufer', title: 'Der Läufer', desc: 'Schräg und immer auf seiner Farbe.', steps: [
      { type: 'intro', fen: F('8/8/8/8/3B4/8/8/8'), showMoves: 'd4',
        text: 'Der <b>Läufer</b> zieht schräg (diagonal), so weit er will. Deshalb bleibt er immer auf seiner Farbe: Ein Läufer auf einem dunklen Feld kommt nie auf ein helles.' },
      { type: 'mark', fen: F('8/8/7p/8/5B2/8/3P4/8'), from: 'f4', prompt: 'Markiere alle Felder, auf die der Läufer ziehen kann.', ok: p => targetsOf(p, 'f4') },
      { type: 'quiz', fen: F('8/8/8/8/8/8/8/2B5'), marks: { h5: 'on' }, prompt: 'Kann dieser Läufer jemals das Feld <b>h5</b> erreichen?', options: ['Ja', 'Nein'], answer: 1,
        explain: 'Nein. Der Läufer steht auf einem dunklen Feld, h5 ist hell – und ein Läufer wechselt nie die Farbe.' },
      { type: 'collect', fen: F('8/8/8/8/8/8/8/2B5'), stars: ['a3', 'f4', 'h2', 'd8'], prompt: 'Sammle mit dem Läufer alle Sterne ein.' },
      { type: 'collect', fen: F('8/3p4/8/1p6/8/7p/4p3/5B2'), prompt: 'Schlage mit dem Läufer alle schwarzen Bauern.' }
    ] },
    { id: 'dame', title: 'Die Dame', desc: 'Die stärkste Figur.', steps: [
      { type: 'intro', fen: F('8/8/8/8/3Q4/8/8/8'), showMoves: 'd4',
        text: 'Die <b>Dame</b> ist die stärkste Figur: Sie zieht wie Turm und Läufer zusammen – gerade und schräg, so weit sie will.' },
      { type: 'mark', fen: F('8/8/8/8/1r6/2P5/1Q2P3/8'), from: 'b2', prompt: 'Markiere alle Felder, auf die die Dame ziehen kann.', ok: p => targetsOf(p, 'b2'),
        hint: 'Denk an alle acht Richtungen. Den schwarzen Turm darf sie schlagen.' },
      { type: 'collect', fen: F('8/8/8/8/8/8/8/3Q4'), stars: ['a4', 'h5', 'd8', 'b6', 'g1'], prompt: 'Sammle mit der Dame alle Sterne ein.' },
      { type: 'collect', fen: F('1n4r1/8/8/3b4/8/8/6p1/Q7'), prompt: 'Schlage mit der Dame alle schwarzen Figuren.' }
    ] },
    { id: 'koenig', title: 'Der König', desc: 'Die wichtigste Figur.', steps: [
      { type: 'intro', fen: F('8/8/8/8/3K4/8/8/8'), showMoves: 'd4',
        text: 'Der <b>König</b> ist die wichtigste Figur – um ihn dreht sich alles. Er zieht in jede Richtung, aber immer nur <b>ein</b> Feld weit.' },
      { type: 'mark', fen: F('8/8/8/8/2PK4/8/4P3/8'), from: 'd4', prompt: 'Markiere alle Felder, auf die der König ziehen kann.', ok: p => targetsOf(p, 'd4') },
      { type: 'collect', fen: F('8/8/8/8/8/8/8/K7'), stars: ['d4', 'h1', 'f6'], prompt: 'Sammle mit dem König alle Sterne ein.' }
    ] },
    { id: 'springer', title: 'Der Springer', desc: 'Er springt im L.', steps: [
      { type: 'intro', fen: F('8/8/8/8/3N4/8/8/8'), showMoves: 'd4', arrows: [['d4', 'd6', 'b'], ['d6', 'e6', 'b']],
        text: 'Der <b>Springer</b> zieht wie ein L: zwei Felder geradeaus und dann eins zur Seite. Dabei wechselt er jedes Mal die Feldfarbe.' },
      { type: 'intro', fen: F('8/8/8/2PPP3/2PNP3/2PPP3/8/8'), showMoves: 'd4',
        text: 'Als einzige Figur darf der Springer über andere <b>springen</b>. Auch umzingelt kommt er heraus!' },
      { type: 'mark', fen: F('8/8/2N5/4P3/8/8/8/8'), from: 'c6', prompt: 'Markiere alle Felder, auf die der Springer ziehen kann.', ok: p => targetsOf(p, 'c6') },
      { type: 'collect', fen: F('8/8/8/8/8/8/8/1N6'), stars: ['c3', 'e4', 'g5', 'f7'], prompt: 'Sammle mit dem Springer alle Sterne ein.' },
      { type: 'collect', fen: F('8/8/8/8/8/8/8/N7'), stars: ['h8'], prompt: 'Bring den Springer von a1 in die andere Ecke nach h8.', hint: 'Der Springer braucht dafür sechs Züge.' },
      { type: 'collect', fen: F('8/2p5/8/3p4/5p2/8/8/6N1'), prompt: 'Schlage mit dem Springer alle schwarzen Bauern.' }
    ] },
    { id: 'bauer', title: 'Der Bauer', desc: 'Vorwärts ziehen, schräg schlagen.', steps: [
      { type: 'intro', fen: F('8/8/8/8/8/8/4P3/8'), showMoves: 'e2',
        text: 'Der <b>Bauer</b> zieht nur vorwärts, ein Feld geradeaus. Bei seinem allerersten Zug darf er auch <b>zwei</b> Felder ziehen.' },
      { type: 'intro', fen: F('8/8/8/3pbn2/4P3/8/8/8'), showMoves: 'e4',
        text: 'Der Bauer schlägt anders, als er zieht: <b>schräg nach vorn</b>, ein Feld weit. Steht etwas direkt vor ihm, ist er blockiert – geradeaus kann er nicht schlagen.' },
      { type: 'quiz', fen: F('8/8/8/4p3/4P3/8/8/8'), prompt: 'Kann der weiße Bauer den schwarzen Bauern schlagen?', options: ['Ja', 'Nein'], answer: 1,
        explain: 'Nein – Bauern schlagen nur schräg. Die beiden blockieren sich gegenseitig.' },
      { type: 'mark', fen: F('8/8/8/8/8/2n1p3/3P4/8'), from: 'd2', prompt: 'Markiere alle Felder, auf die der Bauer ziehen kann.', ok: p => targetsOf(p, 'd2') },
      { type: 'collect', fen: F('8/8/4n3/8/3p4/2p5/1P6/8'), prompt: 'Schlage mit dem Bauern alle schwarzen Figuren.', hint: 'Der Bauer schlägt schräg nach vorn. Manchmal muss er zwischendurch geradeaus ziehen.' }
    ] }
  ]
},
{
  id: 'werte', title: 'Schlagen & Werte', desc: 'Schlagen, Figurenwerte, gedeckte und ungedeckte Figuren.',
  lessons: [
    { id: 'schlagen', title: 'Figuren schlagen', desc: 'Wer kann wen schlagen?', steps: [
      { type: 'intro', fen: F('8/8/8/3n4/8/8/3R4/8'), arrows: [['d2', 'd5', 'g']],
        text: '<b>Schlagen</b> heißt: Du ziehst mit deiner Figur auf das Feld einer gegnerischen Figur. Die geschlagene Figur kommt vom Brett. Eigene Figuren kann man nicht schlagen.' },
      { type: 'move', fen: F('8/8/1n6/8/8/8/1R4B1/8'), prompt: 'Schlage den schwarzen <b>Springer</b>.', ok: captureOf('n'), success: 'Richtig, der Turm schlägt den Springer.' },
      { type: 'find', fen: F('8/8/8/4r3/8/3P1N2/B7/7R'), prompt: 'Welche weiße Figur kann den schwarzen <b>Turm</b> schlagen? Tippe sie an.',
        ok: p => C.attackers(p, C.sq('e5'), 'w').map(C.sqName), wrong: () => 'Diese Figur erreicht e5 nicht.', success: 'Genau – der Springer springt nach e5.' },
      { type: 'move', fen: F('3q4/8/8/1b3n2/8/2N5/8/R6Q'), prompt: 'Es gibt genau <b>einen</b> Zug, mit dem du etwas schlagen kannst. Finde ihn!', ok: isCapture,
        hint: 'Schau dir genau an, wohin jede weiße Figur ziehen kann.' }
    ] },
    { id: 'werte', title: 'Was ist eine Figur wert?', desc: 'Punkte für jede Figur.', steps: [
      { type: 'intro', fen: F('8/8/8/8/PNBRQK2/8/8/8'),
        text: `Figuren sind unterschiedlich stark. Diese Punkte helfen beim Vergleichen:${VALUES_TABLE}Der König kann nie geschlagen werden – ohne ihn geht nichts.` },
      { type: 'quiz', prompt: 'Was ist mehr wert: ein <b>Turm</b> oder ein <b>Läufer</b>?', options: ['Turm', 'Läufer', 'Gleich viel'], answer: 0, explain: 'Der Turm: 5 Punkte, der Läufer nur 3.' },
      { type: 'quiz', prompt: 'Was ist mehr wert: ein <b>Springer</b> oder ein <b>Läufer</b>?', options: ['Springer', 'Läufer', 'Gleich viel'], answer: 2, explain: 'Gleich viel – beide sind 3 Punkte wert.' },
      { type: 'quiz', prompt: 'Was ist mehr wert: eine <b>Dame</b> oder <b>zwei Türme</b>?', options: ['Dame', 'Zwei Türme', 'Gleich viel'], answer: 1, explain: 'Zwei Türme: 5 + 5 = 10, die Dame 9. Knapp!' },
      { type: 'move', fen: F('8/8/4r3/1b6/3N4/8/8/8'), prompt: 'Du kannst zwei Figuren schlagen. Nimm die <b>wertvollere</b>!', ok: bestCapture, success: 'Richtig – der Turm (5) ist mehr wert als der Läufer (3).' },
      { type: 'move', fen: F('8/3q4/8/8/8/8/8/n2R4'), prompt: 'Und hier? Schlage die wertvollere Figur.', ok: bestCapture, success: 'Genau – die Dame ist 9 Punkte wert.' }
    ] },
    { id: 'gedeckt', title: 'Gedeckt oder ungedeckt?', desc: 'Schlagen, ohne selbst etwas zu verlieren.', steps: [
      { type: 'intro', fen: F('8/8/2p5/3n4/8/8/8/3R4'), arrows: [['d1', 'd5', 'g'], ['c6', 'd5', 'r']],
        text: 'Eine Figur ist <b>gedeckt</b>, wenn eine eigene Figur zurückschlagen kann. Schlägt hier der Turm den Springer, schlägt der Bauer den Turm. Turm (5) gegen Springer (3) – ein schlechter Tausch!' },
      { type: 'find', fen: F('8/1p3r2/2b5/8/5n2/8/8/8'), prompt: 'Welche schwarze Figur ist <b>ungedeckt</b>? Tippe sie an.', ok: undefended,
        wrong: s => `Die Figur auf ${s} ist gedeckt – eine andere schwarze Figur könnte zurückschlagen.`, success: 'Richtig – den Turm auf f7 deckt niemand.' },
      { type: 'move', fen: F('8/8/4p3/3n4/b7/8/8/3Q4'), prompt: 'Schlage die Figur, die <b>nicht gedeckt</b> ist.', ok: safeCapture,
        success: 'Richtig! Der Läufer war ungedeckt – ein Geschenk.' },
      { type: 'move', fen: F('8/8/2p5/3n4/4P3/8/8/3Q4'), prompt: 'Der Springer ist gedeckt. Kannst du ihn trotzdem mit Gewinn schlagen?', ok: safeCapture,
        success: 'Genau! Schlägt Schwarz zurück, hast du einen Bauern (1) gegen einen Springer (3) getauscht.', hint: 'Schlag mit der Figur, die am wenigsten wert ist.' }
    ] }
  ]
},
{
  id: 'bauernspiel', title: 'Das Bauernspiel', desc: 'Nur Bauern: Wer zuerst durchkommt, gewinnt.',
  lessons: [
    { id: 'regeln', title: 'Regeln und Kniffe', desc: 'Freibauern und Wettrennen.', steps: [
      { type: 'intro', fen: F('8/pppppppp/8/8/8/8/PPPPPPPP/8'),
        text: 'Beim <b>Bauernspiel</b> gibt es nur Bauern. Wer zuerst einen Bauern auf die andere Seite bringt, gewinnt. Kann jemand nicht mehr ziehen, endet es unentschieden. Ein super Training für das richtige Schach!' },
      { type: 'intro', fen: F('8/pp6/8/8/5P2/8/8/8'), marks: marks(['f5', 'f6', 'f7', 'f8'], 'area'),
        text: 'Ein <b>Freibauer</b> hat keinen gegnerischen Bauern mehr vor sich – weder auf seiner Linie noch auf den Nachbarlinien. Ihn kann niemand mehr aufhalten.' },
      { type: 'move', fen: F('8/5ppp/8/8/8/2p5/1P3PPP/8'), prompt: 'Der schwarze Bauer auf c3 läuft gleich durch! Halte ihn auf.', ok: ['b2c3'],
        wrong: 'Dann zieht der Bauer weiter nach c2 und c1 – verloren.', opts: { ep: false, promo: false }, success: 'Gerettet – du hast ihn geschlagen.' },
      { type: 'move', fen: F('8/p4p2/8/3p4/4P3/8/8/8'), prompt: 'Mach dir einen <b>Freibauern</b>!', ok: ['e4d5'], opts: { ep: false, promo: false },
        wrong: 'Danach gibt es noch schwarze Bauern, die ihn aufhalten können.', success: 'Super! Der Bauer auf d5 hat freie Bahn.', hint: 'Durch Schlagen wechselt ein Bauer die Linie.' },
      { type: 'quiz', fen: F('8/6p1/8/8/8/8/1P6/8'), prompt: 'Wettrennen! Weiß ist am Zug. Wer kommt zuerst an?', options: ['Weiß', 'Schwarz'], answer: 0,
        explain: 'Weiß. Beide brauchen fünf Züge (der erste Zug darf ein Doppelschritt sein). Weiß fängt an und ist einen Zug früher da.' },
      { type: 'quiz', fen: F('8/8/8/6p1/8/8/1P6/8'), prompt: 'Und jetzt? Weiß ist wieder am Zug.', options: ['Weiß', 'Schwarz'], answer: 1,
        explain: 'Schwarz. Der Bauer g5 braucht nur vier Züge, Weiß fünf.' }
    ] },
    { id: 'leicht', title: 'Gegen den Computer', desc: 'Gewinne ein Bauernspiel (leicht).', steps: [
      { type: 'play', game: 'pawns', level: 'leicht', prompt: 'Bring einen Bauern auf die 8. Reihe, bevor Schwarz die 1. Reihe erreicht.' }
    ] },
    { id: 'stark', title: 'Gegen den starken Computer', desc: 'Jetzt wird es knifflig.', steps: [
      { type: 'play', game: 'pawns', level: 'stark', prompt: 'Der Computer rechnet jetzt weiter voraus. Achte auf Freibauern!' }
    ] }
  ]
},
{
  id: 'schach', title: 'Schach, Matt und Patt', desc: 'Den König angreifen, verteidigen und matt setzen.',
  lessons: [
    { id: 'schach', title: 'Schach!', desc: 'Der König wird angegriffen.', steps: [
      { type: 'intro', fen: F('4k3/8/8/8/8/8/8/4R1K1', 'b'), arrows: [['e1', 'e8', 'r']],
        text: 'Greift eine Figur den König an, steht er im <b>Schach</b>. Der König darf nie geschlagen werden – deshalb muss man ein Schach sofort abwehren. Und man darf nie so ziehen, dass der eigene König im Schach steht.' },
      { type: 'find', fen: F('4k3/8/3N4/8/8/1B6/8/R3K3', 'b'), prompt: 'Welche Figur gibt dem schwarzen König Schach? Tippe sie an.',
        ok: p => checkers(p).map(C.sqName), wrong: () => 'Diese Figur greift den König nicht an.', success: 'Richtig – der Springer greift e8 an.' },
      { type: 'move', fen: F('4k3/8/8/8/8/8/2N5/R5K1'), prompt: 'Gib dem schwarzen König <b>Schach</b>!', ok: givesCheck, success: 'Schach!' },
      { type: 'mark', fen: F('8/8/R7/4k3/8/6N1/8/K7', 'b'), from: 'e5', ok: kingNoGo,
        prompt: 'Auf welche Felder darf der schwarze König <b>nicht</b> ziehen? Markiere alle Nachbarfelder, die Weiß angreift.',
        hint: 'Der Turm greift die ganze 6. Reihe an. Und wohin kann der Springer springen?' }
    ] },
    { id: 'abwehr', title: 'Schach abwehren', desc: 'Wegziehen, schlagen, dazwischenziehen.', steps: [
      { type: 'intro', fen: F('4k3/8/8/4r3/2N5/8/8/4K3'), arrows: [['e5', 'e1', 'r']],
        text: 'Ein Schach kann man auf drei Arten abwehren:<br>1. <b>Wegziehen</b> – der König geht auf ein sicheres Feld.<br>2. <b>Schlagen</b> – die Figur, die Schach gibt, wird geschlagen.<br>3. <b>Dazwischenziehen</b> – eine Figur stellt sich in den Weg (geht nicht gegen einen Springer).' },
      { type: 'move', fen: F('4k3/8/8/4r3/2N5/8/8/4K3'), prompt: 'Du stehst im Schach. Wehre es ab, indem du den Angreifer <b>schlägst</b>.', ok: defend('schlagen'), success: 'Richtig – der Springer schlägt den Turm.' },
      { type: 'move', fen: F('6k1/8/8/8/3R4/8/6PP/r6K'), prompt: 'Wehre das Schach ab, indem du eine Figur <b>dazwischenstellst</b>.', ok: defend('dazwischen'), success: 'Genau – der Turm stellt sich in den Weg.' },
      { type: 'move', fen: F('4k3/1b6/8/8/4K3/4N3/8/8'), prompt: 'Wehre das Schach ab, indem du mit dem König <b>wegziehst</b>.', ok: defend('weg'),
        success: 'Gut – der König steht jetzt sicher.', hint: 'Auf der Diagonale des Läufers ist der König nicht sicher – auch nicht hinter sich selbst!' },
      { type: 'move', fen: F('6k1/8/8/8/8/2B5/5PPP/4r1K1'), prompt: 'Nur <b>ein</b> Zug rettet dich. Finde ihn!', ok: ['c3e1'], success: 'Gerettet! Der Läufer schlägt den Turm.' }
    ] },
    { id: 'matt', title: 'Schachmatt', desc: 'Keine Rettung mehr.', steps: [
      { type: 'intro', fen: F('6k1/5ppp/8/8/8/8/8/R5K1'), demo: ['a1a8'],
        text: 'Steht der König im Schach und gibt es <b>keine</b> Abwehr, ist er <b>schachmatt</b>. Dann ist die Partie sofort vorbei – wer matt setzt, gewinnt! Drück auf „Zeigen“.' },
      { type: 'quiz', fen: F('R5k1/5ppp/8/8/8/8/8/6K1', 'b'), prompt: 'Ist der schwarze König matt?', options: ['Ja', 'Nein'], answer: p => C.status(p) === 'mate' ? 0 : 1, explain: mateQuiz },
      { type: 'quiz', fen: F('R5k1/5pp1/7p/8/8/8/8/6K1', 'b'), prompt: 'Und hier – matt?', options: ['Ja', 'Nein'], answer: p => C.status(p) === 'mate' ? 0 : 1, explain: mateQuiz },
      { type: 'quiz', fen: F('R5k1/5ppp/8/8/8/5b2/8/6K1', 'b'), prompt: 'Und hier?', options: ['Ja', 'Nein'], answer: p => C.status(p) === 'mate' ? 0 : 1, explain: mateQuiz },
      { type: 'move', fen: F('6k1/5ppp/8/8/8/8/8/R5K1'), prompt: 'Setze <b>matt</b> in einem Zug!', ok: mate, success: 'Schachmatt! Gewonnen.' },
      { type: 'move', fen: F('k7/8/1K6/8/8/8/7Q/8'), prompt: 'Setze <b>matt</b> in einem Zug! Dein König hilft mit.', ok: mate, success: 'Schachmatt!',
        hint: 'Die Dame muss den König angreifen, und er darf kein freies Feld mehr haben.' }
    ] },
    { id: 'patt', title: 'Patt', desc: 'Vorsicht beim Gewinnen!', steps: [
      { type: 'intro', fen: F('k7/2Q5/1K6/8/8/8/8/8', 'b'), marks: { a7: 'bad', b7: 'bad', b8: 'bad' },
        text: 'Steht der König <b>nicht</b> im Schach, aber die Seite am Zug hat keinen erlaubten Zug, ist das <b>Patt</b>. Die Partie endet <b>unentschieden</b> – auch wenn eine Seite viel mehr Figuren hat. Hier ist Schwarz am Zug: Jedes Feld des Königs wird angegriffen, aber er steht nicht im Schach.' },
      { type: 'quiz', fen: F('7k/5Q2/6K1/8/8/8/8/8', 'b'), prompt: 'Schwarz ist am Zug. Was ist das?', options: KIND, answer: kindOf, explain: kindText },
      { type: 'quiz', fen: F('7k/6Q1/6K1/8/8/8/8/8', 'b'), prompt: 'Und das?', options: KIND, answer: kindOf, explain: kindText },
      { type: 'quiz', fen: F('k7/8/8/8/8/8/8/Q5K1', 'b'), prompt: 'Und das?', options: KIND, answer: kindOf, explain: kindText },
      { type: 'quiz', fen: F('4k3/8/8/8/8/8/8/R3K3', 'b'), prompt: 'Und das?', options: KIND, answer: kindOf, explain: kindText },
      { type: 'move', fen: F('k7/8/1K6/8/8/8/2Q5/8'), prompt: 'Weiß ist haushoch überlegen. Mach einen Zug, der <b>nicht Patt</b> setzt und die Dame nicht hergibt.', ok: noStalemate,
        success: 'Gut aufgepasst – Schwarz kann noch ziehen.', hint: 'Lass dem schwarzen König ein freies Feld – oder setze gleich matt.' },
      { type: 'move', fen: F('7k/8/6K1/8/8/8/8/5Q2'), prompt: 'Setze <b>matt</b> in einem Zug – aber Vorsicht vor dem Patt!', ok: mate, success: 'Schachmatt!' }
    ] }
  ]
},
{
  id: 'sonder', title: 'Sonderregeln', desc: 'Umwandlung, Rochade, en passant und Remis.',
  lessons: [
    { id: 'umwandlung', title: 'Bauernumwandlung', desc: 'Aus einem Bauern wird eine Dame.', steps: [
      { type: 'intro', fen: F('4k3/1P6/8/8/8/8/8/4K3'), demo: ['b7b8q'],
        text: 'Erreicht ein Bauer die letzte Reihe, wird er <b>umgewandelt</b>: in eine Dame, einen Turm, einen Läufer oder einen Springer – ganz wie du willst. Meistens nimmt man die Dame.' },
      { type: 'move', fen: F('4k3/1P6/8/8/8/8/8/4K3'), prompt: 'Zieh den Bauern nach vorn und wandle ihn um!', ok: (p, m) => !!m.promo || 'Zieh den Bauern auf die letzte Reihe.', success: 'Umgewandelt!' },
      { type: 'move', fen: F('r1n1k3/1P6/8/8/8/8/8/4K3'), prompt: 'Schlag mit dem Bauern, wandle um – und nimm dabei die <b>wertvollere</b> Figur.', ok: (p, m) => m.to === C.sq('a8') || (m.captured ? 'Der Springer ist nur 3 wert, der Turm auf a8 aber 5.' : 'Hier kannst du sogar noch etwas schlagen.'),
        success: 'Richtig – Turm geschlagen und eine neue Figur bekommen!' },
      { type: 'move', fen: F('8/5P1q/4k3/8/8/8/8/4K3'), prompt: 'Diesmal ist die Dame nicht die beste Wahl! Wandle so um, dass deine neue Figur dem König <b>Schach</b> gibt und gleichzeitig die schwarze <b>Dame</b> angreift.',
        ok: (p, m) => m.promo === 'n' || (m.promo ? 'Diese Figur gibt kein Schach. Welche Figur springt von f8 nach e6 und h7?' : 'Wandle den Bauern um.'),
        success: 'Stark! Der Springer gibt Schach und greift die Dame an. Schwarz muss den König retten – dann schlägst du die Dame.' }
    ] },
    { id: 'rochade', title: 'Die Rochade', desc: 'König in Sicherheit bringen.', steps: [
      { type: 'intro', fen: F('r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R', 'w', 'KQkq'), demo: ['e1g1'],
        text: 'Die <b>Rochade</b> ist der einzige Zug, bei dem zwei Figuren gleichzeitig ziehen: Der König geht zwei Felder zur Seite, der Turm springt über ihn hinweg. So bringt man den König in Sicherheit.' },
      { type: 'intro', fen: F('r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R', 'w', 'KQkq'), demo: ['e1c1'],
        text: 'Das geht kurz (zum nahen Turm, <b>0-0</b>) oder lang (zum fernen Turm, <b>0-0-0</b>).<br>Erlaubt ist die Rochade nur, wenn<br>• König und Turm noch nicht gezogen haben,<br>• alle Felder dazwischen frei sind,<br>• der König nicht im Schach steht und<br>• nicht über ein angegriffenes Feld oder ins Schach zieht.' },
      { type: 'move', fen: F('4k3/8/8/8/8/8/PPPPPPPP/R3K2R', 'w', 'KQ'), prompt: '<b>Rochiere kurz!</b> Zieh dazu den König zwei Felder nach rechts.', ok: ['e1g1'], success: 'Perfekt: 0-0.' },
      { type: 'move', fen: F('4k3/8/8/8/8/8/PPPPPPPP/R3K2R', 'w', 'KQ'), prompt: '<b>Rochiere lang!</b>', ok: ['e1c1'], success: 'Perfekt: 0-0-0.' },
      { type: 'quiz', fen: F('4k3/8/8/8/8/8/PPPPPPPP/R3KB1R', 'w', 'KQ'), prompt: 'Darf Weiß hier <b>kurz</b> rochieren?', options: ['Ja', 'Nein'], answer: castleLegal('e1g1'),
        explain: 'Nein – der Läufer auf f1 steht im Weg.' },
      { type: 'quiz', fen: F('4k3/8/8/8/2b5/8/PPPP2PP/R3K2R', 'w', 'KQ'), marks: { f1: 'bad' }, prompt: 'Darf Weiß hier <b>kurz</b> rochieren?', options: ['Ja', 'Nein'], answer: castleLegal('e1g1'),
        explain: 'Nein – der König müsste über f1 ziehen, und das greift der Läufer auf c4 an.' },
      { type: 'quiz', fen: F('4k3/8/8/b7/8/8/PPP2PPP/R3K2R', 'w', 'KQ'), prompt: 'Darf Weiß hier <b>kurz</b> rochieren?', options: ['Ja', 'Nein'], answer: castleLegal('e1g1'),
        explain: 'Nein – Weiß steht im Schach (Läufer a5). Im Schach darf man nicht rochieren.' },
      { type: 'quiz', fen: F('4k2r/8/8/8/8/8/PPPPPP2/R3K2R', 'w', 'KQ'), prompt: 'Der Turm auf h1 wird angegriffen. Darf Weiß trotzdem <b>kurz</b> rochieren?', options: ['Ja', 'Nein'], answer: castleLegal('e1g1'),
        explain: 'Ja! Der Turm darf angegriffen sein. Nur der König darf nicht im Schach stehen, nicht über ein angegriffenes Feld und nicht ins Schach ziehen.' },
      { type: 'quiz', fen: F('1r2k3/8/8/8/8/8/P1PPPPPP/R3K2R', 'w', 'KQ'), marks: { b1: 'bad' }, prompt: 'Das Feld b1 wird angegriffen. Darf Weiß <b>lang</b> rochieren?', options: ['Ja', 'Nein'], answer: castleLegal('e1c1'),
        explain: 'Ja! Über b1 zieht nur der Turm. Wichtig sind nur die Felder des Königs: e1, d1 und c1.' },
      { type: 'quiz', fen: F('4k3/8/8/8/8/8/PPPPPPPP/R3K2R', 'w', 'Q'), prompt: 'Der Turm auf h1 hat in dieser Partie schon einmal gezogen und ist zurückgekehrt. Darf Weiß <b>kurz</b> rochieren?', options: ['Ja', 'Nein'], answer: castleLegal('e1g1'),
        explain: 'Nein – mit einem Turm, der schon gezogen hat, darf man nicht mehr rochieren. Lang rochieren ginge noch.' }
    ] },
    { id: 'enpassant', title: 'En passant', desc: 'Schlagen im Vorbeigehen.', steps: [
      { type: 'intro', fen: F('4k3/3p4/8/4P3/8/8/8/4K3', 'b'), demo: ['d7d5', 'e5d6'],
        text: 'Zieht ein Bauer mit dem Doppelschritt an einem gegnerischen Bauern vorbei, darf dieser ihn so schlagen, als wäre er nur ein Feld gezogen. Das heißt <b>en passant</b> – französisch für „im Vorbeigehen“. Drück auf „Zeigen“.' },
      { type: 'intro', fen: F('4k3/8/8/3pP3/8/8/8/4K3', 'w', '-', 'd6'), arrows: [['e5', 'd6', 'g']], marks: { d5: 'bad' },
        text: 'Der schlagende Bauer landet auf dem übersprungenen Feld, der geschlagene Bauer verschwindet. Aber Achtung: En passant geht nur <b>sofort</b> im nächsten Zug. Wer wartet, verpasst die Gelegenheit.' },
      { type: 'move', fen: F('4k3/5p2/8/4P3/8/8/8/4K3', 'b'), pre: ['f7f5'], prompt: 'Schwarz hat gerade f7–f5 gezogen. Schlage <b>en passant</b>!', ok: ['e5f6'], success: 'Richtig – en passant!' },
      { type: 'move', fen: F('4k3/2p5/8/1P6/8/8/8/4K3', 'b'), pre: ['c7c5'], prompt: 'Und jetzt? Schlage en passant!', ok: ['b5c6'], success: 'Genau!' },
      { type: 'quiz', fen: F('4k3/8/8/3pP3/8/8/8/4K3'), prompt: 'Der schwarze Bauer ist schon <b>vor ein paar Zügen</b> nach d5 gezogen. Darf Weiß jetzt en passant schlagen?', options: ['Ja', 'Nein'],
        answer: p => C.legalMoves(p).some(m => m.flag === 'ep') ? 0 : 1, explain: 'Nein – en passant geht nur direkt nach dem Doppelschritt.' },
      { type: 'quiz', fen: F('4k3/8/8/8/3pP3/8/8/4K3', 'b', '-', 'e3'), prompt: 'Weiß hat gerade e2–e4 gezogen. Darf Schwarz en passant schlagen?', options: ['Ja', 'Nein'],
        answer: p => C.legalMoves(p).some(m => m.flag === 'ep') ? 0 : 1, explain: 'Ja – der Bauer d4 schlägt auf e3, der weiße Bauer verschwindet.' }
    ] },
    { id: 'remis', title: 'Unentschieden', desc: 'Wann keiner gewinnt.', steps: [
      { type: 'intro', fen: F('4k3/8/8/8/8/8/8/2B1K3'),
        text: 'Eine Partie endet <b>unentschieden</b> (Remis), wenn …<br>• ein <b>Patt</b> entsteht,<br>• keiner mehr matt setzen kann (zu wenig Figuren),<br>• dieselbe Stellung dreimal vorkommt,<br>• 50 Züge lang kein Bauer gezogen und nichts geschlagen wurde,<br>• oder sich beide auf Remis einigen.' },
      { type: 'quiz', fen: F('4k3/8/8/8/8/8/8/2B1K3'), prompt: 'König und Läufer gegen König: Kann Weiß noch gewinnen?', options: ['Ja', 'Nein'], answer: p => C.insufficient(p) ? 1 : 0,
        explain: 'Nein. Mit nur einem Läufer kann man nicht matt setzen – die Partie ist sofort remis.' },
      { type: 'quiz', fen: F('4k3/8/8/8/8/8/8/1N2K3'), prompt: 'König und Springer gegen König?', options: ['Ja', 'Nein'], answer: p => C.insufficient(p) ? 1 : 0,
        explain: 'Nein. Auch mit einem Springer allein geht kein Matt.' },
      { type: 'quiz', fen: F('4k3/8/8/8/8/8/8/R3K3'), prompt: 'König und Turm gegen König?', options: ['Ja', 'Nein'], answer: p => C.insufficient(p) ? 1 : 0,
        explain: 'Ja! Mit König und Turm kann man matt setzen – das lernst du bald.' },
      { type: 'quiz', fen: F('4k3/8/8/8/8/8/4P3/4K3'), prompt: 'König und Bauer gegen König?', options: ['Ja', 'Nein'], answer: p => C.insufficient(p) ? 1 : 0,
        explain: 'Ja – wenn der Bauer durchkommt, wird er zur Dame.' }
    ] }
  ]
},
{
  id: 'matt1', title: 'Matt in einem Zug', desc: 'Typische Mattbilder erkennen – und Matt in zwei.',
  lessons: [
    { id: 'grundreihe', title: 'Das Grundreihenmatt', desc: 'Gefangen hinter den eigenen Bauern.', steps: [
      { type: 'intro', fen: F('6k1/5ppp/8/8/8/8/5PPP/3R2K1'), demo: ['d1d8'],
        text: 'Steht der König hinter seinen eigenen Bauern, hat er keine Fluchtfelder. Ein Turm oder eine Dame auf der Grundreihe setzt dann matt – das <b>Grundreihenmatt</b>. Es gehört zu den häufigsten Matts überhaupt!' },
      { type: 'move', fen: F('1k6/ppp5/8/8/8/8/5PPP/4Q1K1'), prompt: 'Setze <b>matt</b>!', ok: mate, success: 'Grundreihenmatt!' },
      { type: 'move', fen: F('3r2k1/5ppp/8/8/8/8/5PPP/3RR1K1'), prompt: 'Setze <b>matt</b>! Achte auf den schwarzen Turm.', ok: mate, success: 'Matt – der schwarze Turm war die einzige Verteidigung.',
        hint: 'Der schwarze Turm verteidigt die Grundreihe. Kannst du ihn schlagen?' },
      { type: 'quiz', fen: F('6k1/5pp1/7p/8/8/8/5PPP/3R2K1'), arrows: [['d1', 'd8', 'g']], prompt: 'Ist <b>Td8</b> hier matt?', options: ['Ja', 'Nein'],
        answer: p => A.matesIn(p, C.parseUci(p, 'd1d8'), 1) ? 0 : 1, explain: 'Nein – der Bauer h6 hat dem König <b>Luft</b> gemacht: Er flieht nach h7.' },
      { type: 'move', fen: F('3r2k1/5ppp/8/8/8/8/5PPP/6K1'), prompt: 'Jetzt droht <b>dir</b> ein Grundreihenmatt (Td1). Verhindere es!', ok: noMateThreat,
        success: 'Gut verteidigt! „Luft machen“ ist ein wichtiger Trick.', hint: 'Gib deinem König ein Fluchtfeld – zieh einen Bauern vor ihm eins nach vorn.' }
    ] },
    { id: 'dame', title: 'Matt mit der Dame', desc: 'Die Dame direkt am König.', steps: [
      { type: 'intro', fen: F('6k1/5ppp/8/8/8/6Q1/1B6/6K1'), arrows: [['b2', 'g7', 'b'], ['g3', 'g7', 'g']],
        text: 'Die Dame setzt gern direkt neben dem König matt. Dafür muss sie <b>gedeckt</b> sein – sonst schlägt der König sie einfach. Hier deckt der Läufer das Feld g7.' },
      { type: 'move', fen: F('6k1/5ppp/8/8/8/6Q1/1B6/6K1'), prompt: 'Setze <b>matt</b>!', ok: mate, success: 'Matt! Der Läufer deckt die Dame.' },
      { type: 'move', fen: F('4k3/3p1p2/8/3N4/7Q/8/8/6K1'), prompt: 'Setze <b>matt</b>! Der Springer hilft.', ok: mate, success: 'Matt!', hint: 'Welches Feld neben dem König deckt der Springer?' },
      { type: 'move', fen: F('k7/2K5/8/8/8/8/8/1Q6'), prompt: 'Setze <b>matt</b>! Dein König hilft.', ok: mate, success: 'Matt!' },
      { type: 'move', fen: F('k7/8/1K6/8/8/8/8/2Q5'), prompt: 'Setze <b>matt</b> – aber kein Patt!', ok: mate, success: 'Matt!' }
    ] },
    { id: 'figuren', title: 'Matt mit Turm, Läufer und Springer', desc: 'Auch kleine Figuren setzen matt.', steps: [
      { type: 'intro', fen: F('6rk/6pp/8/6N1/8/8/8/6K1'), demo: ['g5f7'],
        text: 'Auch ein Springer kann matt setzen: Ist der König von seinen eigenen Figuren eingeklemmt, reicht ein Schach, das man nicht blocken kann. Das heißt <b>ersticktes Matt</b>. Drück auf „Zeigen“.' },
      { type: 'move', fen: F('r5rk/6pp/8/4N3/8/8/8/6K1'), prompt: 'Setze <b>matt</b> – ein ersticktes Matt!', ok: mate, success: 'Ersticktes Matt!' },
      { type: 'move', fen: F('7k/7p/8/8/8/B7/8/6RK'), prompt: 'Setze <b>matt</b>! Der Turm hält schon die g-Linie.', ok: mate, success: 'Matt – Läufer und Turm arbeiten zusammen.' },
      { type: 'move', fen: F('6k1/R7/8/8/8/8/8/1R4K1'), prompt: 'Setze <b>matt</b> mit den beiden Türmen!', ok: mate, success: 'Matt! Ein Turm sperrt die 7. Reihe, der andere gibt Schach.' },
      { type: 'move', fen: F('k7/8/1K6/8/8/8/8/7R'), prompt: 'Setze <b>matt</b> mit Turm und König!', ok: mate, success: 'Matt!' }
    ] },
    { id: 'matt2', title: 'Matt in zwei Zügen', desc: 'Erst vorbereiten, dann zuschlagen.', steps: [
      { type: 'intro', fen: F('7k/8/8/8/8/8/R7/1R4K1'),
        text: 'Manchmal braucht man einen <b>Vorbereitungszug</b>: Du ziehst, Schwarz antwortet – und dann setzt du matt. Frag dich zuerst: Welche Felder bleiben dem König? Wie kann ich sie wegnehmen?' },
      { type: 'seq', fen: F('7k/8/8/8/8/8/R7/1R4K1'), line: [mate2, mate], prompts: ['<b>Matt in zwei</b>: Sperr den König zuerst ein …', '… und jetzt <b>matt</b>!'],
        hint: 'Ein Turm auf der 7. Reihe nimmt dem König alle Felder dort.', success: 'Matt in zwei!' },
      { type: 'seq', fen: F('k7/8/2K5/8/8/8/8/7R'), line: [mate2, mate], prompts: ['<b>Matt in zwei</b> mit Turm und König.', 'Und jetzt <b>matt</b>!'],
        hint: 'Bring deinen König so, dass er dem schwarzen König gegenübersteht.', success: 'Matt in zwei!' },
      { type: 'seq', fen: F('r6k/6pp/7N/8/2Q5/8/8/6K1'), line: [mate2, mate], prompts: ['<b>Matt in zwei</b> – mit einem Damenopfer!', 'Jetzt kommt das erstickte Matt!'],
        hint: 'Opfere die Dame auf g8. Wer kann sie schlagen – und was ist dann mit g8?', success: 'Ersticktes Matt – das berühmte „Philidor-Matt“!' }
    ] }
  ]
},
{
  id: 'grundmatts', title: 'Die Grundmatts', desc: 'Mit zwei Türmen, mit der Dame und mit dem Turm gegen den König.',
  lessons: [
    { id: 'treppe', title: 'Treppenmatt mit zwei Türmen', desc: 'Reihe für Reihe an den Rand.', steps: [
      { type: 'intro', fen: F('6k1/R7/8/8/8/8/8/1R4K1'), marks: marks(rank(7), 'area'), arrows: [['b1', 'b8', 'g']],
        text: 'Mit zwei Türmen ist Mattsetzen leicht: Ein Turm sperrt eine Reihe ab, der andere gibt auf der nächsten Reihe Schach. Abwechselnd treiben sie den König Reihe für Reihe an den Rand – wie auf einer <b>Treppe</b>.' },
      { type: 'intro', fen: F('8/8/8/8/R2k4/8/7R/6K1', 'b'), arrows: [['a4', 'h4', 'b']],
        text: 'Kommt der König einem Turm zu nahe, zieh den Turm einfach weit weg auf die andere Seite des Bretts – auf derselben Reihe. Dann kann der König ihn nicht schlagen, und die Sperre bleibt.' },
      { type: 'endgame', fen: F('8/8/8/3k4/8/8/8/R5RK'), target: 8, prompt: 'Setze <b>matt</b>! Der Computer verteidigt sich.' },
      { type: 'endgame', fen: F('8/1k6/8/8/8/8/8/R3K2R'), target: 8, prompt: 'Noch einmal – diesmal steht der König oben.' }
    ] },
    { id: 'dame', title: 'Dame und König', desc: 'Den König einkasteln.', steps: [
      { type: 'intro', fen: F('8/8/8/2k5/8/8/8/4K2Q'),
        text: 'Die Dame schafft fast alles allein: Stell sie einen <b>Springerzug</b> vom König entfernt hin. Dann ist er in einem Kasten gefangen. Folge ihm mit der Dame – der Kasten wird kleiner, bis der König am Rand steht. Dann holst du deinen eigenen König dazu und setzt matt.' },
      { type: 'intro', fen: F('k7/2Q5/1K6/8/8/8/8/8', 'b'), marks: { a7: 'bad', b7: 'bad', b8: 'bad' },
        text: 'Die größte Gefahr ist das <b>Patt</b>: Lass dem König immer mindestens ein Feld, solange du nicht Schach gibst. Hier ist es passiert – unentschieden.' },
      { type: 'endgame', fen: F('8/8/8/3k4/8/8/8/Q3K3'), target: 12, prompt: 'Setze <b>matt</b> mit Dame und König!' },
      { type: 'endgame', fen: F('8/8/8/8/8/8/k7/4K2Q'), target: 12, prompt: 'Noch einmal – Vorsicht vor dem Patt!' }
    ] },
    { id: 'turm', title: 'Turm und König', desc: 'Das wichtigste Grundmatt.', steps: [
      { type: 'intro', fen: F('3k4/8/3K4/8/8/8/8/7R'), demo: ['h1h8'],
        text: 'So sieht das Ziel aus: Die Könige stehen sich gegenüber (<b>Opposition</b>), und der Turm gibt auf der Grundreihe Schach. Drück auf „Zeigen“.' },
      { type: 'intro', fen: F('8/8/8/4k3/8/8/8/R3K3'), marks: marks(file('b').concat(file('a')), 'area'),
        text: 'Der Plan:<br>1. Mit dem Turm den König <b>absperren</b> – er darf nicht über die Linie des Turms.<br>2. Den eigenen König <b>heranholen</b>.<br>3. Stehen sich die Könige gegenüber, gibt der Turm <b>Schach</b> und drängt den König eine Reihe zurück.<br>Wiederhole das, bis der König am Rand matt ist. Wartezüge mit dem Turm helfen, wenn die Könige noch nicht richtig stehen.' },
      { type: 'endgame', fen: F('6k1/8/8/8/8/8/8/R3K3'), target: 16, prompt: 'Der König steht schon am Rand. Setze <b>matt</b>!' },
      { type: 'endgame', fen: F('8/8/8/3k4/8/8/8/R3K3'), target: 25, prompt: 'Die Meisterprüfung: Setze aus der Mitte heraus <b>matt</b>!' }
    ] }
  ]
},
{
  id: 'taktik', title: 'Taktik', desc: 'Gabel, Fesselung, Spieß und Abzug: Material gewinnen mit Tricks.',
  lessons: [
    { id: 'gabel', title: 'Die Gabel', desc: 'Zwei Figuren auf einmal angreifen.', steps: [
      { type: 'intro', fen: F('q3k3/2N5/8/8/8/8/8/4K3', 'b'), arrows: [['c7', 'a8', 'r'], ['c7', 'e8', 'r']],
        text: 'Greift eine Figur zwei gegnerische Figuren gleichzeitig an, ist das eine <b>Gabel</b> (ein Doppelangriff). Der Gegner kann nur eine retten. Besonders stark: eine Gabel mit Schach – dann muss zuerst der König weg.' },
      { type: 'seq', fen: F('q3k3/8/8/1N6/8/8/8/4K3'), line: [['b5c7'], captureOf('q')],
        prompts: ['Gewinne die Dame mit einer <b>Springergabel</b>!', 'Der König musste weg. Jetzt schlag zu!'], success: 'Dame gewonnen!',
        wrong: 'Suche ein Feld, von dem aus der Springer König und Dame gleichzeitig angreift.' },
      { type: 'seq', fen: F('4r1k1/5p1p/8/8/4N3/8/5PPP/6K1'), line: [['e4f6'], captureOf('r')],
        prompts: ['Springergabel: Schach und Turm zugleich!', 'Hol dir den Turm!'], success: 'Turm gewonnen!',
        wrong: 'Von welchem Feld aus greift der Springer g8 und e8 an?' },
      { type: 'seq', fen: F('r5k1/6pp/8/8/8/8/5PPP/3Q2K1'), line: [['d1d5'], captureOf('r')],
        prompts: ['Auch die Dame kann gabeln: Greif <b>König und Turm</b> gleichzeitig an!', 'Und jetzt den Turm!'], success: 'Turm gewonnen!',
        wrong: 'Suche ein Feld, von dem aus die Dame schräg zum König und schräg zum Turm blickt.' },
      { type: 'seq', fen: F('k7/8/8/2n1r3/8/3P4/6PP/5R1K'), line: [['d3d4'], wins],
        prompts: ['Sogar ein Bauer kann gabeln. Greif zwei Figuren an!', 'Schwarz konnte nur eine retten. Schlag die andere!'], success: 'Figur gewonnen – mit einem Bauern!',
        wrong: 'Bauern schlagen schräg. Wohin muss der Bauer, damit er c5 und e5 angreift?' }
    ] },
    { id: 'fesselung', title: 'Die Fesselung', desc: 'Wer sich bewegt, verliert.', steps: [
      { type: 'intro', fen: F('4k3/8/2n5/1B6/8/8/8/4K3', 'b'), arrows: [['b5', 'e8', 'r']], marks: { c6: 'bad' },
        text: 'Steht hinter einer angegriffenen Figur eine wertvollere, ist sie <b>gefesselt</b>. Ist sie an den König gefesselt, darf sie gar nicht ziehen – sonst stünde der König im Schach. Hier kann der Springer sich nicht bewegen.' },
      { type: 'find', fen: F('4k3/8/1n6/4b3/8/8/8/4RK2', 'b'), prompt: 'Welche schwarze Figur ist <b>gefesselt</b>? Tippe sie an.',
        ok: p => pinned(p, 'b').map(C.sqName), wrong: () => 'Diese Figur darf frei ziehen.', success: 'Richtig – der Läufer steht zwischen Turm und König.' },
      { type: 'quiz', fen: F('3qk3/8/8/3n4/8/8/8/3RK3', 'b'), arrows: [['d1', 'd8', 'r']], prompt: 'Darf der Springer auf d5 ziehen?', options: ['Ja', 'Nein'],
        answer: p => C.legalMoves(p, { from: C.sq('d5') }).length ? 0 : 1,
        explain: 'Ja – er ist nur an die Dame gefesselt, nicht an den König. Zieht er weg, schlägt der Turm aber die Dame. Ziehen darf er, klug ist es nicht.' },
      { type: 'move', fen: F('r3k3/8/2n5/8/8/8/8/4KB2'), prompt: '<b>Fessle</b> den Springer an den König!', ok: pinsKnight, success: 'Gefesselt! Der Springer darf nicht mehr ziehen.' },
      { type: 'seq', fen: F('r3k3/pp6/2n5/1B6/3P4/8/8/4K3'), line: [['d4d5'], wins],
        prompts: ['Der Springer ist gefesselt. Greif ihn noch einmal an – mit der billigsten Figur!', 'Er kann nicht fliehen. Schlag ihn!'], success: 'Springer gewonnen!',
        wrong: 'Greif den gefesselten Springer mit einer Figur an, die weniger wert ist – mit dem Bauern.' }
    ] },
    { id: 'spiess', title: 'Der Spieß', desc: 'Die wertvolle Figur muss weg.', steps: [
      { type: 'intro', fen: F('1r6/8/8/4k3/8/6B1/8/6K1', 'b'), arrows: [['g3', 'b8', 'r']],
        text: 'Beim <b>Spieß</b> ist es umgekehrt wie bei der Fesselung: Die wertvollere Figur steht <b>vorn</b>. Sie muss ausweichen – und die Figur dahinter geht verloren.' },
      { type: 'seq', fen: F('1r6/8/8/4k3/8/8/8/4B1K1'), line: [['e1g3'], captureOf('r')],
        prompts: ['Spieße König und Turm auf!', 'Der König ist ausgewichen. Nimm den Turm!'], success: 'Turm gewonnen!',
        wrong: 'Gib so Schach, dass hinter dem König der Turm auf derselben Linie steht.' },
      { type: 'seq', fen: F('4R3/8/8/1k6/8/8/1q6/7K'), line: [['e8b8'], captureOf('q')],
        prompts: ['Spieß mit dem Turm: Gewinne die Dame!', 'Jetzt die Dame!'], success: 'Dame gewonnen!',
        wrong: 'König und Dame stehen auf derselben Linie. Gib von dort Schach!' },
      { type: 'quiz', fen: F('k7/8/2q5/8/8/5B2/8/6K1', 'b'), arrows: [['f3', 'a8', 'r']], prompt: 'Fesselung oder Spieß?', options: ['Fesselung', 'Spieß'], answer: 0,
        explain: 'Fesselung: Vorn steht die Dame, dahinter der König. Die Dame darf die Linie nicht verlassen.' },
      { type: 'quiz', fen: F('q7/8/2k5/8/8/5B2/8/6K1', 'b'), arrows: [['f3', 'a8', 'r']], prompt: 'Und hier?', options: ['Fesselung', 'Spieß'], answer: 1,
        explain: 'Spieß: Vorn steht der König im Schach und muss weg – dann ist die Dame dahinter verloren.' }
    ] },
    { id: 'abzug', title: 'Der Abzug', desc: 'Eine Figur zieht weg, die andere greift an.', steps: [
      { type: 'intro', fen: F('3q3k/7p/8/8/3N4/8/1B6/6K1'), arrows: [['b2', 'h8', 'r']], marks: { d4: 'sel' },
        text: 'Zieht eine Figur weg und gibt dabei die Linie für eine Figur dahinter frei, ist das ein <b>Abzug</b>. Hier steht der Springer vor dem Läufer. Zieht er weg, gibt der Läufer Schach – und der Springer kann dabei selbst etwas angreifen!' },
      { type: 'seq', fen: F('3q3k/7p/8/8/3N4/8/1B6/6K1'), line: [['d4e6', 'd4c6'], captureOf('q')],
        prompts: ['<b>Abzugsschach!</b> Zieh den Springer so weg, dass er die Dame angreift.', 'Schwarz musste das Schach abwehren. Hol dir die Dame!'], success: 'Dame gewonnen!',
        wrong: 'Das ist zwar Abzugsschach – aber der Springer greift dabei nichts an. Wo würde er die Dame angreifen?' },
      { type: 'seq', fen: F('r5k1/4qppp/8/8/4B3/8/5PPP/4R1K1'), line: [['e4h7'], captureOf('q')],
        prompts: ['Der Läufer steht vor deinem Turm. Zieh ihn <b>mit Schach</b> weg – dann ist die Dame fällig!', 'Jetzt schlägt der Turm die Dame!'], success: 'Dame gewonnen – für einen Läufer!',
        wrong: 'Ohne Schach kann die Dame einfach den Turm schlagen. Der Läufer muss Schach geben!' }
    ] }
  ]
}
];

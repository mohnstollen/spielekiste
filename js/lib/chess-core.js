// Schach-Regelkern: Stellungen (FEN), Zuggenerator, Schach/Matt/Patt, Notation, Erklärungen für unerlaubte Züge.
// Felder: 0 = a8 … 7 = h8, 56 = a1 … 63 = h1 (Reihenfolge wie in der FEN). Figuren als FEN-Buchstaben, Weiß groß.
// Stellungen ohne König sind erlaubt (für Übungen mit einzelnen Figuren) – dann gibt es kein Schach.

export const FILES = 'abcdefgh';
export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const NAME = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };
export const LETTER = { n: 'S', b: 'L', r: 'T', q: 'D', k: 'K' };   // deutsche Kurzschreibweise

export const sq = n => (8 - +n[1]) * 8 + FILES.indexOf(n[0]);
export const sqName = i => FILES[i & 7] + (8 - (i >> 3));
export const fileOf = i => i & 7;
export const rankOf = i => 7 - (i >> 3);           // 0 = erste Reihe
export const isLight = i => (fileOf(i) + rankOf(i)) % 2 === 1;
export const colorOf = p => p ? (p === p.toUpperCase() ? 'w' : 'b') : null;
export const typeOf = p => p ? p.toLowerCase() : null;
export const other = c => c === 'w' ? 'b' : 'w';
export const pieceOf = (color, type) => color === 'w' ? type.toUpperCase() : type;

const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const RO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BI = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const DIRS = { n: KN, k: KG, r: RO, b: BI, q: KG };
const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

/* ---------------- FEN ---------------- */
export function parseFEN(fen) {
  const [place, turn = 'w', castle = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
  const b = new Array(64).fill(null);
  let i = 0;
  for (const ch of place) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') i += +ch; else b[i++] = ch;
  }
  return { b, turn, castle: castle === '-' ? '' : castle, ep: ep === '-' ? -1 : sq(ep), half: +half, full: +full };
}

export function toFEN(p) {
  let s = '';
  for (let r = 0; r < 8; r++) {
    let e = 0;
    for (let c = 0; c < 8; c++) {
      const x = p.b[r * 8 + c];
      if (!x) e++; else { if (e) s += e; e = 0; s += x; }
    }
    if (e) s += e;
    if (r < 7) s += '/';
  }
  return `${s} ${p.turn} ${p.castle || '-'} ${p.ep < 0 ? '-' : sqName(p.ep)} ${p.half} ${p.full}`;
}

export const clone = p => ({ ...p, b: p.b.slice() });
export const kingSq = (p, color) => p.b.indexOf(pieceOf(color, 'k'));

/* ---------------- Angriffe ---------------- */
// Alle Felder, von denen aus Figuren der Farbe `by` das Feld i angreifen
export function attackers(p, i, by, first = false) {
  const out = [], r0 = i >> 3, c0 = i & 7, b = p.b;
  const hit = (j, types) => { const x = b[j]; return x && colorOf(x) === by && types.includes(typeOf(x)); };
  const pr = by === 'w' ? r0 + 1 : r0 - 1;          // Reihe, auf der ein angreifender Bauer stünde
  for (const dc of [-1, 1]) if (on(pr, c0 + dc) && hit(pr * 8 + c0 + dc, 'p')) { out.push(pr * 8 + c0 + dc); if (first) return out; }
  for (const [dr, dc] of KN) { const r = r0 + dr, c = c0 + dc; if (on(r, c) && hit(r * 8 + c, 'n')) { out.push(r * 8 + c); if (first) return out; } }
  for (const [dr, dc] of KG) { const r = r0 + dr, c = c0 + dc; if (on(r, c) && hit(r * 8 + c, 'k')) { out.push(r * 8 + c); if (first) return out; } }
  for (const [dirs, types] of [[RO, 'rq'], [BI, 'bq']]) {
    for (const [dr, dc] of dirs) {
      let r = r0 + dr, c = c0 + dc;
      while (on(r, c)) {
        const j = r * 8 + c;
        if (b[j]) { if (hit(j, types)) { out.push(j); if (first) return out; } break; }
        r += dr; c += dc;
      }
    }
  }
  return out;
}
export const attacked = (p, i, by) => attackers(p, i, by, true).length > 0;
export function inCheck(p, color = p.turn) {
  const k = kingSq(p, color);
  return k >= 0 && attacked(p, k, other(color));
}
// Felder, die eine Figur auf i angreift (bzw. deckt) – unabhängig davon, wer am Zug ist
export function attacksFrom(p, i) {
  const x = p.b[i], out = [];
  if (!x) return out;
  const t = typeOf(x), r0 = i >> 3, c0 = i & 7;
  if (t === 'p') {
    const r = colorOf(x) === 'w' ? r0 - 1 : r0 + 1;
    for (const dc of [-1, 1]) if (on(r, c0 + dc)) out.push(r * 8 + c0 + dc);
    return out;
  }
  const slide = 'rbq'.includes(t);
  for (const [dr, dc] of DIRS[t]) {
    let r = r0 + dr, c = c0 + dc;
    while (on(r, c)) {
      out.push(r * 8 + c);
      if (!slide || p.b[r * 8 + c]) break;
      r += dr; c += dc;
    }
  }
  return out;
}

/* ---------------- Zuggenerator ---------------- */
// Optionen: from (nur Züge dieser Figur), castling, ep, promo (false = Bauer bleibt Bauer, z. B. im Bauernspiel)
export function pseudoMoves(p, { from = null, castling = true, ep = true, promo = true } = {}) {
  const out = [], me = p.turn, b = p.b;
  const add = (f, t, flag = '') => {
    const piece = b[f], captured = flag === 'ep' ? pieceOf(other(me), 'p') : b[t];
    if (typeOf(piece) === 'p' && (t >> 3 === 0 || t >> 3 === 7) && promo) {
      for (const q of 'qrbn') out.push({ from: f, to: t, piece, captured, promo: q, flag });
    } else out.push({ from: f, to: t, piece, captured, promo: null, flag });
  };
  for (let i = 0; i < 64; i++) {
    const x = b[i];
    if (!x || colorOf(x) !== me || (from !== null && i !== from)) continue;
    const t = typeOf(x), r0 = i >> 3, c0 = i & 7;
    if (t === 'p') {
      const d = me === 'w' ? -1 : 1, startRow = me === 'w' ? 6 : 1, r = r0 + d;
      if (on(r, c0) && !b[r * 8 + c0]) {
        add(i, r * 8 + c0);
        if (r0 === startRow && !b[(r + d) * 8 + c0]) add(i, (r + d) * 8 + c0, 'double');
      }
      for (const dc of [-1, 1]) {
        if (!on(r, c0 + dc)) continue;
        const j = r * 8 + c0 + dc;
        if (b[j] && colorOf(b[j]) !== me) add(i, j);
        else if (ep && j === p.ep && !b[j]) add(i, j, 'ep');
      }
      continue;
    }
    const slide = 'rbq'.includes(t);
    for (const [dr, dc] of DIRS[t]) {
      let r = r0 + dr, c = c0 + dc;
      while (on(r, c)) {
        const j = r * 8 + c;
        if (b[j]) { if (colorOf(b[j]) !== me) add(i, j); break; }
        add(i, j);
        if (!slide) break;
        r += dr; c += dc;
      }
    }
    if (t === 'k' && castling) {
      const home = me === 'w' ? 60 : 4, opp = other(me);
      if (i === home && !attacked(p, home, opp)) {
        const [K, Q, R] = me === 'w' ? ['K', 'Q', 'R'] : ['k', 'q', 'r'];
        if (p.castle.includes(K) && b[home + 3] === R && !b[home + 1] && !b[home + 2] &&
            !attacked(p, home + 1, opp) && !attacked(p, home + 2, opp)) add(i, home + 2, 'k');
        if (p.castle.includes(Q) && b[home - 4] === R && !b[home - 1] && !b[home - 2] && !b[home - 3] &&
            !attacked(p, home - 1, opp) && !attacked(p, home - 2, opp)) add(i, home - 2, 'q');
      }
    }
  }
  return out;
}

export function makeMove(p, m) {
  const n = clone(p), b = n.b, me = p.turn;
  b[m.to] = m.promo ? pieceOf(me, m.promo) : b[m.from];
  b[m.from] = null;
  if (m.flag === 'ep') b[(m.from & ~7) + (m.to & 7)] = null;
  if (m.flag === 'k') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
  if (m.flag === 'q') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }
  let c = n.castle;
  const drop = s => { c = c.replace(s, ''); };
  if (m.piece === 'K') { drop('K'); drop('Q'); }
  if (m.piece === 'k') { drop('k'); drop('q'); }
  for (const s of [m.from, m.to]) { if (s === 63) drop('K'); if (s === 56) drop('Q'); if (s === 7) drop('k'); if (s === 0) drop('q'); }
  n.castle = c;
  n.ep = m.flag === 'double' ? (m.from + m.to) >> 1 : -1;
  n.half = typeOf(m.piece) === 'p' || m.captured ? 0 : p.half + 1;
  if (me === 'b') n.full = p.full + 1;
  n.turn = other(me);
  return n;
}

// Erlaubte Züge. Ohne eigenen König auf dem Brett zählt jeder Zug (Übungen mit einzelnen Figuren).
export function legalMoves(p, opts = {}) {
  const me = p.turn, hasKing = kingSq(p, me) >= 0;
  return pseudoMoves(p, opts).filter(m => !hasKing || !inCheck(makeMove(p, m), me));
}

export function findMove(p, from, to, promo = null, opts = {}) {
  const ms = legalMoves(p, { ...opts, from }).filter(m => m.to === to);
  return ms.find(m => m.promo === (promo || 'q')) || ms.find(m => !m.promo) || ms[0] || null;
}

// UCI-artige Schreibweise "e2e4", "e7e8q"
export const uci = m => sqName(m.from) + sqName(m.to) + (m.promo || '');
export function parseUci(p, s, opts = {}) {
  return findMove(p, sq(s.slice(0, 2)), sq(s.slice(2, 4)), s[4] || null, opts);
}

/* ---------------- Spielstand ---------------- */
export function insufficient(p) {
  const rest = [];
  for (let i = 0; i < 64; i++) { const x = p.b[i]; if (x && typeOf(x) !== 'k') rest.push([typeOf(x), i]); }
  if (rest.some(([t]) => 'prq'.includes(t))) return false;
  if (rest.length <= 1) return true;
  return rest.every(([t]) => t === 'b') && new Set(rest.map(([, i]) => isLight(i))).size === 1;
}

// 'mate' | 'stalemate' | 'insufficient' | 'fifty' | null
export function status(p, opts = {}) {
  if (!legalMoves(p, opts).length) return inCheck(p) ? 'mate' : 'stalemate';
  if (kingSq(p, 'w') >= 0 && kingSq(p, 'b') >= 0 && insufficient(p)) return 'insufficient';
  if (p.half >= 100) return 'fifty';
  return null;
}

/* ---------------- Notation (deutsch: K D T L S) ---------------- */
export function san(p, m) {
  let s;
  if (m.flag === 'k') s = '0-0';
  else if (m.flag === 'q') s = '0-0-0';
  else {
    const t = typeOf(m.piece), cap = m.captured ? 'x' : '';
    if (t === 'p') s = (cap ? FILES[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? LETTER[m.promo] : '');
    else {
      const twins = legalMoves(p).filter(o => o.to === m.to && o.piece === m.piece && o.from !== m.from);
      let dis = '';
      if (twins.length) {
        const sameFile = twins.some(o => (o.from & 7) === (m.from & 7)), sameRank = twins.some(o => (o.from >> 3) === (m.from >> 3));
        dis = !sameFile ? FILES[m.from & 7] : !sameRank ? String(8 - (m.from >> 3)) : sqName(m.from);
      }
      s = LETTER[t] + dis + cap + sqName(m.to);
    }
  }
  const n = makeMove(p, m);
  if (inCheck(n)) s += legalMoves(n).length ? '+' : '#';
  return s;
}

/* ---------------- Erklärungen ---------------- */
const between = (a, b) => {          // Felder zwischen a und b auf einer Linie (sonst null)
  const dr = Math.sign((b >> 3) - (a >> 3)), dc = Math.sign((b & 7) - (a & 7));
  const lr = Math.abs((b >> 3) - (a >> 3)), lc = Math.abs((b & 7) - (a & 7));
  if (!(lr === 0 || lc === 0 || lr === lc)) return null;
  const out = [];
  for (let r = (a >> 3) + dr, c = (a & 7) + dc; r * 8 + c !== b; r += dr, c += dc) out.push(r * 8 + c);
  return out;
};
export { between };

// Warum ist der Zug from→to nicht erlaubt? Liefert einen kurzen deutschen Satz oder null, wenn er erlaubt ist.
export function explainIllegal(p, from, to, opts = {}) {
  const x = p.b[from];
  if (!x) return 'Auf diesem Feld steht keine Figur.';
  if (colorOf(x) !== p.turn) return 'Das ist keine eigene Figur.';
  if (from === to) return null;
  if (legalMoves(p, { ...opts, from }).some(m => m.to === to)) return null;
  const t = typeOf(x), me = p.turn, target = p.b[to];
  const dr = (to >> 3) - (from >> 3), dc = (to & 7) - (from & 7), adr = Math.abs(dr), adc = Math.abs(dc);
  const pseudo = pseudoMoves(p, { ...opts, from }).some(m => m.to === to);
  if (pseudo) {
    if (inCheck(p)) return t === 'k' ? 'Dort stünde dein König immer noch im Schach.' : 'Du stehst im Schach! Dieser Zug wehrt das Schach nicht ab.';
    if (t === 'k') return 'Der König darf nicht auf ein Feld ziehen, das der Gegner angreift.';
    return `Dein ${NAME[t]} ist gefesselt: Zieht er weg, steht dein König im Schach.`;
  }
  if (target && colorOf(target) === me) return 'Dort steht schon eine eigene Figur.';
  if (t === 'k' && dr === 0 && adc === 2 && (from === 60 || from === 4)) {
    const short = dc > 0, R = me === 'w' ? (short ? 'K' : 'Q') : (short ? 'k' : 'q');
    const path = short ? [from + 1, from + 2] : [from - 1, from - 2, from - 3];
    if (opts.castling === false) return 'Die Rochade gibt es in dieser Übung nicht.';
    if (!p.castle.includes(R)) return 'Rochieren geht hier nicht mehr: König oder Turm haben schon gezogen.';
    if (path.some(s => p.b[s])) return 'Für die Rochade müssen alle Felder zwischen König und Turm frei sein.';
    if (inCheck(p)) return 'Im Schach darf man nicht rochieren.';
    if (attacked(p, path[0], other(me))) return 'Der König darf bei der Rochade nicht über ein angegriffenes Feld ziehen.';
    return 'Der König darf nicht ins Schach rochieren.';
  }
  const lineBlocked = () => (between(from, to) || []).some(s => p.b[s]);
  switch (t) {
    case 'r': return (dr === 0 || dc === 0) ? (lineBlocked() ? 'Der Weg ist versperrt – der Turm kann nicht über Figuren springen.' : null)
      : 'Der Turm zieht nur gerade: waagerecht oder senkrecht.';
    case 'b': return adr === adc ? (lineBlocked() ? 'Der Weg ist versperrt – der Läufer kann nicht über Figuren springen.' : null)
      : 'Der Läufer zieht nur schräg, also diagonal.';
    case 'q': return (dr === 0 || dc === 0 || adr === adc) ? (lineBlocked() ? 'Der Weg ist versperrt – auch die Dame kann nicht über Figuren springen.' : null)
      : 'Die Dame zieht gerade oder schräg – aber immer in einer geraden Linie.';
    case 'n': return 'Der Springer zieht wie ein L: zwei Felder in eine Richtung und dann eins zur Seite.';
    case 'k': return 'Der König zieht immer nur ein Feld weit.';
    case 'p': {
      const fwd = me === 'w' ? -dr : dr;
      if (fwd <= 0) return 'Bauern ziehen nur vorwärts – nie zurück und nie zur Seite.';
      if (adc === 1 && fwd === 1) {
        if (!target) return opts.ep === false || p.ep < 0 ? 'Schräg zieht der Bauer nur, wenn er dort eine gegnerische Figur schlägt.'
          : 'Schräg zieht der Bauer nur, wenn er dort schlägt (en passant geht nur direkt nach dem Doppelschritt).';
        return null;
      }
      if (adc === 0 && fwd === 1 && target) return 'Geradeaus kann der Bauer nicht schlagen – das Feld vor ihm ist besetzt.';
      if (adc === 0 && fwd === 2) {
        const startRow = me === 'w' ? 6 : 1;
        if ((from >> 3) !== startRow) return 'Zwei Felder auf einmal darf ein Bauer nur bei seinem allerersten Zug ziehen.';
        return 'Der Weg ist versperrt – ein Bauer kann nicht über Figuren springen.';
      }
      return 'Der Bauer zieht ein Feld geradeaus (beim ersten Zug auch zwei) und schlägt schräg nach vorn.';
    }
  }
  return 'Dieser Zug ist nicht erlaubt.';
}

/* ---------------- Test-Hilfe ---------------- */
export function perft(p, depth) {
  if (depth === 0) return 1;
  const ms = legalMoves(p);
  if (depth === 1) return ms.length;
  let n = 0;
  for (const m of ms) n += perft(makeMove(p, m), depth - 1);
  return n;
}

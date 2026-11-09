// Sudoku-Kern: Löser, logische Bewertung, Generator
const ROW = [], COL = [], BOX = [];
for (let i = 0; i < 81; i++) { ROW[i] = Math.floor(i / 9); COL[i] = i % 9; BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3); }
const UNITS = [];
for (let k = 0; k < 9; k++) {
  UNITS.push([...Array(81).keys()].filter(i => ROW[i] === k));
  UNITS.push([...Array(81).keys()].filter(i => COL[i] === k));
  UNITS.push([...Array(81).keys()].filter(i => BOX[i] === k));
}
const ALL = 0x3FE; // Bits 1..9
function popcnt(m) { let n = 0; while (m) { m &= m - 1; n++; } return n; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Backtracking-Löser: zählt Lösungen bis limit, merkt sich die erste
export function solve(g0, limit = 2, randomize = false) {
  const g = g0.slice();
  const R = new Array(9).fill(0), C = new Array(9).fill(0), B = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) if (g[i]) {
    const v = 1 << g[i];
    if ((R[ROW[i]] | C[COL[i]] | B[BOX[i]]) & v) return { count: 0, solution: null };
    R[ROW[i]] |= v; C[COL[i]] |= v; B[BOX[i]] |= v;
  }
  let count = 0, solution = null;
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  function rec() {
    let best = -1, bestMask = 0, bestCnt = 10;
    for (let i = 0; i < 81; i++) if (!g[i]) {
      const m = ~(R[ROW[i]] | C[COL[i]] | B[BOX[i]]) & ALL;
      const n = popcnt(m);
      if (n < bestCnt) { best = i; bestMask = m; bestCnt = n; if (n <= 1) break; }
    }
    if (best < 0) { count++; if (!solution) solution = g.slice(); return count >= limit; }
    if (bestCnt === 0) return false;
    const order = randomize ? shuffle(digits.slice()) : digits;
    for (const d of order) {
      const v = 1 << d;
      if (!(bestMask & v)) continue;
      g[best] = d; R[ROW[best]] |= v; C[COL[best]] |= v; B[BOX[best]] |= v;
      if (rec()) return true;
      g[best] = 0; R[ROW[best]] &= ~v; C[COL[best]] &= ~v; B[BOX[best]] &= ~v;
    }
    return false;
  }
  rec();
  return { count, solution };
}

function candidates(g, i) {
  let used = 0;
  for (let k = 0; k < 81; k++) if (g[k] && (ROW[k] === ROW[i] || COL[k] === COL[i] || BOX[k] === BOX[i])) used |= 1 << g[k];
  return ~used & ALL;
}

// Logischer Löser – Stufe 1: Nackte Einer · 2: + Versteckte Einer
// 3: + Block-/Linien-Interaktion, Paare · 4: + Tripel, X-Wing
const PEERS=[];for(let i=0;i<81;i++){PEERS[i]=[];for(let k=0;k<81;k++)if(k!==i&&(ROW[k]===ROW[i]||COL[k]===COL[i]||BOX[k]===BOX[i]))PEERS[i].push(k);}
function combos(arr,n,start=0,cur=[],out=[]){if(cur.length===n){out.push(cur.slice());return out;}for(let i=start;i<arr.length;i++){cur.push(arr[i]);combos(arr,n,i+1,cur,out);cur.pop();}return out;}
export function logicSolve(g0, level){
  const g=g0.slice(), cand=new Array(81).fill(0);
  for(let i=0;i<81;i++) if(!g[i]) cand[i]=candidates(g,i);
  const place=(i,d)=>{g[i]=d;cand[i]=0;for(const p of PEERS[i])cand[p]&=~(1<<d);};
  const elim=(i,m)=>{if(cand[i]&m){cand[i]&=~m;return true;}return false;};
  for(;;){
    let empty=0;
    for(let i=0;i<81;i++) if(!g[i]){ if(!cand[i]) return false; empty++; }
    if(!empty) return true;
    let i1=-1; for(let i=0;i<81;i++) if(!g[i]&&popcnt(cand[i])===1){i1=i;break;}
    if(i1>=0){place(i1,Math.log2(cand[i1]));continue;}
    if(level<2) return false;
    let done=false;
    for(const u of UNITS){for(let d=1;d<=9&&!done;d++){let w=-1,n=0;for(const i of u)if(!g[i]&&(cand[i]&(1<<d))){w=i;n++;}if(n===1){place(w,d);done=true;}}if(done)break;}
    if(done) continue;
    if(level<3) return false;
    let ch=false;
    // Block-/Linien-Interaktion
    for(let d=1;d<=9;d++){const b=1<<d;
      for(const u of UNITS){const cells=u.filter(i=>cand[i]&b);if(cells.length<2)continue;
        const sameBox=cells.every(i=>BOX[i]===BOX[cells[0]]),sameRow=cells.every(i=>ROW[i]===ROW[cells[0]]),sameCol=cells.every(i=>COL[i]===COL[cells[0]]);
        if(sameBox) for(let i=0;i<81;i++) if(BOX[i]===BOX[cells[0]]&&!u.includes(i)) ch=elim(i,b)||ch;
        if(sameRow) for(let i=0;i<81;i++) if(ROW[i]===ROW[cells[0]]&&!u.includes(i)) ch=elim(i,b)||ch;
        if(sameCol) for(let i=0;i<81;i++) if(COL[i]===COL[cells[0]]&&!u.includes(i)) ch=elim(i,b)||ch;
      }}
    if(ch) continue;
    // nackte und versteckte Paare (Stufe 3), Tripel (Stufe 4)
    const maxN = level>=4?3:2;
    for(let n=2;n<=maxN&&!ch;n++) for(const u of UNITS){
      const em=u.filter(i=>!g[i]); if(em.length<=n) continue;
      for(const c of combos(em,n)){let m=0;for(const i of c)m|=cand[i];
        if(popcnt(m)===n) for(const i of em) if(!c.includes(i)) ch=elim(i,m)||ch;}
      const ds=[];for(let d=1;d<=9;d++)if(em.some(i=>cand[i]&(1<<d)))ds.push(d);
      for(const c of combos(ds,n)){let m=0;for(const d of c)m|=1<<d;
        const cells=em.filter(i=>cand[i]&m);
        if(cells.length===n) for(const i of cells) ch=elim(i,~m&ALL)||ch;}
    }
    if(ch) continue;
    if(level<4) return false;
    // X-Wing
    for(let d=1;d<=9&&!ch;d++){const b=1<<d;
      for(const [A,Bk] of [[ROW,COL],[COL,ROW]]){
        const pos=[];for(let r=0;r<9;r++){const cs=[];for(let i=0;i<81;i++)if(A[i]===r&&(cand[i]&b))cs.push(Bk[i]);pos.push(cs);}
        for(let r1=0;r1<9;r1++)if(pos[r1].length===2)for(let r2=r1+1;r2<9;r2++)
          if(pos[r2].length===2&&pos[r2][0]===pos[r1][0]&&pos[r2][1]===pos[r1][1])
            for(let i=0;i<81;i++) if(A[i]!==r1&&A[i]!==r2&&pos[r1].includes(Bk[i])) ch=elim(i,b)||ch;
      }}
    if(ch) continue;
    return false;
  }
}

// target = Zielanzahl Vorgaben (0 = so wenige wie möglich)
// logic = beim Entfernen muss es mit dieser Stufe lösbar bleiben
// notBy = darf mit dieser Stufe NICHT lösbar sein (sonst zu leicht)
// maxBy = muss mit dieser Stufe lösbar sein (sonst zu schwer)
export const DIFFS = {
  leicht:  { label: 'Leicht',      target: 40, logic: 1, notBy: 0, maxBy: 0 },
  mittel:  { label: 'Mittel',      target: 32, logic: 2, notBy: 1, maxBy: 0 },
  schwer:  { label: 'Schwer',      target: 28, logic: 3, notBy: 2, maxBy: 0 },
  experte: { label: 'Sehr schwer', target: 0,  logic: 0, notBy: 2, maxBy: 4 },
  extrem:  { label: 'Extrem',      target: 0,  logic: 0, notBy: 4, maxBy: 0 },
};

export function generate(diffKey) {
  const cfg = DIFFS[diffKey];
  let fallback = null;
  for (let attempt = 0; attempt < 120; attempt++) {
    const sol = solve(new Array(81).fill(0), 1, true).solution;
    const puz = sol.slice();
    let clues = 81;
    const order = shuffle([...Array(41).keys()]); // Paare i / 80-i → symmetrisches Bild
    for (const i of order) {
      if (clues <= cfg.target) break;
      const j = 80 - i, a = puz[i], b = puz[j];
      puz[i] = 0; puz[j] = 0;
      let ok = solve(puz, 2).count === 1;
      if (ok && cfg.logic) ok = logicSolve(puz, cfg.logic);
      if (ok) clues -= (i === j ? 1 : 2); else { puz[i] = a; puz[j] = b; }
    }
    const result = { puzzle: puz, solution: sol, clues };
    if (!fallback) fallback = result;
    if (cfg.notBy && logicSolve(puz, cfg.notBy)) continue; // zu leicht
    if (cfg.maxBy && !logicSolve(puz, cfg.maxBy)) continue; // zu schwer
    return result;
  }
  return fallback;
}

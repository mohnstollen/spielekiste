// Verbindung zur Schach-KI im Hintergrund (chess-worker.js). Kann der Browser keinen Modul-Worker starten,
// wird direkt gerechnet (dann kann die Oberfläche kurz stocken).
import * as C from './chess-core.js';
import * as A from './chess-ai.js';

let worker = null, seq = 0;
const pending = new Map();

function local(msg) {
  const p = C.parseFEN(msg.fen);
  if (msg.cmd === 'best') { const m = A.bestMoveTimed(p, msg.depth, msg.ms, msg.noise || 0); return { uci: m && C.uci(m) }; }
  return { result: A.analyzeMove(p, msg.played, msg.ms) };
}
function getWorker() {
  if (worker === false) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./chess-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = e => { const r = pending.get(e.data.id); if (r) { pending.delete(e.data.id); r(e.data); } };
      worker.onerror = () => { worker = false; const all = [...pending.values()]; pending.clear(); all.forEach(r => r({ error: 'worker' })); };
    } catch (e) { worker = false; }
  }
  return worker || null;
}
function call(msg) {
  const w = getWorker();
  const viaLocal = () => new Promise(res => setTimeout(() => res(local(msg)), 30));
  if (!w) return viaLocal();
  return new Promise(res => {
    const id = ++seq;
    pending.set(id, d => res(d.error ? local(msg) : d));
    w.postMessage({ ...msg, id });
  });
}

// Zug des Computers als UCI-Text
export const engineMove = (fen, depth, ms, noise = 0) => call({ cmd: 'best', fen, depth, ms, noise }).then(r => r.uci);
// Coach-Analyse eines gespielten Zugs (siehe analyzeMove in chess-ai.js)
export const analyze = (fen, played, ms = 1200) => call({ cmd: 'analyze', fen, played, ms }).then(r => r.result);

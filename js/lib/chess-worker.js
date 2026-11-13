// Rechnet die Schach-KI im Hintergrund, damit die Oberfläche flüssig bleibt.
// Nachrichten: {id, cmd: 'best', fen, depth, ms, noise} → {id, uci}
//              {id, cmd: 'analyze', fen, played, ms}    → {id, result}
import * as C from './chess-core.js';
import * as A from './chess-ai.js';

self.onmessage = e => {
  const { id, cmd, fen } = e.data, p = C.parseFEN(fen);
  try {
    if (cmd === 'best') {
      const m = A.bestMoveTimed(p, e.data.depth, e.data.ms, e.data.noise || 0);
      self.postMessage({ id, uci: m && C.uci(m) });
    } else if (cmd === 'analyze') {
      self.postMessage({ id, result: A.analyzeMove(p, e.data.played, e.data.ms) });
    }
  } catch (err) { self.postMessage({ id, error: String(err) }); }
};

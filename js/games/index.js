// Spieleverzeichnis. Neue Spiele hier importieren und eintragen (und in sw.js zur Dateiliste).
// Jedes Spiel liefert: id, name, icon, desc, help, variants, metric, abandon(state), start(el, ctx)
// Optional: daily = { variant(tag), label(tag) } für das Rätsel des Tages
//           variantInfo(variante, profilId) → Text unter der Variante (statt Bestwert)
//           variantsTitle → Überschrift über den Varianten (statt „Neues Spiel“)
import sudoku from './sudoku.js';
import minesweeper from './minesweeper.js';
import g2048 from './g2048.js';
import solitaire from './solitaire.js';
import freecell from './freecell.js';
import connect4 from './connect4.js';
import reversi from './reversi.js';
import snake from './snake.js';
import memory from './memory.js';
import schachschule from './chess-school.js';

export default [sudoku, minesweeper, g2048, solitaire, freecell, connect4, reversi, snake, memory, schachschule];

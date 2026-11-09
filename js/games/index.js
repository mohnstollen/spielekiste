// Spieleverzeichnis. Neue Spiele hier importieren und eintragen (und in sw.js zur Dateiliste).
// Jedes Spiel liefert: id, name, icon, desc, help, variants, metric, abandon(state), start(el, ctx)
// Optional: daily = { variant(tag), label(tag) } für das Rätsel des Tages
import sudoku from './sudoku.js';
import minesweeper from './minesweeper.js';
import g2048 from './g2048.js';
import solitaire from './solitaire.js';
import freecell from './freecell.js';
import connect4 from './connect4.js';
import reversi from './reversi.js';
import snake from './snake.js';
import memory from './memory.js';

export default [sudoku, minesweeper, g2048, solitaire, freecell, connect4, reversi, snake, memory];

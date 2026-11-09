// Spieleverzeichnis. Neue Spiele hier importieren und eintragen.
// Jedes Spiel liefert: id, name, icon, desc, help, variants, metric, abandon(state), start(el, ctx)
import sudoku from './sudoku.js';
import minesweeper from './minesweeper.js';
import g2048 from './g2048.js';
import solitaire from './solitaire.js';
import connect4 from './connect4.js';
import snake from './snake.js';

export default [sudoku, minesweeper, g2048, solitaire, connect4, snake];

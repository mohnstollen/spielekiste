// Service Worker: legt alle Dateien beim Installieren in den Cache und liefert sie offline aus.
// Nach Änderungen an der App VERSION hochzählen, damit Geräte die neue Fassung laden.
const VERSION = 'spielekiste-1.5.0';
const FILES = [
  './', 'index.html', 'druck.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/storage.js', 'js/lib/util.js', 'js/lib/sudoku-core.js', 'js/lib/cards.js',
  'js/games/index.js', 'js/games/sudoku.js', 'js/games/minesweeper.js', 'js/games/g2048.js',
  'js/games/solitaire.js', 'js/games/freecell.js', 'js/games/connect4.js', 'js/games/reversi.js',
  'js/games/snake.js', 'js/games/memory.js', 'js/games/chess-school.js',
  'js/lib/chess-core.js', 'js/lib/chess-board.js', 'js/lib/chess-lessons.js', 'js/lib/chess-ai.js',
  'js/lib/chess-engine.js', 'js/lib/chess-worker.js', 'js/lib/chess-puzzles.js', 'js/games/chess-play.js', 'js/games/chess-puzzles.js',
  'js/games/quiz.js', 'js/lib/quiz-questions.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});

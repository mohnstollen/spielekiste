# Spielekiste – Offline-Spiele als PWA

Neun Spiele mit Spielständen, Profilen, Statistik und Bestenlisten:
Sudoku (5 Stufen) · Minesweeper · 2048 · Solitär (Klondike) · FreeCell · Vier gewinnt · Reversi · Snake · Memory.

**Rätsel des Tages:** Sudoku, Minesweeper und FreeCell liefern jeden Tag dasselbe Rätsel auf allen Geräten
(Zufall aus dem Datum). Mit Tagesserie und „Ergebnis teilen“ zum Vergleichen – ganz ohne Server.

Dazu `druck.html`: das Sudoku-Druckstudio (vier Sudokus pro A4-Seite, Schwierigkeit je Rätsel wählbar, optional Lösungsseite).

Reines HTML/CSS/JavaScript, ohne Build-Schritt und ohne externe Abhängigkeiten.
Nach dem ersten Aufruf läuft alles komplett offline.

## Installieren

Eine PWA braucht einen Webserver. Als Datei per Doppelklick geöffnet funktioniert sie **nicht** (ES-Module und Service Worker).

**Schnell testen am PC:**

```bash
cd spielekiste
python3 -m http.server 8080
# Browser: http://localhost:8080
```

**Aufs Handy (Homeserver):** Den Ordner von einem beliebigen Webserver ausliefern lassen,
z. B. nginx, Caddy oder ein kleiner Docker-Container:

```bash
docker run -d --name spielekiste -p 8088:80 -v /pfad/zu/spielekiste:/usr/share/nginx/html:ro nginx:alpine
```

Damit Android die App installieren kann, ist **HTTPS** nötig (Ausnahme: `localhost`).
Hinter deinem Reverse Proxy mit Zertifikat läuft das sofort. Läuft das Ganze in einem Unterordner,
z. B. `https://server/spiele/`, geht das auch, weil alle Pfade relativ sind.

Danach in Chrome auf Android: Menü ⋮ → **„App installieren“** bzw. „Zum Startbildschirm hinzufügen“.

## Daten

- Gespeichert wird lokal im Browser (IndexedDB): Profile, laufende Spiele, Statistiken, Bestenlisten (Top 20 je Spiel und Stufe).
- Unter **Profile & Einstellungen** gibt es Sicherung herunterladen/einspielen (JSON).
- Die App bittet den Browser um dauerhaften Speicher. Als installierte App wird das meist gewährt.

## Updates

Nach Änderungen an Dateien in `sw.js` die Konstante `VERSION` hochzählen.
Dann lädt das Handy beim nächsten Start die neue Fassung (ggf. App einmal schließen und neu öffnen).

## Aufbau

```
index.html, manifest.webmanifest, sw.js
css/style.css
js/app.js            Menü, Navigation, Profile, Bestenlisten, Statistik, Einstellungen
js/storage.js        Speicher (IndexedDB, Rückfall localStorage)
js/lib/util.js       Stoppuhr, Wischgesten, Hilfsfunktionen
js/lib/sudoku-core.js  Sudoku-Generator und Löser (gleicher Kern wie im Druckstudio)
js/lib/cards.js      Kartendarstellung, Ziehen/Antippen, FreeCell-Spielnummern
js/games/*.js        ein Modul pro Spiel
```

**Neues Spiel hinzufügen:** Datei in `js/games/` anlegen, in `js/games/index.js` eintragen
und in `sw.js` zur Dateiliste hinzufügen. Ein Spiel ist ein Objekt mit:

| Feld | Bedeutung |
|---|---|
| `id, name, icon, desc, help` | Anzeige |
| `variants` | `[{id, label}]` – Stufen/Größen, je Variante eigene Bestenliste |
| `metric` | `{type: 'time'|'points'|'moves', better: 'low'|'high', label, always}` – `always: true` = auch ohne Sieg werten (z. B. Punkte) |
| `abandon(state)` | Ergebnis beim Aufgeben oder `null` |
| `daily` (optional) | `{variant(tag), label(tag)}` – nimmt am Rätsel des Tages teil; das Spiel erzeugt dann sein Rätsel mit `withSeed(ctx.daily.seed, …)` |
| `start(el, ctx)` | Spiel aufbauen; gibt `{key, pause, resume, resize, destroy}` zurück |

`ctx` bietet `daily` (null oder `{key, index, seed}`), `saved`, `save(state)`, `finish({won, value, detail, draw})`, `restart(abandonResult)`, `setInfo(html)`, `fmtTime`, `toast`, `modal`.

// Stoppuhr, die pausiert werden kann und sich als Millisekunden speichern lässt
export class Stopwatch {
  constructor(ms = 0) { this.base = ms; this.t0 = null; }
  run() { if (this.t0 === null) this.t0 = performance.now(); }
  stop() { if (this.t0 !== null) { this.base += performance.now() - this.t0; this.t0 = null; } }
  add(ms) { this.base += ms; }
  get ms() { return this.base + (this.t0 !== null ? performance.now() - this.t0 : 0); }
  get sec() { return Math.max(1, Math.round(this.ms / 1000)); }
}

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Wischgesten. continuous = mehrere Richtungswechsel während einer Berührung (für Snake).
// Ein kurzer Tipp ohne Bewegung meldet 'tap'.
export function onSwipe(el, cb, { min = 24, continuous = false } = {}) {
  let sx = 0, sy = 0, active = null, fired = false;
  el.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; active = e.pointerId; fired = false; });
  el.addEventListener('pointermove', e => {
    if (active !== e.pointerId || (fired && !continuous)) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return;
    cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    fired = true; sx = e.clientX; sy = e.clientY;
  });
  const end = e => { if (active !== e.pointerId) return; active = null; if (!fired && e.type === 'pointerup') cb('tap'); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

export const KEYDIR = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };

// ---------- Reproduzierbarer Zufall (für das Rätsel des Tages) ----------
export function hashSeed(str) {   // FNV-1a, 32 Bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// Führt fn aus, während Math.random einen festen Startwert nutzt – gleiches Ergebnis auf jedem Gerät
export function withSeed(seed, fn) {
  const orig = Math.random;
  Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = orig; }
}
// Heutiges Datum (lokal) als Schlüssel und fortlaufende Tagesnummer
export function today(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return {
    key: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    index: Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000),
    weekday: d.getDay(),
    label: d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
  };
}

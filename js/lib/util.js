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

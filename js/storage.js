// Schlüssel-Wert-Speicher auf IndexedDB-Basis mit Arbeitskopie im Speicher.
// Fällt auf localStorage zurück, falls IndexedDB nicht verfügbar ist.
const DB_NAME = 'spielekiste', STORE = 'kv';
const cache = new Map();
let db = null;

const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function initStorage() {
  try {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    db = await req(open);
    const st = db.transaction(STORE).objectStore(STORE);
    const [keys, vals] = await Promise.all([req(st.getAllKeys()), req(st.getAll())]);
    keys.forEach((k, i) => cache.set(k, vals[i]));
  } catch (e) {
    db = null;
    try { const raw = JSON.parse(localStorage.getItem(DB_NAME) || '{}'); for (const k in raw) cache.set(k, raw[k]); } catch (_) {}
  }
  // Browser bitten, die Daten nicht bei Speicherknappheit zu löschen
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}
}

function write(key, val, remove) {
  if (db) {
    try {
      const st = db.transaction(STORE, 'readwrite').objectStore(STORE);
      remove ? st.delete(key) : st.put(val, key);
    } catch (e) { console.warn('Speichern fehlgeschlagen', e); }
  } else {
    try { localStorage.setItem(DB_NAME, JSON.stringify(Object.fromEntries(cache))); } catch (_) {}
  }
}

export const get = (k, def = null) => cache.has(k) ? structuredClone(cache.get(k)) : def;
export function set(k, v) { v = structuredClone(v); cache.set(k, v); write(k, v); }
export function del(k) { if (cache.delete(k)) write(k, null, true); }
export const keys = (prefix = '') => [...cache.keys()].filter(k => k.startsWith(prefix));

export const exportAll = () => ({ app: 'spielekiste', version: 1, exported: new Date().toISOString(), data: Object.fromEntries(cache) });
export function importAll(obj) {
  if (!obj || obj.app !== 'spielekiste' || typeof obj.data !== 'object') throw new Error('Das ist keine Spielekiste-Sicherung.');
  for (const k of [...cache.keys()]) del(k);
  for (const [k, v] of Object.entries(obj.data)) set(k, v);
}
export async function isPersisted() {
  try { return !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); } catch (_) { return false; }
}

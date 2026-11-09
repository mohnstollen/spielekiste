import * as S from './storage.js';
import GAMES from './games/index.js';
import { today, hashSeed } from './lib/util.js';

const APP_VERSION = '1.1.0';
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view'), titleEl = $('#title'), backBtn = $('#back'), slot = $('#slot');
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const G = id => GAMES.find(g => g.id === id);
let current = null;          // laufende Spielinstanz
let navStack = [];           // eigene Verlaufsliste für den Zurück-Pfeil
let installPrompt = null;
let ready = false;            // true, sobald Speicher geladen und Profil vorhanden

/* ---------------- Formatierung ---------------- */
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
function fmtValue(game, v) {
  if (v == null) return '–';
  if (game.metric.type === 'time') return fmtTime(v);
  if (game.metric.type === 'moves') return v + (v === 1 ? ' Zug' : ' Züge');
  return Math.round(v).toLocaleString('de-DE') + ' ' + (game.metric.unit || 'P');
}
const fmtDate = ts => new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  return h < 24 ? `vor ${h} Std.` : `am ${fmtDate(ts)}`;
}
const variantLabel = (g, vid) => (g.variants.find(v => v.id === vid) || {}).label || vid;

/* ---------------- Dialoge ---------------- */
export function modal({ title = '', html = '', buttons = [{ label: 'OK', value: true, primary: true }], input = null }) {
  return new Promise(res => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog">
      ${title ? `<h2>${title}</h2>` : ''}<div class="modal-body">${html}</div>
      ${input ? `<input class="modal-input" type="text" maxlength="20" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}">` : ''}
      <div class="modal-btns">${buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''}" data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
    document.body.appendChild(bg);
    const inp = $('.modal-input', bg);
    if (inp) { inp.focus(); inp.select(); }
    const close = v => { bg.remove(); res(v); };
    bg.addEventListener('click', e => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const btn = buttons[+b.dataset.i];
      close(inp && btn.value === true ? (inp.value.trim() || null) : btn.value);
    });
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') close(inp.value.trim() || null); });
  });
}
const confirmBox = (title, text, yes = 'Ja') => modal({ title, html: `<p>${text}</p>`, buttons: [{ label: 'Abbrechen', value: false }, { label: yes, value: true, primary: true }] });

export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 1900);
  setTimeout(() => t.remove(), 2300);
}

/* ---------------- Profile ---------------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const getProfiles = () => S.get('profiles', { list: [], current: null });
function profile() { const p = getProfiles(); return p.list.find(x => x.id === p.current) || p.list[0] || null; }
const nameOf = (pid, fallback) => (getProfiles().list.find(x => x.id === pid) || {}).name || fallback;
function setCurrent(id) { const p = getProfiles(); p.current = id; S.set('profiles', p); }

async function addProfile(first = false) {
  const name = await modal({
    title: first ? 'Willkommen in der Spielekiste!' : 'Neues Profil',
    html: `<p>${first ? 'Wie heißt du? Der Name erscheint in den Bestenlisten.' : 'Name für das neue Profil:'}</p>`,
    input: { placeholder: 'Name' },
    buttons: first ? [{ label: 'Los geht’s', value: true, primary: true }] : [{ label: 'Abbrechen', value: null }, { label: 'Anlegen', value: true, primary: true }]
  });
  if (!name && !first) return null;
  const p = getProfiles(), id = uid();
  p.list.push({ id, name: name || `Spieler ${p.list.length + 1}` });
  p.current = id;
  S.set('profiles', p);
  return id;
}

/* ---------------- Spielstände, Statistik, Bestenlisten ---------------- */
const saveKey = (pid, gid) => `save:${pid}:${gid}`;
const statKey = (pid, gid, vid) => `stats:${pid}:${gid}:${vid}`;
const boardKey = (gid, vid) => `board:${gid}:${vid}`;
const better = (g, a, b) => g.metric.better === 'low' ? a < b : a > b;

function record(game, vid, result) {
  const p = profile();
  const st = S.get(statKey(p.id, game.id, vid), { played: 0, won: 0, lost: 0, draw: 0, streak: 0, bestStreak: 0, best: null, sum: 0, counted: 0 });
  st.played++;
  if (result.won) { st.won++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); }
  else if (result.draw) { st.draw++; st.streak = 0; }
  else { st.lost++; st.streak = 0; }

  let rank = null, personalBest = false, first = false;
  if (result.value != null && (result.won || (game.metric.always && result.value > 0))) {
    st.sum += result.value; st.counted++;
    if (st.best == null) { first = true; personalBest = true; st.best = result.value; }
    else if (better(game, result.value, st.best)) { personalBest = true; st.best = result.value; }
    const board = S.get(boardKey(game.id, vid), []);
    const entry = { pid: p.id, name: p.name, value: result.value, detail: result.detail || '', date: Date.now() };
    board.push(entry);
    board.sort((a, b) => game.metric.better === 'low' ? a.value - b.value : b.value - a.value);
    const idx = board.indexOf(entry);
    if (idx < 20) rank = idx + 1;
    S.set(boardKey(game.id, vid), board.slice(0, 20));
  }
  S.set(statKey(p.id, game.id, vid), st);
  return { rank, personalBest, first, stats: st };
}

async function showResult(game, v, result, r) {
  const head = result.won ? '🎉 Gewonnen!' : result.draw ? '🤝 Unentschieden' : game.metric.always ? 'Spiel vorbei' : '😕 Verloren';
  let html = '';
  if (result.value != null && (result.won || (game.metric.always && result.value > 0))) {
    html += `<div class="result-value">${fmtValue(game, result.value)}</div>`;
    if (result.detail) html += `<p class="muted center">${esc(result.detail)}</p>`;
    if (r.personalBest && !r.first) html += `<p class="center hl">⭐ Neuer persönlicher Rekord!</p>`;
    if (r.rank) html += `<p class="center">Platz ${r.rank} in der Bestenliste</p>`;
  } else if (result.message) html += `<p class="center">${esc(result.message)}</p>`;
  if (r.stats.streak > 1) html += `<p class="center muted">${r.stats.streak} Siege in Folge</p>`;
  const a = await modal({ title: head, html, buttons: [{ label: 'Menü', value: 'menu' }, { label: '🏆', value: 'board' }, { label: 'Nochmal', value: 'again', primary: true }] });
  if (a === 'again') render();
  else if (a === 'board') go(`#/bestenliste/${game.id}/${v.id}`);
  else go(`#/spiel/${game.id}`);
}

/* ---------------- Rätsel des Tages ---------------- */
const DAILY = GAMES.filter(g => g.daily);
const dailyKey = d => `daily:${d.key}`;
const dsaveKey = (pid, gid) => `dsave:${pid}:${gid}`;
function myDaily(d, gid, pid = profile().id) { return (S.get(dailyKey(d), {})[gid] || {})[pid] || null; }
function streakOf(pid) {
  const st = S.get(`dstreak:${pid}`, { last: null, streak: 0, best: 0 });
  const t = today(), y = today(new Date(Date.now() - 86400000));
  if (st.last !== t.key && st.last !== y.key) st.streak = 0;
  return st;
}
function recordDaily(game, d, result) {
  const p = profile(), all = S.get(dailyKey(d), {});
  all[game.id] = all[game.id] || {};
  all[game.id][p.id] = { name: p.name, value: result.won ? result.value : null, failed: !result.won, detail: result.detail || '', t: Date.now() };
  S.set(dailyKey(d), all);
  S.del(dsaveKey(p.id, game.id));
  if (result.won) {
    const st = streakOf(p.id);
    if (st.last !== d.key) {
      const y = today(new Date(Date.now() - 86400000));
      st.streak = st.last === y.key ? st.streak + 1 : 1;
      st.best = Math.max(st.best, st.streak);
      st.last = d.key;
      S.set(`dstreak:${p.id}`, st);
    }
  }
}
function shareText(d) {
  const lines = DAILY.map(g => {
    const r = myDaily(d, g.id);
    return `${g.icon} ${g.name} (${g.daily.label(d)}): ${r ? (r.failed ? '❌' : fmtValue(g, r.value)) : '–'}`;
  });
  const st = streakOf(profile().id);
  return `Spielekiste – Rätsel des Tages ${d.label}\n${lines.join('\n')}${st.streak > 1 ? `\n🔥 ${st.streak} Tage in Folge` : ''}\n${location.origin}${location.pathname}`;
}
async function share(d) {
  const text = shareText(d);
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('In die Zwischenablage kopiert'); }
  catch (_) { modal({ title: 'Ergebnis', html: `<pre class="share">${esc(text)}</pre>` }); }
}
function pruneDaily() {   // alte Tagesdaten (> 30 Tage) und veraltete Tages-Spielstände entfernen
  const limit = today(new Date(Date.now() - 30 * 86400000)).key, t = today().key;
  S.keys('daily:').forEach(k => { if (k.slice(6) < limit) S.del(k); });
  S.keys('dsave:').forEach(k => { const v = S.get(k); if (!v || v.date !== t) S.del(k); });
}

function dailyView() {
  titleEl.textContent = 'Rätsel des Tages';
  const d = today(), p = profile(), st = streakOf(p.id), all = S.get(dailyKey(d), {});
  const anyDone = DAILY.some(g => myDaily(d, g.id));
  view.innerHTML = `
    <div class="daily-head"><div><b>${d.label}</b><small>Heute spielen alle dieselben Rätsel – auch auf anderen Geräten.</small></div>
      <div class="streak" title="Tage in Folge mit gelöstem Rätsel">🔥 ${st.streak}<small>Rekord ${st.best}</small></div></div>
    ${DAILY.map(g => {
      const mine = myDaily(d, g.id), sv = S.get(dsaveKey(p.id, g.id));
      const running = sv && sv.date === d.key;
      const res = Object.entries(all[g.id] || {}).map(([pid, r]) => ({ pid, ...r }))
        .sort((a, b) => (a.failed - b.failed) || (g.metric.better === 'low' ? a.value - b.value : b.value - a.value));
      return `<section class="card daily-game">
        <div class="dg-head"><span class="dg-ico">${g.icon}</span><div><b>${g.name}</b><small>${g.daily.label(d)}</small></div>
          ${mine ? `<span class="dg-res ${mine.failed ? 'bad' : 'ok'}">${mine.failed ? '❌ nicht geschafft' : '✓ ' + fmtValue(g, mine.value)}</span>`
                 : `<button class="btn primary small" data-play="${g.id}">${running ? '▶ Weiter' : 'Spielen'}</button>`}</div>
        ${res.length > 1 || (res.length && res[0].pid !== p.id) ? `<ol class="board mini">${res.map((r, i) => `<li class="${r.pid === p.id ? 'me' : ''}"><span class="rk">${r.failed ? '–' : i + 1}</span><span class="nm">${esc(nameOf(r.pid, r.name))}</span><span class="vl">${r.failed ? '❌' : fmtValue(g, r.value)}</span></li>`).join('')}</ol>` : ''}
      </section>`;
    }).join('')}
    ${anyDone ? '<button class="btn wide" id="share">📤 Ergebnis teilen</button>' : ''}
    <p class="muted small center">Jeden Tag um Mitternacht gibt es neue Rätsel. Sudoku wird im Lauf der Woche schwerer – sonntags Extrem.</p>`;
  view.querySelectorAll('[data-play]').forEach(b => b.onclick = () => go(`#/heute/${b.dataset.play}`));
  const sb = $('#share'); if (sb) sb.onclick = () => share(d);
}

async function showDailyResult(game, d, result) {
  const st = streakOf(profile().id);
  let html = result.won ? `<div class="result-value">${fmtValue(game, result.value)}</div>` : '<p class="center">Morgen gibt es ein neues Rätsel.</p>';
  if (result.won && result.detail) html += `<p class="muted center">${esc(result.detail)}</p>`;
  if (st.streak) html += `<p class="center hl">🔥 ${st.streak} ${st.streak === 1 ? 'Tag' : 'Tage in Folge'}</p>`;
  const a = await modal({ title: result.won ? '🎉 Tagesrätsel gelöst!' : '💥 Leider nicht geschafft', html,
    buttons: [{ label: 'Übersicht', value: 'list' }, { label: '📤 Teilen', value: 'share', primary: true }] });
  if (a === 'share') await share(d);
  go('#/heute');
}

/* ---------------- Navigation ---------------- */
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function parentOf(h) {
  const p = h.replace(/^#\/?/, '').split('/');
  return p[0] === 'spielen' ? `#/spiel/${p[1]}` : p[0] === 'heute' && p[1] ? '#/heute' : '#/';
}
backBtn.onclick = () => {
  if (navStack.length > 1) history.back();
  else location.replace(parentOf(location.hash));
};
window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (navStack.length > 1 && navStack[navStack.length - 2] === h) navStack.pop(); else navStack.push(h);
  render();
});

function render() {
  if (!profile()) return;
  if (current) { try { current.destroy(); } catch (e) { console.error(e); } current = null; }
  document.querySelectorAll('.modal-bg').forEach(m => m.remove());
  slot.textContent = '';
  view.className = '';
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  backBtn.hidden = !parts[0];
  window.scrollTo(0, 0);
  switch (parts[0]) {
    case 'spiel': return setupView(parts[1]);
    case 'spielen': return playView(parts[1], parts[2]);
    case 'heute': return parts[1] ? dailyPlay(parts[1]) : dailyView();
    case 'bestenliste': return boardsView(parts[1], parts[2]);
    case 'statistik': return statsView();
    case 'einstellungen': return settingsView();
    default: return homeView();
  }
}

/* ---------------- Startseite ---------------- */
function homeView() {
  titleEl.textContent = 'Spielekiste';
  const p = profile();
  view.innerHTML = `
    <button class="profile-chip" id="pchip"><span>👤 ${esc(p.name)}</span><small>Profil wechseln</small></button>
    ${(() => {
      const d = today(), done = DAILY.filter(g => myDaily(d, g.id)).length, st = streakOf(p.id);
      return `<a class="daily-card" href="#/heute"><span class="dc-ico">📅</span><div><b>Rätsel des Tages</b><small>${d.label} · ${done === DAILY.length ? 'alle gelöst ✓' : `${done} von ${DAILY.length} gespielt`}</small></div>${st.streak ? `<span class="streak small">🔥 ${st.streak}</span>` : '<span class="go">›</span>'}</a>`;
    })()}
    <div class="tiles">${GAMES.map(g => {
      const sv = S.get(saveKey(p.id, g.id));
      return `<a class="tile" href="#/spiel/${g.id}"><div class="ico">${g.icon}</div><div class="name">${g.name}</div>${sv ? '<span class="badge">läuft</span>' : ''}</a>`;
    }).join('')}</div>
    <nav class="menu">
      <a href="#/bestenliste">🏆 Bestenlisten</a>
      <a href="#/statistik">📊 Meine Statistik</a>
      <a href="druck.html">🖨️ Sudokus zum Ausdrucken</a>
      <a href="#/einstellungen">⚙️ Profile & Einstellungen</a>
      ${installPrompt ? '<button id="install">📲 Als App installieren</button>' : ''}
    </nav>`;
  $('#pchip').onclick = pickProfile;
  const ib = $('#install');
  if (ib) ib.onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); };
}

async function pickProfile() {
  const p = getProfiles();
  const a = await modal({
    title: 'Wer spielt?',
    html: `<div class="plist">${p.list.map(x => `<button class="btn wide ${x.id === p.current ? 'primary' : ''}" data-pid="${x.id}">${esc(x.name)}</button>`).join('')}</div>`,
    buttons: [{ label: '+ Neues Profil', value: 'new' }, { label: 'Schließen', value: null }]
  });
  if (a === 'new') { await addProfile(); render(); }
}
document.addEventListener('click', e => {   // Profilwahl im Dialog
  const b = e.target.closest('[data-pid]');
  if (!b) return;
  setCurrent(b.dataset.pid);
  document.querySelectorAll('.modal-bg').forEach(m => m.remove());
  render();
});

/* ---------------- Spiel-Auswahl ---------------- */
function setupView(gid) {
  const g = G(gid);
  if (!g) return location.replace('#/');
  titleEl.textContent = g.name;
  const p = profile(), sv = S.get(saveKey(p.id, g.id));
  view.innerHTML = `
    <div class="setup-head"><div class="ico big">${g.icon}</div><p class="muted">${g.desc}</p></div>
    ${sv ? `<button class="btn primary wide resume" id="resume">▶ Weiterspielen · ${esc(variantLabel(g, sv.variant))}<small>gespeichert ${ago(sv.updated)}</small></button>` : ''}
    <h3>Neues Spiel</h3>
    <div class="variants">${g.variants.map(v => {
      const st = S.get(statKey(p.id, g.id, v.id));
      const info = st && st.best != null ? 'Bestwert ' + fmtValue(g, st.best) : st && st.played ? `${st.played}× gespielt` : 'noch nicht gespielt';
      return `<button class="variant" data-v="${v.id}"><span>${v.label}</span><small>${info}</small></button>`;
    }).join('')}</div>
    ${g.help ? `<details class="help"><summary>Regeln & Bedienung</summary>${g.help}</details>` : ''}
    <a class="btn wide" href="#/bestenliste/${g.id}">🏆 Bestenliste ${g.name}</a>`;
  if (sv) $('#resume').onclick = () => go(`#/spielen/${g.id}/${sv.variant}`);
  view.querySelectorAll('.variant').forEach(b => b.onclick = async () => {
    if (sv) {
      if (!await confirmBox('Laufendes Spiel beenden?', `Du hast noch ein Spiel (${esc(variantLabel(g, sv.variant))}) offen. Neues Spiel starten und das alte aufgeben?`, 'Neues Spiel')) return;
      const res = g.abandon ? g.abandon(sv.state) : null;
      if (res) record(g, sv.variant, res);
      S.del(saveKey(p.id, g.id));
    }
    go(`#/spielen/${g.id}/${b.dataset.v}`);
  });
}

/* ---------------- Spielen ---------------- */
function dailyPlay(gid) {
  const g = G(gid), d = today();
  if (!g || !g.daily) return location.replace('#/heute');
  if (myDaily(d, gid)) return location.replace('#/heute');
  playView(gid, g.daily.variant(d), d);
}

function playView(gid, vid, daily = null) {
  const g = G(gid), v = g && g.variants.find(x => x.id === vid);
  if (!v) return location.replace('#/');
  titleEl.textContent = daily ? `📅 ${g.name} · ${g.daily.label(daily)}` : `${g.name} · ${v.label}`;
  const p = profile(), key = daily ? dsaveKey(p.id, g.id) : saveKey(p.id, g.id);
  let sv = S.get(key);
  if (sv && (daily ? sv.date !== daily.key : sv.variant !== vid)) sv = null;
  view.className = 'playing';
  view.innerHTML = `<div class="game game-${g.id}"></div>`;
  let done = false;
  const here = location.hash;
  const ctx = {
    variant: vid, variantLabel: v.label, profile: p,
    daily: daily ? { ...daily, seed: hashSeed(daily.key + ':' + g.id) } : null,
    saved: sv ? sv.state : null,
    save: state => { if (!done) S.set(key, { variant: vid, date: daily ? daily.key : undefined, state, updated: Date.now() }); },
    setInfo: html => { slot.innerHTML = html; },
    fmtTime, modal, toast,
    finish: result => {
      if (done) return;
      done = true;
      S.del(key);
      if (daily) {
        recordDaily(g, daily, result);
        return setTimeout(() => { if (location.hash === here) showDailyResult(g, daily, result); }, result.delay ?? 400);
      }
      const r = record(g, vid, result);
      setTimeout(() => { if (location.hash === here) showResult(g, v, result, r); }, result.delay ?? 400);
    },
    restart: async abandonResult => {
      if (daily) return;
      if (!done && !await confirmBox('Neues Spiel?', 'Das aktuelle Spiel wird beendet.', 'Neues Spiel')) return;
      if (abandonResult && !done) record(g, vid, abandonResult);
      done = true;
      S.del(key);
      render();
    }
  };
  try {
    current = g.start($('.game', view), ctx);
    if (daily) view.querySelectorAll('[data-a=new]').forEach(b => b.hidden = true);
  }
  catch (e) { console.error(e); view.innerHTML = `<p class="center">Fehler beim Starten: ${esc(e.message)}</p>`; }
}

/* ---------------- Bestenlisten ---------------- */
function boardsView(gid, vid) {
  titleEl.textContent = 'Bestenlisten';
  const g = G(gid) || GAMES[0];
  const v = g.variants.find(x => x.id === vid) || g.variants[0];
  const me = profile().id;
  const board = S.get(boardKey(g.id, v.id), []);
  view.innerHTML = `
    <div class="chips">${GAMES.map(x => `<button class="chip ${x === g ? 'on' : ''}" data-go="#/bestenliste/${x.id}">${x.icon} ${x.name}</button>`).join('')}</div>
    <div class="chips sub">${g.variants.map(x => `<button class="chip ${x === v ? 'on' : ''}" data-go="#/bestenliste/${g.id}/${x.id}">${x.label}</button>`).join('')}</div>
    <p class="muted small">Gewertet nach: ${g.metric.label}${g.metric.better === 'low' ? ' (weniger ist besser)' : ''}</p>
    ${board.length ? `<ol class="board">${board.map((e, i) => `
      <li class="${e.pid === me ? 'me' : ''}">
        <span class="rk">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
        <span class="nm">${esc(nameOf(e.pid, e.name))}<small>${fmtDate(e.date)}${e.detail ? ' · ' + esc(e.detail) : ''}</small></span>
        <span class="vl">${fmtValue(g, e.value)}</span></li>`).join('')}</ol>`
      : `<p class="empty">Noch keine Einträge – Zeit für eine Runde!</p>`}
    <a class="btn primary wide" href="#/spiel/${g.id}">${g.icon} ${g.name} spielen</a>`;
  view.querySelectorAll('[data-go]').forEach(b => b.onclick = () => location.replace(b.dataset.go));
}

/* ---------------- Statistik ---------------- */
function statsView() {
  titleEl.textContent = 'Meine Statistik';
  const p = profile();
  let html = `<p class="muted">Profil: <b>${esc(p.name)}</b></p>`, any = false;
  for (const g of GAMES) {
    const rows = g.variants.map(v => [v, S.get(statKey(p.id, g.id, v.id))]).filter(([, st]) => st && st.played);
    if (!rows.length) continue;
    any = true;
    const always = g.metric.always;
    html += `<section class="card"><h3>${g.icon} ${g.name}</h3><table class="stats"><tr><th></th><th>Spiele</th>
      ${always ? '<th>Schnitt</th>' : '<th>Siege</th>'}<th>Bestwert</th>${always ? '' : '<th>Serie</th>'}</tr>
      ${rows.map(([v, st]) => `<tr><td>${v.label}</td><td>${st.played}</td>
        ${always ? `<td>${st.counted ? fmtValue(g, Math.round(st.sum / st.counted)) : '–'}</td>` : `<td>${Math.round(st.won / st.played * 100)} %</td>`}
        <td>${fmtValue(g, st.best)}</td>${always ? '' : `<td title="aktuell / beste">${st.streak} / ${st.bestStreak}</td>`}</tr>`).join('')}
      </table></section>`;
  }
  if (!any) html += '<p class="empty">Noch keine Spiele gespielt.</p>';
  view.innerHTML = html;
}

/* ---------------- Einstellungen ---------------- */
async function settingsView() {
  titleEl.textContent = 'Profile & Einstellungen';
  const p = getProfiles();
  const persisted = await S.isPersisted();
  view.innerHTML = `
    <section class="card"><h3>Profile</h3>
      ${p.list.map(x => `<div class="prow"><span>${x.id === p.current ? '✅' : '⬜'} ${esc(x.name)}</span>
        <span>${x.id !== p.current ? `<button class="btn small" data-act="use" data-id="${x.id}">Wählen</button>` : ''}
        <button class="btn small" data-act="ren" data-id="${x.id}">✏️</button>
        ${p.list.length > 1 ? `<button class="btn small" data-act="del" data-id="${x.id}">🗑</button>` : ''}</span></div>`).join('')}
      <button class="btn wide" data-act="add">+ Profil hinzufügen</button>
    </section>
    <section class="card"><h3>Datensicherung</h3>
      <p class="muted small">Spielstände, Statistik und Bestenlisten liegen nur auf diesem Gerät. Eine Sicherung schützt vor Verlust, z. B. wenn Browserdaten gelöscht werden.</p>
      <button class="btn wide" data-act="export">💾 Sicherung herunterladen</button>
      <label class="btn wide filebtn">📂 Sicherung einspielen<input type="file" accept="application/json,.json" id="imp" hidden></label>
      <p class="small ${persisted ? 'ok' : 'muted'}">${persisted ? '✓ Der Browser hält die Daten dauerhaft vor.' : 'Hinweis: Der Browser darf die Daten bei Speichermangel löschen. Als App installieren hilft meist.'}</p>
    </section>
    <section class="card"><h3>Zurücksetzen</h3>
      <button class="btn wide danger" data-act="resetboards">Alle Bestenlisten löschen</button>
    </section>
    <p class="muted small center">Spielekiste ${APP_VERSION} · funktioniert komplett offline</p>`;

  view.onclick = async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.dataset.id, pr = getProfiles(), pf = pr.list.find(x => x.id === id);
    switch (b.dataset.act) {
      case 'use': setCurrent(id); break;
      case 'add': await addProfile(); break;
      case 'ren': {
        const n = await modal({ title: 'Profil umbenennen', input: { value: pf.name }, buttons: [{ label: 'Abbrechen', value: null }, { label: 'Speichern', value: true, primary: true }] });
        if (n) { pf.name = n; S.set('profiles', pr); }
        break;
      }
      case 'del':
        if (!await confirmBox('Profil löschen?', `„${esc(pf.name)}“ mit allen Spielständen, Statistiken und Bestenlisten-Einträgen löschen?`, 'Löschen')) return;
        pr.list = pr.list.filter(x => x.id !== id);
        if (pr.current === id) pr.current = pr.list[0].id;
        S.set('profiles', pr);
        S.keys(`save:${id}:`).concat(S.keys(`stats:${id}:`)).forEach(k => S.del(k));
        S.keys('board:').forEach(k => S.set(k, S.get(k).filter(x => x.pid !== id)));
        break;
      case 'export': {
        const blob = new Blob([JSON.stringify(S.exportAll(), null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `spielekiste-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        return;
      }
      case 'resetboards':
        if (!await confirmBox('Bestenlisten löschen?', 'Alle Bestenlisten aller Spiele werden geleert. Statistiken bleiben erhalten.', 'Löschen')) return;
        S.keys('board:').forEach(k => S.del(k));
        toast('Bestenlisten geleert');
        break;
    }
    settingsView();
  };
  $('#imp').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!await confirmBox('Sicherung einspielen?', 'Alle aktuellen Daten auf diesem Gerät werden durch die Sicherung ersetzt.', 'Einspielen')) return;
      S.importAll(data);
      toast('Sicherung eingespielt');
      settingsView();
    } catch (err) { modal({ title: 'Fehler', html: `<p>${esc(err.message)}</p>` }); }
  };
}

/* ---------------- Globale Ereignisse ---------------- */
document.addEventListener('keydown', e => {
  if (!current || !current.key || document.querySelector('.modal-bg')) return;
  if (e.target.tagName === 'INPUT') return;
  current.key(e);
});
document.addEventListener('visibilitychange', () => {
  if (!current) return;
  if (document.hidden) current.pause && current.pause();
  else current.resume && current.resume();
});
let lastDay = today().key;
document.addEventListener('visibilitychange', () => {
  if (document.hidden || today().key === lastDay) return;
  lastDay = today().key; pruneDaily();
  if (!current) render();
});
window.addEventListener('pagehide', () => current && current.pause && current.pause());
let rsz;
window.addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(() => current && current.resize && current.resize(), 150); });
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  // Nur den Startbildschirm auffrischen – nie, solange ein Dialog offen ist oder noch kein Profil existiert
  if (ready && profile() && !document.querySelector('.modal-bg') && !location.hash.replace(/^#\/?/, '')) render();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Bei einem Update übernimmt der neue Service Worker sofort; dann einmal neu laden,
  // damit die neuen Dateien aktiv sind (nicht beim allerersten Besuch).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    if (current && current.pause) current.pause();
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service Worker:', e));
}

(async () => {
  await S.initStorage();
  if (!profile()) await addProfile(true);
  pruneDaily();
  ready = true;
  navStack = [location.hash];
  render();
})();

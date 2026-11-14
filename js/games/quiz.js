// Quizleiter: 15 Wissensfragen mit steigender Schwierigkeit, Punkteleiter mit zwei Sicherheitsstufen und drei Jokern.
import * as S from '../storage.js';
import { QUESTIONS } from '../lib/quiz-questions.js';
import { withSeed, hashSeed } from '../lib/util.js';

const GID = 'quiz';
const LADDER = [10, 20, 50, 100, 200, 400, 700, 1000, 1500, 2500, 4000, 6000, 10000, 15000, 25000];
const SAFE = [4, 9];                                  // nach Frage 5 und 10 sind die Punkte sicher
const TIME = 30;                                      // Sekunden je Frage im Zeitmodus
const AUDIENCE = [0.70, 0.58, 0.47, 0.38, 0.30];      // Anteil richtiger Publikumsstimmen je Stufe (etwa)
const FRIEND = [0.95, 0.85, 0.70, 0.55, 0.42];        // Wahrscheinlichkeit, dass der Freund recht hat
const LETTERS = 'ABCD';
const fmt = n => n.toLocaleString('de-DE');
const tierOf = i => Math.floor(i / 3) + 1;
const qid = q => hashSeed(q[2]);
const progKey = pid => `prog:${pid}:${GID}`;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const banked = i => i > 0 ? LADDER[i - 1] : 0;
const safeAt = i => { let s = 0; for (const k of SAFE) if (i > k) s = LADDER[k]; return s; };

// 15 Fragen: je 3 pro Stufe, bevorzugt solche, die das Profil noch nicht gesehen hat
function pickQuestions(seen) {
  const out = [];
  for (let t = 1; t <= 5; t++) {
    const pool = QUESTIONS.map((q, i) => [q, i]).filter(([q]) => q[0] === t);
    const fresh = shuffle(pool.filter(([q]) => !seen.has(qid(q)))), old = shuffle(pool.filter(([q]) => seen.has(qid(q))));
    out.push(...[...fresh, ...old].slice(0, 3).map(([, i]) => i));
  }
  return out;
}

const game = {
  id: GID, name: 'Quizleiter', icon: '💡',
  desc: '15 Fragen aus dem Allgemeinwissen, von leicht bis knifflig. Klettere die Punkteleiter hinauf – mit drei Jokern.',
  help: `<ul><li>Jede richtige Antwort bringt dich eine Stufe höher – bis ${fmt(LADDER[14])} Punkte.</li>
    <li>Nach Frage 5 (${fmt(LADDER[4])}) und Frage 10 (${fmt(LADDER[9])}) sind die Punkte <b>sicher</b>. Bei einer falschen Antwort fällst du auf die letzte Sicherheitsstufe zurück.</li>
    <li>Du kannst jederzeit <b>aussteigen</b> und deine Punkte mitnehmen.</li>
    <li>Joker (je einmal): <b>50:50</b> streicht zwei falsche Antworten, das <b>Publikum</b> stimmt ab, ein <b>Freund</b> gibt einen Tipp – beide können sich irren!</li>
    <li>Antwort antippen und dann festlegen (oder dieselbe Antwort noch einmal antippen). Tastatur: A–D bzw. 1–4, Enter.</li>
    <li>Im Zeitmodus hast du ${TIME} Sekunden pro Frage.</li></ul>`,
  variants: [{ id: 'klassisch', label: 'Klassisch' }, { id: 'zeit', label: `Mit Zeitlimit (${TIME} s)` }],
  metric: { type: 'points', unit: 'Punkte', better: 'high', label: 'Punkte', always: true },
  daily: { variant: () => 'klassisch', label: () => 'Quiz des Tages' },
  abandon: s => s && s.i > 0 && !s.over ? { won: false, value: banked(s.i), detail: `ausgestiegen nach Frage ${s.i}` } : null,

  start(el, ctx) {
    const pid = ctx.profile.id, timed = ctx.variant === 'zeit';
    const prog = S.get(progKey(pid), { seen: [] });
    let st = ctx.saved;
    if (!st) {
      const qs = ctx.daily
        ? withSeed(ctx.daily.seed, () => [1, 2, 3, 4, 5].flatMap(t => shuffle(QUESTIONS.map((q, i) => [q, i]).filter(([q]) => q[0] === t)).slice(0, 3).map(([, i]) => i)))
        : pickQuestions(new Set(prog.seen));
      st = { qs, i: 0, jokers: { fifty: true, pub: true, tel: true }, cur: null, over: false };
    }
    let selected = null, locked = false, timer = null, lastTick = 0, reveal = { right: -1, wrong: -1 };
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

    el.innerHTML = `<div class="qz">
      <div class="qz-head"><span class="qz-step"></span><span class="qz-for"></span><span class="qz-timer" hidden></span></div>
      <div class="qz-ladder">${LADDER.map((v, k) => `<i class="${SAFE.includes(k) ? 'safe' : ''}" title="${fmt(v)}"></i>`).join('')}</div>
      <div class="qz-jokers"><button class="btn small" data-j="fifty">50:50</button><button class="btn small" data-j="pub">👥 Publikum</button><button class="btn small" data-j="tel">📞 Freund</button></div>
      <div class="qz-q"><small class="qz-cat"></small><p></p></div>
      <div class="qz-a">${[0, 1, 2, 3].map(k => `<button class="qz-opt" data-o="${k}"><b>${LETTERS[k]}</b><span></span></button>`).join('')}</div>
      <div class="qz-help" hidden></div>
      <div class="cs-fb qz-fb" aria-live="polite"></div>
      <div class="tools"><button class="btn primary" data-a="lock" hidden></button><button class="btn primary" data-a="next" hidden>Nächste Frage ›</button><button class="btn" data-a="stop"></button></div>
    </div>`;
    const $ = s => el.querySelector(s);
    const opts = [...el.querySelectorAll('.qz-opt')], helpEl = $('.qz-help'), fbEl = $('.qz-fb');
    const lockBtn = $('[data-a=lock]'), nextBtn = $('[data-a=next]'), stopBtn = $('[data-a=stop]'), timerEl = $('.qz-timer');
    const fb = (html, cls = '') => { fbEl.className = 'cs-fb qz-fb ' + cls; fbEl.innerHTML = html || ''; };
    const q = () => QUESTIONS[st.qs[Math.min(st.i, 14)]];
    // Antwort k auf dem Bildschirm → Index in der Frage (0 = richtig)
    const correctPos = () => st.cur.order.indexOf(0);

    function newQuestion() {
      st.cur = { order: shuffle([0, 1, 2, 3]), removed: [], aud: null, tel: null, left: TIME * 1000 };
      ctx.save(st);
    }
    function render() {
      const qq = q(), i = Math.min(st.i, 14);
      $('.qz-step').textContent = `Frage ${i + 1} von 15`;
      $('.qz-for').innerHTML = `um <b>${fmt(LADDER[i])}</b> Punkte`;
      el.querySelectorAll('.qz-ladder i').forEach((e, k) => { e.className = (SAFE.includes(k) ? 'safe ' : '') + (k < i ? 'done' : k === i ? 'cur' : ''); });
      $('.qz-cat').textContent = `${qq[1]} · Stufe ${tierOf(i)}`;
      $('.qz-q p').textContent = qq[2];
      opts.forEach((b, k) => {
        b.querySelector('span').textContent = qq[3 + st.cur.order[k]];
        b.className = 'qz-opt' + (st.cur.removed.includes(k) ? ' gone' : '') + (selected === k ? ' sel' : '') + (reveal.right === k ? ' right' : '') + (reveal.wrong === k ? ' wrong' : '');
        b.disabled = st.cur.removed.includes(k) || locked || st.over;
      });
      el.querySelectorAll('[data-j]').forEach(b => { b.disabled = !st.jokers[b.dataset.j] || locked || st.over; b.classList.toggle('used', !st.jokers[b.dataset.j]); });
      lockBtn.hidden = selected === null || locked || st.over;
      lockBtn.textContent = selected !== null ? `✔ Antwort ${LETTERS[selected]} festlegen` : '';
      stopBtn.hidden = locked || st.over;
      stopBtn.textContent = i ? `Aussteigen mit ${fmt(banked(i))} Punkten` : 'Aussteigen';
      showHelp();
      ctx.setInfo(`${fmt(banked(st.i))} P`);
    }
    function showHelp() {
      const c = st.cur;
      let h = '';
      if (c.aud) h += `<div class="qz-aud">${c.aud.map((p, k) => `<div><span>${LETTERS[k]}</span><i style="height:${Math.max(2, p)}%"></i><b>${p} %</b></div>`).join('')}</div>`;
      if (c.tel) h += `<p class="qz-tel">📞 „${c.tel}“</p>`;
      helpEl.hidden = !h; helpEl.innerHTML = h;
    }

    /* ---------- Joker ---------- */
    function joker(j) {
      if (!st.jokers[j] || locked || st.over) return;
      st.jokers[j] = false;
      const c = st.cur, right = correctPos(), tier = tierOf(st.i);
      const alive = [0, 1, 2, 3].filter(k => !c.removed.includes(k));
      if (j === 'fifty') {
        const wrong = shuffle(alive.filter(k => k !== right));
        c.removed.push(...wrong.slice(0, Math.max(0, alive.length - 2)));
        if (c.removed.includes(selected)) selected = null;
        if (c.aud) c.aud = c.aud.map((p, k) => c.removed.includes(k) ? 0 : p);
      } else if (j === 'pub') {
        // Publikum: die richtige Antwort bekommt je nach Schwierigkeit mehr oder weniger Stimmen
        const share = Math.min(0.95, Math.max(0.2, AUDIENCE[tier - 1] + (Math.random() - 0.35) * 0.25));
        const w = alive.map(k => k === right ? 0 : Math.random() + 0.2), sum = w.reduce((a, b) => a + b, 0);
        const aud = [0, 0, 0, 0];
        alive.forEach((k, n) => { aud[k] = k === right ? share * 100 : (1 - share) * 100 * w[n] / sum; });
        // Auf ganze Prozent runden, Summe 100
        const r = aud.map(Math.floor); let rest = 100 - r.reduce((a, b) => a + b, 0);
        alive.sort((a, b) => (aud[b] - r[b]) - (aud[a] - r[a])).forEach(k => { if (rest > 0) { r[k]++; rest--; } });
        c.aud = r;
      } else {
        const ok = Math.random() < FRIEND[tier - 1];
        const pick = ok ? right : shuffle(alive.filter(k => k !== right))[0];
        const sure = ok ? Math.random() < FRIEND[tier - 1] : Math.random() < 0.3;
        c.tel = sure ? `Da bin ich mir ziemlich sicher: Es ist ${LETTERS[pick]}.`
          : Math.random() < 0.5 ? `Hm, ich glaube, es ist ${LETTERS[pick]} – aber ganz sicher bin ich nicht.` : `Puh, schwierig. Wenn ich raten müsste: ${LETTERS[pick]}.`;
      }
      ctx.save(st); render();
    }

    /* ---------- Antworten ---------- */
    function choose(k) {
      if (locked || st.over || st.cur.removed.includes(k)) return;
      if (selected === k) return lock();
      selected = k; render();
    }
    function lock(timeout = false) {
      if (locked || st.over || (selected === null && !timeout)) return;
      locked = true; stopTimer(); render();
      const right = correctPos(), i = st.i;
      fb(timeout ? '⏰ Die Zeit ist abgelaufen!' : 'Antwort ist festgelegt …');
      later(() => {
        reveal.right = right; opts[right].classList.add('right');
        if (!timeout && selected === right) {
          st.i++;
          if (st.i === 15) return end('top', `Richtig! Du hast alle 15 Fragen beantwortet: <b>${fmt(LADDER[14])} Punkte</b>! 🏆`);
          const safe = SAFE.includes(i);
          fb(`Richtig! Du hast jetzt <b>${fmt(LADDER[i])} Punkte</b>.${safe ? ' 🔒 Sicherheitsstufe erreicht – diese Punkte kann dir niemand mehr nehmen.' : ''}`, 'ok');
          st.cur = null; ctx.save(st);
          nextBtn.hidden = false; stopBtn.hidden = true;
        } else {
          if (selected !== null) { reveal.wrong = selected; opts[selected].classList.add('wrong'); }
          const pts = safeAt(i);
          end('wrong', `${timeout ? 'Zu spät!' : 'Leider falsch.'} Richtig ist <b>${LETTERS[right]}: ${q()[3]}</b>. ${pts ? `Du fällst auf die Sicherheitsstufe zurück: <b>${fmt(pts)} Punkte</b>.` : 'Du gehst ohne Punkte nach Hause.'}`);
        }
      }, 1100);
    }
    function end(kind, html) {
      st.over = true; stopTimer();
      const n = kind === 'top' ? 15 : st.i;
      const value = kind === 'top' ? LADDER[14] : kind === 'stop' ? banked(st.i) : safeAt(st.i);
      fb(html, kind === 'wrong' ? 'bad' : 'ok');
      render();
      ctx.setInfo(`${fmt(value)} P`);
      // gesehene Fragen merken (nur im freien Spiel)
      if (!ctx.daily) { prog.seen = [...prog.seen, ...st.qs.slice(0, Math.min(15, st.i + 1)).map(k => qid(QUESTIONS[k]))].slice(-250); S.set(progKey(pid), prog); }
      ctx.finish({ won: ctx.daily ? value > 0 : kind === 'top', value, delay: 2600,
        title: kind === 'top' ? '🏆 Ganz oben!' : kind === 'stop' ? '💰 Ausgestiegen' : '❌ Leider falsch',
        detail: `${n} von 15 richtig${timed ? ' · Zeitmodus' : ''}`, message: 'Diesmal leider keine Punkte.' });
    }
    async function stop() {
      if (locked || st.over) return;
      const pts = banked(st.i);
      stopTimer();
      const ok = await ctx.modal({ title: 'Aussteigen?', html: `<p>Du nimmst <b>${fmt(pts)} Punkte</b> mit. Wirklich aufhören?</p>`,
        buttons: [{ label: 'Weiterspielen', value: false }, { label: 'Aussteigen', value: true, primary: true }] });
      if (!ok) return startTimer();
      locked = true;
      const right = correctPos();
      reveal.right = right;
      end('stop', `Du steigst mit <b>${fmt(pts)} Punkten</b> aus. Die richtige Antwort wäre <b>${LETTERS[right]}: ${q()[3]}</b> gewesen.`);
    }
    function next() {
      nextBtn.hidden = true; selected = null; locked = false; reveal = { right: -1, wrong: -1 }; fb('');
      newQuestion(); render(); startTimer();
    }

    /* ---------- Zeitmodus ---------- */
    function startTimer() {
      if (!timed || st.over || locked || !st.cur) return;
      stopTimer();
      timerEl.hidden = false; lastTick = performance.now();
      const tick = () => {
        const now = performance.now();
        st.cur.left -= now - lastTick; lastTick = now;
        const s = Math.max(0, Math.ceil(st.cur.left / 1000));
        timerEl.textContent = `⏱ ${s}`;
        timerEl.classList.toggle('low', s <= 5);
        if (st.cur.left <= 0) { stopTimer(); return lock(true); }
        timer = setTimeout(tick, 200);
      };
      tick();
    }
    function stopTimer() { clearTimeout(timer); timer = null; }

    el.addEventListener('click', e => {
      const o = e.target.closest('[data-o]'), j = e.target.closest('[data-j]'), a = e.target.closest('[data-a]');
      if (o) choose(+o.dataset.o);
      else if (j) joker(j.dataset.j);
      else if (a) ({ lock: () => lock(), next, stop })[a.dataset.a]();
    });

    if (st.over) { render(); fb('Diese Runde ist vorbei.'); }
    else {
      if (!st.cur) newQuestion();
      render(); startTimer();
    }
    return {
      key(e) {
        const k = 'abcd1234'.indexOf(e.key.toLowerCase());
        if (k >= 0) { choose(k % 4); e.preventDefault(); }
        else if (e.key === 'Enter') { if (!nextBtn.hidden) next(); else lock(); e.preventDefault(); }
      },
      pause() { stopTimer(); if (!st.over) ctx.save(st); },
      resume() { if (!locked) startTimer(); },
      destroy() { stopTimer(); timers.forEach(clearTimeout); if (!st.over) ctx.save(st); }
    };
  }
};
export default game;

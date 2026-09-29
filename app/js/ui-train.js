/* Onglet Séance : semaine du cycle, récupération, prochaine séance, carnet de séries. */
(function (G) {
  'use strict';
  const U = G.ui, P = G.program, esc = G.esc;
  const restTxt = s => s >= 120 ? (s / 60).toString().replace('.', ',') + ' min' : s + ' s';
  const repsTxt = it => it.timed ? `${it.reps[0]}–${it.reps[1]} s` : `${it.reps[0]}–${it.reps[1]}`;
  const parseNum = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : ''; };
  const lastPerf = h => h.length ? h[h.length - 1].sets.map(s => (s.kg ? G.kg(s.kg) + '×' : '') + s.reps).join(', ') : null;

  function weekCard(p, wk) {
    const toDeload = wk.deload ? 0 : 6 - wk.w;
    return `<section class="card"><div class="row-sb"><div><p class="eyebrow">Cycle ${wk.cycle} · semaine ${wk.w}/6</p><h2 class="h2" style="margin-top:4px">${esc(wk.label.split('· ')[1] || wk.label)}</h2></div>
      <div class="meso" aria-label="Semaine ${wk.w} sur 6">${[1, 2, 3, 4, 5, 6].map(i => `<i class="${i < wk.w ? 'on' : i === wk.w ? 'cur' : ''}"></i>`).join('')}</div></div>
      <div class="row" style="margin-top:10px"><span class="pill acc">Reps en réserve : ${wk.rir}</span>${wk.deload ? '<span class="pill warn">Décharge : moitié des séries, −10 %</span>' : `<span class="pill">Décharge dans ${toDeload} sem.</span>`}<span class="pill">${p.days} séances / sem.</span></div>
      <p class="small muted" style="margin-top:10px">« Reps en réserve » : arrête chaque série quand il te resterait encore ce nombre de répétitions propres.</p></section>`;
  }
  function recoveryCard() {
    const s = G.health.summary(G.store.data.health), r = G.health.recovery(s);
    if (!r || r.level === 'unknown') return '';
    const bits = [];
    if (s.sleepLast) bits.push(`Sommeil ${G.num(s.sleepLast.v, 1)} h`);
    if (s.hrv) bits.push(`VFC ${s.hrv.v} ms${s.hrvBase ? ` (moy. ${Math.round(s.hrvBase)})` : ''}`);
    if (s.rhr) bits.push(`FC repos ${s.rhr.v}${s.rhrBase ? ` (moy. ${Math.round(s.rhrBase)})` : ''}`);
    return `<section class="card recov ${r.level}"><span class="sw" aria-hidden="true"></span><div class="stack-s"><p class="eyebrow">${G.icon('heart')} Récupération · Apple Santé</p><p>${esc(r.text)}</p><p class="tiny muted">${bits.join(' · ')} — indicatif, pas un avis médical.</p></div></section>`;
  }

  function nextSession(p, prog, sessions, wk, has) {
    const idx = U.pick.day != null && prog[U.pick.day] ? U.pick.day : P.nextDay(prog, sessions), day = prog[idx];
    const sets = day.items.reduce((s, it) => s + P.applyWeek(it, wk).sets, 0), min = Math.round(sets * 2.6 + 8);
    return `<section class="card hero"><div class="row-sb"><div><p class="eyebrow">${has ? 'Prochaine séance' : 'Exemple de séance'}</p><h2 class="h1" style="margin-top:6px">${esc(day.name)}</h2><p class="muted">${esc(day.focus)} · ${sets} séries · ≈ ${min} min</p></div></div>
      <div class="seg" role="group" aria-label="Choisir la séance" style="margin-top:12px">${prog.map((d, i) => `<button data-act="pick-day" data-i="${i}" aria-pressed="${i === idx}">${esc(d.name)}</button>`).join('')}</div>
      <div class="day-list" style="margin-top:12px">${day.items.map(it0 => {
        const it = P.applyWeek(it0, wk), m = G.moveById[it.move], h = P.historyOf(it.move, sessions), s = P.suggest(it, h, p, wk), lp = lastPerf(h);
        return `<div class="day-ex">${G.thumb(it.move)}<div><div class="ex-name">${esc(m.name)}</div><div class="ex-meta">${it.sets} × ${repsTxt(it)} · RIR ${it.rir} · repos ${restTxt(it.rest)}</div>
          <div class="ex-meta">${lp ? 'Dernière fois : ' + esc(lp) : 'Jamais fait'}${s.kg ? ` · <b style="color:var(--ink)">${G.kg(s.kg)} kg</b>` : ''}</div></div><span></span></div>`;
      }).join('')}</div>
      <div class="row" style="margin-top:14px">${has ? `<button class="btn" data-act="start" data-i="${idx}">${G.icon('play2')} Commencer la séance</button><button class="btn ghost" data-act="start-free">Séance libre</button>`
        : `<button class="btn" data-act="go-profile">${G.icon('user')} Créer mon profil</button><span class="small muted">Programme d’exemple (4 jours, salle). Il s’adapte à ton profil.</span>`}</div></section>`;
  }

  function recent(sessions) {
    const last = sessions.slice(-3).reverse(); if (!last.length) return '';
    return `<section class="card"><div class="sec-h"><h3 class="h3">Dernières séances</h3><button class="link" data-act="tab" data-v="progres">Tout voir</button></div>
      ${last.map(s => `<div class="log-item"><div class="grow"><b>${esc(s.dayName || 'Séance')}</b><div class="small muted">${G.relDate(s.date)} · ${s.stats?.sets || 0} séries · ${G.num(s.stats?.vol || 0)} kg soulevés</div></div>${(s.prs || []).length ? `<span class="pill hot">${s.prs.length} record${s.prs.length > 1 ? 's' : ''}</span>` : ''}</div>`).join('')}</section>`;
  }

  G.views.seance = () => {
    const has = G.hasProfile(), p = G.profileOrExample(), prog = P.build(p), sessions = G.store.sessionsList(), wk = P.weekInfo(p.start || G.today());
    const d = G.store.draft; if (d && has) return logger(d, p, sessions);
    return `<div class="stack">${has ? '' : `<section class="card hero"><p class="eyebrow">Bienvenue</p><h1 class="h1" style="margin-top:6px">Ton coach muscu & nutrition</h1>
      <p class="lead">Programme de prise de muscle, carnet de séries avec la charge à mettre, animations de chaque mouvement, plan de repas calculé au gramme et import Apple Santé.</p>
      <div class="row" style="margin-top:12px"><button class="btn" data-act="go-profile">Créer mon profil (1 min)</button><button class="btn ghost" data-act="tab" data-v="mouvements">${G.icon('play')} Voir les mouvements</button></div></section>`}
      <div class="cols"><div class="stack">${nextSession(p, prog, sessions, wk, has)}</div><div class="stack">${weekCard(p, wk)}${recoveryCard()}${recent(sessions)}</div></div></div>`;
  };
  G.act['pick-day'] = el => { U.pick.day = +el.dataset.i; G.render(); };

  /* ---------- Démarrer ---------- */
  function exEntry(it, p, wk, sessions) {
    const h = P.historyOf(it.move, sessions), s = P.suggest(it, h, p, wk);
    return { move: it.move, slot: it.slot, target: { sets: it.sets, reps: it.reps, rir: it.rir, rest: it.rest, timed: !!it.timed }, sugg: s,
      sets: Array.from({ length: it.sets }, () => ({ kg: s.kg ?? '', reps: '', rir: '', done: false })), note: '' };
  }
  G.act.start = el => {
    const p = G.store.profile, prog = P.build(p), sessions = G.store.sessionsList(), wk = P.weekInfo(p.start || G.today()), day = prog[+el.dataset.i];
    const d = { id: G.uid(), dayKey: day.key, dayName: day.name, date: G.today(), startedAt: new Date().toISOString(), week: { w: wk.w, rir: wk.rir, cycle: wk.cycle, deload: !!wk.deload },
      exercises: day.items.map(it => exEntry(P.applyWeek(it, wk), p, wk, sessions)), notes: '' };
    U.pick.day = null; G.store.put('drafts', 'current', d); window.scrollTo(0, 0);
  };
  G.act['start-free'] = () => { G.store.put('drafts', 'current', { id: G.uid(), dayKey: null, dayName: 'Séance libre', date: G.today(), startedAt: new Date().toISOString(), week: null, exercises: [], notes: '' }); };

  /* ---------- Carnet ---------- */
  function exCard(ex, i, d, p, sessions) {
    const m = G.moveById[ex.move], t = ex.target, h = P.historyOf(ex.move, sessions), lp = lastPerf(h), s = ex.sugg || {};
    const allDone = ex.sets.length && ex.sets.every(x => x.done), firstCompound = d.exercises.findIndex(e => G.moveById[e.move]?.kind === 'compound') === i;
    const wu = firstCompound && s.kg ? P.warmups(s.kg, m) : [];
    const alts = ex.slot ? P.alternatives(ex.slot, p.equip) : [];
    const ph = t.timed ? 'sec' : 'reps';
    return `<article class="ex-card ${allDone ? 'done' : ''}"><div class="ex-head">${G.thumb(ex.move)}<div><div class="ex-name">${esc(m.name)}</div>
      <div class="ex-meta">${t.sets} × ${repsTxt(t)} · RIR ${t.rir ?? '–'} · repos ${restTxt(t.rest || 90)}</div><div class="ex-meta">${lp ? 'Dernière fois : ' + esc(lp) : 'Première fois'}</div></div></div>
      ${s.note ? `<p class="sugg">${s.up ? '<span class="pill good">▲ Charge</span> ' : ''}${s.kg ? `<b>${G.kg(s.kg)} kg</b> · ` : ''}${esc(s.note)}</p>` : ''}
      ${m.equip === 'barre' && s.kg ? G.plateChips(s.kg) : ''}
      ${wu.length ? `<p class="small muted">Échauffement : ${wu.map(w => `${G.kg(w.kg)} kg × ${w.reps}`).join(' · ')}</p>` : ''}
      <div class="sets" role="table" aria-label="Séries"><div class="set hdr" role="row"><span>#</span><span>${m.equip === 'pdc' ? 'Lest kg' : 'Kg'}</span><span>${t.timed ? 'Secondes' : 'Reps'}</span><span>RIR</span><span></span></div>
      ${ex.sets.map((x, j) => `<div class="set ${x.done ? 'is-done' : ''}" role="row"><span class="n">${j + 1}</span>
        <input id="k${i}_${j}" type="text" inputmode="decimal" data-act="set-f" data-draft="1" data-ex="${i}" data-s="${j}" data-f="kg" value="${esc(x.kg)}" placeholder="${s.kg ? G.kg(s.kg) : '–'}" aria-label="Charge série ${j + 1}">
        <input id="r${i}_${j}" type="text" inputmode="numeric" data-act="set-f" data-draft="1" data-ex="${i}" data-s="${j}" data-f="reps" value="${esc(x.reps)}" placeholder="${s.reps || t.reps[1]}" aria-label="${ph} série ${j + 1}">
        <select id="q${i}_${j}" data-act="set-f" data-ex="${i}" data-s="${j}" data-f="rir" aria-label="Reps en réserve série ${j + 1}"><option value="">–</option>${[0, 1, 2, 3, 4].map(v => `<option ${String(x.rir) === String(v) ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="ok" data-act="set-ok" data-ex="${i}" data-s="${j}" aria-label="Valider la série ${j + 1}" aria-pressed="${!!x.done}">${G.icon('check')}</button></div>`).join('')}</div>
      <div class="row"><button class="btn ghost sm" data-act="set-add" data-ex="${i}">${G.icon('plus')} Série</button>${ex.sets.length > 1 ? `<button class="btn ghost sm" data-act="set-del" data-ex="${i}">− Série</button>` : ''}
        ${alts.length > 1 ? `<label class="row small" style="gap:6px">${G.icon('swap')}<select id="sw${i}" data-act="ex-swap" data-ex="${i}" aria-label="Remplacer l’exercice" style="min-height:36px;width:auto">${alts.map(a => `<option value="${a}" ${a === ex.move ? 'selected' : ''}>${esc(G.moveById[a].name)}</option>`).join('')}</select></label>` : ''}
        <button class="btn ghost sm" data-act="ex-del" data-ex="${i}" aria-label="Retirer cet exercice">${G.icon('trash')}</button></div></article>`;
  }

  function logger(d, p, sessions) {
    const min = Math.max(0, Math.round((Date.now() - Date.parse(d.startedAt)) / 60000));
    const done = d.exercises.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0), total = d.exercises.reduce((s, e) => s + e.sets.length, 0);
    return `<div class="stack"><section class="card hero"><p class="eyebrow">Séance en cours · ${min} min${d.week ? ` · semaine ${d.week.w}, RIR ${d.week.rir}` : ''}</p><h1 class="h1" style="margin-top:6px">${esc(d.dayName)}</h1>
      <p class="muted">${done}/${total} séries validées. Touche une vignette pour revoir le mouvement.</p>
      <div class="row" style="margin-top:12px"><button class="btn" data-act="finish">${G.icon('check')} Terminer la séance</button>${U.confirmCancel ? `<span class="small">Supprimer cette séance ?</span><button class="btn hot sm" data-act="cancel-yes">Oui, supprimer</button><button class="btn ghost sm" data-act="cancel-no">Non</button>` : `<button class="btn ghost" data-act="cancel">Abandonner</button>`}</div></section>
      <div class="cols"><div class="stack">${d.exercises.map((ex, i) => exCard(ex, i, d, p, sessions)).join('') || '<p class="empty">Ajoute un exercice pour commencer.</p>'}</div>
      <div class="stack"><section class="card"><h3 class="h3">Ajouter un exercice</h3><select id="addex" data-act="ex-add" style="margin-top:10px"><option value="">Choisir…</option>${G.LIB_GROUPS.map(g => `<optgroup label="${g.name}">${G.moves.filter(m => m.group === g.id).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</optgroup>`).join('')}</select></section>
      <section class="card"><label class="field"><span>Notes de séance</span><textarea id="dnotes" data-act="d-notes" data-draft="1" placeholder="Sensations, réglages machine, douleur éventuelle…">${esc(d.notes)}</textarea></label></section></div></div></div>`;
  }

  let saveT = 0;
  const saveDraft = (d, now) => { G.store.data.drafts = Object.assign({}, G.store.data.drafts, { current: d }); clearTimeout(saveT); if (now) G.store.put('drafts', 'current', d); else saveT = setTimeout(() => G.store.put('drafts', 'current', d), 700); };
  G.act['set-f'] = el => { const d = G.store.draft, x = d.exercises[+el.dataset.ex].sets[+el.dataset.s]; x[el.dataset.f] = el.value; saveDraft(d, el.tagName === 'SELECT'); };
  G.act['set-ok'] = el => {
    const d = G.store.draft, ex = d.exercises[+el.dataset.ex], x = ex.sets[+el.dataset.s];
    if (!x.done) {
      if (x.reps === '' || x.reps == null) x.reps = String(ex.sugg?.reps || ex.target.reps[1]);
      if ((x.kg === '' || x.kg == null) && ex.sugg?.kg) x.kg = String(ex.sugg.kg);
      x.done = true; G.startRest(ex.target.rest || 90);
      const nx = ex.sets[+el.dataset.s + 1]; if (nx && (nx.kg === '' || nx.kg == null) && x.kg !== '') nx.kg = x.kg;
    } else x.done = false;
    saveDraft(d, true); G.render();
  };
  G.act['set-add'] = el => { const d = G.store.draft, ex = d.exercises[+el.dataset.ex], last = ex.sets[ex.sets.length - 1]; ex.sets.push({ kg: last ? last.kg : '', reps: '', rir: '', done: false }); saveDraft(d, true); G.render(); };
  G.act['set-del'] = el => { const d = G.store.draft, ex = d.exercises[+el.dataset.ex]; ex.sets.pop(); saveDraft(d, true); G.render(); };
  G.act['ex-del'] = el => { const d = G.store.draft; d.exercises.splice(+el.dataset.ex, 1); saveDraft(d, true); G.render(); };
  G.act['ex-swap'] = el => {
    const d = G.store.draft, ex = d.exercises[+el.dataset.ex], p = G.store.profile, wk = P.weekInfo(p.start || G.today());
    const n = exEntry(Object.assign({}, ex.target, { move: el.value, slot: ex.slot }), p, wk, G.store.sessionsList()); n.target = ex.target;
    d.exercises[+el.dataset.ex] = n; saveDraft(d, true); G.render();
  };
  G.act['ex-add'] = el => {
    if (!el.value) return; const d = G.store.draft, m = G.moveById[el.value], p = G.store.profile, wk = P.weekInfo(p.start || G.today());
    const rk = m.kind === 'compound' ? 'sec' : 'iso', it = { move: m.id, slot: null, sets: 3, reps: m.timed ? [30, 60] : P.REPS[rk].slice(), rk, rest: rk === 'sec' ? 120 : 90, rir: wk.rir, timed: !!m.timed };
    d.exercises.push(exEntry(it, p, wk, G.store.sessionsList())); saveDraft(d, true); G.render();
  };
  G.act['d-notes'] = el => { const d = G.store.draft; d.notes = el.value; saveDraft(d); };
  G.act.cancel = () => { U.confirmCancel = true; G.render(); };
  G.act['cancel-no'] = () => { U.confirmCancel = false; G.render(); };
  G.act['cancel-yes'] = () => { U.confirmCancel = false; U.rest = null; G.store.del('drafts', 'current'); G.toast('Séance supprimée.'); };

  G.act.finish = () => {
    const d = G.store.draft, sessions = G.store.sessionsList(), before = P.bests(sessions);
    const exercises = d.exercises.map(ex => ({ move: ex.move, sets: ex.sets.filter(x => x.done).map(x => ({ kg: parseNum(x.kg), reps: parseNum(x.reps), rir: x.rir === '' ? '' : +x.rir })) })).filter(e => e.sets.length);
    if (!exercises.length) { G.toast('Valide au moins une série (bouton ✓) avant de terminer.'); return; }
    const prs = exercises.map(ex => { const b = P.bestSet(ex.sets), prev = before[ex.move]?.v || 0; return prev > 0 && b.v > prev * 1.001 ? { move: ex.move, v: Math.round(b.v * 10) / 10, prev: Math.round(prev * 10) / 10, kg: b.s.kg, reps: b.s.reps } : null; }).filter(Boolean);
    const s = { dayKey: d.dayKey, dayName: d.dayName, date: d.date, startedAt: d.startedAt, endedAt: new Date().toISOString(), week: d.week, exercises, notes: d.notes || '', prs };
    s.stats = Object.assign(P.sessionStats(s), { min: Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60000) });
    G.store.put('sessions', d.id, s); G.store.del('drafts', 'current'); U.rest = null;
    G.openSheet(`<div class="sheet-top"><h2 class="h2">Séance terminée</h2><button class="icon-btn" data-close aria-label="Fermer">${G.icon('x')}</button></div>
      <div class="tiles"><div class="tile"><span class="tile-l">Durée</span><span class="tile-v">${s.stats.min} min</span></div><div class="tile"><span class="tile-l">Séries</span><span class="tile-v">${s.stats.sets}</span></div>
      <div class="tile"><span class="tile-l">Tonnage</span><span class="tile-v">${G.num(s.stats.vol)} kg</span></div><div class="tile"><span class="tile-l">Records</span><span class="tile-v">${prs.length}</span></div></div>
      ${prs.length ? `<div class="stack-s" style="margin-top:14px">${prs.map(r => `<p class="note hot">▲ <b>${esc(G.moveById[r.move].name)}</b> : ${G.kg(r.kg)} kg × ${r.reps} — 1RM estimé ${G.kg(r.v)} kg (avant ${G.kg(r.prev)} kg)</p>`).join('')}</div>` : '<p class="note" style="margin-top:14px">Pas de record cette fois : la régularité fait le travail. Prochaine séance, vise +1 rep ou +1 palier de charge.</p>'}
      <p class="small muted" style="margin-top:12px">Pense à manger un repas avec protéines et glucides dans les prochaines heures.</p>`);
  };
})(window.GYM = window.GYM || {});

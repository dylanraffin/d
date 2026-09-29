/* Onglet Progrès : tuiles, 1RM estimé, volume par muscle, poids, santé, revue du mois, records, historique. */
(function (G) {
  'use strict';
  const U = G.ui, P = G.program, esc = G.esc;

  function e1rmSeries(sessions, move) {
    const by = {};
    for (const s of sessions) for (const ex of s.exercises || []) if (ex.move === move) { const v = P.bestSet(ex.sets || []).v; if (v) by[s.date] = Math.max(by[s.date] || 0, v); }
    return Object.entries(by).map(([x, y]) => ({ x, y: Math.round(y * 10) / 10 })).sort((a, b) => a.x.localeCompare(b.x));
  }
  function movesUsed(sessions) {
    const n = {}; for (const s of sessions) for (const ex of s.exercises || []) if (G.moveById[ex.move]) n[ex.move] = (n[ex.move] || 0) + (G.moveById[ex.move].kind === 'compound' ? 2 : 1);
    return Object.keys(n).sort((a, b) => n[b] - n[a]);
  }
  const tableBtn = id => `<button class="link" data-act="toggle-table" data-id="${id}">${U.table[id] ? 'Voir le graphique' : 'Voir le tableau'}</button>`;

  G.views.progres = () => {
    const sessions = G.store.sessionsList(), p = G.profileOrExample(), today = G.today();
    const s30 = sessions.filter(s => s.date >= G.addDays(today, -29)), wkS = G.weekStart(today);
    const setsWeek = sessions.filter(s => s.date >= wkS).reduce((n, s) => n + (s.stats?.sets || 0), 0);
    const prs30 = s30.reduce((n, s) => n + (s.prs || []).length, 0);
    const hd = G.health.flatDays(G.store.data.health), ws = G.nutri.weightSeries(G.store.data.days, hd), tr = G.nutri.trend(ws);
    const planned = Math.round((+p.days || 4) * 30 / 7);
    const tiles = `<div class="tiles">
      <div class="tile"><span class="tile-l">Séances · 30 jours</span><span class="tile-v">${s30.length}</span><span class="tile-d">objectif ≈ ${planned}</span></div>
      <div class="tile"><span class="tile-l">Séries · cette semaine</span><span class="tile-v">${setsWeek}</span><span class="tile-d">depuis lundi</span></div>
      <div class="tile"><span class="tile-l">Records · 30 jours</span><span class="tile-v">${prs30}</span><span class="tile-d">1RM estimés battus</span></div>
      <div class="tile"><span class="tile-l">Poids · moyenne 7 j</span><span class="tile-v">${tr.last ? G.num(tr.last, 1) : '–'}</span><span class="tile-d ${tr.ready ? (tr.delta >= 0 ? 'up' : 'down') : ''}">${tr.ready ? (tr.delta >= 0 ? '+' : '') + G.num(tr.delta, 2) + ' kg / sem.' : 'pèse-toi 3×/sem.'}</span></div></div>`;
    if (!sessions.length && !ws.length) return `<div class="stack">${tiles}<section class="card"><h2 class="h2">Tes progrès s’afficheront ici</h2><p class="lead">Après ta première séance : courbe de force par exercice (1RM estimé), volume par muscle, records et revue du mois. Pèse-toi le matin dans l’onglet Nutrition, ou importe Apple Santé depuis ton profil.</p><div class="row" style="margin-top:12px"><button class="btn" data-act="tab" data-v="seance">Aller à la séance</button></div></section></div>`;

    const used = movesUsed(sessions), sel = used.includes(U.progMove) ? U.progMove : used[0];
    const rv = P.review(sessions, p), bests = P.bests(sessions);
    const recRows = Object.entries(bests).filter(([id]) => G.moveById[id]).sort((a, b) => b[1].v - a[1].v);
    const hasHealth = Object.values(hd).some(v => v.sleep || v.rhr);
    const pct = x => (x >= 0 ? '+' : '') + G.num(x * 100, 1) + ' %';
    return `<div class="stack">${tiles}<div class="cols"><div class="stack">
      ${sel ? `<section class="card"><div class="sec-h"><h3 class="h3">Force : 1RM estimé</h3>${tableBtn('e1rm')}</div>
        <select id="progmove" data-act="prog-move" aria-label="Exercice">${used.map(id => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(G.moveById[id].name)}</option>`).join('')}</select>
        <div id="ch-e1rm" style="margin-top:10px"></div><p class="tiny muted">Charge × (1 + (reps + reps en réserve) / 30). Sert à comparer tes séances entre elles, pas à tester ton max.</p></section>` : ''}
      <section class="card"><div class="sec-h"><h3 class="h3">Volume de la semaine par muscle</h3><span class="small muted">depuis ${G.fmtDate(wkS)}</span></div><div id="ch-vol"></div></section>
      <section class="card"><div class="sec-h"><h3 class="h3">Poids corporel</h3>${tableBtn('w')}</div><div id="ch-w"></div>
        <div class="legend"><span><i class="dot" style="background:var(--muted)"></i>Pesées</span><span><i style="background:var(--series-1)"></i>Moyenne sur 7 jours</span></div></section>
      ${hasHealth ? `<section class="card"><div class="sec-h"><h3 class="h3">Sommeil & cœur · Apple Santé</h3><span class="small muted">30 jours</span></div><div id="ch-sleep"></div><div class="legend"><span><i style="background:var(--series-1)"></i>Sommeil (h)</span></div><div id="ch-rhr" style="margin-top:14px"></div><div class="legend"><span><i style="background:var(--series-2)"></i>FC au repos (bpm)</span></div></section>` : ''}
    </div><div class="stack">
      <section class="card"><h3 class="h3">Revue des 30 derniers jours</h3><div class="stack-s" style="margin-top:10px">
        ${G.meter('Régularité', rv.count, rv.planned, ' séances')}
        ${rv.top.length ? `<p class="small"><b>Meilleurs progrès :</b> ${rv.top.map(t => `${esc(G.moveById[t.id]?.name || t.id)} ${pct(t.pct)}`).join(' · ')}</p>` : ''}
        ${rv.stall.length ? `<p class="note warn"><b>Stagnation</b> sur ${rv.stall.map(id => esc(G.moveById[id]?.name || id)).join(', ')} (3 séances sans progrès). Vérifie d’abord sommeil et calories, puis baisse la charge de 10 % et remonte, ou passe à une variante.</p>` : '<p class="note good">Aucune stagnation détectée.</p>'}
        ${rv.adherence < .75 && rv.planned ? '<p class="small muted">Moins de 3 séances sur 4 réalisées : un programme de 3 jours serait peut-être plus tenable avec ton emploi du temps.</p>' : ''}</div></section>
      <section class="card"><h3 class="h3">Records</h3>${recRows.length ? `<div class="tscroll" style="margin-top:8px"><table class="t"><thead><tr><th>Exercice</th><th class="r">1RM est.</th><th class="r">Date</th></tr></thead><tbody>
        ${recRows.slice(0, 14).map(([id, b]) => `<tr><td>${esc(G.moveById[id].name)}</td><td class="r">${G.kg(Math.round(b.v * 10) / 10)} kg</td><td class="r">${G.fmtDate(b.date, { wd: false })}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Pas encore de records.</p>'}</section>
      <section class="card"><h3 class="h3">Historique</h3><div style="margin-top:6px">${sessions.slice().reverse().slice(0, 30).map(s => `<details class="log-item" style="display:block"><summary>${esc(s.dayName || 'Séance')} · ${G.fmtDate(s.date)} <span class="small muted">· ${s.stats?.sets || 0} séries · ${s.stats?.min ?? '?'} min</span></summary>
        <div class="stack-s small" style="margin:8px 0">${(s.exercises || []).map(ex => `<div><b>${esc(G.moveById[ex.move]?.name || ex.move)}</b> <span class="muted">${ex.sets.map(x => (x.kg ? G.kg(x.kg) + '×' : '') + x.reps + (x.rir !== '' && x.rir != null ? ' @' + x.rir : '')).join(' · ')}</span></div>`).join('')}
        ${s.notes ? `<p class="muted">« ${esc(s.notes)} »</p>` : ''}
        ${U.confirmDel === s.id ? `<div class="row"><span>Supprimer ?</span><button class="btn hot sm" data-act="sess-del-yes" data-id="${s.id}">Supprimer</button><button class="btn ghost sm" data-act="sess-del-no">Annuler</button></div>` : `<button class="link" data-act="sess-del" data-id="${s.id}">Supprimer cette séance</button>`}</div></details>`).join('') || '<p class="empty">Aucune séance.</p>'}</div></section>
    </div></div></div>`;
  };

  G.binds.progres = root => {
    const sessions = G.store.sessionsList(), today = G.today(), used = movesUsed(sessions), sel = used.includes(U.progMove) ? U.progMove : used[0];
    const e = root.querySelector('#ch-e1rm');
    if (e && sel) {
      const pts = e1rmSeries(sessions, sel);
      if (U.table.e1rm) e.innerHTML = `<div class="tscroll"><table class="t"><thead><tr><th>Date</th><th class="r">1RM estimé</th></tr></thead><tbody>${pts.slice().reverse().map(q => `<tr><td>${G.fmtDate(q.x, { y: true })}</td><td class="r">${G.kg(q.y)} kg</td></tr>`).join('')}</tbody></table></div>`;
      else G.charts.line(e, { label: '1RM estimé', series: [{ name: '1RM estimé', color: 'var(--series-1)', points: pts, dots: pts.length < 25 ? 'all' : 'end', area: true }], yFmt: v => G.kg(v), endLabel: true, pad: 2 });
    }
    const v = root.querySelector('#ch-vol');
    if (v) { const vol = P.weeklyVolume(sessions, G.weekStart(today), today); G.charts.bars(v, G.VOLUME_GROUPS.map(g => ({ label: g.name, v: vol[g.id], lo: 10, hi: 20 })), { max: 24, legend: 'Zone conseillée : 10 à 20 séries dures par semaine (muscle principal = 1 série, secondaire = 0,5).' }); }
    const w = root.querySelector('#ch-w');
    if (w) {
      const ws = G.nutri.weightSeries(G.store.data.days, G.health.flatDays(G.store.data.health)).filter(q => q.date >= G.addDays(today, -120));
      if (U.table.w) w.innerHTML = `<div class="tscroll"><table class="t"><thead><tr><th>Date</th><th class="r">Poids</th><th>Source</th></tr></thead><tbody>${ws.slice().reverse().map(q => `<tr><td>${G.fmtDate(q.date, { y: true })}</td><td class="r">${G.num(q.kg, 1)} kg</td><td>${q.src}</td></tr>`).join('')}</tbody></table></div>`;
      else G.charts.line(w, { label: 'Poids corporel', empty: 'Aucune pesée pour l’instant.', series: [{ name: 'Pesée', color: 'var(--muted)', points: ws.map(q => ({ x: q.date, y: q.kg })), line: false, dots: 'small' }, { name: 'Moyenne 7 j', color: 'var(--series-1)', points: G.nutri.movingAvg(ws).map(q => ({ x: q.date, y: +q.kg.toFixed(2) })) }], yFmt: x => G.num(x, 1), tipFmt: x => G.num(x, 1) + ' kg', endLabel: true, pad: .3 });
    }
    const hd = G.health.flatDays(G.store.data.health), from = G.addDays(today, -30), keys = Object.keys(hd).filter(d => d >= from).sort();
    const sl = root.querySelector('#ch-sleep'); if (sl) G.charts.line(sl, { label: 'Sommeil', height: 150, series: [{ name: 'Sommeil', color: 'var(--series-1)', points: keys.filter(d => hd[d].sleep).map(d => ({ x: d, y: hd[d].sleep })), dots: 'all' }], yFmt: x => G.num(x, 1), tipFmt: x => G.num(x, 1) + ' h', yMin: 4 });
    const rh = root.querySelector('#ch-rhr'); if (rh) G.charts.line(rh, { label: 'FC au repos', height: 150, series: [{ name: 'FC au repos', color: 'var(--series-2)', points: keys.filter(d => hd[d].rhr).map(d => ({ x: d, y: hd[d].rhr })), dots: 'all' }], tipFmt: x => x + ' bpm', pad: 2 });
  };
  G.act['prog-move'] = el => { U.progMove = el.value; G.render(); };
  G.act['toggle-table'] = el => { U.table[el.dataset.id] = !U.table[el.dataset.id]; G.forceRender(); };
  G.act['sess-del'] = el => { U.confirmDel = el.dataset.id; G.render(); };
  G.act['sess-del-no'] = () => { U.confirmDel = null; G.render(); };
  G.act['sess-del-yes'] = el => { U.confirmDel = null; G.store.del('sessions', el.dataset.id); G.toast('Séance supprimée.'); };
})(window.GYM = window.GYM || {});

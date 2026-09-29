/* Onglet Progrès : tuiles avec tendance, force (petits multiples + détail avec records), volume réalisé / prévu,
   poids avec zone cible projetée, sommeil et cœur (Apple Santé), revue du mois, records, historique. */
(function (G) {
  'use strict';
  const U = G.ui, P = G.program, C = () => G.charts, esc = G.esc;

  function e1rmSeries(sessions, move) {
    const by = {};
    for (const s of sessions) for (const ex of s.exercises || []) if (ex.move === move) { const v = P.bestSet(ex.sets || [], move).v; if (v) by[s.date] = Math.max(by[s.date] || 0, v); }
    let best = 0;
    return Object.entries(by).sort((a, b) => a[0].localeCompare(b[0])).map(([x, y], i) => { const pr = i > 0 && y > best * 1.001; best = Math.max(best, y); return { x, y: Math.round(y * 10) / 10, pr }; });
  }
  function movesUsed(sessions) {
    const n = {}; for (const s of sessions) for (const ex of s.exercises || []) if (G.moveById[ex.move]) n[ex.move] = (n[ex.move] || 0) + (G.moveById[ex.move].kind === 'compound' ? 2 : 1);
    return Object.keys(n).sort((a, b) => n[b] - n[a]);
  }
  function perWeek(sessions, weeks, today) {
    const w0 = G.weekStart(today), out = [];
    for (let k = weeks - 1; k >= 0; k--) { const a = G.addDays(w0, -7 * k), b = G.addDays(a, 6); out.push(sessions.filter(s => s.date >= a && s.date <= b).length); }
    return out;
  }
  function plannedVolume(profile) {
    const res = Object.fromEntries(G.VOLUME_GROUPS.map(g => [g.id, 0]));
    for (const d of P.build(profile)) for (const it of d.items) {
      const m = G.moveById[it.move]; if (!m) continue;
      for (const g of G.VOLUME_GROUPS) { if (g.m.some(x => m.muscles.p.includes(x))) res[g.id] += it.sets; else if (g.m.some(x => (m.muscles.s || []).includes(x))) res[g.id] += it.sets * .5; }
    }
    return res;
  }
  const pct = x => (x >= 0 ? '+' : '−') + G.num(Math.abs(x) * 100, 1) + ' %';
  const tableBtn = id => `<button class="link" data-act="toggle-table" data-id="${id}">${U.table[id] ? 'Voir le graphique' : 'Voir le tableau'}</button>`;

  function tiles(ctx) {
    const { sessions, today, p, tr, ws } = ctx;
    const s30 = sessions.filter(s => s.date >= G.addDays(today, -29)), prev30 = sessions.filter(s => s.date >= G.addDays(today, -59) && s.date < G.addDays(today, -29));
    const wk = G.weekStart(today), setsWeek = sessions.filter(s => s.date >= wk).reduce((n, s) => n + (s.stats?.sets || 0), 0);
    const planned = P.build(p).reduce((n, d) => n + d.items.reduce((k, it) => k + it.sets, 0), 0);
    const prs30 = s30.reduce((n, s) => n + (s.prs || []).length, 0);
    const avg = G.nutri.movingAvg(ws).filter(q => q.date >= G.addDays(today, -56)), goal = p.goal || 'bulk';
    const good = tr.ready && ((goal === 'cut' && tr.delta < 0) || (goal !== 'cut' && goal !== 'recomp' && tr.delta > 0) || (goal === 'recomp' && Math.abs(tr.delta) < .25));
    const dSess = s30.length - prev30.length;
    return `<div class="tiles">
      <div class="tile"><span class="tile-l">Séances · 30 jours</span><div class="tile-row"><span class="tile-v">${s30.length}</span>${C().spark(perWeek(sessions, 12, today))}</div><span class="tile-d ${dSess > 0 ? 'up' : dSess < 0 ? 'down' : ''}">${prev30.length || s30.length ? (dSess >= 0 ? '+' : '−') + Math.abs(dSess) + ' vs 30 j d’avant' : 'objectif ≈ ' + Math.round((+p.days || 4) * 30 / 7)}</span></div>
      <div class="tile"><span class="tile-l">Séries · cette semaine</span><span class="tile-v">${setsWeek}</span><div class="meter-t mini" aria-hidden="true"><i style="width:${planned ? Math.min(100, setsWeek / planned * 100) : 0}%"></i></div><span class="tile-d">sur ${planned} prévues</span></div>
      <div class="tile"><span class="tile-l">Records · 30 jours</span><span class="tile-v">${prs30}</span><span class="tile-d">1RM estimés battus</span></div>
      <div class="tile"><span class="tile-l">Poids · moyenne 7 j</span><div class="tile-row"><span class="tile-v">${tr.last ? G.num(tr.last, 1) : '–'}</span>${C().spark(avg.filter((_, i) => i % 4 === 0 || i === avg.length - 1).map(q => q.kg))}</div><span class="tile-d ${tr.ready ? (good ? 'up' : 'down') : ''}">${tr.ready ? (tr.delta >= 0 ? '+' : '−') + G.num(Math.abs(tr.delta), 2) + ' kg / sem.' : 'pèse-toi 3 fois par semaine'}</span></div></div>`;
  }

  G.views.progres = () => {
    const sessions = G.store.sessionsList(), p = G.profileOrExample(), today = G.today();
    const hd = G.health.flatDays(G.store.data.health), ws = G.nutri.weightSeries(G.store.data.days, hd), tr = G.nutri.trend(ws);
    const ctx = { sessions, today, p, tr, ws };
    if (!sessions.length && !ws.length) return `<div class="stack">${tiles(ctx)}<section class="card"><h2 class="h2">Tes progrès s’afficheront ici</h2><p class="lead">Après ta première séance : force par exercice (1RM estimé), volume par muscle comparé à ton programme, records et revue du mois. Pèse-toi le matin dans l’onglet Nutrition, ou importe Apple Santé depuis ton profil.</p><div class="row" style="margin-top:12px"><button class="btn" data-act="tab" data-v="seance">Aller à la séance</button></div></section></div>`;
    const used = movesUsed(sessions), main = used.filter(id => G.moveById[id].kind === 'compound').slice(0, 6);
    const sel = used.includes(U.progMove) ? U.progMove : (main[0] || used[0]);
    const rv = P.review(sessions, p), bests = P.bests(sessions);
    const recRows = Object.entries(bests).filter(([id]) => G.moveById[id]).sort((a, b) => b[1].v - a[1].v);
    const hasHealth = Object.values(hd).some(v => v.sleep || v.rhr || v.hrv);
    const smalls = main.map(id => {
      const pts = e1rmSeries(sessions, id), last = pts[pts.length - 1], base = pts.find(q => q.x >= G.addDays(today, -30)) || pts[0];
      const d = base && last && base !== last ? (last.y - base.y) / base.y : null;
      return `<button class="mul ${id === sel ? 'on' : ''}" data-act="prog-move" data-v="${id}" aria-pressed="${id === sel}"><span class="mul-h">${esc(G.moveById[id].name)}</span>
        <span class="mul-v">${last ? G.kg(last.y) : '–'} <small>kg</small></span><span class="mul-d ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d == null ? 'une seule séance' : pct(d) + ' · 30 j'}</span><span class="mul-c" data-mini="${id}"></span></button>`;
    }).join('');
    return `<div class="stack">${tiles(ctx)}<div class="cols"><div class="stack">
      ${sel ? `<section class="card"><div class="sec-h"><h3 class="h3">Force par exercice</h3><span class="small muted">1RM estimé</span></div>
        ${smalls ? `<div class="muls">${smalls}</div>` : ''}
        <div class="sec-h" style="margin-top:14px"><select id="progmove" data-act="prog-move" aria-label="Exercice" style="width:auto;max-width:100%">${used.map(id => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(G.moveById[id].name)}</option>`).join('')}</select>${tableBtn('e1rm')}</div>
        <div id="ch-e1rm"></div><div class="legend"><span><i style="background:var(--series-1)"></i>1RM estimé</span><span><i class="dot ring"></i>Record</span></div>
        <p class="tiny muted" style="margin-top:6px">Charge × (1 + (reps + reps en réserve) / 30), poids du corps compris pour tractions, dips et pompes. Sert à comparer tes séances entre elles, pas à tester ton max.</p></section>` : ''}
      <section class="card"><div class="sec-h"><h3 class="h3">Volume de la semaine</h3><span class="small muted">depuis ${G.fmtDate(G.weekStart(today))}</span></div><div id="ch-vol"></div></section>
      <section class="card"><div class="sec-h"><h3 class="h3">Poids corporel</h3>${tableBtn('w')}</div><div id="ch-w"></div>
        <div class="legend"><span><i class="dot" style="background:var(--muted)"></i>Pesées</span><span><i style="background:var(--series-1)"></i>Moyenne sur 7 jours</span><span><i class="k-zone"></i>Zone visée par ton objectif</span></div></section>
      ${hasHealth ? `<section class="card"><div class="sec-h"><h3 class="h3">Sommeil et récupération</h3><span class="small muted">Apple Santé · 30 jours</span></div>
        <div class="grid2"><div><p class="small"><b>Sommeil</b> <span class="muted">heures par nuit</span></p><div id="ch-sleep"></div></div>
        <div><p class="small"><b>FC au repos</b> <span class="muted">bpm</span></p><div id="ch-rhr"></div></div>
        <div><p class="small"><b>Variabilité cardiaque</b> <span class="muted">ms</span></p><div id="ch-hrv"></div></div></div>
        <p class="tiny muted" style="margin-top:6px">Zone grise : ta fourchette habituelle sur 30 jours. Indicatif, pas un avis médical.</p></section>` : ''}
    </div><div class="stack">
      <section class="card"><h3 class="h3">Revue des 30 derniers jours</h3><div class="stack-s" style="margin-top:10px">
        ${G.meter('Régularité', rv.count, rv.planned, ' séances')}
        ${rv.top.length ? `<p class="small"><b>Meilleurs progrès :</b> ${rv.top.map(t => `${esc(G.moveById[t.id]?.name || t.id)} ${pct(t.pct)}`).join(' · ')}</p>` : ''}
        ${rv.stall.length ? `<p class="note warn"><b>Stagnation</b> sur ${rv.stall.map(id => esc(G.moveById[id]?.name || id)).join(', ')} (3 séances sans progrès). Vérifie d’abord sommeil et calories, puis baisse la charge de 10 % et remonte, ou passe à une variante.</p>` : '<p class="note good">Aucune stagnation détectée.</p>'}
        ${rv.adherence < .75 && rv.planned ? '<p class="small muted">Moins de 3 séances sur 4 réalisées : un programme de 3 jours serait peut-être plus tenable avec ton emploi du temps.</p>' : ''}</div></section>
      <section class="card"><h3 class="h3">Records</h3>${recRows.length ? `<div style="margin-top:8px">${C().table([{ h: 'Exercice' }, { h: '1RM est.', r: 1 }, { h: 'Date', r: 1 }], recRows.slice(0, 14).map(([id, b]) => [G.moveById[id].name, G.kg(Math.round(b.v * 10) / 10) + ' kg', G.fmtDate(b.date, { wd: false })]))}</div>` : '<p class="empty">Pas encore de records.</p>'}</section>
      <section class="card"><h3 class="h3">Historique</h3><div style="margin-top:6px">${sessions.slice().reverse().slice(0, 30).map(s => `<details class="log-item" style="display:block"><summary>${esc(s.dayName || 'Séance')} · ${G.fmtDate(s.date)} <span class="small muted">· ${s.stats?.sets || 0} séries · ${s.stats?.min ?? '?'} min</span></summary>
        <div class="stack-s small" style="margin:8px 0">${(s.exercises || []).map(ex => `<div><b>${esc(G.moveById[ex.move]?.name || ex.move)}</b> <span class="muted">${ex.sets.map(x => (x.kg ? G.kg(x.kg) + '×' : '') + x.reps + (x.rir !== '' && x.rir != null ? ' @' + x.rir : '')).join(' · ')}</span></div>`).join('')}
        ${s.notes ? `<p class="muted">« ${esc(s.notes)} »</p>` : ''}
        ${U.confirmDel === s.id ? `<div class="row"><span>Supprimer ?</span><button class="btn hot sm" data-act="sess-del-yes" data-id="${s.id}">Supprimer</button><button class="btn ghost sm" data-act="sess-del-no">Annuler</button></div>` : `<button class="link" data-act="sess-del" data-id="${s.id}">Supprimer cette séance</button>`}</div></details>`).join('') || '<p class="empty">Aucune séance.</p>'}</div></section>
    </div></div></div>`;
  };

  G.binds.progres = root => {
    const sessions = G.store.sessionsList(), today = G.today(), p = G.profileOrExample(), used = movesUsed(sessions);
    const main = used.filter(id => G.moveById[id].kind === 'compound').slice(0, 6), sel = used.includes(U.progMove) ? U.progMove : (main[0] || used[0]);
    root.querySelectorAll('[data-mini]').forEach(h => C().line(h, { mini: true, height: 54, endLabel: false, series: [{ name: '1RM', color: 'var(--series-1)', points: e1rmSeries(sessions, h.dataset.mini), dots: 'end' }] }));
    const e = root.querySelector('#ch-e1rm');
    if (e && sel) {
      const pts = e1rmSeries(sessions, sel), name = G.moveById[sel].name;
      if (U.table.e1rm) e.innerHTML = C().table([{ h: 'Date' }, { h: '1RM estimé', r: 1 }, { h: '' }], pts.slice().reverse().map(q => [G.fmtDate(q.x, { y: true }), G.kg(q.y) + ' kg', q.pr ? 'Record' : '']));
      else C().line(e, { label: `1RM estimé, ${name} : de ${G.kg(pts[0]?.y)} à ${G.kg(pts[pts.length - 1]?.y)} kg`, series: [{ name: '1RM estimé', color: 'var(--series-1)', points: pts, dots: pts.length <= 20 ? 'all' : 'end', area: true }], yFmt: v => G.kg(v), tipFmt: v => G.kg(v) + ' kg', endLabel: true, pad: 2 });
    }
    const v = root.querySelector('#ch-vol');
    if (v) {
      const done = P.weeklyVolume(sessions, G.weekStart(today), today), plan = plannedVolume(p);
      C().bullets(v, G.VOLUME_GROUPS.map(g => { const z = G.volumeZone(g, p.level); return { label: g.name, done: done[g.id], planned: Math.round(plan[g.id] * 2) / 2, lo: z[0], hi: z[1] }; }), { zone: 'selon le muscle et ton niveau' });
    }
    const w = root.querySelector('#ch-w');
    if (w) {
      const ws = G.nutri.weightSeries(G.store.data.days, G.health.flatDays(G.store.data.health)).filter(q => q.date >= G.addDays(today, -90));
      const avg = G.nutri.movingAvg(ws).map(q => ({ x: q.date, y: +q.kg.toFixed(2) }));
      const T = G.nutri.targets(p, G.health.summary(G.store.data.health)), rate = T ? T.rateKgWeek : 0, band = [];
      if (avg.length) {
        const a0 = avg[0], end = G.addDays(today, 14), n = G.daysBetween(a0.x, end);
        for (let k = 0; k <= n; k += 2) {
          const x = G.addDays(a0.x, k), wk = k / 7;
          const lo = rate > 0 ? a0.y + .5 * rate * wk : rate < 0 ? a0.y + 1.6 * rate * wk : a0.y - .4, hi = rate > 0 ? a0.y + 1.6 * rate * wk : rate < 0 ? a0.y + .5 * rate * wk : a0.y + .4;
          band.push({ x, lo: +lo.toFixed(2), hi: +hi.toFixed(2) });
        }
      }
      if (U.table.w) w.innerHTML = C().table([{ h: 'Date' }, { h: 'Poids', r: 1 }, { h: 'Moyenne 7 j', r: 1 }, { h: 'Source' }], ws.slice().reverse().map(q => [G.fmtDate(q.date, { y: true }), G.num(q.kg, 1) + ' kg', G.num(avg.find(a => a.x === q.date)?.y, 1) + ' kg', q.src]));
      else C().line(w, { label: 'Poids corporel et zone visée', empty: 'Aucune pesée pour l’instant.', today, series: [{ name: 'Pesée', color: 'var(--muted)', points: ws.map(q => ({ x: q.date, y: q.kg })), line: false, dots: 'small', label: false }, { name: 'Moyenne 7 j', color: 'var(--series-1)', points: avg }], bands: [{ name: 'Zone visée', color: 'var(--series-1)', points: band, opacity: .12 }], yFmt: x => G.num(x, 1), tipFmt: x => G.num(x, 1) + ' kg', endLabel: true, pad: .3 });
    }
    const hd = G.health.flatDays(G.store.data.health), from = G.addDays(today, -29), days = []; for (let k = 0; k < 30; k++) days.push(G.addDays(from, k));
    const base = k => { const vals = days.map(d => hd[d] && hd[d][k]).filter(x => x > 0); if (vals.length < 5) return null; const m = vals.reduce((s, x) => s + x, 0) / vals.length, sd = Math.sqrt(vals.reduce((s, x) => s + (x - m) ** 2, 0) / vals.length); return { m, sd }; };
    const sl = root.querySelector('#ch-sleep'); if (sl) C().columns(sl, { label: 'Sommeil par nuit', name: 'sommeil', height: 150, data: days.map(d => ({ x: d, v: hd[d] ? hd[d].sleep : null })), target: 7, targetLabel: '7 h', tipFmt: x => G.num(x, 1) + ' h' });
    for (const [id, k, unit, dec] of [['#ch-rhr', 'rhr', ' bpm', 0], ['#ch-hrv', 'hrv', ' ms', 0]]) {
      const host = root.querySelector(id); if (!host) continue;
      const b = base(k), pts = days.filter(d => hd[d] && hd[d][k] > 0).map(d => ({ x: d, y: hd[d][k] }));
      C().line(host, { label: k === 'rhr' ? 'Fréquence cardiaque au repos' : 'Variabilité cardiaque', height: 150, series: [{ name: k === 'rhr' ? 'FC au repos' : 'VFC', color: 'var(--series-1)', points: pts, dots: 'small' }], bands: b ? [{ name: 'fourchette habituelle', color: 'var(--muted)', opacity: .16, points: pts.map(q => ({ x: q.x, lo: +(b.m - b.sd).toFixed(1), hi: +(b.m + b.sd).toFixed(1) })) }] : [], tipFmt: x => G.num(x, dec) + unit, endLabel: true, pad: 2 });
    }
  };
  G.act['prog-move'] = el => { U.progMove = el.value || el.dataset.v; G.render(); };
  G.act['toggle-table'] = el => { U.table[el.dataset.id] = !U.table[el.dataset.id]; G.forceRender(); };
  G.act['sess-del'] = el => { U.confirmDel = el.dataset.id; G.render(); };
  G.act['sess-del-no'] = () => { U.confirmDel = null; G.render(); };
  G.act['sess-del-yes'] = el => { U.confirmDel = null; G.store.del('sessions', el.dataset.id); G.toast('Séance supprimée.'); };
})(window.GYM = window.GYM || {});

/* Onglet Coach (Claude dans l'app) et écran Profil : réglages, programme, Apple Santé, données. */
(function (G) {
  'use strict';
  const U = G.ui, esc = G.esc, N = G.nutri, P = G.program;

  /* ---------- Coach ---------- */
  const RULES = 'Tu es le coach musculation et nutrition personnel de Dylan (comédien à Paris), intégré à son app « Training Coach ». Réponds en français, en tutoyant, de façon concrète et chiffrée (kg, reps, séries, grammes, kcal), en 250 mots maximum, avec des listes courtes. Appuie-toi uniquement sur les données fournies ; si une donnée manque, dis-le en une phrase. Principes : hypertrophie avec 10 à 20 séries dures par muscle et par semaine, 0 à 3 répétitions en réserve, double progression, protéines 1,6 à 2,2 g/kg, surplus modéré et ajusté chaque semaine selon la moyenne du poids. Pas de conseil médical ni sur les compléments ou substances : pour une douleur, une blessure ou une question de santé, renvoie vers un médecin.';
  const PROMPTS = ['Analyse ma dernière semaine (entraînement et nutrition)', 'Je stagne sur un exercice : que faire ?', 'Propose un dîner pour compléter mes macros du jour', 'Je n’ai que 40 minutes aujourd’hui : adapte ma séance', 'Comment ajuster mes calories cette semaine ?'];
  function context() {
    const p = G.profileOrExample(), hs = G.health.summary(G.store.data.health), T = N.targets(p, hs), wk = P.weekInfo(p.start || G.today()), today = G.today();
    const days = []; for (let i = 13; i >= 0; i--) { const d = G.addDays(today, -i), x = G.store.data.days[d]; if (x) { const t = N.dayLogTotals(x); days.push({ date: d, kcal: Math.round(t.kcal), prot: Math.round(t.p), poids: x.weight || null }); } }
    return {
      profil: G.hasProfile() ? { age: p.age, taille_cm: p.height, poids_kg: p.weight, sexe: p.sex, niveau: p.level, seances_semaine: p.days, materiel: p.equip, objectif: N.GOALS[p.goal || 'bulk'].label, regime: N.DIET_FR[p.diet || 'omni'], exclusions: p.excl || [] } : 'profil non renseigné (exemple)',
      semaine_cycle: `${wk.label}, RIR cible ${wk.rir}`,
      programme: P.build(p).map(d => d.name + ' : ' + d.items.map(i => G.moveById[i.move].name + ' ' + i.sets + '×' + i.reps.join('-')).join(', ')),
      besoins: T && { kcal: T.kcal, proteines_g: T.P, glucides_g: T.C, lipides_g: T.F },
      dernieres_seances: G.store.sessionsList().slice(-10).map(s => ({ date: s.date, seance: s.dayName, exercices: (s.exercises || []).map(e => (G.moveById[e.move]?.name || e.move) + ' : ' + e.sets.map(x => (x.kg ? x.kg + ' kg×' : '') + x.reps + (x.rir !== '' && x.rir != null ? ' @RIR' + x.rir : '')).join(', ')), notes: s.notes || undefined })),
      nutrition_14_jours: days,
      tendance_poids: N.trend(N.weightSeries(G.store.data.days, G.health.flatDays(G.store.data.health))),
      apple_sante: hs ? { pas_moy_7j: hs.steps7 && Math.round(hs.steps7), sommeil_moy_7j_h: hs.sleep7 && +hs.sleep7.toFixed(1), fc_repos: hs.rhr, vfc: hs.hrv, vfc_moy_30j: hs.hrvBase && Math.round(hs.hrvBase), depense_mesuree_kcal: hs.tdee } : 'non importé',
      repas_du_jour: (() => { const x = G.store.data.days[today]; return x ? (x.foods || []).map(e => e.name + (e.g ? ' ' + e.g + ' g' : '')) : []; })()
    };
  }
  function md(t) {
    const lines = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n'); let out = '', ul = false;
    for (const l of lines) {
      const m = l.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)/);
      if (m) { if (!ul) { out += '<ul>'; ul = true; } out += `<li>${m[1]}</li>`; continue; }
      if (ul) { out += '</ul>'; ul = false; }
      if (l.trim()) out += `<p>${l.replace(/^#+\s*/, '')}</p>`;
    }
    return out + (ul ? '</ul>' : '');
  }
  G.views.coach = () => {
    const c = U.coach;
    if (!G.cap.sample) return `<div class="stack"><section class="card hero"><p class="eyebrow">Coach IA</p><h1 class="h1" style="margin-top:6px">Pose tes questions à Claude</h1>
      <p class="lead">Le coach lit tes séances, ta nutrition, ton poids et tes données Santé pour te répondre. Il fonctionne quand l’app est ouverte dans Claude (claude.ai ou l’app Claude sur iPhone).</p></section>
      <section class="card"><h3 class="h3">En attendant</h3><p class="small" style="margin-top:6px">Dans une conversation avec Claude, dis « Training Coach » ou « Nutrition Coach » : l’agent lit la base de cette app et fait ta revue.</p></section></div>`;
    return `<div class="stack"><section class="card hero"><p class="eyebrow">Coach IA · utilise ta propre offre Claude</p><h1 class="h1" style="margin-top:6px">Demande à ton coach</h1>
      <p class="lead">Il voit ton profil, ton programme, tes 10 dernières séances, 14 jours de nutrition et Apple Santé.</p>
      <div class="chips" style="margin-top:12px">${PROMPTS.map(q => `<button class="chip" data-act="coach-q" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <label class="field" style="margin-top:12px"><span>Ta question</span><textarea id="cq" data-act="coach-type" placeholder="Ex. : j’ai mal dormi, je fais quand même ma séance jambes ?">${esc(c.q)}</textarea></label>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="coach-ask" ${c.busy ? 'disabled' : ''}>${G.icon('spark')} Demander</button>${c.busy ? '<button class="btn ghost" data-act="coach-stop">Arrêter</button>' : ''}</div></section>
      <section class="card" ${c.text || c.busy || c.err ? '' : 'hidden'}><div class="answer" id="ans">${c.text ? md(c.text) : c.busy ? '<p class="thinking">Réflexion en cours…</p>' : ''}</div>${c.err ? `<p class="note warn" style="margin-top:10px">${esc(c.err)}</p>` : ''}</section></div>`;
  };
  let ctl = null;
  G.act['coach-type'] = el => { U.coach.q = el.value; };
  G.act['coach-q'] = el => { U.coach.q = el.dataset.q; G.render(); G.act['coach-ask'](); };
  G.act['coach-stop'] = () => { if (ctl) ctl.abort(); };
  G.act['coach-ask'] = async () => {
    const c = U.coach, q = (c.q || '').trim(); if (!q || c.busy || !G.cap.sample) return;
    c.busy = true; c.text = ''; c.err = ''; G.render(); ctl = new AbortController();
    const prompt = RULES + '\n\nDONNÉES DE L’APP (JSON) :\n' + JSON.stringify(context()).slice(0, 60000) + '\n\nQUESTION : ' + q;
    try {
      const r = await G.cap.sample(prompt, { signal: ctl.signal, onText: ({ text }) => { c.text = text; const a = document.getElementById('ans'); if (a) a.innerHTML = md(text); } });
      c.text = r.text; if (r.truncated) c.err = 'Réponse coupée : pose une question plus ciblée.';
    } catch (e) {
      c.text = e.text || c.text;
      c.err = { cancelled: '', not_granted: 'Tu as refusé l’accès à Claude pour cette app. Recharge la page pour réessayer.', rate_limited: 'Limite d’utilisation atteinte : réessaie plus tard.', refused: 'Claude n’a pas répondu à cette question : reformule-la.' }[e.code] ?? 'Réponse interrompue. Réessaie.';
      if (e.code === 'not_granted' || e.code === 'sampling_disabled') G.cap.sample = null;
    }
    c.busy = false; ctl = null; G.forceRender();
  };

  /* ---------- Profil ---------- */
  const FIELDS = ['name', 'sex', 'age', 'height', 'weight', 'level', 'days', 'sessionMin', 'equip', 'activity', 'goal', 'diet', 'meals', 'start'];
  const pf = () => { if (!U.pf) U.pf = Object.assign({}, G.EXAMPLE_PROFILE, { name: 'Dylan', age: '', height: '', weight: '', start: G.today() }, G.store.profile || {}); return U.pf; };
  const sel = (id, v, opts) => `<select id="pf-${id}" data-act="pf" data-k="${id}">${opts.map(([k, l]) => `<option value="${k}" ${String(v) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const seg = (id, v, opts) => `<div class="seg" role="group">${opts.map(([k, l]) => `<button data-act="pf-seg" data-k="${id}" data-v="${k}" aria-pressed="${String(v) === String(k)}">${esc(l)}</button>`).join('')}</div>`;

  function healthCard() {
    const s = G.health.summary(G.store.data.health), wk = G.health.flatWorkouts(G.store.data.health);
    return `<section class="card" id="sante"><div class="sec-h"><h2 class="h2">${G.icon('heart')} Apple Santé</h2>${s ? `<span class="pill good"><span class="dot"></span>${s.nDays} jours importés</span>` : ''}</div>
      <p class="small">Une app web ne peut pas lire Santé directement (Apple réserve HealthKit aux apps natives). Deux façons simples d’y arriver, sans rien installer :</p>
      <div class="stack-s" style="margin-top:12px"><h3 class="h3">1 · Export complet (historique)</h3>
        <p class="small muted">iPhone → app Santé → ta photo en haut à droite → « Exporter toutes les données de santé » → Enregistrer dans Fichiers. Puis choisis le fichier <b>export.zip</b> ici. Tout est lu sur ton téléphone ; seuls les totaux par jour sont gardés (400 derniers jours).</p>
        <label class="btn ghost" style="width:fit-content">${G.icon('upload')} Choisir export.zip<input type="file" accept=".zip,.xml,application/zip,text/xml" data-act="health-file" hidden></label>
        ${U.healthMsg ? `<p class="note" id="hmsg">${esc(U.healthMsg)}</p>` : '<p class="note" id="hmsg" hidden></p>'}
        <h3 class="h3" style="margin-top:8px">2 · Mise à jour quotidienne (Raccourci iPhone)</h3>
        <details><summary>Créer le raccourci « Sync Gym » (5 min, une seule fois)</summary><ol class="small" style="padding-left:18px;margin-top:8px;display:flex;flex-direction:column;gap:6px">
          <li>App <b>Raccourcis</b> → <b>+</b>. Ajoute « Rechercher des échantillons de santé » : type <b>Poids</b>, trier par date de début (plus récent d’abord), limite 1.</li>
          <li>Ajoute « Rechercher des échantillons de santé » : type <b>Pas</b>, date de début « aujourd’hui », puis « Calculer les statistiques » → <b>Somme</b>.</li>
          <li>Même chose pour <b>Énergie active</b> et <b>Énergie au repos</b> (Somme), puis <b>Fréquence cardiaque au repos</b> et <b>Variabilité du rythme cardiaque</b> (le plus récent, limite 1).</li>
          <li>Ajoute « Dictionnaire » avec les clés : <code>poids</code>, <code>pas</code>, <code>kcal_actives</code>, <code>kcal_repos</code>, <code>fc_repos</code>, <code>vfc</code> et <code>date</code> (Date actuelle, format personnalisé <code>yyyy-MM-dd</code>), chacune reliée au résultat correspondant.</li>
          <li>Ajoute « Copier dans le presse-papiers » puis « Ouvrir les URL » avec le lien de cette app.</li>
          <li>Onglet Automatisation → Heure de la journée, 22:00 → exécuter ce raccourci. Ensuite, colle simplement ici.</li></ol>
          <p class="tiny muted">Les noms exacts des actions peuvent varier légèrement selon ta version d’iOS.</p></details>
        <label class="field"><span>Coller les données du raccourci</span><textarea id="hpaste" placeholder='{"date":"2026-09-29","poids":78.4,"pas":8450,"kcal_actives":620,"kcal_repos":1780,"fc_repos":58,"vfc":42}'></textarea></label>
        <button class="btn" data-act="health-paste" style="width:fit-content">Importer</button></div>
      ${s ? `<hr class="divider"><div class="small stack-s"><p>Du ${G.fmtDate(s.from, { y: true })} au ${G.fmtDate(s.to, { y: true })} · ${wk.filter(w => G.health.STRENGTH.has(w.type)).length} séances de muscu enregistrées par la montre.</p>
        <p>${s.steps7 ? `Pas : ${G.num(s.steps7)} / jour (7 j) · ` : ''}${s.sleep7 ? `Sommeil : ${G.num(s.sleep7, 1)} h (7 j) · ` : ''}${s.rhr ? `FC repos : ${s.rhr.v} bpm · ` : ''}${s.hrv ? `VFC : ${s.hrv.v} ms · ` : ''}${s.tdee ? `Dépense mesurée : ${G.num(s.tdee)} kcal/j` : ''}</p>
        ${U.confirmHealthDel ? `<div class="row"><span>Supprimer toutes les données Santé importées ?</span><button class="btn hot sm" data-act="health-del-yes">Supprimer</button><button class="btn ghost sm" data-act="health-del-no">Annuler</button></div>` : '<button class="link" data-act="health-del">Supprimer les données Santé importées</button>'}</div>` : ''}</section>`;
  }

  function dataCard() {
    const S = G.store;
    return `<section class="card"><h2 class="h2">Données</h2><p class="small" style="margin-top:6px">${S.mode === 'cloud' ? 'Enregistrées dans la base privée de cette app : elles te suivent sur tous tes appareils connectés à Claude, et Claude peut les relire pour tes revues (Training Coach, Nutrition Coach).' : 'Enregistrées dans ce navigateur uniquement. Ouvre l’app depuis Claude pour les synchroniser.'}</p>
      ${S.mode === 'cloud' && S.localHasData ? `<p class="note warn" style="margin-top:10px">Des données existent aussi dans ce navigateur (mode local). <button class="link" data-act="migrate">Les importer dans la base</button></p>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn ghost sm" data-act="export-json">${G.icon('copy')} Exporter (JSON)</button><button class="btn ghost sm" data-act="export-csv">Séances (CSV)</button></div>
      <textarea id="exportbox" hidden readonly style="margin-top:10px"></textarea>
      <details style="margin-top:12px"><summary>Importer une sauvegarde JSON</summary><textarea id="importbox" placeholder="Colle ici le contenu d’un export" style="margin-top:8px"></textarea><button class="btn sm" data-act="import-json" style="margin-top:8px">Importer</button></details>
      <details style="margin-top:8px"><summary>Tout effacer</summary><div class="row" style="margin-top:8px">${U.confirmWipe ? '<span class="small">Vraiment tout effacer (séances, nutrition, santé) ?</span><button class="btn hot sm" data-act="wipe-yes">Tout effacer</button><button class="btn ghost sm" data-act="wipe-no">Annuler</button>' : '<button class="btn hot sm" data-act="wipe">Effacer toutes les données</button>'}</div></details></section>`;
  }

  G.views.profil = () => {
    const f = pf(), has = G.hasProfile(), prog = P.build(f), excl = new Set(f.excl || []);
    return `<div class="stack"><section class="card hero"><p class="eyebrow">${has ? 'Profil' : 'Création du profil'}</p><h1 class="h1" style="margin-top:6px">${esc(f.name || 'Ton profil')}</h1>
      <p class="lead">Ces informations servent à calculer tes besoins et à construire ton programme. Tout reste privé.</p>
      <div class="form" style="margin-top:14px">
        <label class="field half"><span>Prénom</span><input id="pf-name" type="text" data-act="pf" data-k="name" value="${esc(f.name)}"></label>
        <div class="field half"><span>Sexe (formule du métabolisme)</span>${seg('sex', f.sex, [['h', 'Homme'], ['f', 'Femme']])}</div>
        <label class="field"><span>Âge</span><input id="pf-age" type="text" inputmode="numeric" data-act="pf" data-k="age" value="${esc(f.age)}" placeholder="ans"></label>
        <label class="field"><span>Taille (cm)</span><input id="pf-height" type="text" inputmode="numeric" data-act="pf" data-k="height" value="${esc(f.height)}"></label>
        <label class="field"><span>Poids (kg)</span><input id="pf-weight" type="text" inputmode="decimal" data-act="pf" data-k="weight" value="${esc(f.weight)}"></label>
        <label class="field"><span>Niveau</span>${sel('level', f.level, [['debutant', 'Débutant (< 1 an)'], ['inter', 'Intermédiaire (1–3 ans)'], ['avance', 'Avancé (> 3 ans)']])}</label>
        <div class="field half"><span>Séances par semaine</span>${seg('days', f.days, [[3, '3'], [4, '4'], [5, '5'], [6, '6']])}</div>
        <label class="field"><span>Durée d’une séance</span>${sel('sessionMin', f.sessionMin, [[45, '45 min'], [60, '1 h'], [75, '1 h 15'], [90, '1 h 30']])}</label>
        <label class="field"><span>Matériel</span>${sel('equip', f.equip, [['salle', 'Salle complète'], ['halteres', 'Haltères + banc + barre de traction'], ['pdc', 'Poids du corps (+ barre de traction)']])}</label>
        <label class="field half"><span>Activité hors sport</span>${sel('activity', f.activity, Object.entries(N.ACT).map(([k, a]) => [k, a.label + ' — ' + a.hint]))}</label>
        <label class="field half"><span>Objectif</span>${sel('goal', f.goal, Object.entries(N.GOALS).map(([k, g]) => [k, g.label]))}</label>
        <label class="field"><span>Alimentation</span>${sel('diet', f.diet, Object.entries(N.DIET_FR))}</label>
        <div class="field"><span>Repas par jour</span>${seg('meals', f.meals, [[3, '3'], [4, '4'], [5, '5']])}</div>
        <label class="field half"><span>Début du programme</span><input id="pf-start" type="date" data-act="pf" data-k="start" value="${esc(f.start || G.today())}"><small>Sert à situer la semaine du cycle de 6 semaines.</small></label>
        <div class="field full"><span>J’évite</span><div class="chips">${Object.entries(N.EXCL_FR).map(([k, l]) => `<button class="chip" data-act="pf-excl" data-v="${k}" aria-pressed="${excl.has(k)}">${l}</button>`).join('')}</div></div>
      </div><div class="row" style="margin-top:16px"><button class="btn" data-act="pf-save">${G.icon('check')} Enregistrer</button>${has ? '<button class="btn ghost" data-act="pf-reset">Annuler les modifications</button>' : ''}</div></section>
      <section class="card"><div class="sec-h"><h2 class="h2">Ton programme</h2><span class="small muted">${prog.length} séances en rotation</span></div>
        <p class="small muted">Les séances s’enchaînent dans l’ordre, peu importe le jour : pratique avec un planning de tournage irrégulier. Tu peux remplacer un exercice ci-dessous.</p>
        <div class="stack" style="margin-top:12px">${prog.map(d => `<div><h3 class="h3">${esc(d.name)} <span class="small muted">· ${esc(d.focus)}</span></h3><div class="day-list">${d.items.map(it => {
          const alts = P.alternatives(it.slot, f.equip);
          return `<div class="day-ex">${G.thumb(it.move)}<div><div class="ex-name">${esc(G.moveById[it.move].name)}</div><div class="ex-meta">${it.sets} × ${it.reps[0]}–${it.reps[1]}${it.timed ? ' s' : ''}</div></div>
            ${alts.length > 1 ? `<select id="swp-${d.key}-${it.slot}" data-act="pf-swap" data-k="${d.key}:${it.slot}" aria-label="Remplacer" style="width:auto;max-width:150px">${alts.map(a => `<option value="${a}" ${a === it.move ? 'selected' : ''}>${esc(G.moveById[a].name)}</option>`).join('')}</select>` : '<span></span>'}</div>`;
        }).join('')}</div></div>`).join('')}</div></section>
      ${healthCard()}${dataCard()}</div>`;
  };
  G.act.pf = el => { pf()[el.dataset.k] = el.value; };
  G.act['pf-seg'] = el => { pf()[el.dataset.k] = isNaN(+el.dataset.v) ? el.dataset.v : +el.dataset.v; G.render(); };
  G.act['pf-excl'] = el => { const f = pf(), s = new Set(f.excl || []); s.has(el.dataset.v) ? s.delete(el.dataset.v) : s.add(el.dataset.v); f.excl = [...s]; G.render(); };
  G.act['pf-swap'] = el => { const f = pf(); f.swaps = Object.assign({}, f.swaps, { [el.dataset.k]: el.value }); if (G.hasProfile()) { G.store.put('profile', 'main', Object.assign(G.clone(G.store.profile), { swaps: f.swaps })); G.toast('Exercice remplacé.', 'good'); } G.render(); };
  G.act['pf-reset'] = () => { U.pf = null; G.render(); };
  G.act['pf-save'] = () => {
    const f = pf(), n = x => parseFloat(String(x).replace(',', '.'));
    const out = Object.assign(G.clone(G.store.profile || {}), f, { age: n(f.age), height: n(f.height), weight: n(f.weight), days: +f.days, sessionMin: +f.sessionMin, meals: +f.meals });
    if (!(out.age >= 14 && out.age <= 90) || !(out.height >= 130 && out.height <= 230) || !(out.weight >= 35 && out.weight <= 250)) { G.toast('Vérifie l’âge, la taille (cm) et le poids (kg).', 'bad'); return; }
    if (!out.start) out.start = G.today();
    G.store.put('profile', 'main', out); U.pf = null; G.toast('Profil enregistré.', 'good');
    const date = G.today(), d = G.clone(G.store.data.days[date] || {}); if (!d.weight) { d.weight = out.weight; G.store.put('days', date, d); }
  };

  /* Santé */
  G.act['health-file'] = async el => {
    const file = el.files && el.files[0]; if (!file) return;
    const msg = t => { U.healthMsg = t; const m = document.getElementById('hmsg'); if (m) { m.hidden = false; m.textContent = t; } };
    msg('Lecture de ' + file.name + '…');
    try {
      const res = await G.health.importFile(file, p => msg(`Lecture… ${Math.round(p * 100)} %`));
      const months = G.health.toMonths(res, G.store.data.health);
      for (const [m, doc] of Object.entries(months)) await G.store.put('health', m, doc);
      msg(`Import terminé : ${Object.keys(res.days).length} jours et ${res.workouts.length} séances de sport lus.`);
      U.healthMsg = ''; G.toast('Données Santé importées.', 'good');
    } catch (e) {
      msg(e && e.code === 'nodecomp' ? 'Ce navigateur ne sait pas ouvrir le .zip : ouvre-le dans l’app Fichiers (il se décompresse), puis choisis export.xml.' : e && e.code === 'notzip' ? 'Ce fichier n’est pas un export Santé valide.' : e && e.code === 'noxml' ? 'Aucun fichier export.xml dans cette archive.' : 'Lecture impossible : ' + (e && (e.message || e.code) || 'erreur'));
    }
    el.value = '';
  };
  G.act['health-paste'] = async () => {
    const t = document.getElementById('hpaste').value.trim(); if (!t) { G.toast('Colle d’abord les données du raccourci.'); return; }
    const byDate = G.health.parsePaste(t), dates = Object.keys(byDate);
    if (!dates.length) { G.toast('Aucune donnée reconnue.', 'bad'); return; }
    const res = { days: byDate, workouts: [] }, months = G.health.toMonths(res, G.store.data.health);
    for (const [m, doc] of Object.entries(months)) await G.store.put('health', m, doc);
    for (const d of dates) if (byDate[d].weight) { const x = G.clone(G.store.data.days[d] || {}); x.weight = byDate[d].weight; G.store.put('days', d, x); }
    G.toast(`Importé : ${dates.map(d => G.fmtDate(d)).join(', ')}`, 'good');
  };
  G.act['health-del'] = () => { U.confirmHealthDel = true; G.render(); };
  G.act['health-del-no'] = () => { U.confirmHealthDel = false; G.render(); };
  G.act['health-del-yes'] = () => { U.confirmHealthDel = false; for (const k of Object.keys(G.store.data.health)) G.store.del('health', k); G.toast('Données Santé supprimées.'); };

  /* Données */
  G.act['export-json'] = () => G.saveFile('training-coach-' + G.today() + '.json', G.store.exportAll(), document.getElementById('exportbox'));
  G.act['export-csv'] = () => {
    const rows = [['date', 'seance', 'exercice', 'serie', 'kg', 'reps', 'rir']];
    for (const s of G.store.sessionsList()) for (const ex of s.exercises || []) ex.sets.forEach((x, i) => rows.push([s.date, s.dayName, G.moveById[ex.move]?.name || ex.move, i + 1, x.kg, x.reps, x.rir]));
    G.saveFile('seances-' + G.today() + '.csv', rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n'), document.getElementById('exportbox'));
  };
  G.act['import-json'] = async () => { try { await G.store.importAll(document.getElementById('importbox').value); G.toast('Sauvegarde importée.', 'good'); } catch (e) { G.toast('JSON invalide.', 'bad'); } };
  G.act.migrate = async () => { await G.store.importAll({ data: G.store.local }); G.store.localHasData = false; G.ls.set('gym.v1.local', null); G.toast('Données de ce navigateur importées.', 'good'); G.render(); };
  G.act.wipe = () => { U.confirmWipe = true; G.render(); };
  G.act['wipe-no'] = () => { U.confirmWipe = false; G.render(); };
  G.act['wipe-yes'] = () => { U.confirmWipe = false; for (const c of ['sessions', 'days', 'health', 'drafts', 'profile']) for (const k of Object.keys(G.store.data[c])) G.store.del(c, k); U.pf = null; G.toast('Tout est effacé.'); };
})(window.GYM = window.GYM || {});

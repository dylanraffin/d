/* Onglet Nutrition : besoins détaillés, journal du jour, poids, plan de repas au gramme, bilan hebdo, courses. */
(function (G) {
  'use strict';
  const U = G.ui, N = G.nutri, esc = G.esc;
  const portion = it => {
    const f = G.FOOD[it.id]; let h = '';
    if (f.unit) { const n = it.g / f.unit[0]; if (Math.abs(n - Math.round(n)) < .25 && Math.round(n) >= 1) h = `${Math.round(n)} ${Math.round(n) > 1 ? f.unit[2] : f.unit[1]}`; }
    if (f.spoon) h = `≈ ${G.num(it.g / f.spoon, 1)} c. à soupe`;
    return `<b>${G.num(it.g)} g</b>${h ? ` <span class="hint">(${h})</span>` : ''}`;
  };
  const macLine = t => `${G.num(t.kcal)} kcal · P ${G.num(t.p)} g · G ${G.num(t.c)} g · L ${G.num(t.f)} g`;
  const dayDoc = date => G.clone(G.store.data.days[date] || {});

  function targetsCard(T, p, has, hs) {
    const g = T.goal, rate = T.rateKgWeek;
    return `<section class="card hero"><div class="row-sb"><div><p class="eyebrow">${has ? 'Tes besoins' : 'Exemple : 30 ans, 178 cm, 75 kg'} · ${esc(g.label)}</p>
      <div class="row" style="margin-top:6px;align-items:baseline"><span class="big">${G.num(T.kcal)}</span><span class="h3">kcal / jour</span></div>
      <p class="muted">${rate ? `Objectif : ${rate > 0 ? '+' : ''}${G.num(rate, 2)} kg par semaine` : 'Objectif : poids stable'}</p></div></div>
      <div class="macros" style="margin-top:12px"><div class="macro"><span>Protéines</span><b>${T.P} g</b><span>${G.num(T.perKg.p, 1)} g/kg</span></div><div class="macro"><span>Glucides</span><b>${T.C} g</b><span>${G.num(T.perKg.c, 1)} g/kg</span></div><div class="macro"><span>Lipides</span><b>${T.F} g</b><span>${G.num(T.perKg.f, 1)} g/kg</span></div></div>
      <p class="small" style="margin-top:10px">Fibres ≥ ${T.fib} g · Eau ≈ ${G.num(T.water, 1)} L (+0,5 L par heure de sport) · Protéines ≈ ${T.protMeal} g par repas</p>
      <details style="margin-top:10px"><summary>Comment c’est calculé</summary><div class="tscroll" style="margin-top:8px"><table class="t"><tbody>
        <tr><td>Métabolisme de base (Mifflin-St Jeor)</td><td class="r">${G.num(T.bmr)} kcal</td></tr>
        <tr><td>× activité hors sport : ${esc(T.act.label)} (${esc(T.act.hint)})</td><td class="r">× ${G.num(T.act.f, 2)}</td></tr>
        <tr><td>+ séances (${p.days} × ${p.sessionMin || 60} min, moyenne par jour)</td><td class="r">+${G.num(T.trainKcal)} kcal</td></tr>
        <tr><td>= dépense estimée par formule</td><td class="r">${G.num(T.formula)} kcal</td></tr>
        ${T.measured ? `<tr><td>Dépense mesurée Apple Watch (14 j, +7 % digestion)</td><td class="r">${G.num(T.measured)} kcal</td></tr><tr><td>= dépense retenue (moyenne des deux)</td><td class="r">${G.num(T.tdee)} kcal</td></tr>` : hs && hs.tdeeDays ? `<tr><td colspan="2" class="muted">Apple Watch : ${hs.tdeeDays} jours de données, il en faut 10 pour les utiliser.</td></tr>` : ''}
        <tr><td>${T.delta >= 0 ? 'Surplus' : 'Déficit'} pour l’objectif de poids</td><td class="r">${T.delta >= 0 ? '+' : ''}${G.num(T.delta)} kcal</td></tr>
        ${T.adjust ? `<tr><td>Ajustements hebdomadaires appliqués</td><td class="r">${T.adjust > 0 ? '+' : ''}${G.num(T.adjust)} kcal</td></tr>` : ''}
        <tr><td><b>Cible</b></td><td class="r"><b>${G.num(T.kcal)} kcal</b></td></tr></tbody></table></div>
        <p class="tiny muted" style="margin-top:6px">Protéines ${G.num(g.prot, 1)} g/kg (fourchette utile 1,6–2,2), lipides ≈ 0,9 g/kg (20–35 % des calories), glucides pour le reste. Les formules se trompent souvent de ±10 % : c’est la pesée qui tranche, d’où le bilan chaque semaine.</p></details></section>`;
  }

  function logCard(date, day, T) {
    const tot = N.dayLogTotals(day), res = N.searchFoods(U.food.q), sel = U.food.id && G.FOOD[U.food.id];
    return `<section class="card"><div class="sec-h"><h3 class="h3">Journal du ${G.relDate(date)}</h3><span class="small muted">${(day.foods || []).length} aliment(s)</span></div>
      <div class="stack-s">${G.meter('Calories', tot.kcal, T.kcal, ' kcal')}${G.meter('Protéines', tot.p, T.P, ' g')}${G.meter('Glucides', tot.c, T.C, ' g')}${G.meter('Lipides', tot.f, T.F, ' g')}</div>
      <div style="margin-top:10px">${(day.foods || []).map((e, i) => `<div class="log-item"><div class="grow"><b>${esc(e.name)}</b><div class="small muted">${e.g ? G.num(e.g) + ' g · ' : ''}${G.num(e.kcal)} kcal · P ${G.num(e.p)} g</div></div><button class="x" data-act="log-del" data-i="${i}" aria-label="Retirer ${esc(e.name)}">×</button></div>`).join('') || '<p class="small muted">Rien pour l’instant. Valide un repas du plan ou ajoute un aliment.</p>'}</div>
      <details style="margin-top:12px" ${U.food.q || U.food.id ? 'open' : ''}><summary>Ajouter un aliment</summary><div class="stack-s" style="margin-top:10px">
        <input id="fq" type="search" data-act="food-q" placeholder="Rechercher : poulet, riz, skyr…" value="${esc(U.food.q)}" aria-label="Rechercher un aliment">
        <div class="results">${res.map(f => `<button data-act="food-pick" data-id="${f.id}" aria-pressed="${U.food.id === f.id}">${esc(f.n)} <span class="small muted">· ${f.kcal} kcal · P ${G.num(f.p, 1)} g /100 g</span></button>`).join('')}</div>
        ${sel ? `<div class="row"><label class="field" style="width:120px"><span>Grammes</span><input id="fg" type="text" inputmode="numeric" data-act="food-g" value="${U.food.g}"></label><button class="btn" data-act="food-add" style="align-self:flex-end">Ajouter ${esc(sel.n.split(' (')[0])}</button></div>` : ''}
      </div></details>
      <details style="margin-top:8px"><summary>Ajout rapide (repas au restaurant, cantine…)</summary><div class="row" style="margin-top:10px">
        <label class="field" style="flex:2;min-width:140px"><span>Nom</span><input id="qn" type="text" placeholder="Burger, plat du jour…"></label>
        <label class="field" style="flex:1;min-width:90px"><span>kcal</span><input id="qk" type="text" inputmode="numeric"></label>
        <label class="field" style="flex:1;min-width:90px"><span>Protéines g</span><input id="qp" type="text" inputmode="numeric"></label>
        <button class="btn" data-act="quick-add" style="align-self:flex-end">Ajouter</button></div></details></section>`;
  }

  function weightCard(date, day, tr) {
    return `<section class="card"><h3 class="h3">Poids du matin</h3><div class="row" style="margin-top:10px"><input id="wkg" type="text" inputmode="decimal" style="max-width:130px" value="${esc(day.weight ?? '')}" placeholder="kg" aria-label="Poids en kg"><button class="btn" data-act="weight-save">Enregistrer</button></div>
      <p class="small muted" style="margin-top:8px">${tr.last ? `Moyenne 7 jours : <b>${G.num(tr.last, 1)} kg</b>${tr.ready ? ` (${tr.delta >= 0 ? '+' : ''}${G.num(tr.delta, 2)} kg vs semaine d’avant)` : ''}.` : 'À jeun, après les toilettes, avant de boire.'}</p></section>`;
  }

  function planCard(plan, date, day, has) {
    const eaten = day.eaten || {};
    return `<section class="card"><div class="sec-h"><h3 class="h3">Plan du ${G.relDate(date)}</h3><span class="small muted">${macLine(plan.tot)}</span></div><div class="stack">
      ${plan.meals.map(m => `<article class="meal ${eaten[m.slot] ? 'eaten' : ''}"><div class="row-sb"><div><p class="eyebrow">${esc(m.name)} · ${Math.round(m.frac * 100)} %</p><b>${esc(m.meal ? m.meal.name : 'Aucun repas compatible')}</b></div>${eaten[m.slot] ? '<span class="pill good">✓ Mangé</span>' : ''}</div>
        <div class="foods">${m.items.map(it => `<div class="food"><span>${esc(G.FOOD[it.id].n)}</span><span>${portion(it)}</span></div>`).join('')}</div>
        <p class="mac-line">${macLine(m.tot)}</p>
        <div class="row">${eaten[m.slot] ? `<button class="btn ghost sm" data-act="meal-undo" data-slot="${m.slot}">Annuler</button>` : `<button class="btn sm" data-act="meal-eat" data-slot="${m.slot}">${G.icon('check')} J’ai mangé ça</button>`}${m.pool && m.pool.length > 1 ? `<button class="btn ghost sm" data-act="meal-next" data-slot="${m.slot}">${G.icon('swap')} Autre idée</button>` : ''}</div></article>`).join('')}
      </div><p class="tiny muted" style="margin-top:10px">Poids crus pour les féculents, viandes et poissons. Valeurs moyennes (tables CIQUAL/USDA) : l’étiquette de tes produits fait foi.</p></section>`;
  }

  G.views.nutrition = () => {
    const has = G.hasProfile(), p = G.profileOrExample(), hs = G.health.summary(G.store.data.health), T = N.targets(p, hs);
    if (!T) return `<section class="card"><p>Complète ton âge, ta taille et ton poids dans le profil.</p><button class="btn" data-act="go-profile" style="margin-top:10px">Ouvrir le profil</button></section>`;
    const date = U.nutriDate || G.today(), day = G.store.data.days[date] || {}, plan = N.dayPlan(p, T, date, day.picks || {});
    const ws = N.weightSeries(G.store.data.days, G.health.flatDays(G.store.data.health)), tr = N.trend(ws), adv = N.advice(p, T, tr);
    const shop = N.shopping(p, T, date, 7, d => (G.store.data.days[d] || {}).picks || {});
    return `<div class="stack"><div class="row-sb"><div class="row"><button class="icon-btn" data-act="nd" data-d="-1" aria-label="Jour précédent">${G.icon('left')}</button><b style="min-width:150px;text-align:center">${G.fmtDate(date, { y: true })}</b><button class="icon-btn" data-act="nd" data-d="1" aria-label="Jour suivant">${G.icon('right')}</button></div>${date !== G.today() ? '<button class="btn ghost sm" data-act="nd" data-d="0">Aujourd’hui</button>' : ''}</div>
      ${has ? '' : '<p class="note warn">Chiffres d’exemple. Crée ton profil pour obtenir tes besoins réels.</p>'}
      <div class="cols"><div class="stack">${targetsCard(T, p, has, hs)}${planCard(plan, date, day, has)}</div>
      <div class="stack">${logCard(date, day, T)}${weightCard(date, day, tr)}
        <section class="card"><h3 class="h3">Bilan de la semaine</h3><p class="note ${adv.status === 'ok' ? 'good' : adv.status === 'wait' ? '' : 'warn'}" style="margin-top:10px">${esc(adv.text)}</p>${adv.adj && has ? `<button class="btn" style="margin-top:10px" data-act="kcal-adj" data-v="${adv.adj}">Appliquer ${adv.adj > 0 ? '+' : ''}${adv.adj} kcal</button>` : ''}${p.kcalAdjust ? `<button class="link" data-act="kcal-reset" style="margin-top:8px">Remettre les ajustements à zéro (${p.kcalAdjust > 0 ? '+' : ''}${p.kcalAdjust} kcal)</button>` : ''}</section>
        <section class="card shop"><div class="sec-h"><h3 class="h3">Liste de courses · 7 jours</h3><button class="btn ghost sm" data-act="shop-copy">${G.icon('copy')} Copier</button></div>
          ${Object.entries(G.FOOD_CAT).filter(([k]) => shop[k]).map(([k, name]) => `<h4>${name}</h4><ul>${shop[k].map(i => `<li>${esc(i.name)} : ${i.g >= 1000 ? G.num(i.g / 1000, 1) + ' kg' : G.num(i.g) + ' g'}${i.units ? ` (≈ ${i.units} ${esc(i.unitName)})` : ''}</li>`).join('')}</ul>`).join('')}</section>
        <section class="card"><h3 class="h3">Conseils</h3><div class="stack-s" style="margin-top:8px">${N.TIPS.map(([t, d]) => `<p class="small"><b>${esc(t)}.</b> ${esc(d)}</p>`).join('')}
          <p class="tiny muted">Compléments alimentaires, pathologie ou traitement : parles-en à un médecin ou à un diététicien.</p></div></section></div></div></div>`;
  };

  const save = (date, d) => G.store.put('days', date, d);
  const curDate = () => U.nutriDate || G.today();
  G.act.nd = el => { const k = +el.dataset.d; U.nutriDate = k === 0 ? null : G.addDays(curDate(), k); if (U.nutriDate === G.today()) U.nutriDate = null; G.render(); };
  G.act['food-q'] = el => {
    U.food.q = el.value; U.food.id = null;
    const box = el.parentElement.querySelector('.results'); if (!box) return;
    box.innerHTML = N.searchFoods(el.value).map(f => `<button data-act="food-pick" data-id="${f.id}" aria-pressed="false">${esc(f.n)} <span class="small muted">· ${f.kcal} kcal · P ${G.num(f.p, 1)} g /100 g</span></button>`).join('');
  };
  G.act['food-pick'] = el => { U.food.id = el.dataset.id; const f = G.FOOD[U.food.id]; U.food.g = f.unit ? f.unit[0] : 100; G.render(); };
  G.act['food-g'] = el => { U.food.g = el.value; };
  G.act['food-add'] = () => {
    const g = parseFloat(String(U.food.g).replace(',', '.')); if (!(g > 0) || !U.food.id) { G.toast('Indique une quantité en grammes.'); return; }
    const date = curDate(), d = dayDoc(date); (d.foods = d.foods || []).push(N.entryFor(U.food.id, g)); U.food = { q: '', id: null, g: 100 }; save(date, d); G.toast('Ajouté au journal.', 'good');
  };
  G.act['quick-add'] = () => {
    const k = parseFloat((document.getElementById('qk').value || '').replace(',', '.')), pr = parseFloat((document.getElementById('qp').value || '0').replace(',', '.')) || 0;
    if (!(k > 0)) { G.toast('Indique au moins les calories.'); return; }
    const date = curDate(), d = dayDoc(date); (d.foods = d.foods || []).push({ id: 'rapide', name: document.getElementById('qn').value || 'Ajout rapide', g: 0, kcal: Math.round(k), p: pr, c: 0, f: 0 }); save(date, d);
  };
  G.act['log-del'] = el => { const date = curDate(), d = dayDoc(date); d.foods.splice(+el.dataset.i, 1); save(date, d); };
  G.act['weight-save'] = () => {
    const v = parseFloat((document.getElementById('wkg').value || '').replace(',', '.')); if (!(v > 30 && v < 300)) { G.toast('Poids invalide.'); return; }
    const date = curDate(), d = dayDoc(date); d.weight = v; save(date, d); G.toast('Pesée enregistrée.', 'good');
  };
  const planFor = date => { const p = G.profileOrExample(), T = N.targets(p, G.health.summary(G.store.data.health)); return N.dayPlan(p, T, date, (G.store.data.days[date] || {}).picks || {}); };
  G.act['meal-eat'] = el => {
    const date = curDate(), d = dayDoc(date), m = planFor(date).meals.find(x => x.slot === el.dataset.slot); if (!m) return;
    d.foods = (d.foods || []).concat(m.items.map(it => Object.assign(N.entryFor(it.id, it.g), { slot: m.slot })));
    d.eaten = Object.assign({}, d.eaten, { [m.slot]: true }); save(date, d);
  };
  G.act['meal-undo'] = el => { const date = curDate(), d = dayDoc(date), s = el.dataset.slot; d.foods = (d.foods || []).filter(e => e.slot !== s); d.eaten = Object.assign({}, d.eaten, { [s]: false }); save(date, d); };
  G.act['meal-next'] = el => { const date = curDate(), d = dayDoc(date), m = planFor(date).meals.find(x => x.slot === el.dataset.slot), nx = m && N.nextPick(m); if (!nx) return; d.picks = Object.assign({}, d.picks, { [m.slot]: nx }); save(date, d); };
  G.act['kcal-adj'] = el => { const p = G.clone(G.store.profile); p.kcalAdjust = (+p.kcalAdjust || 0) + (+el.dataset.v); G.store.put('profile', 'main', p); G.toast('Cible mise à jour.', 'good'); };
  G.act['kcal-reset'] = () => { const p = G.clone(G.store.profile); p.kcalAdjust = 0; G.store.put('profile', 'main', p); };
  G.act['shop-copy'] = () => {
    const p = G.profileOrExample(), T = N.targets(p, G.health.summary(G.store.data.health)), date = curDate();
    const shop = N.shopping(p, T, date, 7, d => (G.store.data.days[d] || {}).picks || {});
    const txt = 'Courses du ' + G.fmtDate(date) + ' (7 jours)\n' + Object.entries(G.FOOD_CAT).filter(([k]) => shop[k]).map(([k, n]) => '\n' + n + '\n' + shop[k].map(i => '- ' + i.name + ' : ' + (i.g >= 1000 ? G.num(i.g / 1000, 1) + ' kg' : i.g + ' g') + (i.units ? ' (≈ ' + i.units + ' ' + i.unitName + ')' : '')).join('\n')).join('\n');
    G.copyText(txt, 'Liste copiée.');
  };
})(window.GYM = window.GYM || {});

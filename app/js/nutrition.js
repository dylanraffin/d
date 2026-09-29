/* Nutrition : besoins (Mifflin-St Jeor + activité + séances), objectif de prise de poids,
   macros, plan de repas calculé au gramme (moindres carrés pondérés sous contraintes),
   liste de courses, ajustement hebdomadaire selon la tendance du poids. */
(function (G) {
  'use strict';
  const FOOD = () => G.FOOD;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  const ACT = {
    sedentaire: { f: 1.2, label: 'Sédentaire', hint: 'bureau, moins de 5 000 pas' },
    leger: { f: 1.35, label: 'Peu actif', hint: '5 000 à 7 500 pas' },
    actif: { f: 1.5, label: 'Actif', hint: '7 500 à 10 000 pas, souvent debout' },
    tres: { f: 1.65, label: 'Très actif', hint: 'plus de 10 000 pas ou métier physique' }
  };
  const GOALS = {
    bulk: { label: 'Prise de muscle', rate: { debutant: .005, inter: .0035, avance: .0025 }, kcalPerKg: 6000, prot: 1.8 },
    lean: { label: 'Prise de muscle très propre', rate: { debutant: .0025, inter: .002, avance: .0015 }, kcalPerKg: 6000, prot: 2.0 },
    recomp: { label: 'Recomposition', rate: { debutant: 0, inter: 0, avance: 0 }, kcalPerKg: 7000, prot: 2.0 },
    cut: { label: 'Sèche', rate: { debutant: -.0075, inter: -.006, avance: -.005 }, kcalPerKg: 7700, prot: 2.2 }
  };
  const DIET_OK = { vegan: ['v'], vege: ['v', 'o'], pesc: ['v', 'o', 'p'], omni: ['v', 'o', 'p', 'm'] };
  const DIET_FR = { omni: 'Omnivore', pesc: 'Pescétarien', vege: 'Végétarien', vegan: 'Végan' };
  const EXCL_FR = { porc: 'Porc', lactose: 'Lactose', gluten: 'Gluten', fruits_coque: 'Fruits à coque', arachide: 'Arachide', soja: 'Soja' };

  const bmr = p => 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'f' ? -161 : 5);

  function targets(p, health) {
    const w = +p.weight, h = +p.height, a = +p.age;
    if (!(w > 30 && h > 120 && a > 12)) return null;
    const q = { weight: w, height: h, age: a, sex: p.sex };
    const B = bmr(q), act = ACT[p.activity || 'leger'] || ACT.leger;
    const trainKcal = (+p.days || 4) * ((+p.sessionMin || 60) / 60) * 3.5 * w / 7;
    const formula = B * act.f + trainKcal;
    const measured = health && health.tdee && health.tdeeDays >= 10 ? health.tdee : null;
    const tdee = measured ? (formula + measured) / 2 : formula;
    const goal = GOALS[p.goal || 'bulk'] || GOALS.bulk, rate = goal.rate[p.level || 'inter'] ?? goal.rate.inter;
    const delta = rate * w * goal.kcalPerKg / 7;
    const kcal = Math.round((tdee + delta + (+p.kcalAdjust || 0)) / 10) * 10;
    const P = Math.round(goal.prot * w);
    const F = Math.round(clamp(.9 * w, .2 * kcal / 9, .35 * kcal / 9));
    /* Étiquettes européennes : glucides hors fibres, fibres comptées 2 kcal/g → on les retire de l'enveloppe glucides */
    const fib = Math.round(clamp(14 * kcal / 1000, 30, 45));
    const C = Math.max(0, Math.round((kcal - P * 4 - F * 9 - fib * 2) / 4));
    return { bmr: Math.round(B), act, trainKcal: Math.round(trainKcal), formula: Math.round(formula), measured: measured && Math.round(measured),
      tdee: Math.round(tdee), delta: Math.round(delta), adjust: +p.kcalAdjust || 0, kcal, P, C, F,
      fib, water: Math.round(35 * w / 100) / 10,
      protMeal: Math.round(.4 * w), rateKgWeek: rate * w, goal, perKg: { p: goal.prot, f: +(F / w).toFixed(1), c: +(C / w).toFixed(1) } };
  }

  /* ---------- Plan de repas ---------- */
  const SPLITS = { 3: [['pdj', .3], ['dej', .4], ['din', .3]], 4: [['pdj', .25], ['dej', .3], ['col', .15], ['din', .3]], 5: [['pdj', .2], ['dej', .25], ['col', .15], ['din', .25], ['col2', .15]] };
  const SLOT_NAME = { pdj: 'Petit-déjeuner', dej: 'Déjeuner', col: 'Collation', din: 'Dîner', col2: 'Collation du soir' };
  const poolSlot = s => (s === 'dej' || s === 'din') ? 'repas' : s === 'col2' ? 'col' : s;

  function allowedMeals(p) {
    const ok = DIET_OK[p.diet || 'omni'], ex = new Set(p.excl || []), F = FOOD();
    return G.MEALS.filter(m => ok.includes(m.d) && m.items.every(([id]) => ok.includes(F[id].d) && !F[id].x.some(x => ex.has(x))));
  }
  /* Repli : assiettes composées automatiquement quand aucun repas type ne respecte le régime et les exclusions */
  function fallbackMeals(slot, p) {
    const ok = DIET_OK[p.diet || 'omni'], ex = new Set(p.excl || []);
    const al = G.FOODS.filter(f => !f.logOnly && ok.includes(f.d) && !f.x.some(x => ex.has(x)));
    const P = al.filter(f => (f.cat === 'prot' || f.cat === 'laitier') && f.p * 4 > f.kcal * .3);
    const C = al.filter(f => f.cat === 'feculent' && f.c > 15), Fa = al.filter(f => f.cat === 'gras');
    const main = poolSlot(slot) === 'repas', V = al.filter(f => f.cat === (main ? 'legume' : 'fruit')), out = [];
    for (let i = 0; i < Math.min(3, P.length); i++) {
      const pr = P[i], cr = C[i % (C.length || 1)], fa = Fa[i % (Fa.length || 1)], v = V[i % (V.length || 1)];
      if (!cr) continue;
      const items = [[pr.id, 'P'], [cr.id, 'C']]; if (fa) items.push([fa.id, 'F']); if (v) items.push([v.id, 'X', main ? 150 : 120]);
      out.push({ id: 'auto_' + poolSlot(slot) + '_' + i, slot: poolSlot(slot), d: 'v', auto: true, items,
        name: 'Assiette ' + [pr, cr].map(f => f.n.split(' (')[0].toLowerCase()).join(' & ') });
    }
    return out;
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

  function macros(list) {
    const F = FOOD(), t = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
    for (const [id, g] of list) { const f = F[id]; if (!f) continue; const k = g / 100; t.kcal += f.kcal * k; t.p += f.p * k; t.c += f.c * k; t.f += f.f * k; t.fib += (f.fib || 0) * k; }
    return t;
  }
  function solveLin(M, v) {
    const n = v.length, A = M.map((r, i) => r.concat([v[i]]));
    for (let c = 0; c < n; c++) {
      let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-9) return null;
      [A[c], A[piv]] = [A[piv], A[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let j = c; j <= n; j++) A[r][j] -= k * A[c][j]; }
    }
    return A.map((r, i) => r[n] / r[i]);
  }
  function roundG(id, g) {
    const f = FOOD()[id], step = f.step || 5;
    if (g < (f.step ? 3 : step * .6)) return 0;
    return Math.round(g / step) * step;
  }
  /* Portions : moindres carrés pondérés (protéines d'abord), bornes 0..max, énumération des contraintes actives */
  function solveMeal(meal, t) {
    const F = FOOD(), fixed = meal.items.filter(i => i[1] === 'X'), vars = meal.items.filter(i => i[1] !== 'X');
    const base = macros(fixed.map(([id, , g]) => [id, g])), r = [t.p - base.p, t.c - base.c, t.f - base.f], W = [4, 1, 1.6];
    const A = vars.map(([id]) => [F[id].p / 100, F[id].c / 100, F[id].f / 100]), mx = vars.map(([id]) => F[id].max || 500), n = vars.length;
    let best = null;
    for (let k = 0; k < 3 ** n; k++) {
      const st = []; let kk = k; for (let j = 0; j < n; j++) { st.push(kk % 3); kk = Math.floor(kk / 3); }
      const x = new Array(n).fill(0), free = [];
      for (let j = 0; j < n; j++) { if (st[j] === 2) x[j] = mx[j]; else if (st[j] === 0) free.push(j); }
      const rr = r.map((v, i) => v - x.reduce((s, xj, j) => s + A[j][i] * xj, 0));
      if (free.length) {
        const M = free.map(a => free.map(b => A[a].reduce((s, _, i) => s + W[i] * A[a][i] * A[b][i], 0)));
        const v = free.map(a => A[a].reduce((s, _, i) => s + W[i] * A[a][i] * rr[i], 0));
        const sol = solveLin(M, v); if (!sol) continue;
        let ok = true; free.forEach((j, q) => { x[j] = sol[q]; if (sol[q] < -1e-6 || sol[q] > mx[j] + 1e-6) ok = false; });
        if (!ok) continue;
      }
      const err = [0, 1, 2].reduce((s, i) => s + W[i] * (x.reduce((q, xj, j) => q + A[j][i] * xj, 0) - r[i]) ** 2, 0);
      if (!best || err < best.err - 1e-9) best = { err, x: x.slice() };
    }
    const items = fixed.map(([id, , g]) => ({ id, g, role: 'X' }))
      .concat(vars.map(([id, role], j) => ({ id, role, g: roundG(id, best ? best.x[j] : 0) })))
      .filter(i => i.g > 0);
    return { items, tot: macros(items.map(i => [i.id, i.g])) };
  }

  function dayPlan(p, T, date, picks = {}) {
    const split = SPLITS[p.meals || 4] || SPLITS[4], allowed = allowedMeals(p), used = new Set(), usedP = new Set();
    const LEVEL = { omni: ['m', 'p'], pesc: ['p'], vege: ['o'], vegan: ['v'] }, pFood = m => (m.items.find(i => i[1] === 'P') || [])[0];
    const meals = split.map(([slot, frac]) => {
      let pool = allowed.filter(m => m.slot === poolSlot(slot));
      if (poolSlot(slot) === 'repas') { const pref = pool.filter(m => (LEVEL[p.diet || 'omni'] || []).includes(m.d)); if (pref.length >= 3) pool = pref; }
      if (!pool.length) pool = fallbackMeals(slot, p);
      let meal = picks[slot] && pool.find(m => m.id === picks[slot]);
      if (!meal && pool.length) {
        let i = hash(date + slot + (p.planSeed || '')) % pool.length;
        for (let k = 0; k < pool.length && (used.has(pool[i].id) || usedP.has(pFood(pool[i]))); k++) i = (i + 1) % pool.length;
        meal = pool[i];
      }
      if (meal) { used.add(meal.id); usedP.add(pFood(meal)); }
      const tgt = { p: T.P * frac, c: T.C * frac, f: T.F * frac, kcal: T.kcal * frac };
      const sol = meal ? solveMeal(meal, tgt) : { items: [], tot: macros([]) };
      return Object.assign({ slot, name: SLOT_NAME[slot], frac, meal, tgt, pool }, sol);
    });
    const sum = () => meals.reduce((t, m) => { for (const k in t) t[k] += m.tot[k]; return t; }, { kcal: 0, p: 0, c: 0, f: 0, fib: 0 });
    /* 2e passe : l'écart du jour (portions plafonnées) est redistribué aux repas qui ont encore de la marge */
    for (let pass = 0; pass < 2; pass++) {
      const t = sum(), gap = { p: T.P - t.p, c: T.C - t.c, f: T.F - t.f };
      if (Math.abs(gap.p) < 4 && Math.abs(gap.c) < 10 && Math.abs(gap.f) < 4) break;
      const open = meals.filter(m => m.meal && m.items.some(it => it.role !== 'X' && it.g < (FOOD()[it.id].max || 500) - 5));
      const w = open.reduce((s, m) => s + m.frac, 0); if (!w) break;
      for (const m of open) {
        const k = m.frac / w, tgt = { p: m.tot.p + gap.p * k, c: m.tot.c + gap.c * k, f: m.tot.f + gap.f * k };
        Object.assign(m, solveMeal(m.meal, tgt));
      }
    }
    return { meals, tot: sum() };
  }
  function nextPick(meal, date) {
    const pool = meal.pool; if (!pool || pool.length < 2) return null;
    const i = pool.findIndex(m => m.id === meal.meal.id);
    return pool[(i + 1) % pool.length].id;
  }

  function shopping(p, T, from, days = 7, picksFor = () => ({})) {
    const sum = {};
    for (let d = 0; d < days; d++) {
      const date = G.addDays(from, d), plan = dayPlan(p, T, date, picksFor(date));
      for (const m of plan.meals) for (const it of m.items) sum[it.id] = (sum[it.id] || 0) + it.g;
    }
    const F = FOOD(), groups = {};
    for (const [id, g] of Object.entries(sum)) {
      const f = F[id]; (groups[f.cat] = groups[f.cat] || []).push({ id, name: f.n, g: Math.ceil(g / 10) * 10, units: f.unit ? Math.ceil(g / f.unit[0]) : null, unitName: f.unit && f.unit[2] });
    }
    for (const k in groups) groups[k].sort((a, b) => b.g - a.g);
    return groups;
  }

  /* ---------- Tendance du poids & ajustement ---------- */
  function weightSeries(days, health) {
    const map = {};
    if (health) for (const [d, v] of Object.entries(health)) if (v.weight) map[d] = { kg: v.weight, src: 'santé' };
    for (const [d, v] of Object.entries(days || {})) if (+v.weight) map[d] = { kg: +v.weight, src: 'app' };
    return Object.entries(map).map(([date, v]) => ({ date, kg: v.kg, src: v.src })).sort((a, b) => a.date.localeCompare(b.date));
  }
  function movingAvg(series, n = 7) {
    return series.map((pt, i) => {
      const from = G.addDays(pt.date, -(n - 1)), win = series.filter(q => q.date >= from && q.date <= pt.date);
      return { date: pt.date, kg: win.reduce((s, q) => s + q.kg, 0) / win.length };
    });
  }
  function trend(series, today = G.today()) {
    const win = (a, b) => series.filter(q => q.date >= G.addDays(today, a) && q.date <= G.addDays(today, b));
    const w1 = win(-6, 0), w0 = win(-13, -7);
    const avg = a => a.reduce((s, q) => s + q.kg, 0) / a.length;
    if (w1.length < 3 || w0.length < 3) return { ready: false, n1: w1.length, n0: w0.length, last: w1.length ? avg(w1) : null };
    return { ready: true, last: avg(w1), prev: avg(w0), delta: avg(w1) - avg(w0), n1: w1.length, n0: w0.length };
  }
  function advice(p, T, tr) {
    if (!T) return null;
    if (!tr || !tr.ready) return { status: 'wait', adj: 0, text: 'Pèse-toi le matin à jeun, au moins 3 fois par semaine pendant 2 semaines : l’app pourra alors ajuster tes calories.' };
    const tgt = T.rateKgWeek, d = tr.delta, g = p.goal || 'bulk', fmt = x => (x > 0 ? '+' : '') + x.toFixed(2).replace('.', ',');
    const head = `Tendance : ${fmt(d)} kg/sem (objectif ${fmt(tgt)}).`;
    if (g === 'recomp') {
      if (d > .25) return { status: 'high', adj: -100, text: head + ' Tu prends du poids : retire 100 kcal (25 g de glucides).' };
      if (d < -.25) return { status: 'low', adj: 100, text: head + ' Tu perds du poids : ajoute 100 kcal.' };
      return { status: 'ok', adj: 0, text: head + ' Parfait, garde ces apports.' };
    }
    if (g === 'cut') {
      if (d > tgt * .5) return { status: 'low', adj: -150, text: head + ' Perte trop lente : retire 150 kcal (≈ 35 g de glucides).' };
      if (d < tgt * 1.6) return { status: 'high', adj: 100, text: head + ' Perte trop rapide, risque de perdre du muscle : ajoute 100 kcal.' };
      return { status: 'ok', adj: 0, text: head + ' Dans la cible, ne change rien.' };
    }
    if (d < tgt * .5) return { status: 'low', adj: 150, text: head + ' Prise trop lente : ajoute 150 kcal (≈ 35 g de glucides, par exemple 45 g de riz cru).' };
    if (d > tgt * 1.6 + .1) return { status: 'high', adj: -100, text: head + ' Prise trop rapide (surtout du gras) : retire 100 kcal.' };
    return { status: 'ok', adj: 0, text: head + ' Dans la cible, ne change rien.' };
  }

  /* Journal alimentaire du jour */
  function dayLogTotals(day) {
    const t = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
    for (const e of (day && day.foods) || []) { t.kcal += +e.kcal || 0; t.p += +e.p || 0; t.c += +e.c || 0; t.f += +e.f || 0; t.fib += +e.fib || 0; }
    return t;
  }
  function entryFor(id, g) { const m = macros([[id, g]]), f = FOOD()[id]; return { id, name: f.n, g, kcal: Math.round(m.kcal), p: +m.p.toFixed(1), c: +m.c.toFixed(1), f: +m.f.toFixed(1), fib: +m.fib.toFixed(1) }; }
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function searchFoods(q) { const n = norm(q || ''); return G.FOODS.filter(f => !n || norm(f.n).includes(n)).slice(0, 12); }

  const TIPS = [
    ['Protéines à chaque repas', 'Environ 0,4 g par kg de poids corporel, 3 à 5 fois par jour, pour stimuler la synthèse musculaire.'],
    ['Autour de la séance', 'Un repas avec protéines et glucides 1 à 3 h avant, et un autre dans les heures qui suivent.'],
    ['Pèse-toi bien', 'Le matin, après les toilettes, avant de boire ou manger. Seule la moyenne sur 7 jours compte.'],
    ['Légumes et fibres', 'Au moins 5 portions de fruits et légumes par jour, et environ 30 g de fibres.'],
    ['Poisson gras', '1 à 2 fois par semaine (saumon, maquereau, sardines) pour les oméga-3.'],
    ['Sommeil', '7 à 9 h par nuit : c’est pendant le sommeil que le muscle se reconstruit.'],
    ['Alcool', 'Il freine la récupération et la synthèse des protéines : garde-le occasionnel.'],
    ['Hydratation', 'Bois régulièrement ; urines claires = bon signe. Ajoute 0,5 L par heure de sport.']
  ];

  G.nutri = { ACT, GOALS, DIET_FR, EXCL_FR, SLOT_NAME, SPLITS, targets, bmr, allowedMeals, dayPlan, solveMeal, nextPick, shopping, macros, weightSeries, movingAvg, trend, advice, dayLogTotals, entryFor, searchFoods, TIPS };
})(window.GYM = window.GYM || {});

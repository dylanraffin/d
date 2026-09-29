/* Programme : génération selon jours/semaine, niveau et matériel ; mésocycle de 6 semaines ;
   double progression ; 1RM estimé (Epley ajusté aux reps en réserve) ; échauffement ; disques. */
(function (G) {
  'use strict';
  const REPS = { main: [6, 10], sec: [8, 12], iso: [10, 15], pump: [12, 20], core: [10, 15] };
  const REST = { main: 180, sec: 120, iso: 90, pump: 60, core: 60 };
  /* Remplacements par slot : [salle complète, haltères + banc + barre de traction, poids du corps] */
  const SLOTS = {
    squat: [['squat', 'legpress', 'goblet'], ['goblet', 'bulgarian'], ['bulgarian']],
    squat2: [['legpress', 'bulgarian', 'goblet'], ['bulgarian', 'goblet'], ['bulgarian']],
    hinge: [['rdl', 'rdl_db'], ['rdl_db'], ['hipthrust']],
    glute: [['hipthrust'], ['hipthrust'], ['hipthrust']],
    lunge: [['bulgarian'], ['bulgarian'], ['bulgarian']],
    quadiso: [['legext'], ['goblet'], ['bulgarian']],
    hamiso: [['legcurl'], ['rdl_db'], ['hipthrust']],
    calf: [['calf'], ['calf'], ['calf']],
    hpush: [['bench', 'bench_db'], ['bench_db'], ['pushup']],
    ipush: [['incline_db'], ['incline_db'], ['pushup']],
    vpush: [['ohp', 'ohp_db'], ['ohp_db'], ['pushup']],
    dips: [['dips'], ['dips'], ['dips']],
    chestiso: [['cablefly'], ['bench_db'], ['pushup']],
    vpull: [['pullup', 'pulldown'], ['pullup'], ['pullup']],
    vpull2: [['pulldown', 'pullup'], ['pullup'], ['pullup']],
    hpull: [['row', 'cablerow', 'row_db'], ['row_db'], ['row_db']],
    hpull2: [['cablerow', 'row_db'], ['row_db'], ['row_db']],
    hpull3: [['row_db'], ['row_db'], ['row_db']],
    reardelt: [['facepull', 'reardelt'], ['reardelt'], ['reardelt']],
    reardelt2: [['reardelt', 'facepull'], ['reardelt'], ['reardelt']],
    sidedelt: [['lateral'], ['lateral'], ['lateral']],
    biceps: [['curl', 'curl_bar'], ['curl'], ['curl']],
    biceps2: [['hammer'], ['hammer'], ['hammer']],
    biceps3: [['curl_bar', 'curl'], ['curl'], ['curl']],
    triceps: [['pushdown', 'ohext'], ['ohext'], ['dips']],
    triceps2: [['ohext'], ['ohext'], ['pushup']],
    core: [['cablecrunch', 'legraise', 'plank'], ['legraise', 'plank'], ['plank', 'legraise']],
    core2: [['legraise', 'plank'], ['plank'], ['plank']]
  };
  const EQ_INDEX = { salle: 0, halteres: 1, pdc: 2 };

  const D = (key, name, focus, items) => ({ key, name, focus, items });
  const TEMPLATES = {
    3: [
      D('A', 'Full body A', 'Squat · Développé · Rowing', [['squat', 3, 'main'], ['hpush', 4, 'main'], ['hpull', 3, 'sec'], ['sidedelt', 2, 'pump'], ['biceps', 2, 'iso'], ['hamiso', 2, 'iso'], ['calf', 3, 'pump']]),
      D('B', 'Full body B', 'Hanches · Tirage · Pecs', [['hinge', 3, 'sec'], ['vpull', 3, 'sec'], ['chestiso', 3, 'iso'], ['vpush', 2, 'sec'], ['squat2', 2, 'iso'], ['triceps', 2, 'iso'], ['calf', 3, 'pump']]),
      D('C', 'Full body C', 'Unilatéral · Incliné · Dos', [['lunge', 3, 'sec'], ['ipush', 3, 'sec'], ['hpull2', 3, 'sec'], ['glute', 2, 'sec'], ['reardelt', 2, 'pump'], ['biceps2', 2, 'iso'], ['core', 2, 'core']])
    ],
    4: [
      D('H1', 'Haut A', 'Pecs · Dos · Épaules', [['hpush', 4, 'main'], ['hpull', 3, 'sec'], ['vpush', 2, 'sec'], ['vpull', 3, 'sec'], ['sidedelt', 3, 'pump'], ['biceps', 2, 'iso'], ['triceps', 2, 'iso']]),
      D('B1', 'Bas A', 'Quadriceps · Ischios', [['squat', 3, 'main'], ['hinge', 3, 'sec'], ['quadiso', 2, 'iso'], ['hamiso', 3, 'iso'], ['calf', 3, 'pump'], ['core', 2, 'core']]),
      D('H2', 'Haut B', 'Incliné · Dorsaux · Bras', [['ipush', 3, 'sec'], ['vpull2', 3, 'main'], ['hpull3', 3, 'sec'], ['chestiso', 3, 'iso'], ['reardelt', 3, 'pump'], ['biceps2', 2, 'iso'], ['triceps2', 2, 'iso']]),
      D('B2', 'Bas B', 'Fessiers · Unilatéral', [['squat2', 3, 'sec'], ['glute', 3, 'sec'], ['lunge', 2, 'sec'], ['hamiso', 2, 'iso'], ['quadiso', 2, 'iso'], ['calf', 3, 'pump'], ['core2', 2, 'core']])
    ],
    5: [
      D('U', 'Haut', 'Force haut du corps', [['hpush', 3, 'main'], ['hpull', 3, 'main'], ['vpush', 2, 'sec'], ['vpull', 3, 'sec'], ['sidedelt', 2, 'pump'], ['biceps', 2, 'iso'], ['triceps', 2, 'iso']]),
      D('L', 'Bas', 'Force bas du corps', [['squat', 3, 'main'], ['hinge', 3, 'sec'], ['quadiso', 2, 'iso'], ['hamiso', 2, 'iso'], ['calf', 3, 'pump']]),
      D('Pu', 'Push', 'Pecs · Épaules · Triceps', [['ipush', 3, 'sec'], ['dips', 3, 'sec'], ['chestiso', 3, 'iso'], ['sidedelt', 3, 'pump'], ['triceps2', 3, 'iso']]),
      D('Pl', 'Pull', 'Dos · Arrière d’épaule · Biceps', [['vpull2', 3, 'sec'], ['hpull2', 3, 'sec'], ['hpull3', 2, 'sec'], ['reardelt', 3, 'pump'], ['biceps2', 3, 'iso'], ['biceps3', 2, 'iso']]),
      D('Le', 'Jambes', 'Volume jambes', [['squat2', 3, 'sec'], ['glute', 3, 'sec'], ['lunge', 2, 'sec'], ['hamiso', 3, 'iso'], ['calf', 3, 'pump'], ['core', 3, 'core']])
    ],
    6: [
      D('PuA', 'Push A', 'Développé · Épaules', [['hpush', 3, 'main'], ['ipush', 3, 'sec'], ['vpush', 2, 'sec'], ['sidedelt', 2, 'pump'], ['triceps', 3, 'iso']]),
      D('PlA', 'Pull A', 'Tractions · Rowing', [['vpull', 3, 'main'], ['hpull', 3, 'sec'], ['reardelt', 2, 'pump'], ['biceps', 3, 'iso'], ['biceps2', 2, 'iso']]),
      D('LeA', 'Jambes A', 'Squat · Ischios', [['squat', 3, 'main'], ['hinge', 3, 'sec'], ['quadiso', 2, 'iso'], ['hamiso', 3, 'iso'], ['calf', 3, 'pump']]),
      D('PuB', 'Push B', 'Incliné · Dips', [['ipush', 3, 'sec'], ['dips', 3, 'sec'], ['chestiso', 3, 'iso'], ['sidedelt', 3, 'pump'], ['triceps2', 3, 'iso']]),
      D('PlB', 'Pull B', 'Dorsaux · Haut du dos', [['vpull2', 3, 'sec'], ['hpull2', 3, 'sec'], ['hpull3', 2, 'sec'], ['reardelt2', 2, 'pump'], ['biceps3', 3, 'iso']]),
      D('LeB', 'Jambes B', 'Fessiers · Unilatéral', [['squat2', 3, 'sec'], ['glute', 3, 'sec'], ['lunge', 3, 'sec'], ['hamiso', 3, 'iso'], ['calf', 3, 'pump'], ['core', 3, 'core']])
    ]
  };

  /* Mésocycle de 6 semaines : RIR décroissant puis décharge */
  const MESO = [
    { w: 1, rir: 3, label: 'Semaine 1 · prise en main', setsX: 1 }, { w: 2, rir: 2, label: 'Semaine 2 · accumulation', setsX: 1 },
    { w: 3, rir: 2, label: 'Semaine 3 · accumulation', setsX: 1 }, { w: 4, rir: 1, label: 'Semaine 4 · intensification', setsX: 1 },
    { w: 5, rir: 1, label: 'Semaine 5 · pic', setsX: 1 }, { w: 6, rir: 4, label: 'Semaine 6 · décharge', setsX: .5, deload: true }
  ];

  const dayMs = 864e5;
  const toDate = s => new Date(s + 'T12:00:00');
  function weekInfo(start, today = G.today()) {
    const d = Math.max(0, Math.floor((toDate(today) - toDate(start || today)) / dayMs));
    const idx = Math.floor(d / 7) % 6, cycle = Math.floor(d / 42) + 1;
    return Object.assign({ cycle, dayInCycle: d % 42 }, MESO[idx]);
  }

  function pick(slot, equip) {
    const opts = SLOTS[slot][EQ_INDEX[equip] ?? 0];
    return opts.find(id => G.moveById[id]) || opts[0];
  }

  function build(profile) {
    const days = +profile.days || 4, level = profile.level || 'inter', equip = profile.equip || 'salle';
    const swaps = profile.swaps || {};
    const tpl = TEMPLATES[days] || TEMPLATES[4];
    return tpl.map(d => ({
      key: d.key, name: d.name, focus: d.focus,
      items: dedupe(d.items.map(([slot, sets, rk], i) => {
        let s = sets;
        if (level === 'debutant' && (rk === 'sec' || rk === 'iso') && s > 2) s -= 1;
        if (level === 'avance' && i < 2) s += 1;
        const move = swaps[d.key + ':' + slot] || pick(slot, equip);
        const m = G.moveById[move];
        return { slot, move, sets: s, reps: m && m.timed ? [30, 60] : REPS[rk].slice(), rk, rest: REST[rk], timed: !!(m && m.timed) };
      }))
    }));
  }
  /* Sans matériel, plusieurs créneaux tombent sur le même exercice : on les fusionne (+1 série, 5 max) */
  function dedupe(items) {
    const seen = new Map();
    return items.filter(it => { const f = seen.get(it.move); if (f) { f.sets = Math.min(5, f.sets + 1); return false; } seen.set(it.move, it); return true; });
  }
  function alternatives(slot, equip) {
    const all = new Set([...SLOTS[slot][0], ...SLOTS[slot][1], ...SLOTS[slot][2]]);
    const pat = G.moveById[SLOTS[slot][0][0]]?.pattern;
    for (const m of G.moves) if (m.pattern === pat) all.add(m.id);
    return [...all].filter(id => G.moveById[id]);
  }

  function applyWeek(item, wk) {
    const sets = wk.deload ? Math.max(1, Math.ceil(item.sets * wk.setsX)) : item.sets;
    const rir = item.rk === 'pump' || item.rk === 'core' ? Math.max(0, wk.rir - 1) : wk.rir;
    return Object.assign({}, item, { sets, rir: wk.deload ? 4 : rir });
  }

  function nextDay(program, sessions) {
    const done = sessions.filter(s => s.dayKey).sort((a, b) => (a.date + (a.endedAt || '')).localeCompare(b.date + (b.endedAt || '')));
    if (!done.length) return 0;
    const last = done[done.length - 1], i = program.findIndex(d => d.key === last.dayKey);
    return i < 0 ? 0 : (i + 1) % program.length;
  }

  /* 1RM estimé : Epley en comptant les reps en réserve */
  const e1rm = (kg, reps, rir = 0) => (!kg || !reps) ? 0 : kg * (1 + (reps + (+rir || 0)) / 30);
  /* Exercices au poids du corps : la charge réelle inclut le corps (tractions, dips) ou une partie (pompes ≈ 64 %) */
  const BW_SHARE = { pullup: 1, dips: 1, pushup: .64 };
  const bodyweight = () => +((G.store && G.store.profile && G.store.profile.weight) || 0);
  const loadOf = (move, kg, bw = bodyweight()) => (+kg || 0) + (BW_SHARE[move] || 0) * bw;
  const bestSet = (sets, move) => sets.reduce((b, s) => { const v = e1rm(loadOf(move, s.kg), +s.reps, s.rir); return v > b.v ? { v, s } : b; }, { v: 0, s: null });

  /* Historique d'un mouvement : [{date, sets}] trié */
  function historyOf(moveId, sessions) {
    const out = [];
    for (const s of sessions) for (const ex of (s.exercises || [])) if (ex.move === moveId) {
      const sets = (ex.sets || []).filter(x => x.done !== false && (+x.reps > 0));
      if (sets.length) out.push({ date: s.date, sets, id: s.id });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  const roundTo = (x, step) => Math.round(x / step) * step;
  function incFor(m, profile) {
    if (!m.inc) return 0;
    if (m.equip === 'barre' && ['squat', 'hinge'].includes(m.pattern) && profile.level === 'debutant') return 5;
    return m.inc;
  }

  /* Double progression */
  function suggest(item, hist, profile, wk) {
    const m = G.moveById[item.move], [lo, hi] = item.reps, rir = item.rir ?? 2;
    if (item.timed) {
      const last = hist[hist.length - 1];
      const best = last ? Math.max(...last.sets.map(s => +s.reps || 0)) : 0;
      return { kg: null, reps: best ? Math.min(90, best + 5) : 30, note: best ? `Vise ${Math.min(90, best + 5)} s (dernière fois ${best} s).` : 'Commence par 30 s, corps bien aligné.' };
    }
    if (!hist.length) return { kg: null, reps: hi, note: `Première fois : choisis une charge pour ${lo}–${hi} reps en gardant ${rir} reps en réserve.` };
    const last = hist[hist.length - 1], prev = hist[hist.length - 2];
    const top = Math.max(...last.sets.map(s => +s.kg || 0));
    const atTop = last.sets.filter(s => (+s.kg || 0) === top);
    const inc = incFor(m, profile);
    const allHigh = atTop.length >= Math.min(item.sets, 2) && atTop.every(s => +s.reps >= hi && (s.rir == null || s.rir === '' || +s.rir >= Math.max(0, rir - 1)));
    const low = s => s.sets.some(x => +x.reps < lo);
    if (wk && wk.deload) return { kg: top ? roundTo(top * .9, inc || 1) : null, reps: lo, note: 'Décharge : −10 % et moitié des séries. Récupère.' };
    if (!top && m.equip === 'pdc') {
      const best = Math.max(...last.sets.map(s => +s.reps || 0));
      if (best >= hi + 5) return { kg: null, reps: lo, note: `${best} reps : ajoute du lest (sac à dos) pour revenir dans ${lo}–${hi}.` };
      return { kg: null, reps: Math.min(best + 1, hi + 5), note: `Vise ${Math.min(best + 1, hi + 5)} reps par série.` };
    }
    if (allHigh && inc) return { kg: top + inc, reps: lo, up: true, note: `Haut de fourchette atteint : +${String(inc).replace('.', ',')} kg, repars à ${lo} reps.` };
    if (low(last) && prev && low(prev)) return { kg: roundTo(top * .9, inc || 1), reps: lo, note: 'Deux séances sous la fourchette : baisse de 10 % et remonte proprement.' };
    const bestReps = Math.max(...atTop.map(s => +s.reps || 0));
    return { kg: top, reps: Math.min(hi, bestReps + 1), note: `Même charge, vise ${Math.min(hi, bestReps + 1)} reps sur chaque série.` };
  }

  /* Échauffement progressif (premier exercice polyarticulaire) */
  function warmups(kg, m) {
    if (!kg || !m || m.kind !== 'compound') return [];
    if (m.equip === 'barre') {
      const out = [{ kg: 20, reps: 10 }];
      for (const [p, r] of [[.5, 8], [.7, 5], [.85, 3]]) { const w = roundTo(kg * p, 2.5); if (w > out[out.length - 1].kg && w < kg) out.push({ kg: w, reps: r }); }
      return out;
    }
    return [[.5, 10], [.75, 5]].map(([p, r]) => ({ kg: roundTo(kg * p, m.equip === 'halteres' ? 2 : 5), reps: r })).filter(w => w.kg > 0 && w.kg < kg);
  }

  /* Disques par côté (barre de 20 kg) */
  const PLATES = [[25, '#d8342c'], [20, '#2f64c8'], [15, '#e3b21b'], [10, '#2f9a58'], [5, '#f1f1ee'], [2.5, '#2a2d2c'], [1.25, '#b9c0bd']];
  function plates(kg, bar = 20) {
    let side = (kg - bar) / 2; const out = [];
    if (side < 0) return null;
    for (const [p, c] of PLATES) while (side >= p - 1e-9) { out.push({ kg: p, color: c }); side -= p; }
    return { perSide: out, rest: Math.round(side * 100) / 100 };
  }

  /* Volume hebdomadaire par groupe (principal = 1 série, secondaire = 0,5) */
  function weeklyVolume(sessions, from, to) {
    const res = Object.fromEntries(G.VOLUME_GROUPS.map(g => [g.id, 0]));
    for (const s of sessions) {
      if (s.date < from || s.date > to) continue;
      for (const ex of (s.exercises || [])) {
        const m = G.moveById[ex.move]; if (!m) continue;
        const n = (ex.sets || []).filter(x => x.done !== false && +x.reps > 0).length; if (!n) continue;
        for (const g of G.VOLUME_GROUPS) {
          if (g.m.some(x => m.muscles.p.includes(x))) res[g.id] += n;
          else if (g.m.some(x => (m.muscles.s || []).includes(x))) res[g.id] += n * .5;
        }
      }
    }
    return res;
  }

  function sessionStats(s) {
    let vol = 0, sets = 0;
    for (const ex of (s.exercises || [])) for (const x of (ex.sets || [])) if (x.done !== false && +x.reps > 0) { sets++; vol += (+x.kg || 0) * (+x.reps || 0); }
    return { vol: Math.round(vol), sets };
  }

  /* Records : meilleur 1RM estimé par mouvement, avant une date */
  function bests(sessions, beforeDate) {
    const b = {};
    for (const s of sessions) { if (beforeDate && s.date >= beforeDate) continue;
      for (const ex of (s.exercises || [])) { const v = bestSet((ex.sets || []).filter(x => x.done !== false), ex.move).v; if (v > (b[ex.move]?.v || 0)) b[ex.move] = { v, date: s.date }; } }
    return b;
  }

  /* Revue sur 30 jours : régularité, progrès et stagnations */
  function review(sessions, profile, today = G.today()) {
    const from = G.addDays(today, -29), recent = sessions.filter(s => s.date >= from && s.date <= today);
    const planned = Math.round((+profile.days || 4) * 30 / 7);
    const moves = {};
    for (const s of sessions) for (const ex of (s.exercises || [])) {
      const v = bestSet((ex.sets || []).filter(x => x.done !== false), ex.move).v; if (!v) continue;
      (moves[ex.move] = moves[ex.move] || []).push({ date: s.date, v });
    }
    const prog = [], stall = [];
    for (const [id, arr] of Object.entries(moves)) {
      arr.sort((a, b) => a.date.localeCompare(b.date));
      const inWin = arr.filter(x => x.date >= from);
      if (inWin.length >= 2) { const d = (inWin[inWin.length - 1].v - inWin[0].v) / inWin[0].v; prog.push({ id, pct: d }); }
      if (arr.length >= 3) { const l3 = arr.slice(-3), bestBefore = Math.max(0, ...arr.slice(0, -3).map(x => x.v)); if (Math.max(...l3.map(x => x.v)) <= Math.max(bestBefore, l3[0].v) * 1.005) stall.push(id); }
    }
    prog.sort((a, b) => b.pct - a.pct);
    return { count: recent.length, planned, adherence: planned ? recent.length / planned : 0, top: prog.slice(0, 3), stall };
  }

  G.program = { SLOTS, TEMPLATES, MESO, REPS, build, pick, alternatives, applyWeek, weekInfo, nextDay, e1rm, bestSet, loadOf, BW_SHARE, historyOf, suggest, warmups, plates, PLATES, weeklyVolume, sessionStats, bests, review };
})(window.GYM = window.GYM || {});

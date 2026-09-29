/* Bibliothèque de mouvements (1/3) : outils communs + jambes & fessiers.
   Chaque mouvement : pose(u) avec u ∈ [0,1], accessoires, consignes, erreurs fréquentes. */
(function (G) {
  'use strict';
  const A = G.anim, L = A.L, { lerp, dirT, faceT, add, mul, sub, nrm } = A.v;
  const sin = d => Math.sin(d * A.D), cos = d => Math.cos(d * A.D);

  G.MUSCLE_FR = {
    quads: 'Quadriceps', glutes: 'Fessiers', hams: 'Ischio-jambiers', calves: 'Mollets', adductors: 'Adducteurs',
    pecs: 'Pectoraux', lats: 'Dorsaux', traps: 'Trapèzes', lowback: 'Lombaires', delts: 'Épaules',
    reardelts: 'Arrière d’épaule', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Avant-bras', abs: 'Abdominaux'
  };
  /* Groupes suivis pour le volume hebdomadaire (séries dures par groupe) */
  /* Groupes suivis pour le volume hebdomadaire (séries dures ; principal = 1, secondaire = 0,5).
     Zones indicatives (niveau intermédiaire) : plus basses pour les petits muscles, qui travaillent déjà en indirect. */
  G.VOLUME_GROUPS = [
    { id: 'pecs', name: 'Pectoraux', m: ['pecs'], lo: 10, hi: 20 }, { id: 'dos', name: 'Dos', m: ['lats', 'traps'], lo: 10, hi: 24 },
    { id: 'epaules', name: 'Épaules', m: ['delts', 'reardelts'], lo: 8, hi: 32 }, { id: 'biceps', name: 'Biceps', m: ['biceps'], lo: 8, hi: 20 },
    { id: 'triceps', name: 'Triceps', m: ['triceps'], lo: 6, hi: 18 }, { id: 'quads', name: 'Quadriceps', m: ['quads'], lo: 8, hi: 20 },
    { id: 'ischios', name: 'Ischios', m: ['hams'], lo: 6, hi: 16 }, { id: 'fessiers', name: 'Fessiers', m: ['glutes'], lo: 4, hi: 26 },
    { id: 'mollets', name: 'Mollets', m: ['calves'], lo: 6, hi: 16 }, { id: 'abdos', name: 'Abdos', m: ['abs'], lo: 3, hi: 16 }
  ];
  /* Zone selon le niveau : un débutant progresse avec moins, un avancé tolère plus */
  G.volumeZone = (g, level) => level === 'debutant' ? [Math.round(g.lo * .8), Math.round(g.hi * .9)] : level === 'avance' ? [g.lo, Math.round(g.hi * 1.3)] : [g.lo, g.hi];
  G.LIB_GROUPS = [
    { id: 'jambes', name: 'Jambes' }, { id: 'pecs', name: 'Pectoraux' }, { id: 'dos', name: 'Dos' },
    { id: 'epaules', name: 'Épaules' }, { id: 'bras', name: 'Bras' }, { id: 'abdos', name: 'Abdos' }
  ];
  G.EQUIP_FR = { barre: 'Barre', halteres: 'Haltères', machine: 'Machine', poulie: 'Poulie', pdc: 'Poids du corps' };

  /* Phases : excentrique d'abord (squat, développé…) ou concentrique d'abord (tirage, curl…) */
  G.ph = {
    ecc: (e, b, c, t, cues, lab = ['Descente', 'Bas', 'Poussée', 'Haut']) => [
      { to: 1, d: e, label: lab[0], cue: cues[0] }, { hold: b, label: lab[1], cue: cues[1] },
      { to: 0, d: c, label: lab[2], cue: cues[2], con: true }, { hold: t, label: lab[3], cue: cues[3] }],
    con: (c, t, e, b, cues, lab = ['Contraction', 'Pic', 'Retour contrôlé', 'Étirement']) => [
      { to: 1, d: c, label: lab[0], cue: cues[0], con: true }, { hold: t, label: lab[1], cue: cues[1] },
      { to: 0, d: e, label: lab[2], cue: cues[2] }, { hold: b, label: lab[3], cue: cues[3] }]
  };

  G.moves = G.moves || []; G.moveById = G.moveById || {};
  G.addMoves = list => { for (const m of list) { G.moves.push(m); G.moveById[m.id] = m; } };

  const hands = J => mul(add(J.haR, J.haL), .5);
  G.mvh = { hands, sin, cos };

  /* ---------------- Jambes ---------------- */
  const squatPose = u => {
    const t = lerp(6, 40, u), hy = lerp(.95, .47, u);
    const hx = .045 - ((L.torso - .02) * sin(t) - .07 * cos(t));
    return { hx, hy, t, n: -.45 * t, az: .16, kp: [1, 0, .35], hf: 't', wx: -.07, wy: -.02, wz: .42, ep: [-.3, -1, .5] };
  };

  const rdlPose = (gz) => u => {
    const p = { hx: lerp(0, -.30, u), hy: lerp(.945, .78, u), t: lerp(4, 62, u), n: -8 * u, az: .12, kp: [1, 0, .1], ep: [-1, -.2, .2] };
    A.hang(p, .05, gz); return p;
  };

  const dlKeys = [[0, { hx: -.25, hy: .55, by: .225 }], [.45, { hx: -.30, hy: .76, by: .50 }], [1, { hx: 0, hy: .945, by: .864 }]];
  const dlPose = u => {
    const k = A.keys(dlKeys, u), t = A.torsoForBar(k.hx, k.hy, .06, k.by, .23);
    return { hx: k.hx, hy: k.hy, t, n: -10 * (1 - u), az: .13, kp: [1, 0, .15], hf: 'w', wx: .06, wy: k.by, wz: .23, ep: [-1, -.2, .2] };
  };

  const legPress = u => {
    const ext = [.562, 1.174], d = lerp(0, .26, u);
    return { hx: 0, hy: .55, t: -52, n: 20, ax: ext[0] - d * .707, ay: ext[1] - d * .707, az: .14, aa: 135, kp: [-.6, .8, .25],
      hf: 'w', wx: .02, wy: .52, wz: .3, ep: [-.3, -1, .3] };
  };

  const kneeArc = (theta, K) => [K[0] + L.shin * sin(theta), K[1] - L.shin * cos(theta)];

  G.addMoves([
    {
      id: 'squat', name: 'Squat barre', group: 'jambes', pattern: 'squat', equip: 'barre', kind: 'compound', inc: 2.5,
      muscles: { p: ['quads', 'glutes'], s: ['adductors', 'lowback', 'abs'] }, cam: 22,
      pose: squatPose, track: J => A.torsoPt(J.p, -.07, -.02),
      props: (J, P, p) => P.barbell(A.torsoPt(p, -.07, -.02)),
      phases: G.ph.ecc(2, .4, 1.1, .7, ['Hanches en arrière et en bas, genoux dans l’axe des pieds', 'Reste gainé, genoux poussés vers l’extérieur', 'Pousse le sol, épaules et hanches montent ensemble', 'Respire en haut, regaine avant la rep suivante']),
      cues: ['Barre sur les trapèzes, mains serrées, coudes sous la barre.', 'Inspire et bloque le ventre avant chaque descente.', 'Pieds largeur d’épaules, pointes légèrement ouvertes.', 'Descends au moins cuisses parallèles si ta mobilité le permet.', 'La barre reste à la verticale du milieu du pied (regarde la trajectoire).'],
      errors: ['Genoux qui rentrent vers l’intérieur en remontant.', 'Talons qui décollent.', 'Fesses qui remontent avant la poitrine (le squat devient un good morning).', 'Dos qui s’arrondit en bas de mouvement.'],
      tip: 'Chaussures plates et stables. Barre à hauteur d’aisselles dans le rack, sécurités réglées juste sous ta profondeur.',
      video: 'squat barre technique'
    },
    {
      id: 'goblet', name: 'Goblet squat', group: 'jambes', pattern: 'squat', equip: 'halteres', kind: 'compound', inc: 2,
      muscles: { p: ['quads', 'glutes'], s: ['adductors', 'abs'] }, cam: 22,
      pose: u => ({ hx: lerp(.02, -.17, u), hy: lerp(.95, .45, u), t: lerp(4, 26, u), n: -.5 * lerp(4, 26, u), az: .17, kp: [1, 0, .4],
        hf: 't', wx: .2, wy: -.15, wz: .05, ep: [.2, -1, .4] }),
      props: (J, P) => P.db(add(hands(J), [0, -.01, 0]), [0, 1, 0]),
      phases: G.ph.ecc(2, .5, 1.1, .6, ['Descends entre tes jambes, buste droit', 'Coudes à l’intérieur des genoux', 'Pousse le sol, garde l’haltère collé', 'Serre les fessiers en haut']),
      cues: ['Haltère tenu verticalement contre le sternum.', 'Buste droit, regard devant.', 'Descends profond : le poids devant toi aide à rester équilibré.', 'Idéal pour apprendre le squat ou s’entraîner à la maison.'],
      errors: ['Haltère qui s’éloigne du corps.', 'Talons qui décollent.', 'Descente trop rapide sans contrôle.'],
      tip: 'Si tu manques de mobilité de chevilles, surélève légèrement les talons (disques de 2,5 kg).',
      video: 'goblet squat technique'
    },
    {
      id: 'legpress', name: 'Presse à cuisses', group: 'jambes', pattern: 'squat', equip: 'machine', kind: 'compound', inc: 5,
      muscles: { p: ['quads', 'glutes'], s: ['adductors'] }, cam: 18,
      pose: legPress,
      props: (J, P, p) => {
        const dir = [.707, .707, 0], nrmP = [-.707, .707, 0], sole = mul(add(J.footR.heel, J.footR.toe), .5);
        const pc = add([sole[0], sole[1], 0], mul(dir, .035));
        const H = J.H, d1 = J.d1, f1 = J.f1;
        return [
          P.box(pc, mul(nrmP, .3), mul(dir, .03), [0, 0, .34], A.COL.iron, -.3),
          P.box(add(pc, mul(dir, .16)), mul(dir, .12), mul(nrmP, .22), [0, 0, .36], A.COL.iron, -.5),
          P.box([.75, .75, .46], mul(dir, 1.02), mul(nrmP, .03), [0, 0, .03], A.COL.iron, -.8),
          P.box([.75, .75, -.46], mul(dir, 1.02), mul(nrmP, .03), [0, 0, .03], A.COL.iron, -.8),
          P.box([.02, .44, 0], [.2, 0, 0], [0, .04, 0], [0, 0, .2], A.COL.pad, -.6),
          P.pad(add(add(H, mul(d1, .3)), mul(f1, -.14)), d1, .34, .04, .2),
          P.box([.0, .2, 0], [.06, 0, 0], [0, .2, 0], [0, 0, .16], A.COL.iron, -.9)
        ];
      },
      phases: G.ph.ecc(2, .3, 1.1, .5, ['Plie les genoux vers la poitrine, bas du dos collé', 'Garde les fesses sur le siège', 'Pousse avec tout le pied', 'Ne verrouille pas complètement les genoux']),
      cues: ['Pieds largeur de hanches au milieu du plateau.', 'Bas du dos et fesses restent en contact avec le dossier.', 'Descends aussi bas que possible sans que le bassin décolle.', 'Pieds plus hauts = plus de fessiers ; plus bas = plus de quadriceps.'],
      errors: ['Bassin qui s’enroule et décolle en bas.', 'Genoux verrouillés brutalement en haut.', 'Amplitude réduite pour charger plus lourd.'],
      tip: 'Note la position du siège et des pieds dans tes notes pour reproduire la même amplitude à chaque séance.',
      video: 'presse à cuisses technique'
    },
    {
      id: 'rdl', name: 'Soulevé de terre roumain', group: 'jambes', pattern: 'hinge', equip: 'barre', kind: 'compound', inc: 2.5,
      muscles: { p: ['hams', 'glutes'], s: ['lowback', 'traps', 'forearms'] }, cam: 22,
      pose: rdlPose(.23), track: J => hands(J), props: (J, P) => P.barbell(hands(J)),
      phases: G.ph.ecc(2, .3, 1.1, .5, ['Hanches vers l’arrière, barre qui frôle les cuisses', 'Étirement des ischios, dos neutre', 'Pousse les hanches vers l’avant', 'Serre les fessiers, sans cambrer']),
      cues: ['Genoux légèrement fléchis et fixes pendant tout le mouvement.', 'Pense « fermer une porte avec les fesses ».', 'Descends jusqu’à l’étirement des ischios (souvent sous les genoux).', 'Épaules en arrière, barre collée au corps.'],
      errors: ['Dos qui s’arrondit pour descendre plus bas.', 'Barre qui s’éloigne des jambes.', 'Transformer le mouvement en squat (genoux qui avancent).'],
      tip: 'Commence léger : la sensation d’étirement dans l’arrière des cuisses compte plus que la charge.',
      video: 'soulevé de terre roumain technique'
    },
    {
      id: 'rdl_db', name: 'Soulevé de terre roumain haltères', group: 'jambes', pattern: 'hinge', equip: 'halteres', kind: 'compound', inc: 2,
      muscles: { p: ['hams', 'glutes'], s: ['lowback', 'forearms'] }, cam: 24,
      pose: rdlPose(.2), props: (J, P) => [...P.db(J.haR, [1, 0, 0]), ...P.db(J.haL, [1, 0, 0])],
      phases: G.ph.ecc(2, .3, 1.1, .5, ['Hanches en arrière, haltères le long des jambes', 'Étirement des ischios, dos neutre', 'Pousse les hanches vers l’avant', 'Serre les fessiers']),
      cues: ['Mêmes règles que la version barre.', 'Haltères qui glissent le long des cuisses puis des tibias.', 'Parfait à la maison ou quand la barre est prise.'],
      errors: ['Dos rond.', 'Haltères qui partent vers l’avant.'],
      tip: 'Garde la nuque dans l’alignement du dos : regarde le sol à 1–2 m devant toi.',
      video: 'soulevé de terre roumain haltères'
    },
    {
      id: 'deadlift', name: 'Soulevé de terre', group: 'jambes', pattern: 'hinge', equip: 'barre', kind: 'compound', inc: 2.5,
      muscles: { p: ['glutes', 'hams', 'lowback'], s: ['quads', 'traps', 'forearms', 'lats'] }, cam: 22,
      pose: dlPose, track: J => hands(J), props: (J, P) => P.barbell(hands(J)),
      phases: G.ph.con(1.2, .5, 1.4, .6, ['Pousse le sol, barre collée aux tibias', 'Hanches et genoux verrouillés, épaules en arrière', 'Hanches en arrière d’abord, puis plie les genoux', 'Repose la barre, regaine avant la suivante'], ['Tirage', 'Verrouillage', 'Descente', 'Reset']),
      cues: ['Barre au-dessus du milieu du pied, tibias à 2–3 cm.', 'Prends la barre, abaisse les hanches jusqu’au contact tibias.', 'Bras tendus, dorsaux serrés (« protège tes aisselles »).', 'Pousse le sol : la barre monte à la verticale.'],
      errors: ['Tirer avec les bras pliés.', 'Hanches qui montent trop vite.', 'Hyper-cambrure en haut.', 'Barre qui s’éloigne des jambes.'],
      tip: 'Pour la prise de muscle, le roumain suffit souvent ; garde le soulevé de terre classique en séries de 3 à 6 reps.',
      video: 'soulevé de terre technique débutant'
    },
    {
      id: 'bulgarian', name: 'Fentes bulgares', group: 'jambes', pattern: 'lunge', equip: 'halteres', kind: 'compound', inc: 2,
      muscles: { p: ['quads', 'glutes'], s: ['adductors', 'hams'] }, cam: 24,
      pose: u => ({ hx: lerp(-.20, -.30, u), hy: lerp(.88, .52, u), t: lerp(12, 22, u), n: -10, ax: .12, ay: .08, az: .12,
        bx: -.72, by: .50, bz: .12, ba: 200, kp: [1, 0, .12], kq: [.2, -1, 0], hf: 's', wx: .04, wy: -.6, wz: .24, ep: [-1, -.2, .2] }),
      props: (J, P) => [...P.bench(-1.02, -.58, .45), ...P.db(J.haR, [1, 0, 0]), ...P.db(J.haL, [1, 0, 0])],
      phases: G.ph.ecc(1.8, .3, 1.1, .5, ['Descends à la verticale, genou arrière vers le sol', 'Étirement du fessier avant', 'Pousse avec le talon avant', 'Hanche avant verrouillée']),
      cues: ['Dessus du pied arrière posé sur le banc.', 'Le pied avant assez loin pour que le tibia reste presque vertical.', 'Buste légèrement penché = plus de fessiers.', 'Fais toutes les reps d’une jambe, puis change.'],
      errors: ['Pied avant trop proche du banc.', 'Genou avant qui rentre.', 'Pousser avec la jambe arrière.'],
      tip: 'Commence au poids du corps : l’équilibre vient en 2–3 séances.',
      video: 'fentes bulgares technique'
    },
    {
      id: 'hipthrust', name: 'Hip thrust', group: 'jambes', pattern: 'glute', equip: 'barre', kind: 'compound', inc: 5,
      muscles: { p: ['glutes'], s: ['hams', 'quads'] }, cam: 24,
      pose: u => {
        const t = lerp(-58, -92, u), S = [-.52, .50];
        const hx = S[0] - L.torso * sin(t), hy = S[1] - L.torso * cos(t);
        const f = faceT(t), d = dirT(t), bar = [hx + f[0] * .13 + d[0] * .02, hy + f[1] * .13 + d[1] * .02];
        return { hx, hy, t, n: 35, ax: .40, ay: .08, az: .15, kp: [.3, 1, .15], hf: 'w', wx: bar[0], wy: bar[1] + .01, wz: .35, ep: [0, 1, .5] };
      },
      track: J => hands(J),
      props: (J, P, p) => [P.box([-.72, .21, 0], [.16, 0, 0], [0, .21, 0], [0, 0, .55], A.COL.pad, -.6), ...P.barbell([p.wx, p.wy - .01, 0])],
      phases: G.ph.con(1, .9, 1.4, .4, ['Pousse dans les talons, monte les hanches', 'Serre fort les fessiers, menton rentré', 'Redescends en contrôlant', 'Effleure le sol, sans relâcher'], ['Poussée', 'Contraction', 'Descente', 'Bas']),
      cues: ['Bas des omoplates sur le bord du banc.', 'Barre sur le pli de la hanche (avec une mousse).', 'En haut : tibias verticaux, bassin rétroversé, pas de cambrure.', 'Regard vers les genoux tout au long du mouvement.'],
      errors: ['Cambrer le bas du dos au lieu de monter les hanches.', 'Pieds trop loin (ischios) ou trop près (quadriceps).', 'Pas de pause en haut.'],
      tip: 'À la maison : même mouvement avec les épaules sur le canapé et un sac à dos lesté.',
      video: 'hip thrust technique'
    },
    {
      id: 'legext', name: 'Leg extension', group: 'jambes', pattern: 'quadiso', equip: 'machine', kind: 'iso', inc: 5,
      muscles: { p: ['quads'], s: [] }, cam: 20,
      pose: u => {
        const th = lerp(-8, 84, u), K = [.44, .58], a = kneeArc(th, K);
        return { hx: 0, hy: .58, t: -10, n: 8, ax: a[0], ay: a[1], az: .12, aa: th, kp: [0, 1, .1], hf: 'w', wx: .08, wy: .52, wz: .27, ep: [-.2, -1, .3] };
      },
      props: (J, P, p) => {
        const K = [.44, .58, 0], sh = nrm(sub(J.ankR, J.kneeR)), fn = [-sh[1], sh[0], 0];
        const roll = add(add([J.ankR[0], J.ankR[1], 0], mul(fn, .075)), mul(sh, -.03));
        return [
          P.box([.2, .5, 0], [.26, 0, 0], [0, .045, 0], [0, 0, .2], A.COL.pad, -.6),
          P.pad(add(add(J.H, mul(J.d1, .32)), mul(J.f1, -.14)), J.d1, .32, .04, .2),
          P.box([.1, .23, 0], [.08, 0, 0], [0, .23, 0], [0, 0, .16], A.COL.iron, -.9),
          P.cyl(add(K, [0, 0, -.26]), add(K, [0, 0, .26]), .03, A.COL.steel, -.4),
          P.line(add(K, [0, 0, .26]), add(roll, [0, 0, .26]), .035, A.COL.iron, .3),
          P.cyl(add(roll, [0, 0, -.2]), add(roll, [0, 0, .2]), .05, A.COL.pad, .01)
        ];
      },
      phases: G.ph.con(1, .8, 1.8, .3, ['Tends les jambes jusqu’en haut', 'Serre les quadriceps 1 s', 'Redescends lentement', 'Étirement, sans poser la charge']),
      cues: ['Axe de la machine aligné avec le genou.', 'Rouleau posé au-dessus des chevilles.', 'Tiens les poignées pour garder les fesses sur le siège.', 'Contrôle la descente sur 2 secondes.'],
      errors: ['Donner de l’élan.', 'Lever les fesses du siège.', 'Amplitude partielle en bas.'],
      tip: 'Excellent en fin de séance jambes pour les quadriceps, en séries de 10 à 20 reps.',
      video: 'leg extension machine technique'
    },
    {
      id: 'legcurl', name: 'Leg curl assis', group: 'jambes', pattern: 'hamiso', equip: 'machine', kind: 'iso', inc: 5,
      muscles: { p: ['hams'], s: ['calves'] }, cam: 20,
      pose: u => {
        const th = lerp(80, -28, u), K = [.44, .58], a = kneeArc(th, K);
        return { hx: 0, hy: .58, t: -14, n: 12, ax: a[0], ay: a[1], az: .12, aa: Math.max(th, 0) * .7, kp: [0, 1, .1], hf: 'w', wx: .1, wy: .56, wz: .27, ep: [-.2, -1, .3] };
      },
      props: (J, P) => {
        const K = [.44, .58, 0], sh = nrm(sub(J.ankR, J.kneeR)), fn = [-sh[1], sh[0], 0];
        const roll = add(add([J.ankR[0], J.ankR[1], 0], mul(fn, -.075)), mul(sh, -.03));
        return [
          P.box([.2, .5, 0], [.26, 0, 0], [0, .045, 0], [0, 0, .2], A.COL.pad, -.6),
          P.pad(add(add(J.H, mul(J.d1, .32)), mul(J.f1, -.14)), J.d1, .32, .04, .2),
          P.box([.1, .23, 0], [.08, 0, 0], [0, .23, 0], [0, 0, .16], A.COL.iron, -.9),
          P.cyl([.36, .70, -.24], [.36, .70, .24], .05, A.COL.pad, .05),
          P.cyl(add(K, [0, 0, -.26]), add(K, [0, 0, .26]), .03, A.COL.steel, -.4),
          P.line(add(K, [0, 0, .26]), add(roll, [0, 0, .26]), .035, A.COL.iron, .3),
          P.cyl(add(roll, [0, 0, -.2]), add(roll, [0, 0, .2]), .05, A.COL.pad, .01)
        ];
      },
      phases: G.ph.con(1, .6, 1.8, .4, ['Ramène les talons sous le siège', 'Serre les ischios', 'Remonte lentement', 'Étirement complet']),
      cues: ['Genoux alignés avec l’axe de la machine.', 'Cale le rouleau de cuisse bien serré.', 'Penche légèrement le buste vers l’avant pour plus d’étirement.', 'Pointes de pieds vers toi (flexion de cheville).'],
      errors: ['Soulever les hanches.', 'Relâcher la charge en haut.', 'Aller trop vite en excentrique.'],
      tip: 'La version assise étire davantage les ischios que la version allongée : c’est un bon choix pour l’hypertrophie.',
      video: 'leg curl assis technique'
    },
    {
      id: 'calf', name: 'Mollets debout', group: 'jambes', pattern: 'calf', equip: 'halteres', kind: 'iso', inc: 2,
      muscles: { p: ['calves'], s: [] }, cam: 18,
      pose: u => {
        const aa = -lerp(0, 34, u), c = cos(aa), s = sin(aa), ball = [.13, .02];
        const ax = ball[0] - (.13 * c - (-.06) * s), ay = ball[1] - (.13 * s + (-.06) * c);
        return { hx: ax - .0, hy: .955 + (ay - .08), t: 2, ax, ay, az: .12, aa, hf: 's', wx: .03, wy: -.6, wz: .24, ep: [-1, -.2, .2] };
      },
      props: (J, P) => [...P.db(J.haR, [1, 0, 0]), ...P.db(J.haL, [1, 0, 0])],
      phases: G.ph.con(.9, 1, 1.5, 1, ['Monte le plus haut possible sur la pointe', 'Tiens 1 s en haut', 'Redescends lentement', 'Étire 1 s en bas (sur une marche : talons sous le niveau)']),
      cues: ['Idéalement sur une marche pour une amplitude complète.', 'Genoux tendus mais pas verrouillés.', 'Pause en bas : c’est l’étirement qui fait progresser le mollet.', 'Séries longues : 10 à 20 reps.'],
      errors: ['Rebondir en bas.', 'Plier les genoux pour tricher.', 'Amplitude minuscule.'],
      tip: 'Tiens-toi à un support d’une main pour l’équilibre et un haltère dans l’autre.',
      video: 'mollets debout technique'
    }
  ]);

  /* Barre olympique centrée entre les mains (partagée avec les autres fichiers) */
  G.mvh.barAtHands = (J, P) => P.barbell(hands(J));
})(window.GYM = window.GYM || {});

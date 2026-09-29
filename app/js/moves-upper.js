/* Bibliothèque de mouvements (2/3) : pectoraux, dos, épaules. */
(function (G) {
  'use strict';
  const A = G.anim, L = A.L, { lerp, add, mul, nrm } = A.v, { hands, sin, cos } = G.mvh, C = A.COL;
  const dbs = (J, P, ax = [0, 0, 1]) => [...P.db(J.haR, ax), ...P.db(J.haL, ax)];
  /* Bras de longueur quasi constante : direction interpolée puis normalisée (évite que le coude plie à mi-course) */
  const arc = (S, a0, a1, u, R = .57) => { const d = nrm([lerp(a0[0], a1[0], u), lerp(a0[1], a1[1], u), lerp(a0[2], a1[2], u)]); return [S[0] + d[0] * R, S[1] + d[1] * R, .18 + d[2] * R]; };

  /* ---- Pectoraux ---- */
  const benchBody = { hx: .05, hy: .53, t: -88, n: 0, ax: .52, ay: .08, az: .25, kp: [.2, 1, .3] };
  const incBody = { hx: .12, hy: .56, t: -58, n: 5, ax: .60, ay: .08, az: .25, kp: [.2, 1, .3] };
  const incProps = (J, P) => [
    P.pad(add(add(J.H, mul(J.d1, .3)), mul(J.f1, -.14)), J.d1, .36, .04, .14),
    P.box([.2, .47, 0], [.17, 0, 0], [0, .04, 0], [0, 0, .14], C.pad, -.6),
    P.box([.1, .22, 0], [.05, 0, 0], [0, .22, 0], [0, 0, .12], C.iron, -.9),
    P.line([-.2, .62, 0], [-.36, .02, 0], .04, C.iron, -.9)
  ];

  const pushPose = u => {
    const al = lerp(18, 2, u), A0 = [-.95, .19];
    return { hx: A0[0] + .875 * cos(al), hy: A0[1] + .875 * sin(al), t: 90 - al, n: 0, ax: A0[0], ay: A0[1], az: .1, aa: -75, kp: [0, -1, .1],
      hf: 'w', wx: .40, wy: .045, wz: .30, ep: [-1, .6, .8] };
  };
  const dipPose = u => {
    const S = [lerp(0, .10, u), lerp(1.76, 1.36, u)], t = lerp(15, 32, u);
    const hx = S[0] - L.torso * sin(t), hy = S[1] - L.torso * cos(t);
    return { hx, hy, t, n: -.3 * t, ax: hx - .30, ay: hy - .55, az: .1, aa: -40, kp: [1, 0, .1], hf: 'w', wx: 0, wy: 1.2, wz: .28, ep: [-1, 0, .25] };
  };
  const flyS = A.shoulderOf({ hx: -.02, hy: .95, t: 14 });

  G.addMoves([
    {
      id: 'bench', name: 'Développé couché barre', group: 'pecs', pattern: 'hpush', equip: 'barre', kind: 'compound', inc: 2.5,
      muscles: { p: ['pecs'], s: ['triceps', 'delts'] }, cam: 22,
      pose: u => Object.assign({}, benchBody, { hf: 'w', wx: lerp(-.40, -.26, u), wy: lerp(1.07, .70, u), wz: .40, ep: [.5, -1, .7] }),
      track: J => hands(J), props: (J, P) => [...P.bench(-.85, .30, .43), ...P.barbell(hands(J))],
      phases: G.ph.ecc(2, .4, 1, .5, ['Descends la barre vers le bas des pectoraux', 'Touche la poitrine sans rebondir', 'Pousse la barre en arrière vers les yeux', 'Bras tendus, omoplates serrées']),
      cues: ['Omoplates serrées et abaissées, légère cambrure naturelle.', 'Pieds bien ancrés au sol, fessiers sur le banc.', 'Prise un peu plus large que les épaules, poignets droits.', 'Coudes à 45–70° du buste, pas à 90°.', 'Trajectoire en « J » : du bas des pecs vers le dessus des épaules.'],
      errors: ['Coudes ouverts à 90° (épaules en danger).', 'Barre qui rebondit sur la poitrine.', 'Fesses qui décollent du banc.', 'Poignets cassés vers l’arrière.'],
      tip: 'Sans partenaire, règle les barres de sécurité du rack juste sous la hauteur de ta poitrine.',
      video: 'développé couché technique'
    },
    {
      id: 'bench_db', name: 'Développé couché haltères', group: 'pecs', pattern: 'hpush', equip: 'halteres', kind: 'compound', inc: 2,
      muscles: { p: ['pecs'], s: ['triceps', 'delts'] }, cam: 26,
      pose: u => Object.assign({}, benchBody, { hf: 'w', wx: lerp(-.42, -.30, u), wy: lerp(1.06, .74, u), wz: lerp(.16, .40, u), ep: [.5, -1, .7] }),
      props: (J, P) => [...P.bench(-.85, .30, .43), ...dbs(J, P)],
      phases: G.ph.ecc(2, .3, 1, .5, ['Descends les haltères sur les côtés de la poitrine', 'Étirement des pecs, coudes sous les poignets', 'Pousse et rapproche les haltères', 'Haltères au-dessus des épaules']),
      cues: ['Plus d’amplitude qu’à la barre : descends jusqu’à l’étirement.', 'Omoplates serrées comme au développé barre.', 'Haltères qui se rapprochent en haut sans se cogner.'],
      errors: ['Descendre trop peu.', 'Haltères qui partent vers la tête.', 'Poser les haltères brutalement au sol en fin de série.'],
      tip: 'Pour t’installer : haltères posés sur les cuisses, allonge-toi en les ramenant contre la poitrine.',
      video: 'développé couché haltères technique'
    },
    {
      id: 'incline_db', name: 'Développé incliné haltères', group: 'pecs', pattern: 'ipush', equip: 'halteres', kind: 'compound', inc: 2,
      muscles: { p: ['pecs', 'delts'], s: ['triceps'] }, cam: 26,
      pose: u => Object.assign({}, incBody, { hf: 'w', wx: lerp(-.29, -.19, u), wy: lerp(1.40, .98, u), wz: lerp(.15, .40, u), ep: [.4, -1, .7] }),
      props: (J, P) => [...incProps(J, P), ...dbs(J, P)],
      phases: G.ph.ecc(2, .3, 1, .5, ['Descends vers le haut des pecs', 'Étirement, coudes légèrement rentrés', 'Pousse à la verticale des épaules', 'Contraction en haut']),
      cues: ['Banc à 30° : au-delà, les épaules prennent le relais.', 'Omoplates serrées, poitrine haute.', 'Haltères à la verticale des épaules en haut.'],
      errors: ['Banc trop incliné (45°+).', 'Amplitude partielle.', 'Coudes à 90° du buste.'],
      tip: 'Le haut des pectoraux répond bien à ce mouvement : garde-le en premier exercice une séance sur deux.',
      video: 'développé incliné haltères technique'
    },
    {
      id: 'pushup', name: 'Pompes', group: 'pecs', pattern: 'hpush', equip: 'pdc', kind: 'compound', inc: 0,
      muscles: { p: ['pecs', 'triceps'], s: ['delts', 'abs'] }, cam: 28,
      pose: pushPose,
      props: (J, P) => [P.box([-.2, .005, 0], [.95, 0, 0], [0, .005, 0], [0, 0, .42], [44, 68, 60], -1)],
      phases: G.ph.ecc(1.6, .3, .9, .5, ['Descends le corps en bloc', 'Poitrine à quelques cm du sol', 'Pousse le sol, corps gainé', 'Bras tendus, omoplates écartées']),
      cues: ['Mains un peu plus larges que les épaules.', 'Corps droit des talons à la tête : fessiers et abdos serrés.', 'Coudes à 45° du buste.', 'Pour progresser : pieds surélevés, pause en bas, ou sac lesté.'],
      errors: ['Bassin qui s’affaisse.', 'Fesses en l’air.', 'Tête qui plonge vers le sol.'],
      tip: 'Au-delà de 20 reps propres, ajoute de la charge (sac à dos) pour rester dans une zone efficace pour le muscle.',
      video: 'pompes technique parfaite'
    },
    {
      id: 'dips', name: 'Dips', group: 'pecs', pattern: 'vpushdown', equip: 'pdc', kind: 'compound', inc: 2.5,
      muscles: { p: ['pecs', 'triceps'], s: ['delts'] }, cam: 24,
      pose: dipPose,
      props: (J, P) => { const o = []; for (const s of [-1, 1]) { o.push(P.cyl([-.45, 1.18, s * .28], [.45, 1.18, s * .28], .022, C.steel, 0)); for (const x of [-.4, .4]) o.push(P.box([x, .59, s * .28], [.025, 0, 0], [0, .59, 0], [0, 0, .025], C.iron, -.02)); } return o; },
      phases: G.ph.ecc(1.8, .3, 1, .5, ['Descends en penchant le buste', 'Épaules au niveau des coudes, pas plus bas', 'Pousse jusqu’à bras tendus', 'Épaules basses, loin des oreilles']),
      cues: ['Buste penché vers l’avant = plus de pectoraux ; droit = plus de triceps.', 'Descends jusqu’à ce que les épaules arrivent au niveau des coudes.', 'Épaules basses et en arrière pendant tout le mouvement.'],
      errors: ['Descendre trop bas avec les épaules qui roulent vers l’avant.', 'Balancer les jambes.', 'Épaules qui remontent vers les oreilles.'],
      tip: 'Trop dur ? Utilise la machine d’assistance ou un élastique. Trop facile ? Ceinture lestée.',
      video: 'dips technique pectoraux'
    },
    {
      id: 'cablefly', name: 'Écarté à la poulie', group: 'pecs', pattern: 'chestiso', equip: 'poulie', kind: 'iso', inc: 2.5,
      muscles: { p: ['pecs'], s: ['delts'] }, cam: 58,
      pose: u => {
        const h = arc(flyS, [.25, -.2, 1], [1, -.35, -.2], u);
        return { hx: -.02, hy: .95, t: 14, n: -8, ax: .22, ay: .08, az: .12, bx: -.22, bz: .12, kp: [1, 0, .15], hf: 'w', wx: h[0], wy: h[1], wz: h[2], ep: [-.6, .3, 1] };
      },
      props: (J, P) => { const o = []; for (const s of [-1, 1]) { o.push(P.tower(-.05, s * 1.3, 2.1)); o.push(P.pulley([-.05, 1.95, s * 1.22])); o.push(P.line([-.05, 1.95, s * 1.22], s > 0 ? J.haR : J.haL, .008, C.cable, -.05)); } return o; },
      phases: G.ph.con(1.1, .6, 1.8, .4, ['Rapproche les mains en arc de cercle', 'Serre les pecs, mains qui se croisent presque', 'Ouvre lentement', 'Étirement des pecs, coudes fixes']),
      cues: ['Poulies en position haute, un pied devant l’autre.', 'Coudes légèrement fléchis et fixes : on « embrasse un arbre ».', 'Cherche l’étirement en ouverture, sans que les épaules partent vers l’avant.'],
      errors: ['Plier et tendre les coudes (le mouvement devient un développé).', 'Charger trop lourd et perdre l’amplitude.', 'Épaules qui remontent.'],
      tip: 'Poulies basses et mains qui montent = haut des pectoraux ; poulies hautes = bas des pectoraux.',
      video: 'écarté poulie vis à vis technique'
    },

    /* ---- Dos ---- */
    {
      id: 'pullup', name: 'Tractions', group: 'dos', pattern: 'vpull', equip: 'pdc', kind: 'compound', inc: 2.5,
      muscles: { p: ['lats'], s: ['biceps', 'traps', 'reardelts', 'forearms'] }, cam: 22,
      pose: u => {
        const k = A.keys([[0, { sx: -.04, sy: 1.774, t: -6, n: 0 }], [1, { sx: -.12, sy: 2.20, t: -22, n: 18 }]], u);
        const hx = k.sx - L.torso * sin(k.t), hy = k.sy - L.torso * cos(k.t);
        return { hx, hy, t: k.t, n: k.n, ax: hx + .06, ay: hy - .86, az: .1, aa: -55, kp: [1, 0, .1], hf: 'w', wx: 0, wy: 2.33, wz: .42, ep: [-.2, -1, .9] };
      },
      props: (J, P) => [P.cyl([0, 2.32, -1], [0, 2.32, 1], .018, C.steel), P.box([0, 1.17, 1.02], [.03, 0, 0], [0, 1.17, 0], [0, 0, .03], C.iron), P.box([0, 1.17, -1.02], [.03, 0, 0], [0, 1.17, 0], [0, 0, .03], C.iron)],
      phases: G.ph.con(1, .4, 1.8, .5, ['Tire les coudes vers les hanches', 'Menton au-dessus de la barre, poitrine vers la barre', 'Redescends lentement', 'Bras tendus, épaules engagées'], ['Tirage', 'Haut', 'Descente', 'Suspension']),
      cues: ['Prise un peu plus large que les épaules, paumes vers l’avant.', 'Commence par abaisser les épaules avant de plier les bras.', 'Pense « coudes dans les poches ».', 'Descente complète à chaque rep.'],
      errors: ['Balancer le corps (kipping).', 'Demi-reps en haut.', 'Épaules qui remontent vers les oreilles en bas.'],
      tip: 'Moins de 5 tractions ? Fais des négatives de 4 s ou utilise un élastique ; au-delà de 12, ajoute du lest.',
      video: 'tractions technique'
    },
    {
      id: 'pulldown', name: 'Tirage vertical', group: 'dos', pattern: 'vpull', equip: 'poulie', kind: 'compound', inc: 5,
      muscles: { p: ['lats'], s: ['biceps', 'traps', 'reardelts'] }, cam: 22,
      pose: u => ({ hx: 0, hy: .56, t: lerp(-10, -22, u), n: 10, ax: .46, ay: .08, az: .12, kp: [1, .3, .1], hf: 'w', wx: lerp(.02, -.06, u), wy: lerp(1.61, 1.16, u), wz: .44, ep: [-.3, -1, .8] }),
      track: J => hands(J),
      props: (J, P) => { const h = hands(J); return [
        P.cyl([h[0], h[1], -.62], [h[0], h[1], .62], .016, C.steel, .01), P.line([h[0], h[1], 0], [.04, 2.3, 0], .008, C.cable, -.3),
        P.box([.5, 1.17, 0], [.06, 0, 0], [0, 1.17, 0], [0, 0, .08], C.iron, -.8), P.box([.27, 2.34, 0], [.25, 0, 0], [0, .03, 0], [0, 0, .05], C.iron, -.8), P.pulley([.04, 2.3, 0]),
        P.box([.02, .47, 0], [.2, 0, 0], [0, .04, 0], [0, 0, .2], C.pad, -.6), P.box([.02, .22, 0], [.04, 0, 0], [0, .22, 0], [0, 0, .04], C.iron, -.9),
        P.cyl([.34, .69, -.25], [.34, .69, .25], .05, C.pad, .05)]; },
      phases: G.ph.con(1, .5, 1.8, .4, ['Tire la barre vers le haut de la poitrine', 'Serre les dorsaux, poitrine sortie', 'Remonte en contrôlant', 'Étirement complet des dorsaux']),
      cues: ['Cuisses bien calées sous les boudins.', 'Légère inclinaison arrière, poitrine vers la barre.', 'Tire avec les coudes, pas avec les mains.', 'Laisse les épaules monter en haut pour étirer, puis abaisse-les.'],
      errors: ['Tirer derrière la nuque.', 'Se pencher trop en arrière (ça devient un rowing).', 'Utiliser l’élan du buste.'],
      tip: 'Remplace les tractions tant que tu n’en fais pas 6 à 8 propres.',
      video: 'tirage vertical technique'
    },
    (() => {
      const base = { hx: -.36, hy: .83, t: 55, n: -20, az: .13, kp: [1, 0, .12] };
      const S = A.shoulderOf(base), p0 = Object.assign({}, base); A.hang(p0, S[0], .25);
      const b0 = [p0.wx, p0.wy], b1 = A.torsoPt(base, .13, -.22);
      return {
        id: 'row', name: 'Rowing barre', group: 'dos', pattern: 'hpull', equip: 'barre', kind: 'compound', inc: 2.5,
        muscles: { p: ['lats', 'traps'], s: ['reardelts', 'biceps', 'lowback'] }, cam: 22,
        pose: u => Object.assign({}, base, { hf: 'w', wx: lerp(b0[0], b1[0], u), wy: lerp(b0[1], b1[1], u), wz: .25, ep: [-1, .3, .4] }),
        track: J => hands(J), props: (J, P) => P.barbell(hands(J)),
        phases: G.ph.con(.9, .5, 1.6, .4, ['Tire la barre vers le nombril', 'Serre les omoplates', 'Redescends lentement', 'Bras tendus, dos plat']),
        cues: ['Buste penché à 30–45° au-dessus de l’horizontale, dos plat.', 'Genoux fléchis, barre qui pend sous les épaules.', 'Tire les coudes vers l’arrière et le haut.', 'Le buste ne bouge pas pendant la série.'],
        errors: ['Se redresser à chaque rep.', 'Dos arrondi.', 'Tirer uniquement avec les bras.'],
        tip: 'Si le bas du dos fatigue avant le haut du dos, passe au rowing haltère appui banc.',
        video: 'rowing barre technique'
      };
    })(),
    {
      id: 'row_db', name: 'Rowing haltère un bras', group: 'dos', pattern: 'hpull', equip: 'halteres', kind: 'compound', inc: 2,
      muscles: { p: ['lats'], s: ['traps', 'reardelts', 'biceps'] }, cam: 36,
      pose: u => ({ hx: -.24, hy: .93, t: 78, n: -15, ax: -.18, ay: .08, az: .26, kp: [1, 0, .3], bx: -.68, by: .53, bz: .10, ba: 180, kq: [0, -1, 0],
        hf: 'w', wx: lerp(.28, 0, u), wy: lerp(.47, .93, u), wz: lerp(.20, .22, u), vx: .34, vy: .47, vz: .16, ep: [-.5, 1, .3], eq: [-1, 0, -.2] }),
      props: (J, P) => [...P.bench(-.95, .55, .45), ...P.db(J.haR, [1, 0, 0])],
      phases: G.ph.con(.9, .5, 1.6, .4, ['Tire l’haltère vers la hanche', 'Coude au-dessus du dos, omoplate serrée', 'Redescends en étirant', 'Épaule qui descend, étirement du dorsal']),
      cues: ['Genou et main du même côté sur le banc, dos plat.', 'Tire vers la hanche plutôt que vers l’épaule.', 'Laisse l’omoplate s’étirer en bas.', 'Fais toutes les reps d’un côté, puis change.'],
      errors: ['Tourner le buste pour lever plus lourd.', 'Tirer vers l’épaule (trapèzes plutôt que dorsaux).', 'Amplitude réduite en bas.'],
      tip: 'Le meilleur rowing pour la maison : un banc et un haltère suffisent.',
      video: 'rowing haltère un bras technique'
    },
    {
      id: 'cablerow', name: 'Tirage horizontal poulie', group: 'dos', pattern: 'hpull', equip: 'poulie', kind: 'compound', inc: 5,
      muscles: { p: ['lats', 'traps'], s: ['reardelts', 'biceps'] }, cam: 24,
      pose: u => { const t = lerp(18, -6, u); return { hx: 0, hy: .42, t, n: -.4 * t, ax: .60, ay: .24, az: .12, aa: 80, kp: [0, 1, .15],
        hf: 'w', wx: lerp(.52, .127, u), wy: lerp(.60, .654, u), wz: .08, ep: [-1, -.3, .3] }; },
      props: (J, P) => { const h = hands(J); return [
        P.box([-.05, .17, 0], [.45, 0, 0], [0, .17, 0], [0, 0, .15], C.pad, -.6), P.box([.70, .24, 0], [.02, 0, 0], [0, .15, 0], [0, 0, .2], C.iron, -.5),
        P.box([1.08, .6, 0], [.06, 0, 0], [0, .6, 0], [0, 0, .08], C.iron, -.8), P.pulley([1.0, .3, 0]),
        P.line([h[0] + .03, h[1], 0], [1.0, .3, 0], .008, C.cable, -.2), P.cyl([h[0], h[1], -.09], [h[0], h[1], .09], .016, C.steel, .02)]; },
      phases: G.ph.con(1, .5, 1.6, .4, ['Tire la poignée vers le nombril', 'Poitrine sortie, omoplates serrées', 'Tends les bras en laissant les épaules avancer', 'Étirement du haut du dos']),
      cues: ['Genoux légèrement fléchis, dos droit.', 'Léger mouvement du buste autorisé (pas de balancier).', 'Coudes près du corps pour les dorsaux, écartés pour le haut du dos.'],
      errors: ['Balancer le buste d’avant en arrière.', 'Arrondir le dos en avant.', 'Hausser les épaules.'],
      tip: 'Poignée triangle = dorsaux ; barre large coudes ouverts = trapèzes et arrière d’épaule.',
      video: 'tirage horizontal poulie technique'
    },
    {
      id: 'facepull', name: 'Face pull', group: 'epaules', pattern: 'reardelt', equip: 'poulie', kind: 'iso', inc: 2.5,
      muscles: { p: ['reardelts'], s: ['traps'] }, cam: 30,
      pose: u => ({ hx: -.03, hy: .95, t: -4, n: 0, az: .16, kp: [1, 0, .2], hf: 'w', wx: lerp(.52, .07, u), wy: lerp(1.50, 1.63, u), wz: lerp(.06, .30, u), ep: [-.6, .5, 1] }),
      props: (J, P) => { const h = hands(J), at = [h[0] + .07, h[1], 0]; return [
        P.tower(1.26, 0, 2.1), P.pulley([1.15, 1.72, 0]), P.line(at, [1.15, 1.72, 0], .008, C.cable, -.3),
        P.line(at, J.haR, .014, [214, 200, 160], .01), P.line(at, J.haL, .014, [214, 200, 160], -.01)]; },
      phases: G.ph.con(1, .7, 1.5, .3, ['Tire la corde vers ton visage en écartant les mains', 'Coudes hauts, pouces vers l’arrière', 'Reviens lentement', 'Bras tendus, épaules en avant']),
      cues: ['Poulie à hauteur du visage, corde prise pouces vers toi.', 'Écarte les mains en arrivant au visage.', 'Coudes à hauteur d’épaules ou au-dessus.', 'Charge légère : séries de 12 à 20.'],
      errors: ['Charge trop lourde qui fait basculer le corps.', 'Coudes qui tombent.', 'Mouvement trop rapide.'],
      tip: 'Excellent pour l’arrière d’épaule et la posture : à placer dans chaque séance haut du corps.',
      video: 'face pull technique'
    },

    /* ---- Épaules ---- */
    (() => {
      const k = [[0, { x: .10, y: 1.50, n: 0, t: -4 }], [.35, { x: .10, y: 1.80, n: -18, t: -6 }], [.6, { x: .06, y: 1.95, n: -8, t: -5 }], [1, { x: .01, y: 2.04, n: 0, t: -3 }]];
      const poseFor = (wz0, wz1) => u => { const q = A.keys(k, u); return { hx: 0, hy: .955, t: q.t, n: q.n, az: .14, hf: 'w', wx: q.x, wy: q.y, wz: lerp(wz0, wz1, u), ep: [1, -.4, .5] }; };
      return [
        { id: 'ohp', name: 'Développé militaire', group: 'epaules', pattern: 'vpush', equip: 'barre', kind: 'compound', inc: 2.5,
          muscles: { p: ['delts'], s: ['triceps', 'traps', 'abs'] }, cam: 22, pose: poseFor(.26, .26), track: J => hands(J), props: (J, P) => P.barbell(hands(J)),
          phases: G.ph.con(1, .5, 1.6, .4, ['Pousse la barre à la verticale, tête en arrière', 'Passe la tête sous la barre, bras tendus', 'Redescends vers les clavicules', 'Barre sur le haut de la poitrine'], ['Poussée', 'Verrouillage', 'Descente', 'Départ']),
          cues: ['Prise juste plus large que les épaules, avant-bras verticaux.', 'Fessiers et abdos serrés : pas de cambrure.', 'Recule la tête pour laisser passer la barre, puis avance-la sous la barre.', 'Barre au-dessus du milieu du pied en haut.'],
          errors: ['Cambrer le bas du dos.', 'Pousser la barre vers l’avant.', 'Coudes trop écartés en bas.'],
          tip: 'Le mouvement le plus technique du haut du corps : progresse par petits paliers (1,25 kg de chaque côté).',
          video: 'développé militaire barre technique' },
        { id: 'ohp_db', name: 'Développé épaules haltères', group: 'epaules', pattern: 'vpush', equip: 'halteres', kind: 'compound', inc: 2,
          muscles: { p: ['delts'], s: ['triceps', 'traps'] }, cam: 24, pose: poseFor(.30, .16), props: (J, P) => dbs(J, P),
          phases: G.ph.con(1, .4, 1.6, .4, ['Pousse les haltères au-dessus de la tête', 'Bras tendus, haltères proches', 'Redescends à hauteur des oreilles', 'Coudes sous les poignets']),
          cues: ['Assis dossier droit ou debout gainé.', 'Haltères à hauteur des oreilles en bas.', 'Ne verrouille pas brutalement en haut.'],
          errors: ['Cambrer.', 'Descendre trop peu.', 'Coudes qui partent derrière le corps.'],
          tip: 'Plus doux pour les épaules que la barre : bon choix à la maison.',
          video: 'développé épaules haltères technique' }
      ];
    })(),
    (() => {
      const base = { hx: 0, hy: .955, t: 6, n: -6, az: .14 }, S = A.shoulderOf(base);
      return {
        id: 'lateral', name: 'Élévations latérales', group: 'epaules', pattern: 'sidedelt', equip: 'halteres', kind: 'iso', inc: 1,
        muscles: { p: ['delts'], s: ['traps'] }, cam: 68,
        pose: u => { const th = lerp(10, 86, u) * A.D, R = .57;
          return Object.assign({}, base, { hf: 'w', wx: S[0] + .04, wy: S[1] - R * Math.cos(th), wz: .18 + R * Math.sin(th), ep: [-1, .2, 0] }); },
        props: (J, P) => dbs(J, P, [1, 0, 0]),
        phases: G.ph.con(1, .5, 1.7, .3, ['Monte les bras sur les côtés', 'Coudes à hauteur d’épaules', 'Redescends lentement', 'Garde la tension en bas']),
        cues: ['Coudes légèrement fléchis, ils mènent le mouvement.', 'Monte jusqu’à l’horizontale, pas au-dessus.', 'Buste légèrement penché, pas d’élan.', 'Séries longues (12 à 20) : charge légère.'],
        errors: ['Balancer le corps.', 'Hausser les épaules (trapèzes).', 'Descendre trop vite.'],
        tip: 'La meilleure façon d’élargir les épaules. À la poulie basse, la tension est plus constante.',
        video: 'élévations latérales technique'
      };
    })(),
    (() => {
      const base = { hx: -.25, hy: .86, t: 70, n: -25, az: .14, kp: [1, 0, .1] }, S = A.shoulderOf(base);
      return {
        id: 'reardelt', name: 'Oiseau haltères', group: 'epaules', pattern: 'reardelt', equip: 'halteres', kind: 'iso', inc: 1,
        muscles: { p: ['reardelts'], s: ['traps'] }, cam: 58,
        pose: u => { const h = arc(S, [.02, -1, .15], [.05, -.12, 1], u); return Object.assign({}, base, { hf: 'w', wx: h[0], wy: h[1], wz: h[2], ep: [0, .6, 1] }); },
        props: (J, P) => dbs(J, P, [1, 0, 0]),
        phases: G.ph.con(1, .5, 1.6, .3, ['Écarte les bras vers l’extérieur', 'Pause, coudes à hauteur des épaules', 'Redescends en contrôlant', 'Bras sous les épaules']),
        cues: ['Buste penché presque à l’horizontale, dos plat.', 'Pense « écarter » plutôt que « tirer ».', 'Charge légère, contraction de l’arrière d’épaule.'],
        errors: ['Serrer les omoplates (ça devient un exercice de trapèzes).', 'Élan du buste.'],
        tip: 'Peut aussi se faire assis en bout de banc, buste sur les cuisses.',
        video: 'oiseau haltères arrière épaule technique'
      };
    })()
  ].flat());
})(window.GYM = window.GYM || {});

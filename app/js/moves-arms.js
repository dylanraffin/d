/* Bibliothèque de mouvements (3/3) : bras et abdos. */
(function (G) {
  'use strict';
  const A = G.anim, L = A.L, { lerp, add, sub, mul, nrm } = A.v, { hands, sin, cos } = G.mvh, C = A.COL;

  const curlBase = { hx: 0, hy: .955, t: 2, n: 0, az: .13 }, cS = A.shoulderOf(curlBase), cE = [cS[0] - .03, cS[1] - .30];
  const curlPose = wz => u => { const th = lerp(8, 140, u); return Object.assign({}, curlBase, { hf: 'w', wx: cE[0] + .31 * sin(th), wy: cE[1] - .31 * cos(th), wz, ep: [-1, 0, 0] }); };
  const forearmPerp = (J, side) => { const f = nrm(sub(side > 0 ? J.haR : J.haL, side > 0 ? J.elR : J.elL)); return [f[1], -f[0], 0]; };

  const pdBase = { hx: -.02, hy: .95, t: 10, n: -10, az: .14, kp: [1, 0, .15] }, pS = A.shoulderOf(pdBase), pE = [pS[0], pS[1] - .30];
  const ohBase = { hx: 0, hy: .955, t: 0, n: 8, az: .14 }, oS = A.shoulderOf(ohBase), oE = [oS[0] + .03, oS[1] + .29];
  const barProps = (J, P) => [P.cyl([0, 2.32, -1], [0, 2.32, 1], .018, C.steel), P.box([0, 1.17, 1.02], [.03, 0, 0], [0, 1.17, 0], [0, 0, .03], C.iron), P.box([0, 1.17, -1.02], [.03, 0, 0], [0, 1.17, 0], [0, 0, .03], C.iron)];

  G.addMoves([
    {
      id: 'curl', name: 'Curl haltères', group: 'bras', pattern: 'biceps', equip: 'halteres', kind: 'iso', inc: 2,
      muscles: { p: ['biceps'], s: ['forearms'] }, cam: 24,
      pose: curlPose(.24), props: (J, P) => [...P.db(J.haR, [0, 0, 1]), ...P.db(J.haL, [0, 0, 1])],
      phases: G.ph.con(1, .5, 1.8, .3, ['Monte l’haltère, coude fixe', 'Serre le biceps, paume vers toi', 'Redescends lentement', 'Bras presque tendu, garde la tension']),
      cues: ['Coudes collés au corps, ils ne bougent pas.', 'Paumes vers le haut (supination) pendant toute la montée.', 'Descente contrôlée sur 2 secondes.'],
      errors: ['Balancer le buste pour monter la charge.', 'Coudes qui avancent.', 'Amplitude partielle en bas.'],
      tip: 'Alterne avec le curl marteau pour travailler aussi le brachial et les avant-bras.',
      video: 'curl biceps haltères technique'
    },
    {
      id: 'curl_bar', name: 'Curl barre', group: 'bras', pattern: 'biceps', equip: 'barre', kind: 'iso', inc: 2.5,
      muscles: { p: ['biceps'], s: ['forearms'] }, cam: 24,
      pose: curlPose(.21), track: J => hands(J), props: (J, P) => P.barbell(hands(J), { plateR: .17, plate: [58, 150, 90], pz: .62, half: .9 }),
      phases: G.ph.con(1, .5, 1.8, .3, ['Monte la barre, coudes fixes', 'Serre les biceps', 'Redescends lentement', 'Bras tendus, sans relâcher']),
      cues: ['Prise largeur d’épaules, paumes vers l’avant.', 'Coudes immobiles le long du corps.', 'Contrôle la descente.'],
      errors: ['Élan du bas du dos.', 'Poignets cassés.', 'Coudes qui montent vers l’avant.'],
      tip: 'Une barre EZ soulage les poignets si la barre droite te gêne.',
      video: 'curl barre technique'
    },
    {
      id: 'hammer', name: 'Curl marteau', group: 'bras', pattern: 'biceps', equip: 'halteres', kind: 'iso', inc: 2,
      muscles: { p: ['biceps', 'forearms'], s: [] }, cam: 24,
      pose: curlPose(.24), props: (J, P) => [...P.db(J.haR, forearmPerp(J, 1)), ...P.db(J.haL, forearmPerp(J, -1))],
      phases: G.ph.con(1, .5, 1.8, .3, ['Monte, pouce vers le haut', 'Serre en haut', 'Redescends lentement', 'Bras presque tendu']),
      cues: ['Prise neutre (pouces vers le haut) pendant tout le mouvement.', 'Coudes fixes.', 'Travaille le brachial : il « pousse » le biceps vers le haut.'],
      errors: ['Balancer.', 'Poignets qui tournent.'],
      tip: 'Peut se faire en alterné pour mieux se concentrer sur chaque bras.',
      video: 'curl marteau technique'
    },
    {
      id: 'pushdown', name: 'Extension triceps poulie', group: 'bras', pattern: 'triceps', equip: 'poulie', kind: 'iso', inc: 2.5,
      muscles: { p: ['triceps'], s: [] }, cam: 24,
      pose: u => { const th = lerp(105, 5, u); return Object.assign({}, pdBase, { hf: 'w', wx: pE[0] + .31 * sin(th), wy: pE[1] - .31 * cos(th), wz: .10, ep: [-1, 0, 0] }); },
      props: (J, P) => { const h = hands(J); return [P.tower(.62, 0, 2.2), P.pulley([.42, 2.1, 0]), P.line(h, [.42, 2.1, 0], .008, C.cable, -.3), P.cyl([h[0], h[1], -.14], [h[0], h[1], .14], .016, C.steel, .02)]; },
      phases: G.ph.con(.9, .5, 1.5, .3, ['Pousse vers le bas, coudes fixes', 'Bras tendus, serre les triceps', 'Remonte jusqu’à 90°', 'Avant-bras horizontaux']),
      cues: ['Coudes collés au corps, seuls les avant-bras bougent.', 'Buste légèrement penché, épaules basses.', 'Verrouille et serre 1 s en bas.'],
      errors: ['Coudes qui s’écartent ou avancent.', 'Pousser avec le poids du corps.', 'Remonter les mains trop haut.'],
      tip: 'Avec une corde, écarte les mains en bas pour une contraction plus forte.',
      video: 'extension triceps poulie haute technique'
    },
    {
      id: 'ohext', name: 'Extension triceps nuque', group: 'bras', pattern: 'triceps', equip: 'halteres', kind: 'iso', inc: 2,
      muscles: { p: ['triceps'], s: [] }, cam: 26,
      pose: u => { const ph = lerp(0, -145, u); return Object.assign({}, ohBase, { hf: 'w', wx: oE[0] + .31 * sin(ph), wy: oE[1] + .31 * cos(ph), wz: .05, ep: [1, .3, .1] }); },
      props: (J, P) => { const h = hands(J), f = nrm(sub(J.haR, J.elR)); return P.db(add(h, mul(f, .06)), f, { half: .07 }); },
      phases: G.ph.ecc(1.8, .4, 1, .4, ['Descends l’haltère derrière la tête', 'Étirement maximal du triceps', 'Tends les bras vers le plafond', 'Bras tendus au-dessus de la tête']),
      cues: ['Haltère tenu à deux mains sous le disque du haut.', 'Coudes pointés vers le plafond, proches de la tête.', 'Descends le plus bas possible : l’étirement est la clé.'],
      errors: ['Coudes qui s’écartent.', 'Cambrer le bas du dos.', 'Amplitude réduite.'],
      tip: 'L’étirement bras au-dessus de la tête sollicite le chef long du triceps, souvent sous-entraîné.',
      video: 'extension triceps nuque haltère technique'
    },
    {
      id: 'plank', name: 'Gainage', group: 'abdos', pattern: 'core', equip: 'pdc', kind: 'iso', inc: 0, timed: true,
      muscles: { p: ['abs'], s: ['lowback', 'delts', 'glutes'] }, cam: 28,
      pose: u => {
        const al = 6.6 + lerp(0, .8, u), A0 = [-.95, .19], S = [A0[0] + 1.395 * cos(al), A0[1] + 1.395 * sin(al)];
        return { hx: A0[0] + .875 * cos(al), hy: A0[1] + .875 * sin(al), t: 90 - al, n: 0, ax: A0[0], ay: A0[1], az: .1, aa: -75, kp: [0, -1, .1], hf: 'w', wx: S[0] + .30, wy: .045, wz: .12, ep: [-.3, -1, 0] };
      },
      props: (J, P) => [P.box([-.2, .005, 0], [.95, 0, 0], [0, .005, 0], [0, 0, .42], [44, 68, 60], -1)],
      phases: [{ to: 1, d: 2.2, label: 'Gainage', cue: 'Serre fessiers et abdos, corps aligné', con: true }, { hold: .5, label: 'Tiens', cue: 'Respire calmement sans relâcher' },
        { to: 0, d: 2.2, label: 'Respiration', cue: 'Coudes sous les épaules, nuque neutre' }, { hold: .5, label: 'Tiens', cue: 'Bassin ni trop haut ni trop bas' }],
      cues: ['Coudes sous les épaules, avant-bras au sol.', 'Rétroversion du bassin : serre les fessiers.', 'Tiens 30 à 60 s, respire normalement.'],
      errors: ['Bassin qui s’affaisse.', 'Fesses trop hautes.', 'Bloquer la respiration.'],
      tip: 'Au-delà de 60 s, passe à une variante plus dure (bras tendus, pieds surélevés) plutôt que de tenir plus longtemps.',
      video: 'gainage planche technique'
    },
    {
      id: 'legraise', name: 'Relevés de jambes suspendu', group: 'abdos', pattern: 'core', equip: 'pdc', kind: 'iso', inc: 0,
      muscles: { p: ['abs'], s: ['quads', 'forearms'] }, cam: 24,
      pose: u => {
        const t = lerp(-6, -14, u), S = [-.04, 1.774], hx = S[0] - L.torso * sin(t), hy = S[1] - L.torso * cos(t), phi = lerp(4, 95, u);
        return { hx, hy, t, n: 0, ax: hx + .86 * sin(phi), ay: hy - .86 * cos(phi), az: .1, aa: phi - 60, kp: [.6, .8, .1], hf: 'w', wx: 0, wy: 2.33, wz: .42, ep: [-.2, -1, .9] };
      },
      props: barProps,
      phases: G.ph.con(1.2, .5, 1.8, .5, ['Monte les jambes en enroulant le bassin', 'Jambes à l’horizontale ou plus haut', 'Redescends sans balancer', 'Suspension, épaules engagées']),
      cues: ['Épaules engagées, pas suspendu « mou ».', 'Enroule le bassin vers l’avant en haut : c’est là que travaillent les abdos.', 'Genoux fléchis si c’est trop dur.'],
      errors: ['Se balancer.', 'Monter les jambes sans enrouler le bassin (seuls les fléchisseurs de hanche travaillent).'],
      tip: 'Commence genoux pliés, puis tends progressivement les jambes.',
      video: 'relevé de jambes suspendu technique'
    },
    {
      id: 'cablecrunch', name: 'Crunch à la poulie', group: 'abdos', pattern: 'core', equip: 'poulie', kind: 'iso', inc: 2.5,
      muscles: { p: ['abs'], s: [] }, cam: 26,
      pose: u => ({ hx: -.02, hy: .50, t: lerp(15, 32, u), c: lerp(0, 58, u), n: lerp(10, 20, u), ax: -.44, ay: .10, az: .12, aa: 190, kp: [1, 0, .1],
        hf: 't', wx: .10, wy: .14, wz: .09, ep: [.3, -1, .4] }),
      props: (J, P) => { const h = hands(J), at = add(h, [.02, .08, 0]); return [
        P.tower(.62, 0, 2.3), P.pulley([.45, 2.15, 0]), P.line(at, [.45, 2.15, 0], .008, C.cable, -.3),
        P.line(at, J.haR, .014, [214, 200, 160], .01), P.line(at, J.haL, .014, [214, 200, 160], -.01),
        P.box([-.2, .005, 0], [.5, 0, 0], [0, .005, 0], [0, 0, .35], [44, 68, 60], -1)]; },
      phases: G.ph.con(1.1, .5, 1.6, .4, ['Enroule la colonne, coudes vers les cuisses', 'Serre les abdos, souffle', 'Remonte en déroulant', 'Étirement des abdos']),
      cues: ['À genoux face à la poulie, corde tenue près du front.', 'Les hanches ne bougent pas : c’est la colonne qui s’enroule.', 'Charge progressive comme un vrai exercice de force (8 à 15 reps).'],
      errors: ['S’asseoir sur les talons (les hanches font le travail).', 'Tirer avec les bras.'],
      tip: 'Les abdos se travaillent comme les autres muscles : charge progressive et amplitude complète.',
      video: 'crunch poulie haute technique'
    }
  ]);
})(window.GYM = window.GYM || {});

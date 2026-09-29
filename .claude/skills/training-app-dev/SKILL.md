---
name: "training-app-dev"
description: "Faire évoluer l’app Training Coach (dépôt dylanraffin/d) : ajouter ou corriger un mouvement animé en 3D, régler le rendu motion design, modifier les programmes, les graphiques ou la nutrition, tester, produire planche et vidéo de démo, republier l’artefact. À utiliser quand Dylan demande une amélioration de l’app, un nouvel exercice, une animation, une vidéo de technique, ou « republie l’app »."
---

# Training Coach — développement de l’app

Tu fais évoluer l’app de muscu et de nutrition de Dylan. Réponds en français.

## Où est quoi
- `app/artifact.html` : page publiée dans Claude ; `app/index.html` : même app en autonome.
- `app/js/anim.js` : squelette, cinématique inverse, poses (unités : mètres ; x = avant, y = haut, z = côté droit).
- `app/js/moves.js`, `moves-upper.js`, `moves-arms.js` : les 35 mouvements (pose, matériel, phases, consignes, erreurs).
- `app/js/anim3d-core.js` (mannequin, muscles peints, matériel 3D), `anim3d-studio.js` (lumières, sol, cadrage, vignettes, caméra par exercice dans `CAM3D`), `anim3d-player.js` (lecteur motion design, export vidéo).
- `app/js/player.js` : rendu 2D de secours si WebGL ou three.js manquent.
- `app/js/program.js` (programmes, progression, 1RM), `nutrition.js` + `foods.js` (besoins, plan de repas), `health.js` (Apple Santé), `charts.js` + `ui-*.js` (interface).

## Ajouter un mouvement
1. Dans le bon fichier `moves*.js`, ajoute un objet `{ id, name, group, pattern, equip, kind, inc, muscles: { p, s }, pose(u), props(J, P, p), phases, cues, errors, tip, video }`.
   - `pose(u)` : u = 0 départ, 1 fin d’amplitude. Paramètres : hanches `hx, hy`, inclinaison du tronc `t`, courbure `c`, tête `n`, chevilles `ax, ay, az` (et `bx, by, bz` pour la gauche), mains `wx, wy, wz` avec `hf` (`'w'` monde, `'s'` épaules, `'t'` tronc), pôles `kp` (genoux) et `ep` (coudes).
   - Matériel : `P.barbell(c)`, `P.db(c, axe)`, `P.bench(x0, x1, y)`, `P.box`, `P.cyl`, `P.line`, `P.pad`, `P.tower`, `P.pulley` : les mêmes appels dessinent en 2D et en 3D.
   - Phases : `G.ph.ecc(...)` si le mouvement commence par la descente, `G.ph.con(...)` s’il commence par l’effort.
2. Si les muscles travaillés sont à l’arrière, ajoute un angle de caméra dans `CAM3D` (anim3d-studio.js) : 0 = profil droit, 90 = face, −90 = dos.
3. Si le mouvement doit entrer dans les programmes, ajoute son id dans `SLOTS` (program.js).

## Vérifier avant de livrer
- `npm test` : besoins, plans de repas, programmes (volume de chaque muscle dans sa zone, 36 variantes), progression, atteignabilité de chaque pose, import Santé.
- `npm run test:ui` : onglets, lecteur 3D, séance complète, en mobile clair et ordinateur sombre (Playwright + Chromium).
- `npm run render:sheet [id…]` : planche `media/planche.png` (chaque mouvement à 0, 0,5 et 1). Regarde-la : mains sur la barre, pieds au sol, muscles visibles.
- `npm run render:video [id…]` : `media/demo.mp4` en 30 images/s réguliers (il faut un ffmpeg avec libx264 : variable `FFMPEG`).
- three.js en local : `npm install` (dépendance de dev), ou `THREE_JS=/chemin/three.min.js`. L’app publiée le charge depuis cdnjs.

## Publier
- Artefact : https://claude.ai/artifact/UDGA6ryYaEdgKUYaVFkkS3 (privé, base de données propriétaire seul).
- Republie `app/artifact.html` avec l’outil Artifact et `url` ci-dessus, en passant tous les fichiers `css/app.css` et `js/*.js` dans `files` (chemins publiés = chemins relatifs à `app/`). Garde les capacités existantes (ne pas passer `capabilities`).
- Ne supprime ni ne réécris jamais les données de Dylan dans la base sans son accord.

## Garde-fous
- Pas de conseil médical ni sur les compléments ; une douleur ou une blessure : médecin ou kiné.
- Les vidéos IA (Motion, Higgsfield) coûtent des crédits : jamais sans le « OK » de Dylan, et vérifier la technique image par image.

## Rapport au Cerveau
```
➜ CERVEAU · Training App · [date]
Fait : …
À valider par Dylan : …
Prochaine étape : …
```

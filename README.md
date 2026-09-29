# Training Coach

App de musculation et de nutrition de Dylan, reliée à Dylan OS (agents **Training Coach** et **Nutrition Coach**).

**Ouvrir l’app :** https://claude.ai/artifact/UDGA6ryYaEdgKUYaVFkkS3 (privée : visible seulement par toi tant que tu ne la partages pas).

## Ce que fait l’app

| Onglet | Contenu |
|---|---|
| Séance | Programme de prise de muscle (3 à 6 séances par semaine, salle, haltères ou poids du corps), séances en rotation (pratique avec un planning de tournage irrégulier), cycle de 6 semaines avec décharge, charge conseillée à chaque exercice (double progression), échauffement calculé, disques à mettre de chaque côté, minuteur de repos, records détectés en fin de séance. |
| Progrès | Tuiles avec tendance, force par exercice en petits multiples (1RM estimé, records entourés, poids du corps compris pour tractions et dips), volume de la semaine fait / prévu avec la zone conseillée de chaque muscle, poids avec la zone visée par ton objectif projetée sur 2 semaines, sommeil, FC au repos et variabilité cardiaque (Apple Santé), revue du mois, records, historique. Chaque graphique a une infobulle et un tableau. |
| Nutrition | Besoins détaillés (calcul affiché), macros, plan de repas calculé au gramme selon ton régime et tes exclusions, journal du jour, calories et protéines des 14 derniers jours face à ta cible, poids du matin, bilan hebdomadaire qui ajuste les calories, liste de courses sur 7 jours. |
| Mouvements | 35 exercices animés en 3D façon motion design : mannequin éclairé en studio, muscles qui s’allument (rouge : principaux, ambre : secondaires), caméra en orbite lente, titre de phase animé, anneau de tempo, angle articulaire en direct, trajectoire de la barre, flèches de direction. Vue côté, 3/4, face ou dos, ralenti, export vidéo MP4 avec carton d’intro et points clés, liens vers de vraies vidéos. |
| Coach | Questions à Claude avec tes données (séances, nutrition, poids, Apple Santé). |
| Profil | Réglages, remplacement d’exercices, import Apple Santé, export et import des données. |

## Sur iPhone

1. Ouvre le lien dans l’app Claude ou dans Safari, connecté à ton compte.
2. Crée ton profil (âge, taille, poids, séances par semaine, matériel, régime).
3. Apple Santé, deux options sans rien installer :
   - **Historique** : app Santé → ta photo → « Exporter toutes les données de santé » → Enregistrer dans Fichiers, puis Profil → Apple Santé → « Choisir export.zip ». Le fichier est lu sur le téléphone, seuls les totaux par jour sont gardés.
   - **Chaque jour** : un Raccourci iOS copie poids, pas, calories, FC au repos et VFC ; tu colles le texte dans l’app. Le pas-à-pas est dans Profil → Apple Santé.

Une app web ne peut pas lire HealthKit directement : Apple le réserve aux apps iOS natives. L’export et le Raccourci passent par les outils d’Apple.

## Données et confidentialité

- Dans Claude, les données vont dans la base privée de l’artefact : règles d’accès « lecture et écriture réservées au propriétaire et aux éditeurs ». Un simple lecteur du lien ne voit rien.
- Ouverte hors de Claude (fichier `app/index.html`), l’app enregistre dans le navigateur.
- Export JSON et CSV depuis Profil → Données.

## Skills Dylan OS

- `.claude/skills/nutrition-coach/SKILL.md` : agent **Nutrition Coach** (besoins, plan, courses, bilan hebdo), relié à la base de l’app.
- `.claude/skills/training-coach/SKILL.md` : **Training Coach v2**, même format que ta version actuelle, qui lit les séances de l’app.
- `.claude/skills/form-check/SKILL.md` : agent **Form Check** : tu envoies une photo ou une vidéo de ton mouvement, il rend 3 corrections prioritaires d’après les fiches de l’app.
- `.claude/skills/training-app-dev/SKILL.md` : comment faire évoluer l’app (ajouter un mouvement animé, tester, produire planche et vidéo, republier).

Ils sont actifs automatiquement quand Claude Code travaille dans ce dépôt. Pour les avoir dans claude.ai : zippe chaque dossier de skill et importe-le dans la section Skills de tes paramètres ; remplace alors l’ancien Training Coach. Pense à ajouter Nutrition Coach et Form Check au registre du Cerveau (pôle Perso).

## Méthode et sources

- Métabolisme de base : Mifflin, St Jeor et al., *Am J Clin Nutr* 1990.
- Protéines 1,6 à 2,2 g/kg : Morton et al., *Br J Sports Med* 2018.
- Volume : relation dose-réponse séries/hypertrophie, Schoenfeld et al., *J Sports Sci* 2017.
- Vitesse de prise de poids 0,25 à 0,5 % par semaine : Iraki et al., *Sports* 2019.
- Répétitions en réserve (RIR) : Helms et al., *Strength Cond J* 2016.
- 1RM estimé : formule d’Epley, ajustée aux reps en réserve.
- Valeurs nutritionnelles : moyennes CIQUAL (ANSES) et USDA, poids crus.

Pas de conseil médical ni sur les compléments : pour une douleur, une blessure ou une question de santé, voir un médecin.

## Développement

- `app/` : l’app (HTML, CSS, JavaScript sans étape de build). `app/artifact.html` est la page publiée dans Claude, `app/index.html` la version autonome. three.js r128 vient de cdnjs ; sans WebGL, l’app repasse au rendu 2D.
- `app/js/anim.js` : squelette et cinématique inverse ; `moves*.js` : poses et fiches des 35 exercices.
- `app/js/anim3d-core.js`, `anim3d-studio.js`, `anim3d-player.js` : mannequin 3D, studio (lumières, ombres, cadrage, vignettes en cache), lecteur motion design et export vidéo.
- `app/js/program.js`, `nutrition.js`, `foods.js`, `health.js`, `charts.js` : logique d’entraînement, de nutrition, import Santé et graphiques.
- `npm test` : tests de logique (Node 22, sans installation).
- `npm run test:ui` : test de l’interface dans Chromium (Playwright).
- `npm run render:sheet` et `npm run render:video` : planche des mouvements et vidéo de démo dans `media/` (vidéo : ffmpeg avec libx264 via `FFMPEG`).

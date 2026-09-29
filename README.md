# Training Coach

App de musculation et de nutrition de Dylan, reliée à Dylan OS (agents **Training Coach** et **Nutrition Coach**).

**Ouvrir l’app :** https://claude.ai/artifact/UDGA6ryYaEdgKUYaVFkkS3 (privée : visible seulement par toi tant que tu ne la partages pas).

## Ce que fait l’app

| Onglet | Contenu |
|---|---|
| Séance | Programme de prise de muscle (3 à 6 séances par semaine, salle, haltères ou poids du corps), séances en rotation (pratique avec un planning de tournage irrégulier), cycle de 6 semaines avec décharge, charge conseillée à chaque exercice (double progression), échauffement calculé, disques à mettre de chaque côté, minuteur de repos, records détectés en fin de séance. |
| Progrès | 1RM estimé par exercice, volume hebdomadaire par muscle (zone 10 à 20 séries), poids et moyenne sur 7 jours, sommeil et fréquence cardiaque (Apple Santé), revue des 30 derniers jours, records, historique. |
| Nutrition | Besoins détaillés (calcul affiché), macros, plan de repas calculé au gramme selon ton régime et tes exclusions, journal du jour, poids du matin, bilan hebdomadaire qui ajuste les calories, liste de courses sur 7 jours. |
| Mouvements | 35 exercices animés en 3D : glisse pour tourner autour, ralenti, vues côté / 3/4 / face / dos, position de départ et d’arrivée en fantôme, trajectoire de la barre, muscles qui travaillent en surbrillance, points clés, erreurs fréquentes, export vidéo et liens vers de vraies vidéos. |
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

- `.claude/skills/nutrition-coach/SKILL.md` : nouvel agent **Nutrition Coach** (besoins, plan, courses, bilan hebdo), relié à la base de l’app.
- `.claude/skills/training-coach/SKILL.md` : **Training Coach v2**, même format que ta version actuelle, qui lit maintenant les séances de l’app.

Ils sont actifs automatiquement quand Claude Code travaille dans ce dépôt. Pour les avoir dans claude.ai : zippe chaque dossier de skill et importe-le dans la section Skills de tes paramètres ; remplace alors l’ancien Training Coach. Pense à ajouter Nutrition Coach au registre du Cerveau (pôle Perso).

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

- `app/` : l’app (HTML, CSS, JavaScript sans dépendance). `app/artifact.html` est la page publiée dans Claude, `app/index.html` la version autonome.
- `app/js/anim.js` et `player.js` : mannequin 3D, cinématique inverse, lecteur. `moves*.js` : poses et fiches des exercices.
- `app/js/program.js`, `nutrition.js`, `foods.js`, `health.js` : logique d’entraînement, de nutrition et import Santé.
- Tests : `npm test` (Node 22, aucune installation).

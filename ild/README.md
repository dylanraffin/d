# Nuit

La carte du cruising entre mecs : qui est dispo autour de toi, maintenant. **Site d'abord** (pas de magasin d'applications), installable depuis le navigateur, en français et en anglais, avec son back office.

**Style « heure bleue »** : des couleurs douces. Pages blanches, un bleu pastel (`#b3bffc`) en grands aplats (bandeaux, bulles de ses messages, statut « dispo »), un bleu nuit profond (`#22264b`) à la place du noir pour le texte et les actions, des gris légèrement bleutés. Sur le pastel, le texte reste foncé. Le même bleu en plus soutenu (`#5266e8`) sert aux petits repères : cercle des dispos, points, compteurs. Une seule police (DM Sans), coins doux (16 à 24 px), une seule ombre légère. Aucune autre couleur dans l'interface : ce sont les photos qui la portent. Les jetons (`--accent`, `--accent-mark`, `--accent-soft`, `--text`) sont en tête de `public/app/app.css` (app) et de `public/live/site.css` (site) ; après un changement, les icônes et les captures de l'accueil sont à refaire. Le back office garde son thème sombre.

Le même code fait tourner **deux produits** :

| Édition | Lancement | Principe |
|---|---|---|
| **Nuit** (`cruise`, par défaut) | `npm start` | Carte en direct, ouverte à tous les adultes dont l'âge est vérifié : statut « dispo », fiche cruising, chat sans match avec photos, plans à plusieurs, lieux, mode voyage. Nom changeable avec `ILD_BRAND`. |
| **ILD** (`club`) | `ILD_EDITION=club npm start` | Club de rencontre sur invitation, façon Raya : liste d'attente, parrainages, comité, Découvrir un profil à la fois. |

C'est un **prototype qui fonctionne** : vraie base de données, vraie API, vrais comptes. Il n'est **pas prêt pour un lancement public** tant que les prestataires et les étapes juridiques listés plus bas ne sont pas faits.

## Lancer en local

Il faut Node.js 22.13 ou plus récent. Aucune dépendance à installer (la carte utilise Leaflet, copié dans `public/vendor/leaflet`).

```bash
cd ild
npm run seed     # base de démo + identifiants affichés
npm start        # http://localhost:3000 (site), /carte (app), /admin (back office)
npm test         # 35 tests de bout en bout de l'API
npm run demo     # démo statique dans demo-dist/ : la vraie interface sur des données fictives, sans serveur
```

Comptes créés par `npm run seed` (mot de passe des membres : `demo-ild-2026`) :

| Rôle | E-mail |
|---|---|
| Administrateur | admin@ild.local (mot de passe affiché par la commande, ou `ILD_ADMIN_PASSWORD`) |
| Membre de démo : conversations, photo reçue, favoris, plan accepté | leo@ild.local |
| Autres membres, à Paris | samir@, hugo@, mathis@, yanis@, adrien@, karim@, nathan@, romain@, bilal@, theo@, jules@ild.local |
| Nouveau profil, membre en voyage | enzo@, malik@ild.local |
| Membre suspendu avec recours en attente | kevin@ild.local |
| Candidats de l'édition club | thomas@, nico@, julien@, max@ild.local |

## Site d'abord

Les magasins d'applications refusent les contenus pour adultes. Nuit est donc un site :

| Adresse | Contenu |
|---|---|
| `/` et `/en` | Page d'accueil publique, sans JavaScript, référençable. Français sur `/`, anglais sur `/en` ; un navigateur qui n'est pas en français est envoyé sur `/en`. Un membre connecté est envoyé sur `/carte`. |
| `/carte` | L'app (non référencée). Téléphone : carte plein écran et navigation en bas. Grand écran : navigation en haut, liste à gauche, carte à droite, fiches dans un volet. |
| `/manifest.webmanifest` | App installable depuis le navigateur (icônes dans `public/live/icons`). |
| `/legal/…`, `/admin`, `/robots.txt` | Pages légales, back office, règles pour les robots. |

L'interface est écrite en français. Les autres langues sont des dictionnaires « texte français → traduction » (`public/shared/i18n/`) appliqués à l'affichage ; ce que les membres écrivent n'est jamais traduit. Le choix de langue est dans Moi et sur l'écran de connexion.

## Ce que fait Nuit

| Écran | Contenu |
|---|---|
| Inscription (3 étapes) | Compte ; pseudo et date de naissance (18 ans révolus à la date près) ; trois accords explicites et horodatés. La fiche se complète ensuite. |
| Vérification de l'âge | Parcours chez un prestataire (pièce d'identité + selfie). Nuit ne reçoit que le résultat. Dès que l'âge est vérifié, la personne entre. En développement, une page simule le prestataire. |
| Carte | Membres (anneau vert s'ils sont dispo, pastille s'ils sont en ligne), zones, lieux, plans à plusieurs. « Je suis dispo » pour 30 min à 4 h : je reçois, je me déplace, sur place, verre d'abord. Filtres, conseils de sécurité. |
| Fiche | Taille, poids, morphologie, rôle ; lieu (peut recevoir, peut se déplacer), ambiance, style, pratiques, santé ; en ligne, distance par tranche, badge « Nouveau profil » ; favori ; **premier message écrit depuis la fiche**. |
| Chat | Sans match. **Photos envoyées dans la conversation**, floutées à l'arrivée si on le souhaite, retirables à tout moment ; albums privés à durée limitée ; réponses rapides ; « non lu » ; accusé de lecture. |
| Plans à plusieurs | Un membre reçoit ou organise, les autres demandent à venir, l'hôte accepte. Discussion de groupe. |
| Lieux | Bars, clubs, saunas, soirées, proposés par les membres et publiés après validation. « J'y suis » pendant 2 h : seul le nombre s'affiche. |
| Mode voyage | Apparaître dans une autre ville (liste de villes ou centre de la carte) pendant 1 à 14 jours. |
| Liste | Les dispos d'abord, puis les personnes en ligne ; filtre Favoris. |
| Moi | Fiche, albums, position (GPS, ou une ville dans le monde, ou un quartier de Paris), précision du point, qui peut m'écrire, langue, installation, export et suppression du compte. |
| Compte sanctionné | Décision, motif, recours pendant 6 mois. |

### Ce qui protège les membres

- **Un point n'est jamais la vraie position.** Position arrondie à l'enregistrement ; point placé dans une case d'environ 1 km (ou 500 m au choix) avec un décalage fixe pour la journée ; option « seulement dans une zone » d'au moins 3 membres. L'app ne reçoit jamais la position du membre lui-même. Distances par tranches, une mise à jour par minute au plus, positions effacées après 7 jours sans activité.
- **Pas de photo non sollicitée.** Celui qui lance une conversation ne peut envoyer une photo qu'après une réponse. 40 nouvelles conversations par jour au plus, 3 messages sans réponse au plus, préférence « qui peut m'écrire ».
- **Photos de profil explicites, au choix du service.** Permises par défaut sur Nuit parce que chaque membre est un adulte vérifié (réglage « photos de profil explicites » au back office). Le membre les signale, la modération peut corriger le marquage, et le **mode vanille** les floute pour qui le préfère. La page d'accueil publique n'en montre jamais. Avant un lancement : vraie vérification d'âge et détection des contenus pédocriminels branchées (la page Conformité le contrôle), hébergeur et prestataire de paiement qui acceptent les contenus pour adultes.
- **Santé : accord séparé.** Statut VIH et date de dépistage ne sont enregistrés qu'avec un accord explicite, montrés aux personnes choisies, jamais transmis ; retirer l'accord les efface. Pratiques et taille suivent la visibilité « intime ».
- **Plans à plusieurs : adresse réservée.** Le plan est placé au centre d'une case d'environ 1 km. L'adresse et la liste des participants ne sont visibles que de l'hôte et des personnes acceptées. Aucune contrepartie d'argent (Code pénal, art. 225-5 et suivants), aucune drogue : engagement de l'hôte, filtre sur les annonces, signalement, retrait motivé avec recours.
- **Lieux = établissements et événements seulement.** Pas de parcs, aires ou plages : les relations sexuelles dans un lieu exposé au public sont un délit (Code pénal, art. 222-32) et ces lieux servent aussi aux guet-apens.
- **Tous les comptes sont des adultes vérifiés**, ce qui limite aussi les faux profils et les robots. Badge « Nouveau profil » pendant 7 jours, conseils de sécurité à la première ouverture, signalement qui garde une copie de la conversation.
- **Ce qui protège la vie privée reste gratuit** : bloquer, débloquer, retirer une photo, masquer sa position, supprimer son compte.

## International

- **Langues** : français et anglais. Ajouter une langue = un fichier dans `public/shared/i18n/` et une page `public/live/landing.<langue>.html`.
- **Se placer partout** : GPS, ou une ville parmi une soixantaine dans le monde (`CITIES` dans `server/options.mjs`), ou un quartier de Paris.
- **Pays fermés** : le back office (Réglages) liste les pays où le service est fermé, là où la loi met les membres en danger. Le pays est lu dans l'en-tête posé par le proxy ou le CDN (`ILD_COUNTRY_HEADER`, par défaut `cf-ipcountry`) ; réponse 451.
- **Âge vérifié pour tout le monde, partout** : une seule règle, la plus stricte, plutôt qu'un réglage par pays.
- Reste à faire avant d'ouvrir un pays : textes légaux traduits et adaptés par un avocat local, prestataire de vérification d'âge accepté par le régulateur du pays, unités impériales, devises.

## Le club ILD (édition `club`)

Inscription en 5 étapes avec code de parrainage, liste d'attente, comité, Découvrir un profil à la fois, likes et matchs, Autour (grille et carte par zones), Ce soir (événements et sorties), ILD+. Le comité ne peut accepter un dossier que si les points obligatoires sont faits (âge vérifié, majeur, accords à jour, photo validée, e-mail absent de la liste des bannis). Un refus demande un motif de la liste et une explication écrite : jamais l'apparence, l'âge au-delà de 18 ans, l'origine ou un autre critère interdit (Code pénal, art. 225-1).

## Back office (`/admin`)

Tableau de bord, candidatures (club), membres, photos à valider, signalements (profil, message, photo, publication, plan à plusieurs) avec copie des preuves, recours, événements, lieux à valider, plans à plusieurs, abonnements, conformité légale (13 contrôles automatiques), journal, réglages. Toute sanction demande un motif et une explication envoyée à la personne.

## Vérifications légales intégrées

- **Pages légales** servies par l'app : CGU, politique de confidentialité, charte, mentions légales, CGV (pour plus tard), formulaire public de signalement. Ce sont des **modèles à faire relire par un avocat** ; les informations de la société se remplissent dans le back office.
- **Accords versionnés** : changer `LEGAL_VERSION` (`server/options.mjs`) redemande l'accord de chaque membre.
- **Données sensibles** (orientation, rôle, pratiques, goûts intimes ; santé avec accord séparé) : consentement explicite (RGPD art. 9), facultatives, visibilité au choix.
- **DSA** : signalement ouvert à tous, même sans compte (art. 16) ; exposé des motifs (art. 17) ; recours interne examiné par un humain (art. 20) ; point de contact (art. 11 et 12).
- **RGPD** : export et suppression dans l'app, durées de conservation réglables, purge (plans à plusieurs effacés 30 jours après leur fin), journal des actions d'administration, liste des bannis en empreintes hachées.

## Abonnement (gratuit pour l'instant)

Tant que « Abonnement payant activé » est décoché (back office › Abonnements), tout est offert. Le jour du lancement de Nuit+ : on choisit le prix et les fonctions réservées (mode voyage, filtres avancés, carte sans limite de distance, accusés de lecture, organisation de plans à plusieurs) ; l'abonnement demande l'acceptation des CGV, avec rétractation de 14 jours et **résiliation en trois clics** ; le paiement réel se branche dans `server/billing.mjs` (webhook signé `/api/webhooks/payments`). Sur le web, pas de commission de magasin d'applications ; prévoir un prestataire de paiement qui accepte les services pour adultes.

## Sécurité

- Mots de passe hachés (scrypt), sessions en cookie `HttpOnly` + `SameSite=Lax`, limitation des tentatives.
- Protection CSRF (en-tête `X-ILD` obligatoire), webhooks authentifiés par signature HMAC-SHA256.
- En-têtes stricts (CSP, pas d'iframe), tout le texte affiché via `textContent`.
- Photos servies avec contrôle d'accès à chaque requête (profil, album partagé, conversation), réencodées dans le navigateur (métadonnées et GPS retirés).
- Blocage dans les deux sens ; un blocage coupe aussi l'accès aux albums et aux photos de la conversation.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `PORT`, `ILD_DATA_DIR` | Port et dossier des données (base + photos) |
| `ILD_EDITION`, `ILD_BRAND` | `cruise` (Nuit, défaut) ou `club` (ILD) ; nom affiché du produit |
| `ILD_SECURE_COOKIES=1` | Obligatoire derrière HTTPS |
| `ILD_COUNTRY_HEADER` | En-tête qui donne le pays du visiteur (défaut `cf-ipcountry`), pour les pays fermés |
| `ILD_VERIFICATION_PROVIDER` | `mock` (défaut) ou `hosted` |
| `ILD_VERIFICATION_URL`, `ILD_VERIFICATION_SECRET` | Parcours du prestataire (`{session}` dans l'URL) et secret du webhook `/api/webhooks/verification` |
| `ILD_PAYMENT_PROVIDER`, `ILD_PAYMENT_SECRET` | Prestataire de paiement et secret du webhook `/api/webhooks/payments` |
| `ILD_BLOCKLIST_PEPPER` | Clé secrète des empreintes d'e-mails bannis |
| `ILD_CSAM_SCANNER` | À définir quand la détection de contenus pédocriminels est branchée (`scanImage` dans `server/core.mjs`) |
| `ILD_MAP_TILES`, `ILD_MAP_ATTRIBUTION` | Fournisseur de tuiles de carte. Par défaut OpenStreetMap, dont les serveurs ne sont pas faits pour un service en production : prendre un fournisseur hébergé dans l'UE ou ses propres tuiles (chaque requête de tuile indique au fournisseur la zone regardée). |
| `ILD_ADMIN_PASSWORD`, `ILD_DEMO_PASSWORD` | Mots de passe de la base de démo |

## À faire avant un vrai lancement

1. Prestataire de vérification d'âge conforme au référentiel de l'Arcom (double anonymat), branché sur le webhook.
2. Détection des contenus pédocriminels connus sur chaque photo (profil, album, chat), signalement à PHAROS.
3. Hébergement dans l'UE, HTTPS, sauvegardes chiffrées, purge planifiée chaque jour, fournisseur de tuiles.
4. Notifications (web push) et e-mails transactionnels ; vidéo en direct seulement avec un serveur relais (TURN) en Europe, pour ne pas exposer l'adresse IP des membres.
5. Juridique : AIPD avec un DPO (données de santé et de localisation), registre des traitements, relecture des CGU, de la politique de confidentialité et de la charte, contrats de sous-traitance, dépôt de la marque.
6. Liste des pays fermés, textes légaux et prestataires par pays avant chaque ouverture internationale.

## Organisation du code

- `server/db.mjs` : schéma SQLite et migrations automatiques ; `options.mjs` : listes fermées et version des conditions.
- `server/index.mjs` (serveur, routes du site), `site.mjs` (page d'accueil, manifeste, pays fermés), `api.mjs` (comptes, profil, messages, signalements), `live.mjs` (carte, présence, conversations sans match, lieux), `cruise.mjs` (fiche cruising, santé, voyage, favoris, photos du chat, accusés de lecture), `plans.mjs` (plans à plusieurs), `albums.mjs`, `nearby.mjs` + `geo.mjs`, `verification.mjs`, `notices.mjs` (décisions et recours), `billing.mjs`, `legal.mjs`, `admin.mjs`, `core.mjs`, `seed.mjs` + `seed-assets/`.
- `public/live/` : page d'accueil (`landing.html`, `landing.en.html`, `site.css`), app Nuit (`live.js`, `live.css`), icônes.
- `public/app/` : écrans partagés par les deux éditions (`onboarding.js`, `main.js`, `me.js`, `ui.js`) et routeur du club (`app.js`).
- `public/shared/` : `lib.js` (outils communs), `i18n.js` et `i18n/` (traductions). `public/admin/` : back office.
- `tools/demo/` : construction de la démo statique (`build.mjs`), serveur simulé (`mock.js`), fond de carte dessiné (`basemap.js`), portraits de démonstration dessinés, sans visage (`avatars.py`, à lancer vers `server/seed-assets`).
- `tests/` : `api.test.mjs` (club), `live.test.mjs` et `cruise.test.mjs` (Nuit).

# ILD

App de rencontre sur invitation pour hommes gays et queer (Paris d'abord), avec son back office. Style « galerie de nuit » (direction C des maquettes).

Le même code fait tourner **deux produits** :

| Édition | Lancement | Principe |
|---|---|---|
| **ILD** (`club`, par défaut) | `npm start` | Club sur invitation, façon Raya : liste d'attente, parrainages, comité, Découvrir un profil à la fois. |
| **Carte en direct** (`cruise`, nom provisoire « Nuit ») | `ILD_EDITION=cruise npm start` | Carte des mecs disponibles autour de soi, façon Sniffies : ouverte à tous les adultes dont l'âge est vérifié, statut « dispo maintenant », conversations sans match, lieux. Nom changeable avec `ILD_BRAND`. |

C'est un **prototype qui fonctionne** : vraie base de données, vraie API, vrais comptes. Il n'est **pas prêt pour un lancement public** tant que les prestataires et les étapes juridiques listés plus bas ne sont pas faits.

## Lancer en local

Il faut Node.js 22.13 ou plus récent. Aucune dépendance à installer (la carte utilise Leaflet, copié dans `public/vendor/leaflet`).

```bash
cd ild
npm run seed     # base de démo + identifiants affichés
npm start        # http://localhost:3000 (app) et http://localhost:3000/admin (back office)
npm test         # 24 tests de bout en bout de l'API (18 ILD, 6 carte en direct)
```

Comptes créés par `npm run seed` (mot de passe des membres : `demo-ild-2026`) :

| Rôle | E-mail |
|---|---|
| Administrateur | admin@ild.local (mot de passe affiché par la commande, ou `ILD_ADMIN_PASSWORD`) |
| Membre avec albums, match et album reçu | leo@ild.local |
| Autres membres, localisés par quartier | samir@, hugo@, mathis@, yanis@, adrien@, karim@, nathan@, romain@, bilal@, theo@, jules@ild.local |
| Membre suspendu avec recours en attente | kevin@ild.local |
| Candidats à chaque étape | thomas@ (dossier complet), nico@ (photo à valider), julien@ (âge en cours), max@ (nouveau) |

## Ce que fait l'app

| Écran | Contenu |
|---|---|
| Inscription (5 étapes) | Compte ; prénom, **date de naissance** (18 ans révolus à la date près), ville, code de parrainage ; modes (Rencontre, Amis, Pro) et ce que la personne cherche ; **goûts** (3 à 12), **position** (actif, plutôt actif, versatile, plutôt passif, passif, side) et **goûts intimes**, tous facultatifs avec le choix de qui les voit (tous les membres, mes matchs, personne) ; trois accords explicites et horodatés. |
| Vérification de l'âge | Parcours chez un prestataire (pièce d'identité + selfie). ILD ne reçoit que le résultat. En développement, une page simule le prestataire (`/app/verify-mock.html`). |
| Liste d'attente | Rang, étapes du dossier (âge, photo validée, profil complet, parrainages, comité), code à partager. |
| Découvrir | Un profil à la fois (façon Raya), modes, diaporama, musique, position et recherche si visibles, distance par tranche, filtres (âge, distance, position, recherche). |
| Autour | **Grille par distance** (façon Grindr) et **carte**. Voir « Géolocalisation » plus bas. |
| Albums privés | Plusieurs albums nommés. On **envoie un album à un match depuis la conversation**, pour 1 heure, 24 heures, 7 jours ou jusqu'au retrait, et on peut **retirer l'accès** à tout moment. Photos floutées jusqu'au toucher. |
| Messages | Conversations entre matchs, albums envoyés, signalement qui garde une copie des 50 derniers messages. |
| Ce soir | Événements ILD et sorties des membres, visibles par tous ou par les matchs seulement. |
| Moi | Profil, albums, position, confidentialité (distance masquée, absent d'Autour, incognito, flou, mode discret), personnes bloquées, décisions de modération, export JSON et suppression du compte. |
| ILD+ | Liste des fonctions, mode voyage, abonnement et résiliation en trois clics (voir « Abonnement »). |
| Compte sanctionné | Une personne suspendue, bannie ou refusée voit la décision, son motif, et peut **faire un recours** pendant 6 mois. |

## La carte en direct (édition `cruise`)

| Écran | Contenu |
|---|---|
| Accueil et inscription | Même inscription en 5 étapes, sans code de parrainage. Dès que l'âge est vérifié, la personne entre (pas de liste d'attente). |
| Carte | Carte plein écran : membres (point vert s'ils sont dispo), zones, lieux. Bouton « Je suis dispo » (30 min à 4 h, « je reçois », « je me déplace », « verre ou café d'abord », un mot). Filtre « Dispos », filtres avancés, conseils de sécurité. |
| Fiche | Photo, âge, tranche de distance, position si elle est publique, statut dispo, « Écrire », « Voir le profil », « Signaler ». |
| Liste | Les dispos d'abord, puis par tranche de distance. |
| Lieux | Bars, clubs, saunas, cafés, événements, proposés par les membres et publiés après validation. « J'y suis » pendant 2 h : seul le nombre de personnes est affiché. |
| Messages, albums, Moi | Les mêmes qu'ILD, plus « Précision de mon point » et « Qui peut m'écrire ». |

Protections propres à la carte :

- **un point n'est jamais la vraie position** : position arrondie à l'enregistrement, point placé dans une case d'environ 1 km (ou 500 m au choix) avec un décalage fixe pour la journée ; option « seulement dans une zone » (pas de point du tout, regroupé avec au moins 3 membres) ;
- l'app ne reçoit jamais la position du membre lui-même, seulement son point approximatif ;
- **écrire sans match**, mais : 40 nouvelles conversations par jour au plus, 3 messages sans réponse au plus, préférence « qui peut m'écrire » (tout le monde, profils avec photo, personne) ; un album ne peut être envoyé qu'après une réponse ;
- **lieux = établissements et événements seulement** : pas de parcs, aires ou plages (relations sexuelles dans un lieu exposé au public : Code pénal, art. 222-32 ; ces lieux servent aussi aux guet-apens) ;
- motifs de signalement « Guet-apens ou menace » et « Drogue (vente, chemsex) », conseils de sécurité à la première ouverture ;
- version payante : la carte au-delà de 15 km autour de soi (réglable) devient payante le jour où le payant est activé.

## Le processus de validation

1. **Inscription** : date de naissance (refus immédiat avant 18 ans), trois accords horodatés (âge et vérification, données sensibles, CGU et charte), version des conditions enregistrée.
2. **Âge vérifié** par le prestataire. Résultat « mineur » : candidature refusée automatiquement, motif envoyé, e-mail bloqué.
3. **Photo de profil validée** par la modération (pas de nudité, la personne reconnaissable).
4. **Parrainages** par des membres (conseillés ; rendus obligatoires dans les réglages si besoin).
5. **Comité** : le dossier montre une liste de vérifications. Le bouton « Accepter » n'est actif que si les points obligatoires sont faits : âge vérifié, majeur, accords à jour, photo validée, e-mail absent de la liste des bannis.
6. **Refus** : seulement avec un motif de la liste (faux profil, sécurité, mineur, harcèlement…) et une explication écrite, envoyée à la personne. Jamais l'apparence, l'âge au-delà de 18 ans, l'origine ou un autre critère interdit (Code pénal, art. 225-1).

## Géolocalisation

Sur une app gay, la position est la donnée la plus dangereuse : des attaquants ont déjà retrouvé des membres par **trilatération** (en comparant les distances affichées depuis plusieurs points). Protections :

- accord explicite avant d'utiliser la position, retrait à tout moment (effacement immédiat) ;
- option « quartier » au lieu du GPS ;
- position **arrondie à environ 500 m avant d'être enregistrée** ; la position exacte n'est jamais stockée ;
- une mise à jour par minute au plus (empêche de « sonder » en se déplaçant) ;
- distances affichées **par tranches** (moins de 1 km, 1 à 2 km, 2 à 5 km…), jamais de coordonnées d'autres membres envoyées à l'app ;
- dans la grille, ordre **aléatoire à l'intérieur d'une tranche** (trier par distance exacte trahirait la position même avec la distance masquée) ;
- carte par **zones d'au moins 3 membres** ; les zones trop peu peuplées sont fusionnées ou cachées ;
- options « masquer ma distance », « ne pas apparaître dans Autour », « incognito » ;
- positions effacées après 7 jours sans mise à jour.

À ajouter avant un lancement international : avertissement et réglages renforcés par défaut dans les pays qui pénalisent l'homosexualité.

Les tuiles de la carte viennent par défaut d'OpenStreetMap (`ILD_MAP_TILES`, `ILD_MAP_ATTRIBUTION`). Pour la production, prendre un fournisseur de tuiles hébergé dans l'UE ou ses propres tuiles : chaque requête de tuile indique au fournisseur la zone regardée.

## Vérifications légales intégrées

- **Pages légales** servies par l'app : CGU, politique de confidentialité, charte, mentions légales, CGV (pour plus tard), formulaire public de signalement. Ce sont des **modèles à faire relire par un avocat** ; les informations de la société se remplissent dans le back office (Conformité légale).
- **Accords versionnés** : changer `LEGAL_VERSION` (`server/options.mjs`) redemande l'accord de chaque membre avant de continuer.
- **Données sensibles** (orientation, position, goûts intimes) : consentement explicite (RGPD art. 9), facultatives, visibilité au choix, jamais utilisées pour l'admission.
- **DSA** : signalement ouvert à tous, même sans compte (art. 16) ; exposé des motifs envoyé à chaque personne sanctionnée (art. 17) ; recours interne examiné par un humain (art. 20) ; point de contact (art. 11 et 12).
- **RGPD** : export et suppression dans l'app, durées de conservation réglables, purge, journal de toutes les actions d'administration, liste des bannis stockée en empreintes hachées.
- **Page « Conformité légale »** du back office : 13 contrôles automatiques (mentions complètes, DPO, hébergement UE, vrai prestataire de vérification, détection des contenus pédocriminels, HTTPS, purge récente, signalements et recours traités à temps, médiateur et paiement si le payant est activé) et la liste de ce qui se fait hors de l'app.

## Abonnement (gratuit pour l'instant)

L'app est **gratuite** : tant que « Abonnement payant activé » est décoché (back office › Abonnements), toutes les fonctions sont offertes. Le jour du lancement d'ILD+ :

- on choisit le prix et les fonctions réservées à ILD+ (qui m'a liké, mode voyage, filtres avancés, incognito, likes illimités) et la limite de likes gratuits par jour ;
- l'abonnement demande l'acceptation des CGV, et la page indique la rétractation de 14 jours et la **résiliation en trois clics** (Moi › ILD+ › Résilier › Confirmer), effective en fin de période ;
- le paiement réel se branche dans `server/billing.mjs` (prestataire `ILD_PAYMENT_PROVIDER`, webhook signé `/api/webhooks/payments`). Dans une app mobile, Apple et Google imposent leur système d'achat intégré.

## Sécurité

- Mots de passe hachés (scrypt), sessions en cookie `HttpOnly` + `SameSite=Lax`, limitation des tentatives.
- Protection CSRF (en-tête `X-ILD` obligatoire), webhooks authentifiés par signature HMAC-SHA256.
- En-têtes stricts (CSP, pas d'iframe), tout le texte affiché via `textContent`.
- Photos servies avec contrôle d'accès à chaque requête, réencodées dans le navigateur (métadonnées et GPS retirés).
- Blocage dans les deux sens ; un blocage retire aussi les accès aux albums.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `PORT`, `ILD_DATA_DIR` | Port et dossier des données (base + photos) |
| `ILD_EDITION`, `ILD_BRAND` | `club` (ILD, défaut) ou `cruise` (carte en direct) ; nom affiché du produit |
| `ILD_SECURE_COOKIES=1` | Obligatoire derrière HTTPS |
| `ILD_VERIFICATION_PROVIDER` | `mock` (défaut) ou `hosted` |
| `ILD_VERIFICATION_URL`, `ILD_VERIFICATION_SECRET` | Parcours du prestataire (`{session}` dans l'URL) et secret du webhook `/api/webhooks/verification` |
| `ILD_PAYMENT_PROVIDER`, `ILD_PAYMENT_SECRET` | Prestataire de paiement et secret du webhook `/api/webhooks/payments` |
| `ILD_BLOCKLIST_PEPPER` | Clé secrète des empreintes d'e-mails bannis |
| `ILD_CSAM_SCANNER` | À définir quand la détection de contenus pédocriminels est branchée (`scanImage` dans `server/core.mjs`) |
| `ILD_MAP_TILES`, `ILD_MAP_ATTRIBUTION` | Fournisseur de tuiles de carte |
| `ILD_ADMIN_PASSWORD`, `ILD_DEMO_PASSWORD` | Mots de passe de la base de démo |

## À faire avant un vrai lancement

1. Prestataire de vérification d'âge certifié, branché sur le webhook.
2. Détection des contenus pédocriminels connus sur chaque photo, signalement à PHAROS.
3. App mobile native (blocage des captures d'écran, notifications, achat intégré).
4. Hébergement dans l'UE, HTTPS, sauvegardes chiffrées, purge planifiée chaque jour.
5. Juridique : AIPD avec un DPO, registre des traitements, relecture des CGU, de la politique de confidentialité et de la charte, contrats de sous-traitance, dépôt de la marque à l'INPI.

## Organisation du code

- `server/db.mjs` : schéma SQLite et migrations automatiques ; `options.mjs` : listes fermées (positions, goûts, motifs) et version des conditions.
- `server/api.mjs` (comptes, profil, Découvrir, messages, Ce soir, signalements), `live.mjs` (carte en direct, présence, conversations sans match, lieux), `albums.mjs`, `nearby.mjs` + `geo.mjs` (Autour et carte), `verification.mjs`, `notices.mjs` (décisions et recours), `billing.mjs`, `legal.mjs`, `admin.mjs`, `core.mjs` (fonctions communes), `index.mjs` (serveur), `seed.mjs` + `seed-assets/` (démo).
- `public/app/` : app membre (`app.js` routeur, `onboarding.js`, `main.js`, `me.js`, `ui.js`).
- `public/live/` : app de la carte en direct (réutilise les écrans de `public/app/`).
- `public/admin/` : back office (page « Lieux » en plus). `public/shared/lib.js` : outils communs.
- `tests/api.test.mjs` : tests de bout en bout.

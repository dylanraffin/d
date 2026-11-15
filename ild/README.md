# ILD

App de rencontre sur invitation pour hommes gays et queer (Paris d'abord), avec son back office. Style « galerie de nuit » (direction C des maquettes).

C'est un **prototype qui fonctionne** : vraie base de données, vraie API, vrais comptes. Il n'est **pas prêt pour un lancement public** tant que les prestataires listés plus bas ne sont pas branchés.

## Lancer en local

Il faut Node.js 22.13 ou plus récent. Aucune dépendance à installer.

```bash
cd ild
npm run seed     # crée une base de démo et affiche les identifiants
npm start        # http://localhost:3000 (app) et http://localhost:3000/admin (back office)
npm test         # 14 tests de bout en bout de l'API
```

Comptes de démo créés par `npm run seed` :

| Rôle | E-mail | Mot de passe |
|---|---|---|
| Administrateur | admin@ild.local | affiché par la commande (ou `ILD_ADMIN_PASSWORD`) |
| Membre ILD+ | leo@ild.local | demo-ild-2026 |
| Autres membres | samir@, hugo@, mathis@, yanis@, adrien@, karim@ild.local | demo-ild-2026 |
| Candidats | thomas@ (2 parrainages), nico@ (1), julien@ (identité à valider), max@ | demo-ild-2026 |

Variables d'environnement : `PORT`, `ILD_DATA_DIR` (dossier de la base et des photos, par défaut `ild/data`), `ILD_SECURE_COOKIES=1` (obligatoire derrière HTTPS), `ILD_ADMIN_PASSWORD`, `ILD_DEMO_PASSWORD`.

## L'app membre (`/`)

| Écran | Ce qu'il fait |
|---|---|
| Candidature | Prénom, année de naissance (18 ans minimum), ville, code d'un membre. Trois consentements séparés et horodatés : âge et vérification d'identité, **consentement explicite à l'orientation sexuelle** (RGPD art. 9), charte. |
| Vérification | Lance la vérification d'identité. ILD ne stocke jamais la pièce, seulement le résultat. |
| Liste d'attente | Rang dans la ville (parrainages d'abord, puis ancienneté), étapes, code à partager. Personne n'est « refusé » sans motif documenté. |
| Découvrir | Un profil à la fois, modes Rencontre / Amis / Pro, diaporama photo, musique du profil, parrainages, membres de passage (mode voyage). J'aime / Passer, match si réciproque. |
| Profil | Photos, bio, centres d'intérêt, album privé à demander, masquer son profil à cette personne, bloquer, signaler. |
| Album privé | Photos explicites autorisées uniquement ici. Activé par la personne, accès accordé un par un pour 7 jours, révocable, réservé aux matchs par défaut, flouté jusqu'au toucher. |
| Carte | Membres **par quartier**, jamais de position exacte (aucune géolocalisation). Option « me masquer de la carte ». |
| Ce soir | Événements ILD et sorties des membres, visibles par tous les membres ou par les matchs seulement. |
| Messages | Conversations entre matchs, mises à jour toutes les 4 s. Signaler un message garde une copie des 50 derniers messages : pas besoin de captures. |
| Moi | Profil, photos, demandes de parrainage, album, confidentialité, mode discret, export JSON des données, suppression du compte. |
| ILD+ | Qui m'a liké, mode voyage. **Démo : aucun paiement.** |

Les photos sont réencodées dans le navigateur avant l'envoi (retire la position GPS et les autres métadonnées), puis servies uniquement aux personnes autorisées (`/photos/:id`, contrôle d'accès à chaque requête).

## Le back office (`/admin`)

| Page | Ce qu'elle fait |
|---|---|
| Tableau de bord | Ce qui est à traiter (identités, comité, photos, signalements, avec alerte pour les signalements urgents) et chiffres de la communauté. |
| Candidatures | Identité à vérifier → liste d'attente → acceptation. Grille neutre (identité, parrainages, charte). Un refus exige un motif parmi : faux profil, sécurité, charte, mineur. Jamais l'apparence. |
| Membres | Recherche, fiche détaillée (consentements horodatés, activité, signalements, historique), suspendre, bannir, réactiver, offrir ILD+. |
| Photos à valider | Les photos de profil ne sont visibles qu'après validation. |
| Signalements | Classés par urgence (mineur, contenu non consenti, illégal en premier), preuves copiées, décisions motivées : classer, retirer le contenu, suspendre, bannir. |
| Événements | Créer et retirer les événements « Ce soir ». |
| Journal | Toutes les actions des admins, horodatées (traçabilité RGPD / DSA). |
| Réglages et RGPD | Durées de conservation, parrainages requis, durée d'accès aux albums, visibilité en voyage, purge des données expirées. |

## Sécurité

- Mots de passe hachés avec scrypt, sessions en cookie `HttpOnly` + `SameSite=Lax`, limitation des tentatives de connexion.
- Protection CSRF : toute requête qui modifie quelque chose doit porter l'en-tête `X-ILD: 1`.
- En-têtes de sécurité stricts (CSP, pas d'iframe, pas de référent).
- Tout le texte affiché passe par `textContent` : pas d'injection HTML.
- Blocage dans les deux sens : un membre bloqué ne voit plus le profil, l'album, les messages ni les publications.

## À brancher avant un vrai lancement

1. **Vérification d'identité** : un prestataire certifié (pièce + selfie). Son webhook remplace le bouton « Identité OK » du back office (`POST /api/admin/applications/:id/verify-id`).
2. **Détection de contenus pédocriminels connus** sur chaque photo (hash matching) : fonction `scanImage` dans `server/api.mjs`. Signalement à PHAROS en cas de correspondance.
3. **Paiement ILD+** : App Store / Google Play ou prestataire web (`POST /api/me/premium` est une démo).
4. **App mobile native** : le blocage des captures d'écran n'est pas possible sur le web.
5. **Notifications** push et e-mails (match, message, acceptation).
6. **Hébergement dans l'UE**, HTTPS, sauvegardes chiffrées, purge planifiée (`POST /api/admin/maintenance/purge`).
7. **Juridique** : analyse d'impact (AIPD), DPO, CGU, politique de confidentialité, mentions légales, dépôt de la marque à l'INPI.

## Organisation du code

- `server/` : `db.mjs` (schéma SQLite, module intégré à Node), `http.mjs` (routeur), `auth.mjs`, `api.mjs` (app membre), `admin.mjs` (back office), `index.mjs` (serveur), `seed.mjs`.
- `public/app/` : l'app membre (HTML, CSS, JavaScript sans étape de build).
- `public/admin/` : le back office.
- `public/shared/lib.js` : outils communs (appels API, création d'éléments, icônes, réencodage des photos).
- `tests/api.test.mjs` : tests de bout en bout.

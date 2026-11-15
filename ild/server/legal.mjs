// Documents légaux (modèles à faire relire par un avocat), acceptation versionnée, signalement public (DSA art. 16).
import { fail } from './http.mjs';
import { requireAccount, rateLimiter } from './auth.mjs';
import { getSetting } from './db.mjs';
import { LEGAL_VERSION, REPORT_REASONS } from './options.mjs';
import { str } from './core.mjs';

const publicReportLimit = rateLimiter(5, 60 * 60e3);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function info(db, config) {
  const v = (key, label) => esc(getSetting(db, key)) || `<mark>[À compléter : ${esc(label)}]</mark>`;
  return {
    brand: esc(config.brand.name), plus: esc(config.brand.plus), cruise: config.edition === 'cruise',
    company: v('legal_company', 'raison sociale'), form: v('legal_form', 'forme et capital'),
    address: v('legal_address', 'adresse du siège'), siren: v('legal_siren', 'RCS / SIREN'), vat: v('legal_vat', 'TVA'),
    director: v('legal_director', 'directeur de la publication'), host: v('legal_host', 'hébergeur'),
    contact: v('legal_contact_email', 'e-mail de contact'), dpo: v('legal_dpo_email', 'e-mail du DPO'),
    mediator: v('legal_mediator', 'médiateur de la consommation'),
    eu: getSetting(db, 'legal_hosting_eu') === '1',
    ret_app: esc(getSetting(db, 'retention_months_applicants')), ret_rep: esc(getSetting(db, 'retention_months_reports')),
    ret_block: esc(getSetting(db, 'retention_months_blocklist')), ret_loc: esc(getSetting(db, 'location_ttl_days')),
    price: (Number(getSetting(db, 'plus_price_cents')) / 100).toFixed(2).replace('.', ',')
  };
}

const DOCS = {
  mentions: ['Mentions légales', (i) => `
    <p>Conformément à la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique.</p>
    <h2>Éditeur</h2>
    <p>${i.company}, ${i.form}<br>Siège : ${i.address}<br>${i.siren} · TVA : ${i.vat}<br>Directeur de la publication : ${i.director}<br>Contact : ${i.contact}</p>
    <h2>Hébergeur</h2><p>${i.host}</p>
    <h2>Point de contact (règlement européen sur les services numériques)</h2>
    <p>Autorités et utilisateurs : ${i.contact}, en français ou en anglais.</p>
    <h2>Données personnelles</h2><p>Voir la <a href="/legal/confidentialite">politique de confidentialité</a>. Délégué à la protection des données : ${i.dpo}.</p>`],

  cgu: ["Conditions générales d'utilisation", (i) => `
    <p>Version du ${LEGAL_VERSION}. En créant un compte, tu acceptes ces conditions, la <a href="/legal/charte">charte</a> et la <a href="/legal/confidentialite">politique de confidentialité</a>.</p>
    <h2>1. Le service</h2><p>${i.brand} est ${i.cruise ? 'un service de rencontre géolocalisé entre hommes gays, bi et queer majeurs' : 'un service de rencontre et de sociabilité sur invitation pour hommes gays, bi et queer'}, édité par ${i.company}.</p>
    <h2>2. Gratuité</h2><p>${i.brand} est gratuit. Si un abonnement payant (${i.plus}) est proposé un jour, il sera facultatif et régi par des <a href="/legal/cgv">conditions générales de vente</a> que tu devras accepter avant tout paiement.</p>
    <h2>3. Accès réservé aux majeurs</h2><p>Il faut avoir 18 ans ou plus. L'âge est vérifié par un prestataire certifié (pièce d'identité et selfie) ; ${i.brand} ne conserve que le résultat. Un compte créé par une personne mineure est supprimé et l'e-mail bloqué.</p>
    <h2>4. Admission</h2>${i.cruise ? "<p>L'accès est ouvert à toute personne majeure dont l'âge a été vérifié et qui accepte ces conditions et la charte. Ta position n'est utilisée qu'avec ton accord, arrondie, et jamais montrée exactement.</p>" : ''}<p${i.cruise ? ' hidden' : ''}>L'admission se fait selon des critères publiés : âge vérifié, au moins une photo de profil validée, consentements donnés, respect de la charte et, si possible, parrainage par des membres. Aucune décision ne repose sur l'apparence, l'origine, le handicap, l'âge (au-delà de la majorité) ou un autre critère interdit par l'article 225-1 du Code pénal. En attendant, tu es sur une liste d'attente ; tu peux consulter ton rang et supprimer ta candidature à tout moment.</p>
    <h2>5. Ton compte</h2><p>Un seul compte par personne, avec des informations exactes. Garde ton mot de passe secret.</p>
    <h2>6. Contenus</h2><p>Tu restes propriétaire de tes contenus et accordes à ${i.brand} le droit de les afficher aux personnes que tu choisis, le temps de ton inscription. Les photos de profil et les publications ne doivent pas contenir de nudité. Les contenus explicites entre adultes consentants sont permis uniquement dans les albums privés, envoyés à une personne précise. Diffuser un contenu intime d'autrui sans son accord est un délit (Code pénal, art. 226-2-1).</p>
    <h2>7. Signalements et modération</h2><p>Tout le monde peut signaler un contenu illégal, même sans compte, via <a href="/legal/signaler">ce formulaire</a>. Chaque décision (contenu retiré, compte suspendu ou banni, candidature refusée) t'est communiquée avec ses motifs, conformément au règlement (UE) 2022/2065 sur les services numériques. Tu peux la contester pendant 6 mois depuis l'app ; un humain réexamine ton recours. Tu peux aussi saisir un organisme de règlement extrajudiciaire certifié ou le juge.</p>
    <h2>8. Sanctions</h2><p>En cas de manquement aux présentes conditions ou à la charte, ${i.brand} peut retirer un contenu, suspendre ou supprimer un compte, de façon proportionnée et motivée.</p>
    <h2>9. Sécurité</h2><p>Les rencontres hors de l'app se font sous ta responsabilité. Prends des précautions : premier rendez-vous dans un lieu public, préviens un proche. En cas de danger, appelle le 17 ou le 112.</p>
    <h2>10. Responsabilité</h2><p>${i.brand} met en œuvre des moyens raisonnables pour assurer le service et la sécurité des données, sans garantir une disponibilité permanente.</p>
    <h2>11. Résiliation</h2><p>Tu peux supprimer ton compte à tout moment depuis Moi › Supprimer mon compte.</p>
    <h2>12. Modification</h2><p>En cas de changement important, ta nouvelle acceptation sera demandée dans l'app.</p>
    <h2>13. Droit applicable</h2><p>Droit français. Réclamations : ${i.contact}.</p>`],

  confidentialite: ['Politique de confidentialité', (i) => `
    <p>Version du ${LEGAL_VERSION}. Responsable du traitement : ${i.company}, ${i.address}. Délégué à la protection des données : ${i.dpo}.</p>
    <h2>Données sensibles</h2><p>Utiliser ${i.brand} révèle ton orientation sexuelle. Ta position sexuelle et tes goûts intimes, si tu choisis de les indiquer, concernent ta vie sexuelle. Ce sont des données sensibles (RGPD, art. 9). Nous les traitons uniquement avec ton <strong>consentement explicite</strong>, donné à l'inscription. Tu peux le retirer en supprimant ces informations ou ton compte.</p>
    <h2>Ce que nous traitons, pourquoi et sur quelle base</h2>
    <table>
      <tr><th>Données</th><th>Finalité</th><th>Base légale</th><th>Conservation</th></tr>
      <tr><td>E-mail, mot de passe (haché), prénom, date de naissance, ville</td><td>Compte et admission</td><td>Contrat</td><td>Durée du compte ; candidature non aboutie : ${i.ret_app} mois</td></tr>
      <tr><td>Orientation, position, goûts intimes, photos</td><td>Profil et mise en relation</td><td>Consentement explicite (art. 9)</td><td>Durée du compte</td></tr>
      <tr><td>Résultat de la vérification d'âge (pas la pièce)</td><td>Réserver le service aux majeurs</td><td>Obligation légale et intérêt légitime</td><td>Durée du compte</td></tr>
      <tr><td>Position arrondie (environ 500 m)</td><td>Autour de moi, carte</td><td>Consentement</td><td>${i.ret_loc} jours sans mise à jour, ou jusqu'au retrait</td></tr>
      <tr><td>Messages, albums, likes, matchs</td><td>Messagerie et rencontres</td><td>Contrat</td><td>Durée du compte</td></tr>
      <tr><td>Signalements et preuves</td><td>Sécurité, modération, obligations DSA</td><td>Obligation légale et intérêt légitime</td><td>${i.ret_rep} mois après traitement</td></tr>
      <tr><td>Empreinte (hachée) de l'e-mail d'un compte banni</td><td>Empêcher le retour d'une personne bannie</td><td>Intérêt légitime</td><td>${i.ret_block} mois</td></tr>
    </table>
    <h2>Ce que nous ne faisons pas</h2><p>Pas de publicité ciblée, pas de revente, pas de traceurs publicitaires, pas de partage de tes données sensibles avec des outils d'analyse. Le seul cookie est celui de ta session, nécessaire au fonctionnement.</p>
    <h2>Position</h2><p>Ta position exacte n'est jamais conservée : elle est arrondie avant d'être enregistrée, les autres membres ne voient qu'une tranche de distance (« 1 à 2 km ») et la carte ne montre que des zones regroupant plusieurs membres. Tu peux masquer ta distance, te retirer de la carte ou effacer ta position à tout moment.</p>
    <h2>Destinataires</h2><p>Hébergeur (${i.host}), prestataire de vérification d'âge (résultat uniquement), et, si un abonnement est activé, le prestataire de paiement. ${i.eu ? "Les données sont hébergées dans l'Union européenne." : "<mark>[À compléter : lieu d'hébergement et garanties en cas de transfert hors UE]</mark>"}</p>
    <h2>Tes droits</h2><p>Accès, rectification, effacement, limitation, portabilité, opposition, retrait du consentement, directives après décès. Export et suppression sont disponibles directement dans l'app (Moi › Mes données). Pour le reste : ${i.dpo}. Tu peux aussi saisir la CNIL (cnil.fr).</p>`],

  charte: ['Charte de la communauté', (i) => `
    <p>${i.brand} repose sur la confiance. Chaque membre s'engage à respecter cette charte ; son non-respect peut entraîner le retrait d'un contenu, une suspension ou un bannissement.</p>
    <h2>1. Authenticité</h2><p>Ton vrai prénom, tes vraies photos, ton vrai âge. Un compte par personne.</p>
    <h2>2. Respect</h2><p>Pas de harcèlement, d'insultes, de propos racistes, sérophobes, transphobes ou discriminatoires. Un « non » est un non.</p>
    <h2>3. Consentement et images</h2><p>Nudité uniquement dans les albums privés, envoyés à quelqu'un qui le souhaite. Rien ne sort de l'app : pas de captures, pas de partage de profils, de conversations ou de photos. Ne montre jamais une autre personne sans son accord. Ne révèle jamais l'orientation de quelqu'un.</p>
    <h2>4. Sécurité</h2><p>Signale tout comportement inquiétant et toute personne qui semble mineure. Rencontre-toi d'abord dans un lieu public.</p>
    <h2>5. Pas de commerce ni de drogue</h2><p>Pas de prostitution, d'escort, de contenu payant, de publicité, d'arnaque, ni de vente ou d'incitation à consommer des drogues.</p>${i.cruise ? "<h2>7. Carte et lieux</h2><p>La carte montre des établissements et des événements validés par l'équipe. Les relations sexuelles dans un lieu exposé au public sont un délit (Code pénal, art. 222-32) : n'en propose pas sur la carte. Méfie-toi des rendez-vous isolés proposés par un profil récent ou sans photo, et signale toute tentative de guet-apens.</p>" : ''}
    <h2>6. Parrainage responsable</h2><p>Ne parraine que des personnes que tu connais vraiment.</p>`],

  cgv: ['Conditions générales de vente (abonnement)', (i) => `
    <p><mark>Modèle à activer seulement le jour où l'abonnement payant est lancé, après relecture par un avocat.</mark></p>
    <h2>1. Offre</h2><p>${i.plus} est un abonnement facultatif qui donne accès à des fonctions supplémentaires listées dans l'app. Prix : ${i.price} € TTC par mois, affiché avant tout paiement.</p>
    <h2>2. Durée et renouvellement</h2><p>Abonnement mensuel renouvelé automatiquement jusqu'à résiliation. Pour les durées plus longues, tu es prévenu avant chaque renouvellement.</p>
    <h2>3. Droit de rétractation</h2><p>Tu disposes de 14 jours pour te rétracter (Code de la consommation, art. L221-18). Si tu demandes que l'abonnement commence tout de suite, tu peux quand même te rétracter : seule la période déjà utilisée est due.</p>
    <h2>4. Résiliation en trois clics</h2><p>Moi › ${i.plus} › Résilier, puis confirmer. La résiliation prend effet à la fin de la période payée. Achat via l'App Store ou Google Play : la résiliation se fait aussi depuis les réglages de ton téléphone.</p>
    <h2>5. Médiation</h2><p>En cas de litige non résolu avec ${i.contact}, tu peux saisir gratuitement le médiateur de la consommation : ${i.mediator}.</p>`]
};

function page(title, body, brand = 'ILD') {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · ${esc(brand)}</title><link rel="stylesheet" href="/app/app.css"></head>
<body><main class="legal"><a href="/" class="legal-back">← ${esc(brand)}</a><h1>${esc(title)}</h1>${body}
<nav class="legal-nav"><a href="/legal/cgu">CGU</a><a href="/legal/confidentialite">Confidentialité</a><a href="/legal/charte">Charte</a><a href="/legal/mentions">Mentions légales</a><a href="/legal/signaler">Signaler un contenu</a></nav></main></body></html>`;
}

function reportPage(brand) {
  const reasons = Object.entries(REPORT_REASONS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  return page('Signaler un contenu illégal', `
    <p>Ce formulaire est ouvert à tous, même sans compte (règlement européen sur les services numériques, art. 16). Membre ? Tu peux aussi signaler directement depuis un profil ou une conversation.</p>
    <form id="report" class="stack">
      <label>Où se trouve le contenu ? (prénom et âge affichés, description, date)<textarea name="location" class="input" required maxlength="1000"></textarea></label>
      <label>Motif<select name="reason" class="input">${reasons}</select></label>
      <label>Pourquoi ce contenu est-il illégal ou contraire à la charte ?<textarea name="explanation" class="input" required maxlength="2000"></textarea></label>
      <label>Ton nom (facultatif pour un contenu pédocriminel)<input name="name" class="input" maxlength="120"></label>
      <label>Ton e-mail, pour recevoir notre décision<input name="email" type="email" class="input" maxlength="200"></label>
      <label class="check"><input type="checkbox" name="good_faith" required> Je déclare de bonne foi que les informations fournies sont exactes et complètes.</label>
      <button class="btn primary" type="submit">Envoyer</button>
      <p id="report-status" role="status"></p>
    </form>
    <p class="small">Contenu pédocriminel : signale-le aussi sur internet-signalement.gouv.fr (PHAROS). Danger immédiat : 17 ou 112.</p>
    <script type="module" src="/app/legal-report.js"></script>`, brand);
}

export function renderLegal(db, doc, config) {
  if (doc === 'signaler') return reportPage(config.brand.name);
  const d = DOCS[doc];
  if (!d) return null;
  return page(d[0], d[1](info(db, config)), config.brand.name);
}

export function registerLegalRoutes(r) {
  r.get('/api/legal', (ctx) => ({
    version: LEGAL_VERSION,
    contact: getSetting(ctx.db, 'legal_contact_email') || null,
    dpo: getSetting(ctx.db, 'legal_dpo_email') || null,
    documents: Object.fromEntries(Object.entries(DOCS).map(([k, [title]]) => [k, title]))
  }));

  r.post('/api/legal/accept', (ctx) => {
    const u = requireAccount(ctx);
    if (!ctx.body.accept) fail(400, 'Accepte les conditions pour continuer.');
    const now = Date.now();
    ctx.db.prepare('UPDATE users SET legal_version = ?, legal_accepted_at = ?, charter_at = ? WHERE id = ?').run(LEGAL_VERSION, now, now, u.id);
    return { ok: true, version: LEGAL_VERSION };
  });

  // Signalement public (sans compte).
  r.post('/api/public/report', (ctx) => {
    if (ctx.config.rateLimit) publicReportLimit(ctx.ip);
    const b = ctx.body;
    if (!b.good_faith) fail(400, 'La déclaration de bonne foi est nécessaire.');
    const reason = REPORT_REASONS[b.reason] ? b.reason : 'other';
    const location = str(b.location, 1000, { required: true, label: 'Emplacement du contenu' });
    const explanation = str(b.explanation, 2000, { required: true, label: 'Explication' });
    const name = str(b.name, 120, { label: 'Nom' });
    const email = str(b.email, 200, { label: 'E-mail' });
    if (reason !== 'minor' && !name) fail(400, 'Indique ton nom (sauf pour un contenu impliquant un mineur).');
    const info = ctx.db.prepare(`INSERT INTO reports (reporter_id, reporter_contact, target_type, target_id, reason, details, evidence, created_at)
      VALUES (NULL, ?, 'external', 0, ?, ?, ?, ?)`).run(JSON.stringify({ name, email }), reason, explanation, JSON.stringify({ location }), Date.now());
    return { ok: true, id: Number(info.lastInsertRowid) };
  });
}

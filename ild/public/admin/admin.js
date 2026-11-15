// Back office ILD : candidatures, membres, modération, recours, événements, abonnements, conformité, journal, réglages.
import { api, h, fmtDate, ago } from '/shared/lib.js';
import { setLang } from '/shared/i18n.js';

setLang('fr', { save: false }); // le back office reste en français, quelle que soit la langue du navigateur

const root = document.getElementById('admin');
let me = null;
let stats = null;
let meta = null;
const PHOTO_STATUS = { pending: 'à valider', approved: 'validée', rejected: 'refusée' };

const REASON_LABEL = {
  harassment: 'Harcèlement', fake: 'Faux profil', minor: 'Personne mineure', non_consensual: 'Partagé sans accord',
  hate: 'Haine', spam: 'Spam / arnaque', prostitution: 'Prostitution / payant', illegal: 'Contenu illégal', other: 'Autre'
};
const URGENT = ['minor', 'non_consensual', 'illegal'];
const STATUS_BADGE = {
  member: ['Membre', 'ok'], waitlist: ["Liste d'attente", 'info'], pending: ['Âge à vérifier', 'warn'], refused: ['Refusé', 'bad'],
  suspended: ['Suspendu', 'warn'], banned: ['Banni', 'bad']
};
const ID_BADGE = { none: ['Non lancée', ''], submitted: ['En cours', 'warn'], verified: ['Vérifié', 'ok'], failed: ['Échec', 'bad'] };
const NOTICE_LABEL = { application_refused: 'Candidature refusée', account_suspended: 'Compte suspendu', account_banned: 'Compte banni', content_removed: 'Contenu retiré', photo_rejected: 'Photo refusée' };
const euros = (c) => `${(c / 100).toFixed(2).replace('.', ',')} €`;

const badge = ([label, cls]) => h('span', { class: `badge ${cls || ''}` }, label);

function toastMsg(m, err) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = h('div', { class: `toast${err ? ' error' : ''}`, role: err ? 'alert' : 'status' }, m);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

async function act(fn, okMsg, after) {
  try {
    await fn();
    if (okMsg) toastMsg(okMsg);
    stats = await api('GET', '/api/admin/stats');
    if (after) await after();
  } catch (e) { toastMsg(e.message, true); }
}

// Choix d'un motif + explication écrite pour la personne (DSA art. 17).
function decisionFields(grounds, def) {
  const ground = h('select', { class: 'input', 'aria-label': 'Motif' }, h('option', { value: '' }, 'Motif…'),
    Object.entries(grounds).map(([k, v]) => h('option', { value: k, selected: k === def }, v)));
  const explanation = h('textarea', { class: 'input', maxlength: 2000, placeholder: 'Explication envoyée à la personne : faits, date, contenu concerné', 'aria-label': 'Explication' });
  return { ground, explanation, el: h('div', { class: 'stack' }, ground, explanation) };
}

function layout(active, ...content) {
  const link = (key, label, count, urgent) => h('a', { href: `#/${key}`, class: active === key ? 'on' : '', 'aria-current': active === key ? 'page' : null },
    label, count ? h('span', { class: `count${urgent ? ' urgent' : ''}` }, String(count)) : null);
  root.replaceChildren(h('div', { class: 'layout' },
    h('nav', { class: 'side', 'aria-label': 'Back office' },
      h('div', { class: 'brand' }, meta?.brand?.name || 'ILD', h('span', null, ' ·'), ' admin'),
      link('dashboard', 'Tableau de bord'),
      link('applications', 'Candidatures', stats?.ready_for_committee),
      link('members', 'Membres'),
      link('photos', 'Photos à valider', stats?.photos_to_review),
      link('reports', 'Signalements', stats?.reports_open, stats?.reports_urgent > 0 || stats?.reports_late > 0),
      link('appeals', 'Recours', stats?.appeals_pending),
      link('events', 'Événements'),
      link('spots', 'Lieux (carte)', stats?.spots_pending),
      link('plans', 'Plans à plusieurs', stats?.plans_live),
      link('subscriptions', 'Abonnements'),
      link('compliance', 'Conformité légale'),
      link('audit', 'Journal'),
      link('settings', 'Réglages'),
      h('div', { class: 'grow' }),
      h('a', { href: '/', target: '_blank', rel: 'noopener' }, "Voir l'app"),
      h('a', { href: '#/logout' }, 'Se déconnecter')),
    h('main', { class: 'main' }, ...content)));
  window.scrollTo(0, 0);
}

// ---------- pages ----------
function pageLogin() {
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'username', placeholder: 'E-mail', 'aria-label': 'E-mail' });
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'Mot de passe', 'aria-label': 'Mot de passe' });
  root.replaceChildren(h('form', { class: 'login', onsubmit: async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/auth/login', { email: email.value, password: pass.value });
      me = await api('GET', '/api/me');
      if (me.role !== 'admin') { toastMsg("Ce compte n'est pas administrateur.", true); return; }
      route();
    } catch (err) { toastMsg(err.message, true); }
  } }, h('h1', null, 'ILD · Back office'), email, pass, h('button', { class: 'btn primary', type: 'submit' }, 'Se connecter')));
}

function pageDashboard() {
  const s = stats;
  const kpi = (label, value, href, alert) => h('div', { class: `kpi${alert ? ' alert' : ''}` }, h('span', { class: 'muted' }, label), h('b', null, String(value)),
    href ? h('a', { href }, 'Voir') : null);
  layout('dashboard',
    h('h1', null, 'Tableau de bord'),
    s.reports_urgent ? h('div', { class: 'note bad' }, `${s.reports_urgent} signalement(s) urgent(s) : mineur, contenu non consenti ou illégal. À traiter en priorité. Contenu pédocriminel : PHAROS.`) : null,
    s.reports_late ? h('div', { class: 'note warn' }, `${s.reports_late} signalement(s) ouvert(s) depuis plus de 24 h.`) : null,
    h('h2', null, 'À traiter'),
    h('div', { class: 'kpis' },
      kpi('Prêts pour le comité', s.ready_for_committee, '#/applications?status=waitlist'),
      kpi('Photos à valider', s.photos_to_review, '#/photos'),
      kpi('Signalements ouverts', s.reports_open, '#/reports', s.reports_urgent > 0),
      kpi('Recours en attente', s.appeals_pending, '#/appeals')),
    h('h2', null, 'Communauté'),
    h('div', { class: 'kpis' },
      kpi('Membres', s.members, '#/members'),
      kpi("Liste d'attente", s.waitlist, '#/applications?status=waitlist'),
      kpi('Âge à vérifier', s.pending_id, '#/applications?status=pending'),
      kpi('Position activée', s.located),
      kpi('Dispos maintenant', s.available_now),
      kpi('En ligne maintenant', s.online_now),
      kpi('Lieux à valider', s.spots_pending, '#/spots'),
      kpi('Plans à plusieurs en cours', s.plans_live, '#/plans'),
      kpi(s.payments_enabled ? 'Abonnés' : 'Abonnés (payant désactivé)', s.subscribers, '#/subscriptions'),
      kpi('Suspendus ou bannis', s.suspended, '#/members?status=banned')),
    h('h2', null, '7 derniers jours'),
    h('div', { class: 'kpis' }, kpi('Candidatures', s.signups_7d), kpi('Matchs', s.matches_7d), kpi('Messages', s.messages_7d)));
}

async function pageApplications(params) {
  const status = params.get('status') || 'waitlist';
  const d = await api('GET', `/api/admin/applications?status=${status}`);
  const rows = d.applications.map((a) => h('tr', null,
    status === 'waitlist' ? h('td', null, h('b', null, `#${a.waitlist_position}`)) : null,
    h('td', null, h('a', { href: `#/application/${a.id}` }, h('b', null, `${a.first_name}, ${a.age}`)), h('div', { class: 'small' }, a.email)),
    h('td', null, a.photos.length ? h('div', { class: 'thumbs' }, a.photos.slice(0, 3).map((p) => h('img', { src: `/photos/${p.id}`, alt: '', title: p.status }))) : h('span', { class: 'small' }, '—')),
    h('td', null, badge(ID_BADGE[a.id_check_status])),
    h('td', null, `${a.vouches}`, a.vouchers.length ? h('div', { class: 'small' }, a.vouchers.map((v) => v.first_name).join(', ')) : null),
    h('td', null, a.mandatory_ok ? badge(['Complet', 'ok']) : badge([`${a.checks_ok}/${a.checks_total}`, 'warn'])),
    h('td', { class: 'small nowrap' }, ago(a.created_at)),
    h('td', { class: 'actions' }, h('a', { class: 'btn', href: `#/application/${a.id}` }, 'Ouvrir le dossier'))));
  layout('applications',
    h('h1', null, 'Candidatures'),
    h('div', { class: 'tabs' }, [['pending', 'Âge à vérifier'], ['waitlist', "Liste d'attente"], ['refused', 'Refusées']].map(([k, v]) =>
      h('a', { href: `#/applications?status=${k}`, class: status === k ? 'on' : '' }, v))),
    h('div', { class: 'note' }, "Processus : 1. inscription et accords → 2. âge vérifié par le prestataire → 3. photo validée → 4. parrainages → 5. comité. On n'accepte qu'un dossier dont les vérifications obligatoires sont faites. On ne refuse jamais pour l'apparence, l'âge (au-delà de 18 ans), l'origine, le handicap ou le lieu de vie (art. 225-1 du Code pénal)."),
    d.applications.length ? h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, status === 'waitlist' ? h('th', null, 'Rang') : null, h('th', null, 'Candidat'), h('th', null, 'Photos'), h('th', null, 'Âge'),
        h('th', null, 'Parrainages'), h('th', null, 'Dossier'), h('th', null, 'Reçue'), h('th', null, ''))),
      h('tbody', null, rows))) : h('p', { class: 'empty' }, 'Rien ici.'));
}

async function pageApplication(id) {
  const d = await api('GET', `/api/admin/applications/${id}`);
  const u = d.user;
  const p = d.profile;
  const mandatoryOk = d.checks.filter((c) => c.mandatory).every((c) => c.ok);
  const dec = decisionFields(d.grounds, 'fake_profile');
  const manualNote = h('input', { class: 'input grow', maxlength: 500, placeholder: "Justification (ex. pièce vérifiée en visio par l'équipe)", 'aria-label': 'Justification' });
  const reload = () => pageApplication(id);
  layout('applications',
    h('div', { class: 'row' }, h('a', { href: `#/applications?status=${u.status === 'refused' ? 'refused' : u.status}` }, '← Candidatures')),
    h('div', { class: 'row between' }, h('h1', null, `${u.first_name}, ${u.age}`), badge(STATUS_BADGE[u.status] || [u.status, ''])),
    h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '18px' } },
      h('div', { class: 'card grow', style: { minWidth: '300px' } },
        h('h2', null, 'Vérifications'),
        h('ul', { class: 'checklist' }, d.checks.map((c) => h('li', { class: c.ok ? 'ok' : c.mandatory ? 'bad' : 'warn' },
          h('span', { class: 'mark', 'aria-hidden': 'true' }, c.ok ? '✓' : c.mandatory ? '✕' : '!'),
          h('span', { class: 'grow' }, c.label, c.mandatory ? '' : ' (conseillé)', c.detail ? h('div', { class: 'small' }, c.detail) : null),
          h('span', { class: 'visually-hidden' }, c.ok ? 'fait' : 'manquant')))),
        u.status === 'waitlist' ? h('button', { class: 'btn primary', disabled: !mandatoryOk, onclick: () => act(() => api('POST', `/api/admin/applications/${id}/accept`), `${u.first_name} est membre.`, reload) }, mandatoryOk ? 'Accepter' : 'Accepter (vérifications manquantes)') : null,
        ['pending', 'waitlist'].includes(u.status) && !d.checks.find((c) => c.key === 'age_verified').ok ? h('details', null,
          h('summary', null, "Valider l'âge manuellement"),
          h('p', { class: 'small' }, "À utiliser seulement si le prestataire n'a pas pu conclure et que l'âge a été contrôlé autrement. La justification est inscrite au journal."),
          h('div', { class: 'row' }, manualNote, h('button', { class: 'btn', onclick: () => act(() => api('POST', `/api/admin/applications/${id}/verify-id`, { result: 'verified', note: manualNote.value }), 'Âge validé.', reload) }, 'Valider'))) : null),
      h('div', { class: 'card grow', style: { minWidth: '300px' } },
        h('h2', null, 'Profil'),
        u.photos.length ? h('div', { class: 'thumbs big' }, u.photos.map((ph) => h('figure', null, h('img', { src: `/photos/${ph.id}`, alt: '' }), h('figcaption', { class: 'small' }, ph.status === 'pending' ? h('a', { href: '#/photos' }, 'à valider') : PHOTO_STATUS[ph.status])))) : h('span', { class: 'small' }, 'Aucune photo.'),
        h('dl', null,
          h('dt', null, 'E-mail'), h('dd', null, u.email),
          h('dt', null, 'Ville'), h('dd', null, u.city),
          h('dt', null, 'Cherche'), h('dd', null, p.seeking.map((x) => meta.seeking[x] || x).join(', ') || '—'),
          h('dt', null, 'Goûts'), h('dd', null, [...p.tastes, ...p.interests].join(', ') || '—'),
          h('dt', null, 'Métier / bio'), h('dd', null, [p.job, p.bio].filter(Boolean).join(' · ') || '—'),
          h('dt', null, 'Invité par'), h('dd', null, u.invited_by ? u.invited_by.first_name : '—'),
          h('dt', null, 'Parrainé par'), h('dd', null, u.vouchers.map((v) => v.first_name).join(', ') || '—'),
          h('dt', null, 'Accords'), h('dd', null, `âge ${fmtDate(d.consents.age, false)} · orientation ${fmtDate(d.consents.orientation, false)} · CGU v${d.consents.legal_version || '—'}`),
          h('dt', null, 'Vérifications'), h('dd', null, d.verifications.map((v) => `${v.provider} : ${v.status} (${fmtDate(v.created_at)})`).join(' · ') || '—')),
        h('p', { class: 'small' }, "Position et goûts intimes ne servent jamais à décider d'une admission."))),
    ['pending', 'waitlist'].includes(u.status) ? h('div', { class: 'card' },
      h('h2', null, 'Refuser la candidature'),
      h('p', { class: 'small' }, "La personne reçoit le motif et l'explication, et peut faire un recours. Pour un refus « sécurité » ou « mineur », son e-mail est bloqué."),
      dec.el,
      h('div', null, h('button', { class: 'btn danger', onclick: () => {
        if (!dec.ground.value) return toastMsg('Choisis un motif.', true);
        act(() => api('POST', `/api/admin/applications/${id}/refuse`, { ground: dec.ground.value, explanation: dec.explanation.value }), 'Candidature refusée.', reload);
      } }, 'Refuser'))) : null,
    d.notices.length ? h('div', { class: 'card' }, h('h2', null, 'Décisions envoyées'), d.notices.map((n) => h('div', { class: 'small' }, `${fmtDate(n.created_at)} · ${NOTICE_LABEL[n.kind]} · recours : ${n.appeal_status}`))) : null,
    d.history.length ? h('div', { class: 'card' }, h('h2', null, 'Historique'), d.history.map((x) => h('div', { class: 'small' }, `${fmtDate(x.created_at)} · ${x.action}`))) : null);
}

async function pageMembers(params) {
  const q = params.get('q') || '';
  const status = params.get('status') || '';
  const d = await api('GET', `/api/admin/members?q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`);
  const search = h('input', { class: 'input', type: 'search', value: q, placeholder: 'Prénom ou e-mail', 'aria-label': 'Rechercher' });
  layout('members',
    h('h1', null, 'Membres'),
    h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); location.hash = `#/members?q=${encodeURIComponent(search.value)}${status ? `&status=${status}` : ''}`; } },
      search, h('button', { class: 'btn', type: 'submit' }, 'Rechercher'),
      h('div', { class: 'tabs' }, [['', 'Tous'], ['member', 'Actifs'], ['suspended', 'Suspendus'], ['banned', 'Bannis']].map(([k, v]) =>
        h('a', { href: `#/members?status=${k}`, class: status === k ? 'on' : '' }, v)))),
    d.members.length ? h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Membre'), h('th', null, 'Quartier'), h('th', null, 'Statut'), h('th', null, 'ILD+'), h('th', null, 'Signalements'), h('th', null, 'Depuis'))),
      h('tbody', null, d.members.map((m) => h('tr', null,
        h('td', null, h('a', { href: `#/member/${m.id}` }, h('b', null, `${m.first_name}, ${m.age}`)), h('div', { class: 'small' }, m.email)),
        h('td', null, m.neighborhood || '—'),
        h('td', null, badge(STATUS_BADGE[m.status])),
        h('td', null, m.premium ? badge(['Offert', 'info']) : m.subscribed ? badge(['Abonné', 'info']) : '—'),
        h('td', null, m.reports ? badge([String(m.reports), 'warn']) : '0'),
        h('td', { class: 'small' }, fmtDate(m.accepted_at || m.created_at, false))))))) : h('p', { class: 'empty' }, 'Aucun membre trouvé.'));
}

async function pageMember(id) {
  const d = await api('GET', `/api/admin/members/${id}`);
  const u = d.user;
  const dec = decisionFields(d.grounds, 'charter');
  const setStatus = (status, label) => {
    if (status !== 'member' && !dec.ground.value) return toastMsg('Choisis un motif.', true);
    act(() => api('POST', `/api/admin/members/${id}/status`, { status, ground: dec.ground.value, explanation: dec.explanation.value }), label, () => pageMember(id));
  };
  layout('members',
    h('div', { class: 'row' }, h('a', { href: '#/members' }, '← Membres')),
    h('div', { class: 'row between' }, h('h1', null, `${u.first_name}, ${u.age}`), badge(STATUS_BADGE[u.status] || [u.status, ''])),
    h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '18px' } },
      h('div', { class: 'card grow', style: { minWidth: '300px' } },
        h('h2', null, 'Profil'),
        u.photos.length ? h('div', { class: 'thumbs' }, u.photos.map((p) => h('img', { src: `/photos/${p.id}`, alt: '', title: p.status }))) : null,
        h('dl', null,
          h('dt', null, 'E-mail'), h('dd', null, u.email),
          h('dt', null, 'Ville'), h('dd', null, `${u.city}${u.neighborhood ? ` · ${u.neighborhood}` : ''}`),
          h('dt', null, 'Métier'), h('dd', null, d.profile.job || '—'),
          h('dt', null, 'Position'), h('dd', null, u.position || '—'),
          h('dt', null, 'Localisation'), h('dd', null, u.location ? `${u.location.source === 'gps' ? 'GPS' : 'Quartier'} · ${fmtDate(u.location.updated_at)}` : 'Désactivée'),
          h('dt', null, 'Parrainé par'), h('dd', null, u.vouchers.map((v) => v.first_name).join(', ') || '—'),
          h('dt', null, 'Accords'), h('dd', null, `orientation ${fmtDate(u.consents.orientation, false)} · CGU v${u.consents.legal_version || '—'}${u.consents.geo ? ` · position ${fmtDate(u.consents.geo, false)}` : ''}`),
          h('dt', null, 'Membre depuis'), h('dd', null, u.accepted_at ? fmtDate(u.accepted_at, false) : '—'),
          h('dt', null, 'Abonnement'), h('dd', null, u.premium ? 'ILD+ offert' : d.subscription ? `${d.subscription.status}${d.subscription.cancel_at_period_end ? ' (résilié)' : ''} · fin ${fmtDate(d.subscription.current_period_end, false)}` : '—'),
          h('dt', null, 'Activité'), h('dd', null, `${d.stats.matches} matchs · ${d.stats.messages} messages · ${d.stats.albums} albums (${d.stats.album_photos} photos)`))),
      h('div', { class: 'card grow', style: { minWidth: '300px' } },
        h('h2', null, 'Sanction ou réactivation'),
        h('p', { class: 'small' }, 'Toute suspension ou bannissement envoie le motif et ton explication à la personne, qui peut faire un recours. Bannir bloque aussi son e-mail.'),
        dec.el,
        h('div', { class: 'row' },
          u.status !== 'member' ? h('button', { class: 'btn ok', onclick: () => setStatus('member', 'Compte réactivé.') }, 'Réactiver') : null,
          u.status !== 'suspended' ? h('button', { class: 'btn', onclick: () => setStatus('suspended', 'Compte suspendu.') }, 'Suspendre') : null,
          u.status !== 'banned' ? h('button', { class: 'btn danger', onclick: () => setStatus('banned', 'Compte banni.') }, 'Bannir') : null),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => act(() => api('POST', `/api/admin/members/${id}/premium`, { active: !u.premium }), u.premium ? 'ILD+ retiré.' : 'ILD+ offert.', () => pageMember(id)) }, u.premium ? 'Retirer ILD+ offert' : 'Offrir ILD+')),
        h('h2', null, `Signalements reçus (${d.reports_against.length})`),
        d.reports_against.length ? d.reports_against.map((r) => h('div', { class: 'row between' }, h('span', null, REASON_LABEL[r.reason] || r.reason), badge(r.status === 'open' ? ['Ouvert', 'warn'] : [r.status === 'actioned' ? 'Sanctionné' : 'Classé', '']), h('span', { class: 'small' }, fmtDate(r.created_at))))
          : h('span', { class: 'small' }, 'Aucun.'),
        h('span', { class: 'small' }, `Signalements faits par ce membre : ${d.reports_made}`),
        d.notices.length ? [h('h2', null, 'Décisions envoyées'), d.notices.map((n) => h('div', { class: 'small' }, `${fmtDate(n.created_at)} · ${NOTICE_LABEL[n.kind]} · recours : ${n.appeal_status}`))] : null,
        h('h2', null, 'Historique admin'),
        d.history.length ? d.history.map((x) => h('div', { class: 'small' }, `${fmtDate(x.created_at)} · ${x.action}`)) : h('span', { class: 'small' }, 'Aucune action.'))));
}

async function pagePhotos() {
  const d = await api('GET', '/api/admin/photos');
  layout('photos',
    h('h1', null, 'Photos de profil à valider'),
    d.explicit_allowed ? h('div', { class: 'note warn' }, "Photos explicites autorisées sur ce service (réglage « photos de profil explicites »). La nudité d'un adulte n'est pas un motif de refus : valide « comme explicite » toute photo explicite, signalée ou non. Refuse toujours : une personne mineure ou qui en a l'apparence, une personne qui n'est pas le titulaire du compte, une image sans accord apparent, la violence, tout contenu illégal.") : null,
    h('div', { class: 'note' }, d.explicit_allowed ? "Les photos d'albums privés et du chat ne passent pas ici : détection automatique et signalements. Un refus envoie le motif à la personne." : "Règle : la personne reconnaissable, pas de nudité, pas de mineur, pas d'autre personne identifiable. Les photos d'albums privés ne passent pas ici : détection automatique et signalements. Un refus envoie le motif à la personne."),
    d.photos.length ? h('div', { class: 'photos' }, d.photos.map((p) => {
      const reason = h('select', { class: 'input', 'aria-label': 'Motif du refus' }, Object.entries(d.templates).map(([k, v]) => h('option', { value: k }, v)));
      return h('div', { class: 'photo' },
        h('img', { src: `/photos/${p.id}`, alt: `Photo de ${p.first_name}` }),
        h('div', { class: 'row' }, h('a', { href: `#/${p.user_status === 'member' ? 'member' : 'application'}/${p.user_id}` }, p.first_name), h('span', { class: 'small' }, ago(p.created_at))),
        h('div', { class: 'stack', style: { padding: '0 10px 10px' } },
          d.explicit_allowed && p.explicit ? h('span', { class: 'small' }, 'Signalée explicite par le membre') : null,
          h('button', { class: 'btn ok', onclick: () => act(() => api('POST', `/api/admin/photos/${p.id}/review`, d.explicit_allowed ? { decision: 'approve', explicit: false } : { decision: 'approve' }), 'Photo validée.', pagePhotos) }, d.explicit_allowed ? 'Valider (non explicite)' : 'Valider'),
          d.explicit_allowed ? h('button', { class: 'btn', onclick: () => act(() => api('POST', `/api/admin/photos/${p.id}/review`, { decision: 'approve', explicit: true }), 'Photo validée comme explicite.', pagePhotos) }, 'Valider comme explicite') : null,
          reason,
          h('button', { class: 'btn danger', onclick: () => act(() => api('POST', `/api/admin/photos/${p.id}/review`, { decision: 'reject', ground: reason.value }), 'Photo refusée, motif envoyé.', pagePhotos) }, 'Refuser')));
    })) : h('p', { class: 'empty' }, 'Aucune photo en attente.'));
}

function evidenceView(r) {
  const e = r.evidence || {};
  if (e.plan) {
    return h('div', { class: 'evidence' },
      h('div', { class: 'msg flag' }, h('b', null, `Plan « ${e.plan.title} » `), e.plan.description || '', e.plan.address ? ` · Adresse : ${e.plan.address}` : ''),
      (e.conversation || []).map((m) => h('div', { class: 'msg' }, h('b', null, `${m.sender} `), h('span', { class: 'small' }, `${fmtDate(m.created_at)} `), m.body)));
  }
  if (e.conversation) {
    return h('div', { class: 'evidence' }, e.conversation.map((m) => h('div', { class: `msg${m.id === e.reported_message_id ? ' flag' : ''}` },
      h('b', null, `${m.sender} `), h('span', { class: 'small' }, `${fmtDate(m.created_at)} `), m.kind === 'album' ? `[album « ${m.body} »]` : m.body)));
  }
  if (e.post) return h('div', { class: 'evidence' }, e.post.body);
  if (e.photo_id) return h('div', { class: 'thumbs' }, h('img', { src: `/photos/${e.photo_id}`, alt: 'Photo signalée', style: { width: '120px', height: '160px' } }), e.kind === 'album' ? h('span', { class: 'small' }, "Photo d'album privé") : null);
  if (e.location) return h('div', { class: 'evidence' }, `Emplacement indiqué : ${e.location}`);
  if (e.profile) return h('div', { class: 'evidence' }, `Profil : ${e.profile.first_name || ''}${e.profile.job ? ` · ${e.profile.job}` : ''}${e.profile.bio ? ` · « ${e.profile.bio} »` : ''}`);
  return null;
}

async function pageReports(params) {
  const status = params.get('status') || 'open';
  const d = await api('GET', `/api/admin/reports?status=${status}`);
  const card = (r) => {
    const dec = decisionFields(d.grounds, r.reason in d.grounds ? r.reason : r.reason === 'fake' ? 'fake_profile' : 'charter');
    const note = h('input', { class: 'input grow', placeholder: 'Note interne (facultatif)', maxlength: 1000, 'aria-label': 'Note interne' });
    const resolve = (action, label) => {
      if (['remove_content', 'suspend', 'ban'].includes(action) && !dec.ground.value) return toastMsg('Choisis un motif.', true);
      act(() => api('POST', `/api/admin/reports/${r.id}/resolve`, { action, ground: dec.ground.value, explanation: dec.explanation.value, note: note.value }), label, () => pageReports(params));
    };
    const resolution = r.resolution ? JSON.parse(r.resolution) : null;
    const typeLabel = { message: 'Conversation', photo: 'Photo', post: 'Publication', plan: 'Plan à plusieurs', user: 'Profil', external: 'Signalement public (sans compte)' }[r.target_type];
    return h('div', { class: 'card' },
      h('div', { class: 'row between' },
        h('div', { class: 'row' }, badge([REASON_LABEL[r.reason] || r.reason, URGENT.includes(r.reason) ? 'bad' : 'warn']), h('span', { class: 'muted' }, typeLabel)),
        h('span', { class: 'small' }, `${fmtDate(r.created_at)} · ${ago(r.created_at)}`)),
      r.target_user_id ? h('div', null, 'Visé : ', h('a', { href: `#/member/${r.target_user_id}` }, r.target_name || `#${r.target_user_id}`), r.target_status && r.target_status !== 'member' ? [' ', badge(STATUS_BADGE[r.target_status] || [r.target_status, ''])] : null) : null,
      h('div', { class: 'muted' }, r.reporter_contact ? `Signalé par ${r.reporter_contact.name || 'anonyme'}${r.reporter_contact.email ? ` (${r.reporter_contact.email})` : ''}` : `Signalé par ${r.reporter_name || 'un compte supprimé'}`),
      r.details ? h('p', { style: { margin: '0' } }, `« ${r.details} »`) : null,
      evidenceView(r),
      URGENT.includes(r.reason) && status === 'open' ? h('div', { class: 'note bad' }, 'Priorité absolue. Contenu pédocriminel : retirer, bannir, conserver les preuves et signaler sur internet-signalement.gouv.fr (PHAROS).') : null,
      status === 'open' ? [
        r.target_user_id ? [h('p', { class: 'small' }, 'Pour une sanction : motif et explication envoyés à la personne (elle peut faire un recours).'), dec.el] : null,
        h('div', { class: 'row' }, note),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => resolve('dismiss', 'Signalement classé.') }, 'Classer sans suite'),
          !r.target_user_id ? h('button', { class: 'btn', onclick: () => resolve('handled', 'Signalement traité.') }, 'Traité (action hors app)') : null,
          r.target_user_id && r.target_type !== 'user' ? h('button', { class: 'btn', onclick: () => resolve('remove_content', 'Contenu retiré, motif envoyé.') }, 'Retirer le contenu') : null,
          r.target_user_id ? h('button', { class: 'btn', onclick: () => resolve('suspend', 'Membre suspendu.') }, 'Suspendre') : null,
          r.target_user_id ? h('button', { class: 'btn danger', onclick: () => resolve('ban', 'Membre banni.') }, 'Bannir') : null)]
        : h('span', { class: 'small' }, `Décision : ${resolution?.action || r.status}${resolution?.note ? ` · ${resolution.note}` : ''} · ${fmtDate(r.resolved_at)}`));
  };
  layout('reports',
    h('h1', null, 'Signalements'),
    h('div', { class: 'tabs' }, [['open', 'Ouverts'], ['actioned', 'Traités'], ['dismissed', 'Classés']].map(([k, v]) =>
      h('a', { href: `#/reports?status=${k}`, class: status === k ? 'on' : '' }, v))),
    h('p', { class: 'small' }, 'Les preuves sont une copie faite au moment du signalement. Chaque décision est horodatée dans le journal.'),
    d.reports.length ? d.reports.map(card) : h('p', { class: 'empty' }, 'Aucun signalement.'));
}

async function pageAppeals(params) {
  const decided = params.get('status') === 'decided';
  const d = await api('GET', `/api/admin/appeals${decided ? '?status=decided' : ''}`);
  const card = (a) => {
    const note = h('textarea', { class: 'input', maxlength: 2000, placeholder: 'Réponse envoyée à la personne', 'aria-label': 'Réponse' });
    const decide = (decision) => act(() => api('POST', `/api/admin/appeals/${a.id}/decide`, { decision, note: note.value }), decision === 'overturned' ? 'Décision annulée.' : 'Décision maintenue.', () => pageAppeals(params));
    return h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('div', { class: 'row' }, badge([a.kind_label, 'warn']), h('a', { href: `#/member/${a.user_id}` }, a.first_name)), h('span', { class: 'small' }, `Recours ${a.appeal.at ? ago(a.appeal.at) : ''}`)),
      h('dl', null, h('dt', null, 'Motif'), h('dd', null, a.ground), h('dt', null, 'Explication donnée'), h('dd', null, a.explanation), h('dt', null, 'Décision du'), h('dd', null, fmtDate(a.created_at))),
      h('div', { class: 'evidence' }, h('b', null, 'Recours : '), a.appeal.text),
      decided ? h('span', { class: 'small' }, `${a.appeal.status === 'overturned' ? 'Annulée' : 'Maintenue'} · ${a.appeal.note || ''}`)
        : [h('p', { class: 'small' }, "Le recours doit être examiné par une personne qui n'a pas pris la décision initiale, si possible."), note,
          h('div', { class: 'row' }, h('button', { class: 'btn ok', onclick: () => decide('overturned') }, 'Annuler la décision'), h('button', { class: 'btn', onclick: () => decide('upheld') }, 'Maintenir'))]);
  };
  layout('appeals',
    h('h1', null, 'Recours'),
    h('div', { class: 'tabs' }, [['', 'En attente'], ['decided', 'Décidés']].map(([k, v]) => h('a', { href: `#/appeals${k ? `?status=${k}` : ''}`, class: (decided ? 'decided' : '') === k ? 'on' : '' }, v))),
    h('p', { class: 'small' }, 'DSA art. 20 : recours gratuit, ouvert 6 mois, examiné par un humain. Annuler rétablit le compte et le contenu.'),
    d.appeals.length ? d.appeals.map(card) : h('p', { class: 'empty' }, 'Aucun recours.'));
}

async function pageEvents() {
  const d = await api('GET', '/api/admin/events');
  const f = {
    title: h('input', { class: 'input', placeholder: 'Titre', maxlength: 120, 'aria-label': 'Titre' }),
    place: h('input', { class: 'input', placeholder: 'Lieu (quartier)', maxlength: 200, 'aria-label': 'Lieu' }),
    starts_at: h('input', { class: 'input', type: 'datetime-local', 'aria-label': 'Date et heure' }),
    city: h('input', { class: 'input', value: 'Paris', maxlength: 60, 'aria-label': 'Ville' }),
    body: h('textarea', { class: 'input', placeholder: 'Description', maxlength: 1000, 'aria-label': 'Description' })
  };
  layout('events',
    h('h1', null, 'Événements « Ce soir »'),
    h('form', { class: 'card', onsubmit: (e) => {
      e.preventDefault();
      act(() => api('POST', '/api/admin/events', { title: f.title.value, place: f.place.value, starts_at: f.starts_at.value, city: f.city.value, body: f.body.value }), 'Événement publié.', pageEvents);
    } }, h('h2', null, 'Nouvel événement'), h('div', { class: 'row' }, f.title, f.place, f.starts_at, f.city), f.body,
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Publier'), h('span', { class: 'small' }, "L'adresse exacte s'envoie aux invités confirmés, pas dans l'annonce."))),
    d.events.length ? h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Titre'), h('th', null, 'Lieu'), h('th', null, 'Participants'), h('th', null, 'Statut'), h('th', null, ''))),
      h('tbody', null, d.events.map((ev) => h('tr', null,
        h('td', null, fmtDate(ev.starts_at)), h('td', null, ev.title), h('td', null, `${ev.place || ''} · ${ev.city}`), h('td', null, String(ev.going)),
        h('td', null, ev.removed ? badge(['Retiré', 'bad']) : badge(['En ligne', 'ok'])),
        h('td', { class: 'actions' }, ev.removed ? null : h('button', { class: 'btn danger', onclick: () => act(() => api('DELETE', `/api/admin/posts/${ev.id}`), 'Événement retiré.', pageEvents) }, 'Retirer'))))))) : h('p', { class: 'empty' }, 'Aucun événement.'));
}

async function pageSpots(params) {
  const status = params.get('status') || 'pending';
  const d = await api('GET', `/api/admin/spots?status=${status}`);
  const f = {
    name: h('input', { class: 'input', placeholder: 'Nom', maxlength: 80, 'aria-label': 'Nom' }),
    category: h('select', { class: 'input', 'aria-label': 'Catégorie' }, Object.entries(d.categories).map(([k, v]) => h('option', { value: k }, v))),
    lat: h('input', { class: 'input', placeholder: 'Latitude (48.8590)', inputmode: 'decimal', style: { width: '150px' }, 'aria-label': 'Latitude' }),
    lng: h('input', { class: 'input', placeholder: 'Longitude (2.3622)', inputmode: 'decimal', style: { width: '150px' }, 'aria-label': 'Longitude' }),
    description: h('input', { class: 'input grow', placeholder: 'Description', maxlength: 300, 'aria-label': 'Description' })
  };
  const review = (s, decision) => act(() => api('POST', `/api/admin/spots/${s.id}/review`, { decision }), decision === 'approve' ? 'Lieu publié.' : 'Lieu refusé.', () => pageSpots(params));
  layout('spots',
    h('h1', null, 'Lieux de la carte'),
    h('div', { class: 'note' }, "Seulement des établissements et des événements (bars, clubs, saunas, cafés, soirées). Refuse les lieux publics de drague (parcs, aires, plages) : les relations sexuelles dans un lieu exposé au public sont un délit (Code pénal, art. 222-32) et ces lieux servent aussi aux guet-apens."),
    h('div', { class: 'tabs' }, [['pending', 'À valider'], ['approved', 'Publiés'], ['rejected', 'Refusés']].map(([k, v]) => h('a', { href: `#/spots?status=${k}`, class: status === k ? 'on' : '' }, v))),
    h('form', { class: 'card', onsubmit: (e) => {
      e.preventDefault();
      act(() => api('POST', '/api/admin/spots', { name: f.name.value, category: f.category.value, lat: Number(f.lat.value), lng: Number(f.lng.value), description: f.description.value }), 'Lieu ajouté.', () => pageSpots(params));
    } }, h('h2', null, 'Ajouter un lieu'), h('div', { class: 'row' }, f.name, f.category, f.lat, f.lng), h('div', { class: 'row' }, f.description, h('button', { class: 'btn primary', type: 'submit' }, 'Ajouter'))),
    d.spots.length ? h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Lieu'), h('th', null, 'Catégorie'), h('th', null, 'Position'), h('th', null, 'Proposé par'), h('th', null, ''))),
      h('tbody', null, d.spots.map((s) => h('tr', null,
        h('td', null, h('b', null, s.name), s.description ? h('div', { class: 'small' }, s.description) : null),
        h('td', null, d.categories[s.category] || s.category),
        h('td', { class: 'small nowrap' }, h('a', { href: `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=18/${s.lat}/${s.lng}`, target: '_blank', rel: 'noopener' }, `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`)),
        h('td', null, s.creator || '—', h('div', { class: 'small' }, fmtDate(s.created_at))),
        h('td', { class: 'actions' },
          s.status !== 'approved' ? h('button', { class: 'btn ok', onclick: () => review(s, 'approve') }, 'Publier') : null,
          s.status !== 'rejected' ? h('button', { class: 'btn danger', onclick: () => review(s, 'reject') }, s.status === 'approved' ? 'Retirer' : 'Refuser') : null)))))) : h('p', { class: 'empty' }, 'Aucun lieu.'));
}

// Plans à plusieurs publiés par les membres : suivi et retrait motivé.
async function pagePlans() {
  const d = await api('GET', '/api/admin/plans');
  const STATUS = { open: ['Publié', 'ok'], cancelled: ["Annulé par l'hôte", ''], removed: ['Retiré', 'bad'] };
  const row = (p) => {
    const dec = decisionFields(d.grounds, 'prostitution');
    const remove = () => {
      if (!dec.ground.value) return toastMsg('Choisis un motif.', true);
      act(() => api('POST', `/api/admin/plans/${p.id}/remove`, { ground: dec.ground.value, explanation: dec.explanation.value }), "Plan retiré, motif envoyé à l'hôte.", pagePlans);
    };
    return h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('div', { class: 'row' }, badge(p.live ? ['En ligne', 'ok'] : STATUS[p.status] && p.status !== 'open' ? STATUS[p.status] : ['Terminé', '']), h('b', null, p.title)),
        h('span', { class: 'small' }, `${fmtDate(p.starts_at)} → ${fmtDate(p.ends_at)}`)),
      h('div', { class: 'muted' }, 'Hôte : ', h('a', { href: `#/member/${p.host_id}` }, p.host_name), ` · ${d.kinds[p.place_kind] || p.place_kind} · ${p.going} accepté${p.going > 1 ? 's' : ''} sur ${p.max_guests} · ${p.messages} message${p.messages > 1 ? 's' : ''}`),
      p.description ? h('p', { style: { margin: '0' } }, p.description) : null,
      p.status !== 'removed' ? h('details', null, h('summary', null, 'Retirer ce plan'), dec.el, h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: remove }, "Retirer et prévenir l'hôte"))) : null);
  };
  layout('plans',
    h('h1', null, 'Plans à plusieurs'),
    h('div', { class: 'note' }, "Organisés par les membres dans un lieu privé ou un établissement. Retire tout plan avec une contrepartie d'argent (proxénétisme, Code pénal art. 225-5 et suivants), de la drogue, ou un lieu exposé au public. L'adresse n'est visible que de l'hôte, des participants acceptés et, en cas de signalement, de la modération."),
    d.plans.length ? d.plans.map(row) : h('p', { class: 'empty' }, 'Aucun plan sur les 30 derniers jours.'));
}

async function pageSubscriptions() {
  const d = await api('GET', '/api/admin/subscriptions');
  const enabled = h('input', { type: 'checkbox', checked: d.payments_enabled });
  const price = h('input', { class: 'input', type: 'number', min: 0, step: 1, value: d.price_cents, style: { width: '110px' }, 'aria-label': 'Prix en centimes' });
  const freeLikes = h('input', { class: 'input', type: 'number', min: 1, value: d.free_daily_likes, style: { width: '90px' }, 'aria-label': 'Likes gratuits par jour' });
  const feats = Object.entries(d.features).map(([k, v]) => ({ k, box: h('input', { type: 'checkbox', checked: d.plus_features.includes(k) }), v }));
  layout('subscriptions',
    h('h1', null, 'Abonnements'),
    h('div', { class: `note ${d.payments_enabled ? 'warn' : ''}` }, d.payments_enabled
      ? `Le payant est activé (prestataire : ${d.provider}). Les fonctions cochées ci-dessous demandent un abonnement.`
      : "L'app est gratuite : toutes les fonctions sont offertes à tout le monde. Active le payant le jour du lancement d'ILD+."),
    h('form', { class: 'card', onsubmit: (e) => {
      e.preventDefault();
      act(() => api('PUT', '/api/admin/settings', {
        payments_enabled: enabled.checked, plus_price_cents: Number(price.value), free_daily_likes: Number(freeLikes.value),
        plus_features: feats.filter((f) => f.box.checked).map((f) => f.k)
      }), 'Réglages enregistrés.', pageSubscriptions);
    } },
    h('label', { class: 'row' }, enabled, h('span', null, 'Activer l’abonnement payant')),
    h('label', { class: 'row' }, h('span', null, 'Prix mensuel TTC (centimes)'), price, h('span', { class: 'small' }, euros(Number(price.value) || 0))),
    h('label', { class: 'row' }, h('span', null, 'Likes gratuits par jour (sans ILD+)'), freeLikes),
    h('h2', null, 'Fonctions réservées à ILD+'),
    feats.map((f) => h('label', { class: 'row' }, f.box, h('span', null, f.v))),
    h('div', null, h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer')),
    h('p', { class: 'small' }, "Avant d'activer : CGV relues par un avocat, médiateur de la consommation indiqué, prestataire de paiement branché (App Store / Google Play obligatoires pour un achat dans l'app mobile).")),
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('span', { class: 'muted' }, 'Abonnés actifs'), h('b', null, String(d.active.length))),
      h('div', { class: 'kpi' }, h('span', { class: 'muted' }, 'Revenu mensuel récurrent'), h('b', null, euros(d.mrr_cents))),
      h('div', { class: 'kpi' }, h('span', { class: 'muted' }, 'ILD+ offerts'), h('b', null, String(d.offered)))),
    d.active.length ? h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Membre'), h('th', null, 'Prestataire'), h('th', null, 'Depuis'), h('th', null, 'Fin de période'), h('th', null, 'État'))),
      h('tbody', null, d.active.map((s) => h('tr', null,
        h('td', null, h('a', { href: `#/member/${s.user_id}` }, s.first_name), h('div', { class: 'small' }, s.email)),
        h('td', null, s.provider), h('td', null, fmtDate(s.started_at, false)), h('td', null, fmtDate(s.current_period_end, false)),
        h('td', null, s.cancel_at_period_end ? badge(['Résilié', 'warn']) : badge(['Actif', 'ok']))))))) : null);
}

async function pageCompliance() {
  const [c, s] = await Promise.all([api('GET', '/api/admin/compliance'), api('GET', '/api/admin/settings')]);
  const legalKeys = Object.keys(s.settings).filter((k) => k.startsWith('legal_'));
  const inputs = Object.fromEntries(legalKeys.map((k) => {
    const spec = s.settings[k];
    return [k, spec.type === 'bool' ? h('input', { type: 'checkbox', checked: spec.value === '1' }) : h('input', { class: 'input grow', value: spec.value, maxlength: spec.max, 'aria-label': spec.label })];
  }));
  const ok = c.checks.filter((x) => x.ok).length;
  layout('compliance',
    h('h1', null, 'Conformité légale'),
    h('div', { class: `note ${ok === c.checks.length ? '' : 'warn'}` }, `${ok} point(s) sur ${c.checks.length} au vert. Version des conditions en vigueur : ${c.legal_version}. Dernière purge : ${c.last_purge_at ? fmtDate(c.last_purge_at) : 'jamais'}.`),
    h('div', { class: 'card' }, h('h2', null, "Contrôles automatiques"),
      h('ul', { class: 'checklist' }, c.checks.map((x) => h('li', { class: x.ok ? 'ok' : 'bad' }, h('span', { class: 'mark', 'aria-hidden': 'true' }, x.ok ? '✓' : '✕'),
        h('span', { class: 'grow' }, x.label, h('div', { class: 'small' }, x.ref)), h('span', { class: 'visually-hidden' }, x.ok ? 'conforme' : 'à faire'))))),
    h('div', { class: 'card' }, h('h2', null, "À faire hors de l'app"),
      h('ul', { class: 'plain-list' }, c.outside_app.map((t) => h('li', null, t)))),
    h('form', { class: 'card', onsubmit: (e) => {
      e.preventDefault();
      act(() => api('PUT', '/api/admin/settings', Object.fromEntries(legalKeys.map((k) => [k, inputs[k].type === 'checkbox' ? inputs[k].checked : inputs[k].value]))), 'Informations légales enregistrées.', pageCompliance);
    } }, h('h2', null, 'Informations légales (mentions, CGU, confidentialité)'),
    legalKeys.map((k) => h('label', { class: 'row' }, h('span', { style: { minWidth: '260px' } }, s.settings[k].label), inputs[k])),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer'),
      [['mentions', 'Mentions légales'], ['cgu', 'CGU'], ['confidentialite', 'Confidentialité'], ['charte', 'Charte'], ['cgv', 'CGV']].map(([doc, text]) => h('a', { href: `/legal/${doc}`, target: '_blank', rel: 'noopener' }, text)))));
}

async function pageAudit() {
  const d = await api('GET', '/api/admin/audit');
  layout('audit',
    h('h1', null, 'Journal des actions'),
    h('p', { class: 'small' }, "Toutes les décisions d'administration et les vérifications, pour la traçabilité (RGPD, DSA)."),
    h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Par'), h('th', null, 'Action'), h('th', null, 'Cible'), h('th', null, 'Détails'))),
      h('tbody', null, d.entries.map((x) => h('tr', null,
        h('td', { class: 'small nowrap' }, fmtDate(x.created_at)), h('td', null, x.admin_name || 'Système'), h('td', null, x.action),
        h('td', null, x.target && x.target.startsWith('user:') ? h('a', { href: `#/member/${x.target.slice(5)}` }, x.target) : (x.target || '—')),
        h('td', { class: 'small' }, x.details || '')))))));
}

async function pageSettings() {
  const d = await api('GET', '/api/admin/settings');
  const keys = Object.keys(d.settings).filter((k) => !k.startsWith('legal_') && !['payments_enabled', 'plus_price_cents', 'plus_features', 'free_daily_likes'].includes(k));
  const inputs = Object.fromEntries(keys.map((k) => {
    const spec = d.settings[k];
    return [k, spec.type === 'bool' ? h('input', { type: 'checkbox', checked: spec.value === '1', 'aria-label': spec.label })
      : h('input', { class: 'input', type: 'number', min: spec.min, max: spec.max, value: spec.value, style: { width: '100px' }, 'aria-label': spec.label })];
  }));
  layout('settings',
    h('h1', null, 'Réglages'),
    h('form', { class: 'card', onsubmit: (e) => {
      e.preventDefault();
      act(() => api('PUT', '/api/admin/settings', Object.fromEntries(keys.map((k) => [k, inputs[k].type === 'checkbox' ? inputs[k].checked : Number(inputs[k].value)]))), 'Réglages enregistrés.');
    } }, h('h2', null, 'Règles'),
    keys.map((k) => h('label', { class: 'row between' }, h('span', null, d.settings[k].label), inputs[k])),
    h('div', null, h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer'))),
    h('div', { class: 'card' },
      h('h2', null, 'Purge des données expirées'),
      h('p', { class: 'muted', style: { margin: '0' } }, "Supprime les candidatures non abouties et les photos refusées anciennes, les sessions et accès d'albums expirés, les positions inactives, les signalements traités et les e-mails bannis au-delà des durées réglées. À planifier chaque jour en production."),
      h('div', null, h('button', { class: 'btn', onclick: () => act(async () => {
        const r = await api('POST', '/api/admin/maintenance/purge');
        toastMsg(`Purge : ${r.applicants_deleted} candidature(s), ${r.rejected_photos_deleted} photo(s), ${r.locations_cleared} position(s), ${r.album_shares_deleted} accès, ${r.reports_deleted} signalement(s), ${r.blocklist_deleted} e-mail(s) banni(s).`);
      }) }, 'Lancer la purge'))));
}

// ---------- routeur ----------
async function route() {
  const hash = location.hash || '#/dashboard';
  const [pathPart, queryPart] = hash.slice(2).split('?');
  const [page, arg] = pathPart.split('/');
  const params = new URLSearchParams(queryPart || '');
  try {
    if (!me) me = await api('GET', '/api/me').catch(() => null);
    if (!me || me.role !== 'admin') return pageLogin();
    if (!meta) meta = await api('GET', '/api/meta');
    if (page === 'logout') {
      await api('POST', '/api/auth/logout', {});
      me = null; location.hash = '#/dashboard'; return pageLogin();
    }
    stats = await api('GET', '/api/admin/stats');
    switch (page) {
      case 'applications': return await pageApplications(params);
      case 'application': return await pageApplication(arg);
      case 'members': return await pageMembers(params);
      case 'member': return await pageMember(arg);
      case 'photos': return await pagePhotos();
      case 'reports': return await pageReports(params);
      case 'appeals': return await pageAppeals(params);
      case 'events': return await pageEvents();
      case 'spots': return await pageSpots(params);
      case 'plans': return await pagePlans();
      case 'subscriptions': return await pageSubscriptions();
      case 'compliance': return await pageCompliance();
      case 'audit': return await pageAudit();
      case 'settings': return await pageSettings();
      default: return pageDashboard();
    }
  } catch (e) {
    if (e.status === 401 || e.status === 403) { me = null; return pageLogin(); }
    toastMsg(e.message, true);
  }
}

window.addEventListener('hashchange', route);
route();

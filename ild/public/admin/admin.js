// Back office ILD : candidatures, membres, modération, événements, journal, réglages.
import { api, h, toast, fmtDate, ago } from '/shared/lib.js';

const root = document.getElementById('admin');
let me = null;
let stats = null;

const REASON_LABEL = {
  harassment: 'Harcèlement', fake: 'Faux profil', minor: 'Personne mineure', non_consensual: 'Partagé sans accord',
  hate: 'Haine', spam: 'Spam / arnaque', illegal: 'Contenu illégal', other: 'Autre'
};
const URGENT = ['minor', 'non_consensual', 'illegal'];
const STATUS_BADGE = {
  member: ['Membre', 'ok'], waitlist: ["Liste d'attente", 'info'], pending: 'Identité à vérifier', refused: ['Refusé', 'bad'],
  suspended: ['Suspendu', 'warn'], banned: ['Banni', 'bad']
};
const ID_BADGE = { none: ['Non lancée', ''], submitted: ['À valider', 'warn'], verified: ['Vérifiée', 'ok'], failed: ['Échec', 'bad'] };
const SETTING_LABEL = {
  retention_months_applicants: 'Conservation des candidatures non abouties (mois)',
  retention_months_reports: 'Conservation des signalements traités (mois)',
  vouches_required: 'Parrainages requis avant examen par le comité',
  album_grant_days: "Durée d'accès par défaut à un album (jours)",
  travel_visible_days: 'Visibilité avant un voyage (jours)'
};

const badge = (pair) => {
  const [label, cls] = Array.isArray(pair) ? pair : [pair, 'warn'];
  return h('span', { class: `badge ${cls}` }, label);
};

async function act(fn, okMsg, after) {
  try {
    await fn();
    if (okMsg) toastMsg(okMsg);
    await loadStats();
    if (after) await after();
  } catch (e) { toastMsg(e.message, true); }
}

function toastMsg(m, err) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = h('div', { class: `toast${err ? ' error' : ''}`, role: err ? 'alert' : 'status' }, m);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function loadStats() { stats = await api('GET', '/api/admin/stats'); }

function layout(active, ...content) {
  const link = (key, label, count, urgent) => h('a', { href: `#/${key}`, class: active === key ? 'on' : '', 'aria-current': active === key ? 'page' : null },
    label, count ? h('span', { class: `count${urgent ? ' urgent' : ''}` }, String(count)) : null);
  root.replaceChildren(h('div', { class: 'layout' },
    h('nav', { class: 'side', 'aria-label': 'Back office' },
      h('div', { class: 'brand' }, 'ILD', h('span', null, ' ·'), ' admin'),
      link('dashboard', 'Tableau de bord'),
      link('applications', 'Candidatures', (stats?.id_to_review || 0) + (stats?.ready_for_committee || 0)),
      link('members', 'Membres'),
      link('photos', 'Photos à valider', stats?.photos_to_review),
      link('reports', 'Signalements', stats?.reports_open, stats?.reports_urgent > 0),
      link('events', 'Événements'),
      link('audit', 'Journal'),
      link('settings', 'Réglages et RGPD'),
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
    s.reports_urgent ? h('div', { class: 'note', style: { borderColor: '#5c1f1c', background: '#2a1312', color: '#ffd6d3' } },
      `${s.reports_urgent} signalement${s.reports_urgent > 1 ? 's' : ''} urgent${s.reports_urgent > 1 ? 's' : ''} (mineur, contenu non consenti ou illégal) : à traiter en priorité. Un contenu pédocriminel doit être signalé à PHAROS.`) : null,
    h('h2', null, 'À traiter'),
    h('div', { class: 'kpis' },
      kpi('Identités à valider', s.id_to_review, '#/applications?status=pending', false),
      kpi('Prêts pour le comité', s.ready_for_committee, '#/applications?status=waitlist'),
      kpi('Photos à valider', s.photos_to_review, '#/photos'),
      kpi('Signalements ouverts', s.reports_open, '#/reports', s.reports_urgent > 0)),
    h('h2', null, 'Communauté'),
    h('div', { class: 'kpis' },
      kpi('Membres', s.members, '#/members'),
      kpi('Dont ILD+', s.premium),
      kpi("Liste d'attente", s.waitlist, '#/applications?status=waitlist'),
      kpi('Identité non lancée ou en cours', s.pending_id, '#/applications?status=pending'),
      kpi('Suspendus ou bannis', s.suspended, '#/members?status=banned')),
    h('h2', null, '7 derniers jours'),
    h('div', { class: 'kpis' }, kpi('Candidatures', s.signups_7d), kpi('Matchs', s.matches_7d), kpi('Messages', s.messages_7d)));
}

async function pageApplications(params) {
  const status = params.get('status') || 'waitlist';
  const d = await api('GET', `/api/admin/applications?status=${status}`);
  const refuse = (a) => {
    const sel = h('select', { class: 'input', 'aria-label': 'Motif de refus' }, h('option', { value: '' }, 'Motif…'),
      Object.entries(d.reasons).map(([k, v]) => h('option', { value: k }, v)));
    const btn = h('button', { class: 'btn danger', onclick: () => {
      if (!sel.value) return toastMsg('Choisis un motif documenté.', true);
      act(() => api('POST', `/api/admin/applications/${a.id}/refuse`, { reason: sel.value }), `Candidature de ${a.first_name} refusée.`, () => pageApplications(params));
    } }, 'Refuser');
    return h('span', { class: 'row', style: { justifyContent: 'flex-end' } }, sel, btn);
  };
  const rows = d.applications.map((a) => h('tr', null,
    status === 'waitlist' ? h('td', null, h('b', null, `#${a.waitlist_position}`)) : null,
    h('td', null, h('div', { class: 'stack', style: { gap: '2px' } }, h('b', null, `${a.first_name}, ${a.age}`), h('span', { class: 'small' }, a.email), h('span', { class: 'small' }, a.city))),
    h('td', null, a.photos.length ? h('div', { class: 'thumbs' }, a.photos.slice(0, 3).map((p) => h('img', { src: `/photos/${p.id}`, alt: '' }))) : h('span', { class: 'small' }, '—')),
    h('td', null, badge(ID_BADGE[a.id_check_status])),
    h('td', null, h('div', { class: 'stack', style: { gap: '2px' } },
      h('span', null, `${a.vouches} / ${d.vouches_required}`, a.vouches >= d.vouches_required ? ' ' : '', a.vouches >= d.vouches_required ? badge(['OK', 'ok']) : null),
      h('span', { class: 'small' }, a.vouchers.map((v) => v.first_name).join(', ') || (a.invited_by ? `Invité par ${a.invited_by.first_name}` : '')))),
    h('td', null, a.charter_at ? badge(['Acceptée', 'ok']) : badge(['Non', 'bad'])),
    h('td', { class: 'small nowrap' }, ago(a.created_at)),
    h('td', { class: 'actions' },
      status === 'pending' ? h('div', { class: 'stack', style: { alignItems: 'flex-end', gap: '6px' } }, h('span', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('button', { class: 'btn ok', onclick: () => act(() => api('POST', `/api/admin/applications/${a.id}/verify-id`, { result: 'verified' }), 'Identité validée : passage en liste d\'attente.', () => pageApplications(params)) }, 'Identité OK'),
        h('button', { class: 'btn', onclick: () => act(() => api('POST', `/api/admin/applications/${a.id}/verify-id`, { result: 'failed' }), 'Vérification marquée en échec.', () => pageApplications(params)) }, 'Échec')),
        refuse(a)) : null,
      status === 'waitlist' ? h('div', { class: 'stack', style: { alignItems: 'flex-end', gap: '6px' } },
        h('button', { class: 'btn primary', onclick: () => act(() => api('POST', `/api/admin/applications/${a.id}/accept`), `${a.first_name} est membre.`, () => pageApplications(params)) }, 'Accepter'),
        refuse(a)) : null,
      status === 'refused' ? h('span', { class: 'small' }, d.reasons[a.refusal_reason] || '') : null)));
  layout('applications',
    h('h1', null, 'Candidatures'),
    h('div', { class: 'tabs' }, [['pending', 'Identité à vérifier'], ['waitlist', "Liste d'attente"], ['refused', 'Refusées']].map(([k, v]) =>
      h('a', { href: `#/applications?status=${k}`, class: status === k ? 'on' : '' }, v))),
    h('div', { class: 'note' }, "Grille neutre : identité vérifiée, parrainages, charte. On ne refuse jamais pour l'apparence, l'âge (au-delà de 18 ans), l'origine, le handicap ou le lieu de vie : ce sont des critères de discrimination interdits (art. 225-1 du Code pénal). Les personnes non acceptées restent en liste d'attente. Un refus exige un motif documenté."),
    d.applications.length ? h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, status === 'waitlist' ? h('th', null, 'Rang') : null, h('th', null, 'Candidat'), h('th', null, 'Photos'), h('th', null, 'Identité'),
        h('th', null, 'Parrainages'), h('th', null, 'Charte'), h('th', null, 'Reçue'), h('th', null, ''))),
      h('tbody', null, rows))) : h('p', { class: 'empty' }, 'Rien ici.'));
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
        h('td', null, m.premium ? badge(['ILD+', 'info']) : '—'),
        h('td', null, m.reports ? badge([String(m.reports), 'warn']) : '0'),
        h('td', { class: 'small' }, fmtDate(m.accepted_at || m.created_at, false))))))) : h('p', { class: 'empty' }, 'Aucun membre trouvé.'));
}

async function pageMember(id) {
  const d = await api('GET', `/api/admin/members/${id}`);
  const u = d.user;
  const note = h('input', { class: 'input grow', placeholder: 'Note interne (motif factuel)', maxlength: 500, 'aria-label': 'Note' });
  const setStatus = (status, label) => act(() => api('POST', `/api/admin/members/${id}/status`, { status, note: note.value }), label, () => pageMember(id));
  layout('members',
    h('div', { class: 'row' }, h('a', { href: '#/members' }, '← Membres')),
    h('div', { class: 'row between' }, h('h1', null, `${u.first_name}, ${u.age}`), badge(STATUS_BADGE[u.status])),
    h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '18px' } },
      h('div', { class: 'card grow', style: { minWidth: '280px' } },
        h('h2', null, 'Profil'),
        u.photos.length ? h('div', { class: 'thumbs' }, u.photos.map((p) => h('img', { src: `/photos/${p.id}`, alt: '', title: p.status }))) : null,
        h('dl', null,
          h('dt', null, 'E-mail'), h('dd', null, u.email),
          h('dt', null, 'Ville'), h('dd', null, `${u.city}${u.neighborhood ? ` · ${u.neighborhood}` : ''}`),
          h('dt', null, 'Métier'), h('dd', null, d.profile.job || '—'),
          h('dt', null, 'Identité'), h('dd', null, badge(ID_BADGE[u.id_check_status])),
          h('dt', null, 'Parrainé par'), h('dd', null, u.vouchers.map((v) => v.first_name).join(', ') || '—'),
          h('dt', null, 'Consentement orientation'), h('dd', null, fmtDate(u.consent_orientation_at)),
          h('dt', null, 'Charte acceptée'), h('dd', null, fmtDate(u.charter_at)),
          h('dt', null, 'Membre depuis'), h('dd', null, u.accepted_at ? fmtDate(u.accepted_at, false) : '—'),
          h('dt', null, 'Activité'), h('dd', null, `${d.stats.matches} matchs · ${d.stats.messages} messages · ${d.stats.album_photos} photos d'album`)),
        d.profile.bio ? h('p', { style: { margin: '0', color: 'var(--text-2)' } }, d.profile.bio) : null),
      h('div', { class: 'card grow', style: { minWidth: '280px' } },
        h('h2', null, 'Actions'),
        h('div', { class: 'row' }, note),
        h('div', { class: 'row' },
          u.status !== 'member' ? h('button', { class: 'btn ok', onclick: () => setStatus('member', 'Compte réactivé.') }, 'Réactiver') : null,
          u.status !== 'suspended' ? h('button', { class: 'btn', onclick: () => setStatus('suspended', 'Compte suspendu.') }, 'Suspendre') : null,
          u.status !== 'banned' ? h('button', { class: 'btn danger', onclick: () => setStatus('banned', 'Compte banni.') }, 'Bannir') : null,
          h('button', { class: 'btn', onclick: () => act(() => api('POST', `/api/admin/members/${id}/premium`, { active: !u.premium }), u.premium ? 'ILD+ retiré.' : 'ILD+ offert.', () => pageMember(id)) }, u.premium ? 'Retirer ILD+' : 'Offrir ILD+')),
        h('h2', null, `Signalements reçus (${d.reports_against.length})`),
        d.reports_against.length ? d.reports_against.map((r) => h('div', { class: 'row between' }, h('span', null, REASON_LABEL[r.reason] || r.reason), badge(r.status === 'open' ? ['Ouvert', 'warn'] : [r.status === 'actioned' ? 'Sanctionné' : 'Classé', '']), h('span', { class: 'small' }, fmtDate(r.created_at))))
          : h('span', { class: 'small' }, 'Aucun.'),
        h('span', { class: 'small' }, `Signalements faits par ce membre : ${d.reports_made}`),
        h('h2', null, 'Historique admin'),
        d.history.length ? d.history.map((x) => h('div', { class: 'small' }, `${fmtDate(x.created_at)} · ${x.action}`)) : h('span', { class: 'small' }, 'Aucune action.'))));
}

async function pagePhotos() {
  const d = await api('GET', '/api/admin/photos');
  const review = (p, decision) => act(() => api('POST', `/api/admin/photos/${p.id}/review`, { decision }), decision === 'approve' ? 'Photo validée.' : 'Photo refusée.', pagePhotos);
  layout('photos',
    h('h1', null, 'Photos de profil à valider'),
    h('div', { class: 'note' }, "Règle : visage ou silhouette, pas de nudité, pas de mineur, pas d'autre personne identifiable sans accord. Les photos d'album privé ne sont pas relues ici : elles passent par la détection automatique de contenus illégaux et par les signalements."),
    d.photos.length ? h('div', { class: 'photos' }, d.photos.map((p) => h('div', { class: 'photo' },
      h('img', { src: `/photos/${p.id}`, alt: `Photo de ${p.first_name}` }),
      h('div', { class: 'row' }, h('a', { href: `#/member/${p.user_id}` }, p.first_name), h('span', { class: 'small' }, ago(p.created_at))),
      h('div', { class: 'row', style: { paddingTop: '0' } },
        h('button', { class: 'btn ok grow', onclick: () => review(p, 'approve') }, 'Valider'),
        h('button', { class: 'btn danger grow', onclick: () => review(p, 'reject') }, 'Refuser')))))
      : h('p', { class: 'empty' }, 'Aucune photo en attente.'));
}

function evidenceView(r) {
  const e = r.evidence || {};
  if (e.conversation) {
    return h('div', { class: 'evidence' }, e.conversation.map((m) => h('div', { class: `msg${m.id === e.reported_message_id ? ' flag' : ''}` },
      h('b', null, `${m.sender} `), h('span', { class: 'small' }, `${fmtDate(m.created_at)} `), m.body)));
  }
  if (e.post) return h('div', { class: 'evidence' }, e.post.body);
  if (e.photo_id) return h('div', { class: 'thumbs' }, h('img', { src: `/photos/${e.photo_id}`, alt: 'Photo signalée', style: { width: '120px', height: '160px' } }));
  if (e.profile) return h('div', { class: 'evidence' }, `Profil : ${e.profile.first_name || ''}${e.profile.job ? ` · ${e.profile.job}` : ''}${e.profile.bio ? ` · « ${e.profile.bio} »` : ''}`);
  return null;
}

async function pageReports(params) {
  const status = params.get('status') || 'open';
  const d = await api('GET', `/api/admin/reports?status=${status}`);
  const card = (r) => {
    const note = h('input', { class: 'input grow', placeholder: 'Note (décision, éléments)', maxlength: 1000, 'aria-label': 'Note' });
    const resolve = (action, label) => act(() => api('POST', `/api/admin/reports/${r.id}/resolve`, { action, note: note.value }), label, () => pageReports(params));
    const resolution = r.resolution ? JSON.parse(r.resolution) : null;
    return h('div', { class: 'card' },
      h('div', { class: 'row between' },
        h('div', { class: 'row' }, badge(URGENT.includes(r.reason) ? [REASON_LABEL[r.reason], 'bad'] : [REASON_LABEL[r.reason] || r.reason, 'warn']), h('span', { class: 'muted' }, `${r.target_type === 'message' ? 'Conversation' : r.target_type === 'photo' ? 'Photo' : r.target_type === 'post' ? 'Publication' : 'Profil'}`)),
        h('span', { class: 'small' }, fmtDate(r.created_at))),
      h('div', { class: 'row' },
        h('span', null, 'Visé : ', r.target_user_id ? h('a', { href: `#/member/${r.target_user_id}` }, r.target_name || `#${r.target_user_id}`) : '—', r.target_status && r.target_status !== 'member' ? ' ' : '', r.target_status && r.target_status !== 'member' ? badge(STATUS_BADGE[r.target_status]) : null),
        h('span', { class: 'muted' }, `· Signalé par ${r.reporter_name || 'un compte supprimé'}`)),
      r.details ? h('p', { style: { margin: '0' } }, `« ${r.details} »`) : null,
      evidenceView(r),
      URGENT.includes(r.reason) && status === 'open' ? h('div', { class: 'note', style: { borderColor: '#5c1f1c', background: '#2a1312', color: '#ffd6d3' } },
        'Priorité absolue. Contenu pédocriminel : retirer, bannir, conserver les preuves et signaler sur internet-signalement.gouv.fr (PHAROS).') : null,
      status === 'open' ? [h('div', { class: 'row' }, note),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => resolve('dismiss', 'Signalement classé.') }, 'Classer sans suite'),
          r.target_type !== 'user' ? h('button', { class: 'btn', onclick: () => resolve('remove_content', 'Contenu retiré.') }, 'Retirer le contenu') : null,
          h('button', { class: 'btn', onclick: () => resolve('suspend', 'Membre suspendu.') }, 'Suspendre'),
          h('button', { class: 'btn danger', onclick: () => resolve('ban', 'Membre banni.') }, 'Bannir'))]
        : h('span', { class: 'small' }, `Décision : ${resolution?.action || r.status}${resolution?.note ? ` · ${resolution.note}` : ''} · ${fmtDate(r.resolved_at)}`));
  };
  layout('reports',
    h('h1', null, 'Signalements'),
    h('div', { class: 'tabs' }, [['open', 'Ouverts'], ['actioned', 'Sanctionnés'], ['dismissed', 'Classés']].map(([k, v]) =>
      h('a', { href: `#/reports?status=${k}`, class: status === k ? 'on' : '' }, v))),
    h('p', { class: 'small' }, "DSA : chaque décision est motivée et horodatée dans le journal. Les preuves sont une copie faite au moment du signalement."),
    d.reports.length ? d.reports.map(card) : h('p', { class: 'empty' }, 'Aucun signalement.'));
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

async function pageAudit() {
  const d = await api('GET', '/api/admin/audit');
  layout('audit',
    h('h1', null, 'Journal des actions'),
    h('p', { class: 'small' }, "Toutes les décisions d'administration, pour la traçabilité (RGPD, DSA)."),
    h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Admin'), h('th', null, 'Action'), h('th', null, 'Cible'), h('th', null, 'Détails'))),
      h('tbody', null, d.entries.map((x) => h('tr', null,
        h('td', { class: 'small' }, fmtDate(x.created_at)), h('td', null, x.admin_name || '—'), h('td', null, x.action),
        h('td', null, x.target && x.target.startsWith('user:') ? h('a', { href: `#/member/${x.target.slice(5)}` }, x.target) : (x.target || '—')),
        h('td', { class: 'small' }, x.details || '')))))));
}

async function pageSettings() {
  const d = await api('GET', '/api/admin/settings');
  const inputs = Object.fromEntries(Object.keys(d.settings).map((k) => [k, h('input', { class: 'input', type: 'number', min: 0, max: 120, value: d.settings[k], style: { width: '90px' }, 'aria-label': SETTING_LABEL[k] || k })]));
  layout('settings',
    h('h1', null, 'Réglages et RGPD'),
    h('form', { class: 'card', onsubmit: (e) => {
      e.preventDefault();
      act(() => api('PUT', '/api/admin/settings', Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, Number(el.value)]))), 'Réglages enregistrés.');
    } }, h('h2', null, 'Règles'),
    Object.entries(inputs).map(([k, el]) => h('label', { class: 'row between' }, h('span', null, SETTING_LABEL[k] || k), el)),
    h('div', null, h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer'))),
    h('div', { class: 'card' },
      h('h2', null, 'Purge des données expirées'),
      h('p', { class: 'muted', style: { margin: '0' } }, "Supprime les candidatures refusées ou jamais acceptées au-delà de la durée de conservation, les photos refusées de plus de 30 jours, les sessions et accès d'album expirés, et les signalements traités trop anciens. À lancer régulièrement (idéalement une tâche planifiée)."),
      h('div', null, h('button', { class: 'btn', onclick: () => act(async () => {
        const r = await api('POST', '/api/admin/maintenance/purge');
        toastMsg(`Purge faite : ${r.applicants_deleted} candidature(s), ${r.rejected_photos_deleted} photo(s), ${r.sessions_deleted} session(s), ${r.album_grants_deleted} accès, ${r.reports_deleted} signalement(s).`);
      }) }, 'Lancer la purge'))),
    h('div', { class: 'card' },
      h('h2', null, 'À brancher avant le lancement'),
      h('ul', { style: { margin: '0', paddingLeft: '18px', lineHeight: '1.8', color: 'var(--text-2)' } },
        h('li', null, "Vérification d'identité : prestataire certifié (pièce + selfie), webhook vers « Identité OK »."),
        h('li', null, 'Détection de contenus pédocriminels connus (hash matching) sur chaque photo : fonction scanImage du serveur.'),
        h('li', null, 'Paiement ILD+ : App Store / Google Play ou prestataire web.'),
        h('li', null, 'Notifications push et e-mails transactionnels.'),
        h('li', null, "Hébergement dans l'UE, sauvegardes chiffrées, HTTPS (cookie Secure : ILD_SECURE_COOKIES=1)."))));
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
    if (page === 'logout') {
      await api('POST', '/api/auth/logout', {});
      me = null; location.hash = '#/dashboard'; return pageLogin();
    }
    await loadStats();
    switch (page) {
      case 'applications': return await pageApplications(params);
      case 'members': return await pageMembers(params);
      case 'member': return await pageMember(arg);
      case 'photos': return await pagePhotos();
      case 'reports': return await pageReports(params);
      case 'events': return await pageEvents();
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

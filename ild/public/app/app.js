// App membre ILD : une seule page, navigation par #ancre.
import { api, h, icon, toast, fmtDate, ago, fileToJpeg } from '/shared/lib.js';

const root = document.getElementById('app');
const state = { me: null, meta: null, mode: 'dating', deck: [], deckIndex: 0, photoIndex: 0 };
let timers = [];

const MODE_LABEL = { dating: 'Rencontre', friends: 'Amis', network: 'Pro' };
const REASON_LABEL = {
  harassment: 'Harcèlement', fake: 'Faux profil', minor: 'Personne mineure', non_consensual: 'Contenu partagé sans accord',
  hate: 'Propos haineux', spam: 'Spam ou arnaque', illegal: 'Contenu illégal', other: 'Autre'
};
const REFUSAL_LABEL = {
  fake_profile: "l'identité n'a pas pu être confirmée", safety: 'un risque pour la sécurité des membres',
  charter: 'un non-respect de la charte', minor: "l'âge minimum n'est pas atteint"
};

// ---------- utilitaires d'affichage ----------
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function clearTimers() { timers.forEach(clearInterval); timers = []; }
const clean = (list) => list.flat(Infinity).filter((n) => n != null && n !== false);
function mount(...nodes) { root.replaceChildren(...clean(nodes)); window.scrollTo(0, 0); }
async function run(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message, true); throw e; }
}
async function refreshMe() {
  try { state.me = await api('GET', '/api/me'); } catch (e) { if (e.status === 401 || e.status === 403) state.me = null; else throw e; }
  return state.me;
}

function backBtn(hash, label = 'Retour') {
  return h('a', { class: 'icon-btn', href: hash, 'aria-label': label }, icon('back'));
}

function photoEl(id, initial, cls = '') {
  return h('div', { class: `thumb ${cls}` },
    id ? h('img', { src: `/photos/${id}`, alt: '', loading: 'lazy', oncontextmenu: (e) => e.preventDefault() })
      : h('div', { class: 'initial', style: { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px', fontWeight: '600', color: 'rgba(255,255,255,.12)' } }, (initial || '?')[0]));
}

function avatar(id, name) {
  return h('span', { class: 'avatar' }, id ? h('img', { src: `/photos/${id}`, alt: '' }) : (name || '?')[0]);
}

function nav(active) {
  const items = [
    ['discover', '#/discover', 'card', 'Découvrir'],
    ['map', '#/map', 'map', 'Carte'],
    ['tonight', '#/tonight', 'moon', 'Ce soir'],
    ['messages', '#/messages', 'chat', 'Messages'],
    ['me', '#/me', 'user', 'Moi']
  ];
  const hasRequests = state.me && ((state.me.vouch_requests || []).length || (state.me.album_requests || []).length);
  return h('nav', { class: 'nav', 'aria-label': 'Navigation' }, items.map(([k, href, ic, label]) =>
    h('a', { href, class: active === k ? 'on' : '', 'aria-current': active === k ? 'page' : null },
      icon(ic, 22), label, k === 'me' && hasRequests ? h('span', { class: 'dot', 'aria-label': 'Nouveau' }) : null)));
}

function sheet(...content) {
  const close = () => backdrop.remove();
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'grab' }), ...content(close)));
  document.body.appendChild(backdrop);
  return close;
}

function reportSheet(targetType, targetId, label) {
  sheet((close) => {
    const reason = h('select', { class: 'input', 'aria-label': 'Motif' },
      Object.entries(REASON_LABEL).map(([k, v]) => h('option', { value: k }, v)));
    const details = h('textarea', { class: 'input', placeholder: 'Ce qui s\'est passé (facultatif)', maxlength: 1000, 'aria-label': 'Détails' });
    return [
      h('h2', null, `Signaler ${label}`),
      h('p', { class: 'small' }, 'Une copie sécurisée est transmise à l\'équipe de modération. La personne n\'est pas prévenue.'),
      reason, details,
      h('button', { class: 'btn primary block', onclick: async () => {
        await run(() => api('POST', '/api/reports', { target_type: targetType, target_id: targetId, reason: reason.value, details: details.value }), 'Signalement envoyé. Merci.');
        close();
      } }, 'Envoyer le signalement'),
      h('button', { class: 'btn ghost', onclick: close }, 'Annuler')
    ];
  });
}

// ---------- écrans d'accès ----------
function screenWelcome() {
  mount(h('main', { class: 'screen' },
    h('div', { class: 'media', style: { height: '42vh', minHeight: '260px' } },
      h('div', { class: 'grid2', style: { position: 'absolute', inset: '8px', gridTemplateRows: '1fr 1fr' } },
        ['#2c2c2e', '#242426', '#262628', '#2e2e30'].map((c) => h('div', { style: { borderRadius: '20px', background: c } })))),
    h('div', { class: 'stack', style: { padding: '0 4px', flex: '1' } },
      h('span', { class: 'muted', style: { fontWeight: '600', letterSpacing: '0.2em' } }, 'ILD'),
      h('h1', { class: 'big' }, 'Paris.', h('br'), 'Sur invitation.'),
      h('p', { class: 'lead' }, 'Un club privé pour hommes gays et queer. Rencontrer, sortir, se connecter, en toute discrétion.')),
    h('a', { class: 'btn primary block', href: '#/apply' }, 'Demander à rejoindre'),
    h('a', { class: 'btn block', href: '#/login' }, 'Se connecter'),
    h('p', { class: 'small center' }, '18 ans et plus · Identité vérifiée · Profils protégés')));
}

function screenLogin() {
  const email = h('input', { type: 'email', autocomplete: 'email', required: true });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    const r = await run(() => api('POST', '/api/auth/login', { email: email.value, password: pass.value }));
    await refreshMe();
    go(r.role === 'admin' ? '#/admin-hint' : '#/');
  } },
  h('div', { class: 'list' },
    h('label', { class: 'field' }, h('span', null, 'E-mail'), email),
    h('label', { class: 'field' }, h('span', null, 'Mot de passe'), pass)),
  h('button', { class: 'btn primary block', type: 'submit' }, 'Se connecter'));
  mount(h('main', { class: 'screen' }, h('div', { class: 'row' }, backBtn('#/')), h('h1', null, 'Connexion'), form));
}

function screenApply() {
  const f = {
    first_name: h('input', { autocomplete: 'given-name', maxlength: 40, required: true }),
    birth_year: h('input', { type: 'number', inputmode: 'numeric', min: 1920, max: new Date().getFullYear() - 18, required: true }),
    city: h('input', { value: 'Paris', maxlength: 60 }),
    invite_code: h('input', { placeholder: 'Facultatif', maxlength: 20, autocapitalize: 'characters' }),
    email: h('input', { type: 'email', autocomplete: 'email', required: true }),
    password: h('input', { type: 'password', autocomplete: 'new-password', minlength: 10, required: true })
  };
  const c = { age: h('input', { type: 'checkbox' }), orientation: h('input', { type: 'checkbox' }), charter: h('input', { type: 'checkbox' }) };
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    await run(() => api('POST', '/api/auth/register', {
      first_name: f.first_name.value, birth_year: Number(f.birth_year.value), city: f.city.value, invite_code: f.invite_code.value,
      email: f.email.value, password: f.password.value,
      consent_age: c.age.checked, consent_orientation: c.orientation.checked, charter: c.charter.checked
    }));
    await refreshMe();
    go('#/verify');
  } },
  h('div', { class: 'list' },
    h('label', { class: 'field' }, h('span', null, 'Prénom'), f.first_name),
    h('label', { class: 'field' }, h('span', null, 'Né en'), f.birth_year),
    h('label', { class: 'field' }, h('span', null, 'Ville'), f.city),
    h('label', { class: 'field' }, h('span', null, 'Code'), f.invite_code)),
  h('div', { class: 'list' },
    h('label', { class: 'field' }, h('span', null, 'E-mail'), f.email),
    h('label', { class: 'field' }, h('span', null, 'Mot de passe'), f.password)),
  h('p', { class: 'small', style: { padding: '0 4px' } }, 'Mot de passe : 10 caractères minimum. Le code est celui d\'un membre qui peut te parrainer.'),
  h('div', { class: 'card pad stack', style: { gap: '14px' } },
    h('label', { class: 'check' }, c.age, h('span', null, "J'ai 18 ans ou plus et j'accepte de vérifier mon identité (pièce d'identité + selfie).")),
    h('label', { class: 'check' }, c.orientation, h('span', null, "J'accepte explicitement qu'ILD traite des données pouvant révéler mon orientation sexuelle, nécessaires au service.")),
    h('label', { class: 'check' }, c.charter, h('span', null, "J'accepte la charte : respect, consentement, rien ne sort d'ILD (pas de captures, pas de partage)."))),
  h('button', { class: 'btn primary block', type: 'submit' }, 'Continuer vers la vérification'));
  mount(h('main', { class: 'screen' }, h('div', { class: 'row between' }, backBtn('#/'), h('span', { class: 'small' }, 'Étape 1 sur 3')),
    h('h1', null, 'Ta candidature'), form));
}

function screenVerify() {
  const me = state.me;
  const submitted = me.id_check_status === 'submitted';
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row between' }, h('span'), h('span', { class: 'small' }, 'Étape 2 sur 3')),
    h('h1', null, 'Vérifie ton identité'),
    h('p', { class: 'lead' }, 'Chaque membre est une vraie personne majeure. Ça prend 2 minutes.'),
    h('div', { class: 'media', style: { height: '230px', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      h('div', { style: { width: '140px', height: '180px', borderRadius: '70px', border: '3px solid var(--link)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#48484a' } }, icon('user', 64))),
    h('div', { class: 'list steps' },
      h('div', null, h('span', { class: `step-dot ${submitted ? 'done' : 'now'}` }, submitted ? icon('check', 13) : '1'), h('span', { class: 'grow' }, "Pièce d'identité + selfie"),
        h('span', { class: 'small' }, submitted ? 'Envoyés' : 'À faire')),
      h('div', null, h('span', { class: `step-dot ${submitted ? 'now' : 'todo'}` }, '2'), h('span', { class: 'grow' }, 'Contrôle'), h('span', { class: 'small' }, submitted ? 'En cours' : ''))),
    h('div', { class: 'row', style: { alignItems: 'flex-start', padding: '0 4px' } }, icon('shield', 18, '#86868b'),
      h('p', { class: 'small' }, "Contrôle fait par un prestataire certifié. Ta pièce n'est jamais montrée aux membres ni conservée par ILD : seul le résultat (vérifié, majeur) est gardé.")),
    h('div', { class: 'grow' }),
    submitted
      ? h('div', { class: 'notice' }, icon('clock', 18, '#2997ff'), "C'est envoyé. Tu passeras sur la liste d'attente dès que ton identité est confirmée.")
      : h('button', { class: 'btn primary block', onclick: async () => {
        await run(() => api('POST', '/api/me/id-check', {}), 'Vérification envoyée.');
        await refreshMe(); render();
      } }, 'Lancer la vérification'),
    h('button', { class: 'btn ghost', onclick: logout }, 'Se déconnecter')));
}

function screenWaitlist() {
  const me = state.me;
  const steps = [
    ['Candidature reçue', 'done'],
    ['Identité vérifiée', 'done'],
    [`Parrainages`, me.vouches >= me.vouches_required ? 'done' : 'now', `${Math.min(me.vouches, me.vouches_required)} sur ${me.vouches_required}`],
    ['Examen par le comité', me.vouches >= me.vouches_required ? 'now' : 'todo']
  ];
  const shareCode = async () => {
    const text = `Parraine-moi sur ILD avec mon code : ${me.referral_code}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(me.referral_code); toast('Code copié.'); }
    } catch { /* partage annulé */ }
  };
  mount(h('main', { class: 'screen' },
    h('div', { class: 'stack', style: { gap: '4px', padding: '12px 4px 0' } },
      h('span', { class: 'muted' }, `Tu es sur la liste de ${me.city}`),
      h('span', { class: 'huge' }, `#${me.waitlist_position}`),
      h('p', { class: 'lead' }, `${me.city} ouvre par vagues. Chaque parrainage d'un membre te fait avancer.`)),
    h('div', { class: 'list steps' }, steps.map(([label, st, extra]) =>
      h('div', null, h('span', { class: `step-dot ${st}` }, st === 'done' ? icon('check', 13) : ''), h('span', { class: 'grow' }, label), extra ? h('span', { class: 'small' }, extra) : null))),
    h('div', { class: 'card pad stack' },
      h('h2', null, 'Tu connais un membre ?'),
      h('p', { class: 'small', style: { color: 'var(--text-2)' } }, "Envoie-lui ton code. Quand il te parraine, tu avances dans la liste."),
      h('div', { class: 'row' }, h('span', { class: 'code-box' }, me.referral_code), h('button', { class: 'btn primary small', onclick: shareCode }, 'Partager'))),
    h('div', { class: 'grow' }),
    h('p', { class: 'small' }, 'Les candidatures sont examinées selon des critères publiés : identité vérifiée, parrainages et respect de la charte. Tu peux télécharger ou supprimer tes données à tout moment.'),
    h('div', { class: 'row' },
      h('a', { class: 'btn small grow', href: '/api/me/export', download: 'ild-mes-donnees.json' }, 'Mes données'),
      h('button', { class: 'btn small grow', onclick: logout }, 'Se déconnecter'))));
}

function screenClosed() {
  const me = state.me;
  const reason = REFUSAL_LABEL[me.refusal_reason] || '';
  mount(h('main', { class: 'screen' },
    h('h1', null, 'Candidature non retenue'),
    h('p', { class: 'lead' }, reason ? `Motif : ${reason}.` : "Ta candidature n'a pas été retenue."),
    h('p', { class: 'small' }, 'Tes données seront supprimées automatiquement à la fin de la durée de conservation. Tu peux les supprimer dès maintenant.'),
    h('button', { class: 'btn danger', onclick: deleteAccount }, 'Supprimer mes données'),
    h('button', { class: 'btn ghost', onclick: logout }, 'Se déconnecter')));
}

// ---------- découvrir ----------
async function screenDiscover() {
  const data = await api('GET', `/api/discover?mode=${state.mode}`);
  state.deck = data.profiles; state.deckIndex = 0; state.photoIndex = 0;
  drawDiscover();
}

function drawDiscover() {
  const p = state.deck[state.deckIndex];
  const seg = h('div', { class: 'segmented', role: 'tablist' }, Object.entries(MODE_LABEL).map(([k, v]) =>
    h('button', { class: state.mode === k ? 'on' : '', role: 'tab', 'aria-selected': String(state.mode === k), onclick: () => { state.mode = k; screenDiscover(); } }, v)));
  let card;
  if (!p) {
    card = h('div', { class: 'media deck empty', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' } },
      h('h2', null, 'Personne de nouveau pour le moment'), h('p', { class: 'small' }, 'Reviens plus tard ou change de mode.'));
  } else {
    const photos = p.photos.length ? p.photos : [null];
    const idx = Math.min(state.photoIndex, photos.length - 1);
    card = h('div', { class: 'media deck' },
      photos[idx] ? h('img', { src: `/photos/${photos[idx]}`, alt: `Photo de ${p.first_name}`, oncontextmenu: (e) => e.preventDefault() }) : h('div', { class: 'initial' }, p.first_name[0]),
      h('div', { class: 'bars' }, photos.map((_, i) => h('span', { class: i === idx ? 'on' : '' }))),
      photos.length > 1 ? h('button', { class: 'tap-zone left', 'aria-label': 'Photo précédente', onclick: () => { state.photoIndex = Math.max(0, idx - 1); drawDiscover(); } }) : null,
      photos.length > 1 ? h('button', { class: 'tap-zone right', 'aria-label': 'Photo suivante', onclick: () => { state.photoIndex = Math.min(photos.length - 1, idx + 1); drawDiscover(); } }) : null,
      h('a', { class: 'overlay', href: `#/u/${p.id}`, style: { color: 'var(--text)' } },
        p.music_title ? h('span', { class: 'pill', style: { alignSelf: 'flex-start' } }, icon('music', 12), p.music_title) : null,
        h('span', { class: 'big' }, `${p.first_name}, ${p.age}`),
        h('span', { style: { color: 'var(--text-2)', fontSize: '15px' } }, [p.job, p.neighborhood].filter(Boolean).join(' · ')),
        h('span', { class: 'row', style: { gap: '14px', fontSize: '13px' } },
          p.vouched_by.length ? h('span', { class: 'tag-blue' }, `Parrainé par ${p.vouched_by[0]}${p.vouched_by.length > 1 ? ` +${p.vouched_by.length - 1}` : ''}`) : null,
          p.travel ? h('span', { class: 'tag-yellow' }, `De passage ${fmtDate(Date.parse(p.travel.from), false)} – ${fmtDate(Date.parse(p.travel.to), false)}`) : null)));
  }
  const decide = async (value) => {
    const r = await run(() => api('POST', '/api/likes', { to_id: p.id, value }));
    if (r.match) {
      sheet((close) => [h('h2', null, `C'est un match avec ${p.first_name}`), h('p', { class: 'small' }, 'Vous vous plaisez mutuellement.'),
        h('a', { class: 'btn primary block', href: `#/chat/${r.match}`, onclick: close }, 'Envoyer un message'),
        h('button', { class: 'btn ghost', onclick: close }, 'Continuer')]);
    }
    state.deckIndex += 1; state.photoIndex = 0; drawDiscover();
  };
  mount(h('main', { class: 'screen with-nav' },
    h('div', { class: 'row between', style: { padding: '0 4px' } }, h('h1', { style: { fontSize: '28px' } }, 'Découvrir'),
      h('a', { class: 'btn small', href: '#/likes' }, icon('heart', 16), 'Qui m\'a liké')),
    seg, card,
    p ? h('div', { class: 'row', style: { justifyContent: 'center', gap: '16px' } },
      h('button', { class: 'icon-btn big', 'aria-label': 'Passer', onclick: () => decide(-1) }, icon('close', 22)),
      h('button', { class: 'btn primary', style: { minHeight: '58px', padding: '0 36px' }, onclick: () => decide(1) }, "J'aime")) : null),
  nav('discover'));
}

async function screenLikes() {
  const data = await api('GET', '/api/likes/received');
  const body = data.premium_required
    ? h('div', { class: 'card pad stack center' }, h('span', { class: 'big' }, String(data.count)),
      h('p', { class: 'lead' }, data.count === 1 ? 'personne t\'a liké.' : 'personnes t\'ont liké.'),
      h('a', { class: 'btn primary block', href: '#/premium' }, 'Voir qui avec ILD+'))
    : data.profiles.length
      ? h('div', { class: 'grid2' }, data.profiles.map((p) => h('a', { href: `#/u/${p.id}`, class: 'stack', style: { color: 'var(--text)', gap: '6px' } },
        photoEl(p.photos[0], p.first_name), h('span', { style: { fontWeight: '500' } }, `${p.first_name}, ${p.age}`))))
      : h('p', { class: 'empty' }, 'Personne pour le moment.');
  mount(h('main', { class: 'screen with-nav' }, h('div', { class: 'row' }, backBtn('#/discover'), h('h1', { style: { fontSize: '24px' } }, "Qui m'a liké")), body), nav('discover'));
}

// ---------- profil ----------
async function screenProfile(id) {
  const p = await api('GET', `/api/users/${id}`);
  const photos = p.photos.length ? p.photos : [null];
  let idx = 0;
  const imgBox = h('div', { class: 'media', style: { height: '56vh', minHeight: '380px' } });
  const drawPhoto = () => {
    imgBox.replaceChildren(...clean([
      photos[idx] ? h('img', { src: `/photos/${photos[idx]}`, alt: `Photo de ${p.first_name}`, oncontextmenu: (e) => e.preventDefault() }) : h('div', { class: 'initial' }, p.first_name[0]),
      h('div', { class: 'bars' }, photos.map((_, i) => h('span', { class: i === idx ? 'on' : '' }))),
      photos.length > 1 ? h('button', { class: 'tap-zone left', 'aria-label': 'Photo précédente', onclick: () => { idx = Math.max(0, idx - 1); drawPhoto(); } }) : null,
      photos.length > 1 ? h('button', { class: 'tap-zone right', 'aria-label': 'Photo suivante', onclick: () => { idx = Math.min(photos.length - 1, idx + 1); drawPhoto(); } }) : null,
      h('div', { class: 'overlay' },
        p.music_title ? h('span', { class: 'pill', style: { alignSelf: 'flex-start' } }, icon('music', 12), p.music_title) : null,
        h('span', { class: 'big', style: { fontSize: '36px' } }, `${p.first_name}, ${p.age}`),
        h('span', { style: { color: 'var(--text-2)', fontSize: '15px' } }, [p.job, p.neighborhood].filter(Boolean).join(' · ')))]));
  };
  drawPhoto();
  const more = () => sheet((close) => [
    h('h2', null, p.first_name),
    h('button', { class: 'btn block', onclick: async () => { await run(() => api('POST', '/api/blocks', { user_id: p.id, kind: 'hide' }), `Ton profil est masqué à ${p.first_name}.`); close(); go('#/discover'); } }, 'Masquer mon profil à cette personne'),
    h('button', { class: 'btn block', onclick: async () => { await run(() => api('POST', '/api/blocks', { user_id: p.id, kind: 'block' }), `${p.first_name} est bloqué.`); close(); go('#/discover'); } }, 'Bloquer'),
    h('button', { class: 'btn danger block', onclick: () => { close(); reportSheet('user', p.id, 'ce profil'); } }, 'Signaler'),
    h('button', { class: 'btn ghost', onclick: close }, 'Annuler')]);
  let albumCard = null;
  if (p.album.enabled && p.album.count) {
    const action = p.album.access === 'granted'
      ? h('a', { class: 'tag-blue', href: `#/album/${p.id}` }, 'Ouvrir')
      : p.album.access === 'requested' ? h('span', { class: 'small' }, 'Demandé')
        : h('button', { class: 'btn ghost small', onclick: async () => { await run(() => api('POST', `/api/albums/${p.id}/request`, {}), 'Demande envoyée.'); screenProfile(id); } }, 'Demander');
    albumCard = h('div', { class: 'card bordered row', style: { padding: '14px' } },
      h('span', { class: 'avatar', style: { borderRadius: '14px', color: 'var(--link)' } }, icon('lock', 22)),
      h('div', { class: 'grow stack', style: { gap: '2px' } }, h('span', { style: { fontWeight: '600', fontSize: '15px' } }, `Album privé · ${p.album.count} photo${p.album.count > 1 ? 's' : ''}`),
        h('span', { class: 'small' }, p.album.access === 'granted' ? `Accès jusqu'au ${fmtDate(p.album.expires_at, false)}` : `Visible seulement si ${p.first_name} t'y donne accès`)),
      action);
  }
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row between' }, backBtn('#/discover'), h('button', { class: 'icon-btn', 'aria-label': 'Plus d\'options : masquer, bloquer, signaler', onclick: more }, icon('more'))),
    imgBox,
    p.vouched_by.length ? h('p', { class: 'small', style: { color: 'var(--text-2)', fontSize: '14px' } }, h('span', { class: 'tag-blue' }, 'Parrainé'), ` par ${p.vouched_by.join(', ')}`) : null,
    p.travel ? h('p', { class: 'small tag-yellow' }, `De passage à ${p.travel.city} du ${fmtDate(Date.parse(p.travel.from), false)} au ${fmtDate(Date.parse(p.travel.to), false)}`) : null,
    p.bio ? h('p', { class: 'lead' }, p.bio) : null,
    p.prompt_answer ? h('div', { class: 'card pad stack', style: { gap: '4px' } }, h('span', { class: 'small' }, 'Un dimanche parfait…'), h('span', null, p.prompt_answer)) : null,
    p.interests.length ? h('div', { class: 'row wrap' }, p.interests.map((t) => h('span', { class: 'chip' }, t))) : null,
    albumCard,
    h('div', { class: 'row' },
      p.matched ? h('button', { class: 'btn primary grow', onclick: async () => {
        const m = (await api('GET', '/api/matches')).matches.find((x) => x.user.id === p.id);
        if (m) go(`#/chat/${m.id}`);
      } }, 'Message') : h('button', { class: 'btn primary grow', onclick: async () => {
        const r = await run(() => api('POST', '/api/likes', { to_id: p.id, value: 1 }));
        toast(r.match ? `C'est un match avec ${p.first_name} !` : 'Like envoyé.');
        if (r.match) go(`#/chat/${r.match}`);
      } }, "J'aime"))));
}

async function screenAlbum(ownerId) {
  const a = await api('GET', `/api/albums/${ownerId}`);
  let blurOn = a.blur;
  const grid = h('div', { class: 'grid3' });
  const draw = () => grid.replaceChildren(...a.photos.map((id) => {
    const tile = h('button', { class: `album-tile${blurOn ? ' blur' : ''}`, 'aria-label': blurOn ? 'Photo floutée, toucher pour voir' : 'Photo' },
      h('img', { src: `/photos/${id}`, alt: '', oncontextmenu: (e) => e.preventDefault() }),
      blurOn ? h('span', { class: 'hint' }, icon('eyeoff', 20), 'Toucher pour voir') : null);
    tile.addEventListener('click', () => { tile.classList.toggle('blur'); tile.querySelector('.hint')?.remove(); });
    tile.addEventListener('contextmenu', (e) => { e.preventDefault(); reportSheet('photo', id, 'cette photo'); });
    return tile;
  }));
  draw();
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row' }, backBtn(`#/u/${ownerId}`), h('h1', { class: 'grow', style: { fontSize: '24px' } }, `Album de ${a.first_name}`), h('span', { class: 'chip' }, '18+')),
    h('div', { class: 'notice' }, icon('clock', 18, '#2997ff'), `Accès jusqu'au ${fmtDate(a.expires_at)}. ${a.first_name} peut le retirer à tout moment.`),
    grid,
    h('div', { class: 'list' },
      h('label', null, h('span', { class: 'grow' }, 'Flouter les photos explicites'), h('input', { type: 'checkbox', checked: blurOn, onchange: (e) => { blurOn = e.target.checked; draw(); } }))),
    h('p', { class: 'small' }, "Appui long sur une photo pour la signaler. Partager une photo d'album hors d'ILD entraîne un bannissement."),
    h('p', { class: 'small' }, "Sur le web, les captures d'écran ne peuvent pas être bloquées techniquement : elles le seront dans l'app mobile.")));
}

// ---------- carte ----------
async function screenMap() {
  const d = await api('GET', '/api/map');
  const positions = [[18, 30], [8, 62], [22, 82], [40, 14], [44, 50], [62, 72], [58, 28], [80, 12], [78, 46], [70, 88], [86, 70], [32, 66]];
  const max = Math.max(1, ...d.neighborhoods.map((n) => n.count));
  const map = h('div', { class: 'map', role: 'img', 'aria-label': `Membres par quartier à ${d.city}` },
    d.neighborhoods.map((n, i) => {
      if (!n.count) return null;
      const size = 54 + Math.round((n.count / max) * 46);
      const [top, left] = positions[i % positions.length];
      return h('div', { class: `zone${n.name === state.me.neighborhood ? ' mine' : ''}`, style: { width: `${size}px`, height: `${size}px`, top: `calc(${top}% - ${size / 2}px)`, left: `calc(${left}% - ${size / 2}px)` } },
        h('b', null, String(n.count)), n.name);
    }));
  mount(h('main', { class: 'screen with-nav' },
    h('div', { class: 'row between', style: { padding: '0 4px' } }, h('h1', { style: { fontSize: '28px' } }, 'Carte'), h('span', { class: 'pill' }, icon('shield', 13), 'Par quartier')),
    map,
    !state.me.neighborhood ? h('div', { class: 'notice' }, 'Choisis ton quartier dans Moi › Modifier mon profil pour apparaître sur la carte.') : null,
    h('h2', null, `${d.total} membre${d.total > 1 ? 's' : ''} autour de toi`),
    d.people.length ? h('div', { class: 'grid3' }, d.people.map((x) => h('a', { href: `#/u/${x.id}`, class: 'stack', style: { gap: '6px', color: 'var(--text)' } },
      photoEl(x.photo, x.first_name), h('span', { style: { fontSize: '13px', fontWeight: '500' } }, `${x.first_name}, ${x.age}`), h('span', { class: 'small', style: { fontSize: '11px' } }, x.neighborhood))))
      : h('p', { class: 'empty' }, 'Personne pour le moment.'),
    h('div', { class: 'list' }, h('label', null, h('span', { class: 'grow' }, 'Me masquer de la carte'),
      h('input', { type: 'checkbox', checked: state.me.hide_from_map, onchange: async (e) => { state.me = await run(() => api('PATCH', '/api/me', { hide_from_map: e.target.checked })); } }))),
    h('p', { class: 'small' }, 'Ta position exacte n\'est jamais utilisée : seul le quartier que tu choisis est affiché.')),
  nav('map'));
}

// ---------- ce soir ----------
async function screenTonight() {
  const d = await api('GET', '/api/feed');
  const compose = () => sheet((close) => {
    const text = h('textarea', { class: 'input', maxlength: 1000, placeholder: 'Tu sors où ce soir ?', 'aria-label': 'Texte' });
    const vis = h('select', { class: 'input', 'aria-label': 'Visible par' }, h('option', { value: 'members' }, 'Tous les membres'), h('option', { value: 'matches' }, 'Mes matchs uniquement'));
    return [h('h2', null, 'Publier'), text, vis,
      h('p', { class: 'small' }, "Pas de nudité dans « Ce soir ». Évite de montrer d'autres personnes sans leur accord."),
      h('button', { class: 'btn primary block', onclick: async () => { await run(() => api('POST', '/api/posts', { body: text.value, visibility: vis.value }), 'Publié.'); close(); screenTonight(); } }, 'Publier'),
      h('button', { class: 'btn ghost', onclick: close }, 'Annuler')];
  });
  const card = (p) => {
    const going = h('button', { class: p.i_go ? 'btn small' : 'btn light small', onclick: async () => { await run(() => api('POST', `/api/posts/${p.id}/rsvp`, {})); screenTonight(); } }, p.i_go ? 'Je n\'y vais plus' : "J'y vais");
    if (p.kind === 'event') {
      return h('article', { class: 'card bordered', style: { overflow: 'hidden', borderRadius: 'var(--radius-media)' } },
        h('div', { style: { height: '120px', background: '#2c2c2e', display: 'flex', alignItems: 'flex-end', padding: '14px' } },
          h('span', { class: 'chip', style: { background: '#000', fontWeight: '600' } }, `Événement · ${fmtDate(p.starts_at)}`)),
        h('div', { class: 'stack', style: { padding: '16px' } }, h('h2', null, p.title), h('p', { class: 'small', style: { color: 'var(--text-2)', fontSize: '14px' } }, p.body),
          h('div', { class: 'row between' }, h('span', { class: 'small' }, `${p.going} membre${p.going > 1 ? 's' : ''} y vont`), going)));
    }
    return h('article', { class: 'card bordered stack', style: { padding: '16px', borderRadius: 'var(--radius-media)' } },
      h('div', { class: 'row' }, avatar(null, p.author.first_name),
        h('a', { class: 'grow stack', style: { gap: '0', color: 'var(--text)' }, href: p.mine ? '#/me' : `#/u/${p.author.id}` }, h('span', { style: { fontWeight: '600' } }, p.mine ? 'Toi' : p.author.first_name), h('span', { class: 'small' }, ago(p.created_at))),
        h('span', { class: 'chip', style: { fontSize: '11px' } }, p.visibility === 'matches' ? 'Matchs uniquement' : 'Membres')),
      h('p', { style: { margin: '0', lineHeight: '1.47' } }, p.body),
      h('div', { class: 'row between' }, h('span', { class: 'small' }, `${p.going} y vont`),
        h('div', { class: 'row' }, going, p.mine
          ? h('button', { class: 'btn ghost small', onclick: async () => { await run(() => api('DELETE', `/api/posts/${p.id}`), 'Supprimé.'); screenTonight(); } }, 'Supprimer')
          : h('button', { class: 'icon-btn', 'aria-label': 'Signaler cette publication', onclick: () => reportSheet('post', p.id, 'cette publication') }, icon('flag', 16)))));
  };
  mount(h('main', { class: 'screen with-nav' },
    h('div', { class: 'row between', style: { padding: '0 4px', alignItems: 'flex-end' } },
      h('div', { class: 'stack', style: { gap: '0' } }, h('span', { class: 'small' }, new Date().toLocaleDateString('fr-FR', { weekday: 'long' }) + ` · ${state.me.city}`), h('h1', { style: { fontSize: '28px' } }, 'Ce soir')),
      h('button', { class: 'btn primary small', onclick: compose }, icon('plus', 15), 'Publier')),
    d.posts.length ? d.posts.map(card) : h('p', { class: 'empty' }, 'Rien pour ce soir. Lance quelque chose !')),
  nav('tonight'));
}

// ---------- messages ----------
async function screenMessages() {
  const d = await api('GET', '/api/matches');
  mount(h('main', { class: 'screen with-nav' },
    h('h1', { style: { fontSize: '28px', padding: '0 4px' } }, 'Messages'),
    d.matches.length ? h('div', { class: 'list' }, d.matches.map((m) => h('a', { href: `#/chat/${m.id}`, style: { color: 'var(--text)', minHeight: '72px' } },
      avatar(m.user.photo, m.user.first_name),
      h('div', { class: 'grow stack', style: { gap: '2px', minWidth: '0' } }, h('span', { style: { fontWeight: '600' } }, m.user.first_name),
        h('span', { class: 'small', style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, m.last ? `${m.last.mine ? 'Toi : ' : ''}${m.last.body}` : 'Nouveau match : dis bonjour')),
      h('span', { class: 'small' }, ago(m.last?.created_at || m.created_at)))))
      : h('p', { class: 'empty' }, 'Pas encore de match. Va dans Découvrir.')),
  nav('messages'));
}

async function screenChat(matchId) {
  const first = await api('GET', `/api/matches/${matchId}/messages`);
  const other = first.user;
  let lastId = 0;
  const box = h('div', { class: 'bubbles', 'aria-live': 'polite' });
  const addMessages = (list) => {
    for (const m of list) {
      lastId = Math.max(lastId, m.id);
      const b = h('div', { class: `bubble${m.mine ? ' mine' : ''}${m.removed ? ' removed' : ''}`, title: fmtDate(m.created_at) }, m.removed ? 'Message retiré par la modération' : m.body);
      if (!m.mine && !m.removed) b.addEventListener('contextmenu', (e) => { e.preventDefault(); reportSheet('message', m.id, 'ce message'); });
      box.appendChild(b);
    }
    if (list.length) box.scrollTop = box.scrollHeight;
  };
  addMessages(first.messages);
  const input = h('input', { placeholder: `Message à ${other.first_name}`, maxlength: 2000, 'aria-label': 'Message' });
  const send = async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    await run(() => api('POST', `/api/matches/${matchId}/messages`, { body }));
    addMessages((await api('GET', `/api/matches/${matchId}/messages?after=${lastId}`)).messages);
  };
  const reportLast = () => {
    const theirs = [...first.messages].reverse().find((m) => !m.mine);
    if (theirs) reportSheet('message', theirs.id, 'cette conversation');
    else reportSheet('user', other.id, 'ce profil');
  };
  const shareAlbum = async () => {
    await run(() => api('POST', '/api/me/album/grants', { user_id: other.id }), `Album ouvert à ${other.first_name} pour 7 jours.`);
  };
  mount(h('main', { class: 'screen', style: { height: '100vh', paddingBottom: '8px' } },
    h('div', { class: 'row', style: { borderBottom: '1px solid var(--raised)', paddingBottom: '12px' } },
      backBtn('#/messages'), avatar(other.photos[0], other.first_name),
      h('a', { class: 'grow stack', style: { gap: '0', color: 'var(--text)' }, href: `#/u/${other.id}` }, h('span', { style: { fontWeight: '600' } }, other.first_name),
        h('span', { class: 'small' }, other.vouched_by.length ? 'Parrainé' : other.neighborhood || '')),
      h('button', { class: 'btn small', onclick: reportLast }, 'Signaler')),
    box,
    h('p', { class: 'small center' }, 'Appui long sur un message pour le signaler. Un signalement garde une copie sécurisée de la conversation : pas besoin de captures.'),
    h('form', { class: 'composer', onsubmit: send },
      state.me.album_enabled ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Ouvrir mon album privé', onclick: shareAlbum }, icon('image')) : null,
      input, h('button', { class: 'icon-btn', style: { background: 'var(--blue)', color: '#fff' }, 'aria-label': 'Envoyer', type: 'submit' }, icon('send')))));
  input.focus();
  timers.push(setInterval(async () => {
    try { addMessages((await api('GET', `/api/matches/${matchId}/messages?after=${lastId}`)).messages); } catch { /* réseau */ }
  }, 4000));
}

// ---------- moi ----------
async function screenMe() {
  await refreshMe();
  const me = state.me;
  const toggle = (key, label) => h('label', null, h('span', { class: 'grow' }, label),
    h('input', { type: 'checkbox', checked: me[key], onchange: async (e) => { state.me = await run(() => api('PATCH', '/api/me', { [key]: e.target.checked })); } }));
  const blocks = (await api('GET', '/api/blocks')).blocks;
  mount(h('main', { class: 'screen with-nav' },
    h('div', { class: 'row', style: { padding: '0 4px', gap: '14px' } },
      h('span', { class: 'avatar', style: { width: '60px', height: '60px', borderRadius: '30px', fontSize: '22px' } }, me.photos.find((p) => p.status === 'approved') ? h('img', { src: `/photos/${me.photos.find((p) => p.status === 'approved').id}`, alt: '' }) : me.first_name[0]),
      h('div', { class: 'grow stack', style: { gap: '2px' } }, h('span', { style: { fontWeight: '600', fontSize: '22px' } }, `${me.first_name}, ${new Date().getFullYear() - me.birth_year}`),
        h('a', { href: '#/me/edit' }, 'Modifier mon profil'))),
    (me.vouch_requests || []).length ? h('div', { class: 'card pad stack' }, h('h2', null, 'Ils demandent ton parrainage'),
      me.vouch_requests.map((r) => h('div', { class: 'row' }, h('span', { class: 'grow' }, r.first_name),
        h('button', { class: 'btn primary small', onclick: async () => { await run(() => api('POST', '/api/vouch', { applicant_id: r.id }), `Tu parraines ${r.first_name}.`); screenMe(); } }, 'Parrainer'))),
      h('p', { class: 'small' }, 'Ne parraine que des personnes que tu connais vraiment.')) : null,
    h('a', { class: 'notice', href: '#/premium', style: { color: '#d6e8ff' } }, h('span', { style: { fontWeight: '600', fontSize: '17px', color: 'var(--text)' } }, 'ILD', h('span', { style: { color: 'var(--link)' } }, '+')),
      h('span', { class: 'grow' }, me.premium ? 'Actif : mode voyage et likes reçus' : "Qui t'a liké, mode voyage"), icon('chevron', 16, '#2997ff')),
    h('a', { class: 'card pad row', href: '#/me/album', style: { color: 'var(--text)' } }, icon('lock', 20, '#2997ff'), h('span', { class: 'grow' }, 'Mon album privé'),
      (me.album_requests || []).length ? h('span', { class: 'chip', style: { background: 'var(--blue)' } }, String(me.album_requests.length)) : null, icon('chevron', 16, '#86868b')),
    h('span', { class: 'section-label' }, 'Confidentialité'),
    h('div', { class: 'list' },
      toggle('hide_from_map', 'Me masquer de la carte'),
      toggle('album_matches_only', 'Album : demandes des matchs uniquement'),
      toggle('blur_explicit', 'Flouter les photos explicites reçues'),
      toggle('discreet_icon', 'Mode discret (icône et nom neutres)')),
    blocks.length ? h('div', { class: 'list' }, blocks.map((b) => h('div', null, h('span', { class: 'grow' }, `${b.first_name} · ${b.kind === 'hide' ? 'masqué' : 'bloqué'}`),
      h('button', { class: 'btn ghost small', onclick: async () => { await run(() => api('DELETE', `/api/blocks/${b.id}`)); screenMe(); } }, 'Annuler')))) : null,
    h('span', { class: 'section-label' }, 'Mon code de parrainage'),
    h('div', { class: 'row' }, h('span', { class: 'code-box' }, me.referral_code)),
    h('span', { class: 'section-label' }, 'Mes données'),
    h('div', { class: 'list' },
      h('a', { href: '/api/me/export', download: 'ild-mes-donnees.json', style: { color: 'var(--text)' } }, 'Télécharger mes données'),
      h('button', { class: 'item', onclick: logout }, 'Se déconnecter'),
      h('button', { class: 'item', style: { color: 'var(--danger)' }, onclick: deleteAccount }, 'Supprimer mon compte'))),
  nav('me'));
}

async function screenEditProfile() {
  await refreshMe();
  const me = state.me;
  const photosGrid = h('div', { class: 'grid3' });
  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', onchange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = await fileToJpeg(file);
    await run(() => api('POST', '/api/me/photos', { kind: 'profile', data }), 'Photo envoyée : visible après validation.');
    screenEditProfile();
  } });
  const STATUS = { pending: 'En validation', approved: 'Visible', rejected: 'Refusée' };
  photosGrid.append(...me.photos.map((p) => h('div', { class: 'photo-edit' }, photoEl(p.id, me.first_name), h('span', { class: 'status' }, STATUS[p.status]),
    h('button', { class: 'remove', 'aria-label': 'Supprimer la photo', onclick: async () => { await run(() => api('DELETE', `/api/me/photos/${p.id}`)); screenEditProfile(); } }, '×'))));
  if (me.photos.length < 6) photosGrid.append(h('label', { class: 'add-tile', 'aria-label': 'Ajouter une photo' }, icon('plus', 22), fileInput));
  const f = {
    job: h('input', { value: me.job || '', maxlength: 60 }),
    neighborhood: h('select', null, h('option', { value: '' }, '—'), state.meta.neighborhoods.map((n) => h('option', { value: n, selected: me.neighborhood === n }, n))),
    music_title: h('input', { value: me.music_title || '', maxlength: 80, placeholder: 'Titre – artiste' }),
    interests: h('input', { value: me.interests || '', maxlength: 200, placeholder: 'Techno, Cinéma…' }),
    bio: h('textarea', { class: 'input', maxlength: 300, 'aria-label': 'Bio' }, me.bio || ''),
    prompt_answer: h('textarea', { class: 'input', maxlength: 200, 'aria-label': 'Un dimanche parfait' }, me.prompt_answer || '')
  };
  const modes = me.looking_for.split(',');
  const modeBoxes = Object.entries(MODE_LABEL).map(([k, v]) => {
    const cb = h('input', { type: 'checkbox', checked: modes.includes(k), value: k });
    return { k, el: h('label', null, h('span', { class: 'grow' }, v), cb), cb };
  });
  const save = async () => {
    await run(() => api('PATCH', '/api/me', {
      job: f.job.value, neighborhood: f.neighborhood.value, music_title: f.music_title.value, interests: f.interests.value,
      bio: f.bio.value, prompt_answer: f.prompt_answer.value, looking_for: modeBoxes.filter((m) => m.cb.checked).map((m) => m.k).join(',')
    }), 'Profil enregistré.');
    go('#/me');
  };
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row between' }, h('a', { href: '#/me' }, 'Annuler'), h('span', { style: { fontWeight: '600' } }, 'Mon profil'), h('button', { class: 'btn ghost', onclick: save }, 'OK')),
    photosGrid,
    h('p', { class: 'small' }, 'Photos non explicites, validées par la modération. La position GPS est retirée de chaque photo avant l\'envoi.'),
    h('div', { class: 'list' },
      h('label', { class: 'field' }, h('span', null, 'Métier'), f.job),
      h('label', { class: 'field' }, h('span', null, 'Quartier'), f.neighborhood),
      h('label', { class: 'field' }, h('span', null, 'Musique'), f.music_title),
      h('label', { class: 'field' }, h('span', null, 'Intérêts'), f.interests)),
    h('span', { class: 'section-label' }, 'Bio'), f.bio,
    h('span', { class: 'section-label' }, 'Un dimanche parfait…'), f.prompt_answer,
    h('span', { class: 'section-label' }, 'Je cherche'),
    h('div', { class: 'list' }, modeBoxes.map((m) => m.el)),
    h('button', { class: 'btn primary block', onclick: save }, 'Enregistrer')));
}

async function screenMyAlbum() {
  await refreshMe();
  const a = await api('GET', `/api/albums/${state.me.id}`);
  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', onchange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await run(async () => api('POST', '/api/me/photos', { kind: 'album', data: await fileToJpeg(file) }), 'Photo ajoutée.');
    screenMyAlbum();
  } });
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row' }, backBtn('#/me'), h('h1', { style: { fontSize: '24px' } }, 'Mon album privé')),
    h('div', { class: 'list' }, h('label', null, h('span', { class: 'grow' }, 'Activer mon album'),
      h('input', { type: 'checkbox', checked: a.enabled, onchange: async (e) => { await run(() => api('PATCH', '/api/me', { album_enabled: e.target.checked })); screenMyAlbum(); } }))),
    h('p', { class: 'small' }, "Contenu explicite autorisé ici uniquement, entre adultes. Personne ne le voit sans ton accord, et tu peux retirer un accès à tout moment."),
    a.enabled ? [
      h('div', { class: 'grid3' }, a.photos.map((id) => h('div', { class: 'photo-edit' }, h('div', { class: 'album-tile' }, h('img', { src: `/photos/${id}`, alt: '' })),
        h('button', { class: 'remove', 'aria-label': 'Supprimer la photo', onclick: async () => { await run(() => api('DELETE', `/api/me/photos/${id}`)); screenMyAlbum(); } }, '×'))),
      h('label', { class: 'album-tile', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #6e6e73' }, 'aria-label': 'Ajouter une photo' }, icon('plus', 22), fileInput)),
      h('span', { class: 'section-label' }, 'Demandes'),
      a.requests.length ? h('div', { class: 'list' }, a.requests.map((r) => h('div', null, h('span', { class: 'grow' }, r.first_name),
        h('button', { class: 'btn ghost small', onclick: async () => { await run(() => api('DELETE', `/api/me/album/requests/${r.id}`)); screenMyAlbum(); } }, 'Refuser'),
        h('button', { class: 'btn primary small', onclick: async () => { await run(() => api('POST', '/api/me/album/grants', { user_id: r.id }), `Accès ouvert à ${r.first_name} pour 7 jours.`); screenMyAlbum(); } }, 'Accepter'))))
        : h('p', { class: 'small' }, 'Aucune demande.'),
      h('span', { class: 'section-label' }, 'Accès en cours'),
      a.grants.length ? h('div', { class: 'list' }, a.grants.map((g) => h('div', null, h('span', { class: 'grow' }, `${g.first_name} · jusqu'au ${fmtDate(g.expires_at, false)}`),
        h('button', { class: 'btn danger small', onclick: async () => { await run(() => api('DELETE', `/api/me/album/grants/${g.id}`), 'Accès retiré.'); screenMyAlbum(); } }, 'Retirer'))))
        : h('p', { class: 'small' }, 'Personne n\'a accès pour le moment.')
    ] : null));
}

async function screenPremium() {
  await refreshMe();
  const me = state.me;
  const city = h('input', { value: me.travel_city || '', placeholder: 'Berlin', maxlength: 60, 'aria-label': 'Ville' });
  const from = h('input', { type: 'date', value: me.travel_from || '', 'aria-label': 'Arrivée' });
  const to = h('input', { type: 'date', value: me.travel_to || '', 'aria-label': 'Départ' });
  const feature = (ic, label) => h('div', null, icon(ic, 20, '#2997ff'), h('span', { class: 'grow' }, label));
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row between' }, h('span'), h('a', { class: 'icon-btn', href: '#/me', 'aria-label': 'Fermer' }, icon('close', 18))),
    h('div', { class: 'stack', style: { padding: '0 4px', gap: '8px' } },
      h('span', { class: 'huge', style: { fontSize: '52px' } }, 'ILD', h('span', { style: { color: 'var(--link)' } }, '+')),
      h('p', { class: 'lead' }, 'Pour ceux qui sortent, voyagent et ne veulent rien rater.')),
    h('div', { class: 'list' }, feature('heart', "Voir qui t'a liké"), feature('plane', "Mode voyage : apparais avant d'arriver"), feature('calendar', 'Accès prioritaire aux événements')),
    me.premium ? h('div', { class: 'card pad stack' },
      h('div', { class: 'row between' }, h('h2', null, 'Ton prochain voyage'), h('span', { class: 'tag-yellow small' }, 'Voyage')),
      city, h('div', { class: 'grid2' }, from, to),
      h('p', { class: 'small' }, 'Les membres de cette ville te voient quelques jours avant ton arrivée.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary small grow', onclick: async () => { state.me = await run(() => api('PATCH', '/api/me', { travel_city: city.value, travel_from: from.value, travel_to: to.value }), 'Voyage enregistré.'); } }, 'Enregistrer'),
        me.travel_city ? h('button', { class: 'btn small', onclick: async () => { state.me = await run(() => api('PATCH', '/api/me', { travel_city: '', travel_from: '', travel_to: '' }), 'Voyage retiré.'); screenPremium(); } }, 'Retirer') : null)) : null,
    h('div', { class: 'grow' }),
    me.premium
      ? h('button', { class: 'btn block', onclick: async () => { await run(() => api('POST', '/api/me/premium', { active: false }), 'Abonnement arrêté.'); screenPremium(); } }, 'Arrêter ILD+')
      : h('button', { class: 'btn primary block', onclick: async () => { await run(() => api('POST', '/api/me/premium', { active: true }), 'ILD+ activé (démo).'); screenPremium(); } }, "S'abonner · [TON PRIX] / mois"),
    h('p', { class: 'small center' }, 'Démo : aucun paiement. Sans engagement, résiliable en 3 clics.')));
}

// ---------- actions ----------
async function logout() {
  await api('POST', '/api/auth/logout', {}).catch(() => {});
  state.me = null; go('#/');
}

function deleteAccount() {
  sheet((close) => {
    const pass = h('input', { type: 'password', class: 'input', placeholder: 'Ton mot de passe', autocomplete: 'current-password', 'aria-label': 'Mot de passe' });
    return [h('h2', null, 'Supprimer mon compte'),
      h('p', { class: 'small' }, 'Ton profil, tes photos, tes matchs et tes messages sont supprimés définitivement. Les signalements te concernant sont conservés pour la sécurité des membres.'),
      pass,
      h('button', { class: 'btn block', style: { background: 'var(--danger)', color: '#000' }, onclick: async () => {
        await run(() => api('DELETE', '/api/me', { password: pass.value }), 'Compte supprimé.');
        close(); state.me = null; go('#/');
      } }, 'Supprimer définitivement'),
      h('button', { class: 'btn ghost', onclick: close }, 'Annuler')];
  });
}

// ---------- routeur ----------
async function render() {
  clearTimers();
  document.querySelectorAll('.sheet-backdrop').forEach((s) => s.remove());
  const hash = location.hash || '#/';
  const [, path, arg] = /^#\/([^/]*)\/?(.*)$/.exec(hash) || [];
  if (!state.meta) state.meta = await api('GET', '/api/meta');
  if (state.me === null) await refreshMe();
  const me = state.me;
  document.title = me?.discreet_icon ? 'Notes' : 'ILD';

  try {
    if (!me) {
      if (path === 'login') return screenLogin();
      if (path === 'apply') return screenApply();
      return screenWelcome();
    }
    if (path === 'admin-hint' || me.role === 'admin') {
      return mount(h('main', { class: 'screen' }, h('h1', null, 'Compte administrateur'),
        h('p', { class: 'lead' }, 'Le back office se trouve à une autre adresse.'),
        h('a', { class: 'btn primary block', href: '/admin' }, 'Ouvrir le back office'), h('button', { class: 'btn ghost', onclick: logout }, 'Se déconnecter')));
    }
    if (me.status === 'pending') return screenVerify();
    if (me.status === 'waitlist') return screenWaitlist();
    if (me.status === 'refused') return screenClosed();
    switch (path) {
      case 'u': return await screenProfile(arg);
      case 'album': return await screenAlbum(arg);
      case 'map': return await screenMap();
      case 'tonight': return await screenTonight();
      case 'messages': return await screenMessages();
      case 'chat': return await screenChat(arg);
      case 'likes': return await screenLikes();
      case 'premium': return await screenPremium();
      case 'me':
        if (arg === 'edit') return await screenEditProfile();
        if (arg === 'album') return await screenMyAlbum();
        return await screenMe();
      default: return await screenDiscover();
    }
  } catch (e) {
    if (e.status === 401) { state.me = null; return render(); }
    mount(h('main', { class: 'screen' }, h('h1', null, 'Oups'), h('p', { class: 'lead' }, e.message), h('a', { class: 'btn block', href: '#/' }, 'Retour')));
  }
}

window.addEventListener('hashchange', render);
render();

// Entrée dans ILD : accueil, connexion, inscription en 5 étapes, vérification d'âge, liste d'attente,
// décisions de modération et recours, nouvelles conditions.
import { api, h, icon, toast, fmtDate } from '/shared/lib.js';
import { state, mount, go, run, refreshMe, backBtn, chips, select, logout, deleteAccount, legalLinks, langSwitch, isLive, brand } from './ui.js';

export function screenWelcome() {
  mount(h('main', { class: 'screen' },
    h('div', { class: 'media', style: { height: '40vh', minHeight: '240px' } },
      h('div', { class: 'grid2', style: { position: 'absolute', inset: '8px', gridTemplateRows: '1fr 1fr' } },
        ['var(--accent)', 'var(--raised)', 'var(--raised-2)', 'var(--accent-soft)'].map((c) => h('div', { style: { borderRadius: '20px', background: c } })))),
    h('div', { class: 'stack', style: { padding: '0 4px', flex: '1' } },
      h('span', { class: 'muted brand' }, 'ILD'),
      h('h1', { class: 'big' }, 'Paris.', h('br'), 'Sur invitation.'),
      h('p', { class: 'lead' }, 'Un club privé pour hommes gays et queer. Rencontrer, sortir, se connecter, en toute discrétion.')),
    h('a', { class: 'btn primary block', href: '#/apply' }, 'Demander à rejoindre'),
    h('a', { class: 'btn block', href: '#/login' }, 'Se connecter'),
    h('p', { class: 'small center' }, '18 ans et plus · Âge vérifié · Profils protégés'),
    legalLinks()));
}

export function screenLogin() {
  const email = h('input', { type: 'email', autocomplete: 'email', required: true });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  mount(h('main', { class: 'screen' }, h('div', { class: 'row' }, backBtn('#/')), h('h1', null, 'Connexion'),
    h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      const r = await run(() => api('POST', '/api/auth/login', { email: email.value, password: pass.value }));
      await refreshMe();
      go(r.role === 'admin' ? '#/admin-hint' : '#/');
    } },
    h('div', { class: 'list' },
      h('label', { class: 'field' }, h('span', null, 'E-mail'), email),
      h('label', { class: 'field' }, h('span', null, 'Mot de passe'), pass)),
    h('button', { class: 'btn primary block', type: 'submit' }, 'Se connecter')),
    langSwitch()));
}

// ---------- inscription en 5 étapes ----------
const wizard = { step: 0, data: { city: 'Paris', looking_for: ['dating'], seeking: [], tastes: [], intimate: [], position: null, position_visibility: 'members', intimate_visibility: 'matches' } };
const STEP_TITLES = ['Ton compte', 'Toi', 'Ce que tu cherches', 'Tes goûts', 'Tes accords'];

function maxBirthDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().slice(0, 10);
}

export function screenSignup() {
  const meta = state.meta;
  const w = wizard;
  const d = w.data;
  // Carte en direct : inscription en 3 étapes, la fiche se complète ensuite. Club : 5 étapes.
  const steps = isLive() ? [0, 1, 4] : [0, 1, 2, 3, 4];
  if (w.step >= steps.length) w.step = 0;
  const step = steps[w.step];
  const last = w.step === steps.length - 1;
  const name = brand().name;
  const progress = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': steps.length, 'aria-valuenow': w.step + 1 },
    steps.map((_, i) => h('span', { class: i <= w.step ? 'on' : '' })));
  let body;
  let validate = () => true;

  if (step === 0) {
    const email = h('input', { type: 'email', autocomplete: 'email', value: d.email || '', required: true });
    const password = h('input', { type: 'password', autocomplete: 'new-password', minlength: 10, value: d.password || '' });
    body = [h('div', { class: 'list' },
      h('label', { class: 'field' }, h('span', null, 'E-mail'), email),
      h('label', { class: 'field' }, h('span', null, 'Mot de passe'), password)),
    h('p', { class: 'small' }, '10 caractères minimum. Ton e-mail ne sera jamais affiché.')];
    validate = () => {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) return 'E-mail invalide.';
      if (password.value.length < 10) return 'Mot de passe : 10 caractères minimum.';
      Object.assign(d, { email: email.value, password: password.value });
      return true;
    };
  } else if (step === 1) {
    const first = h('input', { autocomplete: 'given-name', maxlength: 40, value: d.first_name || '' });
    const birth = h('input', { type: 'date', max: maxBirthDate(), value: d.birth_date || '' });
    const city = h('input', { maxlength: 60, value: d.city || 'Paris' });
    const code = h('input', { maxlength: 20, placeholder: 'Facultatif', value: d.invite_code || '', autocapitalize: 'characters' });
    body = [h('div', { class: 'list' },
      h('label', { class: 'field' }, h('span', null, isLive() ? 'Pseudo' : 'Prénom'), first),
      h('label', { class: 'field' }, h('span', null, 'Naissance'), birth),
      h('label', { class: 'field' }, h('span', null, 'Ville'), city),
      isLive() ? null : h('label', { class: 'field' }, h('span', null, 'Code'), code)),
    h('p', { class: 'small' }, isLive() ? 'Un pseudo suffit : pas besoin de ton vrai prénom. Ton âge est affiché, jamais ta date de naissance.' : "Ton âge est affiché, jamais ta date de naissance. Le code est celui d'un membre qui peut te parrainer.")];
    validate = () => {
      if (!first.value.trim()) return isLive() ? 'Choisis un pseudo.' : 'Indique ton prénom.';
      if (!birth.value) return 'Indique ta date de naissance.';
      if (birth.value > maxBirthDate()) return `${name} est réservé aux personnes majeures.`;
      Object.assign(d, { first_name: first.value.trim(), birth_date: birth.value, city: city.value.trim() || 'Paris', invite_code: code.value.trim() });
      return true;
    };
  } else if (step === 2) {
    const modes = chips(meta.modes, d.looking_for, { ariaLabel: 'Modes' });
    const seeking = chips(meta.seeking, d.seeking, { ariaLabel: 'Je cherche' });
    body = [h('h2', null, 'Dans Découvrir'), h('p', { class: 'small' }, 'Tu peux en choisir plusieurs.'), modes.el,
      h('h2', null, 'Je cherche'), seeking.el];
    validate = () => {
      if (!modes.values().length) return 'Choisis au moins un mode.';
      Object.assign(d, { looking_for: modes.values(), seeking: seeking.values() });
      return true;
    };
  } else if (step === 3) {
    const tastes = chips(meta.tastes, d.tastes, { max: 12, ariaLabel: 'Goûts' });
    const position = chips(meta.positions, d.position ? [d.position] : [], { single: true, ariaLabel: 'Position' });
    const posVis = select(meta.visibility, d.position_visibility, { 'aria-label': 'Qui voit ma position' });
    const intimate = chips(meta.intimate, d.intimate, { max: 12, ariaLabel: 'Côté intime' });
    const intVis = select(meta.visibility, d.intimate_visibility, { 'aria-label': 'Qui voit mes goûts intimes' });
    body = [
      h('h2', null, 'Ce que tu aimes'), h('p', { class: 'small' }, '3 au moins, 12 au plus.'), tastes.el,
      h('h2', null, 'Position'), h('p', { class: 'small' }, 'Facultatif. Ne choisis rien si tu préfères ne pas le dire.'), position.el,
      h('label', { class: 'stack small-gap' }, h('span', { class: 'small' }, 'Qui la voit'), posVis),
      h('h2', null, 'Côté intime'), h('p', { class: 'small' }, 'Facultatif.'), intimate.el,
      h('label', { class: 'stack small-gap' }, h('span', { class: 'small' }, 'Qui les voit'), intVis),
      h('div', { class: 'notice' }, icon('shield', 18), 'Ces informations concernent ta vie sexuelle : elles restent facultatives, tu choisis qui les voit et tu peux les effacer à tout moment.')
    ];
    validate = () => {
      if (tastes.values().length < 3) return 'Choisis au moins 3 goûts.';
      Object.assign(d, { tastes: tastes.values(), position: position.value(), position_visibility: posVis.value, intimate: intimate.values(), intimate_visibility: intVis.value });
      return true;
    };
  } else {
    const c = { age: h('input', { type: 'checkbox' }), orientation: h('input', { type: 'checkbox' }), charter: h('input', { type: 'checkbox' }) };
    const link = (doc, text) => h('a', { href: `/legal/${doc}`, target: '_blank', rel: 'noopener' }, text);
    body = [h('div', { class: 'card pad stack', style: { gap: '16px' } },
      h('label', { class: 'check' }, c.age, h('span', null, `J'ai 18 ans ou plus et j'accepte de vérifier mon âge (pièce d'identité + selfie, contrôlés par un prestataire ; ${name} ne garde que le résultat).`)),
      h('label', { class: 'check' }, c.orientation, h('span', null, `J'accepte explicitement que ${name} traite des données sur mon orientation sexuelle et, si je les indique, sur ma vie sexuelle (rôle, pratiques, goûts intimes). Voir la `, link('confidentialite', 'politique de confidentialité'), '.')),
      h('label', { class: 'check' }, c.charter, h('span', null, "J'accepte les ", link('cgu', "conditions d'utilisation"), ' et la ', link('charte', 'charte'), ` : respect, consentement, rien ne sort de ${name}.`))),
    h('p', { class: 'small' }, "Tu peux retirer ton accord à tout moment en effaçant ces informations ou en supprimant ton compte.")];
    validate = async () => {
      if (!c.age.checked || !c.orientation.checked || !c.charter.checked) return isLive() ? 'Les trois accords sont nécessaires pour créer ton compte.' : 'Les trois accords sont nécessaires pour candidater.';
      await run(() => api('POST', '/api/auth/register', {
        ...d, looking_for: d.looking_for.join(','), seeking: d.seeking.join(','), tastes: d.tastes.join(','), intimate: d.intimate.join(','),
        consent_age: true, consent_orientation: true, charter: true
      }));
      wizard.step = 0;
      wizard.data = { city: 'Paris', looking_for: ['dating'], seeking: [], tastes: [], intimate: [], position: null, position_visibility: 'members', intimate_visibility: 'matches' };
      await refreshMe();
      go('#/verify');
      return null;
    };
  }

  const next = async () => {
    let ok;
    try { ok = await validate(); } catch { return; }
    if (ok === null) return;
    if (ok !== true) { toast(ok, true); return; }
    w.step += 1;
    screenSignup();
  };
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row between' },
      w.step ? h('button', { class: 'icon-btn', 'aria-label': 'Étape précédente', onclick: () => { w.step -= 1; screenSignup(); } }, icon('back')) : backBtn('#/'),
      h('span', { class: 'small' }, `Étape ${w.step + 1} sur ${steps.length}`)),
    progress,
    h('h1', null, STEP_TITLES[step]),
    h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); next(); } }, ...body,
      h('div', { class: 'grow' }),
      h('button', { class: 'btn primary block', type: 'submit' }, !last ? 'Continuer' : isLive() ? 'Créer mon compte' : 'Envoyer ma candidature')),
    w.step === 0 ? langSwitch() : null));
}

// ---------- vérification d'âge ----------
export function screenVerify() {
  const me = state.me;
  const status = me.id_check_status;
  const start = async () => {
    const r = await run(() => api('POST', '/api/me/id-check', {}));
    if (r.url) location.href = r.url;
    else { await refreshMe(); go('#/'); }
  };
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row between' }, h('span'), h('span', { class: 'small' }, 'Vérification')),
    h('h1', null, 'Vérifie ton âge'),
    h('p', { class: 'lead' }, 'Chaque membre est une vraie personne majeure. Ça prend 2 minutes.'),
    h('div', { class: 'media', style: { height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      h('div', { class: 'face-frame' }, icon('user', 64))),
    h('ol', { class: 'list steps plain' },
      h('li', null, h('span', { class: 'step-dot now' }, '1'), h('span', { class: 'grow' }, "Photo de ta pièce d'identité")),
      h('li', null, h('span', { class: 'step-dot todo' }, '2'), h('span', { class: 'grow' }, 'Selfie vidéo de quelques secondes')),
      h('li', null, h('span', { class: 'step-dot todo' }, '3'), h('span', { class: 'grow' }, 'Résultat immédiat'))),
    h('div', { class: 'row top' }, icon('shield', 18, '#575656'),
      h('p', { class: 'small' }, `Le contrôle est fait par un prestataire certifié. Ta pièce n'est jamais montrée aux membres ni conservée par ${brand().name} : seul le résultat (vérifié, majeur) est gardé.`)),
    status === 'failed' ? h('div', { class: 'notice warn' }, "La vérification n'a pas abouti. Vérifie la lumière et que ta pièce est lisible, puis réessaie.") : null,
    status === 'submitted' ? h('div', { class: 'notice' }, icon('clock', 18), 'Vérification commencée. Si tu as quitté le parcours, relance-la.') : null,
    h('div', { class: 'grow' }),
    h('button', { class: 'btn primary block', onclick: start }, status === 'none' ? 'Vérifier mon âge' : 'Relancer la vérification'),
    h('button', { class: 'btn ghost', onclick: logout }, 'Se déconnecter')));
}

// ---------- liste d'attente ----------
export function screenWaitlist() {
  const me = state.me;
  const c = me.checks;
  const step = (label, st, extra, href) => h(href ? 'a' : 'div', { href, class: href ? 'link-row' : null },
    h('span', { class: `step-dot ${st}` }, st === 'done' ? icon('check', 13) : ''), h('span', { class: 'grow' }, label),
    extra ? h('span', { class: 'small' }, extra) : null, href ? icon('chevron', 16, '#575656') : null);
  const share = async () => {
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
      h('p', { class: 'lead' }, `${me.city} ouvre par vagues. Complète ton dossier : le comité examine les dossiers complets en premier.`)),
    h('div', { class: 'list steps' },
      step('Âge vérifié', 'done'),
      step('Photo de profil validée', c.photo_approved ? 'done' : 'now', c.photo_approved ? null : c.photo_pending ? 'En validation' : 'À ajouter', c.photo_approved ? null : '#/me/edit'),
      step('Profil complet', c.profile_complete ? 'done' : 'now', c.profile_complete ? null : 'À compléter', c.profile_complete ? null : '#/me/edit'),
      step('Parrainages', c.vouches >= c.vouches_required ? 'done' : 'now', `${Math.min(c.vouches, c.vouches_required)} sur ${c.vouches_required}`),
      step('Examen par le comité', 'todo')),
    h('div', { class: 'card pad stack' },
      h('h2', null, 'Tu connais un membre ?'),
      h('p', { class: 'small text2' }, 'Envoie-lui ton code. Quand il te parraine, tu avances dans la liste.'),
      h('div', { class: 'row' }, h('span', { class: 'code-box' }, me.referral_code), h('button', { class: 'btn primary small', onclick: share }, 'Partager'))),
    h('div', { class: 'grow' }),
    h('p', { class: 'small' }, 'Critères publiés : âge vérifié, photo validée, accords donnés, charte respectée, parrainages. Jamais ton apparence.'),
    h('div', { class: 'row' },
      h('a', { class: 'btn small grow', href: '/api/me/export', download: 'ild-mes-donnees.json' }, 'Mes données'),
      h('button', { class: 'btn small grow', onclick: logout }, 'Se déconnecter')),
    legalLinks()));
}

// ---------- décisions de modération et recours ----------
export async function screenNotices({ standalone }) {
  const { notices } = await api('GET', '/api/notices');
  for (const n of notices.filter((x) => !x.read)) api('POST', `/api/notices/${n.id}/read`, {}).catch(() => {});
  const me = state.me;
  const title = { suspended: 'Compte suspendu', banned: 'Compte banni', refused: 'Candidature non retenue' }[me.status] || 'Décisions de modération';
  const APPEAL = { pending: 'Recours en cours d’examen', upheld: 'Recours examiné : décision maintenue', overturned: 'Recours accepté : décision annulée' };
  const card = (n) => {
    const text = h('textarea', { class: 'input', maxlength: 2000, placeholder: 'Explique pourquoi tu contestes cette décision', 'aria-label': 'Ton recours' });
    return h('article', { class: 'card pad stack' },
      h('div', { class: 'row between' }, h('h2', null, n.kind_label), h('span', { class: 'small' }, fmtDate(n.created_at))),
      h('p', { class: 'small' }, `Motif : ${n.ground}`),
      h('p', { style: { margin: '0', lineHeight: '1.47' } }, n.explanation),
      n.automated ? h('p', { class: 'small' }, 'Décision prise automatiquement (vérification d’âge).') : null,
      n.appeal.status !== 'none' ? h('div', { class: 'notice' }, h('div', { class: 'stack small-gap' }, h('b', null, APPEAL[n.appeal.status]), n.appeal.note ? h('span', null, n.appeal.note) : null)) : null,
      n.can_appeal ? [text, h('button', { class: 'btn block', onclick: async () => {
        await run(() => api('POST', `/api/notices/${n.id}/appeal`, { text: text.value }), 'Recours envoyé. Un membre de l’équipe va le réexaminer.');
        screenNotices({ standalone });
      } }, 'Contester cette décision')] : null);
  };
  mount(h('main', { class: 'screen' },
    standalone ? null : h('div', { class: 'row' }, backBtn('#/me')),
    h('h1', null, title),
    standalone ? h('p', { class: 'lead' }, 'Voici la décision et ses motifs. Tu peux la contester pendant 6 mois.') : null,
    notices.length ? notices.map(card) : h('p', { class: 'empty' }, 'Aucune décision.'),
    h('p', { class: 'small' }, 'Tu peux aussi saisir un organisme de règlement des litiges certifié ou le juge.'),
    standalone ? h('div', { class: 'list' },
      h('a', { href: '/api/me/export', download: 'ild-mes-donnees.json', class: 'text' }, 'Télécharger mes données'),
      h('button', { class: 'item', onclick: logout }, 'Se déconnecter'),
      h('button', { class: 'item danger-text', onclick: deleteAccount }, 'Supprimer mon compte')) : null,
    legalLinks()));
}

// ---------- nouvelles conditions ----------
export function screenConsentUpdate() {
  const cb = h('input', { type: 'checkbox' });
  mount(h('main', { class: 'screen' },
    h('h1', null, 'Nos conditions évoluent'),
    h('p', { class: 'lead' }, `Merci de lire et d'accepter la nouvelle version (${state.me.legal.current}) pour continuer.`),
    h('div', { class: 'list' },
      h('a', { href: '/legal/cgu', target: '_blank', rel: 'noopener', class: 'text' }, "Conditions d'utilisation"),
      h('a', { href: '/legal/confidentialite', target: '_blank', rel: 'noopener', class: 'text' }, 'Politique de confidentialité'),
      h('a', { href: '/legal/charte', target: '_blank', rel: 'noopener', class: 'text' }, 'Charte')),
    h('label', { class: 'check' }, cb, h('span', null, "J'ai lu et j'accepte les nouvelles conditions et la charte.")),
    h('button', { class: 'btn primary block', onclick: async () => {
      if (!cb.checked) { toast('Coche la case pour accepter.', true); return; }
      await run(() => api('POST', '/api/legal/accept', { accept: true }));
      await refreshMe(); go('#/');
    } }, 'Accepter et continuer'),
    h('div', { class: 'list' },
      h('a', { href: '/api/me/export', download: 'ild-mes-donnees.json', class: 'text' }, 'Télécharger mes données'),
      h('button', { class: 'item danger-text', onclick: deleteAccount }, 'Je refuse : supprimer mon compte'))));
}

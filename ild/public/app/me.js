// Espace « Moi » : profil, albums, ILD+, position, confidentialité, décisions, informations légales.
import { api, h, icon, toast, fmtDate, fileToJpeg, raw } from '/shared/lib.js';
import { state, mount, go, run, refreshMe, backBtn, photoEl, chips, select, sheet, nav, logout, deleteAccount, label, euros, legalLinks, langSwitch, brand, isLive, personSummary,
  placeSelect, placeLabel } from './ui.js';

export async function screenMe() {
  await refreshMe();
  const me = state.me;
  const toggle = (key, text, hint) => h('label', null, h('span', { class: 'grow stack small-gap' }, h('span', null, text), hint ? h('span', { class: 'small' }, hint) : null),
    h('input', { type: 'checkbox', checked: me[key], onchange: async (e) => {
      try { state.me = await run(() => api('PATCH', '/api/me', { [key]: e.target.checked })); } catch { e.target.checked = !e.target.checked; }
    } }));
  const blocks = (await api('GET', '/api/blocks')).blocks;
  const approved = me.photos.find((p) => p.status === 'approved');
  const plusText = !me.payments_enabled ? 'Offert pendant le lancement' : me.premium ? `Offert par ${brand().name}` : me.entitlements.travel_mode ? 'Abonnement actif' : isLive() ? 'Mode voyage, filtres, incognito, accusés de lecture' : "Qui t'a liké, mode voyage, filtres";
  const summary = isLive() ? personSummary({ stats: me, position: me.position }) : '';
  mount(h('main', { class: 'screen with-nav' },
    h('div', { class: 'row profile-head' },
      h('span', { class: 'avatar xl' }, approved ? h('img', { src: `/photos/${approved.id}`, alt: '' }) : me.first_name[0]),
      h('div', { class: 'grow stack small-gap' }, h('span', { class: 'name' }, `${me.first_name}, ${me.age}`),
        summary ? h('span', { class: 'small text2' }, summary) : null, h('a', { href: '#/me/edit' }, isLive() && !summary ? 'Compléter ma fiche' : 'Modifier mon profil'))),
    isLive() && me.trip ? h('a', { class: 'notice', href: '#/map' }, icon('plane', 18), h('span', { class: 'grow' }, `En voyage : ${me.trip.label}, jusqu'au ${fmtDate(me.trip.until, false)}`), icon('chevron', 16)) : null,
    me.notices_unread ? h('a', { class: 'notice warn', href: '#/me/notices' }, icon('flag', 18), h('span', { class: 'grow' }, `${me.notices_unread} décision${me.notices_unread > 1 ? 's' : ''} de modération à lire`), icon('chevron', 16)) : null,
    (me.vouch_requests || []).length ? h('div', { class: 'card pad stack' }, h('h2', null, 'Ils demandent ton parrainage'),
      me.vouch_requests.map((r) => h('div', { class: 'row' }, h('span', { class: 'grow' }, r.first_name),
        h('button', { class: 'btn primary small', onclick: async () => { await run(() => api('POST', '/api/vouch', { applicant_id: r.id }), `Tu parraines ${r.first_name}.`); screenMe(); } }, 'Parrainer'))),
      h('p', { class: 'small' }, 'Ne parraine que des personnes que tu connais vraiment.')) : null,
    h('a', { class: 'notice', href: '#/plus' }, h('span', { class: 'plus-mark' }, brand().name, h('span', null, '+')), h('span', { class: 'grow' }, plusText), icon('chevron', 16)),
    h('div', { class: 'list' },
      h('a', { href: '#/me/albums', class: 'text' }, icon('lock', 20), h('span', { class: 'grow' }, 'Mes albums privés'),
        me.album_requests ? h('span', { class: 'chip blue' }, String(me.album_requests)) : null, icon('chevron', 16, '#5c6085')),
      h('a', { href: '#/me/location', class: 'text' }, icon('map', 20), h('span', { class: 'grow' }, 'Ma position'),
        h('span', { class: 'small' }, placeLabel(me)), icon('chevron', 16, '#5c6085')),
      h('a', { href: '#/me/notices', class: 'text' }, icon('flag', 20), h('span', { class: 'grow' }, 'Décisions de modération'), icon('chevron', 16, '#5c6085'))),
    h('span', { class: 'section-label' }, 'Confidentialité'),
    h('div', { class: 'list' },
      toggle('show_distance', 'Afficher ma distance'),
      h('label', null, h('span', { class: 'grow stack small-gap' }, h('span', null, isLive() ? 'Apparaître sur la carte' : 'Apparaître dans Autour'), h('span', { class: 'small' }, isLive() ? 'Carte et liste' : 'Grille et carte')),
        h('input', { type: 'checkbox', checked: !me.hide_from_map, onchange: async (e) => {
          try { state.me = await run(() => api('PATCH', '/api/me', { hide_from_map: !e.target.checked })); } catch { e.target.checked = !e.target.checked; }
        } })),
      isLive() ? null : toggle('incognito', 'Mode incognito', "Visible seulement par les personnes que tu as likées"),
      toggle('album_matches_only', isLive() ? 'Demandes d’album : seulement mes conversations' : 'Demandes d’album : mes matchs seulement'),
      toggle('blur_explicit', 'Flouter les photos explicites reçues'),
      isLive() && state.meta.explicit_profiles ? toggle('vanilla', 'Mode vanille', 'Floute les photos de profil explicites sur la carte et les fiches') : null,
      toggle('discreet_icon', 'Mode discret', 'Titre neutre dans le navigateur')),
    isLive() ? [h('span', { class: 'section-label' }, 'Carte en direct'),
      h('div', { class: 'list' },
        h('label', null, h('span', { class: 'grow' }, 'Précision de mon point'), select(state.meta.map_precision, me.map_precision, { class: 'inline-select', 'aria-label': 'Précision de mon point',
          onchange: async (e) => { state.me = await run(() => api('PATCH', '/api/me', { map_precision: e.target.value }), 'Réglage enregistré.'); } })),
        h('label', null, h('span', { class: 'grow' }, 'Qui peut m’écrire'), select(state.meta.messages_from, me.messages_from, { class: 'inline-select', 'aria-label': 'Qui peut m’écrire',
          onchange: async (e) => { state.me = await run(() => api('PATCH', '/api/me', { messages_from: e.target.value }), 'Réglage enregistré.'); } })))] : null,
    blocks.length ? [h('span', { class: 'section-label' }, 'Personnes bloquées ou masquées'),
      h('div', { class: 'list' }, blocks.map((b) => h('div', null, h('span', { class: 'grow' }, `${b.first_name} · ${b.kind === 'hide' ? 'masqué' : 'bloqué'}`),
        h('button', { class: 'btn ghost small', onclick: async () => { await run(() => api('DELETE', `/api/blocks/${b.id}`)); screenMe(); } }, 'Débloquer'))))] : null,
    isLive() ? null : [h('span', { class: 'section-label' }, 'Mon code de parrainage'),
      h('div', { class: 'row' }, h('span', { class: 'code-box' }, me.referral_code))],
    installCard(),
    h('span', { class: 'section-label' }, 'Mes données'),
    h('div', { class: 'list' },
      h('a', { href: '/api/me/export', download: 'ild-mes-donnees.json', class: 'text' }, 'Télécharger mes données'),
      h('button', { class: 'item', onclick: logout }, 'Se déconnecter'),
      h('button', { class: 'item danger-text', onclick: deleteAccount }, 'Supprimer mon compte')),
    langSwitch(),
    legalLinks()),
  nav('me'));
}

// « Site d'abord » : l'app s'installe depuis le navigateur, sans magasin d'applications.
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
function installCard() {
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return [h('span', { class: 'section-label' }, 'Sur ton téléphone'),
    h('div', { class: 'card pad stack' },
      h('div', { class: 'row' }, icon('install', 20), h('span', { class: 'strong grow' }, `Installer ${brand().name}`)),
      h('p', { class: 'small text2' }, ios ? 'Dans Safari : touche Partager, puis « Sur l’écran d’accueil ». L’icône s’ajoute comme une app, sans App Store.'
        : 'Ajoute l’icône à ton écran d’accueil ou à ton ordinateur, sans magasin d’applications.'),
      installPrompt ? h('button', { class: 'btn primary block', onclick: async () => {
        installPrompt.prompt();
        await installPrompt.userChoice.catch(() => null);
        installPrompt = null;
        screenMe();
      } }, 'Installer') : ios ? null : h('p', { class: 'small' }, 'Dans Chrome ou Edge : menu du navigateur, puis « Installer l’application ».'))];
}

export async function screenEditProfile() {
  await refreshMe();
  const me = state.me;
  const meta = state.meta;
  const back = me.status === 'member' ? '#/me' : '#/';
  const photosGrid = h('div', { class: 'grid3' });
  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', onchange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await run(async () => api('POST', '/api/me/photos', { data: await fileToJpeg(file) }), 'Photo envoyée : visible après validation.');
    screenEditProfile();
  } });
  const STATUS = { pending: 'En validation', approved: 'Visible', rejected: 'Refusée' };
  const explicitOk = isLive() && meta.explicit_profiles;
  photosGrid.append(...me.photos.map((p) => h('div', { class: 'photo-edit' }, photoEl(p.id, me.first_name), h('span', { class: 'status' }, STATUS[p.status]),
    explicitOk ? h('button', { class: `explicit-toggle${p.explicit ? ' on' : ''}`, 'aria-pressed': String(p.explicit), onclick: async () => {
      await run(() => api('PATCH', `/api/me/photos/${p.id}`, { explicit: !p.explicit }), p.explicit ? 'Photo marquée comme non explicite.' : 'Photo marquée comme explicite.');
      screenEditProfile();
    } }, p.explicit ? 'Explicite' : 'Non explicite') : null,
    h('button', { class: 'remove', 'aria-label': 'Supprimer la photo', onclick: async () => { await run(() => api('DELETE', `/api/me/photos/${p.id}`)); screenEditProfile(); } }, '×'))));
  if (me.photos.length < 6) photosGrid.append(h('label', { class: 'add-tile', 'aria-label': 'Ajouter une photo' }, icon('plus', 22), fileInput));
  const f = {
    job: h('input', { value: me.job || '', maxlength: 60 }),
    neighborhood: select(Object.fromEntries([['', '—'], ...meta.neighborhoods.map((n) => [n, n])]), me.neighborhood || '', { class: '' }),
    music_title: h('input', { value: me.music_title || '', maxlength: 80, placeholder: 'Titre – artiste' }),
    bio: h('textarea', { class: 'input', maxlength: 300, 'aria-label': 'Bio' }, me.bio || ''),
    prompt_answer: h('textarea', { class: 'input', maxlength: 200, 'aria-label': 'Un dimanche parfait' }, me.prompt_answer || '')
  };
  const modes = chips(meta.modes, me.looking_for.split(','), { ariaLabel: 'Modes' });
  const seeking = chips(meta.seeking, me.seeking, { ariaLabel: 'Je cherche' });
  const tastes = chips(meta.tastes, me.tastes, { max: 12, ariaLabel: 'Goûts' });
  const position = chips(meta.positions, me.position ? [me.position] : [], { single: true, ariaLabel: 'Position' });
  const posVis = select(meta.visibility, me.position_visibility, { 'aria-label': 'Qui voit ma position' });
  const intimate = chips(meta.intimate, me.intimate, { max: 12, ariaLabel: 'Côté intime' });
  const intVis = select(meta.visibility, me.intimate_visibility, { 'aria-label': 'Qui voit mes goûts intimes' });
  // Fiche cruising : tout est facultatif.
  const num = (value, min, max, name) => h('input', { class: 'input', type: 'number', inputmode: 'numeric', min, max, value: value ?? '', 'aria-label': name });
  const optional = (options) => Object.fromEntries([['', '—'], ...Object.entries(options)]);
  const c = {
    height: num(me.height_cm, 140, 220, 'Taille en centimètres'),
    weight: num(me.weight_kg, 40, 200, 'Poids en kilos'),
    body: select(optional(meta.body_types), me.body_type || '', { 'aria-label': 'Morphologie' }),
    identity: select(optional(meta.identities), me.identity || '', { 'aria-label': 'Je suis' }),
    tribes: chips(meta.tribes, me.tribes, { max: 5, ariaLabel: 'Style' }),
    can: chips(meta.can, me.can, { ariaLabel: 'Lieu' }),
    vibes: chips(meta.vibes, me.vibes, { max: 6, ariaLabel: 'Ambiance' }),
    endowment: num(me.endowment_cm, 5, 35, 'Taille du sexe en centimètres'),
    cut: select(optional(meta.cut), me.cut || '', { 'aria-label': 'Circoncision' }),
    safer: chips(meta.safer, me.safer, { ariaLabel: 'Pratiques' }),
    hiv: select(optional(meta.hiv_status), me.hiv_status || '', { 'aria-label': 'Statut VIH' }),
    lastTest: h('input', { class: 'input', type: 'month', value: me.last_test || '', max: new Date().toISOString().slice(0, 7), 'aria-label': 'Dernier dépistage' }),
    healthVis: select(meta.visibility, me.health_visibility, { 'aria-label': 'Qui voit mes infos de santé' }),
    healthOk: h('input', { type: 'checkbox', checked: me.health_consent })
  };
  const cruiseBody = () => {
    const body = {
      height_cm: c.height.value || null, weight_kg: c.weight.value || null, body_type: c.body.value || null, identity: c.identity.value || null,
      tribes: c.tribes.values(), can: c.can.values(), vibes: c.vibes.values(),
      endowment_cm: c.endowment.value || null, cut: c.cut.value || null, safer: c.safer.values(), health_visibility: c.healthVis.value
    };
    for (const k of ['height_cm', 'weight_kg', 'endowment_cm']) if (body[k] != null) body[k] = Number(body[k]);
    if (!c.healthOk.checked) {
      // Accord retiré ou jamais donné : rien n'est enregistré, et ce qui l'était est effacé.
      if (me.health_consent) body.health_consent = false;
    } else Object.assign(body, { health_consent: true, hiv_status: c.hiv.value || null, last_test: c.lastTest.value || null });
    return body;
  };
  const save = async () => {
    if (!isLive() && !modes.values().length) { toast('Choisis au moins un mode.', true); return; }
    if (isLive() && !c.healthOk.checked && (c.hiv.value || c.lastTest.value) && !me.health_consent) {
      toast('Coche l’accord sur les données de santé pour enregistrer ton statut, ou vide ces champs.', true); return;
    }
    await run(() => api('PATCH', '/api/me', {
      job: f.job.value, neighborhood: f.neighborhood.value, music_title: f.music_title.value, bio: f.bio.value, prompt_answer: f.prompt_answer.value,
      ...(isLive() ? cruiseBody() : { looking_for: modes.values().join(',') }), seeking: seeking.values().join(','), tastes: tastes.values().join(','),
      position: position.value(), position_visibility: posVis.value, intimate: intimate.values().join(','), intimate_visibility: intVis.value
    }), 'Profil enregistré.');
    go(back);
  };
  const cruiseForm = () => [
    h('span', { class: 'section-label' }, 'Présentation'), f.bio,
    h('span', { class: 'section-label' }, 'Physique (facultatif)'),
    h('div', { class: 'field-row' },
      h('label', null, 'Taille (cm)', c.height), h('label', null, 'Poids (kg)', c.weight),
      h('label', null, 'Morphologie', c.body), h('label', null, 'Je suis', c.identity)),
    h('span', { class: 'section-label' }, 'Rôle'), position.el,
    h('label', { class: 'stack small-gap' }, h('span', { class: 'small' }, 'Qui voit mon rôle'), posVis),
    h('span', { class: 'section-label' }, 'Lieu'), c.can.el,
    h('span', { class: 'section-label' }, 'Ambiance'), c.vibes.el,
    h('span', { class: 'section-label' }, 'Style (5 au plus)'), c.tribes.el,
    h('span', { class: 'section-label' }, 'Je cherche'), seeking.el,
    h('span', { class: 'section-label' }, 'Côté intime (facultatif)'), intimate.el,
    h('span', { class: 'section-label' }, 'Pratiques'), c.safer.el,
    h('div', { class: 'field-row' }, h('label', null, 'Taille du sexe (cm)', c.endowment), h('label', null, 'Circoncision', c.cut)),
    h('label', { class: 'stack small-gap' }, h('span', { class: 'small' }, 'Qui voit mon côté intime, mes pratiques et cette taille'), intVis),
    h('div', { class: 'card pad stack health-box' },
      h('div', { class: 'row' }, icon('shield', 18), h('span', { class: 'strong grow' }, 'Santé sexuelle (facultatif)')),
      h('p', { class: 'small text2' }, 'Statut VIH et date de dépistage sont des données de santé. Elles ne sont enregistrées qu’avec ton accord, montrées aux seules personnes que tu choisis, jamais transmises à un tiers ni utilisées pour de la publicité. Tu peux retirer ton accord à tout moment : elles sont alors effacées.'),
      h('div', { class: 'field-row' }, h('label', null, 'Statut VIH', c.hiv), h('label', null, 'Dernier dépistage', c.lastTest)),
      h('label', { class: 'stack small-gap' }, h('span', { class: 'small' }, 'Qui voit ces informations'), c.healthVis),
      h('label', { class: 'check' }, c.healthOk, h('span', null, `J'accepte que ${brand().name} enregistre mon statut VIH et ma date de dépistage pour les afficher sur ma fiche, selon la visibilité choisie.`)),
      h('p', { class: 'small' }, 'I = I : une personne séropositive sous traitement, avec une charge virale indétectable, ne transmet pas le VIH. Dépistage gratuit en CeGIDD ; infos PrEP sur sida-info-service.org.')),
    h('span', { class: 'section-label' }, 'Ce que tu aimes en dehors (facultatif)'), tastes.el
  ];
  if (isLive()) {
    mount(h('main', { class: 'screen' },
      h('div', { class: 'row between' }, h('a', { href: back }, 'Annuler'), h('span', { class: 'strong' }, 'Ma fiche'), h('button', { class: 'btn ghost', onclick: save }, 'OK')),
      photosGrid,
      h('p', { class: 'small' }, explicitOk
        ? "Le visage n'est pas obligatoire et les photos explicites sont permises : ici, tout le monde est un adulte vérifié. Marque-les « Explicite » pour qu'elles soient floutées chez ceux qui ont choisi le mode vanille. Chaque photo est validée par la modération ; la position GPS en est retirée avant l'envoi."
        : "Photos de profil sans nudité (le visage n'est pas obligatoire), validées par la modération. Les photos explicites se partagent en privé : dans le chat ou dans un album. La position GPS est retirée de chaque photo avant l'envoi."),
      cruiseForm(),
      h('button', { class: 'btn primary block', onclick: save }, 'Enregistrer')));
    return;
  }
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row between' }, h('a', { href: back }, 'Annuler'), h('span', { class: 'strong' }, 'Mon profil'), h('button', { class: 'btn ghost', onclick: save }, 'OK')),
    photosGrid,
    h('p', { class: 'small' }, "Photos sans nudité, où l'on te reconnaît, validées par la modération. La position GPS est retirée de chaque photo avant l'envoi."),
    h('div', { class: 'list' },
      h('label', { class: 'field' }, h('span', null, 'Métier'), f.job),
      h('label', { class: 'field' }, h('span', null, 'Quartier'), f.neighborhood),
      h('label', { class: 'field' }, h('span', null, 'Musique'), f.music_title)),
    h('span', { class: 'section-label' }, 'Bio'), f.bio,
    h('span', { class: 'section-label' }, 'Un dimanche parfait…'), f.prompt_answer,
    h('span', { class: 'section-label' }, 'Dans Découvrir'), modes.el,
    h('span', { class: 'section-label' }, 'Je cherche'), seeking.el,
    h('span', { class: 'section-label' }, 'Ce que tu aimes (3 à 12)'), tastes.el,
    h('span', { class: 'section-label' }, 'Position (facultatif)'), position.el,
    h('label', { class: 'stack small-gap' }, h('span', { class: 'small' }, 'Qui voit ma position'), posVis),
    h('span', { class: 'section-label' }, 'Côté intime (facultatif)'), intimate.el,
    h('label', { class: 'stack small-gap' }, h('span', { class: 'small' }, 'Qui voit mes goûts intimes'), intVis),
    h('button', { class: 'btn primary block', onclick: save }, 'Enregistrer')));
}

// ---------- albums ----------
export async function screenMyAlbums() {
  const { albums, requests } = await api('GET', '/api/me/albums');
  const name = h('input', { class: 'input', maxlength: 40, placeholder: 'Nom du nouvel album', 'aria-label': "Nom de l'album" });
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row' }, backBtn('#/me'), h('h1', { class: 'title' }, 'Mes albums privés')),
    h('p', { class: 'small' }, "Le contenu explicite entre adultes est permis ici seulement. Personne ne voit un album sans que tu le lui envoies, depuis votre conversation, pour la durée que tu choisis."),
    h('form', { class: 'row', onsubmit: async (e) => {
      e.preventDefault();
      const r = await run(() => api('POST', '/api/me/albums', { name: name.value }));
      go(`#/me/albums/${r.id}`);
    } }, name, h('button', { class: 'btn primary small', type: 'submit' }, 'Créer')),
    albums.length ? h('div', { class: 'grid2' }, albums.map((a) => h('a', { href: `#/me/albums/${a.id}`, class: 'stack text small-gap' },
      h('div', { class: 'album-cover' }, a.photos[0] ? h('img', { src: `/photos/${a.photos[0]}`, alt: '' }) : icon('image', 28, '#5c6085')),
      h('span', { class: 'strong' }, a.name),
      h('span', { class: 'small' }, `${a.photos.length} photo${a.photos.length > 1 ? 's' : ''}${a.shares.length ? ` · partagé avec ${a.shares.length}` : ''}`))))
      : h('p', { class: 'empty' }, 'Aucun album pour le moment.'),
    requests.length ? [h('span', { class: 'section-label' }, 'Ils aimeraient voir tes albums'),
      h('div', { class: 'list' }, requests.map((r) => h('div', null, h('span', { class: 'grow' }, raw(r.first_name)),
        h('a', { class: 'btn ghost small', href: '#/messages' }, 'Répondre'),
        h('button', { class: 'btn ghost small', onclick: async () => { await run(() => api('DELETE', `/api/me/album/requests/${r.id}`)); screenMyAlbums(); } }, 'Ignorer'))))] : null));
}

export async function screenAlbumDetail(id) {
  const { albums } = await api('GET', '/api/me/albums');
  const a = albums.find((x) => x.id === Number(id));
  if (!a) { go('#/me/albums'); return; }
  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden', onchange: async (e) => {
    for (const file of e.target.files) {
      try { await run(async () => api('POST', `/api/me/albums/${a.id}/photos`, { data: await fileToJpeg(file) })); } catch { break; }
    }
    toast('Photos ajoutées.');
    screenAlbumDetail(id);
  } });
  const rename = () => sheet((close) => {
    const input = h('input', { class: 'input', value: a.name, maxlength: 40, 'aria-label': "Nom de l'album" });
    return [h('h2', null, "Renommer l'album"), input,
      h('button', { class: 'btn primary block', onclick: async () => { await run(() => api('PATCH', `/api/me/albums/${a.id}`, { name: input.value })); close(); screenAlbumDetail(id); } }, 'Enregistrer'),
      h('button', { class: 'btn ghost', onclick: close }, 'Annuler')];
  });
  const remove = () => sheet((close) => [h('h2', null, `Supprimer « ${a.name} » ?`),
    h('p', { class: 'small' }, "Les photos sont supprimées et plus personne n'y a accès."),
    h('button', { class: 'btn danger-fill block', onclick: async () => { await run(() => api('DELETE', `/api/me/albums/${a.id}`), 'Album supprimé.'); close(); go('#/me/albums'); } }, 'Supprimer'),
    h('button', { class: 'btn ghost', onclick: close }, 'Annuler')]);
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row' }, backBtn('#/me/albums'), h('h1', { class: 'title grow' }, a.name), h('button', { class: 'icon-btn', 'aria-label': 'Renommer', onclick: rename }, icon('more'))),
    h('div', { class: 'grid3' },
      a.photos.map((pid) => h('div', { class: 'photo-edit' }, h('div', { class: 'album-tile' }, h('img', { src: `/photos/${pid}`, alt: '' })),
        h('button', { class: 'remove', 'aria-label': 'Supprimer la photo', onclick: async () => { await run(() => api('DELETE', `/api/me/photos/${pid}`)); screenAlbumDetail(id); } }, '×'))),
      h('label', { class: 'album-tile add', 'aria-label': 'Ajouter des photos' }, icon('plus', 22), fileInput)),
    h('span', { class: 'section-label' }, 'Qui y a accès'),
    a.shares.length ? h('div', { class: 'list' }, a.shares.map((s) => h('div', null,
      h('span', { class: 'grow' }, `${s.first_name} · ${s.expires_at ? `jusqu'au ${fmtDate(s.expires_at)}` : "jusqu'au retrait"}`),
      h('button', { class: 'btn danger small', onclick: async () => { await run(() => api('DELETE', `/api/me/albums/shares/${s.id}`), 'Accès retiré.'); screenAlbumDetail(id); } }, 'Retirer'))))
      : h('p', { class: 'small' }, 'Personne pour le moment. Pour envoyer cet album, ouvre une conversation et touche le cadenas.'),
    h('button', { class: 'btn danger block', onclick: remove }, "Supprimer l'album")));
}

// ---------- ILD+ ----------
export async function screenPlus() {
  await refreshMe();
  const b = await api('GET', '/api/billing');
  const me = state.me;
  const rows = Object.entries(b.features).map(([k, text]) => {
    const premium = b.plus_features.includes(k);
    return h('div', null, h('span', { class: 'grow' }, text),
      h('span', { class: 'small' }, !b.payments_enabled ? 'Offert' : premium ? brand().plus : 'Gratuit'));
  });
  const travel = () => {
    const city = h('input', { class: 'input', value: me.travel_city || '', placeholder: 'Berlin', maxlength: 60, 'aria-label': 'Ville' });
    const from = h('input', { class: 'input', type: 'date', value: me.travel_from || '', 'aria-label': 'Arrivée' });
    const to = h('input', { class: 'input', type: 'date', value: me.travel_to || '', 'aria-label': 'Départ' });
    return h('div', { class: 'card pad stack' },
      h('div', { class: 'row between' }, h('h2', null, 'Mode voyage'), h('span', { class: 'tag-accent small' }, 'Voyage')),
      city, h('div', { class: 'grid2' }, from, to),
      h('p', { class: 'small' }, 'Les membres de cette ville te voient quelques jours avant ton arrivée.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary small grow', onclick: async () => { state.me = await run(() => api('PATCH', '/api/me', { travel_city: city.value, travel_from: from.value, travel_to: to.value }), 'Voyage enregistré.'); } }, 'Enregistrer'),
        me.travel_city ? h('button', { class: 'btn small', onclick: async () => { await run(() => api('PATCH', '/api/me', { travel_city: '' }), 'Voyage retiré.'); screenPlus(); } }, 'Retirer') : null));
  };
  const cancelFlow = () => sheet((close) => [h('h2', null, `Résilier ${brand().plus} ?`),
    h('p', { class: 'small' }, `Tu gardes ${brand().plus} jusqu'au ${fmtDate(b.subscription.current_period_end, false)}, puis l'abonnement s'arrête. Aucun autre prélèvement.`),
    h('button', { class: 'btn danger-fill block', onclick: async () => { await run(() => api('POST', '/api/billing/cancel', {}), 'Résiliation enregistrée.'); close(); screenPlus(); } }, 'Confirmer la résiliation'),
    h('button', { class: 'btn ghost', onclick: close }, `Garder ${brand().plus}`)]);
  const accept = h('input', { type: 'checkbox' });
  let action;
  if (!b.payments_enabled) {
    action = h('div', { class: 'notice' }, icon('heart', 18), `Pendant le lancement, ${brand().name} est entièrement gratuit : tout est offert.`);
  } else if (b.offered) {
    action = h('div', { class: 'notice' }, `${brand().plus} t’est offert par l’équipe.`);
  } else if (b.subscription) {
    action = h('div', { class: 'stack' },
      h('div', { class: 'notice' }, b.subscription.cancel_at_period_end ? `Résilié : actif jusqu'au ${fmtDate(b.subscription.current_period_end, false)}.` : `Abonné · prochain renouvellement le ${fmtDate(b.subscription.current_period_end, false)}.`),
      b.subscription.cancel_at_period_end
        ? h('button', { class: 'btn block', onclick: async () => { await run(() => api('POST', '/api/billing/resume', {}), 'Abonnement repris.'); screenPlus(); } }, 'Reprendre mon abonnement')
        : h('button', { class: 'btn block', onclick: cancelFlow }, 'Résilier'));
  } else {
    action = h('div', { class: 'stack' },
      h('label', { class: 'check' }, accept, h('span', null, "J'accepte les ", h('a', { href: '/legal/cgv', target: '_blank', rel: 'noopener' }, 'conditions générales de vente'), " et je demande que l'abonnement commence tout de suite.")),
      h('button', { class: 'btn primary block', onclick: async () => {
        if (!accept.checked) { toast('Accepte les conditions de vente pour continuer.', true); return; }
        await run(() => api('POST', '/api/billing/subscribe', { accept_terms: true }), `Bienvenue dans ${brand().plus}.`);
        screenPlus();
      } }, `S'abonner · ${euros(b.price_cents)} TTC / mois`),
      h('p', { class: 'small center' }, 'Sans engagement. Rétractation possible 14 jours. Résiliation en 3 clics.'));
  }
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row between' }, h('span'), h('a', { class: 'icon-btn', href: '#/me', 'aria-label': 'Fermer' }, icon('close', 18))),
    h('div', { class: 'stack', style: { padding: '0 4px', gap: '8px' } },
      h('span', { class: 'huge plus-title' }, brand().name, h('span', null, '+')),
      h('p', { class: 'lead' }, 'Pour ceux qui sortent, voyagent et ne veulent rien rater.')),
    h('div', { class: 'list' }, rows),
    action,
    isLive() ? h('p', { class: 'small' }, 'Ce qui protège ta vie privée reste gratuit, toujours : bloquer, débloquer, retirer une photo, masquer ta position, supprimer ton compte.') : null,
    b.entitlements.travel_mode && !isLive() ? travel() : null));
}

// ---------- position ----------
export async function screenLocation() {
  await refreshMe();
  const me = state.me;
  const place = placeSelect();
  const where = !me.location.enabled ? 'Position désactivée' : me.location.source === 'gps' ? 'Position de ton appareil' : placeLabel(me);
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row' }, backBtn('#/me'), h('h1', { class: 'title' }, 'Ma position')),
    h('div', { class: 'card pad stack' },
      h('span', { class: 'strong' }, where),
      me.location.updated_at ? h('span', { class: 'small' }, `Mise à jour : ${fmtDate(me.location.updated_at)}`) : null,
      h('p', { class: 'small text2' }, "Arrondie à environ 500 m avant d'être enregistrée. Les autres voient une tranche de distance, jamais ta position. Effacée automatiquement après quelques jours sans activité.")),
    h('span', { class: 'section-label' }, 'Choisir une ville plutôt que le GPS'),
    place.el,
    h('button', { class: 'btn block', onclick: async () => {
      if (!place.body()) { toast('Choisis une ville.', true); return; }
      await run(() => api('PUT', '/api/me/location', { ...place.body(), consent: true }), 'Ville enregistrée.');
      screenLocation();
    } }, 'Utiliser cette ville'),
    me.location.enabled ? h('button', { class: 'btn danger block', onclick: async () => {
      await run(() => api('DELETE', '/api/me/location'), 'Position effacée.');
      go('#/me');
    } }, 'Effacer ma position et retirer mon accord') : h('a', { class: 'btn primary block', href: isLive() ? '#/map' : '#/around' }, isLive() ? 'Activer sur la carte' : 'Activer dans Autour')));
}

export function adminHint() {
  mount(h('main', { class: 'screen' }, h('h1', null, 'Compte administrateur'),
    h('p', { class: 'lead' }, 'Le back office se trouve à une autre adresse.'),
    h('a', { class: 'btn primary block', href: '/admin' }, 'Ouvrir le back office'), h('button', { class: 'btn ghost', onclick: logout }, 'Se déconnecter')));
}

export { label };

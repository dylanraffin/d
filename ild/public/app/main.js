// Écrans principaux : Découvrir, profil, Autour (grille et carte), Ce soir, messages, albums reçus.
import { api, h, icon, toast, fmtDate, ago, fileToJpeg, raw } from '/shared/lib.js';
import { state, mount, go, run, refreshMe, onLeave, backBtn, photoEl, avatar, chips, select, sheet, nav, reportSheet, label, isLive, isWide, brand,
  personSummary, presenceText, statusLine, cruiseRows } from './ui.js';

const DURATION_LABEL = { '1h': '1 heure', '24h': '24 heures', '7d': '7 jours', forever: "Jusqu'à ce que je retire" };
const DISTANCES = { '': 'Toutes', 1: 'Moins de 1 km', 2: 'Moins de 2 km', 5: 'Moins de 5 km', 10: 'Moins de 10 km', 25: 'Moins de 25 km' };

export function filterQuery() {
  const f = state.filters;
  const p = new URLSearchParams();
  if (f.age_min) p.set('age_min', f.age_min);
  if (f.age_max) p.set('age_max', f.age_max);
  if (f.max_km) p.set('max_km', f.max_km);
  if (f.position?.length) p.set('position', f.position.join(','));
  if (f.seeking?.length) p.set('seeking', f.seeking.join(','));
  return p.toString();
}
const filterCount = () => ['age_min', 'age_max', 'max_km'].filter((k) => state.filters[k]).length + (state.filters.position?.length ? 1 : 0) + (state.filters.seeking?.length ? 1 : 0);

function filtersSheet(onApply) {
  const f = state.filters;
  sheet((close) => {
    const ageMin = h('input', { class: 'input', type: 'number', min: 18, max: 99, value: f.age_min || '', placeholder: '18', 'aria-label': 'Âge minimum' });
    const ageMax = h('input', { class: 'input', type: 'number', min: 18, max: 99, value: f.age_max || '', placeholder: '99', 'aria-label': 'Âge maximum' });
    const dist = select(DISTANCES, String(f.max_km || ''), { 'aria-label': 'Distance maximale' });
    const pos = chips(state.meta.positions, f.position, { ariaLabel: 'Position' });
    const seek = chips(state.meta.seeking, f.seeking, { ariaLabel: 'Cherche' });
    const locked = !state.me.entitlements.advanced_filters;
    return [
      h('h2', null, 'Filtres'),
      locked ? h('a', { class: 'notice', href: '#/plus' }, `Les filtres avancés font partie de ${brand().plus}.`) : null,
      h('span', { class: 'section-label' }, 'Âge'), h('div', { class: 'grid2' }, ageMin, ageMax),
      h('span', { class: 'section-label' }, 'Distance (si les deux personnes ont activé leur position)'), dist,
      h('span', { class: 'section-label' }, 'Position (seulement les profils qui l’affichent à tous)'), pos.el,
      h('span', { class: 'section-label' }, 'Cherche'), seek.el,
      h('button', { class: 'btn primary block', disabled: locked, onclick: () => {
        state.filters = { age_min: Number(ageMin.value) || null, age_max: Number(ageMax.value) || null, max_km: Number(dist.value) || null, position: pos.values(), seeking: seek.values() };
        close(); onApply();
      } }, 'Appliquer'),
      h('button', { class: 'btn ghost', onclick: () => { state.filters = {}; close(); onApply(); } }, 'Réinitialiser')
    ];
  });
}

export function filterButton(onApply) {
  const n = filterCount();
  return h('button', { class: 'icon-btn badge-host', 'aria-label': `Filtres${n ? ` (${n} actifs)` : ''}`, onclick: () => filtersSheet(onApply) },
    icon('filter'), n ? h('span', { class: 'badge-count' }, String(n)) : null);
}

// ---------- découvrir ----------
export async function screenDiscover() {
  const data = await api('GET', `/api/discover?mode=${state.mode}&${filterQuery()}`);
  let index = 0;
  let photoIndex = 0;
  const draw = () => {
    const p = data.profiles[index];
    const seg = h('div', { class: 'segmented', role: 'tablist' }, Object.entries(state.meta.modes).map(([k, v]) =>
      h('button', { class: state.mode === k ? 'on' : '', role: 'tab', 'aria-selected': String(state.mode === k), onclick: () => { state.mode = k; screenDiscover(); } }, v)));
    let card;
    if (!p) {
      card = h('div', { class: 'media deck empty-card' }, h('h2', null, 'Personne de nouveau pour le moment'),
        h('p', { class: 'small' }, filterCount() ? 'Élargis tes filtres ou change de mode.' : 'Reviens plus tard ou change de mode.'));
    } else {
      const photos = p.photos.length ? p.photos : [null];
      const i = Math.min(photoIndex, photos.length - 1);
      card = h('div', { class: 'media deck' },
        photos[i] ? h('img', { src: `/photos/${photos[i]}`, alt: `Photo de ${p.first_name}`, oncontextmenu: (e) => e.preventDefault() }) : h('div', { class: 'initial' }, p.first_name[0]),
        h('div', { class: 'bars' }, photos.map((_, k) => h('span', { class: k === i ? 'on' : '' }))),
        photos.length > 1 ? h('button', { class: 'tap-zone left', 'aria-label': 'Photo précédente', onclick: () => { photoIndex = Math.max(0, i - 1); draw(); } }) : null,
        photos.length > 1 ? h('button', { class: 'tap-zone right', 'aria-label': 'Photo suivante', onclick: () => { photoIndex = Math.min(photos.length - 1, i + 1); draw(); } }) : null,
        h('a', { class: 'overlay', href: `#/u/${p.id}` },
          p.music_title ? h('span', { class: 'pill' }, icon('music', 12), p.music_title) : null,
          h('span', { class: 'big' }, `${p.first_name}, ${p.age}`),
          h('span', { class: 'text2' }, [p.job, p.neighborhood, p.distance].filter(Boolean).join(' · ')),
          h('span', { class: 'row tags' },
            p.position ? h('span', { class: 'mini-chip' }, label('positions', p.position)) : null,
            p.seeking.slice(0, 2).map((s) => h('span', { class: 'mini-chip' }, label('seeking', s))),
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
      index += 1; photoIndex = 0; draw();
    };
    mount(h('main', { class: 'screen with-nav' },
      h('div', { class: 'row between head' }, h('h1', { class: 'title' }, 'Découvrir'),
        h('div', { class: 'row' }, h('a', { class: 'btn small', href: '#/likes' }, icon('heart', 16), "Likes"), filterButton(screenDiscover))),
      seg, card,
      p ? h('div', { class: 'row center-row' },
        h('button', { class: 'icon-btn big', 'aria-label': 'Passer', onclick: () => decide(-1) }, icon('close', 22)),
        h('button', { class: 'btn primary like-btn', onclick: () => decide(1) }, "J'aime")) : null,
      state.me.likes_left != null ? h('p', { class: 'small center' }, `${state.me.likes_left} like${state.me.likes_left > 1 ? 's' : ''} restant${state.me.likes_left > 1 ? 's' : ''} aujourd'hui`) : null),
    nav('discover'));
  };
  draw();
}

export async function screenLikes() {
  const data = await api('GET', '/api/likes/received');
  const body = data.premium_required
    ? h('div', { class: 'card pad stack center' }, h('span', { class: 'big' }, String(data.count)),
      h('p', { class: 'lead' }, data.count === 1 ? "personne t'a liké." : "personnes t'ont liké."),
      h('a', { class: 'btn primary block', href: '#/plus' }, `Voir qui avec ${brand().plus}`))
    : data.profiles.length
      ? h('div', { class: 'grid2' }, data.profiles.map((p) => h('a', { href: `#/u/${p.id}`, class: 'stack text small-gap' },
        photoEl(p.photos[0], p.first_name), h('span', { class: 'strong' }, `${p.first_name}, ${p.age}`))))
      : h('p', { class: 'empty' }, 'Personne pour le moment.');
  mount(h('main', { class: 'screen with-nav' }, h('div', { class: 'row' }, backBtn('#/discover'), h('h1', { class: 'title' }, "Qui m'a liké")), body), nav('discover'));
}

// ---------- profil ----------
export async function screenProfile(id) {
  const p = await api('GET', `/api/users/${id}`);
  const photos = p.photos.length ? p.photos : [null];
  let idx = 0;
  const imgBox = h('div', { class: 'media profile-media' });
  const drawPhoto = () => {
    imgBox.replaceChildren(...[
      photos[idx] ? h('img', { src: `/photos/${photos[idx]}`, alt: `Photo de ${p.first_name}`, oncontextmenu: (e) => e.preventDefault() }) : h('div', { class: 'initial' }, p.first_name[0]),
      h('div', { class: 'bars' }, photos.map((_, i) => h('span', { class: i === idx ? 'on' : '' }))),
      photos.length > 1 ? h('button', { class: 'tap-zone left', 'aria-label': 'Photo précédente', onclick: () => { idx = Math.max(0, idx - 1); drawPhoto(); } }) : null,
      photos.length > 1 ? h('button', { class: 'tap-zone right', 'aria-label': 'Photo suivante', onclick: () => { idx = Math.min(photos.length - 1, idx + 1); drawPhoto(); } }) : null,
      h('div', { class: 'overlay' },
        p.music_title ? h('span', { class: 'pill' }, icon('music', 12), p.music_title) : null,
        h('span', { class: 'big', style: { fontSize: '36px' } }, `${p.first_name}, ${p.age}`),
        h('span', { class: 'text2' }, [p.job, p.neighborhood, p.distance].filter(Boolean).join(' · ')))
    ].filter(Boolean));
  };
  drawPhoto();
  const more = () => sheet((close) => [
    h('h2', null, p.first_name),
    h('button', { class: 'btn block', onclick: async () => { await run(() => api('POST', '/api/blocks', { user_id: p.id, kind: 'hide' }), `Ton profil est masqué à ${p.first_name}.`); close(); go('#/discover'); } }, 'Masquer mon profil à cette personne'),
    h('button', { class: 'btn block', onclick: async () => { await run(() => api('POST', '/api/blocks', { user_id: p.id, kind: 'block' }), `${p.first_name} est bloqué.`); close(); go('#/discover'); } }, 'Bloquer'),
    h('button', { class: 'btn danger block', onclick: () => { close(); reportSheet('user', p.id, 'ce profil'); } }, 'Signaler'),
    h('button', { class: 'btn ghost', onclick: close }, 'Annuler')]);
  let favorite = p.favorite;
  const fav = h('button', { class: 'icon-btn', onclick: async () => {
    await run(() => api(favorite ? 'DELETE' : 'PUT', `/api/favorites/${p.id}`), favorite ? 'Retiré des favoris.' : 'Ajouté aux favoris. Il ne le sait pas.');
    favorite = !favorite; drawFav();
  } }, icon('star', 18));
  const drawFav = () => {
    fav.classList.toggle('on', favorite);
    fav.setAttribute('aria-pressed', String(favorite));
    fav.setAttribute('aria-label', favorite ? 'Retirer des favoris' : 'Ajouter aux favoris');
  };
  drawFav();
  const summary = personSummary(p);
  let albums = null;
  if (p.albums.shared.length) {
    albums = h('div', { class: 'list' }, p.albums.shared.map((s) => h('a', { href: `#/shared/${s.share_id}`, class: 'text' },
      icon('lock', 18, '#2997ff'), h('span', { class: 'grow' }, `${s.name} · ${s.count} photo${s.count > 1 ? 's' : ''}`),
      h('span', { class: 'small' }, s.expires_at ? `jusqu'au ${fmtDate(s.expires_at)}` : ''), icon('chevron', 16, '#86868b'))));
  } else if (p.albums.count) {
    albums = h('div', { class: 'card bordered row pad' }, icon('lock', 20, '#2997ff'),
      h('div', { class: 'grow stack small-gap' }, h('span', { class: 'strong' }, `${p.albums.count} album${p.albums.count > 1 ? 's' : ''} privé${p.albums.count > 1 ? 's' : ''}`),
        h('span', { class: 'small' }, p.albums.requested ? 'Demande envoyée' : `${p.first_name} choisit ce qu'il t'envoie.`)),
      p.albums.requested ? null : h('button', { class: 'btn ghost small', onclick: async () => { await run(() => api('POST', `/api/albums/${p.id}/request`, {}), 'Demande envoyée.'); screenProfile(id); } }, 'Demander'));
  }
  const section = (title, items, group) => items.length ? [h('span', { class: 'section-label' }, title), h('div', { class: 'row wrap' }, items.map((t) => h('span', { class: 'chip' }, group ? label(group, t) : t)))] : null;
  mount(h('main', { class: 'screen profile-screen' },
    h('div', { class: 'row between' }, backBtn(isLive() ? '#/map' : '#/discover'),
      h('div', { class: 'row' }, isLive() ? fav : null, h('button', { class: 'icon-btn', 'aria-label': "Plus d'options : masquer, bloquer, signaler", onclick: more }, icon('more')))),
    imgBox,
    isLive() ? statusLine(p) : null,
    p.presence ? h('div', { class: 'notice live-presence' }, h('span', { class: 'live-dot', 'aria-hidden': 'true' }), h('span', { class: 'grow' }, presenceText(p.presence))) : null,
    summary ? h('p', { class: 'lead text' }, summary) : null,
    p.vouched_by.length ? h('p', { class: 'small text2' }, h('span', { class: 'tag-blue' }, 'Parrainé'), ` par ${p.vouched_by.join(', ')}`) : null,
    p.travel ? h('p', { class: 'small tag-yellow' }, `De passage à ${p.travel.city} du ${fmtDate(Date.parse(p.travel.from), false)} au ${fmtDate(Date.parse(p.travel.to), false)}`) : null,
    p.bio ? h('p', { class: 'lead' }, raw(p.bio)) : null,
    p.prompt_answer ? h('div', { class: 'card pad stack small-gap' }, h('span', { class: 'small' }, 'Un dimanche parfait…'), h('span', null, raw(p.prompt_answer))) : null,
    isLive() ? cruiseRows(p) : null,
    p.position && !isLive() ? [h('span', { class: 'section-label' }, 'Position'), h('div', { class: 'row' }, h('span', { class: 'chip' }, label('positions', p.position)))] : null,
    section('Cherche', p.seeking, 'seeking'),
    section('Aime', [...p.tastes, ...p.interests]),
    section('Côté intime', p.intimate),
    albums,
    h('div', { class: 'row' },
      isLive() ? h('button', { class: 'btn primary grow', onclick: async () => {
        const r = await run(() => api('POST', '/api/conversations', { user_id: p.id }));
        go(`#/chat/${r.id}`);
      } }, 'Écrire') : p.matched ? h('button', { class: 'btn primary grow', onclick: async () => {
        const m = (await api('GET', '/api/matches')).matches.find((x) => x.user.id === p.id);
        if (m) go(`#/chat/${m.id}`);
      } }, 'Message') : h('button', { class: 'btn primary grow', onclick: async () => {
        const r = await run(() => api('POST', '/api/likes', { to_id: p.id, value: 1 }));
        toast(r.match ? `C'est un match avec ${p.first_name} !` : 'Like envoyé.');
        if (r.match) go(`#/chat/${r.match}`);
      } }, "J'aime"))));
  if (isLive()) imgBox.classList.add('live-profile');
}

// ---------- albums reçus ----------
export async function screenSharedAlbum(shareId) {
  const a = await api('GET', `/api/albums/shared/${shareId}`);
  let blurOn = a.blur;
  const grid = h('div', { class: 'grid3' });
  const draw = () => grid.replaceChildren(...a.photos.map((pid) => {
    const tile = h('button', { class: `album-tile${blurOn ? ' blur' : ''}`, 'aria-label': blurOn ? 'Photo floutée, toucher pour voir' : 'Photo' },
      h('img', { src: `/photos/${pid}`, alt: '', oncontextmenu: (e) => e.preventDefault() }),
      blurOn ? h('span', { class: 'hint' }, icon('eyeoff', 20), 'Toucher pour voir') : null);
    tile.addEventListener('click', () => { tile.classList.remove('blur'); tile.querySelector('.hint')?.remove(); });
    tile.addEventListener('contextmenu', (e) => { e.preventDefault(); reportSheet('photo', pid, 'cette photo'); });
    return tile;
  }));
  draw();
  mount(h('main', { class: 'screen' },
    h('div', { class: 'row' }, backBtn('#/messages'), h('h1', { class: 'title grow' }, a.name), h('span', { class: 'chip' }, '18+')),
    h('p', { class: 'small' }, `Envoyé par ${a.owner.first_name}`),
    h('div', { class: 'notice' }, icon('clock', 18, '#2997ff'), a.expires_at ? `Accès jusqu'au ${fmtDate(a.expires_at)}. ${a.owner.first_name} peut le retirer à tout moment.` : `${a.owner.first_name} peut retirer l'accès à tout moment.`),
    a.photos.length ? grid : h('p', { class: 'empty' }, 'Cet album est vide pour le moment.'),
    h('div', { class: 'list' }, h('label', null, h('span', { class: 'grow' }, 'Flouter les photos explicites'),
      h('input', { type: 'checkbox', checked: blurOn, onchange: (e) => { blurOn = e.target.checked; draw(); } }))),
    h('p', { class: 'small' }, "Appui long sur une photo pour la signaler. Partager une photo d'album en dehors du service entraîne un bannissement."),
    h('p', { class: 'small' }, "Sur le web, les captures d'écran ne peuvent pas être bloquées techniquement : elles le seront dans l'app mobile.")));
}

// ---------- autour de moi ----------
function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Géolocalisation indisponible sur cet appareil.')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error('Position refusée. Tu peux choisir ton quartier à la place.')),
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 });
  });
}

function locationConsent() {
  const hood = select(Object.fromEntries([['', 'Choisir mon quartier…'], ...state.meta.neighborhoods.map((n) => [n, n])]), '', { 'aria-label': 'Quartier' });
  return h('div', { class: 'card pad stack' },
    h('h2', null, 'Voir qui est autour de toi'),
    h('p', { class: 'small text2' }, "Ta position est arrondie à environ 500 m avant d'être enregistrée. Les autres ne voient qu'une tranche de distance (« 1 à 2 km »), jamais ta position. Tu peux l'effacer à tout moment."),
    h('button', { class: 'btn primary block', onclick: async () => {
      try {
        const pos = await locate();
        await run(() => api('PUT', '/api/me/location', { ...pos, consent: true }), 'Position activée.');
        await refreshMe(); screenAround();
      } catch (e) { if (!e.handled) toast(e.message, true); }
    } }, 'Utiliser ma position'),
    h('span', { class: 'small center' }, 'ou'),
    hood,
    h('button', { class: 'btn block', onclick: async () => {
      if (!hood.value) { toast('Choisis un quartier.', true); return; }
      await run(() => api('PUT', '/api/me/location', { neighborhood: hood.value, consent: true }), 'Quartier enregistré.');
      await refreshMe(); screenAround();
    } }, 'Utiliser ce quartier'));
}

function personCell(x) {
  return h('a', { href: `#/u/${x.id}`, class: 'cell' },
    photoEl(x.photo, x.first_name),
    x.online_recently ? h('span', { class: 'online', 'aria-label': 'Actif récemment' }) : null,
    h('span', { class: 'cell-name' }, `${x.first_name}, ${x.age}`),
    h('span', { class: 'cell-meta' }, x.distance || ''));
}

export async function screenAround() {
  const me = state.me;
  const seg = h('div', { class: 'segmented', role: 'tablist' }, [['grid', 'Grille'], ['map', 'Carte']].map(([k, v]) =>
    h('button', { class: state.aroundView === k ? 'on' : '', role: 'tab', 'aria-selected': String(state.aroundView === k), onclick: () => { state.aroundView = k; screenAround(); } }, v)));
  const head = h('div', { class: 'row between head' }, h('h1', { class: 'title' }, 'Autour'),
    h('div', { class: 'row' }, me.location.enabled ? h('a', { class: 'icon-btn', href: '#/me/location', 'aria-label': 'Ma position' }, icon('shield', 18)) : null,
      state.aroundView === 'grid' ? filterButton(screenAround) : null));

  if (!me.location.enabled) {
    mount(h('main', { class: 'screen with-nav' }, head, locationConsent()), nav('around'));
    return;
  }
  // Rafraîchit la position GPS (le serveur ignore les mises à jour trop rapprochées).
  if (me.location.source === 'gps') locate().then((pos) => api('PUT', '/api/me/location', pos)).catch(() => {});

  if (state.aroundView === 'grid') {
    const d = await api('GET', `/api/nearby?${filterQuery()}`);
    mount(h('main', { class: 'screen with-nav' }, head, seg,
      me.hide_from_map ? h('a', { class: 'notice', href: '#/me' }, "Tu n'apparais pas dans Autour (réglage dans Moi).") : null,
      d.people.length ? h('div', { class: 'grid3 cells' }, d.people.map(personCell)) : h('p', { class: 'empty' }, 'Personne autour de toi pour le moment.'),
      h('p', { class: 'small center' }, 'Classés par tranche de distance. Positions arrondies, jamais exactes.')),
    nav('around'));
    return;
  }

  const d = await api('GET', '/api/map');
  const mapBox = h('div', { class: 'leaflet-box', role: 'region', 'aria-label': 'Carte des membres par zone' });
  mount(h('main', { class: 'screen with-nav' }, head, seg, mapBox,
    h('p', { class: 'small' }, `Chaque cercle regroupe au moins ${d.min_cluster} membres : personne n'est localisable individuellement.${d.hidden ? ` ${d.hidden} membre${d.hidden > 1 ? 's' : ''} dans des zones trop peu peuplées ne ${d.hidden > 1 ? 'sont' : 'est'} pas affiché${d.hidden > 1 ? 's' : ''}.` : ''}`)),
  nav('around'));
  if (!window.L) { mapBox.append(h('p', { class: 'empty' }, 'Carte indisponible.')); return; }
  const L = window.L;
  const center = d.me ? [d.me.lat, d.me.lng] : [48.8566, 2.3522];
  const map = L.map(mapBox, { zoomControl: true, attributionControl: true }).setView(center, 13);
  onLeave(() => map.remove());
  L.tileLayer(state.meta.map.url, { maxZoom: 16, minZoom: 9, attribution: state.meta.map.attribution }).addTo(map);
  if (d.me) L.circleMarker(center, { radius: 7, color: '#f5f5f7', weight: 3, fillColor: '#0071e3', fillOpacity: 1 }).addTo(map).bindTooltip('Toi (position arrondie)');
  for (const z of d.zones) {
    L.circle([z.lat, z.lng], { radius: z.size_km * 450, color: '#2997ff', weight: 1, fillColor: '#2997ff', fillOpacity: 0.16 }).addTo(map);
    const el = h('button', { class: 'zone-count', 'aria-label': `${z.count} membres dans cette zone` }, String(z.count));
    const marker = L.marker([z.lat, z.lng], { icon: L.divIcon({ html: el, className: 'zone-icon', iconSize: [44, 44] }), keyboard: true }).addTo(map);
    marker.on('click', () => sheet((close) => [
      h('h2', null, `${z.count} membres dans cette zone`),
      h('p', { class: 'small' }, `Zone d'environ ${z.size_km} km.`),
      h('div', { class: 'grid3 cells' }, z.people.map((x) => { const c = personCell(x); c.addEventListener('click', close); return c; })),
      h('button', { class: 'btn ghost', onclick: close }, 'Fermer')]));
  }
  setTimeout(() => map.invalidateSize(), 50);
}

// ---------- ce soir ----------
export async function screenTonight() {
  const d = await api('GET', '/api/feed');
  const compose = () => sheet((close) => {
    const text = h('textarea', { class: 'input', maxlength: 1000, placeholder: 'Tu sors où ce soir ?', 'aria-label': 'Texte' });
    const vis = select({ members: 'Tous les membres', matches: 'Mes matchs uniquement' }, 'members', { 'aria-label': 'Visible par' });
    return [h('h2', null, 'Publier'), text, vis,
      h('p', { class: 'small' }, "Pas de nudité dans « Ce soir ». Ne montre personne sans son accord."),
      h('button', { class: 'btn primary block', onclick: async () => { await run(() => api('POST', '/api/posts', { body: text.value, visibility: vis.value }), 'Publié.'); close(); screenTonight(); } }, 'Publier'),
      h('button', { class: 'btn ghost', onclick: close }, 'Annuler')];
  });
  const card = (p) => {
    const going = h('button', { class: p.i_go ? 'btn small' : 'btn light small', onclick: async () => { await run(() => api('POST', `/api/posts/${p.id}/rsvp`, {})); screenTonight(); } }, p.i_go ? "Je n'y vais plus" : "J'y vais");
    if (p.kind === 'event') {
      return h('article', { class: 'card bordered event-card' },
        h('div', { class: 'event-cover' }, h('span', { class: 'chip dark' }, `Événement · ${fmtDate(p.starts_at)}`)),
        h('div', { class: 'stack pad' }, h('h2', null, p.title), h('p', { class: 'small text2' }, p.body),
          h('div', { class: 'row between' }, h('span', { class: 'small' }, `${p.going} membre${p.going > 1 ? 's' : ''} y vont`), going)));
    }
    return h('article', { class: 'card bordered stack pad post-card' },
      h('div', { class: 'row' }, avatar(null, p.author.first_name),
        h('a', { class: 'grow stack text', style: { gap: '0' }, href: p.mine ? '#/me' : `#/u/${p.author.id}` }, h('span', { class: 'strong' }, p.mine ? 'Toi' : p.author.first_name), h('span', { class: 'small' }, ago(p.created_at))),
        h('span', { class: 'chip tiny' }, p.visibility === 'matches' ? 'Matchs uniquement' : 'Membres')),
      h('p', { class: 'body-text' }, p.body),
      h('div', { class: 'row between' }, h('span', { class: 'small' }, `${p.going} y vont`),
        h('div', { class: 'row' }, going, p.mine
          ? h('button', { class: 'btn ghost small', onclick: async () => { await run(() => api('DELETE', `/api/posts/${p.id}`), 'Supprimé.'); screenTonight(); } }, 'Supprimer')
          : h('button', { class: 'icon-btn', 'aria-label': 'Signaler cette publication', onclick: () => reportSheet('post', p.id, 'cette publication') }, icon('flag', 16)))));
  };
  mount(h('main', { class: 'screen with-nav' },
    h('div', { class: 'row between head' },
      h('div', { class: 'stack', style: { gap: '0' } }, h('span', { class: 'small' }, `${new Date().toLocaleDateString('fr-FR', { weekday: 'long' })} · ${state.me.city}`), h('h1', { class: 'title' }, 'Ce soir')),
      h('button', { class: 'btn primary small', onclick: compose }, icon('plus', 15), 'Publier')),
    d.posts.length ? d.posts.map(card) : h('p', { class: 'empty' }, 'Rien pour ce soir. Lance quelque chose !')),
  nav('tonight'));
}

// ---------- messages ----------
// Liste des conversations : seule sur téléphone, colonne de gauche sur grand écran.
async function conversationAside(activeId) {
  const [d, received, plans] = await Promise.all([api('GET', '/api/matches'), api('GET', '/api/albums/received'),
    isLive() ? api('GET', '/api/plans/mine') : { plans: [] }]);
  return h('div', { class: 'msg-aside' },
    h('h1', { class: 'title' }, 'Messages'),
    plans.plans.length ? [h('span', { class: 'section-label' }, 'Plans à plusieurs'),
      h('div', { class: 'list' }, plans.plans.map((p) => h('a', { href: p.my_status === 'requested' ? '#/map' : `#/plan/${p.id}`, class: 'text tall' }, icon('group', 20, '#ff9f0a'),
        h('div', { class: 'grow stack small-gap ellipsis-box' }, h('span', { class: 'strong ellipsis' }, raw(p.title)),
          h('span', { class: 'small ellipsis' }, p.my_status === 'host' ? (p.pending ? `${p.pending} demande${p.pending > 1 ? 's' : ''} en attente` : 'Tu es l’hôte') : p.my_status === 'requested' ? 'Demande envoyée' : `Hôte : ${p.host.first_name}`)),
        p.my_status === 'host' && p.pending ? h('span', { class: 'unread-dot', 'aria-label': 'Demandes en attente' }) : null)))] : null,
    received.shares.length ? [h('span', { class: 'section-label' }, 'Albums reçus'),
      h('div', { class: 'list' }, received.shares.map((s) => h('a', { href: `#/shared/${s.share_id}`, class: 'text' }, icon('lock', 18, '#2997ff'),
        h('span', { class: 'grow' }, `${s.name} · ${s.owner.first_name}`), h('span', { class: 'small' }, s.expires_at ? `jusqu'au ${fmtDate(s.expires_at)}` : ''))))] : null,
    d.matches.length ? h('div', { class: 'list' }, d.matches.map((m) => h('a', { href: `#/chat/${m.id}`, class: 'text tall', 'aria-current': String(m.id) === String(activeId) ? 'page' : null,
      style: String(m.id) === String(activeId) ? { background: '#2c2c2e' } : null },
      avatar(m.user.photo, m.user.first_name),
      h('div', { class: 'grow stack small-gap ellipsis-box' }, h('span', { class: 'strong' }, m.user.first_name),
        m.last ? h('span', { class: 'small ellipsis' }, m.last.mine ? 'Toi : ' : null, ['Photo', 'Photo retirée', 'Message retiré par la modération'].includes(m.last.body) ? m.last.body : raw(m.last.body))
          : h('span', { class: 'small ellipsis' }, isLive() ? 'Nouvelle conversation' : 'Nouveau match : dis bonjour')),
      m.unread ? h('span', { class: 'unread-dot', 'aria-label': 'Non lu' }) : h('span', { class: 'small' }, ago(m.last?.created_at || m.created_at)))))
      : h('p', { class: 'empty' }, isLive() ? 'Pas encore de conversation. Écris à quelqu’un depuis la carte.' : 'Pas encore de match. Va dans Découvrir.'));
}

export async function screenMessages() {
  const aside = await conversationAside(null);
  mount(h('main', { class: 'screen with-nav msg-layout' }, aside,
    h('div', { class: 'msg-pane-empty empty-card muted' }, icon('chat', 28), h('span', null, 'Choisis une conversation.'))),
  nav('messages'));
}

function albumBubble(m, matchId) {
  const a = m.album;
  const STATE = { active: null, expired: 'Accès expiré', revoked: 'Accès retiré', deleted: 'Album supprimé', unavailable: 'Indisponible' };
  return h('div', { class: `album-bubble${m.mine ? ' mine' : ''}` },
    h('div', { class: 'row' }, icon('lock', 18, m.mine ? '#fff' : '#2997ff'),
      h('div', { class: 'grow stack small-gap' }, h('span', { class: 'strong' }, `Album « ${a.name} »`),
        h('span', { class: 'small inherit' }, STATE[a.state] || `${a.count} photo${a.count > 1 ? 's' : ''}${a.expires_at ? ` · jusqu'au ${fmtDate(a.expires_at)}` : ''}`))),
    a.state === 'active' ? (m.mine
      ? h('button', { class: 'btn small on-blue', onclick: async () => { await run(() => api('DELETE', `/api/me/albums/shares/${a.share_id}`), 'Accès retiré.'); screenChat(matchId); } }, "Retirer l'accès")
      : h('a', { class: 'btn small light', href: `#/shared/${a.share_id}` }, 'Ouvrir')) : null);
}

// Photo envoyée dans le chat. Reçue : floutée si le membre le souhaite, un geste pour la voir, appui long pour signaler.
function photoBubble(m, matchId) {
  if (!m.photo_id) return h('div', { class: `bubble removed${m.mine ? ' mine' : ''}` }, 'Photo retirée');
  const blurred = !m.mine && state.me.blur_explicit;
  const el = h('button', { type: 'button', class: `photo-bubble${m.mine ? ' mine' : ''}${blurred ? ' blur' : ''}`, 'aria-label': blurred ? 'Photo floutée, toucher pour voir' : 'Photo' },
    h('img', { src: `/photos/${m.photo_id}`, alt: '', loading: 'lazy', oncontextmenu: (e) => e.preventDefault() }),
    blurred ? h('span', { class: 'hint' }, icon('eyeoff', 20), 'Toucher pour voir') : null,
    m.mine ? h('span', { class: 'remove', role: 'button', tabindex: 0, onclick: async (e) => {
      e.stopPropagation();
      await run(() => api('DELETE', `/api/matches/${matchId}/photos/${m.photo_id}`), 'Photo retirée.');
      screenChat(matchId);
    } }, 'Retirer') : null);
  el.addEventListener('click', () => { el.classList.remove('blur'); el.querySelector('.hint')?.remove(); });
  if (!m.mine) el.addEventListener('contextmenu', (e) => { e.preventDefault(); reportSheet('photo', m.photo_id, 'cette photo'); });
  return el;
}

function sendAlbumSheet(other, matchId) {
  sheet((close) => {
    const box = h('div', { class: 'stack' }, h('p', { class: 'small' }, 'Chargement…'));
    api('GET', '/api/me/albums').then(({ albums }) => {
      if (!albums.length) {
        box.replaceChildren(h('p', { class: 'small' }, "Tu n'as pas encore d'album."), h('a', { class: 'btn primary block', href: '#/me/albums', onclick: close }, 'Créer un album'));
        return;
      }
      const pick = chips(Object.fromEntries(albums.map((a) => [String(a.id), `${a.name} (${a.photos.length})`])), [String(albums[0].id)], { single: true, ariaLabel: 'Album' });
      const dur = chips(DURATION_LABEL, ['24h'], { single: true, ariaLabel: 'Durée' });
      box.replaceChildren(h('span', { class: 'section-label' }, 'Quel album ?'), pick.el, h('span', { class: 'section-label' }, 'Pendant combien de temps ?'), dur.el,
        h('p', { class: 'small' }, `Tu pourras retirer l'accès à tout moment. ${other.first_name} ne peut pas réenvoyer l'album à quelqu'un d'autre.`),
        h('button', { class: 'btn primary block', onclick: async () => {
          if (!pick.value() || !dur.value()) { toast('Choisis un album et une durée.', true); return; }
          await run(() => api('POST', `/api/me/albums/${pick.value()}/share`, { user_id: other.id, duration: dur.value() }), `Album envoyé à ${other.first_name}.`);
          close(); screenChat(matchId);
        } }, 'Envoyer'));
    });
    return [h('h2', null, `Envoyer un album à ${other.first_name}`), box, h('button', { class: 'btn ghost', onclick: close }, 'Annuler')];
  });
}

const QUICK = ['Salut', 'Dispo ?', 'Tu reçois ?', 'Je peux me déplacer', 'Photo ?', 'Tu es vers où ?'];

export async function screenChat(matchId) {
  const [first, aside] = await Promise.all([api('GET', `/api/matches/${matchId}/messages`), isWide() ? conversationAside(matchId) : null]);
  const other = first.user;
  let lastId = 0;
  let lastMine = null;
  let canSendPhoto = first.can_send_photo;
  const box = h('div', { class: 'bubbles', 'aria-live': 'polite' });
  const seen = h('span', { class: 'seen' }, 'Vu');
  const showSeen = (readAt) => {
    seen.remove();
    if (lastMine && lastMine.id === lastId && readAt && readAt >= lastMine.created_at) box.appendChild(seen);
  };
  const add = (list) => {
    for (const m of list) {
      lastId = Math.max(lastId, m.id);
      if (m.mine) lastMine = m;
      let el;
      if (m.removed) el = h('div', { class: 'bubble removed' }, 'Message retiré par la modération');
      else if (m.kind === 'album') el = albumBubble(m, matchId);
      else if (m.kind === 'photo') el = photoBubble(m, matchId);
      else {
        el = h('div', { class: `bubble${m.mine ? ' mine' : ''}`, title: fmtDate(m.created_at) }, raw(m.body));
        if (!m.mine) el.addEventListener('contextmenu', (e) => { e.preventDefault(); reportSheet('message', m.id, 'ce message'); });
      }
      box.appendChild(el);
    }
    if (list.length) box.scrollTop = box.scrollHeight;
  };
  add(first.messages);
  showSeen(first.other_read_at);
  const refresh = async () => {
    const d = await api('GET', `/api/matches/${matchId}/messages?after=${lastId}`);
    canSendPhoto = d.can_send_photo;
    seen.remove();
    add(d.messages);
    showSeen(d.other_read_at);
  };
  const input = h('input', { placeholder: `Message à ${other.first_name}`, maxlength: 2000, 'aria-label': 'Message' });
  const send = async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    await run(() => api('POST', `/api/matches/${matchId}/messages`, { body }));
    await refresh();
  };
  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', 'aria-label': 'Choisir une photo', onchange: async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    await run(async () => api('POST', `/api/matches/${matchId}/photos`, { data: await fileToJpeg(file) }));
    await refresh();
  } });
  const pickPhoto = () => {
    if (!canSendPhoto) { toast(`Tu pourras envoyer des photos dès la première réponse de ${other.first_name}.`, true); return; }
    fileInput.click();
  };
  const reportConv = () => {
    const theirs = [...first.messages].reverse().find((m) => !m.mine && m.kind === 'text');
    if (theirs) reportSheet('message', theirs.id, 'cette conversation');
    else reportSheet('user', other.id, 'ce profil');
  };
  mount(h('main', { class: 'screen chat-screen msg-layout' },
    aside,
    h('div', { class: 'chat-pane' },
      h('div', { class: 'row chat-head' },
        h('span', { class: 'only-narrow' }, backBtn('#/messages')), avatar(other.photos[0], other.first_name),
        h('a', { class: 'grow stack text', style: { gap: '0' }, href: `#/u/${other.id}` }, h('span', { class: 'strong' }, other.first_name),
          h('span', { class: 'small' }, [other.online === 'now' ? 'En ligne' : null, other.distance, other.vouched_by.length ? 'Parrainé' : other.neighborhood].filter(Boolean).join(' · '))),
        h('button', { class: 'btn small', onclick: reportConv }, 'Signaler')),
      box,
      h('p', { class: 'small center' }, 'Appui long ou clic droit sur un message ou une photo pour le signaler. Le signalement garde une copie sécurisée : pas besoin de captures.'),
      isLive() ? h('div', { class: 'quick', role: 'group', 'aria-label': 'Réponses rapides' }, QUICK.map((t) => h('button', { type: 'button', onclick: () => { input.value = t; input.focus(); } }, t))) : null,
      h('form', { class: 'composer', onsubmit: send },
        fileInput,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Envoyer une photo', title: 'Envoyer une photo', onclick: pickPhoto }, icon('camera')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Envoyer un album privé', title: 'Envoyer un album privé', onclick: () => sendAlbumSheet(other, matchId) }, icon('lock')),
        input, h('button', { class: 'icon-btn send', 'aria-label': 'Envoyer', type: 'submit' }, icon('send'))))));
  input.focus();
  const timer = setInterval(async () => { try { await refresh(); } catch { /* réseau */ } }, 4000);
  onLeave(() => clearInterval(timer));
}

// Édition « carte en direct » : qui est dispo autour de toi, maintenant.
import { api, h, icon, toast, fmtDate } from '/shared/lib.js';
import { state, mount, go, run, refreshMe, runCleanup, onLeave, sheet, chips, select, nav, reportSheet, setNav, label, brand, legalLinks } from '/app/ui.js';
import { screenLogin, screenSignup, screenVerify, screenNotices, screenConsentUpdate } from '/app/onboarding.js';
import { screenProfile, screenSharedAlbum, screenMessages, screenChat, filterQuery, filterButton } from '/app/main.js';
import { screenMe, screenEditProfile, screenMyAlbums, screenAlbumDetail, screenPlus, screenLocation, adminHint } from '/app/me.js';

setNav([
  ['map', '#/map', 'map', 'Carte'],
  ['list', '#/list', 'card', 'Liste'],
  ['messages', '#/messages', 'chat', 'Messages'],
  ['me', '#/me', 'user', 'Moi']
]);
window.addEventListener('unhandledrejection', (e) => { if (e.reason?.handled) e.preventDefault(); });

const DURATIONS = { 30: '30 min', 60: '1 h', 120: '2 h', 240: '4 h' };
const live = { onlyAvailable: false, view: null };

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } }
};

// ---------- accueil ----------
function screenWelcome() {
  mount(h('main', { class: 'screen live-welcome' },
    h('div', { class: 'live-hero', 'aria-hidden': 'true' },
      [[22, 30, 1], [48, 62, 0], [70, 28, 1], [36, 80, 0], [62, 50, 1], [80, 72, 0]].map(([t, l, on]) =>
        h('span', { class: `hero-dot${on ? ' on' : ''}`, style: { top: `${t}%`, left: `${l}%` } }))),
    h('div', { class: 'stack', style: { padding: '0 4px' } },
      h('span', { class: 'muted brand' }, brand().name.toUpperCase()),
      h('h1', { class: 'big' }, 'Qui est dispo', h('br'), 'autour de toi,', h('br'), 'maintenant.'),
      h('p', { class: 'lead' }, 'La carte des rencontres entre mecs. Ta position reste approximative, toujours.')),
    h('a', { class: 'btn primary block', href: '#/apply' }, 'Créer mon profil'),
    h('a', { class: 'btn block', href: '#/login' }, 'Se connecter'),
    h('p', { class: 'small center' }, '18 ans et plus · Âge vérifié · Position jamais exacte'),
    legalLinks()));
}

// ---------- conseils de sécurité ----------
function safetySheet() {
  sheet((close) => [
    h('h2', null, 'Avant de te déplacer'),
    h('ul', { class: 'tips' },
      h('li', null, "Premier rendez-vous dans un lieu public quand c'est possible."),
      h('li', null, "Préviens un proche : où tu vas, avec qui, jusqu'à quand."),
      h('li', null, "Méfie-toi d'un profil récent, sans photo, pressé de te faire venir dans un lieu isolé : c'est le schéma des guet-apens."),
      h('li', null, "Tu peux bloquer et signaler à tout moment ; un signalement garde une copie de la conversation."),
      h('li', null, 'Drogues : informe-toi sur drogues-info-service.fr. Danger immédiat : 17 ou 112.')),
    h('button', { class: 'btn primary block', onclick: () => { storage.set('live-safety-seen', '1'); close(); } }, 'Compris')
  ]);
}

// ---------- présence ----------
function presenceSheet(after) {
  const me = state.me;
  sheet((close) => {
    const dur = chips(DURATIONS, ['60'], { single: true, ariaLabel: 'Durée' });
    const place = chips(state.meta.presence_places, me.presence?.place ? [me.presence.place] : [], { single: true, ariaLabel: 'Comment' });
    const note = h('input', { class: 'input', maxlength: 80, placeholder: 'Un mot (facultatif) : « Verre au Marais ? »', value: me.presence?.note || '', 'aria-label': 'Message' });
    return [
      h('h2', null, me.presence ? `Dispo jusqu'à ${fmtDate(me.presence.until)}` : 'Je suis dispo'),
      h('span', { class: 'section-label' }, 'Pendant'), dur.el,
      h('span', { class: 'section-label' }, 'Comment'), place.el,
      note,
      h('p', { class: 'small' }, 'Ton point s’allume sur la carte et tu apparais en premier dans la liste. Ça s’éteint tout seul.'),
      h('button', { class: 'btn primary block', onclick: async () => {
        await run(() => api('PUT', '/api/me/presence', { minutes: Number(dur.value() || 60), place: place.value(), note: note.value }), 'Tu es dispo.');
        await refreshMe(); close(); after?.();
      } }, me.presence ? 'Mettre à jour' : 'Je suis dispo'),
      me.presence ? h('button', { class: 'btn block', onclick: async () => {
        await run(() => api('DELETE', '/api/me/presence'), "Tu n'es plus dispo.");
        await refreshMe(); close(); after?.();
      } }, "Je ne suis plus dispo") : null,
      h('button', { class: 'btn ghost', onclick: close }, 'Fermer')
    ];
  });
}

function presenceButton(after) {
  const p = state.me.presence;
  return h('button', { class: `presence-btn${p ? ' on' : ''}`, onclick: () => presenceSheet(after) },
    h('span', { class: 'live-dot', 'aria-hidden': 'true' }), p ? `Dispo · ${fmtDate(p.until).split(' ').pop()}` : 'Je suis dispo');
}

// ---------- fiche d'une personne ----------
function personSheet(x) {
  sheet((close) => [
    h('div', { class: 'row' },
      h('span', { class: 'avatar xl' }, x.photo ? h('img', { src: `/photos/${x.photo}`, alt: '' }) : x.first_name[0]),
      h('div', { class: 'grow stack small-gap' }, h('span', { class: 'strong', style: { fontSize: '20px' } }, `${x.first_name}, ${x.age}`),
        h('span', { class: 'small' }, [x.distance, x.position ? label('positions', x.position) : null].filter(Boolean).join(' · ')))),
    x.presence ? h('div', { class: 'notice live-presence' }, h('span', { class: 'live-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'grow' }, `Dispo jusqu'à ${fmtDate(x.presence.until).split(' ').pop()}${x.presence.place ? ` · ${label('presence_places', x.presence.place)}` : ''}${x.presence.note ? ` · « ${x.presence.note} »` : ''}`)) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary grow', onclick: async () => {
        const r = await run(() => api('POST', '/api/conversations', { user_id: x.id }));
        close(); go(`#/chat/${r.id}`);
      } }, 'Écrire'),
      h('a', { class: 'btn grow', href: `#/u/${x.id}`, onclick: close }, 'Voir le profil')),
    h('button', { class: 'btn danger', onclick: () => { close(); reportSheet('user', x.id, 'ce profil'); } }, 'Signaler')
  ]);
}

function spotSheet(s, after) {
  sheet((close) => [
    h('span', { class: 'chip' }, label('spot_categories', s.category)),
    h('h2', null, s.name),
    s.description ? h('p', { class: 'small text2' }, s.description) : null,
    h('p', { class: 'small' }, s.here ? `${s.here} membre${s.here > 1 ? 's' : ''} ${s.here > 1 ? 'ont' : 'a'} signalé être ici. Seul le nombre est affiché.` : "Personne n'a signalé être ici pour le moment."),
    s.i_am_here
      ? h('button', { class: 'btn block', onclick: async () => { await run(() => api('DELETE', `/api/spots/${s.id}/checkin`), 'C’est noté.'); close(); after(); } }, 'Je suis parti')
      : h('button', { class: 'btn primary block', onclick: async () => { await run(() => api('POST', `/api/spots/${s.id}/checkin`), 'Signalé pour 2 heures.'); close(); after(); } }, "J'y suis (2 h)"),
    h('button', { class: 'btn ghost', onclick: close }, 'Fermer')
  ]);
}

function proposeSpotSheet(center) {
  sheet((close) => {
    const name = h('input', { class: 'input', maxlength: 80, placeholder: 'Nom du lieu', 'aria-label': 'Nom du lieu' });
    const cat = select(state.meta.spot_categories, 'bar', { 'aria-label': 'Catégorie' });
    const desc = h('textarea', { class: 'input', maxlength: 300, placeholder: 'Ce qu’il faut savoir (facultatif)', 'aria-label': 'Description' });
    return [
      h('h2', null, 'Proposer un lieu'),
      h('p', { class: 'small' }, "Établissements et événements seulement : bars, clubs, saunas, cafés, soirées. Le lieu est placé au centre de la carte et vérifié par l'équipe avant d'apparaître."),
      name, cat, desc,
      h('button', { class: 'btn primary block', onclick: async () => {
        await run(() => api('POST', '/api/spots', { name: name.value, category: cat.value, description: desc.value, lat: center.lat, lng: center.lng }), 'Merci : le lieu sera visible après validation.');
        close();
      } }, 'Envoyer'),
      h('button', { class: 'btn ghost', onclick: close }, 'Annuler')
    ];
  });
}

// ---------- accord de localisation ----------
function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Géolocalisation indisponible sur cet appareil.')); return; }
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('Position refusée. Tu peux choisir un quartier à la place.')), { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 });
  });
}

function consentCard() {
  const hood = select(Object.fromEntries([['', 'Choisir un quartier…'], ...state.meta.neighborhoods.map((n) => [n, n])]), '', { 'aria-label': 'Quartier' });
  return h('div', { class: 'card pad stack live-consent' },
    h('h2', null, 'Active ta position'),
    h('p', { class: 'small text2' }, "Elle est arrondie avant d'être enregistrée. Sur la carte, ton point est placé au hasard dans une case d'environ 1 km (ou 500 m si tu le choisis). Personne ne voit ta position réelle, et tu peux l'effacer à tout moment."),
    h('button', { class: 'btn primary block', onclick: async () => {
      try {
        const pos = await locate();
        await run(() => api('PUT', '/api/me/location', { ...pos, consent: true }), 'Position activée.');
        await refreshMe(); screenMap();
      } catch (e) { if (!e.handled) toast(e.message, true); }
    } }, 'Utiliser ma position'),
    h('span', { class: 'small center' }, 'ou'), hood,
    h('button', { class: 'btn block', onclick: async () => {
      if (!hood.value) { toast('Choisis un quartier.', true); return; }
      await run(() => api('PUT', '/api/me/location', { neighborhood: hood.value, consent: true }), 'Quartier enregistré.');
      await refreshMe(); screenMap();
    } }, 'Utiliser ce quartier'));
}

// ---------- carte ----------
async function screenMap() {
  const me = state.me;
  const bar = h('div', { class: 'live-bar' },
    h('span', { class: 'live-brand' }, brand().name),
    h('div', { class: 'row' },
      h('button', { class: `chip-btn small-chip`, 'aria-pressed': String(live.onlyAvailable), onclick: () => { live.onlyAvailable = !live.onlyAvailable; screenMap(); } }, 'Dispos'),
      filterButton(screenMap),
      h('button', { class: 'icon-btn', 'aria-label': 'Conseils de sécurité', onclick: safetySheet }, icon('shield', 18))));
  if (!me.location.enabled) {
    mount(h('main', { class: 'live-screen' }, bar, h('div', { class: 'live-consent-wrap' }, consentCard())), nav('map'));
    return;
  }
  if (me.location.source === 'gps') locate().then((pos) => api('PUT', '/api/me/location', pos)).catch(() => {});
  // L'app ne reçoit jamais la position du membre : seulement son point approximatif, comme pour les autres.
  const first = await api('GET', `/api/live/map?${filterQuery()}${live.onlyAvailable ? '&available=1' : ''}`);
  const home = first.me ? { lat: first.me.lat, lng: first.me.lng } : { lat: 48.8566, lng: 2.3522 };
  const box = h('div', { class: 'live-map', role: 'region', 'aria-label': 'Carte des membres et des lieux' });
  const footer = h('div', { class: 'live-actions' },
    presenceButton(() => screenMap()),
    h('button', { class: 'icon-btn', 'aria-label': 'Proposer un lieu', onclick: () => proposeSpotSheet(map ? map.getCenter() : home) }, icon('plus', 20)));
  const info = h('p', { class: 'live-info', role: 'status' });
  mount(h('main', { class: 'live-screen' }, box, bar, footer, info), nav('map'));
  if (!storage.get('live-safety-seen')) safetySheet();
  if (!window.L) { box.append(h('p', { class: 'empty' }, 'Carte indisponible.')); return; }
  const L = window.L;
  const start = live.view || null;
  var map = L.map(box, { zoomControl: false, attributionControl: true });
  onLeave(() => { live.view = { center: map.getCenter(), zoom: map.getZoom() }; map.remove(); });
  L.tileLayer(state.meta.map.url, { maxZoom: 17, minZoom: 9, attribution: state.meta.map.attribution }).addTo(map);
  const layer = L.layerGroup().addTo(map);

  const markerEl = (x) => h('button', { class: `pin${x.presence ? ' on' : ''}`, 'aria-label': `${x.first_name}, ${x.age}${x.presence ? ', dispo' : ''}` },
    x.photo ? h('img', { src: `/photos/${x.photo}`, alt: '' }) : h('span', null, x.first_name[0]));
  const spotEl = (s) => h('button', { class: 'spot-pin', 'aria-label': `${s.name}, ${label('spot_categories', s.category)}` }, label('spot_categories', s.category)[0], s.here ? h('b', null, String(s.here)) : null);

  let timer;
  let loading = false;
  const load = async () => {
    if (loading) return;
    loading = true;
    const c = map.getCenter();
    try {
      const q = new URLSearchParams(filterQuery());
      q.set('lat', c.lat.toFixed(4)); q.set('lng', c.lng.toFixed(4));
      if (live.onlyAvailable) q.set('available', '1');
      const d = await api('GET', `/api/live/map?${q}`);
      layer.clearLayers();
      if (d.me) L.circleMarker([d.me.lat, d.me.lng], { radius: 8, color: '#f5f5f7', weight: 3, fillColor: '#0071e3', fillOpacity: 1 }).addTo(layer).bindTooltip('Toi (point approximatif)');
      for (const z of d.zones) {
        L.circle([z.lat, z.lng], { radius: z.size_km * 450, color: '#2997ff', weight: 1, fillColor: '#2997ff', fillOpacity: 0.12 }).addTo(layer);
        const el = h('button', { class: 'zone-count', 'aria-label': `${z.count} membres dans cette zone` }, String(z.count));
        L.marker([z.lat, z.lng], { icon: L.divIcon({ html: el, className: 'zone-icon', iconSize: [44, 44] }) }).addTo(layer)
          .on('click', () => sheet((close) => [h('h2', null, `${z.count} membres dans cette zone`),
            h('div', { class: 'list' }, z.people.map((x) => h('button', { class: 'item row', onclick: () => { close(); personSheet(x); } },
              h('span', { class: 'grow' }, `${x.first_name}, ${x.age}`), x.presence ? h('span', { class: 'live-dot', 'aria-label': 'Dispo' }) : null))),
            h('button', { class: 'btn ghost', onclick: close }, 'Fermer')]));
      }
      for (const s of d.spots) {
        L.marker([s.lat, s.lng], { icon: L.divIcon({ html: spotEl(s), className: 'zone-icon', iconSize: [40, 40] }) }).addTo(layer).on('click', () => spotSheet(s, load));
      }
      for (const x of d.pins) {
        L.marker([x.lat, x.lng], { icon: L.divIcon({ html: markerEl(x), className: 'zone-icon', iconSize: [46, 46] }), zIndexOffset: x.presence ? 1000 : 0 })
          .addTo(layer).on('click', () => personSheet(x));
      }
      const avail = d.pins.filter((x) => x.presence).length;
      info.textContent = `${d.pins.length} membre${d.pins.length > 1 ? 's' : ''} sur la carte, dont ${avail} dispo${d.zones.length ? ` · ${d.zones.reduce((n, z) => n + z.count, 0)} dans des zones` : ''}. Points approximatifs.`;
    } catch (e) {
      if (e.status === 402) { info.textContent = ''; toast(`${e.message} Voir ${brand().plus} dans Moi.`, true); map.setView([home.lat, home.lng], 13); }
      else toast(e.message, true);
    } finally { loading = false; }
  };
  map.on('moveend', () => { clearTimeout(timer); timer = setTimeout(load, 350); });
  if (start) map.setView(start.center, start.zoom); else map.setView([home.lat, home.lng], 14);
  const poll = setInterval(load, 30000);
  onLeave(() => { clearInterval(poll); clearTimeout(timer); });
  setTimeout(() => map.invalidateSize(), 50);
}

// ---------- liste ----------
async function screenList() {
  const me = state.me;
  if (!me.location.enabled) { go('#/map'); return; }
  const q = new URLSearchParams(filterQuery());
  const d = await api('GET', `/api/live/people?${q}`);
  const people = live.onlyAvailable ? d.people.filter((x) => x.presence) : d.people;
  const cell = (x) => h('button', { class: 'cell cell-btn', onclick: () => personSheet(x) },
    h('div', { class: 'thumb' }, x.photo ? h('img', { src: `/photos/${x.photo}`, alt: '' }) : h('span', { class: 'thumb-initial' }, x.first_name[0])),
    x.presence ? h('span', { class: 'online', 'aria-label': 'Dispo' }) : null,
    h('span', { class: 'cell-name' }, `${x.first_name}, ${x.age}`),
    h('span', { class: 'cell-meta' }, x.presence?.note ? `« ${x.presence.note} »` : x.distance || ''));
  mount(h('main', { class: 'screen with-nav' },
    h('div', { class: 'row between head' }, h('h1', { class: 'title' }, 'Autour de toi'),
      h('div', { class: 'row' },
        h('button', { class: 'chip-btn small-chip', 'aria-pressed': String(live.onlyAvailable), onclick: () => { live.onlyAvailable = !live.onlyAvailable; screenList(); } }, 'Dispos'),
        filterButton(screenList))),
    presenceButton(() => screenList()),
    people.length ? h('div', { class: 'grid3 cells' }, people.map(cell)) : h('p', { class: 'empty' }, live.onlyAvailable ? "Personne n'est dispo pour le moment." : 'Personne autour de toi pour le moment.'),
    h('p', { class: 'small center' }, 'Les dispos d’abord, puis par tranche de distance. Jamais de position exacte.')),
  nav('list'));
}

// ---------- routeur ----------
async function render() {
  runCleanup();
  document.querySelectorAll('.sheet-backdrop').forEach((s) => s.remove());
  const [, path = '', arg = ''] = /^#\/([^/]*)\/?(.*)$/.exec(location.hash || '#/') || [];
  try {
    if (!state.meta) state.meta = await api('GET', '/api/meta');
    if (state.me === null) await refreshMe();
    const me = state.me;
    document.title = me?.discreet_icon ? 'Notes' : brand().name;
    if (!me) {
      if (path === 'login') return screenLogin();
      if (path === 'apply') return screenSignup();
      return screenWelcome();
    }
    if (path === 'admin-hint' || me.role === 'admin') return adminHint();
    if (['suspended', 'banned', 'refused'].includes(me.status)) return await screenNotices({ standalone: true });
    if (me.legal.needs_consent) return screenConsentUpdate();
    if (me.status === 'pending') return screenVerify();
    switch (path) {
      case 'list': return await screenList();
      case 'u': return await screenProfile(arg);
      case 'shared': return await screenSharedAlbum(arg);
      case 'messages': return await screenMessages();
      case 'chat': return await screenChat(arg);
      case 'plus': return await screenPlus();
      case 'me':
        if (arg === 'edit') return await screenEditProfile();
        if (arg === 'albums') return await screenMyAlbums();
        if (arg.startsWith('albums/')) return await screenAlbumDetail(arg.slice(7));
        if (arg === 'location') return await screenLocation();
        if (arg === 'notices') return await screenNotices({ standalone: false });
        return await screenMe();
      default: return await screenMap();
    }
  } catch (e) {
    if (e.status === 401) { state.me = null; return render(); }
    if (e.status === 428) { await refreshMe(); return render(); }
    mount(h('main', { class: 'screen' }, h('h1', null, 'Oups'), h('p', { class: 'lead' }, e.message), h('a', { class: 'btn block', href: '#/' }, 'Retour')));
  }
}

window.addEventListener('hashchange', render);
render();

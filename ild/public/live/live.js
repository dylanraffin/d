// Nuit, la carte du cruising : qui est dispo autour de toi, maintenant.
// Téléphone : carte plein écran. Grand écran : liste à gauche, carte à droite, fiches dans un volet.
import { api, h, icon, toast, fmtDate, raw, fileToJpeg } from '/shared/lib.js';
import { tr, locale } from '/shared/i18n.js';
import { state, mount, go, run, refreshMe, runCleanup, onLeave, sheet, chips, select, nav, reportSheet, setNav, label, logout, brand, avatar, backBtn, clean,
  isWide, hhmm, personSummary, presenceText, statusLine, cruiseRows, placeSelect, veil, cssVar, shownPhoto, avatarOf, distText, storage, switchRow, linkRow } from '/app/ui.js';
import { screenLogin, screenSignup, screenVerify, screenWaitlist, screenNotices, screenConsentUpdate } from '/app/onboarding.js';
import { screenProfile, screenSharedAlbum, screenMessages, screenChat, filterQuery, filterButton } from '/app/main.js';
import { screenMe, screenEditProfile, screenMyAlbums, screenAlbumDetail, screenPlus, screenLocation, screenSettings, adminHint } from '/app/me.js';
import { prefs, chime, alerts } from '/app/alerts.js';

const DURATIONS = { 30: '30 min', 60: '1 h', 120: '2 h', 240: '4 h' };
const PLACE_ICON = { host: 'home', travel: 'arrow', venue: 'pin', out: 'chat' };
const live = { onlyAvailable: false, onlyFavorites: false, view: null };

const siteHome = () => document.querySelector('meta[name="site-home"]')?.content || '/';
const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

setNav([
  ['map', '#/map', 'map', 'Carte'],
  ['list', '#/list', 'card', 'Liste'],
  ['plans', '#/plans', 'group', 'Plans'],
  ['messages', '#/messages', 'chat', 'Messages'],
  ['me', '#/me', 'user', 'Moi']
], () => (state.me?.status === 'member' ? presenceButton(rerender) : null));
window.addEventListener('unhandledrejection', (e) => { if (e.reason?.handled) e.preventDefault(); });

// ---------- conseils de sécurité ----------
function safetySheet() {
  sheet((close) => [
    h('h2', null, 'Avant de te déplacer'),
    h('ul', { class: 'tips' },
      h('li', null, "Préviens un proche : où tu vas, avec qui, jusqu'à quand."),
      h('li', null, "Méfie-toi d'un profil récent, sans photo, pressé de te faire venir dans un lieu isolé : c'est le schéma des guet-apens. Le badge « Nouveau profil » t'aide à le repérer."),
      h('li', null, 'Échange quelques messages et une photo avant de bouger. Une photo ne peut être envoyée qu’après une réponse.'),
      h('li', null, 'Tu peux bloquer et signaler à tout moment ; un signalement garde une copie de la conversation.'),
      h('li', null, 'Plans à plusieurs : jamais d’argent, jamais de drogue. Signale un plan qui en demande.'),
      h('li', null, 'Arnaques : personne de l’équipe ne te demandera ton mot de passe ni un code reçu par SMS. Ne paie jamais pour « débloquer » une rencontre, une photo ou un plan.'),
      h('li', null, 'Chantage aux images : ne paie pas, garde les preuves, bloque et signale. Tu peux aussi le signaler sur internet-signalement.gouv.fr (PHAROS).'),
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
    const note = h('input', { class: 'input', maxlength: 80, placeholder: 'Un mot (facultatif) : « Dispo vers Bastille »', value: me.presence?.note || '', 'aria-label': 'Message' });
    return [
      h('h2', null, me.presence ? `Dispo jusqu'à ${hhmm(me.presence.until)}` : 'Je suis dispo'),
      h('span', { class: 'section-label' }, 'Pendant'), dur.el,
      h('span', { class: 'section-label' }, 'Comment'), place.el,
      note,
      h('p', { class: 'small' }, 'Ta photo s’allume sur la carte et tu passes en tête de liste. Ça s’éteint tout seul.'),
      h('button', { class: 'btn primary block', onclick: async () => {
        await run(() => api('PUT', '/api/me/presence', { minutes: Number(dur.value() || 60), place: place.value(), note: note.value }), 'Tu es dispo.');
        await refreshMe(); close(); after?.();
      } }, me.presence ? 'Mettre à jour' : 'Je suis dispo'),
      me.presence ? h('button', { class: 'btn block', onclick: async () => {
        await run(() => api('DELETE', '/api/me/presence'), "Tu n'es plus dispo.");
        await refreshMe(); close(); after?.();
      } }, 'Je ne suis plus dispo') : null,
      h('button', { class: 'btn ghost', onclick: close }, 'Fermer')
    ];
  });
}

function presenceButton(after) {
  const p = state.me.presence;
  return h('button', { class: `presence-btn${p ? ' on' : ''}`, onclick: () => presenceSheet(after) },
    h('span', { class: 'live-dot', 'aria-hidden': 'true' }), p ? `Dispo · ${hhmm(p.until)}` : 'Je suis dispo');
}

// ---------- fiche d'une personne : détails, favori, premier message ----------
function personSheet(x) {
  sheet((close) => {
    const details = h('div', { class: 'stack' }, h('p', { class: 'small' }, 'Chargement de la fiche…'));
    let favorite = !!x.favorite;
    const fav = h('button', { class: 'icon-btn', onclick: async () => {
      await run(() => api(favorite ? 'DELETE' : 'PUT', `/api/favorites/${x.id}`), favorite ? 'Retiré des favoris.' : 'Ajouté aux favoris. Il ne le sait pas.');
      favorite = !favorite; x.favorite = favorite; drawFav();
    } }, icon('star', 18));
    const drawFav = () => {
      fav.classList.toggle('on', favorite);
      fav.setAttribute('aria-pressed', String(favorite));
      fav.setAttribute('aria-label', tr(favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'));
    };
    drawFav();
    api('GET', `/api/users/${x.id}`).then((p) => {
      favorite = p.favorite; drawFav();
      details.replaceChildren(...clean([p.bio ? h('p', { class: 'body-text text2' }, raw(p.bio)) : null, cruiseRows(p)]));
    }).catch(() => details.replaceChildren());
    const input = h('input', { placeholder: `Écris à ${x.first_name}…`, maxlength: 2000, 'aria-label': `Message à ${x.first_name}` });
    const send = async (e) => {
      e.preventDefault();
      const body = input.value.trim();
      const r = await run(() => api('POST', '/api/conversations', { user_id: x.id }));
      if (body) await run(() => api('POST', `/api/matches/${r.id}/messages`, { body }));
      close(); go(`#/chat/${r.id}`);
    };
    const summary = personSummary(x);
    const ph = shownPhoto(x);
    return [
      h('div', { class: `person-cover${ph.id ? '' : ' empty'}${veil(ph.explicit)}`, onclick: (e) => e.currentTarget.classList.remove('veiled') },
        ph.id ? h('img', { src: `/photos/${ph.id}`, alt: '' }) : h('span', { class: 'initial', 'aria-hidden': 'true' }, x.first_name[0]),
        h('div', { class: 'cover-text' }, h('span', { class: 'person-name' }, `${x.first_name}, ${x.age}`),
          summary ? h('span', { class: 'small text2' }, summary) : null),
        fav),
      statusLine(x),
      x.presence ? h('div', { class: 'notice live-presence' }, h('span', { class: 'live-dot', 'aria-hidden': 'true' }), h('span', { class: 'grow' }, presenceText(x.presence))) : null,
      details,
      h('form', { class: 'say', onsubmit: send }, input, h('button', { class: 'icon-btn send', type: 'submit', 'aria-label': 'Envoyer' }, icon('send'))),
      h('div', { class: 'row' },
        h('a', { class: 'btn grow', href: `#/u/${x.id}`, onclick: close }, 'Voir le profil'),
        h('button', { class: 'btn danger', onclick: () => { close(); reportSheet('user', x.id, 'ce profil'); } }, 'Signaler'))
    ];
  });
}

// ---------- lieux ----------
function spotSheet(s, after) {
  sheet((close) => [
    h('div', { class: 'row' }, h('span', { class: 'chip' }, label('spot_categories', s.category))),
    h('h2', null, raw(s.name)),
    s.description ? h('p', { class: 'small text2' }, raw(s.description)) : null,
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

// ---------- plans à plusieurs ----------
// « Aujourd'hui à 18:00 », « Demain à 18:00 », « ven. 21 nov. à 18:00 »
function dayAt(t) {
  const d = new Date(t);
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(d) - midnight(new Date())) / 864e5);
  if (days === 0) return `Aujourd’hui à ${hhmm(t)}`;
  if (days === 1) return `Demain à ${hhmm(t)}`;
  return `${d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })} à ${hhmm(t)}`;
}
const planStart = (p) => (p.ended ? 'Terminé' : p.in_progress ? `En cours jusqu'à ${hhmm(p.ends_at)}` : dayAt(p.starts_at));
const planWhen = (p) => (p.ended || p.in_progress ? planStart(p) : `${dayAt(p.starts_at)}, jusqu'à ${hhmm(p.ends_at)}`);
const planCount = (p) => `${p.going + 1} sur ${p.max_guests + 1} (hôte compris)`;
const confirmedText = (p) => (p.going ? `${p.going + 1} confirmés, hôte compris` : 'Seul l’hôte pour l’instant');

// Choix d'une photo de couverture : aperçu tout de suite, envoi avec le plan (puis relue par l'équipe).
function coverPicker(id, onPick) {
  let data = null;
  const preview = h('span', { class: 'cover-preview' }, icon('image', 22), h('span', { class: 'small' }, 'Le lieu ou l’ambiance, sans nudité. Relue par l’équipe avant d’être montrée.'));
  const input = h('input', { type: 'file', accept: 'image/*', id, class: 'visually-hidden', onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      data = await fileToJpeg(f);
      preview.replaceChildren(h('img', { src: data, alt: '' }));
      onPick?.(data);
    } catch { toast('Image illisible.', true); }
  } });
  return { el: h('div', null, input, h('label', { class: 'cover-pick', for: id }, preview)), data: () => data };
}

function createPlanSheet(center, after) {
  sheet((close) => {
    const m = state.meta;
    const title = h('input', { class: 'input', maxlength: 80, placeholder: 'Titre : « Plan à 3 ce soir, Marais »', 'aria-label': 'Titre' });
    const desc = h('textarea', { class: 'input', maxlength: 600, placeholder: 'Ambiance, ce que tu cherches, ce qui est prévu…', 'aria-label': 'Description' });
    const kind = chips(m.plan_kinds, ['home'], { single: true, ariaLabel: 'Type de lieu' });
    const start = chips(m.plan_starts, ['0'], { single: true, ariaLabel: 'Début' });
    const dur = chips(m.plan_durations, ['120'], { single: true, ariaLabel: 'Durée' });
    const max = h('input', { class: 'input', type: 'number', min: 2, max: m.plan_max_guests, value: 4, 'aria-label': 'Nombre de participants' });
    const address = h('input', { class: 'input', maxlength: 200, placeholder: 'Adresse, code, étage (facultatif)', 'aria-label': 'Adresse' });
    const rules = h('input', { type: 'checkbox' });
    // Ou une date et une heure précises, jusqu'à une semaine à l'avance.
    const localInput = (t) => new Date(t - new Date(t).getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
    const when = h('input', { class: 'input', type: 'datetime-local', min: localInput(Date.now()), max: localInput(Date.now() + 7 * 864e5), 'aria-label': 'Date et heure précises' });
    const cover = coverPicker('plan-cover-new');
    return [
      h('h2', null, 'Organiser un plan à plusieurs'),
      title, desc,
      h('span', { class: 'section-label' }, 'Où'), kind.el,
      h('span', { class: 'section-label' }, 'Quand'), start.el,
      h('label', { class: 'stack small-gap' }, h('span', { class: 'small' }, 'Ou à une date et une heure précises (7 jours au plus)'), when),
      h('span', { class: 'section-label' }, 'Durée'), dur.el,
      h('label', { class: 'stack small-gap' }, h('span', { class: 'section-label' }, `Participants à accepter (2 à ${m.plan_max_guests})`), max),
      h('label', { class: 'stack small-gap' }, h('span', { class: 'section-label' }, 'Adresse, visible seulement des personnes que tu acceptes'), address),
      h('span', { class: 'section-label' }, 'Photo de couverture (facultatif)'), cover.el,
      h('p', { class: 'small' }, 'Sur la carte, ton plan est placé au centre d’une case d’environ 1 km autour du centre de la carte, jamais à l’adresse.'),
      h('label', { class: 'check' }, rules, h('span', null, 'Tout le monde est majeur et consentant, personne ne paie ni n’est payé, pas de drogue. Chacun peut dire non et partir à tout moment.')),
      h('button', { class: 'btn primary block', onclick: async () => {
        if (!rules.checked) { toast('Confirme les règles pour publier ton plan.', true); return; }
        const r = await run(() => api('POST', '/api/plans', { title: title.value, description: desc.value, place_kind: kind.value(), starts_in: Number(start.value() || 0),
          starts_at: when.value ? new Date(when.value).getTime() : null,
          duration: Number(dur.value() || 120), max_guests: Number(max.value), address: address.value, rules: true, lat: center.lat, lng: center.lng }), 'Plan publié. Tu reçois les demandes ici.');
        if (cover.data()) await api('POST', `/api/plans/${r.id}/cover`, { data: cover.data() }).catch((e) => toast(e.message, true));
        close(); after?.(); planSheet(r.id, after);
      } }, 'Publier le plan'),
      h('button', { class: 'btn ghost', onclick: close }, 'Annuler')
    ];
  });
}

function planSheet(id, after) {
  sheet((close) => {
    const box = h('div', { class: 'stack' }, h('p', { class: 'small' }, 'Chargement…'));
    const again = () => { close(); after?.(); planSheet(id, after); };
    const act = async (fn, msg) => { await run(fn, msg); again(); };
    const draw = (p) => {
      const mine = p.my_status;
      const inside = mine === 'host' || mine === 'accepted';
      const message = h('input', { class: 'input', maxlength: 200, placeholder: 'Un mot pour l’hôte (facultatif)', 'aria-label': 'Message pour l’hôte' });
      let action;
      if (p.status !== 'open' || p.ended) action = h('p', { class: 'notice' }, p.status === 'cancelled' ? "L'hôte a annulé ce plan." : 'Ce plan est terminé.');
      else if (mine === 'host') {
        action = [
          p.requests.length ? [h('span', { class: 'section-label' }, `Demandes (${p.requests.length})`),
            h('div', { class: 'list' }, p.requests.map((r) => h('div', { class: 'tall', style: { minHeight: '64px' } }, avatarOf(r),
              h('a', { class: 'grow stack small-gap text ellipsis-box', href: `#/u/${r.id}`, onclick: close }, h('span', { class: 'strong' }, raw(r.first_name)), r.message ? h('span', { class: 'small ellipsis' }, raw(`« ${r.message} »`)) : null),
              h('button', { class: 'btn primary small', onclick: () => act(() => api('POST', `/api/plans/${id}/requests/${r.id}`, { decision: 'accept' }), `${r.first_name} est accepté.`) }, 'Accepter'),
              h('button', { class: 'btn small', 'aria-label': `Décliner ${r.first_name}`, onclick: () => act(() => api('POST', `/api/plans/${id}/requests/${r.id}`, { decision: 'decline' })) }, 'Non'))))]
            : h('p', { class: 'small' }, 'Pas de demande en attente.'),
          h('a', { class: 'btn primary block', href: `#/plan/${id}`, onclick: close }, 'Ouvrir la discussion du plan'),
          h('span', { class: 'section-label' }, p.cover ? 'Changer la couverture' : 'Ajouter une couverture'),
          coverPicker(`plan-cover-${id}`, (data) => act(() => api('POST', `/api/plans/${id}/cover`, { data }), 'Couverture envoyée. Elle sera visible une fois relue.')).el,
          h('button', { class: 'btn danger block', onclick: () => act(() => api('DELETE', `/api/plans/${id}`), 'Plan annulé.') }, 'Annuler le plan')];
      } else if (mine === 'accepted') {
        action = [h('a', { class: 'btn primary block', href: `#/plan/${id}`, onclick: close }, 'Ouvrir la discussion du plan'),
          h('button', { class: 'btn block', onclick: () => act(() => api('POST', `/api/plans/${id}/leave`), 'C’est noté.') }, 'Je ne viens plus')];
      } else if (mine === 'requested') {
        action = [h('p', { class: 'notice' }, "Demande envoyée. Si l'hôte accepte, tu verras l'adresse et la discussion ici."),
          h('button', { class: 'btn block', onclick: () => act(() => api('POST', `/api/plans/${id}/leave`), 'Demande annulée.') }, 'Annuler ma demande')];
      } else if (mine === 'declined') {
        action = h('p', { class: 'notice warn' }, "L'hôte a décliné ta demande.");
      } else {
        action = [message, h('button', { class: 'btn primary block', onclick: () => act(() => api('POST', `/api/plans/${id}/join`, { message: message.value }), 'Demande envoyée.') }, 'Demander à venir')];
      }
      box.replaceChildren(...clean([
        p.cover ? h('img', { class: 'plan-cover', src: `/photos/${p.cover.id}`, alt: '' }) : null,
        p.cover?.status === 'pending' ? h('p', { class: 'small' }, 'Couverture en attente de relecture : les autres la verront une fois validée.') : null,
        h('div', { class: 'row wrap' }, h('span', { class: 'chip plan' }, 'Plan à plusieurs'), h('span', { class: 'chip' }, label('plan_kinds', p.place_kind)),
          p.in_progress ? h('span', { class: 'chip live-chip' }, 'En cours') : null),
        h('h2', null, raw(p.title)),
        h('p', { class: 'small text2' }, [planWhen(p), distText(p.distance)].filter(Boolean).join(' · ')),
        h('a', { class: 'row text', href: `#/u/${p.host.id}`, onclick: close }, avatarOf(p.host),
          h('span', { class: 'grow stack small-gap' }, h('span', { class: 'strong' }, raw(p.host.first_name)), h('span', { class: 'small' }, 'Hôte'))),
        p.description ? h('p', { class: 'body-text text2' }, raw(p.description)) : null,
        h('p', { class: 'small' }, `Participants : ${planCount(p)}. ${inside ? '' : "L'adresse et la liste des participants sont visibles une fois ta demande acceptée."}`),
        inside && p.members.length ? h('div', { class: 'avatars' }, p.members.map((x) => avatarOf(x))) : null,
        inside ? h('div', { class: 'addr' }, p.address ? raw(p.address) : "L'hôte donnera l'adresse dans la discussion.") : null,
        action,
        mine === 'host' ? null : h('button', { class: 'btn danger', onclick: () => { close(); reportSheet('plan', id, 'ce plan'); } }, 'Signaler ce plan')
      ]));
    };
    api('GET', `/api/plans/${id}`).then(draw).catch((e) => box.replaceChildren(h('p', { class: 'notice warn' }, e.message)));
    return [box, h('button', { class: 'btn ghost', onclick: close }, 'Fermer')];
  });
}

// ---------- plans à plusieurs : mes plans et ceux autour de moi ----------
const MY_STATUS = { host: 'Tu organises', accepted: 'Tu y vas', requested: 'Demande envoyée', declined: 'Demande déclinée' };

function planCard(p, again) {
  const open = () => planSheet(p.id, again);
  const left = Math.max(0, p.max_guests - p.going);
  return h('article', { class: 'plan-card' },
    h('div', { class: 'plan-card-head' },
      h('a', { href: `#/u/${p.host.id}`, 'aria-label': `Profil de ${p.host.first_name}` }, avatarOf(p.host)),
      h('button', { class: 'grow stack small-gap plan-card-when', onclick: open },
        h('span', { class: 'strong' }, planStart(p)),
        h('span', { class: 'small text2' }, [distText(p.distance), label('plan_kinds', p.place_kind)].filter(Boolean).join(' · '))),
      h('button', { class: 'icon-btn', 'aria-label': 'Voir sur la carte', title: 'Voir sur la carte', onclick: () => {
        live.view = { center: { lat: p.lat, lng: p.lng }, zoom: 15 };
        go('#/map');
      } }, icon('locate', 20))),
    h('div', { class: 'row wrap plan-card-tags' },
      p.in_progress ? h('span', { class: 'chip live-chip' }, 'En cours') : null,
      MY_STATUS[p.my_status] ? h('span', { class: 'chip' }, MY_STATUS[p.my_status]) : null,
      p.my_status === 'host' && p.pending ? h('span', { class: 'chip blue' }, p.pending > 1 ? `${p.pending} demandes` : '1 demande') : null),
    h('p', { class: 'small plan-count' }, icon('group', 16), h('span', null, confirmedText(p)), h('span', { class: 'text2', 'aria-hidden': 'true' }, '·'),
      h('span', { class: 'text2' }, left ? (left > 1 ? `${left} places libres` : '1 place libre') : 'Complet')),
    h('button', { class: 'plan-card-body', onclick: open },
      h('h3', { class: 'plan-title' }, raw(p.title)),
      p.cover ? h('img', { class: 'plan-cover', src: `/photos/${p.cover.id}`, alt: '', loading: 'lazy' }) : null,
      p.description ? h('p', { class: 'body-text text2 clamp-3' }, raw(p.description)) : null));
}

async function screenPlans(tab) {
  tab = tab === 'mine' ? 'mine' : 'nearby';
  const [mine, near] = await Promise.all([api('GET', '/api/plans/mine'), api('GET', '/api/plans/nearby')]);
  const again = () => { if (location.hash.startsWith('#/plans')) screenPlans(tab); };
  const plans = tab === 'mine' ? mine.plans : near.plans;
  const center = near.center || live.view?.center || null;
  const host = () => {
    if (!center) { toast('Active ta position ou choisis une ville pour placer ton plan.', true); go('#/map'); return; }
    createPlanSheet(center, again);
  };
  const empty = tab === 'mine'
    ? h('div', { class: 'empty-state' }, h('p', null, 'Tu n’as pas de plan en cours.'), h('p', { class: 'small' }, 'Organise le tien, ou demande à rejoindre un plan autour de toi.'),
      h('a', { class: 'btn', href: '#/plans/nearby' }, 'Voir les plans autour de moi'))
    : !near.located
      ? h('div', { class: 'empty-state' }, h('p', null, 'Active ta position pour voir les plans autour de toi.'), h('a', { class: 'btn', href: '#/map' }, 'Aller sur la carte'))
      : h('div', { class: 'empty-state' }, h('p', null, 'Pas de plan autour de toi pour l’instant.'), h('p', { class: 'small' }, 'Lance le premier : chez toi, à l’hôtel ou dans un établissement.'));
  mount(h('main', { class: 'screen with-nav plans-screen' },
    h('h1', { class: 'title' }, 'Plans à plusieurs'),
    h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Plans' },
      [['mine', 'Mes plans', mine.plans.length], ['nearby', 'Autour de moi', near.plans.length]].map(([k, text, count]) =>
        h('a', { href: `#/plans/${k}`, role: 'tab', class: tab === k ? 'on' : '', 'aria-selected': String(tab === k) }, text, count ? h('span', { class: 'seg-count' }, String(count)) : null))),
    plans.length ? h('div', { class: 'plan-list' }, plans.map((p) => planCard(p, again))) : empty,
    h('button', { class: 'safety-link', onclick: safetySheet }, icon('shield', 18), h('span', null, 'Se protéger : sécurité en ligne et arnaques')),
    h('button', { class: 'fab', onclick: host }, h('span', null, 'Organiser un plan'), icon('plus', 20))),
  nav('plans'));
}

// Discussion d'un plan : hôte et participants acceptés.
async function screenPlan(id) {
  const first = await api('GET', `/api/plans/${id}/messages`);
  const p = first.plan;
  let lastId = 0;
  const box = h('div', { class: 'bubbles', 'aria-live': 'polite' });
  const add = (list) => {
    for (const m of list) {
      lastId = Math.max(lastId, m.id);
      if (!m.mine) box.appendChild(h('span', { class: `sender${m.host ? ' host' : ''}` }, m.host ? `${m.sender} · hôte` : m.sender));
      box.appendChild(m.removed ? h('div', { class: 'bubble removed' }, 'Message retiré par la modération')
        : h('div', { class: `bubble${m.mine ? ' mine' : ''}`, title: fmtDate(m.created_at) }, raw(m.body)));
    }
    if (list.length) box.scrollTop = box.scrollHeight;
  };
  add(first.messages);
  const input = h('input', { placeholder: 'Message au groupe', maxlength: 1000, 'aria-label': 'Message au groupe' });
  const send = async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    await run(() => api('POST', `/api/plans/${id}/messages`, { body }));
    add((await api('GET', `/api/plans/${id}/messages?after=${lastId}`)).messages);
  };
  mount(h('main', { class: 'screen chat-screen' },
    h('div', { class: 'chat-pane' },
      h('div', { class: 'row chat-head' }, backBtn('#/messages'),
        h('button', { class: 'grow stack cell-btn', style: { gap: '0' }, onclick: () => planSheet(id, rerender) }, h('span', { class: 'strong' }, raw(p.title)),
          h('span', { class: 'small' }, `${planWhen(p)} · ${planCount(p)}`)),
        h('button', { class: 'btn small', onclick: () => reportSheet('plan', id, 'ce plan') }, 'Signaler')),
      h('div', { class: 'row' }, h('div', { class: 'avatars grow' }, [p.host, ...p.members.filter((x) => x.id !== p.host.id)].map((x) => avatarOf(x))),
        h('span', { class: 'chip plan' }, label('plan_kinds', p.place_kind))),
      h('div', { class: 'addr' }, p.address ? raw(p.address) : "L'hôte donnera l'adresse ici."),
      box,
      h('form', { class: 'composer', onsubmit: send }, input, h('button', { class: 'icon-btn send', 'aria-label': 'Envoyer', type: 'submit' }, icon('send'))))));
  const timer = setInterval(async () => {
    try { add((await api('GET', `/api/plans/${id}/messages?after=${lastId}`)).messages); } catch { /* réseau */ }
  }, 4000);
  onLeave(() => clearInterval(timer));
}

function addSheet(center, after) {
  sheet((close) => [
    h('h2', null, 'Ajouter sur la carte'),
    h('div', { class: 'list' },
      h('button', { class: 'item tall', style: { minHeight: '72px' }, onclick: () => { close(); createPlanSheet(center, after); } }, icon('group', 22),
        h('span', { class: 'grow stack small-gap' }, h('span', { class: 'strong' }, 'Organiser un plan à plusieurs'), h('span', { class: 'small' }, 'Chez toi, à l’hôtel ou dans un établissement. Tu choisis qui vient.'))),
      h('button', { class: 'item tall', style: { minHeight: '72px' }, onclick: () => { close(); proposeSpotSheet(center); } }, icon('pin', 22),
        h('span', { class: 'grow stack small-gap' }, h('span', { class: 'strong' }, 'Proposer un lieu'), h('span', { class: 'small' }, 'Bar, club, sauna, soirée. Vérifié par l’équipe.')))),
    h('button', { class: 'btn ghost', onclick: close }, 'Fermer')
  ]);
}

// ---------- menu rapide : les réglages qu'on change en pleine soirée, à un geste de la carte ----------
function menuSheet(getCenter) {
  sheet((close) => {
    const me = state.me;
    const name = brand().name;
    const locked = (f) => me.payments_enabled && me.entitlements && !me.entitlements[f];
    const order = ['500m', '1km', 'zone'];
    const level = Math.max(0, order.indexOf(me.map_precision || '1km'));
    const range = h('input', { type: 'range', min: 0, max: order.length - 1, step: 1, value: level, 'aria-label': 'Brouillage de ma position' });
    const precision = h('span', { class: 'small' }, label('map_precision', order[level]));
    range.oninput = () => { precision.textContent = tr(label('map_precision', order[Number(range.value)])); };
    range.onchange = async () => { state.me = await run(() => api('PATCH', '/api/me', { map_precision: order[Number(range.value)] }), 'Brouillage enregistré.'); rerender(); };
    const anyLocked = me.payments_enabled && Object.values(me.entitlements || {}).some((v) => !v);
    return [
      h('h2', null, 'Menu'),
      h('div', { class: 'menu-list' },
        linkRow('user', 'Ma fiche', () => { close(); go('#/me/edit'); }),
        linkRow('settings', 'Réglages du compte', () => { close(); go('#/me/settings'); })),
      h('div', { class: 'menu-list' },
        switchRow('eyeoff', 'Mode vanille', me.vanilla ? 'Photos explicites floutées ou remplacées' : 'Photos explicites affichées', !!me.vanilla, async () => {
          state.me = await run(() => api('PATCH', '/api/me', { vanilla: !me.vanilla }), me.vanilla ? 'Mode vanille désactivé.' : 'Mode vanille activé.');
          close();
          rerender();
        }),
        switchRow('layers', 'Regrouper les profils proches', 'Une pastille avec le nombre quand les photos se chevauchent', prefs.cluster(), () => {
          storage.set('live-cluster', prefs.cluster() ? '0' : '1');
          close();
          rerender();
        }),
        switchRow('sound', 'Sons', 'Un son à chaque nouveau message, si ton appareil le permet', prefs.sounds(), () => {
          const on = !prefs.sounds();
          storage.set('live-sounds', on ? '1' : '0');
          if (on) chime();
          window.dispatchEvent(new Event('nuit-prefs'));
          close();
          menuSheet(getCenter);
        })),
      anyLocked
        ? h('div', { class: 'row' }, h('a', { class: 'btn primary grow', href: '#/plus', onclick: close }, icon('lock', 18), `Passer à ${name}+`),
          h('a', { class: 'icon-btn', href: '#/plus', onclick: close, 'aria-label': `Ce que comprend ${name}+` }, '?'))
        : h('p', { class: 'small menu-note' }, `${name}+ est offert pendant le lancement : tout est débloqué.`),
      h('div', { class: 'menu-list' },
        linkRow('group', 'Organiser un plan à plusieurs', () => { close(); createPlanSheet(getCenter(), rerender); },
          h('span', { class: 'row' }, locked('host_plans') ? h('span', { class: 'plus-tag' }, `${name}+`) : null, icon('plus', 18))),
        linkRow('pin', 'Proposer un lieu', () => { close(); proposeSpotSheet(getCenter()); }, icon('plus', 18))),
      h('div', { class: 'menu-list' },
        h('div', { class: 'menu-row column' },
          h('div', { class: 'row' }, icon('shuffle', 20), h('span', { class: 'grow strong' }, 'Brouillage de ma position'), precision),
          h('div', { class: 'range-row' }, h('span', { class: 'small' }, 'moins'), range, h('span', { class: 'small' }, 'plus')))),
      h('div', { class: 'menu-list' },
        linkRow('logout', 'Se déconnecter', () => { close(); logout(); }, null),
        linkRow('refresh', 'Actualiser l’app', () => location.reload(), null))
    ];
  });
}

// ---------- mode voyage ----------
function tripSheet(getMap, after) {
  const me = state.me;
  sheet((close) => {
    const city = h('input', { class: 'input', list: 'trip-cities', placeholder: 'Chercher une ville…', autocomplete: 'off', 'aria-label': 'Ville' });
    const options = h('datalist', { id: 'trip-cities' }, state.meta.cities.map((c) => h('option', { value: tr(c) })));
    const days = chips(Object.fromEntries(state.meta.trip_days.map((d) => [d, d === 1 ? '1 jour' : `${d} jours`])), ['3'], { single: true, ariaLabel: 'Durée du voyage' });
    const start = async (body, name) => {
      await run(() => api('PUT', '/api/me/trip', { ...body, days: Number(days.value() || 3) }), `Tu apparais maintenant à ${name}.`);
      await refreshMe(); live.view = null; close(); after();
    };
    return [
      h('h2', null, 'Mode voyage'),
      h('p', { class: 'small text2' }, 'Apparais dans une autre ville avant d’y arriver, et regarde qui s’y trouve. Ton point est placé là où tu le choisis : ta position réelle n’est pas utilisée.'),
      me.trip ? h('div', { class: 'notice' }, icon('plane', 18), h('span', { class: 'grow' }, `En voyage : ${me.trip.label}, jusqu'au ${fmtDate(me.trip.until, false)}`)) : null,
      me.trip ? h('button', { class: 'btn block', onclick: async () => {
        await run(() => api('DELETE', '/api/me/trip'), 'Voyage terminé : tu es de retour chez toi.');
        await refreshMe(); live.view = null; close(); after();
      } }, 'Arrêter le voyage') : null,
      h('span', { class: 'section-label' }, 'Pendant'), days.el,
      h('span', { class: 'section-label' }, 'Où'), city, options,
      h('button', { class: 'btn primary block', onclick: () => {
        const typed = city.value.trim().toLowerCase();
        const name = state.meta.cities.find((c) => c.toLowerCase() === typed || tr(c).toLowerCase() === typed);
        if (!name) { toast('Choisis une ville dans la liste, ou utilise le centre de la carte.', true); return; }
        start({ city: name }, tr(name));
      } }, 'Voyager dans cette ville'),
      h('button', { class: 'btn block', onclick: () => {
        const c = getMap()?.getCenter();
        if (!c) { toast('Carte indisponible : choisis une ville.', true); return; }
        start({ lat: c.lat, lng: c.lng }, 'cet endroit');
      } }, 'Voyager au centre de la carte'),
      h('button', { class: 'btn ghost', onclick: close }, 'Fermer')
    ];
  });
}

// ---------- accord de localisation ----------
function locate(precise = false) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Géolocalisation indisponible sur cet appareil.')); return; }
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      () => reject(new Error('Position refusée. Tu peux choisir une ville à la place.')),
      precise ? { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 } : { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 });
  });
}

// Position GPS renvoyée au serveur (il en garde une par minute au plus). Avec « Détecter les lieux où je suis »,
// la position est demandée plus précise et le serveur fait le check-in dans un lieu tout proche.
async function refreshGps() {
  try {
    const r = await api('PUT', '/api/me/location', await locate(!!state.me?.auto_checkin));
    if (r.checked_in) toast(`Check-in automatique : ${r.checked_in.name}, pour 2 h.`);
  } catch { /* position indisponible : la carte garde la précédente */ }
}

function consentCard() {
  const place = placeSelect();
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
    h('span', { class: 'small center' }, 'ou'), place.el,
    h('button', { class: 'btn block', onclick: async () => {
      if (!place.body()) { toast('Choisis une ville.', true); return; }
      await run(() => api('PUT', '/api/me/location', { ...place.body(), consent: true }), 'Ville enregistrée.');
      await refreshMe(); live.view = null; screenMap();
    } }, 'Utiliser cette ville'));
}

// Visage d'un point de la carte : sa photo, son alternative sans nudité en mode vanille, ou son initiale.
function faceOf(x) {
  const ph = shownPhoto(x);
  return h('span', { class: `face${veil(ph.explicit)}` }, ph.id ? h('img', { src: `/photos/${ph.id}`, alt: '' }) : h('span', null, x.first_name[0]));
}

// ---------- carte ----------
async function screenMap() {
  const me = state.me;
  let mapRef = null; // la carte, une fois créée : le menu ajoute un plan ou un lieu au centre de ce qu'on regarde
  const menuButton = () => h('button', { class: 'icon-btn', 'aria-label': 'Menu', title: 'Menu', onclick: () => menuSheet(() => (mapRef ? mapRef.getCenter() : { lat: 48.8566, lng: 2.3522 })) }, icon('menu', 20));
  const availableChip = () => h('button', { class: 'chip-btn small-chip', 'aria-pressed': String(live.onlyAvailable), onclick: () => { live.onlyAvailable = !live.onlyAvailable; screenMap(); } }, 'Dispos');
  const bar = h('div', { class: 'live-bar' },
    h('span', { class: 'live-brand' }, brand().name),
    h('div', { class: 'row only-narrow' }, availableChip(), filterButton(screenMap), menuButton()));
  if (!me.location.enabled && !me.trip) {
    mount(h('main', { class: 'live-screen' },
      h('aside', { class: 'live-side' }, h('div', { class: 'side-head' }, h('h1', { class: 'title' }, 'Autour de toi'),
        h('span', { class: 'small' }, 'Active ta position ou choisis une ville pour voir qui est là.'))),
      h('div', { class: 'live-stage' }, h('div', { class: 'live-map' }), bar, h('div', { class: 'live-consent-wrap' }, consentCard()))), nav('map'));
    return;
  }
  if (me.location.source === 'gps') refreshGps();
  // L'app ne reçoit jamais la position du membre : seulement son point approximatif, comme pour les autres.
  const first = await api('GET', `/api/live/map?${filterQuery()}${live.onlyAvailable ? '&available=1' : ''}`);
  const home = first.me ? { lat: first.me.lat, lng: first.me.lng } : { lat: 48.8566, lng: 2.3522 };
  let map = null;
  let alive = true; // faux dès qu'on quitte l'écran : plus rien ne doit toucher à la carte
  const box = h('div', { class: 'live-map', role: 'region', 'aria-label': 'Carte des membres, des lieux et des plans' });
  const info = h('p', { class: 'live-info', role: 'status' });
  const sideList = h('div', { class: 'side-scroll' });
  const sideCount = h('span', { class: 'small', role: 'status' });
  const side = h('aside', { class: 'live-side', 'aria-label': 'Autour de toi' },
    h('div', { class: 'side-head' },
      h('div', { class: 'row between' }, h('h1', { class: 'title' }, me.trip ? me.trip.label : 'Autour de toi'), h('div', { class: 'row' }, availableChip(), filterButton(screenMap), menuButton())),
      sideCount),
    sideList,
    h('p', { class: 'side-foot' }, 'Points approximatifs : personne ne voit la position réelle de personne. Les dispos d’abord, puis les personnes en ligne.'));
  const tools = h('div', { class: 'live-tools' },
    h('button', { class: `icon-btn${me.trip ? ' on' : ''}`, 'aria-label': 'Mode voyage', title: 'Mode voyage', onclick: () => tripSheet(() => map, screenMap) }, icon('plane', 20)),
    h('button', { class: 'icon-btn', 'aria-label': 'Revenir à mon point', title: 'Revenir à mon point', onclick: () => map?.setView([home.lat, home.lng], 14) }, icon('target', 20)),
    h('button', { class: 'icon-btn', 'aria-label': 'Conseils de sécurité', title: 'Conseils de sécurité', onclick: safetySheet }, icon('shield', 20)),
    h('button', { class: 'icon-btn', 'aria-label': 'Ajouter un plan à plusieurs ou un lieu', title: 'Ajouter', onclick: () => addSheet(map ? map.getCenter() : home, load) }, icon('plus', 22)));
  const tripBanner = me.trip ? h('div', { class: 'trip-banner' }, icon('plane', 16), h('span', { class: 'grow' }, `En voyage : ${me.trip.label}, jusqu'au ${fmtDate(me.trip.until, false)}`),
    h('button', { class: 'btn small', onclick: async () => { await run(() => api('DELETE', '/api/me/trip'), 'Voyage terminé.'); await refreshMe(); live.view = null; screenMap(); } }, 'Arrêter')) : null;
  mount(h('main', { class: 'live-screen' }, side,
    h('div', { class: 'live-stage' }, box, bar, tripBanner, h('div', { class: 'live-actions only-narrow' }, presenceButton(() => screenMap())), tools, info)), nav('map'));
  if (!storage.get('live-safety-seen')) safetySheet();
  if (!window.L) { box.append(h('p', { class: 'empty' }, 'Carte indisponible.')); return; }
  const L = window.L;
  const start = live.view || null;
  map = L.map(box, { zoomControl: false, attributionControl: true });
  mapRef = map;
  if (isWide()) L.control.zoom({ position: 'topright' }).addTo(map);
  const gpsTimer = me.location.source === 'gps' ? setInterval(() => { if (document.visibilityState === 'visible') refreshGps(); }, 120000) : null;
  onLeave(() => { alive = false; clearInterval(gpsTimer); live.view = { center: map.getCenter(), zoom: map.getZoom() }; map.remove(); });
  if (state.meta.map.url) L.tileLayer(state.meta.map.url, { maxZoom: 17, minZoom: 9, attribution: state.meta.map.attribution }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  const divIcon = (el, size) => L.divIcon({ html: el, className: 'zone-icon', iconSize: [size, size] });
  // Les photos grandissent quand on se rapproche : la carte se lit comme un mur de visages, pas comme des points.
  const pinSize = () => { const z = map.getZoom(); const big = isWide() ? 8 : 0; return (z >= 15 ? 76 : z >= 14 ? 64 : z >= 13 ? 52 : 40) + big; };
  const ROLE = { top: '↑', vers_top: '↑', vers: '↕', vers_bottom: '↓', bottom: '↓', side: '↔' };

  const markerEl = (x, size) => h('button', { class: `pin${x.presence ? ' on' : ''}${size < 50 ? ' small' : ''}`, style: { width: `${size}px`, height: `${size}px` },
    'aria-label': `${x.first_name}, ${x.age}${x.presence ? ', dispo' : ''}${x.online === 'now' ? ', en ligne' : ''}` },
    faceOf(x),
    x.online === 'now' && !x.presence ? h('span', { class: 'now' }) : null,
    x.position && ROLE[x.position] ? h('span', { class: 'tag role', 'aria-hidden': 'true' }, ROLE[x.position]) : null,
    x.presence && PLACE_ICON[x.presence.place] ? h('span', { class: `tag${x.presence.place === 'host' ? ' host' : ''}` }, icon(PLACE_ICON[x.presence.place], 13)) : null,
    x.trip ? h('span', { class: 'tag trip' }, icon('plane', 13)) : null);
  const clusterPins = (pins, size) => {
    const z = map.getZoom();
    const cell = size * 0.95;
    const cells = new Map();
    for (const x of pins) {
      const p = map.project([x.lat, x.lng], z);
      const k = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(x);
    }
    return [...cells.values()];
  };
  const clusterEl = (group, size) => {
    const lead = group.find((x) => x.presence) || group.find((x) => x.online === 'now') || group[0];
    const avail = group.filter((x) => x.presence).length;
    return h('button', { class: `pin cluster${avail ? ' on' : ''}${size < 50 ? ' small' : ''}`, style: { width: `${size}px`, height: `${size}px` },
      'aria-label': avail ? `${group.length} membres ici, dont ${avail} dispo` : `${group.length} membres ici` },
      faceOf(lead), h('span', { class: 'count', 'aria-hidden': 'true' }, String(group.length)));
  };
  const clusterSheet = (group) => sheet((close) => [h('h2', null, `${group.length} membres ici`),
    h('div', { class: 'people' }, group.map((x) => h('button', { onclick: () => { close(); personSheet(x); } }, avatarOf(x),
      h('span', { class: 'who' }, h('b', null, `${x.first_name}, ${x.age}`), h('span', null, rowSub(x))), x.presence ? h('span', { class: 'live-dot', 'aria-label': 'Dispo' }) : null))),
    h('button', { class: 'btn ghost', onclick: close }, 'Fermer')]);
  const spotLetter = (s) => raw(tr(label('spot_categories', s.category))[0]); // initiale de la catégorie, dans la langue affichée
  const spotEl = (s) => h('button', { class: 'spot-pin', 'aria-label': `${s.name}, ${tr(label('spot_categories', s.category))}` }, spotLetter(s), s.here ? h('b', null, String(s.here)) : null);
  const planEl = (p) => h('button', { class: `plan-pin${p.in_progress ? ' on' : ''}`, 'aria-label': `Plan à plusieurs : ${p.title}` }, icon('group', 20), h('b', null, String(p.going + 1)));
  const rowSub = (x) => (x.presence ? presenceText(x.presence) : [x.online === 'now' ? 'En ligne' : null, personSummary(x), distText(x.distance)].filter(Boolean).join(' · '));

  let timer;
  let loading = false;
  async function load() {
    if (loading || !map || !alive) return;
    loading = true;
    const c = map.getCenter();
    try {
      const q = new URLSearchParams(filterQuery());
      q.set('lat', c.lat.toFixed(4)); q.set('lng', c.lng.toFixed(4));
      if (live.onlyAvailable) q.set('available', '1');
      const d = await api('GET', `/api/live/map?${q}`);
      if (!alive) return;
      const els = new Map();
      layer.clearLayers();
      if (d.me) L.circleMarker([d.me.lat, d.me.lng], { radius: 8, color: '#ffffff', weight: 3, fillColor: cssVar('--text'), fillOpacity: 1 }).addTo(layer).bindTooltip(tr(me.trip ? 'Toi, en voyage' : 'Toi (point approximatif)'));
      const zoneSheet = (z) => sheet((close) => [h('h2', null, `${z.count} membres dans cette zone`),
        h('p', { class: 'small' }, 'Ils ont choisi de ne pas avoir de point à eux.'),
        h('div', { class: 'people' }, z.people.map((x) => h('button', { onclick: () => { close(); personSheet(x); } }, avatarOf(x),
          h('span', { class: 'who' }, h('b', null, `${x.first_name}, ${x.age}`), h('span', null, rowSub(x))), x.presence ? h('span', { class: 'live-dot', 'aria-label': 'Dispo' }) : null))),
        h('button', { class: 'btn ghost', onclick: close }, 'Fermer')]);
      for (const z of d.zones) {
        L.circle([z.lat, z.lng], { radius: z.size_km * 450, color: cssVar('--accent-mark'), weight: 1.5, opacity: 0.6, dashArray: '3 7', fillColor: cssVar('--accent-mark'), fillOpacity: z.size_km <= 2 ? 0.1 : 0 }).addTo(layer);
        L.marker([z.lat, z.lng], { icon: divIcon(h('button', { class: 'zone-count', 'aria-label': `${z.count} membres dans cette zone` }, String(z.count)), 44) }).addTo(layer).on('click', () => zoneSheet(z));
      }
      for (const s of d.spots) L.marker([s.lat, s.lng], { icon: divIcon(spotEl(s), 40) }).addTo(layer).on('click', () => spotSheet(s, load));
      for (const p of d.plans) L.marker([p.lat, p.lng], { icon: divIcon(planEl(p), 44), zIndexOffset: 500 }).addTo(layer).on('click', () => planSheet(p.id, load));
      const size = pinSize();
      // Regroupement (réglage du menu) : en dessous du zoom 16, les photos qui tombent dans la même case de la taille
      // d'une photo deviennent une pastille avec leur nombre ; un geste et la carte zoome dessus.
      const groups = prefs.cluster() && map.getZoom() < 16 ? clusterPins(d.pins, size) : d.pins.map((x) => [x]);
      for (const group of groups) {
        if (group.length === 1) {
          const x = group[0];
          const el = markerEl(x, size);
          els.set(x.id, el);
          L.marker([x.lat, x.lng], { icon: divIcon(el, size), zIndexOffset: x.presence ? 1000 : x.online === 'now' ? 300 : 0 }).addTo(layer).on('click', () => personSheet(x));
          continue;
        }
        const el = clusterEl(group, size);
        for (const x of group) els.set(x.id, el);
        const at = [group.reduce((n, x) => n + x.lat, 0) / group.length, group.reduce((n, x) => n + x.lng, 0) / group.length];
        L.marker(at, { icon: divIcon(el, size), zIndexOffset: group.some((x) => x.presence) ? 1100 : 400 }).addTo(layer).on('click', () => {
          const b = L.latLngBounds(group.map((x) => [x.lat, x.lng]));
          if (map.getZoom() >= 15 || b.getNorthEast().equals(b.getSouthWest())) clusterSheet(group);
          else map.flyToBounds(b.pad(0.8), { maxZoom: Math.min(map.getZoom() + 3, 17), duration: 0.6 });
        });
      }
      const avail = d.pins.filter((x) => x.presence).length;
      const inZones = d.zones.reduce((n, z) => n + z.count, 0);
      const text = `${d.pins.length} membre${d.pins.length > 1 ? 's' : ''} sur la carte, dont ${avail} dispo${inZones ? ` · ${inZones} dans des zones` : ''}`;
      info.textContent = `${tr(text)}. ${tr('Points approximatifs.')}`;
      sideCount.textContent = tr(`${text}${d.plans.length ? ` · ${d.plans.length} plan${d.plans.length > 1 ? 's' : ''} à plusieurs` : ''}`);
      // Volet de gauche (grand écran) : plans, membres, lieux visibles sur la carte.
      const order = (p) => (p.presence ? 0 : p.online === 'now' ? 1 : 2);
      const people = [...d.pins].sort((a, b) => order(a) - order(b));
      const hot = (id, on) => els.get(id)?.classList.toggle('hot', on);
      sideList.replaceChildren(...clean([
        d.plans.length ? [h('div', { class: 'side-label' }, 'Plans à plusieurs'), h('div', { class: 'people' }, d.plans.map((p) => h('button', { onclick: () => planSheet(p.id, load) },
          h('span', { class: 'plan-pin', 'aria-hidden': 'true' }, icon('group', 20)),
          h('span', { class: 'who' }, h('b', null, raw(p.title)), h('span', null, `${planWhen(p)} · ${p.going + 1} sur ${p.max_guests + 1}`)),
          p.my_status === 'host' && p.pending ? h('span', { class: 'chip blue' }, String(p.pending)) : null)))] : null,
        h('div', { class: 'side-label' }, `Membres (${people.length})`),
        people.length ? h('div', { class: 'people' }, people.map((x) => h('button', { onclick: () => personSheet(x), onmouseenter: () => hot(x.id, true), onmouseleave: () => hot(x.id, false), onfocus: () => hot(x.id, true), onblur: () => hot(x.id, false) },
          avatarOf(x),
          h('span', { class: 'who' }, h('b', null, `${x.first_name}, ${x.age}`), h('span', null, rowSub(x))),
          x.presence ? h('span', { class: 'live-dot', 'aria-label': 'Dispo' }) : x.new_profile ? h('span', { class: 'badge-new' }, 'Nouveau') : null)))
          : h('p', { class: 'empty' }, live.onlyAvailable ? "Personne n'est dispo ici pour le moment." : 'Personne dans cette partie de la carte.'),
        d.spots.length ? [h('div', { class: 'side-label' }, 'Lieux'), h('div', { class: 'people' }, d.spots.map((s) => h('button', { onclick: () => { map.panTo([s.lat, s.lng]); spotSheet(s, load); } },
          h('span', { class: 'spot-pin', 'aria-hidden': 'true' }, spotLetter(s)),
          h('span', { class: 'who' }, h('b', null, raw(s.name)), h('span', null, `${label('spot_categories', s.category)}${s.here ? ` · ${s.here} ici` : ''}`)))))] : null
      ]));
    } catch (e) {
      if (!alive) return;
      if (e.status === 402) { info.textContent = ''; toast(`${e.message} Voir ${brand().plus} dans Moi.`, true); map.setView([home.lat, home.lng], 13); }
      else toast(e.message, true);
    } finally { loading = false; }
  }
  map.on('moveend', () => { clearTimeout(timer); timer = setTimeout(load, 350); });
  if (start) map.setView(start.center, start.zoom); else map.setView([home.lat, home.lng], 14);
  const poll = setInterval(load, 30000);
  onLeave(() => { clearInterval(poll); clearTimeout(timer); });
  setTimeout(() => { if (alive) map.invalidateSize(); }, 50);
}

// ---------- liste ----------
async function screenList() {
  const me = state.me;
  if (!me.location.enabled && !me.trip) { go('#/map'); return; }
  const q = new URLSearchParams(filterQuery());
  if (live.onlyFavorites) q.set('favorites', '1');
  const d = await api('GET', `/api/live/people?${q}`);
  const people = live.onlyAvailable ? d.people.filter((x) => x.presence) : d.people;
  const cell = (x) => h('button', { class: 'cell cell-btn', onclick: () => personSheet(x) },
    (() => { const ph = shownPhoto(x); return h('div', { class: `thumb${veil(ph.explicit)}` }, ph.id ? h('img', { src: `/photos/${ph.id}`, alt: '' }) : h('span', { class: 'thumb-initial' }, x.first_name[0])); })(),
    x.presence || x.online === 'now' ? h('span', { class: 'online', 'aria-label': x.presence ? 'Dispo' : 'En ligne' }) : null,
    h('span', { class: 'cell-name' }, `${x.first_name}, ${x.age}`),
    h('span', { class: 'cell-meta' }, x.presence ? `Dispo · ${hhmm(x.presence.until)}` : distText(x.distance) || ''));
  const toggle = (key, text) => h('button', { class: 'chip-btn small-chip', 'aria-pressed': String(live[key]), onclick: () => { live[key] = !live[key]; screenList(); } }, text);
  const empty = live.onlyFavorites ? "Aucun favori ici. Ajoute quelqu'un avec l'étoile de sa fiche." : live.onlyAvailable ? "Personne n'est dispo pour le moment." : 'Personne autour de toi pour le moment.';
  mount(h('main', { class: 'screen with-nav wide' },
    h('div', { class: 'row between head wrap' }, h('h1', { class: 'title' }, me.trip ? me.trip.label : 'Autour de toi'),
      h('div', { class: 'row' }, toggle('onlyAvailable', 'Dispos'), toggle('onlyFavorites', 'Favoris'), filterButton(screenList))),
    h('div', { class: 'only-narrow' }, presenceButton(() => screenList())),
    people.length ? h('div', { class: 'grid3 cells' }, people.map(cell)) : h('p', { class: 'empty' }, empty),
    h('p', { class: 'small center' }, 'Les dispos d’abord, puis les personnes en ligne, par tranche de distance. Jamais de position exacte.')),
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
      // Visiteur : la page d'accueil du site présente le service.
      location.replace(siteHome());
      return;
    }
    if (path === 'admin-hint' || me.role === 'admin') return adminHint();
    if (['suspended', 'banned', 'refused'].includes(me.status)) return await screenNotices({ standalone: true });
    if (me.legal.needs_consent) return screenConsentUpdate();
    if (me.status === 'pending') return screenVerify();
    // Demande d'adhésion en cours d'examen : on peut seulement compléter sa fiche (photo, quelques mots).
    if (me.status === 'waitlist') {
      if (path === 'me' && arg === 'edit') return await screenEditProfile();
      return screenWaitlist();
    }
    alerts.start();
    switch (path) {
      case 'list': return await screenList();
      case 'u': return await screenProfile(arg);
      case 'shared': return await screenSharedAlbum(arg);
      case 'messages': return await screenMessages();
      case 'chat': return await screenChat(arg);
      case 'plans': return await screenPlans(arg);
      case 'plan': return await screenPlan(arg);
      case 'plus': return await screenPlus();
      case 'me':
        if (arg === 'edit') return await screenEditProfile();
        if (arg === 'albums') return await screenMyAlbums();
        if (arg.startsWith('albums/')) return await screenAlbumDetail(arg.slice(7));
        if (arg === 'location') return await screenLocation();
        if (arg === 'settings') return await screenSettings();
        if (arg === 'notices') return await screenNotices({ standalone: false });
        return await screenMe();
      default: return await screenMap();
    }
  } catch (e) {
    if (e.status === 401) { state.me = null; return render(); }
    if (e.status === 428) { await refreshMe(); return render(); }
    mount(h('main', { class: 'screen' }, h('h1', null, 'Oups'), h('p', { class: 'lead' }, e.message), h('a', { class: 'btn block', href: '#/map' }, 'Retour')));
  }
}

window.addEventListener('hashchange', render);
render();

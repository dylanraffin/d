// Serveur simulé de la démo : répond aux appels /api/… de l'interface à partir des données fictives de data.js.
// Tout reste dans la page : rien n'est envoyé, rien n'est enregistré, et tout repart de zéro au rechargement.
(() => {
  const D = window.DEMO;
  if (!D) return;

  // Les dates de la base de démo sont recalées sur « maintenant » pour que les dispos et les plans restent en cours.
  const shift = Date.now() - D.builtAt;
  (function walk(o) {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'number' && v > 1.5e12 && v < 3e12) o[k] = v + shift;
      else if (v && typeof v === 'object') walk(v);
    }
  })(D);

  const now = () => Date.now();
  const MIN = 60e3;
  const DAY = 86400e3;
  let nextId = 900000;
  // Ouverte sur « Demander à rejoindre » ou « Se connecter », la démo commence déconnectée ; sinon on est Léo, membre de démonstration.
  let logged = !/^#\/(apply|login)/.test(location.hash);
  const member = D.me; // Léo, le membre de démonstration
  let me = member;    // ou le candidat fictif d'une demande d'adhésion jouée dans la démo
  const uploaded = {}; // photos ajoutées pendant la démo : gardées en mémoire
  const favorites = new Set(D.favorites);
  const checkins = {};
  const mine = () => ({ id: me.id, first_name: me.first_name, photo: (me.photos.find((p) => p.status === 'approved') || {}).id || null });
  window.demoPhoto = (id) => uploaded[id] || `photos/${id}.jpg`;

  class Fail extends Error { constructor(status, message) { super(message); this.status = status; } }
  const fail = (status, message) => { throw new Fail(status, message); };
  const DEMO_ONLY = 'Démo : cette action n’est pas disponible ici.';

  const cardOf = (id) => D.people.find((x) => x.id === id) || D.map.pins.find((x) => x.id === id) || D.map.zones.flatMap((z) => z.people).find((x) => x.id === id);
  const userOf = (id) => D.users[id] || fail(404, 'Membre introuvable.');

  // ---------- carte ----------
  const HOME = D.map.me ? { lat: D.map.me.lat, lng: D.map.me.lng } : { lat: 48.859, lng: 2.3622 };
  const offset = () => (me.trip ? { lat: me.trip.lat - HOME.lat, lng: me.trip.lng - HOME.lng } : { lat: 0, lng: 0 });
  const moved = (x, o) => ({ ...x, lat: x.lat + o.lat, lng: x.lng + o.lng });
  function planList(p) {
    const t = now();
    return { ...p, in_progress: p.starts_at <= t && p.ends_at > t, ended: p.ends_at <= t };
  }
  function mapView(q) {
    const o = offset();
    const free = q.get('available') === '1';
    const live = (x) => (x.presence && x.presence.until > now() ? x : { ...x, presence: null });
    const pins = D.map.pins.map(live).filter((x) => !free || x.presence).map((x) => ({ ...moved(x, o), favorite: favorites.has(x.id) }));
    return {
      located: true, me: moved({ ...HOME, precision: me.map_precision }, o), radius_km: 12, min_cluster: 3, hidden: 0,
      pins,
      zones: free ? [] : D.map.zones.map((z) => moved({ ...z, people: z.people.map(live) }, o)),
      spots: D.map.spots.map((s) => moved({ ...s, here: s.here + (checkins[s.id] ? 1 : 0), i_am_here: !!checkins[s.id] || s.i_am_here }, o)),
      plans: Object.values(D.plans).filter((p) => p.status === 'open' && p.ends_at > now()).map((p) => moved(planList(p), o))
    };
  }
  function peopleView(q) {
    let list = D.people.map((x) => ({ ...x, presence: x.presence && x.presence.until > now() ? x.presence : null, favorite: favorites.has(x.id) }));
    if (q.get('favorites') === '1') list = list.filter((x) => x.favorite);
    return { located: true, people: list };
  }

  // ---------- conversations ----------
  const REPLIES = ['Salut, ça va ?', 'Dispo oui. Tu es vers où ?', 'Je peux recevoir dans 30 min.', 'Ok pour moi. Tu m’envoies une photo ?', 'Top, je te redis.'];
  const replyCount = {};
  function thread(id) { return D.threads[id] || fail(404, 'Conversation introuvable.'); }
  function touch(id, body, mineFlag) {
    let m = D.matches.find((x) => String(x.id) === String(id));
    if (!m) return;
    m.last = { body, mine: mineFlag, created_at: now() };
    m.unread = !mineFlag;
    if (!mineFlag) m.waiting_reply = false;
  }
  function addMessage(id, msg) {
    const t = thread(id);
    const full = { id: nextId++, removed: false, created_at: now(), kind: 'text', ...msg };
    t.messages.push(full);
    touch(id, full.kind === 'photo' ? 'Photo' : full.body, full.mine);
    return full;
  }
  function autoReply(id) {
    const n = replyCount[id] || 0;
    if (n >= REPLIES.length) return;
    replyCount[id] = n + 1;
    setTimeout(() => {
      const t = D.threads[id];
      if (!t) return;
      t.other_read_at = now();
      setTimeout(() => { addMessage(id, { mine: false, body: REPLIES[n] }); t.can_send_photo = true; }, 1800);
    }, 1200);
  }
  function openConversation(userId) {
    const existing = D.matches.find((m) => m.user.id === userId);
    if (existing) return { id: existing.id };
    const u = userOf(userId);
    const id = nextId++;
    D.matches.unshift({ id, created_at: now(), waiting_reply: true, opened_by_me: true, user: { id: u.id, first_name: u.first_name, photo: u.photos[0] || null }, last: null, unread: false });
    D.threads[id] = { match_id: id, user: u, messages: [], can_send_photo: false, other_read_at: null };
    return { id };
  }

  // ---------- plans à plusieurs ----------
  function plan(id) { return D.plans[id] || fail(404, 'Plan introuvable.'); }
  function planDetail(p) {
    const inside = p.my_status === 'host' || p.my_status === 'accepted';
    return { ...planList(p), address: inside ? p._address ?? p.address : null, members: inside ? p._members ?? p.members : [] };
  }
  for (const p of Object.values(D.plans)) { p._address = p.address || 'Exemple : adresse donnée aux participants acceptés'; p._members = p.members && p.members.length ? p.members : []; }

  // ---------- routes ----------
  const CRUISE_KEYS = ['height_cm', 'weight_kg', 'body_type', 'identity', 'tribes', 'can', 'vibes', 'endowment_cm', 'cut', 'safer', 'health_visibility',
    'bio', 'job', 'neighborhood', 'position', 'position_visibility', 'intimate_visibility', 'map_precision', 'messages_from', 'hide_from_map', 'show_distance',
    'album_matches_only', 'blur_explicit', 'discreet_icon', 'vanilla', 'units', 'auto_checkin', 'liveplay'];
  const listOf = (v) => (Array.isArray(v) ? v : String(v || '').split(',').filter(Boolean));
  // Demande d'adhésion jouée dans la démo : un candidat fictif, rien n'est envoyé. Âge vérifié d'un clic, puis l'attente.
  const applicantFrom = (b) => Object.assign(JSON.parse(JSON.stringify(member)), {
    id: 990001, first_name: String(b.first_name || 'Toi').slice(0, 40), city: b.city || 'Paris', bio: b.bio || '', seeking: listOf(b.seeking),
    photos: [], status: 'pending', id_check_status: 'none', presence: null, trip: null, referral_code: 'TOI-4F2A',
    waitlist_position: 37, review_delay_hours: 48,
    checks: { age_verified: false, photo_approved: false, photo_pending: false, profile_complete: !!(b.bio && listOf(b.seeking).length), vouches: 0, vouches_required: 2 }
  });
  const routes = [
    ['GET', /^\/api\/meta$/, () => D.meta],
    ['GET', /^\/api\/me$/, () => (logged ? me : fail(401, 'Connecte-toi pour continuer.'))],
    ['PATCH', /^\/api\/me$/, (m, b) => {
      for (const k of CRUISE_KEYS) if (k in b) me[k] = b[k];
      if ('marketing_emails' in b) me.marketing_emails = !!b.marketing_emails;
      for (const k of ['seeking', 'tastes', 'intimate']) if (k in b) me[k] = listOf(b[k]);
      if (b.health_consent === false) Object.assign(me, { hiv_status: null, last_test: null, health_consent: false });
      else if (b.health_consent === true) Object.assign(me, { health_consent: true, hiv_status: b.hiv_status ?? me.hiv_status, last_test: b.last_test ?? me.last_test });
      return me;
    }],
    ['PATCH', /^\/api\/me\/photos\/(\d+)$/, (m, b) => {
      const photo = me.photos.find((p) => String(p.id) === m[1]) || fail(404, 'Photo introuvable.');
      photo.explicit = !!b.explicit;
      return { id: photo.id, explicit: photo.explicit };
    }],
    ['POST', /^\/api\/auth\/(login|register)$/, (m, b) => { logged = true; me = m[1] === 'register' ? applicantFrom(b) : member; return { role: 'member', status: me.status }; }],
    ['POST', /^\/api\/auth\/logout$/, () => { logged = false; me = member; return { ok: true }; }],
    ['POST', /^\/api\/me\/id-check$/, () => {
      if (me !== member) Object.assign(me, { status: 'waitlist', id_check_status: 'verified', checks: { ...me.checks, age_verified: true } });
      return { status: 'verified' };
    }],
    ['POST', /^\/api\/me\/photos$/, (m, b) => {
      const id = nextId++;
      uploaded[id] = b.data;
      if (b.alternate) { me.alternate = { id, status: 'pending' }; return { id, status: 'pending', alternate: true }; }
      me.photos.push({ id, status: 'pending', explicit: !!b.explicit });
      if (me.checks) me.checks.photo_pending = true;
      return { id, status: 'pending', explicit: !!b.explicit };
    }],
    ['DELETE', /^\/api\/me\/photos\/(\d+)$/, (m) => {
      if (me.alternate && String(me.alternate.id) === m[1]) { me.alternate = null; return { ok: true }; }
      const i = me.photos.findIndex((p) => String(p.id) === m[1]);
      if (i < 0) fail(404, 'Photo introuvable.');
      me.photos.splice(i, 1);
      return { ok: true };
    }],
    ['GET', /^\/api\/live\/map$/, (m, b, q) => mapView(q)],
    ['GET', /^\/api\/live\/people$/, (m, b, q) => peopleView(q)],
    ['GET', /^\/api\/users\/(\d+)$/, (m) => ({ ...userOf(Number(m[1])), favorite: favorites.has(Number(m[1])) })],
    ['PUT', /^\/api\/me\/presence$/, (m, b) => { me.presence = { until: now() + Number(b.minutes || 60) * MIN, place: b.place || null, note: b.note || null }; return { until: me.presence.until }; }],
    ['DELETE', /^\/api\/me\/presence$/, () => { me.presence = null; }],
    ['PUT', /^\/api\/me\/trip$/, (m, b) => {
      const CITY = { Paris: [48.8566, 2.3522], Lyon: [45.764, 4.8357], Marseille: [43.2965, 5.3698], Toulouse: [43.6047, 1.4442], Nice: [43.7102, 7.262], Nantes: [47.2184, -1.5536],
        Montpellier: [43.6108, 3.8767], Strasbourg: [48.5734, 7.7521], Bordeaux: [44.8378, -0.5792], Lille: [50.6292, 3.0573], Rennes: [48.1173, -1.6778], Grenoble: [45.1885, 5.7245],
        Bruxelles: [50.8503, 4.3517], 'Genève': [46.2044, 6.1432], Zurich: [47.3769, 8.5417], Amsterdam: [52.3676, 4.9041], Berlin: [52.52, 13.405], Londres: [51.5072, -0.1276],
        Barcelone: [41.3874, 2.1686], Madrid: [40.4168, -3.7038], Lisbonne: [38.7223, -9.1393], Rome: [41.9028, 12.4964], Milan: [45.4642, 9.19], Sitges: [41.237, 1.8059],
        Mykonos: [37.4467, 25.3289], 'Gran Canaria': [27.7606, -15.586], Ibiza: [38.9067, 1.4206], Prague: [50.0755, 14.4378], Vienne: [48.2082, 16.3738], Copenhague: [55.6761, 12.5683],
        'Montréal': [45.5019, -73.5674], 'New York': [40.7128, -74.006] };
      const at = b.city ? CITY[b.city] || fail(400, 'Ville inconnue.') : [Number(b.lat), Number(b.lng)];
      me.trip = { label: b.city || 'Point choisi sur la carte', until: now() + Number(b.days || 3) * DAY, lat: at[0], lng: at[1] };
      return { trip: me.trip };
    }],
    ['DELETE', /^\/api\/me\/trip$/, () => { me.trip = null; }],
    ['PUT', /^\/api\/me\/location$/, () => { me.location = { ...me.location, enabled: true, consent: true, updated_at: now() }; }],
    ['DELETE', /^\/api\/me\/location$/, () => fail(400, 'Démo : la position de démonstration reste activée.')],
    ['GET', /^\/api\/favorites$/, () => ({ ids: [...favorites] })],
    ['PUT', /^\/api\/favorites\/(\d+)$/, (m) => { favorites.add(Number(m[1])); }],
    ['DELETE', /^\/api\/favorites\/(\d+)$/, (m) => { favorites.delete(Number(m[1])); }],
    ['POST', /^\/api\/conversations$/, (m, b) => openConversation(Number(b.user_id))],
    ['GET', /^\/api\/matches$/, () => ({ matches: [...D.matches].sort((a, b) => ((b.last && b.last.created_at) || b.created_at) - ((a.last && a.last.created_at) || a.created_at)) })],
    ['GET', /^\/api\/matches\/(\d+)\/messages$/, (m, b, q) => {
      const t = thread(m[1]);
      const after = Number(q.get('after') || 0);
      const match = D.matches.find((x) => String(x.id) === m[1]);
      if (match) match.unread = false;
      // LivePlay : le bouton d'appel apparaît dans les conversations où les deux ont écrit (et si je suis dispo).
      const canCall = !!me.liveplay && t.messages.some((x) => x.mine) && t.messages.some((x) => !x.mine);
      return { ...t, can_call: canCall, messages: t.messages.filter((x) => x.id > after) };
    }],
    ['POST', /^\/api\/matches\/(\d+)\/messages$/, (m, b) => {
      const body = String(b.body || '').trim() || fail(400, 'Message vide.');
      const msg = addMessage(m[1], { mine: true, body });
      autoReply(m[1]);
      return { id: msg.id };
    }],
    ['POST', /^\/api\/matches\/(\d+)\/photos$/, (m, b) => {
      const t = thread(m[1]);
      if (!t.can_send_photo) fail(403, 'Tu pourras envoyer des photos dès sa première réponse.');
      const photoId = nextId++;
      uploaded[photoId] = b.data;
      const msg = addMessage(m[1], { mine: true, kind: 'photo', body: 'Photo', photo_id: photoId });
      autoReply(m[1]);
      return { id: msg.id, photo_id: photoId };
    }],
    ['DELETE', /^\/api\/matches\/(\d+)\/photos\/(\d+)$/, (m) => {
      const msg = thread(m[1]).messages.find((x) => String(x.photo_id) === m[2] && x.mine) || fail(404, 'Photo introuvable.');
      delete uploaded[msg.photo_id];
      Object.assign(msg, { photo_id: null, body: 'Photo retirée' });
    }],
    ['GET', /^\/api\/albums\/received$/, () => D.received],
    ['GET', /^\/api\/albums\/shared\/(\d+)$/, (m) => D.shared[m[1]] || fail(404, 'Album introuvable.')],
    ['POST', /^\/api\/albums\/(\d+)\/request$/, () => ({ ok: true })],
    ['GET', /^\/api\/me\/albums$/, () => D.myAlbums],
    ['GET', /^\/api\/blocks$/, () => D.blocks],
    ['POST', /^\/api\/blocks$/, () => ({ ok: true })],
    ['GET', /^\/api\/billing$/, () => D.billing],
    ['GET', /^\/api\/notices$/, () => D.notices],
    ['POST', /^\/api\/reports$/, () => ({ id: nextId++ })],
    ['POST', /^\/api\/spots$/, () => ({ id: nextId++, status: 'pending' })],
    ['POST', /^\/api\/spots\/(\d+)\/checkin$/, (m) => { checkins[m[1]] = true; return { until: now() + 120 * MIN }; }],
    ['DELETE', /^\/api\/spots\/(\d+)\/checkin$/, (m) => { delete checkins[m[1]]; }],
    // Réglages du compte : rien n'est envoyé, la démo fait comme si.
    ['POST', /^\/api\/me\/email$/, (m, b) => {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.email || ''))) fail(400, 'E-mail invalide.');
      if (!b.password) fail(401, 'Mot de passe incorrect.');
      me.email = String(b.email).toLowerCase();
      return { ok: true, email: me.email };
    }],
    ['POST', /^\/api\/me\/password$/, (m, b) => {
      if (!b.current) fail(401, 'Mot de passe actuel incorrect.');
      if (String(b.password || '').length < 10) fail(400, 'Mot de passe : 10 caractères minimum.');
      return { ok: true, other_sessions_closed: 0 };
    }],
    // LivePlay relie deux vrais appareils : la démo ne fait pas semblant d'appeler quelqu'un.
    ['GET', /^\/api\/calls\/current$/, () => ({ call: null })],
    ['GET', /^\/api\/calls\/ice$/, () => fail(403, 'Démo : LivePlay relie deux vrais appareils (caméra et micro) ; l’appel n’est pas simulé ici.')],
    ['GET', /^\/api\/plans\/nearby$/, () => {
      const o = offset();
      return { located: true, center: moved({ ...HOME }, o),
        plans: Object.values(D.plans).filter((p) => p.status === 'open' && p.ends_at > now()).map((p) => moved(planList(p), o)).sort((a, b) => a.starts_at - b.starts_at) };
    }],
    ['POST', /^\/api\/plans\/(\d+)\/cover$/, (m, b) => {
      const p = plan(m[1]);
      const id = nextId++;
      uploaded[id] = b.data;
      p.cover = { id, status: 'pending' };
      return { id, status: 'pending' };
    }],
    ['DELETE', /^\/api\/plans\/(\d+)\/cover$/, (m) => { plan(m[1]).cover = null; }],
    ['GET', /^\/api\/plans\/mine$/, () => ({ plans: Object.values(D.plans).filter((p) => p.status === 'open' && ['host', 'accepted', 'requested'].includes(p.my_status)).map(planList) })],
    ['POST', /^\/api\/plans$/, (m, b) => {
      if (!b.rules) fail(400, "Confirme les règles : adultes consentants, pas d'argent, pas de drogue.");
      const title = String(b.title || '').trim() || fail(400, 'Titre : champ obligatoire.');
      if (/(€|\beuros?\b|\btarif|\bpayant|\bescort)/i.test(`${title} ${b.description || ''}`)) fail(400, "Pas d'argent : un plan à plusieurs ne peut demander ni paiement ni participation.");
      if (Object.values(D.plans).some((p) => p.my_status === 'host' && p.status === 'open' && p.ends_at > now())) fail(409, 'Tu organises déjà un plan. Termine-le ou annule-le avant d’en créer un autre.');
      const id = nextId++;
      const starts = b.starts_at ? Math.max(Number(b.starts_at), now()) : now() + Number(b.starts_in || 0) * MIN;
      const cell = (v) => Math.floor(v / 0.01) * 0.01 + 0.005;
      const o = offset();
      D.plans[id] = { id, title, description: b.description || null, place_kind: b.place_kind, starts_at: starts, ends_at: starts + Number(b.duration || 120) * MIN, status: 'open',
        lat: cell(Number(b.lat)) - o.lat, lng: cell(Number(b.lng)) - o.lng, max_guests: Number(b.max_guests) || 4, going: 0, host: mine(), my_status: 'host', distance: 'Moins de 1 km',
        pending: 1, _address: b.address || null, _members: [],
        requests: [{ ...cardOf(D.map.pins[0].id), message: 'Dispo, je peux venir ?', asked_at: now() }].map((r) => ({ id: r.id, first_name: r.first_name, photo: r.photo, message: r.message, asked_at: r.asked_at })) };
      D.planMessages[id] = [];
      return { id };
    }],
    ['GET', /^\/api\/plans\/(\d+)$/, (m) => planDetail(plan(m[1]))],
    ['POST', /^\/api\/plans\/(\d+)\/join$/, (m) => {
      const p = plan(m[1]);
      p.my_status = 'requested';
      // Dans la démo, l'hôte accepte au bout de quelques secondes.
      setTimeout(() => {
        if (p.my_status !== 'requested') return;
        p.my_status = 'accepted';
        p.going += 1;
        p._members = [...p._members, mine()];
        D.planMessages[p.id] = D.planMessages[p.id] || [{ id: nextId++, mine: false, sender: p.host.first_name, host: true, removed: false, body: 'Bienvenue. Dis-moi quand tu es en bas.', created_at: now() }];
      }, 5000);
      return { status: 'requested' };
    }],
    ['POST', /^\/api\/plans\/(\d+)\/requests\/(\d+)$/, (m, b) => {
      const p = plan(m[1]);
      const r = (p.requests || []).find((x) => String(x.id) === m[2]) || fail(404, 'Demande introuvable.');
      p.requests = p.requests.filter((x) => x !== r);
      p.pending = p.requests.length;
      if (b.decision === 'accept') { p.going += 1; p._members = [...p._members, { id: r.id, first_name: r.first_name, photo: r.photo }]; }
      return { status: b.decision === 'accept' ? 'accepted' : 'declined' };
    }],
    ['POST', /^\/api\/plans\/(\d+)\/leave$/, (m) => {
      const p = plan(m[1]);
      if (p.my_status === 'accepted') { p.going -= 1; p._members = p._members.filter((x) => x.id !== me.id); }
      p.my_status = 'left';
    }],
    ['DELETE', /^\/api\/plans\/(\d+)$/, (m) => { plan(m[1]).status = 'cancelled'; }],
    ['GET', /^\/api\/plans\/(\d+)\/messages$/, (m, b, q) => {
      const p = plan(m[1]);
      if (!['host', 'accepted'].includes(p.my_status)) fail(403, 'La discussion est réservée aux participants acceptés.');
      const after = Number(q.get('after') || 0);
      return { plan: planDetail(p), messages: (D.planMessages[p.id] || []).filter((x) => x.id > after) };
    }],
    ['POST', /^\/api\/plans\/(\d+)\/messages$/, (m, b) => {
      const p = plan(m[1]);
      const msg = { id: nextId++, mine: true, sender: me.first_name, host: p.my_status === 'host', removed: false, body: String(b.body || ''), created_at: now() };
      (D.planMessages[p.id] = D.planMessages[p.id] || []).push(msg);
      return { id: msg.id };
    }]
  ];

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const path = typeof input === 'string' && input.startsWith('/api/') ? input.split('?')[0] : null;
    if (!path) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    const query = new URLSearchParams(input.split('?')[1] || '');
    let body = {};
    try { body = init.body ? JSON.parse(init.body) : {}; } catch { /* corps vide */ }
    await new Promise((r) => setTimeout(r, 60));
    try {
      for (const [verb, re, handler] of routes) {
        const m = verb === method && re.exec(path);
        if (m) return json(200, handler(m, body, query) ?? { ok: true });
      }
      void url;
      return json(400, { error: DEMO_ONLY });
    } catch (e) {
      if (e instanceof Fail) return json(e.status, { error: e.message });
      console.error(e);
      return json(500, { error: 'Erreur de la démo.' });
    }
  };
  function json(status, data) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  }

  // Fond de carte : les tuiles copiées dans la démo si elles existent, sinon le plan dessiné. Puis l'étiquette « démo ».
  const L = window.L;
  if (L) {
    const createMap = L.map;
    L.map = function demoMap(...args) {
      const map = createMap.apply(this, args);
      if (D.tiles) {
        map.setMinZoom(D.tiles.minZoom);
        map.setMaxZoom(D.tiles.maxZoom);
        if (!me.trip) map.setMaxBounds(L.latLngBounds(D.tiles.bounds).pad(0.05));
      } else if (window.demoBasemap) {
        map.options.minZoom = 11;
        map.options.maxZoom = 16;
        window.demoBasemap(map);
      }
      return map;
    };
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="legal/"]');
    if (a) a.removeAttribute('target'); // dans la démo, les pages légales s'ouvrent dans la même fenêtre
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    const tag = document.createElement('div');
    tag.className = 'demo-tag';
    tag.textContent = 'Démo · profils fictifs';
    document.body.appendChild(tag);
    // Pendant une demande d'adhésion jouée dans la démo : un bouton pour voir ensuite l'app comme un membre accepté.
    const accept = document.createElement('button');
    accept.className = 'demo-accept';
    accept.type = 'button';
    accept.textContent = 'Démo : voir l’app comme un membre accepté';
    accept.hidden = true;
    accept.addEventListener('click', () => { location.hash = '#/map'; location.reload(); });
    document.body.appendChild(accept);
    setInterval(() => { accept.hidden = !(logged && me !== member && me.status === 'waitlist'); }, 400);
  });
})();

// Carte en direct (édition « cruise ») : membres disponibles autour de soi, lieux, conversations ouvertes.
//
// Ce qui protège les membres :
//  - un point sur la carte n'est jamais la vraie position : position arrondie à l'enregistrement,
//    puis placée au centre d'une case de 500 m ou 1 km (au choix) avec un léger décalage fixe pour la journée ;
//  - « seulement dans une zone » : la personne n'a pas de point, elle compte dans une zone d'au moins k membres ;
//  - distances par tranches, mises à jour de position limitées, incognito, absence de la carte au choix ;
//  - premiers messages limités (nombre par jour, 3 messages sans réponse au plus), préférences de réception ;
//  - les lieux sont des établissements validés par la modération, jamais des lieux publics de drague.
import { fail } from './http.mjs';
import { requireMember, requireAdmin } from './auth.mjs';
import { getSetting, audit } from './db.mjs';
import { SPOT_CATEGORIES, PRESENCE_PLACES } from './options.mjs';
import { DAY, str, visibleMember, conversationBetween, profilePhotoIds } from './core.mjs';
import { hasFeature } from './billing.mjs';
import { haversineKm, clusters } from './geo.mjs';
import { locatedMembers, card, readFilters, passesFilters } from './nearby.mjs';
import { effectiveLocation } from './cruise.mjs';
import { plansAround } from './plans.mjs';

const VIEW_RADIUS_KM = 12;
const PRECISION_DEG = { '500m': 0.005, '1km': 0.01 };
const PRESENCE_MINUTES = [30, 60, 120, 240];

// Nombre pseudo-aléatoire stable pour un membre et une journée, entre 0 et 1.
function unit(seed) {
  let x = (seed ^ Math.floor(Date.now() / DAY) * 2654435761) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// Point affiché sur la carte : centre de la case + décalage fixe pour la journée. Jamais la position réelle.
export function pinPosition(u) {
  const p = PRECISION_DEG[u.map_precision] || PRECISION_DEG['1km'];
  return {
    lat: Math.floor(u.lat / p) * p + p / 2 + (unit(u.id * 2 + 1) - 0.5) * p * 0.6,
    lng: Math.floor(u.lng / p) * p + p / 2 + (unit(u.id * 2 + 2) - 0.5) * p * 0.6
  };
}

function viewCenter(ctx, u) {
  const lat = Number(ctx.query.get('lat'));
  const lng = Number(ctx.query.get('lng'));
  const center = Number.isFinite(lat) && Number.isFinite(lng) && ctx.query.has('lat') ? { lat, lng } : (u.lat != null ? { lat: u.lat, lng: u.lng } : null);
  if (!center) return null;
  // Sans abonnement (quand le payant est activé) : seulement autour de sa propre position.
  if (!hasFeature(ctx.db, u, 'extended_map')) {
    const limit = Number(getSetting(ctx.db, 'free_map_radius_km'));
    if (u.lat == null || haversineKm(u.lat, u.lng, center.lat, center.lng) > limit) {
      fail(402, `Explorer la carte à plus de ${limit} km fait partie de la version payante.`);
    }
  }
  return center;
}

function presenceOf(x) {
  return x.presence_until > Date.now() ? { until: x.presence_until, note: x.presence_note, place: x.presence_place } : null;
}

function spotsAround(db, u, center) {
  const now = Date.now();
  return db.prepare("SELECT * FROM spots WHERE status = 'approved'").all()
    .filter((s) => haversineKm(center.lat, center.lng, s.lat, s.lng) <= VIEW_RADIUS_KM)
    .map((s) => ({
      id: s.id, name: s.name, category: s.category, description: s.description, lat: s.lat, lng: s.lng,
      here: db.prepare('SELECT COUNT(*) AS n FROM spot_checkins WHERE spot_id = ? AND until > ?').get(s.id, now).n,
      i_am_here: !!db.prepare('SELECT 1 FROM spot_checkins WHERE spot_id = ? AND user_id = ? AND until > ?').get(s.id, u.id, now)
    }));
}

export function registerLiveRoutes(r) {
  // --- présence « dispo maintenant » ---
  r.put('/api/me/presence', (ctx) => {
    const u = requireMember(ctx);
    const minutes = Number(ctx.body.minutes);
    if (!PRESENCE_MINUTES.includes(minutes)) fail(400, 'Durée inconnue.');
    const place = ctx.body.place || null;
    if (place && !PRESENCE_PLACES[place]) fail(400, 'Lieu inconnu.');
    const note = str(ctx.body.note, 80, { label: 'Message' });
    const until = Date.now() + minutes * 60e3;
    ctx.db.prepare('UPDATE users SET presence_until = ?, presence_note = ?, presence_place = ? WHERE id = ?').run(until, note, place, u.id);
    return { until };
  });

  r.delete('/api/me/presence', (ctx) => {
    const u = requireMember(ctx);
    ctx.db.prepare('UPDATE users SET presence_until = NULL, presence_note = NULL, presence_place = NULL WHERE id = ?').run(u.id);
    return { ok: true };
  });

  // --- carte en direct ---
  r.get('/api/live/map', (ctx) => {
    const u = effectiveLocation(requireMember(ctx));
    if (ctx.config.edition !== 'cruise') fail(404, 'Route inconnue.');
    const db = ctx.db;
    const center = viewCenter(ctx, u);
    if (!center) return { located: false, pins: [], zones: [], spots: [], plans: [] };
    const f = readFilters(ctx, u);
    const around = locatedMembers(db, u).filter((x) => haversineKm(center.lat, center.lng, x.lat, x.lng) <= VIEW_RADIUS_KM && passesFilters(u, x, f));
    const onlyFree = ctx.query.get('available') === '1';
    const visible = onlyFree ? around.filter((x) => presenceOf(x)) : around;
    const pins = visible.filter((x) => x.map_precision !== 'zone').map((x) => ({ ...card(db, u, x), ...pinPosition(x), presence: presenceOf(x) }));
    const k = Number(getSetting(db, 'map_min_cluster'));
    const { zones, hidden } = clusters(visible.filter((x) => x.map_precision === 'zone'), k);
    return {
      located: u.lat != null,
      me: u.lat != null ? { ...pinPosition(u), precision: u.map_precision } : null,
      center, radius_km: VIEW_RADIUS_KM, min_cluster: k, hidden,
      pins,
      zones: zones.map((z) => ({ lat: z.lat, lng: z.lng, size_km: z.size_km, count: z.members.length, people: z.members.slice(0, 30).map((x) => ({ ...card(db, u, x), presence: presenceOf(x) })) })),
      spots: spotsAround(db, u, center),
      plans: plansAround(db, u, center)
    };
  });

  // Liste : disponibles d'abord, puis par tranche de distance.
  r.get('/api/live/people', (ctx) => {
    const u = effectiveLocation(requireMember(ctx));
    if (ctx.config.edition !== 'cruise') fail(404, 'Route inconnue.');
    if (u.lat == null) return { located: false, people: [] };
    const db = ctx.db;
    const f = readFilters(ctx, u);
    const favorites = new Set(db.prepare('SELECT target_id FROM favorites WHERE user_id = ?').all(u.id).map((x) => x.target_id));
    let people = locatedMembers(db, u).filter((x) => passesFilters(u, x, f)).map((x) => ({ ...card(db, u, x), presence: presenceOf(x), favorite: favorites.has(x.id) }));
    if (ctx.query.get('favorites') === '1') people = people.filter((x) => x.favorite);
    // Dispos d'abord, puis en ligne, puis les autres.
    const order = (p) => (p.presence ? 0 : p.online === 'now' ? 1 : 2);
    return { located: true, people: people.sort((a, b) => order(a) - order(b)).slice(0, 90) };
  });

  // --- écrire à quelqu'un depuis la carte ---
  r.post('/api/conversations', (ctx) => {
    const u = requireMember(ctx);
    if (ctx.config.edition !== 'cruise') fail(404, 'Route inconnue.');
    const db = ctx.db;
    const target = visibleMember(db, u, ctx.body.user_id);
    const existing = conversationBetween(db, u.id, target.id);
    if (existing) return { id: existing.id };
    if (target.messages_from === 'nobody') fail(403, `${target.first_name} accepte des messages seulement de ses matchs.`);
    if (target.messages_from === 'photo' && !profilePhotoIds(db, u.id, false).length) fail(403, `${target.first_name} accepte des messages seulement des profils avec une photo validée.`);
    const opened = db.prepare('SELECT COUNT(*) AS n FROM matches WHERE opened_by = ? AND created_at > ?').get(u.id, Date.now() - DAY).n;
    if (opened >= Number(getSetting(db, 'daily_new_chats'))) fail(429, "Tu as lancé beaucoup de conversations aujourd'hui. Réessaie demain.");
    const [a, b] = u.id < target.id ? [u.id, target.id] : [target.id, u.id];
    const info = db.prepare("INSERT INTO matches (a_id, b_id, origin, opened_by, created_at) VALUES (?, ?, 'chat', ?, ?)").run(a, b, u.id, Date.now());
    return { id: Number(info.lastInsertRowid) };
  });

  // --- lieux ---
  r.post('/api/spots', (ctx) => {
    const u = requireMember(ctx);
    const b = ctx.body;
    const name = str(b.name, 80, { required: true, label: 'Nom du lieu' });
    if (!SPOT_CATEGORIES[b.category]) fail(400, 'Catégorie inconnue.');
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail(400, 'Position invalide.');
    const pending = ctx.db.prepare("SELECT COUNT(*) AS n FROM spots WHERE created_by = ? AND status = 'pending'").get(u.id).n;
    if (pending >= 5) fail(429, 'Tu as déjà 5 lieux en attente de validation.');
    const info = ctx.db.prepare('INSERT INTO spots (name, category, description, lat, lng, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, b.category, str(b.description, 300, { label: 'Description' }), lat, lng, u.id, Date.now());
    return { id: Number(info.lastInsertRowid), status: 'pending' };
  });

  r.post('/api/spots/:id/checkin', (ctx) => {
    const u = requireMember(ctx);
    const s = ctx.db.prepare("SELECT * FROM spots WHERE id = ? AND status = 'approved'").get(Number(ctx.params.id));
    if (!s) fail(404, 'Lieu introuvable.');
    const until = Date.now() + 2 * 3600e3;
    ctx.db.prepare(`INSERT INTO spot_checkins (spot_id, user_id, until) VALUES (?, ?, ?)
      ON CONFLICT (spot_id, user_id) DO UPDATE SET until = excluded.until`).run(s.id, u.id, until);
    return { until };
  });

  r.delete('/api/spots/:id/checkin', (ctx) => {
    const u = requireMember(ctx);
    ctx.db.prepare('DELETE FROM spot_checkins WHERE spot_id = ? AND user_id = ?').run(Number(ctx.params.id), u.id);
    return { ok: true };
  });

  // --- back office : lieux ---
  r.get('/api/admin/spots', (ctx) => {
    requireAdmin(ctx);
    const status = ['pending', 'approved', 'rejected'].includes(ctx.query.get('status')) ? ctx.query.get('status') : 'pending';
    return {
      categories: SPOT_CATEGORIES,
      spots: ctx.db.prepare(`SELECT s.*, u.first_name AS creator FROM spots s LEFT JOIN users u ON u.id = s.created_by
        WHERE s.status = ? ORDER BY s.created_at DESC LIMIT 300`).all(status)
    };
  });

  r.post('/api/admin/spots', (ctx) => {
    const admin = requireAdmin(ctx);
    const b = ctx.body;
    const name = str(b.name, 80, { required: true, label: 'Nom du lieu' });
    if (!SPOT_CATEGORIES[b.category]) fail(400, 'Catégorie inconnue.');
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) fail(400, 'Position invalide.');
    const info = ctx.db.prepare("INSERT INTO spots (name, category, description, lat, lng, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)")
      .run(name, b.category, str(b.description, 300, { label: 'Description' }), lat, lng, admin.id, Date.now());
    audit(ctx.db, admin.id, 'spot_created', `spot:${info.lastInsertRowid}`, { name });
    return { id: Number(info.lastInsertRowid) };
  });

  r.post('/api/admin/spots/:id/review', (ctx) => {
    const admin = requireAdmin(ctx);
    const s = ctx.db.prepare('SELECT * FROM spots WHERE id = ?').get(Number(ctx.params.id));
    if (!s) fail(404, 'Lieu introuvable.');
    const decision = ctx.body.decision === 'approve' ? 'approved' : 'rejected';
    ctx.db.prepare('UPDATE spots SET status = ? WHERE id = ?').run(decision, s.id);
    if (decision === 'rejected') ctx.db.prepare('DELETE FROM spot_checkins WHERE spot_id = ?').run(s.id);
    audit(ctx.db, admin.id, `spot_${decision}`, `spot:${s.id}`, { name: s.name });
    return { ok: true };
  });
}


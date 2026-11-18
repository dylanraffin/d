// « Autour de moi » (grille par distance) et carte par zones.
// Protections contre la localisation d'un membre : position arrondie à environ 500 m avant stockage,
// une mise à jour par minute au plus, distances par tranches, ordre aléatoire à l'intérieur d'une tranche,
// zones de carte d'au moins k membres, jamais de coordonnées d'autrui envoyées à l'app.
import { fail } from './http.mjs';
import { requireMember } from './auth.mjs';
import { getSetting } from './db.mjs';
import { NEIGHBORHOODS, CITIES, POSITIONS, SEEKING, pickList } from './options.mjs';
import { hasFeature } from './billing.mjs';
import { snap, MIN_UPDATE_MS, distanceBetween, dailyShuffleKey, clusters, BUCKETS } from './geo.mjs';
import { DAY, ageOf, hiddenBetween, profilePhotoIds, shownProfilePhoto } from './core.mjs';
import { cruiseCard, effectiveLocation } from './cruise.mjs';

function freshSince(db) {
  return Date.now() - Number(getSetting(db, 'location_ttl_days')) * DAY;
}

// Membres localisés que `viewer` a le droit de voir dans Autour / Carte.
export function locatedMembers(db, viewer) {
  // Un membre en voyage apparaît à son point de voyage, même si sa position habituelle n'est plus à jour.
  const rows = db.prepare(`SELECT * FROM users WHERE status = 'member' AND id != ? AND hide_from_map = 0
    AND ((lat IS NOT NULL AND location_updated_at > ?) OR (trip_until > ? AND trip_lat IS NOT NULL))`).all(viewer.id, freshSince(db), Date.now())
    .map(effectiveLocation);
  return rows.filter((x) => {
    if (hiddenBetween(db, viewer.id, x.id)) return false;
    // Incognito : visible seulement des personnes que l'on a likées.
    if (x.incognito && !db.prepare('SELECT 1 FROM likes WHERE from_id = ? AND to_id = ? AND value = 1').get(x.id, viewer.id)) return false;
    return true;
  });
}

export function card(db, viewer, x) {
  const d = distanceBetween(viewer, x);
  return {
    id: x.id, first_name: x.first_name, age: ageOf(x), ...shownProfilePhoto(db, viewer, x.id),
    distance: x.show_distance ? (d ? d.label : null) : 'Distance masquée',
    position: x.position && x.position_visibility === 'members' ? x.position : null,
    online_recently: x.location_updated_at > Date.now() - 3600e3,
    ...cruiseCard(x)
  };
}

// Filtres avancés : âge, distance maximale, position (seulement si elle est publique), recherche.
export function readFilters(ctx, user) {
  const q = ctx.query;
  const f = {
    age_min: Number(q.get('age_min')) || null,
    age_max: Number(q.get('age_max')) || null,
    max_km: Number(q.get('max_km')) || null,
    position: pickList(q.get('position'), POSITIONS),
    seeking: pickList(q.get('seeking'), SEEKING)
  };
  const used = f.age_min || f.age_max || f.max_km || f.position.length || f.seeking.length;
  if (used && !hasFeature(ctx.db, user, 'advanced_filters')) fail(402, `Les filtres avancés font partie de ${ctx.config.brand.plus}.`);
  return f;
}

export function passesFilters(viewer, x, f) {
  const age = ageOf(x);
  if (f.age_min && age < f.age_min) return false;
  if (f.age_max && age > f.age_max) return false;
  if (f.position.length && !(x.position_visibility === 'members' && f.position.includes(x.position))) return false;
  if (f.seeking.length && !String(x.seeking || '').split(',').some((s) => f.seeking.includes(s))) return false;
  if (f.max_km) {
    const d = distanceBetween(viewer, x);
    if (!d || d.max_km > f.max_km) return false;
  }
  return true;
}

export function registerNearbyRoutes(r) {
  r.put('/api/me/location', (ctx) => {
    const u = requireMember(ctx);
    const b = ctx.body;
    if (!u.geo_consent_at && !b.consent) fail(400, 'Ton accord est nécessaire pour utiliser ta position.');
    const now = Date.now();
    let lat;
    let lng;
    let source;
    let city = null;
    if (b.neighborhood) {
      const c = NEIGHBORHOODS[b.neighborhood];
      if (!c) fail(400, 'Quartier inconnu.');
      [lat, lng] = c;
      source = 'neighborhood';
      city = 'Paris';
    } else if (b.city) {
      // Sans GPS, partout dans le monde : un point tiré au hasard à quelques kilomètres du centre de la ville choisie.
      const c = CITIES[b.city];
      if (!c) fail(400, 'Ville inconnue.');
      lat = c[0] + (Math.random() - 0.5) * 0.05;
      lng = c[1] + (Math.random() - 0.5) * 0.07;
      source = 'city';
      city = b.city;
    } else {
      lat = Number(b.lat);
      lng = Number(b.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail(400, 'Position invalide.');
      source = 'gps';
      // Limite : empêche de « sonder » la distance en se déplaçant artificiellement.
      if (u.location_source === 'gps' && u.location_updated_at && now - u.location_updated_at < MIN_UPDATE_MS) {
        return { ok: true, updated: false };
      }
    }
    ctx.db.prepare(`UPDATE users SET lat = ?, lng = ?, location_source = ?, location_updated_at = ?,
      geo_consent_at = COALESCE(geo_consent_at, ?), neighborhood = CASE WHEN ? = 'city' THEN NULL ELSE COALESCE(?, neighborhood) END,
      city = COALESCE(?, city) WHERE id = ?`)
      .run(snap(lat), snap(lng), source, now, now, source, source === 'neighborhood' ? b.neighborhood : null, city, u.id);
    return { ok: true, updated: true };
  });

  // Retrait du consentement : la position est effacée.
  r.delete('/api/me/location', (ctx) => {
    const u = requireMember(ctx);
    ctx.db.prepare('UPDATE users SET lat = NULL, lng = NULL, location_source = NULL, location_updated_at = NULL, geo_consent_at = NULL WHERE id = ?').run(u.id);
    return { ok: true };
  });

  r.get('/api/nearby', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    if (u.lat == null) return { located: false, people: [] };
    const f = readFilters(ctx, u);
    const people = locatedMembers(db, u)
      .filter((x) => passesFilters(u, x, f))
      .map((x) => ({ x, d: distanceBetween(u, x), k: dailyShuffleKey(u.id, x.id) }))
      .sort((a, b) => (a.d.index - b.d.index) || (a.k - b.k))
      .slice(0, 90)
      .map(({ x }) => card(db, u, x));
    return { located: true, source: u.location_source, people, buckets: BUCKETS.map(([max, label]) => ({ max_km: max === Infinity ? null : max, label })) };
  });

  r.get('/api/map', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const k = Number(getSetting(db, 'map_min_cluster'));
    const { zones, hidden } = clusters(locatedMembers(db, u), k);
    return {
      me: u.lat != null ? { lat: u.lat, lng: u.lng, source: u.location_source } : null,
      min_cluster: k,
      hidden,
      zones: zones.map((z) => ({ lat: z.lat, lng: z.lng, size_km: z.size_km, count: z.members.length, people: z.members.slice(0, 30).map((x) => card(db, u, x)) }))
    };
  });
}

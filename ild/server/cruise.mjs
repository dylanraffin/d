// Direction « cruising » : fiche détaillée (stats, rôle, pratiques, santé), statut en ligne, mode voyage,
// favoris, photos envoyées dans le chat et accusés de lecture.
//
// Ce qui protège les membres :
//  - tout est facultatif ; pratiques et taille suivent la visibilité « intime », la santé a la sienne ;
//  - statut VIH et dépistage sont des données de santé : accord explicite séparé, et le retirer les efface ;
//  - pas de photo avant une réponse : celui qui lance la conversation ne peut pas envoyer d'image non sollicitée ;
//  - le mode voyage place le membre à un point qu'il choisit, jamais à sa position réelle.
import { fail } from './http.mjs';
import { requireMember } from './auth.mjs';
import { getSetting, tx } from './db.mjs';
import { BODY_TYPES, IDENTITIES, TRIBES, CAN, VIBES, CUT, SAFER, HIV_STATUS, VISIBILITY, TRIP_DAYS, CITIES, pickList } from './options.mjs';
import { DAY, str, saveJpeg, scanImage, deleteFiles, hiddenBetween, visibleMember } from './core.mjs';
import { hasFeature, requireFeature } from './billing.mjs';
import { snap } from './geo.mjs';

const list = (s) => (s ? String(s).split(',').filter(Boolean) : []);
const NEW_PROFILE_DAYS = 7;

function intIn(v, min, max, label) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${label} : entre ${min} et ${max}.`);
  return n;
}
function oneOf(v, options, label) {
  if (!v) return null;
  if (!options[v]) fail(400, `${label} : choix inconnu.`);
  return v;
}
function lastTest(v) {
  if (!v) return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v))) fail(400, 'Dépistage : indique le mois et l’année.');
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (v > current || v < '1990-01') fail(400, 'Dépistage : date invalide.');
  return v;
}

// Champs acceptés par PATCH /api/me. `u` est le compte avant modification.
export function cruiseFields(b, u) {
  const set = {};
  if ('height_cm' in b) set.height_cm = intIn(b.height_cm, 140, 220, 'Taille');
  if ('weight_kg' in b) set.weight_kg = intIn(b.weight_kg, 40, 200, 'Poids');
  if ('body_type' in b) set.body_type = oneOf(b.body_type, BODY_TYPES, 'Morphologie');
  if ('identity' in b) set.identity = oneOf(b.identity, IDENTITIES, 'Identité');
  if ('tribes' in b) set.tribes = pickList(b.tribes, TRIBES, 5).join(',') || null;
  if ('can' in b) set.can = pickList(b.can, CAN).join(',') || null;
  if ('vibes' in b) set.vibes = pickList(b.vibes, VIBES, 6).join(',') || null;
  if ('endowment_cm' in b) set.endowment_cm = intIn(b.endowment_cm, 5, 35, 'Taille du sexe');
  if ('cut' in b) set.cut = oneOf(b.cut, CUT, 'Circoncision');
  if ('safer' in b) set.safer = pickList(b.safer, SAFER).join(',') || null;
  if ('health_visibility' in b) {
    if (!VISIBILITY[b.health_visibility]) fail(400, 'Visibilité inconnue.');
    set.health_visibility = b.health_visibility;
  }
  if (b.health_consent === false) {
    // Retrait de l'accord : les données de santé sont effacées tout de suite.
    Object.assign(set, { hiv_status: null, last_test: null, health_consent_at: null });
  } else {
    const fills = ('hiv_status' in b && b.hiv_status) || ('last_test' in b && b.last_test);
    if (fills && b.health_consent !== true && !u.health_consent_at) {
      fail(400, 'Pour enregistrer ton statut ou ton dépistage, donne ton accord sur les données de santé.');
    }
    if (b.health_consent === true && !u.health_consent_at) set.health_consent_at = Date.now();
    if ('hiv_status' in b) set.hiv_status = oneOf(b.hiv_status, HIV_STATUS, 'Statut');
    if ('last_test' in b) set.last_test = lastTest(b.last_test);
  }
  return set;
}

export function onlineState(u) {
  const t = u.last_seen_at || 0;
  if (t > Date.now() - 5 * 60e3) return 'now';
  if (t > Date.now() - 3600e3) return 'recent';
  return null;
}

export const tripActive = (u) => u.trip_until > Date.now() && u.trip_lat != null;
const tripView = (u) => (tripActive(u) ? { label: u.trip_label, until: u.trip_until } : null);

// Position utilisée par la carte et les distances : le point de voyage quand un voyage est en cours.
export function effectiveLocation(u) {
  return tripActive(u) ? { ...u, lat: u.trip_lat, lng: u.trip_lng } : u;
}

// Résumé affiché sur la carte et dans les listes.
export function cruiseCard(u) {
  return {
    stats: { height_cm: u.height_cm, weight_kg: u.weight_kg, body_type: u.body_type },
    can: list(u.can),
    online: onlineState(u),
    new_profile: (u.accepted_at || u.created_at) > Date.now() - NEW_PROFILE_DAYS * DAY,
    trip: tripView(u)
  };
}

// Fiche vue par un autre membre. `canSee(visibilité)` vient de publicProfile.
export function cruiseProfile(u, canSee) {
  const health = u.health_consent_at && (u.hiv_status || u.last_test) && canSee(u.health_visibility);
  return {
    ...cruiseCard(u),
    stats: { height_cm: u.height_cm, weight_kg: u.weight_kg, body_type: u.body_type, identity: u.identity },
    tribes: list(u.tribes),
    vibes: list(u.vibes),
    endowment: canSee(u.intimate_visibility) && (u.endowment_cm || u.cut) ? { cm: u.endowment_cm, cut: u.cut } : null,
    safer: canSee(u.intimate_visibility) ? list(u.safer) : [],
    health: health ? { hiv_status: u.hiv_status, last_test: u.last_test } : null
  };
}

// Ses propres réglages.
export function cruiseOwn(u) {
  return {
    height_cm: u.height_cm, weight_kg: u.weight_kg, body_type: u.body_type, identity: u.identity,
    tribes: list(u.tribes), can: list(u.can), vibes: list(u.vibes),
    endowment_cm: u.endowment_cm, cut: u.cut, safer: list(u.safer),
    hiv_status: u.hiv_status, last_test: u.last_test, health_visibility: u.health_visibility, health_consent: !!u.health_consent_at,
    trip: tripActive(u) ? { label: u.trip_label, until: u.trip_until, lat: u.trip_lat, lng: u.trip_lng } : null
  };
}

function conversation(ctx, u) {
  const m = ctx.db.prepare('SELECT * FROM matches WHERE id = ?').get(Number(ctx.params.id));
  if (!m || (m.a_id !== u.id && m.b_id !== u.id)) fail(404, 'Conversation introuvable.');
  const otherId = m.a_id === u.id ? m.b_id : m.a_id;
  const other = ctx.db.prepare('SELECT status FROM users WHERE id = ?').get(otherId);
  if (!other || other.status !== 'member' || hiddenBetween(ctx.db, u.id, otherId)) fail(404, 'Conversation introuvable.');
  return { m, otherId };
}

// Lecture d'une conversation : note « lu jusqu'à maintenant » et renvoie l'accusé de lecture si le membre y a droit.
export function markRead(db, m, u) {
  const mine = m.a_id === u.id ? 'a_read_at' : 'b_read_at';
  db.prepare(`UPDATE matches SET ${mine} = ? WHERE id = ?`).run(Date.now(), m.id);
  if (!hasFeature(db, u, 'read_receipts')) return null;
  return (m.a_id === u.id ? m.b_read_at : m.a_read_at) || null;
}

export function registerCruiseRoutes(r) {
  // --- mode voyage ---
  r.put('/api/me/trip', (ctx) => {
    const u = requireMember(ctx);
    if (ctx.config.edition !== 'cruise') fail(404, 'Route inconnue.');
    requireFeature(ctx.db, u, 'travel_mode');
    const b = ctx.body;
    const days = Number(b.days || 3);
    if (!TRIP_DAYS.includes(days)) fail(400, 'Durée inconnue.');
    let lat;
    let lng;
    let label;
    if (b.city) {
      if (!CITIES[b.city]) fail(400, 'Ville inconnue.');
      [lat, lng] = CITIES[b.city];
      label = b.city;
    } else {
      lat = Number(b.lat);
      lng = Number(b.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) fail(400, 'Position invalide.');
      label = str(b.label, 60, { label: 'Nom du lieu' }) || 'Point choisi sur la carte';
    }
    const until = Date.now() + days * DAY;
    ctx.db.prepare('UPDATE users SET trip_lat = ?, trip_lng = ?, trip_label = ?, trip_until = ? WHERE id = ?').run(snap(lat), snap(lng), label, until, u.id);
    return { trip: { label, until, lat: snap(lat), lng: snap(lng) } };
  });

  r.delete('/api/me/trip', (ctx) => {
    const u = requireMember(ctx);
    ctx.db.prepare('UPDATE users SET trip_lat = NULL, trip_lng = NULL, trip_label = NULL, trip_until = NULL WHERE id = ?').run(u.id);
    return { ok: true };
  });

  // --- favoris (privés) ---
  r.get('/api/favorites', (ctx) => {
    const u = requireMember(ctx);
    return { ids: ctx.db.prepare('SELECT target_id FROM favorites WHERE user_id = ?').all(u.id).map((x) => x.target_id) };
  });

  r.put('/api/favorites/:id', (ctx) => {
    const u = requireMember(ctx);
    const target = visibleMember(ctx.db, u, ctx.params.id);
    if (ctx.db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?').get(u.id).n >= 200) fail(400, '200 favoris maximum.');
    ctx.db.prepare('INSERT OR IGNORE INTO favorites (user_id, target_id, created_at) VALUES (?, ?, ?)').run(u.id, target.id, Date.now());
    return { ok: true };
  });

  r.delete('/api/favorites/:id', (ctx) => {
    const u = requireMember(ctx);
    ctx.db.prepare('DELETE FROM favorites WHERE user_id = ? AND target_id = ?').run(u.id, Number(ctx.params.id));
    return { ok: true };
  });

  // --- photos dans le chat ---
  r.post('/api/matches/:id/photos', async (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const { m } = conversation(ctx, u);
    if (m.origin === 'chat' && !m.replied_at && m.opened_by === u.id) fail(403, 'Tu pourras envoyer des photos dès sa première réponse.');
    const today = db.prepare("SELECT COUNT(*) AS n FROM photos WHERE user_id = ? AND kind = 'chat' AND created_at > ?").get(u.id, Date.now() - DAY).n;
    if (today >= Number(getSetting(db, 'chat_photos_per_day'))) fail(429, "Tu as envoyé beaucoup de photos aujourd'hui. Réessaie demain.");
    const { file, buf } = saveJpeg(ctx, ctx.body.data);
    const scan = await scanImage(buf);
    if (!scan.ok) { deleteFiles(ctx, [file]); fail(400, 'Image refusée.'); }
    const now = Date.now();
    return tx(db, () => {
      const photoId = Number(db.prepare("INSERT INTO photos (user_id, kind, match_id, file, status, created_at) VALUES (?, 'chat', ?, ?, 'approved', ?)")
        .run(u.id, m.id, file, now).lastInsertRowid);
      const id = Number(db.prepare("INSERT INTO messages (match_id, sender_id, kind, body, photo_id, created_at) VALUES (?, ?, 'photo', 'Photo', ?, ?)")
        .run(m.id, u.id, photoId, now).lastInsertRowid);
      if (m.origin === 'chat' && !m.replied_at && m.opened_by !== u.id) db.prepare('UPDATE matches SET replied_at = ? WHERE id = ?').run(now, m.id);
      return { id, photo_id: photoId };
    });
  });

  // Retirer une photo envoyée : toujours possible, gratuit, immédiat.
  r.delete('/api/matches/:id/photos/:photoId', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(Number(ctx.params.id));
    if (!m || (m.a_id !== u.id && m.b_id !== u.id)) fail(404, 'Conversation introuvable.');
    const p = db.prepare("SELECT * FROM photos WHERE id = ? AND kind = 'chat' AND match_id = ? AND user_id = ?").get(Number(ctx.params.photoId), m.id, u.id);
    if (!p) fail(404, 'Photo introuvable.');
    deleteFiles(ctx, [p.file]);
    tx(db, () => {
      db.prepare("UPDATE messages SET body = 'Photo retirée', photo_id = NULL WHERE photo_id = ?").run(p.id);
      db.prepare('DELETE FROM photos WHERE id = ?').run(p.id);
    });
    return { ok: true };
  });
}

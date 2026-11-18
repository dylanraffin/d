// LivePlay : appel vidéo en direct entre deux membres, d'appareil à appareil (WebRTC).
// Le serveur ne voit jamais la vidéo : il met les deux appareils en relation (signalisation) puis s'efface.
//
// Ce qui protège les membres :
//  - il faut être soi-même « dispo pour LivePlay » pour appeler quelqu'un qui l'est aussi ;
//  - seulement dans une conversation où les deux ont déjà écrit (jamais un appel à froid) ;
//  - chaque appel est accepté ou refusé ; il sonne 40 s au plus ; un seul appel à la fois ;
//  - rien n'est enregistré ; l'image reçue peut être floutée ; signaler et bloquer restent à un geste ;
//  - les données techniques de connexion (qui contiennent des adresses IP) sont effacées à la fin de l'appel ;
//    l'historique (qui, quand, combien de temps) est gardé 30 jours pour traiter un signalement.
//  - avec un relais TURN configuré (ILD_TURN_URLS + ILD_TURN_SECRET), tout passe par le relais :
//    aucun des deux ne voit l'adresse IP de l'autre.
import { createHmac } from 'node:crypto';
import { fail } from './http.mjs';
import { requireMember, rateLimiter } from './auth.mjs';
import { getSetting } from './db.mjs';
import { hiddenBetween, shownProfilePhoto } from './core.mjs';

export const RING_MS = 40e3;          // un appel sonne 40 s au plus
const STALE_MS = 30e3;                // un appareil silencieux depuis 30 s a raccroché
const MAX_CALL_MS = 3 * 3600e3;       // un appel dure 3 h au plus
const MAX_SIGNAL_BYTES = 20000;
const callLimit = rateLimiter(10, 60 * 60e3); // 10 appels lancés par heure

const otherOf = (c, u) => (c.caller_id === u.id ? c.callee_id : c.caller_id);
const roleOf = (c, u) => (c.caller_id === u.id ? 'caller' : 'callee');

// Fin d'appel : on efface aussitôt les données de connexion (adresses IP comprises).
function finish(db, c, status, by = null) {
  db.prepare('UPDATE calls SET status = ?, ended_at = ?, ended_by = ? WHERE id = ? AND status IN (\'ringing\', \'active\')')
    .run(status, Date.now(), by, c.id);
  db.prepare('DELETE FROM call_signals WHERE call_id = ?').run(c.id);
}

// Met à jour un appel « oublié » : sonnerie sans réponse, appareil disparu, durée maximale.
function settle(db, c) {
  if (!c) return c;
  const now = Date.now();
  if (c.status === 'ringing' && now - c.created_at > RING_MS) finish(db, c, 'missed');
  else if (c.status === 'ringing' && now - c.caller_seen_at > STALE_MS) finish(db, c, 'cancelled', c.caller_id);
  else if (c.status === 'active' && (now - c.caller_seen_at > STALE_MS || now - c.callee_seen_at > STALE_MS || now - c.answered_at > MAX_CALL_MS)) finish(db, c, 'ended');
  else return c;
  return db.prepare('SELECT * FROM calls WHERE id = ?').get(c.id);
}

// Les deux ont écrit dans la conversation : c'est le minimum pour proposer un appel vidéo.
function sharedConversation(db, a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  const m = db.prepare('SELECT id FROM matches WHERE a_id = ? AND b_id = ?').get(x, y);
  if (!m) return null;
  const writers = db.prepare('SELECT COUNT(DISTINCT sender_id) AS n FROM messages WHERE match_id = ? AND removed = 0').get(m.id).n;
  return writers >= 2 ? m.id : null;
}

// Peut-on appeler cette personne ? Renvoie la raison sinon (affichée telle quelle).
export function callBlocker(db, u, other, edition) {
  if (edition !== 'cruise' || getSetting(db, 'liveplay_enabled') !== '1') return 'LivePlay n’est pas disponible.';
  if (!other || other.status !== 'member' || other.id === u.id || hiddenBetween(db, u.id, other.id)) return 'Membre introuvable.';
  if (!u.liveplay) return 'Active « Je suis dispo pour LivePlay » dans tes réglages pour appeler.';
  if (!other.liveplay) return `${other.first_name} n’est pas dispo pour LivePlay.`;
  if (!sharedConversation(db, u.id, other.id)) return 'Un appel vidéo est possible une fois que vous vous êtes écrit tous les deux.';
  return null;
}

export const canCall = (db, u, other, edition) => !callBlocker(db, u, other, edition);

function busy(db, userId) {
  const rows = db.prepare("SELECT * FROM calls WHERE status IN ('ringing', 'active') AND (caller_id = ? OR callee_id = ?)").all(userId, userId);
  return rows.map((c) => settle(db, c)).some((c) => ['ringing', 'active'].includes(c.status));
}

function callView(db, c, u) {
  const other = db.prepare('SELECT id, first_name FROM users WHERE id = ?').get(otherOf(c, u));
  return {
    id: c.id, role: roleOf(c, u), status: c.status, created_at: c.created_at, answered_at: c.answered_at, ended_at: c.ended_at,
    other: other ? { id: other.id, first_name: other.first_name, ...shownProfilePhoto(db, u, other.id) } : null
  };
}

function ownCall(ctx, u) {
  const c = ctx.db.prepare('SELECT * FROM calls WHERE id = ?').get(Number(ctx.params.id));
  if (!c || (c.caller_id !== u.id && c.callee_id !== u.id)) fail(404, 'Appel introuvable.');
  return settle(ctx.db, c);
}

const touch = (db, c, u) => db.prepare(`UPDATE calls SET ${roleOf(c, u) === 'caller' ? 'caller_seen_at' : 'callee_seen_at'} = ? WHERE id = ?`).run(Date.now(), c.id);

// Serveurs de connexion. Avec un relais TURN : identifiants éphémères (1 h), calculés avec le secret partagé
// (mode « use-auth-secret » de coturn), et passage obligé par le relais (adresses IP cachées).
export function iceConfig(config, userId) {
  const servers = [];
  const stun = (config.ice?.stun || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (stun.length) servers.push({ urls: stun });
  const turn = (config.ice?.turnUrls || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (turn.length && config.ice?.turnSecret) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${userId}`;
    const credential = createHmac('sha1', config.ice.turnSecret).update(username).digest('base64');
    servers.push({ urls: turn, username, credential });
    return { iceServers: servers, iceTransportPolicy: 'relay', relay: true };
  }
  return { iceServers: servers, iceTransportPolicy: 'all', relay: false };
}

export function registerLivePlayRoutes(r) {
  // Appel en cours ou qui sonne (l'appareil le demande toutes les quelques secondes quand LivePlay est activé).
  r.get('/api/calls/current', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const c = settle(db, db.prepare(`SELECT * FROM calls WHERE status IN ('ringing', 'active') AND (caller_id = ? OR callee_id = ?)
      ORDER BY id DESC LIMIT 1`).get(u.id, u.id));
    if (!c || !['ringing', 'active'].includes(c.status)) return { call: null };
    if (hiddenBetween(db, u.id, otherOf(c, u))) { finish(db, c, 'ended', u.id); return { call: null }; }
    touch(db, c, u);
    return { call: callView(db, c, u) };
  });

  r.get('/api/calls/ice', (ctx) => {
    const u = requireMember(ctx);
    return iceConfig(ctx.config, u.id);
  });

  r.post('/api/calls', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const other = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(ctx.body.user_id));
    const why = callBlocker(db, u, other, ctx.config.edition);
    if (why) fail(403, why);
    if (ctx.config.rateLimit) callLimit(`call:${u.id}`);
    if (busy(db, u.id)) fail(409, 'Tu as déjà un appel en cours.');
    if (busy(db, other.id)) fail(409, `${other.first_name} est déjà en appel.`);
    const now = Date.now();
    const info = db.prepare(`INSERT INTO calls (caller_id, callee_id, status, created_at, caller_seen_at, callee_seen_at)
      VALUES (?, ?, 'ringing', ?, ?, ?)`).run(u.id, other.id, now, now, now);
    return { id: Number(info.lastInsertRowid), ...iceConfig(ctx.config, u.id) };
  });

  r.post('/api/calls/:id/accept', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const c = ownCall(ctx, u);
    if (roleOf(c, u) !== 'callee') fail(403, 'Seule la personne appelée peut décrocher.');
    if (c.status !== 'ringing') fail(410, c.status === 'missed' ? 'L’appel a cessé de sonner.' : 'Cet appel est terminé.');
    const now = Date.now();
    db.prepare("UPDATE calls SET status = 'active', answered_at = ?, callee_seen_at = ? WHERE id = ?").run(now, now, c.id);
    return { ok: true, ...iceConfig(ctx.config, u.id) };
  });

  r.post('/api/calls/:id/decline', (ctx) => {
    const u = requireMember(ctx);
    const c = ownCall(ctx, u);
    if (c.status === 'ringing') finish(ctx.db, c, roleOf(c, u) === 'callee' ? 'declined' : 'cancelled', u.id);
    return { ok: true };
  });

  r.post('/api/calls/:id/end', (ctx) => {
    const u = requireMember(ctx);
    const c = ownCall(ctx, u);
    if (c.status === 'ringing') finish(ctx.db, c, roleOf(c, u) === 'callee' ? 'declined' : 'cancelled', u.id);
    else if (c.status === 'active') finish(ctx.db, c, 'ended', u.id);
    return { ok: true };
  });

  // Signalisation : description de session (offre, réponse) et candidats de connexion, relayés à l'autre appareil.
  r.post('/api/calls/:id/signal', (ctx) => {
    const u = requireMember(ctx);
    const c = ownCall(ctx, u);
    if (c.status !== 'active') fail(410, 'Cet appel est terminé.');
    const kind = String(ctx.body.kind || '');
    if (!['offer', 'answer', 'ice'].includes(kind)) fail(400, 'Signal inconnu.');
    const payload = JSON.stringify(ctx.body.payload ?? null);
    if (payload.length > MAX_SIGNAL_BYTES) fail(413, 'Signal trop long.');
    const count = ctx.db.prepare('SELECT COUNT(*) AS n FROM call_signals WHERE call_id = ? AND sender_id = ?').get(c.id, u.id).n;
    if (count >= 200) fail(429, 'Trop de signaux pour cet appel.');
    ctx.db.prepare('INSERT INTO call_signals (call_id, sender_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)').run(c.id, u.id, kind, payload, Date.now());
    touch(ctx.db, c, u);
    return { ok: true };
  });

  r.get('/api/calls/:id/signals', (ctx) => {
    const u = requireMember(ctx);
    const c = ownCall(ctx, u);
    if (['ringing', 'active'].includes(c.status)) touch(ctx.db, c, u);
    const after = Number(ctx.query.get('after') || 0);
    const signals = ctx.db.prepare('SELECT id, kind, payload FROM call_signals WHERE call_id = ? AND sender_id != ? AND id > ? ORDER BY id')
      .all(c.id, u.id, after).map((s) => ({ id: s.id, kind: s.kind, payload: JSON.parse(s.payload) }));
    return { status: c.status, signals };
  });
}

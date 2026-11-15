// API de l'app membre.
import { randomBytes } from 'node:crypto';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail } from './http.mjs';
import { hashPassword, verifyPassword, createSession, sessionCookie, clearCookie,
  requireUser, requireMember, rateLimiter } from './auth.mjs';
import { getSetting, tx } from './db.mjs';

export const NEIGHBORHOODS = ['Le Marais', 'Pigalle', 'Montmartre', 'Belleville', 'Oberkampf', 'Bastille',
  'Canal Saint-Martin', 'Batignolles', 'Saint-Germain', 'Quartier Latin', 'Montparnasse', 'Châtelet'];
export const MODES = ['dating', 'friends', 'network'];
export const REPORT_REASONS = ['harassment', 'fake', 'minor', 'non_consensual', 'hate', 'spam', 'illegal', 'other'];
const MAX_PROFILE_PHOTOS = 6;
const MAX_ALBUM_PHOTOS = 30;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const DAY = 86400e3;

const loginLimit = rateLimiter(10, 15 * 60e3);
const registerLimit = rateLimiter(5, 60 * 60e3);

// ---------- utilitaires ----------
function str(v, max, { required = false, label = 'Champ' } = {}) {
  if (v == null || v === '') {
    if (required) fail(400, `${label} : obligatoire.`);
    return null;
  }
  const s = String(v).trim();
  if (required && !s) fail(400, `${label} : obligatoire.`);
  if (s.length > max) fail(400, `${label} : ${max} caractères maximum.`);
  return s || null;
}
const bool = (v) => (v ? 1 : 0);
const ageOf = (birthYear) => new Date().getFullYear() - birthYear;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

function newReferralCode(db, firstName) {
  const base = (firstName || 'ILD').normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'ILD';
  for (;;) {
    const code = `${base}-${randomBytes(3).toString('hex').toUpperCase().slice(0, 4)}`;
    if (!db.prepare('SELECT 1 FROM users WHERE referral_code = ?').get(code)) return code;
  }
}

// Vrai si `viewer` ne doit pas voir `target` (blocage dans un sens, ou masquage par la cible).
export function hiddenBetween(db, viewerId, targetId) {
  return !!db.prepare(`SELECT 1 FROM blocks WHERE
    (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ? AND kind = 'block')`)
    .get(targetId, viewerId, viewerId, targetId);
}

function matchBetween(db, a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  return db.prepare('SELECT * FROM matches WHERE a_id = ? AND b_id = ?').get(x, y);
}

function activeGrant(db, ownerId, granteeId) {
  return db.prepare('SELECT * FROM album_grants WHERE owner_id = ? AND grantee_id = ? AND expires_at > ?')
    .get(ownerId, granteeId, Date.now());
}

export function vouchCount(db, userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM vouches WHERE applicant_id = ?').get(userId).n;
}

// Place dans la liste d'attente : plus de parrainages d'abord, puis ancienneté.
export function waitlistPosition(db, user) {
  const mine = vouchCount(db, user.id);
  const ahead = db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE u.status = 'waitlist' AND u.city = ? AND u.id != ? AND (
      (SELECT COUNT(*) FROM vouches v WHERE v.applicant_id = u.id) > ? OR
      ((SELECT COUNT(*) FROM vouches v WHERE v.applicant_id = u.id) = ? AND u.created_at < ?))`)
    .get(user.city, user.id, mine, mine, user.created_at).n;
  return ahead + 1;
}

function travelActive(db, u) {
  if (!u.premium || !u.travel_city || !u.travel_from || !u.travel_to) return false;
  const days = Number(getSetting(db, 'travel_visible_days'));
  const today = isoDay(Date.now());
  const showFrom = isoDay(Date.parse(u.travel_from) - days * DAY);
  return today >= showFrom && today <= u.travel_to;
}

function profilePhotoIds(db, userId, includePending) {
  const rows = db.prepare(`SELECT id FROM photos WHERE user_id = ? AND kind = 'profile'
    ${includePending ? "AND status != 'rejected'" : "AND status = 'approved'"} ORDER BY position, id`).all(userId);
  return rows.map((r) => r.id);
}

export function publicProfile(db, viewer, u) {
  const vouchers = db.prepare(`SELECT x.first_name FROM vouches v JOIN users x ON x.id = v.voucher_id
    WHERE v.applicant_id = ? ORDER BY v.created_at`).all(u.id).map((r) => r.first_name);
  const albumCount = db.prepare("SELECT COUNT(*) AS n FROM photos WHERE user_id = ? AND kind = 'album' AND status = 'approved'").get(u.id).n;
  let albumAccess = 'none';
  let albumExpires = null;
  if (viewer && viewer.id !== u.id) {
    const g = activeGrant(db, u.id, viewer.id);
    if (g) { albumAccess = 'granted'; albumExpires = g.expires_at; }
    else if (db.prepare('SELECT 1 FROM album_requests WHERE requester_id = ? AND owner_id = ?').get(viewer.id, u.id)) albumAccess = 'requested';
  }
  return {
    id: u.id,
    first_name: u.first_name,
    age: ageOf(u.birth_year),
    city: u.city,
    neighborhood: u.neighborhood,
    job: u.job,
    bio: u.bio,
    prompt_answer: u.prompt_answer,
    interests: u.interests ? u.interests.split(',').map((s) => s.trim()).filter(Boolean) : [],
    music_title: u.music_title,
    looking_for: u.looking_for.split(','),
    photos: profilePhotoIds(db, u.id, viewer && viewer.id === u.id),
    vouched_by: vouchers,
    travel: travelActive(db, u) ? { city: u.travel_city, from: u.travel_from, to: u.travel_to } : null,
    album: { enabled: !!u.album_enabled, count: albumCount, access: albumAccess, expires_at: albumExpires },
    matched: viewer ? !!matchBetween(db, viewer.id, u.id) : false
  };
}

function visibleMember(db, viewer, id) {
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'member'").get(Number(id));
  if (!u || u.id === viewer.id || hiddenBetween(db, viewer.id, u.id)) fail(404, 'Membre introuvable.');
  return u;
}

function meView(db, u) {
  const required = Number(getSetting(db, 'vouches_required'));
  const view = {
    id: u.id, email: u.email, role: u.role, status: u.status, refusal_reason: u.refusal_reason,
    first_name: u.first_name, birth_year: u.birth_year, city: u.city, neighborhood: u.neighborhood,
    job: u.job, bio: u.bio, prompt_answer: u.prompt_answer, interests: u.interests, music_title: u.music_title,
    looking_for: u.looking_for, referral_code: u.referral_code, id_check_status: u.id_check_status,
    premium: !!u.premium, travel_city: u.travel_city, travel_from: u.travel_from, travel_to: u.travel_to,
    hide_from_map: !!u.hide_from_map, album_matches_only: !!u.album_matches_only, album_enabled: !!u.album_enabled,
    blur_explicit: !!u.blur_explicit, discreet_icon: !!u.discreet_icon,
    photos: db.prepare("SELECT id, status FROM photos WHERE user_id = ? AND kind = 'profile' ORDER BY position, id").all(u.id),
    vouches: vouchCount(db, u.id), vouches_required: required
  };
  if (u.status === 'waitlist') view.waitlist_position = waitlistPosition(db, u);
  if (u.status === 'member') {
    view.vouch_requests = db.prepare(`SELECT id, first_name, created_at FROM users
      WHERE invited_by_code = ? AND status IN ('pending', 'waitlist')
      AND id NOT IN (SELECT applicant_id FROM vouches WHERE voucher_id = ?)`).all(u.referral_code, u.id);
    view.album_requests = db.prepare(`SELECT r.requester_id AS id, x.first_name, r.created_at FROM album_requests r
      JOIN users x ON x.id = r.requester_id WHERE r.owner_id = ? AND x.status = 'member'`).all(u.id);
  }
  return view;
}

// Enregistre une image JPEG envoyée en data URL (déjà réencodée côté client, donc sans métadonnées GPS).
function saveJpeg(ctx, dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) fail(400, 'Image JPEG attendue.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_PHOTO_BYTES) fail(413, 'Image trop lourde (3 Mo maximum).');
  if (buf[0] !== 0xff || buf[1] !== 0xd8) fail(400, 'Fichier JPEG invalide.');
  const file = `${randomBytes(16).toString('hex')}.jpg`;
  writeFileSync(join(ctx.config.uploadsDir, file), buf);
  return file;
}

// Point d'accroche pour la détection de contenus illégaux connus (hash matching, ex. PhotoDNA).
// En production : appeler le prestataire ici, refuser l'image et signaler à PHAROS si elle correspond.
export async function scanImage(/* buffer */) {
  return { ok: true };
}

export function deletePhotoFiles(ctx, userId) {
  for (const p of ctx.db.prepare('SELECT file FROM photos WHERE user_id = ?').all(userId)) {
    try { unlinkSync(join(ctx.config.uploadsDir, p.file)); } catch { /* déjà supprimé */ }
  }
}

// ---------- routes ----------
export function registerMemberRoutes(r) {
  r.get('/api/meta', () => ({ neighborhoods: NEIGHBORHOODS, modes: MODES, report_reasons: REPORT_REASONS }));

  // --- comptes ---
  r.post('/api/auth/register', (ctx) => {
    if (ctx.config.rateLimit) registerLimit(ctx.ip);
    const b = ctx.body;
    const email = str(b.email, 200, { required: true, label: 'E-mail' }).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'E-mail invalide.');
    const password = String(b.password || '');
    if (password.length < 10) fail(400, 'Mot de passe : 10 caractères minimum.');
    const firstName = str(b.first_name, 40, { required: true, label: 'Prénom' });
    const birthYear = Number(b.birth_year);
    if (!Number.isInteger(birthYear) || birthYear < 1920) fail(400, 'Année de naissance invalide.');
    if (ageOf(birthYear) < 18) fail(403, 'ILD est réservé aux personnes majeures.');
    if (!b.consent_age || !b.consent_orientation || !b.charter) {
      fail(400, 'Les trois consentements sont nécessaires pour candidater.');
    }
    const city = str(b.city, 60, { label: 'Ville' }) || 'Paris';
    const inviteCode = str(b.invite_code, 20, { label: 'Code' });
    const db = ctx.db;
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'Un compte existe déjà avec cet e-mail.');
    const now = Date.now();
    const info = db.prepare(`INSERT INTO users (email, pass_hash, first_name, birth_year, city, referral_code,
      invited_by_code, consent_age_at, consent_orientation_at, charter_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(email, hashPassword(password), firstName, birthYear, city, newReferralCode(db, firstName),
        inviteCode ? inviteCode.toUpperCase() : null, now, now, now, now);
    const token = createSession(db, Number(info.lastInsertRowid));
    ctx.setCookie(sessionCookie(token, ctx.config.secureCookies));
    return { ok: true };
  });

  r.post('/api/auth/login', (ctx) => {
    if (ctx.config.rateLimit) loginLimit(ctx.ip);
    const email = String(ctx.body.email || '').trim().toLowerCase();
    const u = ctx.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!u || !verifyPassword(String(ctx.body.password || ''), u.pass_hash)) fail(401, 'E-mail ou mot de passe incorrect.');
    if (u.status === 'banned') fail(403, 'Ce compte a été banni.');
    ctx.setCookie(sessionCookie(createSession(ctx.db, u.id), ctx.config.secureCookies));
    return { ok: true, role: u.role };
  });

  r.post('/api/auth/logout', (ctx) => {
    if (ctx.user) ctx.db.prepare('DELETE FROM sessions WHERE token = ?').run(ctx.user._token);
    ctx.setCookie(clearCookie());
    return { ok: true };
  });

  // --- moi ---
  r.get('/api/me', (ctx) => meView(ctx.db, requireUser(ctx)));

  r.patch('/api/me', (ctx) => {
    const u = requireUser(ctx);
    const b = ctx.body;
    const set = {};
    if ('job' in b) set.job = str(b.job, 60, { label: 'Métier' });
    if ('bio' in b) set.bio = str(b.bio, 300, { label: 'Bio' });
    if ('prompt_answer' in b) set.prompt_answer = str(b.prompt_answer, 200, { label: 'Réponse' });
    if ('interests' in b) set.interests = str(b.interests, 200, { label: "Centres d'intérêt" });
    if ('music_title' in b) set.music_title = str(b.music_title, 80, { label: 'Musique' });
    if ('neighborhood' in b) {
      if (b.neighborhood && !NEIGHBORHOODS.includes(b.neighborhood)) fail(400, 'Quartier inconnu.');
      set.neighborhood = b.neighborhood || null;
    }
    if ('looking_for' in b) {
      const modes = String(b.looking_for).split(',').filter((m) => MODES.includes(m));
      if (!modes.length) fail(400, 'Choisis au moins un mode.');
      set.looking_for = modes.join(',');
    }
    for (const k of ['hide_from_map', 'album_matches_only', 'album_enabled', 'blur_explicit', 'discreet_icon']) {
      if (k in b) set[k] = bool(b[k]);
    }
    if ('travel_city' in b || 'travel_from' in b || 'travel_to' in b) {
      if (!u.premium) fail(403, 'Le mode voyage fait partie d\'ILD+.');
      const city = str(b.travel_city, 60, { label: 'Ville' });
      const from = str(b.travel_from, 10, { label: 'Date' });
      const to = str(b.travel_to, 10, { label: 'Date' });
      if (city) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || from > to) {
          fail(400, 'Dates de voyage invalides.');
        }
      }
      Object.assign(set, { travel_city: city, travel_from: city ? from : null, travel_to: city ? to : null });
    }
    const keys = Object.keys(set);
    if (keys.length) {
      ctx.db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
        .run(...keys.map((k) => set[k]), u.id);
    }
    return meView(ctx.db, ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(u.id));
  });

  // Vérification d'identité. Ici, on enregistre la demande : un administrateur (ou le webhook
  // du prestataire, à brancher) valide ensuite. La pièce elle-même n'est jamais stockée par ILD.
  r.post('/api/me/id-check', (ctx) => {
    const u = requireUser(ctx);
    if (u.id_check_status === 'verified') return { status: 'verified' };
    ctx.db.prepare("UPDATE users SET id_check_status = 'submitted' WHERE id = ?").run(u.id);
    return { status: 'submitted' };
  });

  r.post('/api/vouch', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    let applicant;
    if (ctx.body.code) {
      applicant = db.prepare('SELECT * FROM users WHERE referral_code = ?').get(String(ctx.body.code).trim().toUpperCase());
    } else {
      applicant = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(ctx.body.applicant_id));
    }
    if (!applicant || !['pending', 'waitlist'].includes(applicant.status)) fail(404, 'Candidat introuvable.');
    if (applicant.id === u.id) fail(400, 'Impossible de te parrainer toi-même.');
    db.prepare('INSERT OR IGNORE INTO vouches (voucher_id, applicant_id, created_at) VALUES (?, ?, ?)').run(u.id, applicant.id, Date.now());
    return { ok: true, first_name: applicant.first_name, vouches: vouchCount(db, applicant.id) };
  });

  // Démo : en production, l'abonnement passe par l'App Store / Google Play ou un prestataire de paiement.
  r.post('/api/me/premium', (ctx) => {
    const u = requireMember(ctx);
    const active = bool(ctx.body.active);
    ctx.db.prepare('UPDATE users SET premium = ? WHERE id = ?').run(active, u.id);
    if (!active) ctx.db.prepare('UPDATE users SET travel_city = NULL, travel_from = NULL, travel_to = NULL WHERE id = ?').run(u.id);
    return { premium: !!active };
  });

  r.get('/api/me/export', (ctx) => {
    const u = requireUser(ctx);
    const db = ctx.db;
    const { pass_hash, ...profile } = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
    return {
      exported_at: new Date().toISOString(),
      profile,
      photos: db.prepare('SELECT id, kind, status, created_at FROM photos WHERE user_id = ?').all(u.id),
      likes_given: db.prepare('SELECT to_id, value, created_at FROM likes WHERE from_id = ?').all(u.id),
      matches: db.prepare('SELECT id, a_id, b_id, created_at FROM matches WHERE a_id = ? OR b_id = ?').all(u.id, u.id),
      messages_sent: db.prepare('SELECT match_id, body, created_at FROM messages WHERE sender_id = ?').all(u.id),
      posts: db.prepare('SELECT kind, body, visibility, created_at FROM posts WHERE user_id = ?').all(u.id),
      vouches_given: db.prepare('SELECT applicant_id, created_at FROM vouches WHERE voucher_id = ?').all(u.id),
      vouches_received: db.prepare('SELECT voucher_id, created_at FROM vouches WHERE applicant_id = ?').all(u.id),
      blocks: db.prepare('SELECT blocked_id, kind, created_at FROM blocks WHERE blocker_id = ?').all(u.id),
      album_grants: db.prepare('SELECT grantee_id, expires_at FROM album_grants WHERE owner_id = ?').all(u.id)
    };
  });

  r.delete('/api/me', (ctx) => {
    const u = requireUser(ctx);
    if (u.role === 'admin') fail(400, 'Un administrateur ne peut pas supprimer son compte ici.');
    if (!verifyPassword(String(ctx.body.password || ''), u.pass_hash)) fail(401, 'Mot de passe incorrect.');
    deletePhotoFiles(ctx, u.id);
    ctx.db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    ctx.setCookie(clearCookie());
    return { ok: true };
  });

  // --- photos ---
  r.post('/api/me/photos', async (ctx) => {
    const u = requireUser(ctx);
    const kind = ctx.body.kind === 'album' ? 'album' : 'profile';
    if (kind === 'album' && u.status !== 'member') fail(403, 'Album réservé aux membres.');
    const max = kind === 'album' ? MAX_ALBUM_PHOTOS : MAX_PROFILE_PHOTOS;
    const n = ctx.db.prepare('SELECT COUNT(*) AS n FROM photos WHERE user_id = ? AND kind = ?').get(u.id, kind).n;
    if (n >= max) fail(400, `${max} photos maximum.`);
    const file = saveJpeg(ctx, ctx.body.data);
    const scan = await scanImage(readFileSync(join(ctx.config.uploadsDir, file)));
    if (!scan.ok) {
      unlinkSync(join(ctx.config.uploadsDir, file));
      fail(400, 'Image refusée.');
    }
    // Photos de profil : relues par la modération avant d'être visibles. Album : contrôle automatique.
    const status = kind === 'album' ? 'approved' : 'pending';
    const info = ctx.db.prepare('INSERT INTO photos (user_id, kind, file, status, position, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(u.id, kind, file, status, n, Date.now());
    return { id: Number(info.lastInsertRowid), status };
  });

  r.delete('/api/me/photos/:id', (ctx) => {
    const u = requireUser(ctx);
    const p = ctx.db.prepare('SELECT * FROM photos WHERE id = ? AND user_id = ?').get(Number(ctx.params.id), u.id);
    if (!p) fail(404, 'Photo introuvable.');
    try { unlinkSync(join(ctx.config.uploadsDir, p.file)); } catch { /* déjà supprimé */ }
    ctx.db.prepare('DELETE FROM photos WHERE id = ?').run(p.id);
    return { ok: true };
  });

  // --- découvrir et likes ---
  r.get('/api/discover', (ctx) => {
    const u = requireMember(ctx);
    const mode = MODES.includes(ctx.query.get('mode')) ? ctx.query.get('mode') : 'dating';
    const db = ctx.db;
    const rows = db.prepare(`SELECT * FROM users x WHERE x.status = 'member' AND x.id != ?
      AND (',' || x.looking_for || ',') LIKE ?
      AND x.id NOT IN (SELECT to_id FROM likes WHERE from_id = ?)
      AND (x.city = ? OR x.travel_city = ?)
      ORDER BY random() LIMIT 60`).all(u.id, `%,${mode},%`, u.id, u.city, u.city);
    const out = [];
    for (const x of rows) {
      if (hiddenBetween(db, u.id, x.id)) continue;
      if (x.city !== u.city && !travelActive(db, x)) continue;
      out.push(publicProfile(db, u, x));
      if (out.length >= 20) break;
    }
    return { mode, profiles: out };
  });

  r.post('/api/likes', (ctx) => {
    const u = requireMember(ctx);
    const target = visibleMember(ctx.db, u, ctx.body.to_id);
    const value = ctx.body.value === -1 ? -1 : 1;
    const db = ctx.db;
    return tx(db, () => {
      db.prepare(`INSERT INTO likes (from_id, to_id, value, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (from_id, to_id) DO UPDATE SET value = excluded.value, created_at = excluded.created_at`)
        .run(u.id, target.id, value, Date.now());
      if (value !== 1) return { match: null };
      const back = db.prepare('SELECT value FROM likes WHERE from_id = ? AND to_id = ?').get(target.id, u.id);
      if (!back || back.value !== 1) return { match: null };
      const [a, b] = u.id < target.id ? [u.id, target.id] : [target.id, u.id];
      db.prepare('INSERT OR IGNORE INTO matches (a_id, b_id, created_at) VALUES (?, ?, ?)').run(a, b, Date.now());
      return { match: db.prepare('SELECT id FROM matches WHERE a_id = ? AND b_id = ?').get(a, b).id };
    });
  });

  r.get('/api/likes/received', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const rows = db.prepare(`SELECT x.* FROM likes l JOIN users x ON x.id = l.from_id
      WHERE l.to_id = ? AND l.value = 1 AND x.status = 'member'
      AND x.id NOT IN (SELECT to_id FROM likes WHERE from_id = ?) ORDER BY l.created_at DESC`).all(u.id, u.id)
      .filter((x) => !hiddenBetween(db, u.id, x.id));
    if (!u.premium) return { count: rows.length, profiles: [], premium_required: true };
    return { count: rows.length, profiles: rows.map((x) => publicProfile(db, u, x)) };
  });

  r.get('/api/users/:id', (ctx) => {
    const u = requireMember(ctx);
    return publicProfile(ctx.db, u, visibleMember(ctx.db, u, ctx.params.id));
  });

  // --- matchs et messages ---
  r.get('/api/matches', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const rows = db.prepare('SELECT * FROM matches WHERE a_id = ? OR b_id = ? ORDER BY created_at DESC').all(u.id, u.id);
    const out = [];
    for (const m of rows) {
      const otherId = m.a_id === u.id ? m.b_id : m.a_id;
      const other = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'member'").get(otherId);
      if (!other || hiddenBetween(db, u.id, otherId)) continue;
      const last = db.prepare('SELECT body, sender_id, created_at, removed FROM messages WHERE match_id = ? ORDER BY id DESC LIMIT 1').get(m.id);
      out.push({
        id: m.id, created_at: m.created_at,
        user: { id: other.id, first_name: other.first_name, photo: profilePhotoIds(db, other.id, false)[0] || null },
        last: last ? { body: last.removed ? 'Message retiré par la modération' : last.body, mine: last.sender_id === u.id, created_at: last.created_at } : null
      });
    }
    out.sort((a, b) => (b.last?.created_at || b.created_at) - (a.last?.created_at || a.created_at));
    return { matches: out };
  });

  function ownMatch(ctx, u) {
    const m = ctx.db.prepare('SELECT * FROM matches WHERE id = ?').get(Number(ctx.params.id));
    if (!m || (m.a_id !== u.id && m.b_id !== u.id)) fail(404, 'Conversation introuvable.');
    const otherId = m.a_id === u.id ? m.b_id : m.a_id;
    const other = ctx.db.prepare('SELECT status FROM users WHERE id = ?').get(otherId);
    if (!other || other.status !== 'member' || hiddenBetween(ctx.db, u.id, otherId)) fail(404, 'Conversation introuvable.');
    return { m, otherId };
  }

  r.get('/api/matches/:id/messages', (ctx) => {
    const u = requireMember(ctx);
    const { m, otherId } = ownMatch(ctx, u);
    const after = Number(ctx.query.get('after') || 0);
    const other = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(otherId);
    const messages = ctx.db.prepare('SELECT id, sender_id, body, removed, created_at FROM messages WHERE match_id = ? AND id > ? ORDER BY id LIMIT 200')
      .all(m.id, after).map((x) => ({ id: x.id, mine: x.sender_id === u.id, body: x.removed ? null : x.body, removed: !!x.removed, created_at: x.created_at }));
    return { match_id: m.id, user: publicProfile(ctx.db, u, other), messages };
  });

  r.post('/api/matches/:id/messages', (ctx) => {
    const u = requireMember(ctx);
    const { m } = ownMatch(ctx, u);
    const body = str(ctx.body.body, 2000, { required: true, label: 'Message' });
    const info = ctx.db.prepare('INSERT INTO messages (match_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)').run(m.id, u.id, body, Date.now());
    return { id: Number(info.lastInsertRowid) };
  });

  // --- albums privés ---
  r.get('/api/albums/:ownerId', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const ownerId = Number(ctx.params.ownerId);
    const photos = () => db.prepare("SELECT id FROM photos WHERE user_id = ? AND kind = 'album' AND status = 'approved' ORDER BY id").all(ownerId).map((p) => p.id);
    if (ownerId === u.id) {
      return {
        owner: true, photos: photos(), enabled: !!u.album_enabled,
        grants: db.prepare(`SELECT g.grantee_id AS id, x.first_name, g.expires_at FROM album_grants g JOIN users x ON x.id = g.grantee_id
          WHERE g.owner_id = ? AND g.expires_at > ?`).all(u.id, Date.now()),
        requests: db.prepare(`SELECT r.requester_id AS id, x.first_name FROM album_requests r JOIN users x ON x.id = r.requester_id
          WHERE r.owner_id = ?`).all(u.id)
      };
    }
    const owner = visibleMember(db, u, ownerId);
    const g = activeGrant(db, owner.id, u.id);
    if (!owner.album_enabled || !g) fail(403, 'Accès à cet album non accordé.');
    return { owner: false, first_name: owner.first_name, expires_at: g.expires_at, photos: photos(), blur: !!u.blur_explicit };
  });

  r.post('/api/albums/:ownerId/request', (ctx) => {
    const u = requireMember(ctx);
    const owner = visibleMember(ctx.db, u, ctx.params.ownerId);
    if (!owner.album_enabled) fail(400, "Ce membre n'a pas d'album.");
    if (owner.album_matches_only && !matchBetween(ctx.db, u.id, owner.id)) fail(403, 'Album réservé à ses matchs.');
    ctx.db.prepare('INSERT OR IGNORE INTO album_requests (requester_id, owner_id, created_at) VALUES (?, ?, ?)').run(u.id, owner.id, Date.now());
    return { ok: true };
  });

  r.post('/api/me/album/grants', (ctx) => {
    const u = requireMember(ctx);
    const grantee = visibleMember(ctx.db, u, ctx.body.user_id);
    const defDays = Number(getSetting(ctx.db, 'album_grant_days'));
    const days = Math.min(Math.max(Number(ctx.body.days) || defDays, 1), 30);
    const now = Date.now();
    tx(ctx.db, () => {
      ctx.db.prepare(`INSERT INTO album_grants (owner_id, grantee_id, expires_at, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (owner_id, grantee_id) DO UPDATE SET expires_at = excluded.expires_at`).run(u.id, grantee.id, now + days * DAY, now);
      ctx.db.prepare('DELETE FROM album_requests WHERE requester_id = ? AND owner_id = ?').run(grantee.id, u.id);
    });
    return { ok: true, expires_at: now + days * DAY };
  });

  r.delete('/api/me/album/grants/:userId', (ctx) => {
    const u = requireMember(ctx);
    ctx.db.prepare('DELETE FROM album_grants WHERE owner_id = ? AND grantee_id = ?').run(u.id, Number(ctx.params.userId));
    return { ok: true };
  });

  r.delete('/api/me/album/requests/:userId', (ctx) => {
    const u = requireMember(ctx);
    ctx.db.prepare('DELETE FROM album_requests WHERE owner_id = ? AND requester_id = ?').run(u.id, Number(ctx.params.userId));
    return { ok: true };
  });

  // --- carte (par quartier, jamais de position exacte) ---
  r.get('/api/map', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const rows = db.prepare(`SELECT * FROM users WHERE status = 'member' AND city = ? AND hide_from_map = 0
      AND neighborhood IS NOT NULL AND id != ?`).all(u.city, u.id).filter((x) => !hiddenBetween(db, u.id, x.id));
    const counts = {};
    for (const x of rows) counts[x.neighborhood] = (counts[x.neighborhood] || 0) + 1;
    const near = rows.filter((x) => x.neighborhood === u.neighborhood).slice(0, 12);
    const others = rows.filter((x) => x.neighborhood !== u.neighborhood).slice(0, 12 - near.length);
    return {
      city: u.city,
      neighborhoods: NEIGHBORHOODS.map((n) => ({ name: n, count: counts[n] || 0 })),
      total: rows.length,
      people: [...near, ...others].map((x) => ({ id: x.id, first_name: x.first_name, age: ageOf(x.birth_year), neighborhood: x.neighborhood, photo: profilePhotoIds(db, x.id, false)[0] || null }))
    };
  });

  // --- ce soir ---
  r.get('/api/feed', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const rows = db.prepare(`SELECT p.*, x.first_name AS author FROM posts p LEFT JOIN users x ON x.id = p.user_id
      WHERE p.removed = 0 AND p.city = ? AND (p.user_id IS NULL OR x.status = 'member')
      AND (p.kind = 'post' OR p.starts_at IS NULL OR p.starts_at > ?)
      ORDER BY (p.kind = 'event') DESC, COALESCE(p.starts_at, p.created_at) DESC LIMIT 80`).all(u.city, Date.now() - 6 * 3600e3);
    const out = [];
    for (const p of rows) {
      if (p.user_id && p.user_id !== u.id) {
        if (hiddenBetween(db, u.id, p.user_id)) continue;
        if (p.visibility === 'matches' && !matchBetween(db, u.id, p.user_id)) continue;
      }
      out.push({
        id: p.id, kind: p.kind, title: p.title, body: p.body, place: p.place, starts_at: p.starts_at,
        visibility: p.visibility, created_at: p.created_at, mine: p.user_id === u.id,
        author: p.user_id ? { id: p.user_id, first_name: p.author } : null,
        going: db.prepare('SELECT COUNT(*) AS n FROM rsvps WHERE post_id = ?').get(p.id).n,
        i_go: !!db.prepare('SELECT 1 FROM rsvps WHERE post_id = ? AND user_id = ?').get(p.id, u.id)
      });
    }
    return { posts: out };
  });

  r.post('/api/posts', (ctx) => {
    const u = requireMember(ctx);
    const body = str(ctx.body.body, 1000, { required: true, label: 'Texte' });
    const visibility = ctx.body.visibility === 'matches' ? 'matches' : 'members';
    const info = ctx.db.prepare('INSERT INTO posts (user_id, kind, body, visibility, city, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(u.id, 'post', body, visibility, u.city, Date.now());
    return { id: Number(info.lastInsertRowid) };
  });

  r.delete('/api/posts/:id', (ctx) => {
    const u = requireMember(ctx);
    const res = ctx.db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').run(Number(ctx.params.id), u.id);
    if (!res.changes) fail(404, 'Publication introuvable.');
    return { ok: true };
  });

  r.post('/api/posts/:id/rsvp', (ctx) => {
    const u = requireMember(ctx);
    const p = ctx.db.prepare('SELECT * FROM posts WHERE id = ? AND removed = 0').get(Number(ctx.params.id));
    if (!p) fail(404, 'Publication introuvable.');
    const has = ctx.db.prepare('SELECT 1 FROM rsvps WHERE post_id = ? AND user_id = ?').get(p.id, u.id);
    if (has) ctx.db.prepare('DELETE FROM rsvps WHERE post_id = ? AND user_id = ?').run(p.id, u.id);
    else ctx.db.prepare('INSERT INTO rsvps (post_id, user_id, created_at) VALUES (?, ?, ?)').run(p.id, u.id, Date.now());
    return { i_go: !has };
  });

  // --- signalements et blocages ---
  r.post('/api/reports', (ctx) => {
    const u = requireUser(ctx);
    const db = ctx.db;
    const type = String(ctx.body.target_type);
    const id = Number(ctx.body.target_id);
    const reason = String(ctx.body.reason);
    if (!REPORT_REASONS.includes(reason)) fail(400, 'Motif de signalement inconnu.');
    const details = str(ctx.body.details, 1000, { label: 'Détails' });
    let evidence;
    let targetUserId;
    if (type === 'user') {
      const t = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!t) fail(404, 'Membre introuvable.');
      targetUserId = t.id;
      evidence = { profile: publicProfile(db, null, t) };
    } else if (type === 'message') {
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
      const m = msg && db.prepare('SELECT * FROM matches WHERE id = ?').get(msg.match_id);
      if (!m || (m.a_id !== u.id && m.b_id !== u.id)) fail(404, 'Message introuvable.');
      targetUserId = msg.sender_id;
      // Copie sécurisée des 50 derniers messages : la victime n'a pas besoin de captures d'écran.
      evidence = {
        reported_message_id: msg.id,
        conversation: db.prepare(`SELECT ms.id, ms.sender_id, x.first_name AS sender, ms.body, ms.created_at FROM messages ms
          JOIN users x ON x.id = ms.sender_id WHERE ms.match_id = ? ORDER BY ms.id DESC LIMIT 50`).all(m.id).reverse()
      };
    } else if (type === 'photo') {
      const p = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
      if (!p) fail(404, 'Photo introuvable.');
      targetUserId = p.user_id;
      evidence = { photo_id: p.id, kind: p.kind, owner_id: p.user_id };
    } else if (type === 'post') {
      const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
      if (!p) fail(404, 'Publication introuvable.');
      targetUserId = p.user_id;
      evidence = { post: { id: p.id, body: p.body, visibility: p.visibility, created_at: p.created_at } };
    } else {
      fail(400, 'Type de signalement inconnu.');
    }
    if (targetUserId === u.id) fail(400, 'Impossible de te signaler toi-même.');
    const info = db.prepare(`INSERT INTO reports (reporter_id, target_type, target_id, target_user_id, reason, details, evidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(u.id, type, id, targetUserId ?? null, reason, details, JSON.stringify(evidence), Date.now());
    return { id: Number(info.lastInsertRowid) };
  });

  r.post('/api/blocks', (ctx) => {
    const u = requireMember(ctx);
    const target = Number(ctx.body.user_id);
    if (!target || target === u.id) fail(400, 'Membre invalide.');
    const kind = ctx.body.kind === 'hide' ? 'hide' : 'block';
    tx(ctx.db, () => {
      ctx.db.prepare(`INSERT INTO blocks (blocker_id, blocked_id, kind, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (blocker_id, blocked_id) DO UPDATE SET kind = excluded.kind`).run(u.id, target, kind, Date.now());
      if (kind === 'block') {
        ctx.db.prepare('DELETE FROM album_grants WHERE (owner_id = ? AND grantee_id = ?) OR (owner_id = ? AND grantee_id = ?)').run(u.id, target, target, u.id);
      }
    });
    return { ok: true };
  });

  r.get('/api/blocks', (ctx) => {
    const u = requireMember(ctx);
    return {
      blocks: ctx.db.prepare(`SELECT b.blocked_id AS id, x.first_name, b.kind FROM blocks b JOIN users x ON x.id = b.blocked_id
        WHERE b.blocker_id = ? ORDER BY b.created_at DESC`).all(u.id)
    };
  });

  r.delete('/api/blocks/:userId', (ctx) => {
    const u = requireMember(ctx);
    ctx.db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(u.id, Number(ctx.params.userId));
    return { ok: true };
  });
}

// Qui peut voir une photo : son auteur, un admin, un membre (photo de profil validée),
// ou un membre à qui l'album a été ouvert (photo d'album).
export function canSeePhoto(db, viewer, photo) {
  if (!viewer) return false;
  if (viewer.role === 'admin' || viewer.id === photo.user_id) return true;
  if (photo.status !== 'approved' || viewer.status !== 'member') return false;
  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(photo.user_id);
  if (!owner || owner.status !== 'member' || hiddenBetween(db, viewer.id, owner.id)) return false;
  if (photo.kind === 'profile') return true;
  return !!owner.album_enabled && !!activeGrant(db, owner.id, viewer.id);
}

// Fonctions partagées par les modules de l'API.
import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fail } from './http.mjs';
import { getSetting } from './db.mjs';
import { GROUNDS } from './options.mjs';

export const DAY = 86400e3;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export function str(v, max, { required = false, label = 'Champ' } = {}) {
  if (v == null || v === '') {
    if (required) fail(400, `${label} : obligatoire.`);
    return null;
  }
  const s = String(v).trim();
  if (required && !s) fail(400, `${label} : obligatoire.`);
  if (s.length > max) fail(400, `${label} : ${max} caractères maximum.`);
  return s || null;
}

export const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
export const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

// Âge exact à partir de la date de naissance (AAAA-MM-JJ).
export function ageOf(u) {
  if (u.birth_date) {
    const [y, m, d] = u.birth_date.split('-').map(Number);
    const now = new Date();
    let age = now.getFullYear() - y;
    if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
    return age;
  }
  return new Date().getFullYear() - u.birth_year;
}

export function parseBirthDate(v) {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(400, 'Date de naissance invalide.');
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) fail(400, 'Date de naissance invalide.');
  const age = ageOf({ birth_date: s });
  if (age > 100 || age < 0) fail(400, 'Date de naissance invalide.');
  return { birth_date: s, age, birth_year: Number(s.slice(0, 4)) };
}

// Vrai si `viewer` ne doit pas voir `target` (blocage dans un sens, ou masquage par la cible).
export function hiddenBetween(db, viewerId, targetId) {
  return !!db.prepare(`SELECT 1 FROM blocks WHERE
    (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ? AND kind = 'block')`)
    .get(targetId, viewerId, viewerId, targetId);
}

// Match : like réciproque, ou conversation lancée depuis la carte à laquelle l'autre a répondu.
export function matchBetween(db, a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  return db.prepare("SELECT * FROM matches WHERE a_id = ? AND b_id = ? AND (origin = 'like' OR replied_at IS NOT NULL)").get(x, y);
}

// N'importe quelle conversation, même sans réponse.
export function conversationBetween(db, a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  return db.prepare('SELECT * FROM matches WHERE a_id = ? AND b_id = ?').get(x, y);
}

export function visibleMember(db, viewer, id) {
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'member'").get(Number(id));
  if (!u || u.id === viewer.id || hiddenBetween(db, viewer.id, u.id)) fail(404, 'Membre introuvable.');
  return u;
}

// Photos de profil explicites : seulement sur Nuit, et seulement si le réglage du back office le permet.
export function explicitProfilesAllowed(db, config) {
  return config?.edition === 'cruise' && getSetting(db, 'explicit_profiles') === '1';
}

// Première photo de profil validée, avec son marquage « explicite ».
export function profilePhoto(db, userId) {
  return db.prepare("SELECT id, explicit FROM photos WHERE user_id = ? AND kind = 'profile' AND status = 'approved' ORDER BY position, id LIMIT 1").get(userId) || null;
}
export function explicitPhotoIds(db, userId) {
  return db.prepare("SELECT id FROM photos WHERE user_id = ? AND kind = 'profile' AND explicit = 1").all(userId).map((r) => r.id);
}

// Photo alternative sans nudité, validée : elle remplace la photo principale explicite pour qui ne doit pas la voir.
export function alternatePhoto(db, userId) {
  return db.prepare("SELECT id FROM photos WHERE user_id = ? AND kind = 'alternate' AND status = 'approved' ORDER BY id DESC LIMIT 1").get(userId)?.id || null;
}

// Pays où les photos de profil explicites sont masquées (réglage). Le pays vient de l'en-tête du proxy (viewer._country).
export function explicitRestricted(db, viewer) {
  const c = viewer?._country;
  return !!c && getSetting(db, 'nsfw_restricted_countries').toUpperCase().split(/[\s,;]+/).includes(c);
}

// Photo de profil à montrer à `viewer` : la principale ; là où les photos explicites sont masquées, son alternative
// sans nudité (ou rien). Ailleurs, l'alternative est jointe : l'app la montre aux membres en mode vanille.
export function shownProfilePhoto(db, viewer, userId) {
  const main = profilePhoto(db, userId);
  if (!main || !main.explicit) return { photo: main ? main.id : null, photo_explicit: false, photo_alt: null };
  const alt = alternatePhoto(db, userId);
  if (viewer?.id !== userId && explicitRestricted(db, viewer)) return { photo: alt, photo_explicit: false, photo_alt: null };
  return { photo: main.id, photo_explicit: true, photo_alt: alt };
}

export function profilePhotoIds(db, userId, includePending) {
  return db.prepare(`SELECT id FROM photos WHERE user_id = ? AND kind = 'profile'
    ${includePending ? "AND status != 'rejected'" : "AND status = 'approved'"} ORDER BY position, id`).all(userId).map((r) => r.id);
}

export function vouchCount(db, userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM vouches WHERE applicant_id = ?').get(userId).n;
}

// Rang dans la liste d'attente de la ville : plus de parrainages d'abord, puis ancienneté.
export function waitlistPosition(db, user) {
  const mine = vouchCount(db, user.id);
  return db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE u.status = 'waitlist' AND u.city = ? AND u.id != ? AND (
      (SELECT COUNT(*) FROM vouches v WHERE v.applicant_id = u.id) > ? OR
      ((SELECT COUNT(*) FROM vouches v WHERE v.applicant_id = u.id) = ? AND u.created_at < ?))`)
    .get(user.city, user.id, mine, mine, user.created_at).n + 1;
}

// Enregistre une image JPEG envoyée en data URL (réencodée côté client, donc sans métadonnées GPS).
export function saveJpeg(ctx, dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) fail(400, 'Image JPEG attendue.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_PHOTO_BYTES) fail(413, 'Image trop lourde (3 Mo maximum).');
  if (buf[0] !== 0xff || buf[1] !== 0xd8) fail(400, 'Fichier JPEG invalide.');
  const file = `${randomBytes(16).toString('hex')}.jpg`;
  writeFileSync(join(ctx.config.uploadsDir, file), buf);
  return { file, buf };
}

// Point d'accroche pour la détection de contenus pédocriminels connus (hash matching, ex. PhotoDNA).
// En production : appeler le prestataire ici, refuser l'image et signaler à PHAROS si elle correspond.
export async function scanImage(/* buffer */) {
  return { ok: true };
}

export function deleteFiles(ctx, files) {
  for (const f of files) {
    try { unlinkSync(join(ctx.config.uploadsDir, f)); } catch { /* déjà supprimé */ }
  }
}

export function deletePhotoFiles(ctx, userId) {
  deleteFiles(ctx, ctx.db.prepare('SELECT file FROM photos WHERE user_id = ?').all(userId).map((p) => p.file));
}

export function activeShare(db, albumId, granteeId) {
  return db.prepare(`SELECT * FROM album_shares WHERE album_id = ? AND grantee_id = ? AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > ?) ORDER BY id DESC LIMIT 1`).get(albumId, granteeId, Date.now());
}

// Qui peut voir une photo : son auteur, un admin, un membre (photo de profil validée),
// ou un membre à qui l'album a été envoyé (accès en cours).
export function canSeePhoto(db, viewer, photo) {
  if (!viewer) return false;
  if (viewer.role === 'admin' || viewer.id === photo.user_id) return true;
  if (photo.status !== 'approved' || viewer.status !== 'member') return false;
  const owner = db.prepare('SELECT status FROM users WHERE id = ?').get(photo.user_id);
  if (!owner || owner.status !== 'member' || hiddenBetween(db, viewer.id, photo.user_id)) return false;
  if (photo.kind === 'profile' || photo.kind === 'alternate') return true;
  if (photo.kind === 'chat') {
    // Photo envoyée dans une conversation : seulement ses deux participants.
    const m = db.prepare('SELECT a_id, b_id FROM matches WHERE id = ?').get(photo.match_id);
    return !!m && (m.a_id === viewer.id || m.b_id === viewer.id);
  }
  return !!photo.album_id && !!activeShare(db, photo.album_id, viewer.id);
}

// --- liste des e-mails bannis (empreinte salée, jamais l'e-mail en clair) ---
function pepper() { return process.env.ILD_BLOCKLIST_PEPPER || 'ild-dev-pepper'; }
export function emailHash(email) {
  return createHash('sha256').update(`${pepper()}:${String(email).trim().toLowerCase()}`).digest('hex');
}
export function isBlocklisted(db, email) {
  return !!db.prepare('SELECT 1 FROM blocklist WHERE hash = ?').get(emailHash(email));
}
export function blockEmail(db, email, reason) {
  db.prepare('INSERT OR IGNORE INTO blocklist (hash, reason, created_at) VALUES (?, ?, ?)').run(emailHash(email), reason, Date.now());
}
export function unblockEmail(db, email) {
  db.prepare('DELETE FROM blocklist WHERE hash = ?').run(emailHash(email));
}

// --- exposé des motifs (DSA art. 17) ---
export function notify(db, userId, kind, ground, explanation, related = null, automated = false) {
  if (!GROUNDS[ground]) fail(400, 'Motif inconnu.');
  const text = String(explanation || '').trim();
  if (text.length < 10) fail(400, 'Explique la décision à la personne (10 caractères minimum).');
  db.prepare(`INSERT INTO notices (user_id, kind, ground, explanation, related, automated, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(userId, kind, ground, text.slice(0, 2000), related, automated ? 1 : 0, Date.now());
}

// --- signature des webhooks (HMAC-SHA256 en hexadécimal) ---
export function verifySignature(secret, raw, signature) {
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sign(secret, raw) {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

export function settingInt(db, key) {
  return Number(getSetting(db, key));
}

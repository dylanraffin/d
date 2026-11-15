// Mots de passe (scrypt), sessions par cookie, limitation des tentatives.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { parseCookies, fail } from './http.mjs';
import { LEGAL_VERSION } from './options.mjs';

const SESSION_DAYS = 30;
export const COOKIE = 'ild_session';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [algo, saltB64, hashB64] = String(stored).split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(expected, actual);
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, now, now + SESSION_DAYS * 86400e3);
  return token;
}

export function sessionCookie(token, secure) {
  const attrs = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function currentUser(db, req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?`).get(token, Date.now());
  if (!row) return null;
  return { ...row, _token: token };
}

// Tout compte connecté, même suspendu, banni ou refusé : pour lire une décision, faire un recours,
// exporter ou supprimer ses données (RGPD, DSA).
export function requireAccount(ctx) {
  if (!ctx.user) fail(401, 'Connecte-toi pour continuer.');
  return ctx.user;
}

export function requireUser(ctx) {
  if (!ctx.user) fail(401, 'Connecte-toi pour continuer.');
  if (ctx.user.status === 'banned') fail(403, 'Ce compte a été banni.');
  if (ctx.user.status === 'suspended') fail(403, 'Ce compte est suspendu.');
  return ctx.user;
}

export function requireMember(ctx) {
  const u = requireUser(ctx);
  if (u.status !== 'member' && u.role !== 'admin') fail(403, 'Réservé aux membres acceptés.');
  if (u.role !== 'admin' && u.legal_version !== LEGAL_VERSION) fail(428, 'Accepte les nouvelles conditions pour continuer.');
  return u;
}

export function requireAdmin(ctx) {
  const u = requireUser(ctx);
  if (u.role !== 'admin') fail(403, 'Réservé aux administrateurs.');
  return u;
}

// Limite simple en mémoire : `max` essais par fenêtre de `windowMs` pour une clé donnée.
export function rateLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return;
    }
    entry.count += 1;
    if (entry.count > max) fail(429, 'Trop de tentatives. Réessaie dans quelques minutes.');
  };
}

// Vérification de l'âge et de l'identité par un prestataire certifié (pièce d'identité + selfie).
// ILD ne reçoit et ne garde que le résultat : vérifié et majeur, mineur, ou échec.
//
// Prestataires :
//  - « mock » (par défaut, développement) : une page de simulation remplace le prestataire.
//  - « hosted » : parcours hébergé chez le prestataire. ILD_VERIFICATION_URL contient {session}, par exemple
//    https://verif.exemple.com/start?ref={session}. Le prestataire rappelle /api/webhooks/verification
//    avec un corps signé en HMAC-SHA256 (secret ILD_VERIFICATION_SECRET, en-tête X-ILD-Signature).
import { randomBytes } from 'node:crypto';
import { fail } from './http.mjs';
import { requireAccount } from './auth.mjs';
import { audit, tx } from './db.mjs';
import { blockEmail, notify, verifySignature } from './core.mjs';

export const provider = () => process.env.ILD_VERIFICATION_PROVIDER || 'mock';

export function completeVerification(db, sessionId, result) {
  if (!['verified', 'failed', 'minor'].includes(result)) fail(400, 'Résultat inconnu.');
  const session = db.prepare('SELECT * FROM verifications WHERE id = ?').get(String(sessionId));
  if (!session) fail(404, 'Session de vérification inconnue.');
  if (session.status !== 'created') return { status: session.status };
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  const now = Date.now();
  tx(db, () => {
    db.prepare('UPDATE verifications SET status = ?, completed_at = ? WHERE id = ?').run(result, now, session.id);
    if (result === 'verified') {
      db.prepare(`UPDATE users SET id_check_status = 'verified', id_verified_at = ?, age_verified_at = ?,
        status = CASE WHEN status = 'pending' THEN 'waitlist' ELSE status END WHERE id = ?`).run(now, now, user.id);
    } else if (result === 'failed') {
      db.prepare("UPDATE users SET id_check_status = 'failed' WHERE id = ?").run(user.id);
    } else {
      // Personne mineure : candidature refusée, e-mail bloqué, décision motivée envoyée.
      db.prepare(`UPDATE users SET id_check_status = 'failed', status = 'refused', refusal_reason = 'minor', decided_at = ?
        WHERE id = ? AND role = 'member'`).run(now, user.id);
      blockEmail(db, user.email, 'minor');
      notify(db, user.id, 'application_refused', 'minor',
        "La vérification d'âge indique que tu n'as pas 18 ans. ILD est réservé aux personnes majeures.", null, true);
    }
  });
  audit(db, null, `verification_${result}`, `user:${user.id}`, { provider: session.provider });
  return { status: result };
}

export function registerVerificationRoutes(r) {
  r.post('/api/me/id-check', (ctx) => {
    const u = requireAccount(ctx);
    if (!['pending', 'waitlist'].includes(u.status)) fail(400, 'Vérification non nécessaire.');
    if (u.age_verified_at) return { status: 'verified' };
    const id = randomBytes(18).toString('base64url');
    const p = provider();
    let url;
    if (p === 'mock') url = `/app/verify-mock.html#${id}`;
    else if (p === 'hosted' && process.env.ILD_VERIFICATION_URL) url = process.env.ILD_VERIFICATION_URL.replace('{session}', encodeURIComponent(id));
    else fail(501, "Le prestataire de vérification n'est pas configuré.");
    ctx.db.prepare('INSERT INTO verifications (id, user_id, provider, created_at) VALUES (?, ?, ?, ?)').run(id, u.id, p, Date.now());
    ctx.db.prepare("UPDATE users SET id_check_status = 'submitted' WHERE id = ?").run(u.id);
    return { status: 'submitted', url };
  });

  r.post('/api/webhooks/verification', (ctx) => {
    const secret = process.env.ILD_VERIFICATION_SECRET;
    if (!secret) fail(503, 'Webhook de vérification non configuré.');
    if (!verifySignature(secret, ctx.rawBody, ctx.req.headers['x-ild-signature'])) fail(401, 'Signature invalide.');
    return completeVerification(ctx.db, ctx.body.session, ctx.body.result);
  });

  // Simulation du prestataire, uniquement en développement.
  r.post('/api/dev/verification/:id', (ctx) => {
    if (provider() !== 'mock') fail(404, 'Route inconnue.');
    const u = requireAccount(ctx);
    const s = ctx.db.prepare('SELECT * FROM verifications WHERE id = ?').get(ctx.params.id);
    if (!s || s.user_id !== u.id) fail(404, 'Session de vérification inconnue.');
    return completeVerification(ctx.db, s.id, String(ctx.body.result));
  });
}

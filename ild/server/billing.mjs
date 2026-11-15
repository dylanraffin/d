// Abonnement ILD+. L'app est gratuite tant que « payments_enabled » est désactivé dans le back office :
// toutes les fonctions sont alors offertes. Le jour où le payant est activé, seules les fonctions
// listées dans « plus_features » demandent un abonnement.
import { fail } from './http.mjs';
import { requireUser, requireMember } from './auth.mjs';
import { getSetting, audit } from './db.mjs';
import { DAY, verifySignature } from './core.mjs';

export const FEATURES = {
  who_liked_me: "Voir qui t'a liké",
  travel_mode: 'Mode voyage',
  advanced_filters: 'Filtres avancés (âge, distance, position, recherche)',
  incognito: 'Mode incognito',
  unlimited_likes: 'Likes illimités',
  extended_map: 'Carte en direct sans limite de distance'
};

export const provider = () => process.env.ILD_PAYMENT_PROVIDER || 'mock';
export const paymentsEnabled = (db) => getSetting(db, 'payments_enabled') === '1';
const plusFeatures = (db) => getSetting(db, 'plus_features').split(',').filter((f) => FEATURES[f]);

export function activeSubscription(db, userId) {
  return db.prepare(`SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' AND current_period_end > ?
    ORDER BY current_period_end DESC LIMIT 1`).get(userId, Date.now());
}

export function hasFeature(db, user, feature) {
  if (!user) return false;
  if (user.role === 'admin' || user.premium) return true;
  if (!paymentsEnabled(db)) return true;
  if (!plusFeatures(db).includes(feature)) return true;
  return !!activeSubscription(db, user.id);
}

export function requireFeature(db, user, feature) {
  if (!hasFeature(db, user, feature)) fail(402, `${FEATURES[feature]} fait partie d'ILD+.`);
}

export function entitlements(db, user) {
  return Object.fromEntries(Object.keys(FEATURES).map((f) => [f, hasFeature(db, user, f)]));
}

export function likesToday(db, userId) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return db.prepare('SELECT COUNT(*) AS n FROM likes WHERE from_id = ? AND value = 1 AND created_at >= ?').get(userId, start.getTime()).n;
}

export function dailyLikeLimit(db, user) {
  return hasFeature(db, user, 'unlimited_likes') ? null : Number(getSetting(db, 'free_daily_likes'));
}

// Fin de période : renouvellement simulé (prestataire « mock ») ou expiration.
export function settleSubscriptions(db) {
  const now = Date.now();
  let renewed = 0;
  if (provider() === 'mock') {
    renewed = db.prepare(`UPDATE subscriptions SET current_period_end = current_period_end + ? WHERE status = 'active'
      AND cancel_at_period_end = 0 AND provider = 'mock' AND current_period_end < ?`).run(30 * DAY, now).changes;
  }
  const expired = db.prepare("UPDATE subscriptions SET status = 'expired' WHERE status = 'active' AND current_period_end < ?").run(now).changes;
  return { renewed, expired };
}

function billingView(db, user) {
  settleSubscriptions(db);
  const sub = activeSubscription(db, user.id);
  return {
    payments_enabled: paymentsEnabled(db),
    price_cents: Number(getSetting(db, 'plus_price_cents')),
    currency: 'EUR',
    features: FEATURES,
    plus_features: plusFeatures(db),
    offered: !!user.premium,
    subscription: sub ? {
      plan: sub.plan, provider: sub.provider, current_period_end: sub.current_period_end,
      cancel_at_period_end: !!sub.cancel_at_period_end, price_cents: sub.price_cents
    } : null,
    entitlements: entitlements(db, user)
  };
}

export function registerBillingRoutes(r) {
  r.get('/api/billing', (ctx) => billingView(ctx.db, requireUser(ctx)));

  r.post('/api/billing/subscribe', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    if (!paymentsEnabled(db)) fail(400, "ILD est gratuit pour le moment : il n'y a rien à payer.");
    if (!ctx.body.accept_terms) fail(400, "Accepte les conditions générales de vente pour t'abonner.");
    if (activeSubscription(db, u.id)) return billingView(db, u);
    if (provider() !== 'mock') {
      // À brancher : créer une session de paiement chez le prestataire (App Store, Google Play ou web)
      // et renvoyer son adresse. L'abonnement est créé par le webhook /api/webhooks/payments.
      fail(501, "Le paiement n'est pas encore branché.");
    }
    const now = Date.now();
    db.prepare(`INSERT INTO subscriptions (user_id, plan, provider, status, price_cents, started_at, current_period_end)
      VALUES (?, 'plus', 'mock', 'active', ?, ?, ?)`).run(u.id, Number(getSetting(db, 'plus_price_cents')), now, now + 30 * DAY);
    audit(db, null, 'subscription_started', `user:${u.id}`, { provider: 'mock' });
    return billingView(db, u);
  });

  // Résiliation en trois clics (Code de la consommation, art. L215-1-1) : effective en fin de période payée.
  r.post('/api/billing/cancel', (ctx) => {
    const u = requireUser(ctx);
    const sub = activeSubscription(ctx.db, u.id);
    if (!sub) fail(404, "Aucun abonnement en cours.");
    ctx.db.prepare('UPDATE subscriptions SET cancel_at_period_end = 1, canceled_at = ? WHERE id = ?').run(Date.now(), sub.id);
    audit(ctx.db, null, 'subscription_canceled', `user:${u.id}`, { until: sub.current_period_end });
    return billingView(ctx.db, u);
  });

  r.post('/api/billing/resume', (ctx) => {
    const u = requireUser(ctx);
    const sub = activeSubscription(ctx.db, u.id);
    if (!sub) fail(404, 'Aucun abonnement en cours.');
    ctx.db.prepare('UPDATE subscriptions SET cancel_at_period_end = 0, canceled_at = NULL WHERE id = ?').run(sub.id);
    return billingView(ctx.db, u);
  });

  // Webhook du prestataire de paiement, signé en HMAC-SHA256 (en-tête X-ILD-Signature).
  // Corps attendu : { "type": "renewed" | "canceled" | "expired", "provider_ref": "...", "period_end": 1767225600000 }
  r.post('/api/webhooks/payments', (ctx) => {
    const secret = process.env.ILD_PAYMENT_SECRET;
    if (!secret) fail(503, 'Webhook de paiement non configuré.');
    if (!verifySignature(secret, ctx.rawBody, ctx.req.headers['x-ild-signature'])) fail(401, 'Signature invalide.');
    const { type, provider_ref: ref, period_end: end } = ctx.body;
    const sub = ctx.db.prepare('SELECT * FROM subscriptions WHERE provider_ref = ?').get(String(ref || ''));
    if (!sub) fail(404, 'Abonnement inconnu.');
    if (type === 'renewed') ctx.db.prepare("UPDATE subscriptions SET status = 'active', current_period_end = ? WHERE id = ?").run(Number(end), sub.id);
    else if (type === 'canceled') ctx.db.prepare('UPDATE subscriptions SET cancel_at_period_end = 1, canceled_at = ? WHERE id = ?').run(Date.now(), sub.id);
    else if (type === 'expired') ctx.db.prepare("UPDATE subscriptions SET status = 'expired' WHERE id = ?").run(sub.id);
    else fail(400, 'Événement inconnu.');
    return { ok: true };
  });
}

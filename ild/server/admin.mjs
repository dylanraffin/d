// API du back office. Chaque action qui change quelque chose est inscrite au journal d'audit,
// et chaque sanction envoie à la personne un exposé des motifs (DSA art. 17).
import { fail } from './http.mjs';
import { requireAdmin } from './auth.mjs';
import { audit, getSetting, setSetting, SETTINGS_SPEC, tx } from './db.mjs';
import { GROUNDS, LEGAL_VERSION, POSITIONS } from './options.mjs';
import { DAY, ageOf, str, vouchCount, waitlistPosition, deletePhotoFiles, deleteFiles, isBlocklisted, blockEmail,
  unblockEmail, notify, explicitProfilesAllowed } from './core.mjs';
import { publicProfile, applicationChecks } from './api.mjs';
import { FEATURES, paymentsEnabled, settleSubscriptions, provider as paymentProvider } from './billing.mjs';
import { provider as verificationProvider, directAccess } from './verification.mjs';

const PHOTO_TEMPLATES = {
  explicit_public: 'Ta photo de profil contient de la nudité, ce qui n’est pas permis ici. Les photos explicites se partagent en privé : dans le chat ou dans un album.',
  fake_profile: 'Ta photo ne semble pas te représenter. Les photos de profil doivent montrer la personne qui a créé le compte.',
  minor: 'Ta photo semble montrer une personne mineure, ce qui est interdit sur ILD.',
  charter: "Ta photo montre d'autres personnes reconnaissables ou ne respecte pas la charte. Ajoute une photo où l'on voit seulement toi."
};

function getUser(db, id) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  if (!u) fail(404, 'Utilisateur introuvable.');
  return u;
}

// Liste de vérification d'une candidature. Les points obligatoires conditionnent l'acceptation.
export function dossierChecks(db, u, edition = 'club') {
  const c = applicationChecks(db, u, edition);
  const cruise = edition === 'cruise';
  const openReports = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE target_user_id = ? AND status = 'open'").get(u.id).n;
  return [
    { key: 'age_verified', label: "Âge vérifié (pièce d'identité + selfie)", mandatory: true, ok: c.age_verified,
      detail: c.age_verified ? '' : u.id_check_status === 'submitted' ? 'Vérification en cours chez le prestataire' : u.id_check_status === 'failed' ? 'Échec de la vérification' : 'Pas encore lancée' },
    { key: 'adult', label: 'Majeur selon la date de naissance', mandatory: true, ok: ageOf(u) >= 18, detail: `${ageOf(u)} ans` },
    { key: 'consents', label: 'Consentements à jour (âge, orientation, CGU, charte)', mandatory: true,
      ok: !!(u.consent_age_at && u.consent_orientation_at && u.charter_at && u.legal_version === LEGAL_VERSION),
      detail: u.legal_version === LEGAL_VERSION ? '' : 'Doit accepter la nouvelle version' },
    { key: 'photo', label: 'Au moins une photo de profil validée', mandatory: true, ok: c.photo_approved,
      detail: c.photo_approved ? '' : c.photo_pending ? 'Photo à valider dans « Photos »' : 'Aucune photo envoyée' },
    { key: 'blocklist', label: "E-mail absent de la liste des comptes bannis", mandatory: true, ok: !isBlocklisted(db, u.email), detail: '' },
    { key: 'vouches', label: cruise ? `Recommandations de membres (${c.vouches})` : `Parrainages (${c.vouches} sur ${c.vouches_required})`, mandatory: getSetting(db, 'vouches_mandatory') === '1',
      ok: c.vouches >= c.vouches_required, detail: '' },
    { key: 'profile', label: cruise ? 'Quelques mots sur lui et ce qu’il cherche' : 'Profil complet (recherche, 3 goûts, métier ou bio)', mandatory: false, ok: c.profile_complete, detail: '' },
    { key: 'reports', label: 'Aucun signalement ouvert', mandatory: false, ok: openReports === 0, detail: openReports ? `${openReports} ouvert(s)` : '' }
  ];
}

function applicantRow(db, u, edition = 'club') {
  const checks = dossierChecks(db, u, edition);
  return {
    id: u.id, first_name: u.first_name, email: u.email, age: ageOf(u), city: u.city, status: u.status,
    id_check_status: u.id_check_status, created_at: u.created_at, vouches: vouchCount(db, u.id),
    vouchers: db.prepare('SELECT x.id, x.first_name FROM vouches v JOIN users x ON x.id = v.voucher_id WHERE v.applicant_id = ?').all(u.id),
    invited_by: u.invited_by_code ? db.prepare('SELECT id, first_name FROM users WHERE referral_code = ?').get(u.invited_by_code) || null : null,
    waitlist_position: u.status === 'waitlist' ? waitlistPosition(db, u) : null,
    photos: db.prepare("SELECT id, status FROM photos WHERE user_id = ? AND kind = 'profile' ORDER BY position, id").all(u.id),
    refusal_reason: u.refusal_reason,
    mandatory_ok: checks.filter((c) => c.mandatory).every((c) => c.ok),
    checks_ok: checks.filter((c) => c.ok).length, checks_total: checks.length
  };
}

export function registerAdminRoutes(r) {
  r.get('/api/admin/stats', (ctx) => {
    requireAdmin(ctx);
    const db = ctx.db;
    const one = (sql, ...a) => db.prepare(sql).get(...a).n;
    const since = Date.now() - 7 * DAY;
    const waitlist = db.prepare("SELECT * FROM users WHERE status = 'waitlist' AND role = 'member'").all();
    return {
      members: one("SELECT COUNT(*) AS n FROM users WHERE status = 'member' AND role = 'member'"),
      subscribers: one("SELECT COUNT(DISTINCT user_id) AS n FROM subscriptions WHERE status = 'active' AND current_period_end > ?", Date.now()),
      pending_id: one("SELECT COUNT(*) AS n FROM users WHERE status = 'pending'"),
      waitlist: waitlist.length,
      ready_for_committee: waitlist.filter((u) => dossierChecks(db, u, ctx.config.edition).filter((c) => c.mandatory).every((c) => c.ok)).length,
      photos_to_review: one("SELECT COUNT(*) AS n FROM photos WHERE status = 'pending' AND kind IN ('profile', 'alternate', 'plan')"),
      reports_open: one("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
      reports_urgent: one("SELECT COUNT(*) AS n FROM reports WHERE status = 'open' AND reason IN ('minor', 'non_consensual', 'illegal')"),
      reports_late: one("SELECT COUNT(*) AS n FROM reports WHERE status = 'open' AND created_at < ?", Date.now() - DAY),
      appeals_pending: one("SELECT COUNT(*) AS n FROM notices WHERE appeal_status = 'pending'"),
      matches_7d: one('SELECT COUNT(*) AS n FROM matches WHERE created_at > ?', since),
      messages_7d: one('SELECT COUNT(*) AS n FROM messages WHERE created_at > ?', since),
      signups_7d: one('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', since),
      located: one("SELECT COUNT(*) AS n FROM users WHERE status = 'member' AND lat IS NOT NULL"),
      available_now: one("SELECT COUNT(*) AS n FROM users WHERE status = 'member' AND presence_until > ?", Date.now()),
      spots_pending: one("SELECT COUNT(*) AS n FROM spots WHERE status = 'pending'"),
      plans_live: one("SELECT COUNT(*) AS n FROM plans WHERE status = 'open' AND ends_at > ?", Date.now()),
      online_now: one("SELECT COUNT(*) AS n FROM users WHERE status = 'member' AND last_seen_at > ?", Date.now() - 5 * 60e3),
      calls_24h: one("SELECT COUNT(*) AS n FROM calls WHERE answered_at > ?", Date.now() - DAY),
      marketing_optins: one("SELECT COUNT(*) AS n FROM users WHERE status = 'member' AND marketing_consent_at IS NOT NULL"),
      edition: ctx.config.edition,
      suspended: one("SELECT COUNT(*) AS n FROM users WHERE status IN ('suspended', 'banned')"),
      payments_enabled: paymentsEnabled(db)
    };
  });

  // E-mails promotionnels : seulement les membres qui l'ont accepté, avec la date de l'accord (preuve du consentement).
  r.get('/api/admin/marketing-consents', (ctx) => {
    requireAdmin(ctx);
    return { consents: ctx.db.prepare(`SELECT email, first_name, marketing_consent_at AS consent_at FROM users
      WHERE status = 'member' AND marketing_consent_at IS NOT NULL ORDER BY marketing_consent_at`).all() };
  });

  // --- candidatures ---
  r.get('/api/admin/applications', (ctx) => {
    requireAdmin(ctx);
    const status = ['pending', 'waitlist', 'refused'].includes(ctx.query.get('status')) ? ctx.query.get('status') : 'waitlist';
    const list = ctx.db.prepare("SELECT * FROM users WHERE status = ? AND role = 'member' ORDER BY created_at").all(status).map((u) => applicantRow(ctx.db, u, ctx.config.edition));
    if (status === 'waitlist') list.sort((a, b) => a.waitlist_position - b.waitlist_position);
    return { status, grounds: GROUNDS, applications: list };
  });

  r.get('/api/admin/applications/:id', (ctx) => {
    requireAdmin(ctx);
    const db = ctx.db;
    const u = getUser(db, ctx.params.id);
    return {
      user: applicantRow(db, u, ctx.config.edition),
      checks: dossierChecks(db, u, ctx.config.edition),
      profile: publicProfile(db, { role: 'admin' }, u),
      consents: { age: u.consent_age_at, orientation: u.consent_orientation_at, charter: u.charter_at, legal_version: u.legal_version, legal_accepted_at: u.legal_accepted_at },
      verifications: db.prepare('SELECT id, provider, status, created_at, completed_at FROM verifications WHERE user_id = ? ORDER BY created_at DESC').all(u.id),
      notices: db.prepare('SELECT kind, ground, explanation, created_at, appeal_status FROM notices WHERE user_id = ? ORDER BY id DESC').all(u.id),
      history: db.prepare('SELECT action, details, created_at FROM audit WHERE target = ? ORDER BY id DESC LIMIT 50').all(`user:${u.id}`),
      grounds: GROUNDS
    };
  });

  // Validation manuelle de l'âge (quand le prestataire n'a pas pu conclure). Justification obligatoire.
  r.post('/api/admin/applications/:id/verify-id', (ctx) => {
    const admin = requireAdmin(ctx);
    const u = getUser(ctx.db, ctx.params.id);
    const ok = ctx.body.result !== 'failed';
    const note = str(ctx.body.note, 500, { required: true, label: 'Justification' });
    const now = Date.now();
    const next = directAccess(ctx.db, ctx.config.edition) ? 'member' : 'waitlist';
    ctx.db.prepare(`UPDATE users SET id_check_status = ?, id_verified_at = ?, age_verified_at = ?,
      accepted_at = CASE WHEN status = 'pending' AND ? AND ? = 'member' THEN ? ELSE accepted_at END,
      status = CASE WHEN status = 'pending' AND ? THEN ? ELSE status END WHERE id = ?`)
      .run(ok ? 'verified' : 'failed', ok ? now : null, ok ? now : null, ok ? 1 : 0, next, now, ok ? 1 : 0, next, u.id);
    audit(ctx.db, admin.id, ok ? 'age_verified_manually' : 'age_check_failed', `user:${u.id}`, { note });
    return { ok: true };
  });

  r.post('/api/admin/applications/:id/accept', (ctx) => {
    const admin = requireAdmin(ctx);
    const db = ctx.db;
    const u = getUser(db, ctx.params.id);
    if (u.status !== 'waitlist') fail(400, "Seule une candidature en liste d'attente (âge vérifié) peut être acceptée.");
    const missing = dossierChecks(db, u, ctx.config.edition).filter((c) => c.mandatory && !c.ok).map((c) => c.label);
    if (missing.length) fail(400, `Vérifications obligatoires manquantes : ${missing.join(' ; ')}.`);
    db.prepare("UPDATE users SET status = 'member', accepted_at = ?, decided_at = ?, refusal_reason = NULL WHERE id = ?").run(Date.now(), Date.now(), u.id);
    audit(db, admin.id, 'application_accepted', `user:${u.id}`, { vouches: vouchCount(db, u.id) });
    return { ok: true };
  });

  r.post('/api/admin/applications/:id/refuse', (ctx) => {
    const admin = requireAdmin(ctx);
    const db = ctx.db;
    const u = getUser(db, ctx.params.id);
    const ground = String(ctx.body.ground || ctx.body.reason);
    if (!GROUNDS[ground]) fail(400, 'Choisis un motif documenté.');
    if (!['pending', 'waitlist'].includes(u.status)) fail(400, 'Candidature déjà traitée.');
    tx(db, () => {
      notify(db, u.id, 'application_refused', ground, ctx.body.explanation);
      db.prepare("UPDATE users SET status = 'refused', refusal_reason = ?, decided_at = ? WHERE id = ?").run(ground, Date.now(), u.id);
      if (ground === 'minor' || ground === 'safety') blockEmail(db, u.email, ground);
    });
    audit(db, admin.id, 'application_refused', `user:${u.id}`, { ground });
    return { ok: true };
  });

  // --- membres ---
  r.get('/api/admin/members', (ctx) => {
    requireAdmin(ctx);
    const q = `%${(ctx.query.get('q') || '').trim()}%`;
    const status = ctx.query.get('status');
    const rows = ctx.db.prepare(`SELECT * FROM users WHERE role = 'member' AND (first_name LIKE ? OR email LIKE ?)
      ${status ? 'AND status = ?' : "AND status IN ('member', 'suspended', 'banned')"} ORDER BY created_at DESC LIMIT 200`)
      .all(...(status ? [q, q, status] : [q, q]));
    const subs = new Set(ctx.db.prepare("SELECT user_id FROM subscriptions WHERE status = 'active' AND current_period_end > ?").all(Date.now()).map((s) => s.user_id));
    return {
      members: rows.map((u) => ({
        id: u.id, first_name: u.first_name, email: u.email, age: ageOf(u), city: u.city, neighborhood: u.neighborhood,
        status: u.status, premium: !!u.premium, subscribed: subs.has(u.id), accepted_at: u.accepted_at, created_at: u.created_at,
        reports: ctx.db.prepare('SELECT COUNT(*) AS n FROM reports WHERE target_user_id = ?').get(u.id).n
      }))
    };
  });

  r.get('/api/admin/members/:id', (ctx) => {
    requireAdmin(ctx);
    const db = ctx.db;
    const u = getUser(db, ctx.params.id);
    return {
      user: { ...applicantRow(db, u, ctx.config.edition), premium: !!u.premium, neighborhood: u.neighborhood, accepted_at: u.accepted_at,
        position: u.position ? POSITIONS[u.position] : null, location: u.lat != null ? { source: u.location_source, updated_at: u.location_updated_at } : null,
        consents: { age: u.consent_age_at, orientation: u.consent_orientation_at, legal_version: u.legal_version, geo: u.geo_consent_at } },
      profile: publicProfile(db, { role: 'admin' }, u),
      subscription: db.prepare('SELECT plan, provider, status, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(u.id) || null,
      reports_against: db.prepare('SELECT id, reason, status, created_at FROM reports WHERE target_user_id = ? ORDER BY created_at DESC').all(u.id),
      reports_made: db.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter_id = ?').get(u.id).n,
      notices: db.prepare('SELECT kind, ground, explanation, created_at, appeal_status FROM notices WHERE user_id = ? ORDER BY id DESC').all(u.id),
      stats: {
        matches: db.prepare('SELECT COUNT(*) AS n FROM matches WHERE a_id = ? OR b_id = ?').get(u.id, u.id).n,
        messages: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE sender_id = ?').get(u.id).n,
        albums: db.prepare('SELECT COUNT(*) AS n FROM albums WHERE user_id = ?').get(u.id).n,
        album_photos: db.prepare("SELECT COUNT(*) AS n FROM photos WHERE user_id = ? AND kind = 'album'").get(u.id).n
      },
      history: db.prepare('SELECT action, details, created_at FROM audit WHERE target = ? ORDER BY id DESC LIMIT 50').all(`user:${u.id}`),
      // LivePlay (30 derniers jours) : pour vérifier un signalement. Jamais de contenu, seulement qui, quand, combien de temps.
      calls: db.prepare(`SELECT c.id, c.status, c.created_at, c.answered_at, c.ended_at, c.caller_id = ? AS outgoing, x.id AS other_id, x.first_name AS other_name
        FROM calls c JOIN users x ON x.id = CASE WHEN c.caller_id = ? THEN c.callee_id ELSE c.caller_id END
        WHERE c.caller_id = ? OR c.callee_id = ? ORDER BY c.id DESC LIMIT 30`).all(u.id, u.id, u.id, u.id).map((c) => ({ ...c, outgoing: !!c.outgoing })),
      grounds: GROUNDS
    };
  });

  r.post('/api/admin/members/:id/status', (ctx) => {
    const admin = requireAdmin(ctx);
    const db = ctx.db;
    const u = getUser(db, ctx.params.id);
    if (u.role === 'admin') fail(400, 'Impossible de modifier un administrateur.');
    const status = String(ctx.body.status);
    if (!['member', 'suspended', 'banned'].includes(status)) fail(400, 'Statut invalide.');
    tx(db, () => {
      if (status !== 'member') {
        notify(db, u.id, status === 'banned' ? 'account_banned' : 'account_suspended', String(ctx.body.ground), ctx.body.explanation);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
        if (status === 'banned') blockEmail(db, u.email, 'ban');
      } else {
        unblockEmail(db, u.email);
      }
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, u.id);
    });
    audit(db, admin.id, `member_${status}`, `user:${u.id}`, { ground: ctx.body.ground || null });
    return { ok: true };
  });

  r.post('/api/admin/members/:id/premium', (ctx) => {
    const admin = requireAdmin(ctx);
    const u = getUser(ctx.db, ctx.params.id);
    const v = ctx.body.active ? 1 : 0;
    ctx.db.prepare('UPDATE users SET premium = ? WHERE id = ?').run(v, u.id);
    audit(ctx.db, admin.id, v ? 'premium_offered' : 'premium_removed', `user:${u.id}`);
    return { ok: true };
  });

  // --- photos de profil ---
  r.get('/api/admin/photos', (ctx) => {
    requireAdmin(ctx);
    return {
      templates: Object.fromEntries(Object.keys(PHOTO_TEMPLATES).map((k) => [k, GROUNDS[k]])),
      explicit_allowed: explicitProfilesAllowed(ctx.db, ctx.config),
      photos: ctx.db.prepare(`SELECT p.id, p.user_id, p.created_at, p.explicit, p.kind = 'alternate' AS alternate, p.kind = 'plan' AS plan_cover,
        x.first_name, x.status AS user_status FROM photos p JOIN users x ON x.id = p.user_id
        WHERE p.status = 'pending' AND p.kind IN ('profile', 'alternate', 'plan') ORDER BY p.created_at LIMIT 100`).all()
        .map((p) => ({ ...p, alternate: !!p.alternate, plan_cover: !!p.plan_cover }))
    };
  });

  r.post('/api/admin/photos/:id/review', (ctx) => {
    const admin = requireAdmin(ctx);
    const db = ctx.db;
    const p = db.prepare('SELECT * FROM photos WHERE id = ?').get(Number(ctx.params.id));
    if (!p) fail(404, 'Photo introuvable.');
    const ok = ctx.body.decision === 'approve';
    tx(db, () => {
      if (!ok) {
        const ground = PHOTO_TEMPLATES[ctx.body.ground] ? ctx.body.ground : 'charter';
        notify(db, p.user_id, 'photo_rejected', ground, ctx.body.explanation || PHOTO_TEMPLATES[ground], `photo:${p.id}`);
      }
      db.prepare('UPDATE photos SET status = ? WHERE id = ?').run(ok ? 'approved' : 'rejected', p.id);
      // La modération peut corriger le marquage : une photo explicite non signalée est validée « comme explicite ».
      if (ok && 'explicit' in ctx.body) {
        if (ctx.body.explicit && p.kind === 'alternate') fail(400, "Une photo alternative doit être sans nudité : refuse-la avec le motif « nudité ».");
        if (ctx.body.explicit && p.kind === 'plan') fail(400, "Une couverture de plan doit être sans nudité : refuse-la avec le motif « nudité ».");
        if (ctx.body.explicit && !explicitProfilesAllowed(db, ctx.config)) fail(400, "Les photos de profil explicites ne sont pas autorisées : refuse la photo avec le motif « nudité ».");
        db.prepare('UPDATE photos SET explicit = ? WHERE id = ?').run(ctx.body.explicit ? 1 : 0, p.id);
      }
    });
    audit(db, admin.id, ok ? 'photo_approved' : 'photo_rejected', `photo:${p.id}`, { user_id: p.user_id, explicit: 'explicit' in ctx.body ? !!ctx.body.explicit : undefined });
    return { ok: true };
  });

  // --- signalements ---
  r.get('/api/admin/reports', (ctx) => {
    requireAdmin(ctx);
    const status = ['open', 'dismissed', 'actioned'].includes(ctx.query.get('status')) ? ctx.query.get('status') : 'open';
    const rows = ctx.db.prepare(`SELECT r.*, a.first_name AS reporter_name, t.first_name AS target_name, t.status AS target_status
      FROM reports r LEFT JOIN users a ON a.id = r.reporter_id LEFT JOIN users t ON t.id = r.target_user_id
      WHERE r.status = ? ORDER BY (r.reason IN ('minor', 'non_consensual', 'illegal')) DESC, r.created_at LIMIT 200`).all(status);
    return { grounds: GROUNDS, reports: rows.map((x) => ({ ...x, evidence: JSON.parse(x.evidence), reporter_contact: x.reporter_contact ? JSON.parse(x.reporter_contact) : null })) };
  });

  r.post('/api/admin/reports/:id/resolve', (ctx) => {
    const admin = requireAdmin(ctx);
    const db = ctx.db;
    const rep = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(ctx.params.id));
    if (!rep) fail(404, 'Signalement introuvable.');
    const action = String(ctx.body.action);
    if (!['dismiss', 'handled', 'remove_content', 'suspend', 'ban'].includes(action)) fail(400, 'Action inconnue.');
    const note = String(ctx.body.note || '').slice(0, 1000);
    const target = rep.target_user_id ? db.prepare('SELECT * FROM users WHERE id = ?').get(rep.target_user_id) : null;
    if (['remove_content', 'suspend', 'ban'].includes(action) && !target) fail(400, "Ce signalement ne vise pas de compte : choisis « Traité » ou « Classer ».");
    tx(db, () => {
      const related = rep.target_type === 'user' || rep.target_type === 'external' ? null : `${rep.target_type}:${rep.target_id}`;
      if (['remove_content', 'suspend', 'ban'].includes(action)) {
        if (rep.target_type === 'message') db.prepare('UPDATE messages SET removed = 1 WHERE id = ?').run(rep.target_id);
        if (rep.target_type === 'post') db.prepare('UPDATE posts SET removed = 1 WHERE id = ?').run(rep.target_id);
        if (rep.target_type === 'photo') db.prepare("UPDATE photos SET status = 'rejected' WHERE id = ?").run(rep.target_id);
        if (rep.target_type === 'plan') db.prepare("UPDATE plans SET status = 'removed' WHERE id = ?").run(rep.target_id);
      }
      if (target && target.role !== 'admin') {
        if (action === 'remove_content') notify(db, target.id, 'content_removed', String(ctx.body.ground), ctx.body.explanation, related);
        if (action === 'suspend' || action === 'ban') {
          notify(db, target.id, action === 'ban' ? 'account_banned' : 'account_suspended', String(ctx.body.ground), ctx.body.explanation, related);
          db.prepare('UPDATE users SET status = ? WHERE id = ?').run(action === 'ban' ? 'banned' : 'suspended', target.id);
          db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
          if (action === 'ban') blockEmail(db, target.email, 'ban');
        }
      }
      db.prepare('UPDATE reports SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?')
        .run(action === 'dismiss' ? 'dismissed' : 'actioned', JSON.stringify({ action, ground: ctx.body.ground || null, note }), admin.id, Date.now(), rep.id);
    });
    audit(db, admin.id, `report_${action}`, `report:${rep.id}`, { target_user_id: rep.target_user_id, ground: ctx.body.ground || null, note });
    return { ok: true };
  });

  // --- événements « Ce soir » ---
  r.get('/api/admin/events', (ctx) => {
    requireAdmin(ctx);
    return {
      events: ctx.db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM rsvps r WHERE r.post_id = p.id) AS going FROM posts p
        WHERE p.kind = 'event' ORDER BY p.starts_at DESC LIMIT 100`).all()
    };
  });

  r.post('/api/admin/events', (ctx) => {
    const admin = requireAdmin(ctx);
    const b = ctx.body;
    const title = String(b.title || '').trim().slice(0, 120);
    const body = String(b.body || '').trim().slice(0, 1000);
    const startsAt = Date.parse(b.starts_at);
    if (!title || !body || !startsAt) fail(400, 'Titre, description et date sont obligatoires.');
    const info = ctx.db.prepare(`INSERT INTO posts (user_id, kind, title, body, place, starts_at, visibility, city, created_at)
      VALUES (NULL, 'event', ?, ?, ?, ?, 'members', ?, ?)`)
      .run(title, body, String(b.place || '').slice(0, 200) || null, startsAt, String(b.city || 'Paris').slice(0, 60), Date.now());
    audit(ctx.db, admin.id, 'event_created', `post:${info.lastInsertRowid}`, { title });
    return { id: Number(info.lastInsertRowid) };
  });

  r.delete('/api/admin/posts/:id', (ctx) => {
    const admin = requireAdmin(ctx);
    ctx.db.prepare('UPDATE posts SET removed = 1 WHERE id = ?').run(Number(ctx.params.id));
    audit(ctx.db, admin.id, 'post_removed', `post:${ctx.params.id}`);
    return { ok: true };
  });

  // --- abonnements ---
  r.get('/api/admin/subscriptions', (ctx) => {
    requireAdmin(ctx);
    const db = ctx.db;
    settleSubscriptions(db);
    const active = db.prepare(`SELECT s.*, u.first_name, u.email FROM subscriptions s JOIN users u ON u.id = s.user_id
      WHERE s.status = 'active' ORDER BY s.started_at DESC LIMIT 300`).all();
    return {
      payments_enabled: paymentsEnabled(db), provider: paymentProvider(),
      price_cents: Number(getSetting(db, 'plus_price_cents')),
      features: FEATURES, plus_features: getSetting(db, 'plus_features').split(',').filter((f) => FEATURES[f]),
      free_daily_likes: Number(getSetting(db, 'free_daily_likes')),
      active: active.map((s) => ({ id: s.id, user_id: s.user_id, first_name: s.first_name, email: s.email, provider: s.provider,
        started_at: s.started_at, current_period_end: s.current_period_end, cancel_at_period_end: !!s.cancel_at_period_end, price_cents: s.price_cents })),
      offered: db.prepare("SELECT COUNT(*) AS n FROM users WHERE premium = 1 AND role = 'member'").get().n,
      mrr_cents: active.filter((s) => !s.cancel_at_period_end).reduce((sum, s) => sum + (s.price_cents || 0), 0)
    };
  });

  // --- journal, réglages, conformité ---
  r.get('/api/admin/audit', (ctx) => {
    requireAdmin(ctx);
    return {
      entries: ctx.db.prepare(`SELECT a.*, x.first_name AS admin_name FROM audit a LEFT JOIN users x ON x.id = a.admin_id
        ORDER BY a.id DESC LIMIT 300`).all()
    };
  });

  r.get('/api/admin/settings', (ctx) => {
    requireAdmin(ctx);
    const settings = {};
    for (const [k, spec] of Object.entries(SETTINGS_SPEC)) {
      if (!spec.hidden) settings[k] = { ...spec, value: getSetting(ctx.db, k) };
    }
    return { settings, features: FEATURES };
  });

  r.put('/api/admin/settings', (ctx) => {
    const admin = requireAdmin(ctx);
    const changed = {};
    for (const [k, spec] of Object.entries(SETTINGS_SPEC)) {
      if (!(k in ctx.body) || spec.hidden) continue;
      let v = ctx.body[k];
      if (spec.type === 'int') {
        v = Number(v);
        if (!Number.isInteger(v) || v < spec.min || v > spec.max) fail(400, `Valeur invalide : ${spec.label}.`);
      } else if (spec.type === 'bool') {
        v = v === true || v === '1' || v === 1 ? '1' : '0';
      } else if (spec.type === 'list') {
        v = (Array.isArray(v) ? v : String(v).split(',')).filter((f) => FEATURES[f]).join(',');
      } else {
        v = String(v ?? '').trim();
        if (v.length > spec.max) fail(400, `Trop long : ${spec.label}.`);
      }
      setSetting(ctx.db, k, v);
      changed[k] = v;
    }
    audit(ctx.db, admin.id, 'settings_changed', null, changed);
    return { ok: true };
  });

  r.get('/api/admin/compliance', (ctx) => {
    requireAdmin(ctx);
    const db = ctx.db;
    const s = (k) => getSetting(db, k);
    const one = (sql, ...a) => db.prepare(sql).get(...a).n;
    const lastPurge = Number(s('last_purge_at'));
    const items = [
      ['Mentions légales complètes (raison sociale, adresse, RCS, directeur de publication, hébergeur)', ['legal_company', 'legal_address', 'legal_siren', 'legal_director', 'legal_host'].every((k) => s(k)), 'LCEN'],
      ['Point de contact DSA (e-mail)', !!s('legal_contact_email'), 'DSA art. 11 et 12'],
      ['DPO désigné (e-mail)', !!s('legal_dpo_email'), 'RGPD art. 37 : obligatoire pour des données sensibles à grande échelle'],
      ["Données hébergées dans l'Union européenne", s('legal_hosting_eu') === '1', 'RGPD, chapitre V'],
      ["Vérification d'âge par un prestataire réel", verificationProvider() !== 'mock', 'CGU art. 3, Code pénal art. 227-24 pour les albums'],
      ['Détection de contenus pédocriminels connus branchée', !!process.env.ILD_CSAM_SCANNER, 'Code pénal art. 227-23, signalement PHAROS'],
      ["Photos de profil explicites : seulement avec une vraie vérification d'âge et la détection branchée",
        !explicitProfilesAllowed(db, ctx.config) || (verificationProvider() !== 'mock' && !!process.env.ILD_CSAM_SCANNER), 'Code pénal art. 227-24 ; loi SREN (référentiel Arcom)'],
      ['Cookies sécurisés (HTTPS)', ctx.config.secureCookies, 'RGPD art. 32'],
      ['Clé de hachage de la liste des bannis personnalisée', !!process.env.ILD_BLOCKLIST_PEPPER, 'RGPD art. 32'],
      ['Purge des données expirées faite il y a moins de 7 jours', lastPurge > Date.now() - 7 * DAY, 'RGPD art. 5 (limitation de conservation)'],
      ['Aucun signalement ouvert depuis plus de 24 h', one("SELECT COUNT(*) AS n FROM reports WHERE status = 'open' AND created_at < ?", Date.now() - DAY) === 0, 'DSA art. 16 : traitement diligent'],
      ['Aucun recours en attente depuis plus de 7 jours', one("SELECT COUNT(*) AS n FROM notices WHERE appeal_status = 'pending' AND appeal_at < ?", Date.now() - 7 * DAY) === 0, 'DSA art. 20'],
      ['Paiement : médiateur de la consommation indiqué (si payant activé)', !paymentsEnabled(db) || !!s('legal_mediator'), 'Code de la consommation, art. L612-1'],
      ['Paiement : prestataire réel branché (si payant activé)', !paymentsEnabled(db) || paymentProvider() !== 'mock', 'CGV']
    ];
    return {
      legal_version: LEGAL_VERSION,
      last_purge_at: lastPurge || null,
      checks: items.map(([label, ok, ref]) => ({ label, ok: !!ok, ref })),
      outside_app: [
        "Analyse d'impact (AIPD) signée, avec le DPO",
        'Registre des traitements',
        'CGU, politique de confidentialité et charte relues par un avocat',
        "Contrat de sous-traitance (art. 28) avec l'hébergeur et le prestataire de vérification",
        "Dépôt de la marque à l'INPI",
        "Procédure de signalement à PHAROS et de conservation des preuves pour les autorités"
      ]
    };
  });

  // Purge RGPD : candidatures non abouties, photos refusées, sessions, positions, accès d'albums, signalements, liste des bannis.
  r.post('/api/admin/maintenance/purge', (ctx) => {
    const admin = requireAdmin(ctx);
    const result = purge(ctx);
    audit(ctx.db, admin.id, 'purge', null, result);
    return result;
  });
}

export function purge(ctx) {
  const db = ctx.db;
  const now = Date.now();
  const months = (k) => Number(getSetting(db, k)) * 30 * DAY;
  const appCut = now - months('retention_months_applicants');
  const stale = db.prepare(`SELECT id FROM users WHERE role = 'member' AND (
    (status = 'refused' AND COALESCE(decided_at, created_at) < ?) OR
    (status IN ('pending', 'waitlist') AND created_at < ?))`).all(appCut, appCut);
  for (const u of stale) deletePhotoFiles(ctx, u.id);
  for (const u of stale) db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  const rejected = db.prepare("SELECT file FROM photos WHERE status = 'rejected' AND created_at < ?").all(now - 30 * DAY);
  deleteFiles(ctx, rejected.map((p) => p.file));
  const result = {
    applicants_deleted: stale.length,
    rejected_photos_deleted: db.prepare("DELETE FROM photos WHERE status = 'rejected' AND created_at < ?").run(now - 30 * DAY).changes,
    sessions_deleted: db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now).changes,
    locations_cleared: db.prepare('UPDATE users SET lat = NULL, lng = NULL, location_source = NULL WHERE lat IS NOT NULL AND location_updated_at < ?')
      .run(now - Number(getSetting(db, 'location_ttl_days')) * DAY).changes,
    album_shares_deleted: db.prepare('DELETE FROM album_shares WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR (expires_at IS NOT NULL AND expires_at < ?)')
      .run(now - 30 * DAY, now - 30 * DAY).changes,
    reports_deleted: db.prepare("DELETE FROM reports WHERE status != 'open' AND resolved_at < ?").run(now - months('retention_months_reports')).changes,
    blocklist_deleted: db.prepare('DELETE FROM blocklist WHERE created_at < ?').run(now - months('retention_months_blocklist')).changes,
    presences_cleared: db.prepare('UPDATE users SET presence_until = NULL, presence_note = NULL, presence_place = NULL WHERE presence_until < ?').run(now).changes,
    checkins_deleted: db.prepare('DELETE FROM spot_checkins WHERE until < ?').run(now).changes,
    // Plans à plusieurs terminés depuis 30 jours : annonce, adresse, demandes, discussion et couverture.
    plan_covers_deleted: (() => {
      const old = db.prepare("SELECT p.id, p.file FROM photos p JOIN plans x ON x.id = p.plan_id WHERE p.kind = 'plan' AND x.ends_at < ?").all(now - 30 * DAY);
      deleteFiles(ctx, old.map((p) => p.file));
      return old.length;
    })(),
    plans_deleted: db.prepare('DELETE FROM plans WHERE ends_at < ?').run(now - 30 * DAY).changes,
    // LivePlay : l'historique des appels (qui, quand, combien de temps) est gardé 30 jours pour les signalements.
    calls_deleted: db.prepare("DELETE FROM calls WHERE created_at < ? AND status NOT IN ('ringing', 'active')").run(now - 30 * DAY).changes,
    trips_cleared: db.prepare('UPDATE users SET trip_lat = NULL, trip_lng = NULL, trip_label = NULL, trip_until = NULL WHERE trip_until < ?').run(now).changes,
    subscriptions: settleSubscriptions(db)
  };
  setSetting(db, 'last_purge_at', now);
  return result;
}

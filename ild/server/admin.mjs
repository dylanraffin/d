// API du back office. Chaque action qui change quelque chose est inscrite au journal d'audit.
import { fail } from './http.mjs';
import { requireAdmin } from './auth.mjs';
import { audit, getSetting, DEFAULT_SETTINGS, tx } from './db.mjs';
import { publicProfile, vouchCount, waitlistPosition, deletePhotoFiles } from './api.mjs';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';

// Seuls motifs de refus possibles : jamais l'apparence, l'âge (au-delà de la majorité), l'origine, etc.
export const REFUSAL_REASONS = {
  fake_profile: 'Faux profil ou identité non confirmée',
  safety: 'Risque pour la sécurité des membres',
  charter: 'Non-respect de la charte',
  minor: 'Personne mineure'
};

const DAY = 86400e3;

function applicantRow(db, u) {
  return {
    id: u.id, first_name: u.first_name, email: u.email, age: new Date().getFullYear() - u.birth_year,
    city: u.city, status: u.status, id_check_status: u.id_check_status, created_at: u.created_at,
    vouches: vouchCount(db, u.id),
    vouchers: db.prepare('SELECT x.id, x.first_name FROM vouches v JOIN users x ON x.id = v.voucher_id WHERE v.applicant_id = ?').all(u.id),
    invited_by: u.invited_by_code
      ? db.prepare('SELECT id, first_name FROM users WHERE referral_code = ?').get(u.invited_by_code) || null
      : null,
    charter_at: u.charter_at, consent_orientation_at: u.consent_orientation_at,
    waitlist_position: u.status === 'waitlist' ? waitlistPosition(db, u) : null,
    photos: db.prepare("SELECT id, status FROM photos WHERE user_id = ? AND kind = 'profile' ORDER BY position, id").all(u.id),
    refusal_reason: u.refusal_reason
  };
}

function getUser(db, id) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  if (!u) fail(404, 'Utilisateur introuvable.');
  return u;
}

export function registerAdminRoutes(r) {
  r.get('/api/admin/stats', (ctx) => {
    requireAdmin(ctx);
    const db = ctx.db;
    const one = (sql, ...a) => db.prepare(sql).get(...a).n;
    const since = Date.now() - 7 * DAY;
    return {
      members: one("SELECT COUNT(*) AS n FROM users WHERE status = 'member'"),
      premium: one("SELECT COUNT(*) AS n FROM users WHERE status = 'member' AND premium = 1"),
      pending_id: one("SELECT COUNT(*) AS n FROM users WHERE status = 'pending'"),
      id_to_review: one("SELECT COUNT(*) AS n FROM users WHERE status = 'pending' AND id_check_status = 'submitted'"),
      waitlist: one("SELECT COUNT(*) AS n FROM users WHERE status = 'waitlist'"),
      ready_for_committee: one(`SELECT COUNT(*) AS n FROM users u WHERE status = 'waitlist'
        AND (SELECT COUNT(*) FROM vouches v WHERE v.applicant_id = u.id) >= ?`, Number(getSetting(db, 'vouches_required'))),
      photos_to_review: one("SELECT COUNT(*) AS n FROM photos WHERE status = 'pending'"),
      reports_open: one("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
      reports_urgent: one("SELECT COUNT(*) AS n FROM reports WHERE status = 'open' AND reason IN ('minor', 'non_consensual', 'illegal')"),
      matches_7d: one('SELECT COUNT(*) AS n FROM matches WHERE created_at > ?', since),
      messages_7d: one('SELECT COUNT(*) AS n FROM messages WHERE created_at > ?', since),
      signups_7d: one('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', since),
      suspended: one("SELECT COUNT(*) AS n FROM users WHERE status IN ('suspended', 'banned')")
    };
  });

  // --- candidatures ---
  r.get('/api/admin/applications', (ctx) => {
    requireAdmin(ctx);
    const status = ['pending', 'waitlist', 'refused'].includes(ctx.query.get('status')) ? ctx.query.get('status') : 'waitlist';
    const rows = ctx.db.prepare('SELECT * FROM users WHERE status = ? AND role = \'member\' ORDER BY created_at').all(status);
    const list = rows.map((u) => applicantRow(ctx.db, u));
    if (status === 'waitlist') list.sort((a, b) => a.waitlist_position - b.waitlist_position);
    return { status, vouches_required: Number(getSetting(ctx.db, 'vouches_required')), reasons: REFUSAL_REASONS, applications: list };
  });

  r.post('/api/admin/applications/:id/verify-id', (ctx) => {
    const admin = requireAdmin(ctx);
    const u = getUser(ctx.db, ctx.params.id);
    const ok = ctx.body.result !== 'failed';
    ctx.db.prepare(`UPDATE users SET id_check_status = ?, id_verified_at = ?,
      status = CASE WHEN status = 'pending' AND ? THEN 'waitlist' ELSE status END WHERE id = ?`)
      .run(ok ? 'verified' : 'failed', ok ? Date.now() : null, ok ? 1 : 0, u.id);
    audit(ctx.db, admin.id, ok ? 'id_verified' : 'id_failed', `user:${u.id}`);
    return { ok: true };
  });

  r.post('/api/admin/applications/:id/accept', (ctx) => {
    const admin = requireAdmin(ctx);
    const u = getUser(ctx.db, ctx.params.id);
    if (u.status !== 'waitlist') fail(400, "Seule une candidature avec identité vérifiée (liste d'attente) peut être acceptée.");
    ctx.db.prepare("UPDATE users SET status = 'member', accepted_at = ?, decided_at = ?, refusal_reason = NULL WHERE id = ?")
      .run(Date.now(), Date.now(), u.id);
    audit(ctx.db, admin.id, 'application_accepted', `user:${u.id}`, { vouches: vouchCount(ctx.db, u.id) });
    return { ok: true };
  });

  r.post('/api/admin/applications/:id/refuse', (ctx) => {
    const admin = requireAdmin(ctx);
    const u = getUser(ctx.db, ctx.params.id);
    const reason = String(ctx.body.reason);
    if (!REFUSAL_REASONS[reason]) fail(400, 'Choisis un motif documenté (faux profil, sécurité, charte, mineur).');
    if (!['pending', 'waitlist'].includes(u.status)) fail(400, 'Candidature déjà traitée.');
    ctx.db.prepare("UPDATE users SET status = 'refused', refusal_reason = ?, decided_at = ? WHERE id = ?").run(reason, Date.now(), u.id);
    ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    audit(ctx.db, admin.id, 'application_refused', `user:${u.id}`, { reason });
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
    return {
      members: rows.map((u) => ({
        id: u.id, first_name: u.first_name, email: u.email, age: new Date().getFullYear() - u.birth_year,
        city: u.city, neighborhood: u.neighborhood, status: u.status, premium: !!u.premium,
        accepted_at: u.accepted_at, created_at: u.created_at,
        reports: ctx.db.prepare('SELECT COUNT(*) AS n FROM reports WHERE target_user_id = ?').get(u.id).n
      }))
    };
  });

  r.get('/api/admin/members/:id', (ctx) => {
    requireAdmin(ctx);
    const db = ctx.db;
    const u = getUser(db, ctx.params.id);
    return {
      user: { ...applicantRow(db, u), premium: !!u.premium, neighborhood: u.neighborhood, accepted_at: u.accepted_at },
      profile: publicProfile(db, null, u),
      reports_against: db.prepare('SELECT id, reason, status, created_at FROM reports WHERE target_user_id = ? ORDER BY created_at DESC').all(u.id),
      reports_made: db.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter_id = ?').get(u.id).n,
      stats: {
        matches: db.prepare('SELECT COUNT(*) AS n FROM matches WHERE a_id = ? OR b_id = ?').get(u.id, u.id).n,
        messages: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE sender_id = ?').get(u.id).n,
        album_photos: db.prepare("SELECT COUNT(*) AS n FROM photos WHERE user_id = ? AND kind = 'album'").get(u.id).n
      },
      history: db.prepare("SELECT action, details, created_at FROM audit WHERE target = ? ORDER BY id DESC LIMIT 50").all(`user:${u.id}`)
    };
  });

  r.post('/api/admin/members/:id/status', (ctx) => {
    const admin = requireAdmin(ctx);
    const u = getUser(ctx.db, ctx.params.id);
    if (u.role === 'admin') fail(400, 'Impossible de modifier un administrateur.');
    const status = String(ctx.body.status);
    if (!['member', 'suspended', 'banned'].includes(status)) fail(400, 'Statut invalide.');
    const note = String(ctx.body.note || '').slice(0, 500);
    ctx.db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, u.id);
    if (status !== 'member') ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    audit(ctx.db, admin.id, `member_${status}`, `user:${u.id}`, { note });
    return { ok: true };
  });

  r.post('/api/admin/members/:id/premium', (ctx) => {
    const admin = requireAdmin(ctx);
    const u = getUser(ctx.db, ctx.params.id);
    const v = ctx.body.active ? 1 : 0;
    ctx.db.prepare('UPDATE users SET premium = ? WHERE id = ?').run(v, u.id);
    audit(ctx.db, admin.id, v ? 'premium_on' : 'premium_off', `user:${u.id}`);
    return { ok: true };
  });

  // --- photos ---
  r.get('/api/admin/photos', (ctx) => {
    requireAdmin(ctx);
    return {
      photos: ctx.db.prepare(`SELECT p.id, p.user_id, p.created_at, x.first_name FROM photos p JOIN users x ON x.id = p.user_id
        WHERE p.status = 'pending' AND p.kind = 'profile' ORDER BY p.created_at LIMIT 100`).all()
    };
  });

  r.post('/api/admin/photos/:id/review', (ctx) => {
    const admin = requireAdmin(ctx);
    const p = ctx.db.prepare('SELECT * FROM photos WHERE id = ?').get(Number(ctx.params.id));
    if (!p) fail(404, 'Photo introuvable.');
    const ok = ctx.body.decision === 'approve';
    ctx.db.prepare('UPDATE photos SET status = ? WHERE id = ?').run(ok ? 'approved' : 'rejected', p.id);
    audit(ctx.db, admin.id, ok ? 'photo_approved' : 'photo_rejected', `photo:${p.id}`, { user_id: p.user_id });
    return { ok: true };
  });

  // --- signalements ---
  r.get('/api/admin/reports', (ctx) => {
    requireAdmin(ctx);
    const status = ['open', 'dismissed', 'actioned'].includes(ctx.query.get('status')) ? ctx.query.get('status') : 'open';
    const rows = ctx.db.prepare(`SELECT r.*, a.first_name AS reporter_name, t.first_name AS target_name, t.status AS target_status
      FROM reports r LEFT JOIN users a ON a.id = r.reporter_id LEFT JOIN users t ON t.id = r.target_user_id
      WHERE r.status = ? ORDER BY (r.reason IN ('minor', 'non_consensual', 'illegal')) DESC, r.created_at LIMIT 200`).all(status);
    return { reports: rows.map((r) => ({ ...r, evidence: JSON.parse(r.evidence) })) };
  });

  r.post('/api/admin/reports/:id/resolve', (ctx) => {
    const admin = requireAdmin(ctx);
    const db = ctx.db;
    const rep = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(ctx.params.id));
    if (!rep) fail(404, 'Signalement introuvable.');
    const action = String(ctx.body.action);
    if (!['dismiss', 'remove_content', 'suspend', 'ban'].includes(action)) fail(400, 'Action inconnue.');
    const note = String(ctx.body.note || '').slice(0, 1000);
    tx(db, () => {
      if (action === 'remove_content' || action === 'ban' || action === 'suspend') {
        if (rep.target_type === 'message') db.prepare('UPDATE messages SET removed = 1 WHERE id = ?').run(rep.target_id);
        if (rep.target_type === 'post') db.prepare('UPDATE posts SET removed = 1 WHERE id = ?').run(rep.target_id);
        if (rep.target_type === 'photo') db.prepare("UPDATE photos SET status = 'rejected' WHERE id = ?").run(rep.target_id);
      }
      if ((action === 'ban' || action === 'suspend') && rep.target_user_id) {
        const t = db.prepare('SELECT role FROM users WHERE id = ?').get(rep.target_user_id);
        if (t && t.role !== 'admin') {
          db.prepare('UPDATE users SET status = ? WHERE id = ?').run(action === 'ban' ? 'banned' : 'suspended', rep.target_user_id);
          db.prepare('DELETE FROM sessions WHERE user_id = ?').run(rep.target_user_id);
        }
      }
      db.prepare('UPDATE reports SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?')
        .run(action === 'dismiss' ? 'dismissed' : 'actioned', JSON.stringify({ action, note }), admin.id, Date.now(), rep.id);
    });
    audit(db, admin.id, `report_${action}`, `report:${rep.id}`, { target_user_id: rep.target_user_id, note });
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

  // --- journal et réglages ---
  r.get('/api/admin/audit', (ctx) => {
    requireAdmin(ctx);
    return {
      entries: ctx.db.prepare(`SELECT a.*, x.first_name AS admin_name FROM audit a LEFT JOIN users x ON x.id = a.admin_id
        ORDER BY a.id DESC LIMIT 300`).all()
    };
  });

  r.get('/api/admin/settings', (ctx) => {
    requireAdmin(ctx);
    const out = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = getSetting(ctx.db, k);
    return { settings: out };
  });

  r.put('/api/admin/settings', (ctx) => {
    const admin = requireAdmin(ctx);
    const changed = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (!(k in ctx.body)) continue;
      const v = Number(ctx.body[k]);
      if (!Number.isInteger(v) || v < 0 || v > 120) fail(400, `Valeur invalide pour ${k}.`);
      ctx.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(k, String(v));
      changed[k] = v;
    }
    audit(ctx.db, admin.id, 'settings_changed', null, changed);
    return { ok: true };
  });

  // Purge RGPD : candidatures refusées ou jamais acceptées au-delà de la durée de conservation,
  // sessions et accès d'album expirés, signalements traités trop anciens.
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
  const appCut = now - Number(getSetting(db, 'retention_months_applicants')) * 30 * DAY;
  const repCut = now - Number(getSetting(db, 'retention_months_reports')) * 30 * DAY;
  const stale = db.prepare(`SELECT id FROM users WHERE role = 'member' AND (
    (status = 'refused' AND COALESCE(decided_at, created_at) < ?) OR
    (status IN ('pending', 'waitlist') AND created_at < ?))`).all(appCut, appCut);
  for (const u of stale) deletePhotoFiles(ctx, u.id);
  const del = db.prepare('DELETE FROM users WHERE id = ?');
  for (const u of stale) del.run(u.id);
  const orphan = db.prepare("SELECT file FROM photos WHERE status = 'rejected' AND created_at < ?").all(now - 30 * DAY);
  for (const p of orphan) { try { unlinkSync(join(ctx.config.uploadsDir, p.file)); } catch { /* déjà supprimé */ } }
  return {
    applicants_deleted: stale.length,
    rejected_photos_deleted: db.prepare("DELETE FROM photos WHERE status = 'rejected' AND created_at < ?").run(now - 30 * DAY).changes,
    sessions_deleted: db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now).changes,
    album_grants_deleted: db.prepare('DELETE FROM album_grants WHERE expires_at < ?').run(now).changes,
    reports_deleted: db.prepare("DELETE FROM reports WHERE status != 'open' AND resolved_at < ?").run(repCut).changes
  };
}

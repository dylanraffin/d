// Décisions de modération communiquées à la personne (DSA art. 17) et recours internes (DSA art. 20).
import { fail } from './http.mjs';
import { requireAccount, requireAdmin } from './auth.mjs';
import { audit, tx } from './db.mjs';
import { GROUNDS } from './options.mjs';
import { str, unblockEmail, DAY } from './core.mjs';

export const NOTICE_KINDS = {
  application_refused: 'Candidature refusée',
  account_suspended: 'Compte suspendu',
  account_banned: 'Compte banni',
  content_removed: 'Contenu retiré',
  photo_rejected: 'Photo refusée'
};
const APPEAL_WINDOW = 183 * DAY; // au moins 6 mois pour contester

function view(n) {
  return {
    id: n.id, kind: n.kind, kind_label: NOTICE_KINDS[n.kind], ground: GROUNDS[n.ground] || n.ground,
    explanation: n.explanation, related: n.related, automated: !!n.automated, created_at: n.created_at,
    read: !!n.read_at, appeal: { status: n.appeal_status, text: n.appeal_text, at: n.appeal_at, note: n.appeal_note, decided_at: n.appeal_decided_at },
    can_appeal: n.appeal_status === 'none' && Date.now() - n.created_at < APPEAL_WINDOW
  };
}

export function registerNoticeRoutes(r) {
  r.get('/api/notices', (ctx) => {
    const u = requireAccount(ctx);
    return { notices: ctx.db.prepare('SELECT * FROM notices WHERE user_id = ? ORDER BY id DESC').all(u.id).map(view) };
  });

  r.post('/api/notices/:id/read', (ctx) => {
    const u = requireAccount(ctx);
    ctx.db.prepare('UPDATE notices SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?').run(Date.now(), Number(ctx.params.id), u.id);
    return { ok: true };
  });

  r.post('/api/notices/:id/appeal', (ctx) => {
    const u = requireAccount(ctx);
    const n = ctx.db.prepare('SELECT * FROM notices WHERE id = ? AND user_id = ?').get(Number(ctx.params.id), u.id);
    if (!n) fail(404, 'Décision introuvable.');
    if (!view(n).can_appeal) fail(400, 'Cette décision ne peut plus être contestée ici.');
    const text = str(ctx.body.text, 2000, { required: true, label: 'Ton recours' });
    ctx.db.prepare("UPDATE notices SET appeal_text = ?, appeal_at = ?, appeal_status = 'pending' WHERE id = ?").run(text, Date.now(), n.id);
    return { ok: true };
  });

  // --- back office ---
  r.get('/api/admin/appeals', (ctx) => {
    requireAdmin(ctx);
    const pending = ctx.query.get('status') !== 'decided';
    const rows = ctx.db.prepare(`SELECT n.*, u.first_name, u.status AS user_status FROM notices n JOIN users u ON u.id = n.user_id
      WHERE ${pending ? "n.appeal_status = 'pending'" : "n.appeal_status IN ('upheld', 'overturned')"} ORDER BY n.appeal_at LIMIT 200`).all();
    return { appeals: rows.map((n) => ({ ...view(n), user_id: n.user_id, first_name: n.first_name, user_status: n.user_status })) };
  });

  r.post('/api/admin/appeals/:id/decide', (ctx) => {
    const admin = requireAdmin(ctx);
    const db = ctx.db;
    const n = db.prepare("SELECT * FROM notices WHERE id = ? AND appeal_status = 'pending'").get(Number(ctx.params.id));
    if (!n) fail(404, 'Recours introuvable.');
    const decision = ctx.body.decision === 'overturned' ? 'overturned' : 'upheld';
    const note = str(ctx.body.note, 2000, { required: true, label: 'Réponse à la personne' });
    tx(db, () => {
      db.prepare('UPDATE notices SET appeal_status = ?, appeal_note = ?, appeal_decided_at = ?, appeal_decided_by = ? WHERE id = ?')
        .run(decision, note, Date.now(), admin.id, n.id);
      if (decision === 'overturned') undo(db, n);
    });
    audit(db, admin.id, `appeal_${decision}`, `user:${n.user_id}`, { notice: n.id, note });
    return { ok: true };
  });
}

// Annule les effets d'une décision quand le recours est accepté.
function undo(db, n) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(n.user_id);
  if (!u) return;
  if (n.kind === 'account_suspended' || n.kind === 'account_banned') {
    db.prepare("UPDATE users SET status = 'member' WHERE id = ? AND status IN ('suspended', 'banned')").run(u.id);
    unblockEmail(db, u.email);
  } else if (n.kind === 'application_refused') {
    db.prepare(`UPDATE users SET status = CASE WHEN age_verified_at IS NOT NULL THEN 'waitlist' ELSE 'pending' END,
      refusal_reason = NULL WHERE id = ? AND status = 'refused'`).run(u.id);
    unblockEmail(db, u.email);
  }
  // Le contenu retiré avec la décision est rétabli lui aussi.
  if (n.related) {
    const [type, id] = n.related.split(':');
    if (type === 'message') db.prepare('UPDATE messages SET removed = 0 WHERE id = ?').run(Number(id));
    if (type === 'post') db.prepare('UPDATE posts SET removed = 0 WHERE id = ?').run(Number(id));
    if (type === 'photo') db.prepare("UPDATE photos SET status = 'approved' WHERE id = ?").run(Number(id));
  }
}

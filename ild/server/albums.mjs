// Albums privés : plusieurs albums par membre, envoyés en privé à un match depuis la conversation,
// pour une durée choisie, retirables à tout moment.
import { fail } from './http.mjs';
import { requireMember } from './auth.mjs';
import { tx } from './db.mjs';
import { DAY, str, visibleMember, matchBetween, hiddenBetween, saveJpeg, scanImage, deleteFiles } from './core.mjs';

const MAX_ALBUMS = 10;
const MAX_PHOTOS_PER_ALBUM = 30;
export const DURATIONS = { '1h': 3600e3, '24h': DAY, '7d': 7 * DAY, forever: null };

function ownAlbum(ctx, u) {
  const a = ctx.db.prepare('SELECT * FROM albums WHERE id = ? AND user_id = ?').get(Number(ctx.params.id), u.id);
  if (!a) fail(404, 'Album introuvable.');
  return a;
}

export function shareState(db, share) {
  if (!share) return null;
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(share.album_id);
  const owner = db.prepare('SELECT status FROM users WHERE id = ?').get(share.owner_id);
  const now = Date.now();
  let state = 'active';
  if (!album) state = 'deleted';
  else if (share.revoked_at) state = 'revoked';
  else if (share.expires_at && share.expires_at <= now) state = 'expired';
  else if (!owner || owner.status !== 'member' || hiddenBetween(db, share.grantee_id, share.owner_id)) state = 'unavailable';
  return {
    share_id: share.id, album_id: share.album_id, state, expires_at: share.expires_at,
    name: album ? album.name : null,
    count: album ? db.prepare("SELECT COUNT(*) AS n FROM photos WHERE album_id = ? AND status = 'approved'").get(album.id).n : 0
  };
}

export function registerAlbumRoutes(r) {
  r.get('/api/me/albums', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const albums = db.prepare('SELECT * FROM albums WHERE user_id = ? ORDER BY created_at').all(u.id).map((a) => ({
      id: a.id, name: a.name, created_at: a.created_at,
      photos: db.prepare("SELECT id FROM photos WHERE album_id = ? AND status = 'approved' ORDER BY id").all(a.id).map((p) => p.id),
      shares: db.prepare(`SELECT s.id, s.grantee_id, x.first_name, s.expires_at FROM album_shares s JOIN users x ON x.id = s.grantee_id
        WHERE s.album_id = ? AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > ?) ORDER BY s.id DESC`).all(a.id, Date.now())
    }));
    const requests = db.prepare(`SELECT r.requester_id AS id, x.first_name, r.created_at FROM album_requests r
      JOIN users x ON x.id = r.requester_id WHERE r.owner_id = ? AND x.status = 'member'`).all(u.id)
      .filter((x) => !hiddenBetween(db, u.id, x.id));
    return { albums, requests };
  });

  r.post('/api/me/albums', (ctx) => {
    const u = requireMember(ctx);
    const name = str(ctx.body.name, 40, { required: true, label: "Nom de l'album" });
    if (ctx.db.prepare('SELECT COUNT(*) AS n FROM albums WHERE user_id = ?').get(u.id).n >= MAX_ALBUMS) fail(400, `${MAX_ALBUMS} albums maximum.`);
    const info = ctx.db.prepare('INSERT INTO albums (user_id, name, created_at) VALUES (?, ?, ?)').run(u.id, name, Date.now());
    return { id: Number(info.lastInsertRowid) };
  });

  r.patch('/api/me/albums/:id', (ctx) => {
    const u = requireMember(ctx);
    const a = ownAlbum(ctx, u);
    ctx.db.prepare('UPDATE albums SET name = ? WHERE id = ?').run(str(ctx.body.name, 40, { required: true, label: "Nom de l'album" }), a.id);
    return { ok: true };
  });

  r.delete('/api/me/albums/:id', (ctx) => {
    const u = requireMember(ctx);
    const a = ownAlbum(ctx, u);
    deleteFiles(ctx, ctx.db.prepare('SELECT file FROM photos WHERE album_id = ?').all(a.id).map((p) => p.file));
    ctx.db.prepare('DELETE FROM albums WHERE id = ?').run(a.id);
    return { ok: true };
  });

  r.post('/api/me/albums/:id/photos', async (ctx) => {
    const u = requireMember(ctx);
    const a = ownAlbum(ctx, u);
    if (ctx.db.prepare('SELECT COUNT(*) AS n FROM photos WHERE album_id = ?').get(a.id).n >= MAX_PHOTOS_PER_ALBUM) {
      fail(400, `${MAX_PHOTOS_PER_ALBUM} photos maximum par album.`);
    }
    const { file, buf } = saveJpeg(ctx, ctx.body.data);
    const scan = await scanImage(buf);
    if (!scan.ok) { deleteFiles(ctx, [file]); fail(400, 'Image refusée.'); }
    // Pas de relecture humaine des albums : contrôle automatique + signalements.
    const info = ctx.db.prepare(`INSERT INTO photos (user_id, kind, album_id, file, status, created_at)
      VALUES (?, 'album', ?, ?, 'approved', ?)`).run(u.id, a.id, file, Date.now());
    return { id: Number(info.lastInsertRowid) };
  });

  // Envoyer un album à un match : crée l'accès et un message dans la conversation.
  r.post('/api/me/albums/:id/share', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const a = ownAlbum(ctx, u);
    const grantee = visibleMember(db, u, ctx.body.user_id);
    const m = matchBetween(db, u.id, grantee.id);
    if (!m) fail(403, 'Tu ne peux envoyer un album qu\'à un match.');
    if (!(ctx.body.duration in DURATIONS)) fail(400, 'Durée inconnue.');
    const ms = DURATIONS[ctx.body.duration];
    const now = Date.now();
    return tx(db, () => {
      const share = Number(db.prepare('INSERT INTO album_shares (album_id, owner_id, grantee_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(a.id, u.id, grantee.id, ms ? now + ms : null, now).lastInsertRowid);
      db.prepare("INSERT INTO messages (match_id, sender_id, kind, body, share_id, created_at) VALUES (?, ?, 'album', ?, ?, ?)")
        .run(m.id, u.id, a.name, share, now);
      db.prepare('DELETE FROM album_requests WHERE requester_id = ? AND owner_id = ?').run(grantee.id, u.id);
      return { share_id: share, expires_at: ms ? now + ms : null, match_id: m.id };
    });
  });

  r.delete('/api/me/albums/shares/:shareId', (ctx) => {
    const u = requireMember(ctx);
    const res = ctx.db.prepare('UPDATE album_shares SET revoked_at = ? WHERE id = ? AND owner_id = ? AND revoked_at IS NULL')
      .run(Date.now(), Number(ctx.params.shareId), u.id);
    if (!res.changes) fail(404, 'Accès introuvable.');
    return { ok: true };
  });

  // Albums reçus, et ouverture d'un album reçu.
  r.get('/api/albums/received', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const rows = db.prepare(`SELECT s.*, x.first_name FROM album_shares s JOIN users x ON x.id = s.owner_id
      WHERE s.grantee_id = ? AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > ?) ORDER BY s.id DESC`).all(u.id, Date.now());
    return { shares: rows.map((s) => ({ ...shareState(db, s), owner: { id: s.owner_id, first_name: s.first_name } })).filter((s) => s.state === 'active') };
  });

  r.get('/api/albums/shared/:shareId', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const s = db.prepare('SELECT * FROM album_shares WHERE id = ? AND grantee_id = ?').get(Number(ctx.params.shareId), u.id);
    const st = shareState(db, s);
    if (!st) fail(404, 'Album introuvable.');
    if (st.state !== 'active') fail(403, st.state === 'expired' ? "L'accès à cet album a expiré." : "L'accès à cet album a été retiré.");
    const owner = db.prepare('SELECT id, first_name FROM users WHERE id = ?').get(s.owner_id);
    return {
      ...st, owner, blur: !!u.blur_explicit,
      photos: db.prepare("SELECT id FROM photos WHERE album_id = ? AND status = 'approved' ORDER BY id").all(s.album_id).map((p) => p.id)
    };
  });

  // Demander à voir les albums de quelqu'un (il choisit ensuite lequel envoyer).
  r.post('/api/albums/:ownerId/request', (ctx) => {
    const u = requireMember(ctx);
    const owner = visibleMember(ctx.db, u, ctx.params.ownerId);
    if (!ctx.db.prepare('SELECT 1 FROM albums WHERE user_id = ?').get(owner.id)) fail(400, "Ce membre n'a pas d'album.");
    if (owner.album_matches_only && !matchBetween(ctx.db, u.id, owner.id)) fail(403, 'Ses albums sont réservés à ses matchs.');
    ctx.db.prepare('INSERT OR IGNORE INTO album_requests (requester_id, owner_id, created_at) VALUES (?, ?, ?)').run(u.id, owner.id, Date.now());
    return { ok: true };
  });

  r.delete('/api/me/album/requests/:userId', (ctx) => {
    const u = requireMember(ctx);
    ctx.db.prepare('DELETE FROM album_requests WHERE owner_id = ? AND requester_id = ?').run(u.id, Number(ctx.params.userId));
    return { ok: true };
  });
}

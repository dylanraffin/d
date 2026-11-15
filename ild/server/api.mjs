// API de l'app membre : comptes, profil, découverte, matchs, messages, « Ce soir », signalements.
import { randomBytes } from 'node:crypto';
import { fail } from './http.mjs';
import { hashPassword, verifyPassword, createSession, sessionCookie, clearCookie,
  requireAccount, requireUser, requireMember, rateLimiter } from './auth.mjs';
import { getSetting, tx } from './db.mjs';
import { LEGAL_VERSION, MODES, SEEKING, POSITIONS, VISIBILITY, TASTES, INTIMATE, REPORT_REASONS, NEIGHBORHOODS, pickList } from './options.mjs';
import { DAY, str, bool, isoDay, ageOf, parseBirthDate, hiddenBetween, matchBetween, visibleMember, profilePhotoIds,
  vouchCount, waitlistPosition, saveJpeg, scanImage, deleteFiles, deletePhotoFiles, isBlocklisted, activeShare } from './core.mjs';
import { hasFeature, requireFeature, entitlements, likesToday, dailyLikeLimit, paymentsEnabled } from './billing.mjs';
import { distanceBetween } from './geo.mjs';
import { readFilters, passesFilters } from './nearby.mjs';
import { shareState, DURATIONS } from './albums.mjs';

const MAX_PROFILE_PHOTOS = 6;
const loginLimit = rateLimiter(10, 15 * 60e3);
const registerLimit = rateLimiter(5, 60 * 60e3);

export const mapTiles = () => ({
  url: process.env.ILD_MAP_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: process.env.ILD_MAP_ATTRIBUTION || '© OpenStreetMap'
});

function newReferralCode(db, firstName) {
  const base = (firstName || 'ILD').normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'ILD';
  for (;;) {
    const code = `${base}-${randomBytes(3).toString('hex').toUpperCase().slice(0, 4)}`;
    if (!db.prepare('SELECT 1 FROM users WHERE referral_code = ?').get(code)) return code;
  }
}

const list = (s) => (s ? String(s).split(',').filter(Boolean) : []);

function travelActive(db, u) {
  if (!u.travel_city || !u.travel_from || !u.travel_to || !hasFeature(db, u, 'travel_mode')) return false;
  const days = Number(getSetting(db, 'travel_visible_days'));
  const today = isoDay(Date.now());
  return today >= isoDay(Date.parse(u.travel_from) - days * DAY) && today <= u.travel_to;
}

// Profil vu par `viewer`. La position et les goûts intimes respectent la visibilité choisie.
// viewer = { role: 'admin' } pour la modération (tout est visible).
export function publicProfile(db, viewer, u) {
  const isSelf = viewer?.id === u.id;
  const isAdmin = viewer?.role === 'admin' && !isSelf;
  const matched = viewer?.id && !isSelf ? !!matchBetween(db, viewer.id, u.id) : false;
  const canSee = (vis) => isSelf || isAdmin || vis === 'members' || (vis === 'matches' && matched);
  const vouchers = db.prepare(`SELECT x.first_name FROM vouches v JOIN users x ON x.id = v.voucher_id
    WHERE v.applicant_id = ? ORDER BY v.created_at`).all(u.id).map((r) => r.first_name);
  const albumCount = db.prepare('SELECT COUNT(*) AS n FROM albums WHERE user_id = ?').get(u.id).n;
  let shared = [];
  let requested = false;
  if (viewer?.id && !isSelf) {
    shared = db.prepare(`SELECT * FROM album_shares WHERE owner_id = ? AND grantee_id = ? AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > ?) ORDER BY id DESC`).all(u.id, viewer.id, Date.now())
      .map((s) => shareState(db, s)).filter((s) => s.state === 'active');
    requested = !!db.prepare('SELECT 1 FROM album_requests WHERE requester_id = ? AND owner_id = ?').get(viewer.id, u.id);
  }
  const d = viewer?.lat != null && !isSelf ? distanceBetween(viewer, u) : null;
  return {
    id: u.id,
    first_name: u.first_name,
    age: ageOf(u),
    city: u.city,
    neighborhood: u.neighborhood,
    job: u.job,
    bio: u.bio,
    prompt_answer: u.prompt_answer,
    interests: u.interests ? u.interests.split(',').map((s) => s.trim()).filter(Boolean) : [],
    tastes: list(u.tastes),
    seeking: list(u.seeking),
    position: canSee(u.position_visibility) ? u.position : null,
    intimate: canSee(u.intimate_visibility) ? list(u.intimate) : [],
    music_title: u.music_title,
    looking_for: list(u.looking_for),
    photos: profilePhotoIds(db, u.id, isSelf),
    vouched_by: vouchers,
    travel: travelActive(db, u) ? { city: u.travel_city, from: u.travel_from, to: u.travel_to } : null,
    distance: d ? (u.show_distance ? d.label : 'Distance masquée') : null,
    albums: { count: albumCount, shared, requested },
    matched
  };
}

// Où en est la candidature : ce qui est fait et ce qui manque.
export function applicationChecks(db, u) {
  const photos = db.prepare("SELECT status FROM photos WHERE user_id = ? AND kind = 'profile'").all(u.id);
  return {
    age_verified: !!u.age_verified_at,
    photo_approved: photos.some((p) => p.status === 'approved'),
    photo_pending: photos.some((p) => p.status === 'pending'),
    profile_complete: !!(u.seeking && list(u.tastes).length >= 3 && (u.job || u.bio)),
    vouches: vouchCount(db, u.id),
    vouches_required: Number(getSetting(db, 'vouches_required'))
  };
}

function meView(db, u) {
  const view = {
    id: u.id, email: u.email, role: u.role, status: u.status, refusal_reason: u.refusal_reason,
    first_name: u.first_name, birth_date: u.birth_date, age: ageOf(u), city: u.city, neighborhood: u.neighborhood,
    job: u.job, bio: u.bio, prompt_answer: u.prompt_answer, interests: u.interests, music_title: u.music_title,
    tastes: list(u.tastes), seeking: list(u.seeking), position: u.position, position_visibility: u.position_visibility,
    intimate: list(u.intimate), intimate_visibility: u.intimate_visibility,
    looking_for: u.looking_for, referral_code: u.referral_code, id_check_status: u.id_check_status,
    age_verified: !!u.age_verified_at, premium: !!u.premium,
    travel_city: u.travel_city, travel_from: u.travel_from, travel_to: u.travel_to,
    hide_from_map: !!u.hide_from_map, show_distance: !!u.show_distance, incognito: !!u.incognito,
    album_matches_only: !!u.album_matches_only, blur_explicit: !!u.blur_explicit, discreet_icon: !!u.discreet_icon,
    location: { enabled: u.lat != null, source: u.location_source, consent: !!u.geo_consent_at, updated_at: u.location_updated_at },
    photos: db.prepare("SELECT id, status FROM photos WHERE user_id = ? AND kind = 'profile' ORDER BY position, id").all(u.id),
    legal: { accepted: u.legal_version, current: LEGAL_VERSION, needs_consent: u.role !== 'admin' && u.legal_version !== LEGAL_VERSION },
    notices_unread: db.prepare('SELECT COUNT(*) AS n FROM notices WHERE user_id = ? AND read_at IS NULL').get(u.id).n,
    payments_enabled: paymentsEnabled(db),
    entitlements: entitlements(db, u)
  };
  if (['pending', 'waitlist'].includes(u.status)) view.checks = applicationChecks(db, u);
  if (u.status === 'waitlist') view.waitlist_position = waitlistPosition(db, u);
  if (u.status === 'member') {
    view.vouch_requests = db.prepare(`SELECT id, first_name, created_at FROM users
      WHERE invited_by_code = ? AND status IN ('pending', 'waitlist')
      AND id NOT IN (SELECT applicant_id FROM vouches WHERE voucher_id = ?)`).all(u.referral_code, u.id);
    view.album_requests = db.prepare(`SELECT COUNT(*) AS n FROM album_requests r JOIN users x ON x.id = r.requester_id
      WHERE r.owner_id = ? AND x.status = 'member'`).get(u.id).n;
    const limit = dailyLikeLimit(db, u);
    view.likes_left = limit == null ? null : Math.max(0, limit - likesToday(db, u.id));
  }
  return view;
}

// Champs du profil communs à l'inscription et à la modification.
function profileFields(b, { partial }) {
  const set = {};
  const has = (k) => !partial || k in b;
  if (has('looking_for')) {
    const modes = pickList(b.looking_for, MODES);
    if (!modes.length) fail(400, 'Choisis au moins un mode : Rencontre, Amis ou Pro.');
    set.looking_for = modes.join(',');
  }
  if (has('seeking')) set.seeking = pickList(b.seeking, SEEKING).join(',') || null;
  if (has('tastes')) set.tastes = pickList(b.tastes, TASTES, 12).join(',') || null;
  if (has('intimate')) set.intimate = pickList(b.intimate, INTIMATE, 12).join(',') || null;
  if (has('position')) {
    if (b.position && !POSITIONS[b.position]) fail(400, 'Position inconnue.');
    set.position = b.position || null;
  }
  for (const k of ['position_visibility', 'intimate_visibility']) {
    if (has(k) && b[k] !== undefined) {
      if (!VISIBILITY[b[k]]) fail(400, 'Visibilité inconnue.');
      set[k] = b[k];
    }
  }
  return set;
}

export function registerMemberRoutes(r) {
  r.get('/api/meta', () => ({
    modes: MODES, seeking: SEEKING, positions: POSITIONS, visibility: VISIBILITY, tastes: TASTES, intimate: INTIMATE,
    neighborhoods: Object.keys(NEIGHBORHOODS), report_reasons: REPORT_REASONS, legal_version: LEGAL_VERSION,
    album_durations: Object.keys(DURATIONS), map: mapTiles()
  }));

  // --- comptes ---
  r.post('/api/auth/register', (ctx) => {
    if (ctx.config.rateLimit) registerLimit(ctx.ip);
    const b = ctx.body;
    const db = ctx.db;
    const email = str(b.email, 200, { required: true, label: 'E-mail' }).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'E-mail invalide.');
    const password = String(b.password || '');
    if (password.length < 10) fail(400, 'Mot de passe : 10 caractères minimum.');
    const firstName = str(b.first_name, 40, { required: true, label: 'Prénom' });
    const birth = parseBirthDate(b.birth_date);
    if (birth.age < 18) fail(403, 'ILD est réservé aux personnes majeures.');
    if (!b.consent_age || !b.consent_orientation || !b.charter) fail(400, 'Les trois consentements sont nécessaires pour candidater.');
    if (isBlocklisted(db, email)) fail(403, "L'inscription n'est pas possible avec cet e-mail.");
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'Un compte existe déjà avec cet e-mail.');
    const fields = profileFields({ looking_for: 'dating', ...b }, { partial: false });
    const city = str(b.city, 60, { label: 'Ville' }) || 'Paris';
    const inviteCode = str(b.invite_code, 20, { label: 'Code' });
    const now = Date.now();
    const info = db.prepare(`INSERT INTO users (email, pass_hash, first_name, birth_year, birth_date, city, referral_code,
      invited_by_code, consent_age_at, consent_orientation_at, charter_at, legal_version, legal_accepted_at, created_at,
      looking_for, seeking, tastes, intimate, position, position_visibility, intimate_visibility)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(email, hashPassword(password), firstName, birth.birth_year, birth.birth_date, city, newReferralCode(db, firstName),
        inviteCode ? inviteCode.toUpperCase() : null, now, now, now, LEGAL_VERSION, now, now,
        fields.looking_for, fields.seeking, fields.tastes, fields.intimate, fields.position,
        fields.position_visibility || 'members', fields.intimate_visibility || 'matches');
    ctx.setCookie(sessionCookie(createSession(db, Number(info.lastInsertRowid)), ctx.config.secureCookies));
    return { ok: true };
  });

  r.post('/api/auth/login', (ctx) => {
    if (ctx.config.rateLimit) loginLimit(ctx.ip);
    const email = String(ctx.body.email || '').trim().toLowerCase();
    const u = ctx.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!u || !verifyPassword(String(ctx.body.password || ''), u.pass_hash)) fail(401, 'E-mail ou mot de passe incorrect.');
    // Un compte suspendu ou banni peut se connecter pour lire la décision, la contester et gérer ses données.
    ctx.setCookie(sessionCookie(createSession(ctx.db, u.id), ctx.config.secureCookies));
    return { ok: true, role: u.role, status: u.status };
  });

  r.post('/api/auth/logout', (ctx) => {
    if (ctx.user) ctx.db.prepare('DELETE FROM sessions WHERE token = ?').run(ctx.user._token);
    ctx.setCookie(clearCookie());
    return { ok: true };
  });

  // --- moi ---
  r.get('/api/me', (ctx) => meView(ctx.db, requireAccount(ctx)));

  r.patch('/api/me', (ctx) => {
    const u = requireUser(ctx);
    const b = ctx.body;
    const db = ctx.db;
    const set = profileFields(b, { partial: true });
    if ('job' in b) set.job = str(b.job, 60, { label: 'Métier' });
    if ('bio' in b) set.bio = str(b.bio, 300, { label: 'Bio' });
    if ('prompt_answer' in b) set.prompt_answer = str(b.prompt_answer, 200, { label: 'Réponse' });
    if ('interests' in b) set.interests = str(b.interests, 200, { label: "Centres d'intérêt" });
    if ('music_title' in b) set.music_title = str(b.music_title, 80, { label: 'Musique' });
    if ('neighborhood' in b) {
      if (b.neighborhood && !NEIGHBORHOODS[b.neighborhood]) fail(400, 'Quartier inconnu.');
      set.neighborhood = b.neighborhood || null;
    }
    for (const k of ['hide_from_map', 'show_distance', 'album_matches_only', 'blur_explicit', 'discreet_icon']) {
      if (k in b) set[k] = bool(b[k]);
    }
    if ('incognito' in b) {
      if (b.incognito) requireFeature(db, u, 'incognito');
      set.incognito = bool(b.incognito);
    }
    if ('travel_city' in b || 'travel_from' in b || 'travel_to' in b) {
      const city = str(b.travel_city, 60, { label: 'Ville' });
      if (city) {
        requireFeature(db, u, 'travel_mode');
        const from = String(b.travel_from || '');
        const to = String(b.travel_to || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) fail(400, 'Dates de voyage invalides.');
        Object.assign(set, { travel_city: city, travel_from: from, travel_to: to });
      } else {
        Object.assign(set, { travel_city: null, travel_from: null, travel_to: null });
      }
    }
    const keys = Object.keys(set);
    if (keys.length) db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => set[k]), u.id);
    return meView(db, db.prepare('SELECT * FROM users WHERE id = ?').get(u.id));
  });

  r.post('/api/vouch', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const applicant = ctx.body.code
      ? db.prepare('SELECT * FROM users WHERE referral_code = ?').get(String(ctx.body.code).trim().toUpperCase())
      : db.prepare('SELECT * FROM users WHERE id = ?').get(Number(ctx.body.applicant_id));
    if (!applicant || !['pending', 'waitlist'].includes(applicant.status)) fail(404, 'Candidat introuvable.');
    if (applicant.id === u.id) fail(400, 'Impossible de te parrainer toi-même.');
    db.prepare('INSERT OR IGNORE INTO vouches (voucher_id, applicant_id, created_at) VALUES (?, ?, ?)').run(u.id, applicant.id, Date.now());
    return { ok: true, first_name: applicant.first_name, vouches: vouchCount(db, applicant.id) };
  });

  // RGPD : accès et portabilité.
  r.get('/api/me/export', (ctx) => {
    const u = requireAccount(ctx);
    const db = ctx.db;
    const { pass_hash, ...profile } = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
    return {
      exported_at: new Date().toISOString(),
      profile,
      photos: db.prepare('SELECT id, kind, album_id, status, created_at FROM photos WHERE user_id = ?').all(u.id),
      albums: db.prepare('SELECT id, name, created_at FROM albums WHERE user_id = ?').all(u.id),
      album_shares: db.prepare('SELECT album_id, grantee_id, expires_at, revoked_at, created_at FROM album_shares WHERE owner_id = ?').all(u.id),
      likes_given: db.prepare('SELECT to_id, value, created_at FROM likes WHERE from_id = ?').all(u.id),
      matches: db.prepare('SELECT id, a_id, b_id, created_at FROM matches WHERE a_id = ? OR b_id = ?').all(u.id, u.id),
      messages_sent: db.prepare('SELECT match_id, kind, body, created_at FROM messages WHERE sender_id = ?').all(u.id),
      posts: db.prepare('SELECT kind, body, visibility, created_at FROM posts WHERE user_id = ?').all(u.id),
      vouches_given: db.prepare('SELECT applicant_id, created_at FROM vouches WHERE voucher_id = ?').all(u.id),
      vouches_received: db.prepare('SELECT voucher_id, created_at FROM vouches WHERE applicant_id = ?').all(u.id),
      blocks: db.prepare('SELECT blocked_id, kind, created_at FROM blocks WHERE blocker_id = ?').all(u.id),
      notices: db.prepare('SELECT kind, ground, explanation, created_at, appeal_status FROM notices WHERE user_id = ?').all(u.id),
      verifications: db.prepare('SELECT provider, status, created_at, completed_at FROM verifications WHERE user_id = ?').all(u.id),
      subscriptions: db.prepare('SELECT plan, provider, status, started_at, current_period_end FROM subscriptions WHERE user_id = ?').all(u.id)
    };
  });

  // RGPD : effacement. Les signalements visant le compte sont conservés (sécurité des membres).
  r.delete('/api/me', (ctx) => {
    const u = requireAccount(ctx);
    if (u.role === 'admin') fail(400, 'Un administrateur ne peut pas supprimer son compte ici.');
    if (!verifyPassword(String(ctx.body.password || ''), u.pass_hash)) fail(401, 'Mot de passe incorrect.');
    deletePhotoFiles(ctx, u.id);
    ctx.db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    ctx.setCookie(clearCookie());
    return { ok: true };
  });

  // --- photos de profil (relues par la modération avant d'être visibles) ---
  r.post('/api/me/photos', async (ctx) => {
    const u = requireUser(ctx);
    const n = ctx.db.prepare("SELECT COUNT(*) AS n FROM photos WHERE user_id = ? AND kind = 'profile'").get(u.id).n;
    if (n >= MAX_PROFILE_PHOTOS) fail(400, `${MAX_PROFILE_PHOTOS} photos maximum.`);
    const { file, buf } = saveJpeg(ctx, ctx.body.data);
    const scan = await scanImage(buf);
    if (!scan.ok) { deleteFiles(ctx, [file]); fail(400, 'Image refusée.'); }
    const info = ctx.db.prepare("INSERT INTO photos (user_id, kind, file, status, position, created_at) VALUES (?, 'profile', ?, 'pending', ?, ?)")
      .run(u.id, file, n, Date.now());
    return { id: Number(info.lastInsertRowid), status: 'pending' };
  });

  r.delete('/api/me/photos/:id', (ctx) => {
    const u = requireUser(ctx);
    const p = ctx.db.prepare('SELECT * FROM photos WHERE id = ? AND user_id = ?').get(Number(ctx.params.id), u.id);
    if (!p) fail(404, 'Photo introuvable.');
    deleteFiles(ctx, [p.file]);
    ctx.db.prepare('DELETE FROM photos WHERE id = ?').run(p.id);
    return { ok: true };
  });

  // --- découvrir et likes ---
  r.get('/api/discover', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const mode = MODES[ctx.query.get('mode')] ? ctx.query.get('mode') : 'dating';
    const f = readFilters(ctx, u);
    const rows = db.prepare(`SELECT * FROM users x WHERE x.status = 'member' AND x.id != ?
      AND (',' || x.looking_for || ',') LIKE ?
      AND x.id NOT IN (SELECT to_id FROM likes WHERE from_id = ?)
      AND (x.city = ? OR x.travel_city = ?)
      ORDER BY random() LIMIT 120`).all(u.id, `%,${mode},%`, u.id, u.city, u.city);
    const out = [];
    for (const x of rows) {
      if (hiddenBetween(db, u.id, x.id)) continue;
      if (x.city !== u.city && !travelActive(db, x)) continue;
      if (x.incognito && !db.prepare('SELECT 1 FROM likes WHERE from_id = ? AND to_id = ? AND value = 1').get(x.id, u.id)) continue;
      if (!passesFilters(u, x, f)) continue;
      out.push(publicProfile(db, u, x));
      if (out.length >= 20) break;
    }
    return { mode, profiles: out };
  });

  r.post('/api/likes', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const target = visibleMember(db, u, ctx.body.to_id);
    const value = ctx.body.value === -1 ? -1 : 1;
    if (value === 1) {
      const limit = dailyLikeLimit(db, u);
      if (limit != null && likesToday(db, u.id) >= limit) fail(429, "Tu as utilisé tous tes likes du jour. Reviens demain ou passe à ILD+.");
    }
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
    if (!hasFeature(db, u, 'who_liked_me')) return { count: rows.length, profiles: [], premium_required: true };
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
    const out = [];
    for (const m of db.prepare('SELECT * FROM matches WHERE a_id = ? OR b_id = ? ORDER BY created_at DESC').all(u.id, u.id)) {
      const otherId = m.a_id === u.id ? m.b_id : m.a_id;
      const other = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'member'").get(otherId);
      if (!other || hiddenBetween(db, u.id, otherId)) continue;
      const last = db.prepare('SELECT kind, body, sender_id, created_at, removed FROM messages WHERE match_id = ? ORDER BY id DESC LIMIT 1').get(m.id);
      const preview = !last ? null : last.removed ? 'Message retiré par la modération' : last.kind === 'album' ? `Album « ${last.body} »` : last.body;
      out.push({
        id: m.id, created_at: m.created_at,
        user: { id: other.id, first_name: other.first_name, photo: profilePhotoIds(db, other.id, false)[0] || null },
        last: last ? { body: preview, mine: last.sender_id === u.id, created_at: last.created_at } : null
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
    const db = ctx.db;
    const { m, otherId } = ownMatch(ctx, u);
    const after = Number(ctx.query.get('after') || 0);
    const other = db.prepare('SELECT * FROM users WHERE id = ?').get(otherId);
    const messages = db.prepare('SELECT * FROM messages WHERE match_id = ? AND id > ? ORDER BY id LIMIT 200').all(m.id, after).map((x) => {
      const base = { id: x.id, kind: x.kind, mine: x.sender_id === u.id, removed: !!x.removed, created_at: x.created_at };
      if (x.removed) return { ...base, body: null };
      if (x.kind === 'album') {
        const s = db.prepare('SELECT * FROM album_shares WHERE id = ?').get(x.share_id);
        return { ...base, body: x.body, album: shareState(db, s) || { state: 'deleted', name: x.body, count: 0 } };
      }
      return { ...base, body: x.body };
    });
    return { match_id: m.id, user: publicProfile(db, u, other), messages };
  });

  r.post('/api/matches/:id/messages', (ctx) => {
    const u = requireMember(ctx);
    const { m } = ownMatch(ctx, u);
    const body = str(ctx.body.body, 2000, { required: true, label: 'Message' });
    const info = ctx.db.prepare("INSERT INTO messages (match_id, sender_id, kind, body, created_at) VALUES (?, ?, 'text', ?, ?)").run(m.id, u.id, body, Date.now());
    return { id: Number(info.lastInsertRowid) };
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
    const info = ctx.db.prepare("INSERT INTO posts (user_id, kind, body, visibility, city, created_at) VALUES (?, 'post', ?, ?, ?, ?)")
      .run(u.id, body, visibility, u.city, Date.now());
    return { id: Number(info.lastInsertRowid) };
  });

  r.delete('/api/posts/:id', (ctx) => {
    const u = requireMember(ctx);
    if (!ctx.db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').run(Number(ctx.params.id), u.id).changes) fail(404, 'Publication introuvable.');
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
    if (!REPORT_REASONS[reason]) fail(400, 'Motif de signalement inconnu.');
    const details = str(ctx.body.details, 1000, { label: 'Détails' });
    let evidence;
    let targetUserId;
    if (type === 'user') {
      const t = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!t) fail(404, 'Membre introuvable.');
      targetUserId = t.id;
      evidence = { profile: publicProfile(db, { role: 'admin' }, t) };
    } else if (type === 'message') {
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
      const m = msg && db.prepare('SELECT * FROM matches WHERE id = ?').get(msg.match_id);
      if (!m || (m.a_id !== u.id && m.b_id !== u.id)) fail(404, 'Message introuvable.');
      targetUserId = msg.sender_id;
      // Copie des 50 derniers messages : la victime n'a pas besoin de captures d'écran.
      evidence = {
        reported_message_id: msg.id,
        conversation: db.prepare(`SELECT ms.id, ms.sender_id, x.first_name AS sender, ms.kind, ms.body, ms.created_at FROM messages ms
          JOIN users x ON x.id = ms.sender_id WHERE ms.match_id = ? ORDER BY ms.id DESC LIMIT 50`).all(m.id).reverse()
      };
    } else if (type === 'photo') {
      const p = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
      if (!p) fail(404, 'Photo introuvable.');
      if (p.kind === 'album' && !activeShare(db, p.album_id, u.id) && p.user_id !== u.id) fail(404, 'Photo introuvable.');
      targetUserId = p.user_id;
      evidence = { photo_id: p.id, kind: p.kind, album_id: p.album_id, owner_id: p.user_id };
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
        ctx.db.prepare(`UPDATE album_shares SET revoked_at = ? WHERE revoked_at IS NULL AND
          ((owner_id = ? AND grantee_id = ?) OR (owner_id = ? AND grantee_id = ?))`).run(Date.now(), u.id, target, target, u.id);
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

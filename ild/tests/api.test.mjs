// Tests de bout en bout de l'API (serveur réel sur un port libre, base temporaire).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.mjs';
import { hashPassword } from '../server/auth.mjs';
import { sign } from '../server/core.mjs';

let app, base, dir, admin;
const JPEG = 'data:image/jpeg;base64,' + Buffer.from('FFD8FFE000104A46494600010100000100010000FFD9', 'hex').toString('base64');
const yearsAgo = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setDate(d.getDate() - 2); return d.toISOString().slice(0, 10); };

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body, { csrf = true, headers = {} } = {}) {
    const h = { cookie: this.cookie, ...headers };
    if (method !== 'GET') {
      h['content-type'] = 'application/json';
      if (csrf) h['x-ild'] = '1';
    }
    const res = await fetch(base + path, { method, headers: h, body: method === 'GET' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body || {})) });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, data: type.includes('json') ? await res.json() : await res.text() };
  }
  get(p) { return this.req('GET', p); }
  post(p, b) { return this.req('POST', p, b); }
  put(p, b) { return this.req('PUT', p, b); }
  patch(p, b) { return this.req('PATCH', p, b); }
  del(p, b) { return this.req('DELETE', p, b); }
}

let n = 0;
async function register(extra = {}) {
  const c = new Client();
  n += 1;
  const email = extra.email || `user${n}@test.local`;
  const r = await c.post('/api/auth/register', {
    email, password: 'motdepasse-solide', first_name: extra.first_name || `User${n}`, birth_date: yearsAgo(30),
    looking_for: 'dating,friends', seeking: 'dates,chat', tastes: 'Techno,Cinéma,Brunch',
    consent_age: true, consent_orientation: true, charter: true, ...extra
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { c, email, me: (await c.get('/api/me')).data };
}

async function verifyAge(u, result = 'verified') {
  const start = await u.c.post('/api/me/id-check');
  assert.equal(start.status, 200, JSON.stringify(start.data));
  const session = start.data.url.split('#')[1];
  return u.c.post(`/api/dev/verification/${session}`, { result });
}

async function approvedPhoto(u) {
  const { id } = (await u.c.post('/api/me/photos', { data: JPEG })).data;
  assert.equal((await admin.post(`/api/admin/photos/${id}/review`, { decision: 'approve' })).status, 200);
  return id;
}

async function makeMember(extra) {
  const u = await register(extra);
  await verifyAge(u);
  await approvedPhoto(u);
  const r = await admin.post(`/api/admin/applications/${u.me.id}/accept`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  u.me = (await u.c.get('/api/me')).data;
  return u;
}

async function matchPair(a, b) {
  await a.c.post('/api/likes', { to_id: b.me.id, value: 1 });
  return (await b.c.post('/api/likes', { to_id: a.me.id, value: 1 })).data.match;
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ild-test-'));
  app = createApp({ dataDir: dir, rateLimit: false });
  await new Promise((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  const now = Date.now();
  app.db.prepare(`INSERT INTO users (email, pass_hash, role, status, first_name, birth_year, birth_date, referral_code,
    id_check_status, consent_age_at, consent_orientation_at, charter_at, created_at)
    VALUES ('admin@test.local', ?, 'admin', 'member', 'Admin', 1990, '1990-01-01', 'ADMIN-TEST', 'verified', ?, ?, ?, ?)`)
    .run(hashPassword('admin-password-123'), now, now, now, now);
  admin = new Client();
  assert.equal((await admin.post('/api/auth/login', { email: 'admin@test.local', password: 'admin-password-123' })).status, 200);
});

after(() => {
  app.server.close();
  rmSync(dir, { recursive: true, force: true });
});

test('inscription : majorité à la date près, consentements, listes fermées, CSRF', async () => {
  const c = new Client();
  const b = { email: 'x@test.local', password: 'motdepasse-solide', first_name: 'X', consent_age: true, consent_orientation: true, charter: true };
  const almost18 = new Date(); almost18.setFullYear(almost18.getFullYear() - 18); almost18.setDate(almost18.getDate() + 3);
  assert.equal((await c.post('/api/auth/register', { ...b, birth_date: almost18.toISOString().slice(0, 10) })).status, 403);
  assert.equal((await c.post('/api/auth/register', { ...b, birth_date: '2001-02-30' })).status, 400);
  assert.equal((await c.post('/api/auth/register', { ...b, birth_date: yearsAgo(30), consent_orientation: false })).status, 400);
  assert.equal((await c.post('/api/auth/register', { ...b, birth_date: yearsAgo(30), position: 'nimporte' })).status, 400);
  assert.equal((await c.req('POST', '/api/auth/register', { ...b, birth_date: yearsAgo(30) }, { csrf: false })).status, 403);
  const u = await register({ position: 'vers_bottom', intimate: 'Câlins,Cuir,Inconnu', tastes: 'Techno,Pas une option' });
  assert.equal(u.me.position, 'vers_bottom');
  assert.deepEqual(u.me.intimate, ['Câlins', 'Cuir']);
  assert.deepEqual(u.me.tastes, ['Techno']);
  assert.equal(u.me.status, 'pending');
});

test("validation : âge vérifié, photo validée, puis acceptation par le comité", async () => {
  const leo = await makeMember({ first_name: 'Léo' });
  const t = await register({ first_name: 'Thomas', invite_code: leo.me.referral_code });
  assert.equal((await admin.post(`/api/admin/applications/${t.me.id}/accept`)).status, 400); // âge non vérifié
  assert.equal((await verifyAge(t)).data.status, 'verified');
  let me = (await t.c.get('/api/me')).data;
  assert.equal(me.status, 'waitlist');
  assert.equal(me.checks.age_verified, true);
  assert.equal(me.checks.photo_approved, false);
  const refused = await admin.post(`/api/admin/applications/${t.me.id}/accept`);
  assert.equal(refused.status, 400);
  assert.match(refused.data.error, /photo/i);
  const dossier = (await admin.get(`/api/admin/applications/${t.me.id}`)).data;
  assert.equal(dossier.checks.find((c) => c.key === 'photo').ok, false);
  await approvedPhoto(t);
  assert.ok((await leo.c.get('/api/me')).data.vouch_requests.some((r) => r.id === t.me.id));
  assert.equal((await leo.c.post('/api/vouch', { applicant_id: t.me.id })).data.vouches, 1);
  assert.equal((await t.c.get('/api/discover')).status, 403);
  assert.equal((await admin.post(`/api/admin/applications/${t.me.id}/accept`)).status, 200);
  me = (await t.c.get('/api/me')).data;
  assert.equal(me.status, 'member');
});

test("vérification d'âge : webhook signé, mineur refusé et e-mail bloqué", async () => {
  process.env.ILD_VERIFICATION_SECRET = 'secret-test';
  const u = await register({ email: 'jeune@test.local' });
  const session = (await u.c.post('/api/me/id-check')).data.url.split('#')[1];
  const body = JSON.stringify({ session, result: 'minor' });
  const hook = (sig) => new Client().req('POST', '/api/webhooks/verification', body, { csrf: false, headers: { 'x-ild-signature': sig } });
  assert.equal((await hook('mauvaise-signature')).status, 401);
  assert.equal((await hook(sign('secret-test', body))).status, 200);
  const me = (await u.c.get('/api/me')).data;
  assert.equal(me.status, 'refused');
  const notices = (await u.c.get('/api/notices')).data.notices;
  assert.equal(notices[0].kind, 'application_refused');
  const again = await new Client().post('/api/auth/register', {
    email: 'jeune@test.local', password: 'motdepasse-solide', first_name: 'Re', birth_date: yearsAgo(25),
    consent_age: true, consent_orientation: true, charter: true
  });
  assert.equal(again.status, 403);
  delete process.env.ILD_VERIFICATION_SECRET;
});

test('refus motivé, exposé des motifs et recours accepté', async () => {
  const u = await register();
  await verifyAge(u);
  assert.equal((await admin.post(`/api/admin/applications/${u.me.id}/refuse`, { ground: 'apparence', explanation: 'Pas mon style du tout' })).status, 400);
  assert.equal((await admin.post(`/api/admin/applications/${u.me.id}/refuse`, { ground: 'fake_profile' })).status, 400);
  assert.equal((await admin.post(`/api/admin/applications/${u.me.id}/refuse`, { ground: 'fake_profile', explanation: 'Les photos viennent d\'un autre compte.' })).status, 200);
  const notice = (await u.c.get('/api/notices')).data.notices[0];
  assert.equal(notice.can_appeal, true);
  assert.equal((await u.c.post(`/api/notices/${notice.id}/appeal`, { text: 'Ce sont bien mes photos, je peux le prouver.' })).status, 200);
  const appeal = (await admin.get('/api/admin/appeals')).data.appeals.find((a) => a.id === notice.id);
  assert.ok(appeal);
  assert.equal((await admin.post(`/api/admin/appeals/${notice.id}/decide`, { decision: 'overturned', note: 'Photos vérifiées, désolé.' })).status, 200);
  assert.equal((await u.c.get('/api/me')).data.status, 'waitlist');
});

test('likes, match et messages privés ; limite de likes quand le payant est activé', async () => {
  const a = await makeMember();
  const b = await makeMember();
  const outsider = await makeMember();
  const m = await matchPair(a, b);
  assert.ok(m);
  await a.c.post(`/api/matches/${m}/messages`, { body: 'Salut !' });
  const msgs = (await b.c.get(`/api/matches/${m}/messages`)).data.messages;
  assert.equal(msgs.at(-1).body, 'Salut !');
  assert.equal((await outsider.c.get(`/api/matches/${m}/messages`)).status, 404);
  assert.ok(!(await a.c.get('/api/discover?mode=dating')).data.profiles.some((p) => p.id === b.me.id));
});

test('photos de profil invisibles avant validation', async () => {
  const a = await makeMember();
  const b = await makeMember();
  const { id } = (await a.c.post('/api/me/photos', { data: JPEG })).data;
  assert.equal((await a.c.get(`/photos/${id}`)).status, 200);
  assert.equal((await b.c.get(`/photos/${id}`)).status, 404);
  await admin.post(`/api/admin/photos/${id}/review`, { decision: 'approve' });
  assert.equal((await b.c.get(`/photos/${id}`)).status, 200);
  assert.equal((await new Client().get(`/photos/${id}`)).status, 404);
  assert.equal((await a.c.post('/api/me/photos', { data: 'data:image/png;base64,AAAA' })).status, 400);
});

test('photo refusée : la personne reçoit le motif', async () => {
  const a = await makeMember();
  const { id } = (await a.c.post('/api/me/photos', { data: JPEG })).data;
  await admin.post(`/api/admin/photos/${id}/review`, { decision: 'reject', ground: 'explicit_public' });
  const notice = (await a.c.get('/api/notices')).data.notices.find((x) => x.kind === 'photo_rejected');
  assert.match(notice.explanation, /nudité/);
});

test('albums : plusieurs albums, envoi privé à un match, durée, retrait, blocage', async () => {
  const owner = await makeMember();
  const friend = await makeMember();
  const stranger = await makeMember();
  const m = await matchPair(owner, friend);
  const soiree = (await owner.c.post('/api/me/albums', { name: 'Soirée' })).data.id;
  const prive = (await owner.c.post('/api/me/albums', { name: 'Privé' })).data.id;
  const p1 = (await owner.c.post(`/api/me/albums/${soiree}/photos`, { data: JPEG })).data.id;
  const p2 = (await owner.c.post(`/api/me/albums/${prive}/photos`, { data: JPEG })).data.id;
  assert.equal((await friend.c.get(`/photos/${p1}`)).status, 404);
  assert.equal((await owner.c.post(`/api/me/albums/${soiree}/share`, { user_id: stranger.me.id, duration: '1h' })).status, 403);
  assert.equal((await owner.c.post(`/api/me/albums/${soiree}/share`, { user_id: friend.me.id, duration: '3 ans' })).status, 400);
  const share = (await owner.c.post(`/api/me/albums/${soiree}/share`, { user_id: friend.me.id, duration: '1h' })).data;
  const chat = (await friend.c.get(`/api/matches/${m}/messages`)).data.messages;
  const albumMsg = chat.find((x) => x.kind === 'album');
  assert.equal(albumMsg.album.name, 'Soirée');
  assert.equal(albumMsg.album.state, 'active');
  assert.equal((await friend.c.get(`/photos/${p1}`)).status, 200);
  assert.equal((await friend.c.get(`/photos/${p2}`)).status, 404); // l'autre album reste privé
  assert.deepEqual((await friend.c.get(`/api/albums/shared/${share.share_id}`)).data.photos, [p1]);
  assert.equal((await stranger.c.get(`/api/albums/shared/${share.share_id}`)).status, 404);
  // Expiration
  app.db.prepare('UPDATE album_shares SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, share.share_id);
  assert.equal((await friend.c.get(`/api/albums/shared/${share.share_id}`)).status, 403);
  assert.equal((await friend.c.get(`/photos/${p1}`)).status, 404);
  // Nouvel envoi puis retrait
  const share2 = (await owner.c.post(`/api/me/albums/${soiree}/share`, { user_id: friend.me.id, duration: 'forever' })).data;
  assert.equal((await friend.c.get(`/photos/${p1}`)).status, 200);
  assert.equal((await owner.c.del(`/api/me/albums/shares/${share2.share_id}`)).status, 200);
  assert.equal((await friend.c.get(`/photos/${p1}`)).status, 404);
  // Le blocage coupe tout accès
  await owner.c.post(`/api/me/albums/${prive}/share`, { user_id: friend.me.id, duration: '7d' });
  assert.equal((await friend.c.get(`/photos/${p2}`)).status, 200);
  await friend.c.post('/api/blocks', { user_id: owner.me.id, kind: 'block' });
  assert.equal((await friend.c.get(`/photos/${p2}`)).status, 404);
  const mine = (await owner.c.get('/api/me/albums')).data.albums;
  assert.deepEqual(mine.map((a) => a.name), ['Soirée', 'Privé']);
});

test('position et goûts intimes : visibles selon le réglage choisi', async () => {
  const a = await makeMember({ position: 'vers', position_visibility: 'matches', intimate: 'Cuir', intimate_visibility: 'hidden' });
  const b = await makeMember();
  let p = (await b.c.get(`/api/users/${a.me.id}`)).data;
  assert.equal(p.position, null);
  assert.deepEqual(p.intimate, []);
  assert.ok(!(await b.c.get('/api/discover?mode=dating&position=vers')).data.profiles.some((x) => x.id === a.me.id));
  await matchPair(a, b);
  p = (await b.c.get(`/api/users/${a.me.id}`)).data;
  assert.equal(p.position, 'vers');
  assert.deepEqual(p.intimate, []);
});

test('géolocalisation : accord, position arrondie, distances par tranches, aucune coordonnée transmise', async () => {
  const a = await makeMember({ city: 'Lyon' });
  const b = await makeMember({ city: 'Lyon' });
  assert.equal((await a.c.put('/api/me/location', { lat: 45.7640, lng: 4.8357 })).status, 400); // sans accord
  assert.equal((await a.c.put('/api/me/location', { lat: 45.7640, lng: 4.8357, consent: true })).data.updated, true);
  await b.c.put('/api/me/location', { lat: 45.7780, lng: 4.8357, consent: true }); // ~1,6 km plus au nord
  const raw = await b.c.req('GET', '/api/nearby');
  const found = raw.data.people.find((x) => x.id === a.me.id);
  assert.equal(found.distance, '1 à 2 km');
  assert.ok(!JSON.stringify(raw.data.people).includes('lat'));
  const stored = app.db.prepare('SELECT lat, lng FROM users WHERE id = ?').get(a.me.id);
  assert.ok(Math.abs(stored.lat / 0.005 - Math.round(stored.lat / 0.005)) < 1e-6);
  assert.equal((await a.c.put('/api/me/location', { lat: 45.70, lng: 4.80 })).data.updated, false); // trop tôt
  await a.c.patch('/api/me', { show_distance: false });
  assert.equal((await b.c.get('/api/nearby')).data.people.find((x) => x.id === a.me.id).distance, 'Distance masquée');
  await a.c.del('/api/me/location');
  assert.ok(!(await b.c.get('/api/nearby')).data.people.some((x) => x.id === a.me.id));
  assert.equal((await a.c.get('/api/nearby')).data.located, false);
});

test('carte : zones de 3 membres minimum, sans position individuelle', async () => {
  const viewer = await makeMember({ city: 'Bordeaux' });
  const people = [await makeMember({ city: 'Bordeaux' }), await makeMember({ city: 'Bordeaux' })];
  for (const p of people) await p.c.put('/api/me/location', { lat: 44.8378, lng: -0.5792, consent: true });
  let map = (await viewer.c.get('/api/map')).data;
  assert.ok(!map.zones.some((z) => z.people.some((x) => people.some((p) => p.me.id === x.id))));
  const third = await makeMember({ city: 'Bordeaux' });
  await third.c.put('/api/me/location', { lat: 44.8380, lng: -0.5795, consent: true });
  map = (await viewer.c.get('/api/map')).data;
  const zone = map.zones.find((z) => z.people.some((x) => x.id === third.me.id));
  assert.ok(zone.count >= 3);
  assert.ok(!('lat' in zone.people[0]));
});

test('incognito et masquage', async () => {
  const a = await makeMember({ city: 'Lille' });
  const b = await makeMember({ city: 'Lille' });
  await a.c.patch('/api/me', { incognito: true });
  assert.ok(!(await b.c.get('/api/discover?mode=dating')).data.profiles.some((p) => p.id === a.me.id));
  await a.c.post('/api/likes', { to_id: b.me.id, value: 1 });
  assert.ok((await b.c.get('/api/discover?mode=dating')).data.profiles.some((p) => p.id === a.me.id));
  const c = await makeMember({ city: 'Lille' });
  await c.c.post('/api/blocks', { user_id: b.me.id, kind: 'hide' });
  assert.ok(!(await b.c.get('/api/discover?mode=dating')).data.profiles.some((p) => p.id === c.me.id));
  assert.equal((await c.c.get(`/api/users/${b.me.id}`)).status, 200);
});

test('signalement, bannissement motivé, puis recours', async () => {
  const a = await makeMember();
  const b = await makeMember();
  const m = await matchPair(a, b);
  const { id: msgId } = (await b.c.post(`/api/matches/${m}/messages`, { body: 'message insultant' })).data;
  const rep = (await a.c.post('/api/reports', { target_type: 'message', target_id: msgId, reason: 'harassment' })).data;
  const open = (await admin.get('/api/admin/reports?status=open')).data.reports.find((r) => r.id === rep.id);
  assert.ok(open.evidence.conversation.some((x) => x.body === 'message insultant'));
  assert.equal((await admin.post(`/api/admin/reports/${rep.id}/resolve`, { action: 'ban', ground: 'harassment' })).status, 400); // explication manquante
  assert.equal((await admin.post(`/api/admin/reports/${rep.id}/resolve`, { action: 'ban', ground: 'harassment', explanation: 'Insultes répétées dans une conversation.' })).status, 200);
  assert.equal((await b.c.get('/api/me')).status, 401);
  assert.equal((await b.c.post('/api/auth/login', { email: b.email, password: 'motdepasse-solide' })).status, 200);
  assert.equal((await b.c.get('/api/discover')).status, 403);
  const notice = (await b.c.get('/api/notices')).data.notices[0];
  assert.equal(notice.kind, 'account_banned');
  await b.c.post(`/api/notices/${notice.id}/appeal`, { text: "Mon compte a été piraté ce soir-là." });
  await admin.post(`/api/admin/appeals/${notice.id}/decide`, { decision: 'overturned', note: 'Piratage confirmé, compte rétabli.' });
  assert.equal((await b.c.get('/api/discover')).status, 200);
  assert.equal((await a.c.get(`/api/matches/${m}/messages`)).data.messages.find((x) => x.id === msgId).removed, false);
});

test('abonnement : gratuit par défaut, payant activable, résiliation en fin de période', async () => {
  const a = await makeMember();
  const b = await makeMember();
  await b.c.post('/api/likes', { to_id: a.me.id, value: 1 });
  assert.ok((await a.c.get('/api/likes/received')).data.profiles.some((p) => p.id === b.me.id)); // gratuit : tout est offert
  assert.equal((await a.c.post('/api/billing/subscribe', { accept_terms: true })).status, 400);
  assert.equal((await admin.put('/api/admin/settings', { payments_enabled: true, free_daily_likes: 1 })).status, 200);
  assert.equal((await a.c.get('/api/likes/received')).data.premium_required, true);
  assert.equal((await a.c.get('/api/discover?age_min=20')).status, 402);
  const c = await makeMember();
  assert.equal((await a.c.post('/api/likes', { to_id: c.me.id, value: 1 })).status, 200);
  const d = await makeMember();
  assert.equal((await a.c.post('/api/likes', { to_id: d.me.id, value: 1 })).status, 429);
  assert.equal((await a.c.post('/api/billing/subscribe', {})).status, 400); // CGV non acceptées
  const sub = (await a.c.post('/api/billing/subscribe', { accept_terms: true })).data;
  assert.equal(sub.entitlements.who_liked_me, true);
  assert.equal((await a.c.post('/api/likes', { to_id: d.me.id, value: 1 })).status, 200);
  const canceled = (await a.c.post('/api/billing/cancel')).data;
  assert.equal(canceled.subscription.cancel_at_period_end, true);
  assert.equal(canceled.entitlements.who_liked_me, true); // reste actif jusqu'à la fin de la période
  await admin.put('/api/admin/settings', { payments_enabled: false, free_daily_likes: 50 });
});

test("conditions légales : nouvelle version à accepter, signalement public sans compte", async () => {
  const a = await makeMember();
  app.db.prepare("UPDATE users SET legal_version = '2000-01-01' WHERE id = ?").run(a.me.id);
  assert.equal((await a.c.get('/api/discover')).status, 428);
  assert.equal((await a.c.get('/api/me')).data.legal.needs_consent, true);
  assert.equal((await a.c.post('/api/legal/accept', { accept: true })).status, 200);
  assert.equal((await a.c.get('/api/discover')).status, 200);
  const anon = new Client();
  assert.equal((await anon.post('/api/public/report', { location: 'Profil de Jo, 25 ans', reason: 'fake', explanation: 'Utilise mes photos.' })).status, 400);
  const r = await anon.post('/api/public/report', { location: 'Profil de Jo, 25 ans', reason: 'fake', explanation: 'Utilise mes photos.', name: 'Sam', good_faith: true });
  assert.equal(r.status, 200);
  assert.ok((await admin.get('/api/admin/reports')).data.reports.some((x) => x.id === r.data.id && x.target_type === 'external'));
  for (const doc of ['cgu', 'confidentialite', 'charte', 'mentions', 'cgv', 'signaler']) {
    assert.equal((await anon.get(`/legal/${doc}`)).status, 200, doc);
  }
});

test('ce soir : publication réservée aux matchs', async () => {
  const a = await makeMember({ city: 'Nice' });
  const b = await makeMember({ city: 'Nice' });
  await a.c.post('/api/posts', { body: 'Sortie privée', visibility: 'matches' });
  await a.c.post('/api/posts', { body: 'Sortie publique', visibility: 'members' });
  const feed = (await b.c.get('/api/feed')).data.posts.map((p) => p.body);
  assert.ok(feed.includes('Sortie publique'));
  assert.ok(!feed.includes('Sortie privée'));
});

test('RGPD : export, suppression, purge', async () => {
  const u = await makeMember();
  const exp = (await u.c.get('/api/me/export')).data;
  assert.equal(exp.profile.email, u.email);
  assert.ok(!('pass_hash' in exp.profile));
  assert.equal((await u.c.del('/api/me', { password: 'mauvais' })).status, 401);
  assert.equal((await u.c.del('/api/me', { password: 'motdepasse-solide' })).status, 200);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(u.me.id).n, 0);
  const old = await register();
  await admin.post(`/api/admin/applications/${old.me.id}/refuse`, { ground: 'charter', explanation: 'Messages insistants à plusieurs membres.' });
  app.db.prepare('UPDATE users SET decided_at = ? WHERE id = ?').run(Date.now() - 400 * 86400e3, old.me.id);
  const r = (await admin.post('/api/admin/maintenance/purge')).data;
  assert.ok(r.applicants_deleted >= 1);
  const compliance = (await admin.get('/api/admin/compliance')).data;
  assert.ok(compliance.checks.find((c) => c.label.startsWith('Purge')).ok);
});

test('back office : réservé aux administrateurs, réglages validés', async () => {
  const u = await makeMember();
  assert.equal((await u.c.get('/api/admin/stats')).status, 403);
  assert.equal((await new Client().get('/api/admin/stats')).status, 401);
  assert.ok((await admin.get('/api/admin/stats')).data.members >= 1);
  assert.equal((await admin.put('/api/admin/settings', { map_min_cluster: 1 })).status, 400);
  assert.equal((await admin.put('/api/admin/settings', { legal_company: 'ILD SAS' })).status, 200);
  assert.match((await new Client().get('/legal/mentions')).data, /ILD SAS/);
});

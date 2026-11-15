// Tests de bout en bout de l'API (serveur réel sur un port libre, base temporaire).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.mjs';
import { hashPassword } from '../server/auth.mjs';

let app, base, dir;
const JPEG = 'data:image/jpeg;base64,' + Buffer.from('FFD8FFE000104A46494600010100000100010000FFD9', 'hex').toString('base64');
const year = new Date().getFullYear();

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body, { csrf = true } = {}) {
    const headers = { cookie: this.cookie };
    if (method !== 'GET') {
      headers['content-type'] = 'application/json';
      if (csrf) headers['x-ild'] = '1';
    }
    const res = await fetch(base + path, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data };
  }
  get(p) { return this.req('GET', p); }
  post(p, b) { return this.req('POST', p, b); }
  patch(p, b) { return this.req('PATCH', p, b); }
  del(p, b) { return this.req('DELETE', p, b); }
}

let n = 0;
async function register(extra = {}) {
  const c = new Client();
  n += 1;
  const email = `user${n}@test.local`;
  const r = await c.post('/api/auth/register', {
    email, password: 'motdepasse-solide', first_name: extra.first_name || `User${n}`, birth_year: year - 30,
    consent_age: true, consent_orientation: true, charter: true, ...extra
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const me = (await c.get('/api/me')).data;
  return { c, me, email };
}

let admin;
async function makeMember(extra) {
  const u = await register(extra);
  assert.equal((await admin.post(`/api/admin/applications/${u.me.id}/verify-id`, { result: 'verified' })).status, 200);
  assert.equal((await admin.post(`/api/admin/applications/${u.me.id}/accept`)).status, 200);
  u.me = (await u.c.get('/api/me')).data;
  return u;
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ild-test-'));
  app = createApp({ dataDir: dir, rateLimit: false });
  await new Promise((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  const now = Date.now();
  app.db.prepare(`INSERT INTO users (email, pass_hash, role, status, first_name, birth_year, referral_code,
    id_check_status, consent_age_at, consent_orientation_at, charter_at, created_at)
    VALUES ('admin@test.local', ?, 'admin', 'member', 'Admin', 1990, 'ADMIN-TEST', 'verified', ?, ?, ?, ?)`)
    .run(hashPassword('admin-password-123'), now, now, now, now);
  admin = new Client();
  assert.equal((await admin.post('/api/auth/login', { email: 'admin@test.local', password: 'admin-password-123' })).status, 200);
});

after(() => {
  app.server.close();
  rmSync(dir, { recursive: true, force: true });
});

test('candidature : majorité, consentements et protection CSRF', async () => {
  const c = new Client();
  const base = { email: 'x@test.local', password: 'motdepasse-solide', first_name: 'X', consent_age: true, consent_orientation: true, charter: true };
  assert.equal((await c.post('/api/auth/register', { ...base, birth_year: year - 16 })).status, 403);
  assert.equal((await c.post('/api/auth/register', { ...base, birth_year: year - 30, consent_orientation: false })).status, 400);
  assert.equal((await c.req('POST', '/api/auth/register', { ...base, birth_year: year - 30 }, { csrf: false })).status, 403);
});

test('parcours : identité, parrainage, liste d’attente puis acceptation', async () => {
  const leo = await makeMember({ first_name: 'Léo' });
  const thomas = await register({ first_name: 'Thomas', invite_code: leo.me.referral_code });
  assert.equal(thomas.me.status, 'pending');
  // Pas d'acceptation possible sans identité vérifiée.
  assert.equal((await admin.post(`/api/admin/applications/${thomas.me.id}/accept`)).status, 400);
  await thomas.c.post('/api/me/id-check');
  await admin.post(`/api/admin/applications/${thomas.me.id}/verify-id`, { result: 'verified' });
  let me = (await thomas.c.get('/api/me')).data;
  assert.equal(me.status, 'waitlist');
  assert.ok(me.waitlist_position >= 1);
  // Léo voit la demande de parrainage et parraine.
  const leoMe = (await leo.c.get('/api/me')).data;
  assert.ok(leoMe.vouch_requests.some((r) => r.id === thomas.me.id));
  assert.equal((await leo.c.post('/api/vouch', { applicant_id: thomas.me.id })).data.vouches, 1);
  // Un candidat ne peut pas utiliser l'app membre.
  assert.equal((await thomas.c.get('/api/discover')).status, 403);
  assert.equal((await admin.post(`/api/admin/applications/${thomas.me.id}/accept`)).status, 200);
  me = (await thomas.c.get('/api/me')).data;
  assert.equal(me.status, 'member');
});

test('refus : seulement pour un motif documenté', async () => {
  const u = await register();
  assert.equal((await admin.post(`/api/admin/applications/${u.me.id}/refuse`, { reason: 'apparence' })).status, 400);
  assert.equal((await admin.post(`/api/admin/applications/${u.me.id}/refuse`, { reason: 'fake_profile' })).status, 200);
  const audit = (await admin.get('/api/admin/audit')).data.entries;
  assert.ok(audit.some((e) => e.action === 'application_refused' && e.target === `user:${u.me.id}`));
});

test('likes, match et messages privés', async () => {
  const a = await makeMember();
  const b = await makeMember();
  const outsider = await makeMember();
  assert.equal((await a.c.post('/api/likes', { to_id: b.me.id, value: 1 })).data.match, null);
  const m = (await b.c.post('/api/likes', { to_id: a.me.id, value: 1 })).data.match;
  assert.ok(m);
  assert.equal((await a.c.post(`/api/matches/${m}/messages`, { body: 'Salut !' })).status, 200);
  const msgs = (await b.c.get(`/api/matches/${m}/messages`)).data.messages;
  assert.equal(msgs.at(-1).body, 'Salut !');
  assert.equal(msgs.at(-1).mine, false);
  assert.equal((await outsider.c.get(`/api/matches/${m}/messages`)).status, 404);
  // Le profil déjà liké ne revient pas dans Découvrir.
  const deck = (await a.c.get('/api/discover?mode=dating')).data.profiles;
  assert.ok(!deck.some((p) => p.id === b.me.id));
});

test('photos de profil : invisibles tant que la modération ne les a pas validées', async () => {
  const a = await makeMember();
  const b = await makeMember();
  const { id } = (await a.c.post('/api/me/photos', { kind: 'profile', data: JPEG })).data;
  assert.equal((await a.c.get(`/photos/${id}`)).status, 200);
  assert.equal((await b.c.get(`/photos/${id}`)).status, 404);
  assert.equal((await admin.post(`/api/admin/photos/${id}/review`, { decision: 'approve' })).status, 200);
  assert.equal((await b.c.get(`/photos/${id}`)).status, 200);
  assert.equal((await new Client().get(`/photos/${id}`)).status, 404);
  assert.equal((await a.c.post('/api/me/photos', { kind: 'profile', data: 'data:image/png;base64,AAAA' })).status, 400);
});

test('album privé : accès accordé, expiré au blocage', async () => {
  const owner = await makeMember();
  const viewer = await makeMember();
  await owner.c.patch('/api/me', { album_enabled: true, album_matches_only: false });
  const { id } = (await owner.c.post('/api/me/photos', { kind: 'album', data: JPEG })).data;
  assert.equal((await viewer.c.get(`/photos/${id}`)).status, 404);
  assert.equal((await viewer.c.get(`/api/albums/${owner.me.id}`)).status, 403);
  assert.equal((await viewer.c.post(`/api/albums/${owner.me.id}/request`)).status, 200);
  const req = (await owner.c.get(`/api/albums/${owner.me.id}`)).data.requests;
  assert.ok(req.some((r) => r.id === viewer.me.id));
  await owner.c.post('/api/me/album/grants', { user_id: viewer.me.id, days: 7 });
  assert.equal((await viewer.c.get(`/photos/${id}`)).status, 200);
  assert.deepEqual((await viewer.c.get(`/api/albums/${owner.me.id}`)).data.photos, [id]);
  await owner.c.post('/api/blocks', { user_id: viewer.me.id, kind: 'block' });
  assert.equal((await viewer.c.get(`/photos/${id}`)).status, 404);
  assert.equal((await viewer.c.get(`/api/users/${owner.me.id}`)).status, 404);
});

test('album réservé aux matchs par défaut', async () => {
  const owner = await makeMember();
  const viewer = await makeMember();
  await owner.c.patch('/api/me', { album_enabled: true });
  assert.equal((await viewer.c.post(`/api/albums/${owner.me.id}/request`)).status, 403);
});

test('masquer son profil à une personne', async () => {
  const a = await makeMember({ city: 'Lyon' });
  const b = await makeMember({ city: 'Lyon' });
  let deck = (await b.c.get('/api/discover?mode=dating')).data.profiles;
  assert.ok(deck.some((p) => p.id === a.me.id));
  await a.c.post('/api/blocks', { user_id: b.me.id, kind: 'hide' });
  deck = (await b.c.get('/api/discover?mode=dating')).data.profiles;
  assert.ok(!deck.some((p) => p.id === a.me.id));
  // a voit toujours b (masquer n'est pas bloquer).
  assert.equal((await a.c.get(`/api/users/${b.me.id}`)).status, 200);
});

test('signalement : preuve copiée, bannissement par la modération', async () => {
  const a = await makeMember();
  const b = await makeMember();
  await a.c.post('/api/likes', { to_id: b.me.id, value: 1 });
  const m = (await b.c.post('/api/likes', { to_id: a.me.id, value: 1 })).data.match;
  const { id: msgId } = (await b.c.post(`/api/matches/${m}/messages`, { body: 'message insultant' })).data;
  assert.equal((await a.c.post('/api/reports', { target_type: 'message', target_id: msgId, reason: 'nimporte' })).status, 400);
  const rep = (await a.c.post('/api/reports', { target_type: 'message', target_id: msgId, reason: 'harassment' })).data;
  const open = (await admin.get('/api/admin/reports?status=open')).data.reports.find((r) => r.id === rep.id);
  assert.equal(open.target_user_id, b.me.id);
  assert.ok(open.evidence.conversation.some((x) => x.body === 'message insultant'));
  assert.equal((await admin.post(`/api/admin/reports/${rep.id}/resolve`, { action: 'ban', note: 'Insultes' })).status, 200);
  assert.equal((await b.c.get('/api/me')).status, 401);
  assert.equal((await b.c.post('/api/auth/login', { email: b.email, password: 'motdepasse-solide' })).status, 403);
  const msgs = (await a.c.get(`/api/matches/${m}/messages`));
  assert.equal(msgs.status, 404); // le membre banni n'apparaît plus
});

test('carte : par quartier, et masquage', async () => {
  const a = await makeMember({ city: 'Nantes' });
  const b = await makeMember({ city: 'Nantes' });
  await a.c.patch('/api/me', { neighborhood: 'Le Marais' });
  let map = (await b.c.get('/api/map')).data;
  assert.equal(map.neighborhoods.find((x) => x.name === 'Le Marais').count, 1);
  assert.ok(!('lat' in map.people[0]));
  await a.c.patch('/api/me', { hide_from_map: true });
  map = (await b.c.get('/api/map')).data;
  assert.equal(map.total, 0);
  assert.equal((await a.c.patch('/api/me', { neighborhood: 'Inconnu' })).status, 400);
});

test('ILD+ : likes reçus et mode voyage', async () => {
  const a = await makeMember();
  const b = await makeMember();
  await b.c.post('/api/likes', { to_id: a.me.id, value: 1 });
  let r = (await a.c.get('/api/likes/received')).data;
  assert.equal(r.premium_required, true);
  assert.equal(r.profiles.length, 0);
  assert.equal((await a.c.patch('/api/me', { travel_city: 'Berlin', travel_from: '2030-01-01', travel_to: '2030-01-05' })).status, 403);
  await a.c.post('/api/me/premium', { active: true });
  r = (await a.c.get('/api/likes/received')).data;
  assert.ok(r.profiles.some((p) => p.id === b.me.id));
  assert.equal((await a.c.patch('/api/me', { travel_city: 'Berlin', travel_from: '2030-01-05', travel_to: '2030-01-01' })).status, 400);
  assert.equal((await a.c.patch('/api/me', { travel_city: 'Berlin', travel_from: '2030-01-01', travel_to: '2030-01-05' })).status, 200);
});

test('ce soir : publication réservée aux matchs', async () => {
  const a = await makeMember({ city: 'Lille' });
  const b = await makeMember({ city: 'Lille' });
  await a.c.post('/api/posts', { body: 'Sortie privée', visibility: 'matches' });
  await a.c.post('/api/posts', { body: 'Sortie publique', visibility: 'members' });
  const feed = (await b.c.get('/api/feed')).data.posts.map((p) => p.body);
  assert.ok(feed.includes('Sortie publique'));
  assert.ok(!feed.includes('Sortie privée'));
});

test('RGPD : export sans mot de passe, suppression du compte, purge', async () => {
  const u = await makeMember();
  const exp = (await u.c.get('/api/me/export')).data;
  assert.equal(exp.profile.email, u.email);
  assert.ok(!('pass_hash' in exp.profile));
  assert.equal((await u.c.del('/api/me', { password: 'mauvais' })).status, 401);
  assert.equal((await u.c.del('/api/me', { password: 'motdepasse-solide' })).status, 200);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(u.me.id).n, 0);

  const old = await register();
  await admin.post(`/api/admin/applications/${old.me.id}/refuse`, { reason: 'charter' });
  app.db.prepare('UPDATE users SET decided_at = ? WHERE id = ?').run(Date.now() - 400 * 86400e3, old.me.id);
  const r = (await admin.post('/api/admin/maintenance/purge')).data;
  assert.ok(r.applicants_deleted >= 1);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(old.me.id).n, 0);
});

test('back office : réservé aux administrateurs', async () => {
  const u = await makeMember();
  assert.equal((await u.c.get('/api/admin/stats')).status, 403);
  assert.equal((await new Client().get('/api/admin/stats')).status, 401);
  const s = (await admin.get('/api/admin/stats')).data;
  assert.ok(s.members >= 1);
});

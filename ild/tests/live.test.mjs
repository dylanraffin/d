// Tests de l'édition « carte en direct » (ILD_EDITION=cruise).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.mjs';
import { hashPassword } from '../server/auth.mjs';

let app, base, dir, admin;
const JPEG = 'data:image/jpeg;base64,' + Buffer.from('FFD8FFE000104A46494600010100000100010000FFD9', 'hex').toString('base64');
const PARIS = { lat: 48.8600, lng: 2.3600 };

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body) {
    const h = { cookie: this.cookie };
    if (method !== 'GET') { h['content-type'] = 'application/json'; h['x-ild'] = '1'; }
    const res = await fetch(base + path, { method, headers: h, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
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
// admit : l'équipe accepte la demande d'adhésion (ici directement en base ; le parcours complet a son propre test).
async function member(extra = {}, where = PARIS, admit = true) {
  const c = new Client();
  n += 1;
  const email = `live${n}@test.local`;
  const r = await c.post('/api/auth/register', {
    email, password: 'motdepasse-solide', first_name: extra.first_name || `Live${n}`, birth_date: '1995-03-10',
    consent_age: true, consent_orientation: true, charter: true, ...extra
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const session = (await c.post('/api/me/id-check')).data.url.split('#')[1];
  await c.post(`/api/dev/verification/${session}`, { result: 'verified' });
  if (admit) app.db.prepare("UPDATE users SET status = 'member', accepted_at = ? WHERE email = ? AND status = 'waitlist'").run(Date.now(), email);
  const me = (await c.get('/api/me')).data;
  if (where) await c.put('/api/me/location', { ...where, consent: true });
  return { c, email, me };
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ild-live-'));
  app = createApp({ dataDir: dir, rateLimit: false, edition: 'cruise', brand: 'Nuit' });
  await new Promise((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  const now = Date.now();
  app.db.prepare(`INSERT INTO users (email, pass_hash, role, status, first_name, birth_year, birth_date, referral_code,
    id_check_status, consent_age_at, consent_orientation_at, charter_at, created_at)
    VALUES ('admin@live.local', ?, 'admin', 'member', 'Admin', 1990, '1990-01-01', 'ADMIN-LIVE', 'verified', ?, ?, ?, ?)`)
    .run(hashPassword('admin-password-123'), now, now, now, now);
  admin = new Client();
  await admin.post('/api/auth/login', { email: 'admin@live.local', password: 'admin-password-123' });
});

after(() => { app.server.close(); rmSync(dir, { recursive: true, force: true }); });

test("adhésion sur demande : liste d'attente après l'âge vérifié, refus motivé ou acceptation par l'équipe", async () => {
  const u = await member({ bio: 'Nouveau à Paris, plutôt du soir, je cherche des mecs simples.', seeking: 'now', city: 'Paris' }, null, false);
  assert.equal(u.me.status, 'waitlist');
  assert.equal(u.me.checks.age_verified, true);
  assert.equal(u.me.checks.profile_complete, true); // quelques mots et ce qu'il cherche suffisent sur la carte
  assert.equal(u.me.review_delay_hours, 48);
  assert.ok(u.me.waitlist_position >= 1);
  assert.equal((await u.c.get('/api/live/map')).status, 403); // rien de la carte avant l'acceptation
  // Sans photo validée qui ressemble à la personne, l'équipe ne peut pas accepter.
  const early = await admin.post(`/api/admin/applications/${u.me.id}/accept`);
  assert.equal(early.status, 400);
  assert.match(early.data.error, /photo/);
  const up = await u.c.post('/api/me/photos', { data: JPEG });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal((await admin.post(`/api/admin/photos/${up.data.id}/review`, { decision: 'approve' })).status, 200);
  assert.equal((await admin.post(`/api/admin/applications/${u.me.id}/accept`)).status, 200);
  assert.equal((await u.c.get('/api/me')).data.status, 'member');
  assert.equal((await u.c.get('/api/live/map')).status, 200);
  // Refus : un motif documenté, une décision lisible et contestable.
  const v = await member({}, null, false);
  assert.equal((await admin.post(`/api/admin/applications/${v.me.id}/refuse`, { ground: 'fake_profile', explanation: 'La photo ne correspond pas à la personne vérifiée.' })).status, 200);
  const notice = (await v.c.get('/api/notices')).data.notices[0];
  assert.equal(notice.kind, 'application_refused');
  assert.equal(notice.can_appeal, true);
  // Réglage coupé dans le back office : accès direct dès l'âge vérifié.
  assert.equal((await admin.put('/api/admin/settings', { membership_review: false })).status, 200);
  assert.equal((await member({}, null, false)).me.status, 'member');
  assert.equal((await admin.put('/api/admin/settings', { membership_review: true })).status, 200);
  assert.equal((await new Client().get('/api/meta')).data.brand.name, 'Nuit');
  const cgu = (await new Client().get('/legal/cgu')).data;
  assert.match(cgu, /géolocalisé/);
  assert.match(cgu, /adhésion se fait sur demande/);
});

test('carte : points décalés, jamais la position réelle ; mode « zone » sans point', async () => {
  const viewer = await member();
  const a = await member({}, { lat: 48.8612, lng: 2.3633 });
  const stored = app.db.prepare('SELECT lat, lng FROM users WHERE id = ?').get(a.me.id);
  const map = (await viewer.c.get('/api/live/map')).data;
  const pin = map.pins.find((p) => p.id === a.me.id);
  assert.ok(pin);
  assert.ok(pin.lat !== stored.lat || pin.lng !== stored.lng);
  assert.ok(Math.abs(pin.lat - stored.lat) < 0.011 && Math.abs(pin.lng - stored.lng) < 0.011);
  await a.c.patch('/api/me', { map_precision: 'zone' });
  const again = (await viewer.c.get('/api/live/map')).data;
  assert.ok(!again.pins.some((p) => p.id === a.me.id));
  await a.c.patch('/api/me', { hide_from_map: true });
  assert.ok(!(await viewer.c.get('/api/live/people')).data.people.some((p) => p.id === a.me.id));
});

test('dispo maintenant : affichée puis effacée', async () => {
  const viewer = await member();
  const a = await member();
  assert.equal((await a.c.put('/api/me/presence', { minutes: 45 })).status, 400);
  assert.equal((await a.c.put('/api/me/presence', { minutes: 60, place: 'out', note: 'Un verre au Marais ?' })).status, 200);
  let list = (await viewer.c.get('/api/live/people')).data.people;
  assert.equal(list[0].id, a.me.id); // les personnes disponibles d'abord
  assert.equal(list[0].presence.note, 'Un verre au Marais ?');
  assert.ok((await viewer.c.get('/api/live/map?available=1')).data.pins.every((p) => p.presence));
  await a.c.del('/api/me/presence');
  list = (await viewer.c.get('/api/live/people')).data.people;
  assert.equal(list.find((p) => p.id === a.me.id).presence, null);
});

test('écrire sans match : préférences du destinataire, 3 messages sans réponse au plus, album après réponse', async () => {
  const a = await member();
  const b = await member();
  const shy = await member();
  await shy.c.patch('/api/me', { messages_from: 'photo' });
  assert.equal((await a.c.post('/api/conversations', { user_id: shy.me.id })).status, 403);
  const { id } = (await a.c.post('/api/conversations', { user_id: b.me.id })).data;
  assert.equal((await a.c.post('/api/conversations', { user_id: b.me.id })).data.id, id); // même conversation
  for (const t of ['Salut', 'Ça va ?', 'Tu es dans le coin ?']) assert.equal((await a.c.post(`/api/matches/${id}/messages`, { body: t })).status, 200);
  assert.equal((await a.c.post(`/api/matches/${id}/messages`, { body: 'Allô ?' })).status, 429);
  // Pas encore de réponse : pas d'album, et la position « matchs » reste cachée.
  const album = (await a.c.post('/api/me/albums', { name: 'Perso' })).data.id;
  await a.c.post(`/api/me/albums/${album}/photos`, { data: JPEG });
  assert.equal((await a.c.post(`/api/me/albums/${album}/share`, { user_id: b.me.id, duration: '1h' })).status, 403);
  assert.ok((await b.c.get('/api/matches')).data.matches.find((m) => m.id === id).waiting_reply);
  await b.c.post(`/api/matches/${id}/messages`, { body: 'Salut !' });
  assert.equal((await a.c.post(`/api/me/albums/${album}/share`, { user_id: b.me.id, duration: '1h' })).status, 200);
  assert.equal((await a.c.post(`/api/matches/${id}/messages`, { body: 'Super' })).status, 200);
});

test('lieux : proposés, validés par la modération, passages comptés', async () => {
  const a = await member();
  const viewer = await member();
  const { id } = (await a.c.post('/api/spots', { name: 'Bar exemple', category: 'bar', lat: 48.8595, lng: 2.3625 })).data;
  assert.equal((await a.c.post('/api/spots', { name: 'Parc', category: 'park', lat: 48.86, lng: 2.36 })).status, 400);
  assert.ok(!(await viewer.c.get('/api/live/map')).data.spots.some((s) => s.id === id));
  assert.ok((await admin.get('/api/admin/spots?status=pending')).data.spots.some((s) => s.id === id));
  await admin.post(`/api/admin/spots/${id}/review`, { decision: 'approve' });
  await a.c.post(`/api/spots/${id}/checkin`);
  const spot = (await viewer.c.get('/api/live/map')).data.spots.find((s) => s.id === id);
  assert.equal(spot.here, 1);
});

test('payant activé : carte limitée autour de soi sans abonnement', async () => {
  const a = await member();
  assert.equal((await a.c.get('/api/live/map?lat=43.2965&lng=5.3698')).status, 200); // gratuit : tout est offert
  await admin.put('/api/admin/settings', { payments_enabled: true, free_map_radius_km: 15 });
  assert.equal((await a.c.get('/api/live/map?lat=43.2965&lng=5.3698')).status, 402); // Marseille
  assert.equal((await a.c.get('/api/live/map')).status, 200);
  await a.c.post('/api/billing/subscribe', { accept_terms: true });
  assert.equal((await a.c.get('/api/live/map?lat=43.2965&lng=5.3698')).status, 200);
  await admin.put('/api/admin/settings', { payments_enabled: false });
});

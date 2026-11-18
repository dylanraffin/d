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

test('réglages du compte : e-mail, mot de passe (autres appareils déconnectés), unités, e-mails promo', async () => {
  const a = await member();
  const other = new Client(); // un deuxième appareil
  await other.post('/api/auth/login', { email: a.email, password: 'motdepasse-solide' });
  assert.equal((await other.get('/api/me')).status, 200);
  // E-mail : le mot de passe est demandé, l'adresse doit être libre.
  const b = await member();
  assert.equal((await a.c.post('/api/me/email', { email: 'neuf@test.local', password: 'faux-mot-de-passe' })).status, 401);
  assert.equal((await a.c.post('/api/me/email', { email: b.email, password: 'motdepasse-solide' })).status, 409);
  assert.equal((await a.c.post('/api/me/email', { email: 'pas-un-email', password: 'motdepasse-solide' })).status, 400);
  const changed = await a.c.post('/api/me/email', { email: 'Neuf.Live@test.local', password: 'motdepasse-solide' });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal((await a.c.get('/api/me')).data.email, 'neuf.live@test.local');
  // Mot de passe : l'ancien est demandé ; l'autre appareil est déconnecté, celui-ci reste connecté.
  assert.equal((await a.c.post('/api/me/password', { current: 'faux', password: 'nouveau-mot-de-passe' })).status, 401);
  assert.equal((await a.c.post('/api/me/password', { current: 'motdepasse-solide', password: 'court' })).status, 400);
  const pw = await a.c.post('/api/me/password', { current: 'motdepasse-solide', password: 'nouveau-mot-de-passe' });
  assert.equal(pw.data.other_sessions_closed, 1);
  assert.equal((await other.get('/api/me')).status, 401);
  assert.equal((await a.c.get('/api/me')).status, 200);
  const fresh = new Client();
  assert.equal((await fresh.post('/api/auth/login', { email: 'neuf.live@test.local', password: 'motdepasse-solide' })).status, 401);
  assert.equal((await fresh.post('/api/auth/login', { email: 'neuf.live@test.local', password: 'nouveau-mot-de-passe' })).status, 200);
  // Préférences : unités, e-mails promo (accord daté, retirable), LivePlay, messages des profils sans photo.
  let me = (await a.c.get('/api/me')).data;
  assert.equal(me.units, 'metric');
  assert.equal(me.marketing_emails, false); // jamais coché par défaut
  assert.equal((await a.c.patch('/api/me', { units: 'yards' })).status, 400);
  me = (await a.c.patch('/api/me', { units: 'imperial', marketing_emails: true, liveplay: true, messages_from: 'photo' })).data;
  assert.equal(me.units, 'imperial');
  assert.equal(me.marketing_emails, true);
  assert.equal(me.liveplay, true);
  assert.equal(me.messages_from, 'photo');
  const consents = (await admin.get('/api/admin/marketing-consents')).data.consents;
  assert.ok(consents.some((x) => x.email === 'neuf.live@test.local' && x.consent_at > 0));
  assert.equal((await a.c.get('/api/admin/marketing-consents')).status, 403);
  me = (await a.c.patch('/api/me', { marketing_emails: false })).data;
  assert.equal(me.marketing_emails, false);
  assert.ok(!(await admin.get('/api/admin/marketing-consents')).data.consents.some((x) => x.email === 'neuf.live@test.local'));
});

test('détecter les lieux où je suis : check-in automatique à moins de 100 m, avec une position précise', async () => {
  const owner = await member();
  const { id } = (await owner.c.post('/api/spots', { name: 'Sauna exemple', category: 'sauna', lat: 48.8700, lng: 2.3700 })).data;
  await admin.post(`/api/admin/spots/${id}/review`, { decision: 'approve' });
  // Sans le réglage : rien.
  const off = await member({}, null);
  assert.equal((await off.c.put('/api/me/location', { lat: 48.8702, lng: 2.3701, accuracy: 20, consent: true })).data.checked_in, null);
  // Position imprécise (900 m) : rien, on se tromperait de lieu.
  const vague = await member({}, null);
  await vague.c.patch('/api/me', { auto_checkin: true });
  assert.equal((await vague.c.put('/api/me/location', { lat: 48.8702, lng: 2.3701, accuracy: 900, consent: true })).data.checked_in, null);
  // Trop loin (≈ 300 m) : rien.
  const far = await member({}, null);
  await far.c.patch('/api/me', { auto_checkin: true });
  assert.equal((await far.c.put('/api/me/location', { lat: 48.8727, lng: 2.3700, accuracy: 15, consent: true })).data.checked_in, null);
  // Avec le réglage, à 25 m : check-in de 2 h, compté sur le lieu.
  const on = await member({}, null);
  assert.equal((await on.c.patch('/api/me', { auto_checkin: true })).data.auto_checkin, true);
  const r = (await on.c.put('/api/me/location', { lat: 48.8702, lng: 2.3701, accuracy: 20, consent: true })).data;
  assert.deepEqual(r.checked_in, { id, name: 'Sauna exemple' });
  const spot = (await owner.c.get('/api/live/map')).data.spots.find((s) => s.id === id);
  assert.equal(spot.here, 1);
});

test('LivePlay : dispo des deux côtés, conversation où les deux ont écrit, appel accepté, signaux effacés à la fin', async () => {
  const a = await member({ first_name: 'Appelant' });
  const b = await member({ first_name: 'Appelé' });
  const other = await member();
  // Pas dispo : impossible d'appeler, et personne ne peut l'appeler.
  let r = await a.c.post('/api/calls', { user_id: b.me.id });
  assert.equal(r.status, 403);
  assert.match(r.data.error, /LivePlay/);
  await a.c.patch('/api/me', { liveplay: true });
  assert.match((await a.c.post('/api/calls', { user_id: b.me.id })).data.error, /pas dispo/);
  await b.c.patch('/api/me', { liveplay: true });
  // Jamais d'appel à froid : il faut que les deux se soient écrit.
  assert.match((await a.c.post('/api/calls', { user_id: b.me.id })).data.error, /écrit tous les deux/);
  const { id: matchId } = (await a.c.post('/api/conversations', { user_id: b.me.id })).data;
  await a.c.post(`/api/matches/${matchId}/messages`, { body: 'Salut' });
  assert.equal((await a.c.get(`/api/matches/${matchId}/messages`)).data.can_call, false);
  await b.c.post(`/api/matches/${matchId}/messages`, { body: 'Salut toi' });
  assert.equal((await a.c.get(`/api/matches/${matchId}/messages`)).data.can_call, true);
  // L'appel sonne chez b ; un tiers ne le voit pas.
  r = await a.c.post('/api/calls', { user_id: b.me.id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const callId = r.data.id;
  assert.ok(Array.isArray(r.data.iceServers));
  assert.equal(r.data.relay, false); // pas de relais TURN configuré dans les tests
  const ringing = (await b.c.get('/api/calls/current')).data.call;
  assert.equal(ringing.id, callId);
  assert.equal(ringing.role, 'callee');
  assert.equal(ringing.other.first_name, 'Appelant');
  assert.equal((await other.c.get('/api/calls/current')).data.call, null);
  assert.equal((await other.c.get(`/api/calls/${callId}/signals`)).status, 404);
  assert.equal((await a.c.post(`/api/calls/${callId}/accept`)).status, 403); // seul l'appelé décroche
  assert.equal((await a.c.post('/api/calls', { user_id: b.me.id })).status, 409); // un appel à la fois
  // b décroche ; les signaux passent d'un appareil à l'autre, jamais renvoyés à leur auteur.
  assert.equal((await b.c.post(`/api/calls/${callId}/accept`)).status, 200);
  assert.equal((await a.c.post(`/api/calls/${callId}/signal`, { kind: 'offer', payload: { type: 'offer', sdp: 'v=0' } })).status, 200);
  assert.equal((await a.c.post(`/api/calls/${callId}/signal`, { kind: 'hack', payload: {} })).status, 400);
  const got = (await b.c.get(`/api/calls/${callId}/signals`)).data;
  assert.equal(got.status, 'active');
  assert.deepEqual(got.signals.map((s) => s.kind), ['offer']);
  assert.equal((await a.c.get(`/api/calls/${callId}/signals`)).data.signals.length, 0);
  await b.c.post(`/api/calls/${callId}/signal`, { kind: 'answer', payload: { type: 'answer', sdp: 'v=0' } });
  // Fin : statut « ended » des deux côtés, signaux (adresses IP) effacés, historique visible de la modération.
  assert.equal((await b.c.post(`/api/calls/${callId}/end`)).status, 200);
  assert.equal((await a.c.get(`/api/calls/${callId}/signals`)).data.status, 'ended');
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM call_signals WHERE call_id = ?').get(callId).n, 0);
  assert.equal((await a.c.get('/api/calls/current')).data.call, null);
  const history = (await admin.get(`/api/admin/members/${a.me.id}`)).data.calls;
  assert.equal(history[0].status, 'ended');
  assert.equal(history[0].outgoing, true);
  // Refus, puis sonnerie sans réponse (40 s) ; bloquer coupe tout.
  const second = (await a.c.post('/api/calls', { user_id: b.me.id })).data.id;
  await b.c.post(`/api/calls/${second}/decline`);
  assert.equal((await a.c.get(`/api/calls/${second}/signals`)).data.status, 'declined');
  const third = (await a.c.post('/api/calls', { user_id: b.me.id })).data.id;
  app.db.prepare('UPDATE calls SET created_at = created_at - 41000 WHERE id = ?').run(third);
  assert.equal((await b.c.get('/api/calls/current')).data.call, null);
  assert.equal((await a.c.get(`/api/calls/${third}/signals`)).data.status, 'missed');
  await b.c.post('/api/blocks', { user_id: a.me.id });
  assert.equal((await a.c.post('/api/calls', { user_id: b.me.id })).status, 403);
});

test('LivePlay avec relais TURN : identifiants éphémères (1 h) et passage obligé par le relais', async () => {
  const { iceConfig } = await import('../server/liveplay.mjs');
  const { createHmac } = await import('node:crypto');
  const open = iceConfig({ ice: { stun: 'stun:stun.exemple.fr:3478', turnUrls: '', turnSecret: '' } }, 7);
  assert.equal(open.relay, false);
  assert.deepEqual(open.iceServers, [{ urls: ['stun:stun.exemple.fr:3478'] }]);
  const relay = iceConfig({ ice: { stun: '', turnUrls: 'turn:turn.exemple.fr:3478,turns:turn.exemple.fr:5349', turnSecret: 'secret-partage' } }, 7);
  assert.equal(relay.relay, true);
  assert.equal(relay.iceTransportPolicy, 'relay');
  const turn = relay.iceServers[0];
  assert.deepEqual(turn.urls, ['turn:turn.exemple.fr:3478', 'turns:turn.exemple.fr:5349']);
  const [expiry, user] = turn.username.split(':');
  assert.equal(user, '7');
  assert.ok(Number(expiry) - Date.now() / 1000 > 3500 && Number(expiry) - Date.now() / 1000 <= 3600);
  assert.equal(turn.credential, createHmac('sha1', 'secret-partage').update(turn.username).digest('base64'));
});

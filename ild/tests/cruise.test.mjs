// Tests de la direction « cruising » : site d'abord, fiche détaillée, santé, voyage, favoris,
// photos dans le chat, accusés de lecture et plans à plusieurs.
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
  constructor(headers = {}) { this.cookie = ''; this.headers = headers; }
  async req(method, path, body) {
    const h = { cookie: this.cookie, ...this.headers };
    if (method !== 'GET') { h['content-type'] = 'application/json'; h['x-ild'] = '1'; }
    const res = await fetch(base + path, { method, headers: h, body: method === 'GET' ? undefined : JSON.stringify(body || {}), redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : await res.text() };
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
  const email = `cruise${n}@test.local`;
  const r = await c.post('/api/auth/register', {
    email, password: 'motdepasse-solide', first_name: extra.first_name || `Mec${n}`, birth_date: '1994-06-21',
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

// Conversation lancée par a, à laquelle b a répondu.
async function talking(a, b) {
  const { id } = (await a.c.post('/api/conversations', { user_id: b.me.id })).data;
  await a.c.post(`/api/matches/${id}/messages`, { body: 'Salut' });
  await b.c.post(`/api/matches/${id}/messages`, { body: 'Hello' });
  return id;
}

const PLAN = { title: 'Soirée chez moi', description: 'Ambiance détendue, entre mecs.', place_kind: 'home', starts_in: 0, duration: 120, max_guests: 2,
  address: '12 rue des Archives, code 4521', rules: true, ...PARIS };

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ild-cruise-'));
  app = createApp({ dataDir: dir, rateLimit: false });
  await new Promise((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  const now = Date.now();
  app.db.prepare(`INSERT INTO users (email, pass_hash, role, status, first_name, birth_year, birth_date, referral_code,
    id_check_status, consent_age_at, consent_orientation_at, charter_at, created_at)
    VALUES ('admin@cruise.local', ?, 'admin', 'member', 'Admin', 1990, '1990-01-01', 'ADMIN-CRUISE', 'verified', ?, ?, ?, ?)`)
    .run(hashPassword('admin-password-123'), now, now, now, now);
  admin = new Client();
  await admin.post('/api/auth/login', { email: 'admin@cruise.local', password: 'admin-password-123' });
});

after(() => { app.server.close(); rmSync(dir, { recursive: true, force: true }); });

test("site d'abord : page d'accueil pour les visiteurs, carte pour les membres, app installable", async () => {
  assert.equal(app.config.edition, 'cruise'); // la carte est l'édition par défaut
  const home = await new Client().get('/');
  assert.equal(home.status, 200);
  assert.match(home.data, /Nuit/);
  assert.match(home.data, /\/carte#\/apply/);
  assert.doesNotMatch(home.data, /\{\{BRAND\}\}/);
  assert.doesNotMatch(home.data, /noindex/); // la page d'accueil doit pouvoir être référencée
  const u = await member();
  const logged = await u.c.get('/');
  assert.equal(logged.status, 302);
  assert.equal(logged.headers.get('location'), '/carte');
  const shell = await new Client().get('/carte');
  assert.equal(shell.status, 200);
  assert.match(shell.data, /noindex/); // l'app, elle, ne l'est pas
  const manifest = (await new Client().get('/manifest.webmanifest')).data;
  assert.equal(manifest.name, 'Nuit');
  assert.equal(manifest.start_url, '/carte');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  assert.match((await new Client().get('/robots.txt')).data, /Disallow: \/api\//);
});

test('international : page anglaise, ville au choix dans le monde, service fermé dans les pays listés', async () => {
  // Français par défaut et pour les robots ; un navigateur dans une autre langue est envoyé sur /en.
  const english = new Client({ 'accept-language': 'en-US,en;q=0.9' });
  const redirect = await english.get('/');
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/en');
  assert.match((await english.get('/?lang=fr')).data, /lang="fr"/);
  const en = await english.get('/en');
  assert.equal(en.status, 200);
  assert.match(en.data, /lang="en"/);
  assert.match(en.data, /hreflang="fr"/);
  assert.match((await new Client({ 'accept-language': 'fr-FR,fr;q=0.9' }).get('/')).data, /lang="fr"/);
  // Se placer sans GPS, à Berlin : un point à quelques kilomètres du centre, jamais le centre exact.
  const berliner = await member({}, null);
  assert.equal((await berliner.c.put('/api/me/location', { city: 'Atlantide', consent: true })).status, 400);
  assert.equal((await berliner.c.put('/api/me/location', { city: 'Berlin', consent: true })).status, 200);
  const stored = app.db.prepare('SELECT lat, lng, city, location_source FROM users WHERE id = ?').get(berliner.me.id);
  assert.equal(stored.city, 'Berlin');
  assert.equal(stored.location_source, 'city');
  assert.ok(Math.abs(stored.lat - 52.52) < 0.03 && Math.abs(stored.lng - 13.405) < 0.04);
  const neighbour = await member({}, { lat: 52.52, lng: 13.405 });
  assert.ok((await neighbour.c.get('/api/live/map')).data.pins.some((p) => p.id === berliner.me.id));
  assert.ok((await new Client().get('/api/meta')).data.cities.includes('Tokyo'));
  // Pays fermé : le pays vient de l'en-tête posé par le proxy.
  await admin.put('/api/admin/settings', { blocked_countries: 'AE, SA' });
  try {
    const blocked = new Client({ 'cf-ipcountry': 'AE' });
    assert.equal((await blocked.get('/')).status, 451);
    assert.equal((await blocked.get('/carte')).status, 451);
    assert.equal((await blocked.get('/api/meta')).status, 451);
    assert.equal((await new Client({ 'cf-ipcountry': 'DE' }).get('/api/meta')).status, 200);
  } finally { await admin.put('/api/admin/settings', { blocked_countries: '' }); }
});

test('fiche cruising : champs facultatifs, valeurs contrôlées, visibilité intime', async () => {
  const a = await member();
  const b = await member();
  assert.equal((await a.c.patch('/api/me', { height_cm: 300 })).status, 400);
  assert.equal((await a.c.patch('/api/me', { body_type: 'inconnu' })).status, 400);
  const r = await a.c.patch('/api/me', { height_cm: 185, weight_kg: 73, body_type: 'muscular', identity: 'bi', tribes: ['Daddy', 'Discret', 'Inventé'],
    can: ['host', 'travel'], vibes: ['dirty_talk'], endowment_cm: 18, cut: 'uncut', safer: ['bb_prep'], position: 'top' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.tribes, ['Daddy', 'Discret']);
  let seen = (await b.c.get(`/api/users/${a.me.id}`)).data;
  assert.equal(seen.stats.height_cm, 185);
  assert.equal(seen.stats.body_type, 'muscular');
  assert.deepEqual(seen.can, ['host', 'travel']);
  assert.deepEqual(seen.vibes, ['dirty_talk']);
  assert.equal(seen.online, 'now');
  assert.equal(seen.new_profile, true);
  // Pratiques et taille : visibilité « intime » (mes matchs par défaut).
  assert.equal(seen.endowment, null);
  assert.deepEqual(seen.safer, []);
  await a.c.patch('/api/me', { intimate_visibility: 'members' });
  seen = (await b.c.get(`/api/users/${a.me.id}`)).data;
  assert.deepEqual(seen.endowment, { cm: 18, cut: 'uncut' });
  assert.deepEqual(seen.safer, ['bb_prep']);
  // La carte donne le résumé : stats, « peut recevoir », en ligne.
  const pin = (await b.c.get('/api/live/map')).data.pins.find((p) => p.id === a.me.id);
  assert.equal(pin.stats.weight_kg, 73);
  assert.equal(pin.online, 'now');
  assert.ok(pin.can.includes('host'));
});

test('photos de profil explicites : permises sur Nuit, signalées, corrigées par la modération, réglage au back office', async () => {
  const a = await member();
  const b = await member();
  assert.equal((await new Client().get('/api/meta')).data.explicit_profiles, true);
  const up = await a.c.post('/api/me/photos', { data: JPEG, explicit: true });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal(up.data.explicit, true);
  // La modération valide, et peut corriger le marquage.
  assert.ok((await admin.get('/api/admin/photos')).data.explicit_allowed);
  assert.equal((await admin.post(`/api/admin/photos/${up.data.id}/review`, { decision: 'approve', explicit: true })).status, 200);
  let pin = (await b.c.get('/api/live/map')).data.pins.find((p) => p.id === a.me.id);
  assert.equal(pin.photo, up.data.id);
  assert.equal(pin.photo_explicit, true);
  assert.deepEqual((await b.c.get(`/api/users/${a.me.id}`)).data.explicit_photos, [up.data.id]);
  // Le membre peut démarquer sa photo ; un autre membre ne peut pas la modifier.
  assert.equal((await b.c.patch(`/api/me/photos/${up.data.id}`, { explicit: false })).status, 404);
  assert.equal((await a.c.patch(`/api/me/photos/${up.data.id}`, { explicit: false })).data.explicit, false);
  pin = (await b.c.get('/api/live/map')).data.pins.find((p) => p.id === a.me.id);
  assert.equal(pin.photo_explicit, false);
  // Mode vanille : une préférence du membre.
  assert.equal((await b.c.patch('/api/me', { vanilla: true })).data.vanilla, true);
  // Réglage coupé : plus de photo de profil explicite, ni à l'envoi ni à la validation.
  await admin.put('/api/admin/settings', { explicit_profiles: false });
  try {
    assert.equal((await a.c.post('/api/me/photos', { data: JPEG, explicit: true })).status, 400);
    assert.equal((await a.c.patch(`/api/me/photos/${up.data.id}`, { explicit: true })).status, 400);
    const plain = (await a.c.post('/api/me/photos', { data: JPEG })).data;
    assert.equal((await admin.post(`/api/admin/photos/${plain.id}/review`, { decision: 'approve', explicit: true })).status, 400);
    assert.match((await new Client().get('/legal/charte')).data, /Nudité uniquement en privé/);
  } finally { await admin.put('/api/admin/settings', { explicit_profiles: true }); }
  assert.match((await new Client().get('/legal/charte')).data, /photos explicites sont permises/);
  // La vérification de conformité le rappelle tant que l'âge est simulé.
  const check = (await admin.get('/api/admin/compliance')).data.checks.find((c) => c.label.startsWith('Photos de profil explicites'));
  assert.equal(check.ok, false);
});

test('santé : accord explicite obligatoire, visibilité au choix, retrait = effacement', async () => {
  const a = await member();
  const b = await member();
  assert.equal((await a.c.patch('/api/me', { hiv_status: 'neg_prep', last_test: '2026-09' })).status, 400); // pas d'accord
  assert.equal((await a.c.patch('/api/me', { hiv_status: 'neg_prep', last_test: '2031-01', health_consent: true })).status, 400); // date future
  const ok = await a.c.patch('/api/me', { hiv_status: 'neg_prep', last_test: '2026-09', health_consent: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.health_consent, true);
  assert.equal(ok.data.health_visibility, 'matches');
  assert.equal((await b.c.get(`/api/users/${a.me.id}`)).data.health, null); // un inconnu ne voit rien
  await talking(b, a);
  assert.deepEqual((await b.c.get(`/api/users/${a.me.id}`)).data.health, { hiv_status: 'neg_prep', last_test: '2026-09' });
  await a.c.patch('/api/me', { health_visibility: 'hidden' });
  assert.equal((await b.c.get(`/api/users/${a.me.id}`)).data.health, null);
  const withdrawn = (await a.c.patch('/api/me', { health_consent: false })).data;
  assert.equal(withdrawn.hiv_status, null);
  assert.equal(withdrawn.health_consent, false);
  assert.equal(app.db.prepare('SELECT hiv_status, last_test, health_consent_at FROM users WHERE id = ?').get(a.me.id).last_test, null);
});

test('mode voyage : on apparaît au point choisi, pas chez soi', async () => {
  const traveler = await member();
  const parisian = await member();
  const berliner = await member({}, { lat: 52.5206, lng: 13.4094 });
  assert.equal((await traveler.c.put('/api/me/trip', { city: 'Atlantide' })).status, 400);
  const r = await traveler.c.put('/api/me/trip', { city: 'Berlin', days: 3 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await traveler.c.get('/api/me')).data.trip.label, 'Berlin');
  const inBerlin = (await berliner.c.get('/api/live/map')).data.pins.find((p) => p.id === traveler.me.id);
  assert.ok(inBerlin);
  assert.equal(inBerlin.trip.label, 'Berlin');
  assert.ok(!(await parisian.c.get('/api/live/map')).data.pins.some((p) => p.id === traveler.me.id));
  const mine = (await traveler.c.get('/api/live/map')).data;
  assert.ok(Math.abs(mine.me.lat - 52.52) < 0.02); // sa carte s'ouvre à Berlin
  assert.ok(mine.pins.some((p) => p.id === berliner.me.id));
  await traveler.c.del('/api/me/trip');
  assert.ok((await parisian.c.get('/api/live/map')).data.pins.some((p) => p.id === traveler.me.id));
  assert.equal((await traveler.c.put('/api/me/trip', { lat: 41.39, lng: 2.17, label: 'Barcelone, plage', days: 7 })).status, 200);
});

test('favoris : privés, filtrables dans la liste', async () => {
  const a = await member();
  const b = await member();
  const c = await member();
  assert.equal((await a.c.put(`/api/favorites/${b.me.id}`)).status, 200);
  assert.deepEqual((await a.c.get('/api/favorites')).data.ids, [b.me.id]);
  const favs = (await a.c.get('/api/live/people?favorites=1')).data.people;
  assert.deepEqual(favs.map((p) => p.id), [b.me.id]);
  assert.equal((await a.c.get(`/api/users/${b.me.id}`)).data.favorite, true);
  assert.equal((await a.c.get(`/api/users/${c.me.id}`)).data.favorite, false);
  assert.equal((await b.c.get(`/api/users/${a.me.id}`)).data.favorite, false); // b ne sait pas
  await a.c.del(`/api/favorites/${b.me.id}`);
  assert.deepEqual((await a.c.get('/api/favorites')).data.ids, []);
});

test('photos dans le chat : pas avant une réponse, visibles des deux seuls participants, retirables', async () => {
  const a = await member();
  const b = await member();
  const other = await member();
  const { id } = (await a.c.post('/api/conversations', { user_id: b.me.id })).data;
  await a.c.post(`/api/matches/${id}/messages`, { body: 'Salut' });
  assert.equal((await a.c.get(`/api/matches/${id}/messages`)).data.can_send_photo, false);
  assert.equal((await a.c.post(`/api/matches/${id}/photos`, { data: JPEG })).status, 403); // photo non sollicitée
  // b, lui, peut répondre par une photo : la conversation devient un échange.
  const sent = await b.c.post(`/api/matches/${id}/photos`, { data: JPEG });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  const thread = (await a.c.get(`/api/matches/${id}/messages`)).data;
  assert.equal(thread.can_send_photo, true);
  const msg = thread.messages.find((m) => m.kind === 'photo');
  assert.equal(msg.photo_id, sent.data.photo_id);
  assert.equal((await a.c.get(`/photos/${msg.photo_id}`)).status, 200);
  assert.equal((await other.c.get(`/photos/${msg.photo_id}`)).status, 404);
  assert.equal((await new Client().get(`/photos/${msg.photo_id}`)).status, 404);
  assert.equal((await a.c.post(`/api/matches/${id}/photos`, { data: JPEG })).status, 200);
  assert.equal((await a.c.get('/api/matches')).data.matches[0].last.body, 'Photo');
  // Signalement d'une photo reçue, puis retrait par l'expéditeur.
  assert.equal((await a.c.post('/api/reports', { target_type: 'photo', target_id: msg.photo_id, reason: 'non_consensual' })).status, 200);
  assert.equal((await other.c.post('/api/reports', { target_type: 'photo', target_id: msg.photo_id, reason: 'spam' })).status, 404);
  assert.equal((await a.c.del(`/api/matches/${id}/photos/${msg.photo_id}`)).status, 404); // pas la sienne
  assert.equal((await b.c.del(`/api/matches/${id}/photos/${msg.photo_id}`)).status, 200);
  assert.equal((await a.c.get(`/photos/${msg.photo_id}`)).status, 404);
  const after = (await a.c.get(`/api/matches/${id}/messages`)).data.messages.find((m) => m.id === msg.id);
  assert.equal(after.photo_id, null);
  assert.equal(after.body, 'Photo retirée');
  // Bloquer coupe l'accès aux photos restantes.
  const mine = (await b.c.get(`/api/matches/${id}/messages`)).data.messages.find((m) => m.kind === 'photo' && m.photo_id);
  await a.c.post('/api/blocks', { user_id: b.me.id, kind: 'block' });
  assert.equal((await b.c.get(`/photos/${mine.photo_id}`)).status, 404);
});

test('messages non lus et accusés de lecture', async () => {
  const a = await member();
  const b = await member();
  const id = await talking(a, b);
  assert.equal((await a.c.get('/api/matches')).data.matches.find((m) => m.id === id).unread, true);
  const first = (await a.c.get(`/api/matches/${id}/messages`)).data; // a lit
  assert.equal((await a.c.get('/api/matches')).data.matches.find((m) => m.id === id).unread, false);
  assert.equal(first.other_read_at, null); // b n'a pas encore ouvert la conversation
  await b.c.get(`/api/matches/${id}/messages`);
  assert.ok((await a.c.get(`/api/matches/${id}/messages`)).data.other_read_at > 0);
  // Payant activé : l'accusé de lecture devient une fonction de l'abonnement, « non lu » reste gratuit.
  await admin.put('/api/admin/settings', { payments_enabled: true });
  try {
    assert.equal((await a.c.get(`/api/matches/${id}/messages`)).data.other_read_at, null);
  } finally { await admin.put('/api/admin/settings', { payments_enabled: false }); }
});

test("plans à plusieurs : règles, zone approximative, adresse réservée aux participants acceptés", async () => {
  const host = await member({ first_name: 'Hôte' });
  const guest = await member({ first_name: 'Invité' });
  const second = await member();
  const third = await member();
  assert.equal((await host.c.post('/api/plans', { ...PLAN, rules: false })).status, 400);
  assert.equal((await host.c.post('/api/plans', { ...PLAN, description: 'Participation 20 € par personne' })).status, 400);
  assert.equal((await host.c.post('/api/plans', { ...PLAN, title: 'Plan chems ce soir' })).status, 400);
  assert.equal((await host.c.post('/api/plans', { ...PLAN, max_guests: 500 })).status, 400);
  const created = await host.c.post('/api/plans', PLAN);
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const planId = created.data.id;
  assert.equal((await host.c.post('/api/plans', PLAN)).status, 409); // un plan à la fois

  // Sur la carte : centre d'une case d'environ 1 km, jamais le point choisi ; pas d'adresse.
  const onMap = (await guest.c.get('/api/live/map')).data.plans.find((p) => p.id === planId);
  assert.ok(onMap);
  assert.equal(onMap.in_progress, true);
  assert.ok(onMap.lat !== PARIS.lat && Math.abs(onMap.lat - PARIS.lat) < 0.011);
  assert.equal(onMap.address, undefined);
  let seen = (await guest.c.get(`/api/plans/${planId}`)).data;
  assert.equal(seen.address, null);
  assert.deepEqual(seen.members, []);
  assert.equal((await guest.c.get(`/api/plans/${planId}/messages`)).status, 403);

  // Demande, puis accord de l'hôte.
  assert.equal((await host.c.post(`/api/plans/${planId}/join`)).status, 400);
  assert.equal((await guest.c.post(`/api/plans/${planId}/join`, { message: 'Dispo dans 20 min' })).data.status, 'requested');
  const hostView = (await host.c.get(`/api/plans/${planId}`)).data;
  assert.equal(hostView.pending, 1);
  assert.equal(hostView.requests[0].message, 'Dispo dans 20 min');
  assert.equal((await guest.c.post(`/api/plans/${planId}/requests/${guest.me.id}`, { decision: 'accept' })).status, 403); // seul l'hôte décide
  assert.equal((await host.c.post(`/api/plans/${planId}/requests/${guest.me.id}`, { decision: 'accept' })).data.status, 'accepted');
  seen = (await guest.c.get(`/api/plans/${planId}`)).data;
  assert.equal(seen.address, PLAN.address);
  assert.equal(seen.my_status, 'accepted');
  assert.equal(seen.going, 1);

  // Discussion réservée à l'hôte et aux acceptés.
  assert.equal((await guest.c.post(`/api/plans/${planId}/messages`, { body: "J'arrive" })).status, 200);
  assert.equal((await second.c.post(`/api/plans/${planId}/messages`, { body: 'Moi aussi' })).status, 403);
  const chat = (await host.c.get(`/api/plans/${planId}/messages`)).data;
  assert.equal(chat.messages[0].body, "J'arrive");
  assert.equal(chat.messages[0].mine, false);
  assert.ok((await guest.c.get('/api/plans/mine')).data.plans.some((p) => p.id === planId));

  // Complet à 2 participants ; une demande déclinée ne peut pas être renvoyée.
  await second.c.post(`/api/plans/${planId}/join`);
  await third.c.post(`/api/plans/${planId}/join`);
  assert.equal((await host.c.post(`/api/plans/${planId}/requests/${second.me.id}`, { decision: 'accept' })).status, 200);
  assert.equal((await host.c.post(`/api/plans/${planId}/requests/${third.me.id}`, { decision: 'accept' })).status, 409);
  assert.equal((await host.c.post(`/api/plans/${planId}/requests/${third.me.id}`, { decision: 'decline' })).status, 200);
  assert.equal((await third.c.post(`/api/plans/${planId}/join`)).status, 403);

  // Quitter rend l'adresse invisible ; annuler retire le plan de la carte.
  await second.c.post(`/api/plans/${planId}/leave`);
  assert.equal((await second.c.get(`/api/plans/${planId}`)).data.address, null);
  assert.equal((await guest.c.del(`/api/plans/${planId}`)).status, 403);
  assert.equal((await host.c.del(`/api/plans/${planId}`)).status, 200);
  assert.ok(!(await guest.c.get('/api/live/map')).data.plans.some((p) => p.id === planId));
  assert.equal((await third.c.post(`/api/plans/${planId}/join`)).status, 410);
});

test('plan signalé : copie pour la modération, retrait motivé, recours possible', async () => {
  const host = await member();
  const guest = await member();
  const blocked = await member();
  const planId = (await host.c.post('/api/plans', { ...PLAN, title: 'Plan direct', description: null })).data.id;
  await host.c.post('/api/blocks', { user_id: blocked.me.id, kind: 'block' });
  assert.ok(!(await blocked.c.get('/api/live/map')).data.plans.some((p) => p.id === planId));
  assert.equal((await blocked.c.get(`/api/plans/${planId}`)).status, 404);
  const rep = (await guest.c.post('/api/reports', { target_type: 'plan', target_id: planId, reason: 'prostitution', details: 'Demande de l’argent en privé.' })).data;
  const open = (await admin.get('/api/admin/reports?status=open')).data.reports.find((r) => r.id === rep.id);
  assert.equal(open.evidence.plan.title, 'Plan direct');
  assert.ok((await admin.get('/api/admin/plans')).data.plans.some((p) => p.id === planId && p.live));
  assert.equal((await admin.post(`/api/admin/reports/${rep.id}/resolve`, { action: 'remove_content', ground: 'prostitution', explanation: 'Plan avec contrepartie financière, interdit par la charte.' })).status, 200);
  assert.ok(!(await guest.c.get('/api/live/map')).data.plans.some((p) => p.id === planId));
  assert.equal((await guest.c.get(`/api/plans/${planId}`)).status, 404);
  const notice = (await host.c.get('/api/notices')).data.notices.find((x) => x.kind === 'content_removed');
  assert.equal(notice.related, `plan:${planId}`);
  await host.c.post(`/api/notices/${notice.id}/appeal`, { text: "Aucune contrepartie n'a été demandée, c'est une erreur." });
  await admin.post(`/api/admin/appeals/${notice.id}/decide`, { decision: 'overturned', note: 'Signalement infondé, plan rétabli.' });
  assert.ok((await guest.c.get('/api/live/map')).data.plans.some((p) => p.id === planId));
  // Retrait direct depuis le back office.
  assert.equal((await admin.post(`/api/admin/plans/${planId}/remove`, { ground: 'drugs', explanation: 'Annonce modifiée pour proposer des produits.' })).status, 200);
  assert.equal((await guest.c.get(`/api/plans/${planId}`)).status, 404);
});

test('photo alternative sans nudité : jointe pour le mode vanille, à la place de la photo explicite là où elle est masquée', async () => {
  const a = await member({ first_name: 'Alterné' });
  const viewer = await member({ first_name: 'Voisin' });
  const main = (await a.c.post('/api/me/photos', { data: JPEG, explicit: true })).data;
  assert.equal((await admin.post(`/api/admin/photos/${main.id}/review`, { decision: 'approve', explicit: true })).status, 200);
  // L'alternative ne peut pas être explicite, ni à l'envoi ni à la validation.
  assert.equal((await a.c.post('/api/me/photos', { data: JPEG, alternate: true, explicit: true })).status, 400);
  const alt = (await a.c.post('/api/me/photos', { data: JPEG, alternate: true })).data;
  assert.equal(alt.alternate, true);
  assert.equal((await a.c.get('/api/me')).data.alternate.status, 'pending');
  assert.ok((await admin.get('/api/admin/photos')).data.photos.some((p) => p.id === alt.id && p.alternate));
  assert.equal((await admin.post(`/api/admin/photos/${alt.id}/review`, { decision: 'approve', explicit: true })).status, 400);
  assert.equal((await admin.post(`/api/admin/photos/${alt.id}/review`, { decision: 'approve', explicit: false })).status, 200);
  // Ailleurs : la photo explicite, avec son alternative jointe (l'app la montre aux membres en mode vanille).
  const pin = (await viewer.c.get('/api/live/map')).data.pins.find((x) => x.id === a.me.id);
  assert.deepEqual([pin.photo, pin.photo_explicit, pin.photo_alt], [main.id, true, alt.id]);
  assert.equal((await viewer.c.get(`/api/users/${a.me.id}`)).data.photo_alt, alt.id);
  // Pays où les photos de profil explicites sont masquées : l'alternative à la place, la photo explicite n'est pas servie.
  assert.equal((await admin.put('/api/admin/settings', { nsfw_restricted_countries: 'AE, SG' })).status, 200);
  const abroad = new Client({ 'cf-ipcountry': 'AE' });
  abroad.cookie = viewer.c.cookie;
  const there = (await abroad.get('/api/live/map')).data.pins.find((x) => x.id === a.me.id);
  assert.deepEqual([there.photo, there.photo_explicit, there.photo_alt], [alt.id, false, null]);
  const profile = (await abroad.get(`/api/users/${a.me.id}`)).data;
  assert.equal(profile.photos[0], alt.id);
  assert.ok(!profile.photos.includes(main.id));
  assert.equal((await abroad.get(`/photos/${main.id}`)).status, 404);
  assert.equal((await abroad.get(`/photos/${alt.id}`)).status, 200);
  assert.equal((await viewer.c.get(`/photos/${main.id}`)).status, 200);
  assert.equal((await admin.put('/api/admin/settings', { nsfw_restricted_countries: '' })).status, 200);
  // Une seule alternative : la nouvelle remplace l'ancienne ; on peut aussi la retirer.
  const next = (await a.c.post('/api/me/photos', { data: JPEG, alternate: true })).data;
  assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM photos WHERE user_id = ? AND kind = 'alternate'").get(a.me.id).n, 1);
  assert.equal((await a.c.del(`/api/me/photos/${next.id}`)).status, 200);
  assert.equal((await a.c.get('/api/me')).data.alternate, null);
});

test('liste des plans : mes plans, autour de moi, heure précise, couverture sans nudité relue par la modération', async () => {
  const host = await member({ first_name: 'Organisateur' });
  const guest = await member({ first_name: 'Curieux' });
  const blocked = await member({ first_name: 'Bloqué' });
  const base = { title: 'Soirée détente', description: 'Ambiance calme, musique.', place_kind: 'home', max_guests: 3, rules: true, lat: 48.8601, lng: 2.3601 };
  // Heure précise : demain 18 h, jamais plus d'une semaine à l'avance.
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(18, 0, 0, 0);
  assert.equal((await host.c.post('/api/plans', { ...base, starts_at: Date.now() + 9 * 86400e3 })).status, 400);
  const created = await host.c.post('/api/plans', { ...base, starts_at: tomorrow.getTime(), duration: 240 });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const id = created.data.id;
  // Autour de moi : visible du voisin, avec la description, le nombre de confirmés et la case du membre pour en créer un.
  const near = (await guest.c.get('/api/plans/nearby')).data;
  const card = near.plans.find((p) => p.id === id);
  assert.ok(card);
  assert.equal(card.starts_at, tomorrow.getTime());
  assert.equal(card.description, 'Ambiance calme, musique.');
  assert.equal(card.going, 0);
  assert.equal(card.cover, null);
  assert.ok(near.center && Math.abs(near.center.lat - 48.865) < 0.02);
  // Bloqué par l'hôte : le plan disparaît de sa liste.
  await host.c.post('/api/blocks', { user_id: blocked.me.id });
  assert.ok(!(await blocked.c.get('/api/plans/nearby')).data.plans.some((p) => p.id === id));
  // Mes plans : l'hôte y voit le sien ; l'invité, une fois sa demande envoyée.
  assert.ok((await host.c.get('/api/plans/mine')).data.plans.some((p) => p.id === id && p.my_status === 'host'));
  assert.ok(!(await guest.c.get('/api/plans/mine')).data.plans.some((p) => p.id === id));
  await guest.c.post(`/api/plans/${id}/join`, {});
  assert.ok((await guest.c.get('/api/plans/mine')).data.plans.some((p) => p.id === id && p.my_status === 'requested'));
  // Couverture : seul l'hôte ; en attente, visible de lui seul ; jamais validée comme explicite.
  assert.equal((await guest.c.post(`/api/plans/${id}/cover`, { data: JPEG })).status, 403);
  const up = await host.c.post(`/api/plans/${id}/cover`, { data: JPEG });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.deepEqual((await host.c.get(`/api/plans/${id}`)).data.cover, { id: up.data.id, status: 'pending' });
  assert.equal((await guest.c.get(`/api/plans/${id}`)).data.cover, null);
  assert.equal((await guest.c.get(`/photos/${up.data.id}`)).status, 404);
  const queue = (await admin.get('/api/admin/photos')).data.photos.find((p) => p.id === up.data.id);
  assert.equal(queue.plan_cover, true);
  assert.equal((await admin.post(`/api/admin/photos/${up.data.id}/review`, { decision: 'approve', explicit: true })).status, 400);
  await admin.post(`/api/admin/photos/${up.data.id}/review`, { decision: 'approve' });
  assert.deepEqual((await guest.c.get('/api/plans/nearby')).data.plans.find((p) => p.id === id).cover, { id: up.data.id });
  assert.equal((await guest.c.get(`/photos/${up.data.id}`)).status, 200);
  assert.equal((await blocked.c.get(`/photos/${up.data.id}`)).status, 404);
  // Retirée par l'hôte : plus servie.
  await host.c.del(`/api/plans/${id}/cover`);
  assert.equal((await guest.c.get(`/photos/${up.data.id}`)).status, 404);
  await host.c.del(`/api/plans/${id}`);
});

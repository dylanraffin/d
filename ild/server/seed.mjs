// Données de démonstration : npm run seed
// Administrateur, membres localisés par quartier, candidats à chaque étape de la validation,
// albums privés, match avec conversation, événement, signalement et recours.
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.mjs';
import { hashPassword } from './auth.mjs';
import { LEGAL_VERSION, NEIGHBORHOODS } from './options.mjs';
import { snap } from './geo.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'server', 'seed-assets');
const dataDir = process.env.ILD_DATA_DIR || join(ROOT, 'data');
const uploads = join(dataDir, 'uploads');
mkdirSync(uploads, { recursive: true });
const db = openDb(join(dataDir, 'ild.sqlite'));

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
  console.log('La base contient déjà des données : rien à faire. Supprime le dossier data/ pour repartir de zéro.');
  process.exit(0);
}

const adminPassword = process.env.ILD_ADMIN_PASSWORD || randomBytes(9).toString('base64url');
const demoPassword = process.env.ILD_DEMO_PASSWORD || 'demo-ild-2026';
const demoHash = hashPassword(demoPassword);
const now = Date.now();
const DAY = 86400e3;

function birth(age, monthsBack = 3) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setMonth(d.getMonth() - monthsBack);
  return d.toISOString().slice(0, 10);
}

function photo(userId, asset, kind = 'profile', albumId = null, status = 'approved') {
  const file = `${randomBytes(16).toString('hex')}.jpg`;
  copyFileSync(join(ASSETS, asset), join(uploads, file));
  return Number(db.prepare('INSERT INTO photos (user_id, kind, album_id, file, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, kind, albumId, file, status, now).lastInsertRowid);
}

const insert = db.prepare(`INSERT INTO users (email, pass_hash, role, status, first_name, birth_year, birth_date, city, neighborhood,
  job, bio, prompt_answer, tastes, seeking, position, position_visibility, intimate, intimate_visibility, looking_for, music_title,
  referral_code, invited_by_code, id_check_status, id_verified_at, age_verified_at, consent_age_at, consent_orientation_at, charter_at,
  legal_version, legal_accepted_at, lat, lng, location_source, location_updated_at, geo_consent_at, created_at, accepted_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'Paris', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

function add(o) {
  const created = now - (o.daysAgo ?? 30) * DAY;
  const verified = o.status === 'member' || o.status === 'waitlist' || o.status === 'suspended' || o.role === 'admin';
  const coords = o.hood && o.status === 'member' ? NEIGHBORHOODS[o.hood] : null;
  const lat = coords ? snap(coords[0] + (o.dLat || 0)) : null;
  const lng = coords ? snap(coords[1] + (o.dLng || 0)) : null;
  const info = insert.run(o.email, o.password ? hashPassword(o.password) : demoHash, o.role || 'member', o.status, o.first_name,
    Number(birth(o.age).slice(0, 4)), birth(o.age), o.hood || null, o.job || null, o.bio || null, o.prompt || null,
    o.tastes || null, o.seeking || null, o.position || null, o.position_visibility || 'members', o.intimate || null,
    o.intimate_visibility || 'matches', o.looking_for || 'dating,friends', o.music || null, o.code, o.invited_by || null,
    verified ? 'verified' : (o.id_check || 'none'), verified ? created : null, verified ? created : null,
    created, created, created, LEGAL_VERSION, created, lat, lng, coords ? 'neighborhood' : null, coords ? now - 3600e3 : null,
    coords ? created : null, created, o.status === 'member' ? created + DAY : null);
  const id = Number(info.lastInsertRowid);
  if (o.photo) photo(id, `profile-${String(o.photo).padStart(2, '0')}.jpg`, 'profile', null, o.photoStatus || 'approved');
  return id;
}

const admin = add({ email: 'admin@ild.local', password: adminPassword, role: 'admin', status: 'member', first_name: 'Équipe ILD', age: 30, code: 'ADMIN-0001' });
const leo = add({ email: 'leo@ild.local', status: 'member', first_name: 'Léo', age: 29, hood: 'Le Marais', job: 'Directeur artistique',
  bio: 'Toujours partant pour une expo puis un verre.', prompt: 'Marché, brunch, expo et sieste.', tastes: 'Techno,Photo,Vin,Expos',
  seeking: 'dates,relationship', position: 'vers', position_visibility: 'matches', intimate: 'Romantique,Câlins', music: 'Midnight Drive', code: 'LEO-7Q2K', photo: 1 });
const samir = add({ email: 'samir@ild.local', status: 'member', first_name: 'Samir', age: 33, hood: 'Pigalle', job: 'Chef', tastes: 'Cuisine,Jazz,Vin,Voyages',
  seeking: 'dates,chat', position: 'top', intimate: 'Kink friendly', intimate_visibility: 'matches', code: 'SAMI-31AB', photo: 2, music: 'Blue in Green' });
const hugo = add({ email: 'hugo@ild.local', status: 'member', first_name: 'Hugo', age: 27, hood: 'Belleville', job: 'Architecte', tastes: 'Running,Design,Brunch',
  seeking: 'friends,network', position: 'vers_bottom', code: 'HUGO-77CD', looking_for: 'dating,friends,network', photo: 3 });
const mathis = add({ email: 'mathis@ild.local', status: 'member', first_name: 'Mathis', age: 31, hood: 'Oberkampf', job: 'Avocat', tastes: 'Cinéma,Théâtre,Vin',
  seeking: 'relationship', code: 'MATH-12EF', looking_for: 'dating,network', photo: 4 });
add({ email: 'yanis@ild.local', status: 'member', first_name: 'Yanis', age: 25, hood: 'Bastille', job: 'Étudiant en design', tastes: 'Mode,Danse,Clubbing', seeking: 'now,chat', position: 'bottom', code: 'YANI-90GH', photo: 5 });
add({ email: 'adrien@ild.local', status: 'member', first_name: 'Adrien', age: 36, hood: 'Saint-Germain', job: 'Éditeur', tastes: 'Lecture,Voyages,Expos', seeking: 'relationship', code: 'ADRI-45IJ', looking_for: 'dating', photo: 6 });
add({ email: 'karim@ild.local', status: 'member', first_name: 'Karim', age: 30, hood: 'Le Marais', dLat: 0.002, job: 'Développeur', tastes: 'Jeux vidéo,Salle de sport,Séries', seeking: 'dates,now', position: 'vers_top', code: 'KARI-23KL', photo: 7 });
add({ email: 'nathan@ild.local', status: 'member', first_name: 'Nathan', age: 28, hood: 'Le Marais', dLng: 0.002, job: 'Infirmier', tastes: 'Yoga,Plage,Pop', seeking: 'relationship,friends', position: 'side', code: 'NATH-61UV', photo: 8 });
add({ email: 'romain@ild.local', status: 'member', first_name: 'Romain', age: 34, hood: 'Le Marais', dLat: -0.002, job: 'Photographe', tastes: 'Photo,Drag,Clubbing', seeking: 'chat,dates', code: 'ROMA-08WX', photo: 9 });
add({ email: 'bilal@ild.local', status: 'member', first_name: 'Bilal', age: 26, hood: 'Pigalle', dLat: 0.002, job: 'Barman', tastes: 'House,Apéros,Clubbing', seeking: 'now,dates', position: 'vers', code: 'BILA-72YZ', photo: 10 });
add({ email: 'theo@ild.local', status: 'member', first_name: 'Théo', age: 23, hood: 'Montmartre', job: 'Comédien', tastes: 'Théâtre,Cinéma,Musique live', seeking: 'friends,dates', code: 'THEO-19AB', photo: 11 });
add({ email: 'jules@ild.local', status: 'member', first_name: 'Jules', age: 32, hood: 'Canal Saint-Martin', job: 'Chef de projet', tastes: 'Randonnée,Vin,Brunch', seeking: 'relationship', position: 'top', code: 'JULE-33CD', photo: 12 });
const kevin = add({ email: 'kevin@ild.local', status: 'suspended', first_name: 'Kévin', age: 29, job: 'Commercial', tastes: 'Salle de sport,Voyages,Plage', code: 'KEVI-55EF', photo: 13 });

// Candidats à chaque étape de la validation.
const thomas = add({ email: 'thomas@ild.local', status: 'waitlist', first_name: 'Thomas', age: 31, job: 'Ingénieur son', tastes: 'Techno,Musique live,Running',
  seeking: 'dates,friends', code: 'THOM-55MN', invited_by: 'LEO-7Q2K', daysAgo: 6, photo: 14 });
const nico = add({ email: 'nico@ild.local', status: 'waitlist', first_name: 'Nicolas', age: 28, tastes: 'Cinéma,Brunch,Natation', seeking: 'chat', code: 'NICO-66OP', daysAgo: 4, photo: 15, photoStatus: 'pending' });
add({ email: 'julien@ild.local', status: 'pending', first_name: 'Julien', age: 34, code: 'JULI-88QR', id_check: 'submitted', daysAgo: 1 });
add({ email: 'max@ild.local', status: 'pending', first_name: 'Maxime', age: 22, code: 'MAXI-99ST', daysAgo: 0 });

const vouch = db.prepare('INSERT INTO vouches (voucher_id, applicant_id, created_at) VALUES (?, ?, ?)');
vouch.run(leo, thomas, now - 3 * DAY);
vouch.run(hugo, thomas, now - 2 * DAY);
vouch.run(samir, nico, now - DAY);

// Léo et Samir : match, conversation, et Samir a envoyé un album à Léo.
const like = db.prepare('INSERT INTO likes (from_id, to_id, value, created_at) VALUES (?, ?, 1, ?)');
like.run(leo, samir, now - 2 * DAY);
like.run(samir, leo, now - 2 * DAY);
like.run(hugo, leo, now - DAY);
const match = Number(db.prepare('INSERT INTO matches (a_id, b_id, created_at) VALUES (?, ?, ?)').run(Math.min(leo, samir), Math.max(leo, samir), now - 2 * DAY).lastInsertRowid);
const msg = db.prepare("INSERT INTO messages (match_id, sender_id, kind, body, share_id, created_at) VALUES (?, ?, ?, ?, ?, ?)");
msg.run(match, samir, 'text', "Salut ! Tu vas à l'apéro sur le toit ce soir ?", null, now - 3 * 3600e3);
msg.run(match, leo, 'text', 'Oui, vers 20h. Et toi ?', null, now - 2.9 * 3600e3);

const newAlbum = (userId, name) => Number(db.prepare('INSERT INTO albums (user_id, name, created_at) VALUES (?, ?, ?)').run(userId, name, now).lastInsertRowid);
const samirAlbum = newAlbum(samir, 'Été 2026');
for (const n of [1, 2, 3]) photo(samir, `album-${n}.jpg`, 'album', samirAlbum);
const share = Number(db.prepare('INSERT INTO album_shares (album_id, owner_id, grantee_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
  .run(samirAlbum, samir, leo, now + 7 * DAY, now - 2.8 * 3600e3).lastInsertRowid);
msg.run(match, samir, 'album', 'Été 2026', share, now - 2.8 * 3600e3);
const leoSoiree = newAlbum(leo, 'Soirée');
photo(leo, 'album-4.jpg', 'album', leoSoiree);
photo(leo, 'album-5.jpg', 'album', leoSoiree);
const leoPrive = newAlbum(leo, 'Privé');
photo(leo, 'album-6.jpg', 'album', leoPrive);

// Carte en direct : quelques membres « dispo », des précisions différentes et des lieux d'exemple.
const presence = db.prepare('UPDATE users SET presence_until = ?, presence_note = ?, presence_place = ? WHERE email = ?');
presence.run(now + 2 * 3600e3, 'Un verre au Marais ?', 'out', 'samir@ild.local');
presence.run(now + 3600e3, null, 'host', 'bilal@ild.local');
presence.run(now + 4 * 3600e3, 'Partant pour un café', 'out', 'nathan@ild.local');
db.prepare("UPDATE users SET map_precision = 'zone' WHERE email IN ('adrien@ild.local', 'jules@ild.local', 'mathis@ild.local')").run();
db.prepare("UPDATE users SET map_precision = '500m' WHERE email IN ('karim@ild.local', 'theo@ild.local')").run();
const spot = db.prepare("INSERT INTO spots (name, category, description, lat, lng, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
spot.run('Bar du Marais (exemple)', 'bar', 'Bar de quartier, terrasse.', 48.8597, 2.3561, 'approved', admin, now);
spot.run('Club Pigalle (exemple)', 'club', 'Soirées le week-end.', 48.8826, 2.3372, 'approved', admin, now);
spot.run('Sauna (exemple)', 'sauna', 'Établissement réservé aux majeurs.', 48.8642, 2.3528, 'approved', admin, now);
spot.run('Café Belleville (exemple)', 'cafe', null, 48.8718, 2.3770, 'pending', hugo, now);
db.prepare('INSERT INTO spot_checkins (spot_id, user_id, until) VALUES (1, ?, ?)').run(samir, now + 2 * 3600e3);

// Direction cruising : fiches détaillées, santé (avec accord), en ligne, favoris, voyage, plans à plusieurs, photo dans le chat.
const karim = db.prepare("SELECT id FROM users WHERE email = 'karim@ild.local'").get().id;
const yanis = db.prepare("SELECT id FROM users WHERE email = 'yanis@ild.local'").get().id;
const bilal = db.prepare("SELECT id FROM users WHERE email = 'bilal@ild.local'").get().id;
const romain = db.prepare("SELECT id FROM users WHERE email = 'romain@ild.local'").get().id;
const cruise = db.prepare(`UPDATE users SET height_cm = ?, weight_kg = ?, body_type = ?, identity = ?, tribes = ?, can = ?, vibes = ?, safer = ?, last_seen_at = ?
  WHERE email = ?`);
const fiche = (name, height, weight, body, identity, tribes, can, vibes, safer, seenMinutesAgo) =>
  cruise.run(height, weight, body, identity, tribes, can, vibes, safer, now - seenMinutesAgo * 60e3, `${name}@ild.local`);
fiche('leo', 181, 74, 'athletic', 'gay', 'Sportif,Tatoué', 'host,travel', 'talk', 'condoms', 0);
fiche('samir', 185, 82, 'muscular', 'gay', 'Daddy,Poilu', 'travel', 'direct,dirty_talk', 'bb_prep', 1);
fiche('hugo', 176, 68, 'slim', 'gay', 'Minet,Geek', 'travel', 'talk', 'condoms', 30);
fiche('mathis', 183, 79, 'average', 'bi', 'Discret', 'host', 'talk', 'ask', 200);
fiche('yanis', 172, 63, 'slim', 'queer', 'Minet,Lisse', 'travel,venue', 'direct,group', 'bb_prep', 2);
fiche('adrien', 180, 77, 'average', 'gay', 'Mûr,Discret', 'host', 'talk', 'condoms', 400);
fiche('karim', 178, 80, 'muscular', 'gay', 'Sportif,Muscle', 'host,travel', 'direct', 'ask', 3);
fiche('nathan', 174, 70, 'athletic', 'gay', 'Lisse', 'travel', 'talk,watch', 'condoms', 12);
fiche('romain', 188, 90, 'bear', 'gay', 'Ours,Poilu,Tatoué', 'host', 'group,dirty_talk', 'ask', 4);
fiche('bilal', 179, 72, 'athletic', 'bi', 'Discret,Sportif', 'host', 'direct,group', 'bb_prep', 0);
fiche('theo', 170, 60, 'slim', 'curious', 'Minet', 'travel', 'talk', 'condoms', 50);
fiche('jules', 186, 84, 'stocky', 'gay', 'Daddy', 'host,travel', 'direct', 'ask', 600);
// Plus de monde sur la carte : une carte de cruising se lit comme un mur de photos.
// pseudo, âge, quartier, décalage nord, décalage est, taille, poids, morphologie, identité, rôle, lieu, vu il y a (min), statut dispo
const EXTRA = [
  ['Noah', 27, 'Le Marais', 0.004, -0.005, 180, 72, 'athletic', 'gay', 'vers', 'host,travel', 1, 'host'],
  ['Luca', 35, 'Le Marais', -0.005, 0.006, 184, 86, 'muscular', 'gay', 'top', 'travel', 2, null],
  ['Mehdi', 29, 'Châtelet', 0.002, 0.003, 177, 70, 'slim', 'bi', 'vers_bottom', 'travel', 0, 'travel'],
  ['Axel', 31, 'Châtelet', -0.004, -0.006, 182, 78, 'athletic', 'gay', 'vers_top', 'host', 25, null],
  ['Tom', 26, 'Oberkampf', -0.003, -0.007, 175, 66, 'slim', 'gay', 'bottom', 'travel,venue', 3, 'venue'],
  ['Raphaël', 38, 'Oberkampf', 0.006, 0.004, 186, 88, 'stocky', 'gay', 'top', 'host', 90, null],
  ['Sacha', 24, 'Canal Saint-Martin', 0.003, 0.005, 178, 68, 'slim', 'queer', 'vers', 'travel', 4, null],
  ['Ilyes', 28, 'Canal Saint-Martin', -0.004, -0.004, 181, 76, 'athletic', 'gay', 'vers_top', 'host,travel', 1, 'host'],
  ['Victor', 33, 'Bastille', 0.005, -0.006, 183, 80, 'average', 'gay', 'vers', 'travel', 12, null],
  ['Gabriel', 41, 'Bastille', -0.004, 0.007, 179, 84, 'bear', 'gay', 'top', 'host', 6, 'host'],
  ['Baptiste', 30, 'Saint-Germain', 0.003, 0.006, 185, 79, 'athletic', 'bi', 'side', 'travel', 40, null],
  ['Omar', 34, 'Saint-Germain', -0.005, -0.005, 180, 83, 'muscular', 'gay', 'top', 'travel', 2, 'travel'],
  ['Kenji', 29, 'Quartier Latin', 0.004, 0.004, 173, 64, 'slim', 'gay', 'bottom', 'host,travel', 5, null],
  ['Diego', 32, 'Quartier Latin', -0.003, -0.007, 178, 75, 'athletic', 'gay', 'vers', 'travel', 180, null],
  ['Andrea', 37, 'Montparnasse', 0.006, 0.005, 182, 81, 'average', 'gay', 'vers_top', 'host', 3, 'host'],
  ['Marc', 45, 'Montparnasse', -0.002, -0.006, 180, 90, 'stocky', 'gay', 'top', 'host', 300, null],
  ['Loïc', 28, 'Pigalle', -0.004, 0.006, 176, 71, 'athletic', 'gay', 'vers_bottom', 'travel', 1, 'travel'],
  ['Quentin', 26, 'Pigalle', 0.003, -0.007, 183, 74, 'slim', 'curious', 'side', 'travel', 15, null],
  ['Farid', 36, 'Montmartre', -0.003, 0.006, 181, 85, 'muscular', 'bi', 'top', 'host,travel', 2, null],
  ['Stan', 31, 'Montmartre', 0.004, -0.008, 188, 92, 'bear', 'gay', 'vers', 'host', 60, null],
  ['Paolo', 27, 'Batignolles', 0.002, 0.005, 174, 67, 'slim', 'gay', 'bottom', 'travel', 4, 'venue'],
  ['Jonas', 39, 'Batignolles', -0.005, -0.004, 185, 82, 'athletic', 'gay', 'vers_top', 'host', 7, null],
  ['Elias', 25, 'Belleville', -0.004, -0.006, 179, 69, 'slim', 'queer', 'vers', 'travel', 0, 'travel'],
  ['Rémi', 43, 'Belleville', 0.005, 0.005, 177, 80, 'average', 'gay', 'bottom', 'host', 240, null],
  ['Tiago', 30, 'Le Marais', 0.007, 0.007, 180, 77, 'muscular', 'gay', 'vers_top', 'host,travel', 1, null]
];
EXTRA.forEach(([name, age, hood, dLat, dLng, height, weight, body, identity, position, can, seen, place], i) => {
  const email = `${name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@ild.local`;
  add({ email, status: 'member', first_name: name, age, hood, dLat, dLng, position, seeking: place ? 'now' : 'now,dates', code: `DEMO-${String(i + 1).padStart(3, '0')}`, photo: 16 + i });
  cruise.run(height, weight, body, identity, null, can, 'direct', 'ask', now - seen * 60e3, email);
  if (place) presence.run(now + (45 + i * 9) * 60e3, null, place, email);
  if (i % 3 === 0) db.prepare("UPDATE users SET map_precision = '500m' WHERE email = ?").run(email);
});

const testMonth = (monthsAgo) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - monthsAgo); return d.toISOString().slice(0, 7); };
const health = db.prepare('UPDATE users SET hiv_status = ?, last_test = ?, health_visibility = ?, health_consent_at = ? WHERE email = ?');
health.run('neg_prep', testMonth(1), 'members', now, 'samir@ild.local');
health.run('neg', testMonth(2), 'matches', now, 'leo@ild.local');
health.run('undetectable', testMonth(3), 'members', now, 'romain@ild.local');
health.run('neg_prep', testMonth(1), 'members', now, 'bilal@ild.local');
db.prepare("UPDATE users SET endowment_cm = 18, cut = 'uncut', intimate_visibility = 'members' WHERE email = 'samir@ild.local'").run();
db.prepare("UPDATE users SET bio = 'Direct, respectueux. Plutôt le soir.' WHERE email = 'samir@ild.local'").run();
db.prepare("UPDATE users SET presence_until = ?, presence_place = 'travel', presence_note = 'Dispo vers Bastille' WHERE email = 'yanis@ild.local'").run(now + 90 * 60e3);

// Un nouveau profil (badge « Nouveau ») et un membre de Lyon en voyage à Paris.
add({ email: 'enzo@ild.local', status: 'member', first_name: 'Enzo', age: 24, hood: 'Oberkampf', dLat: 0.004, code: 'ENZO-27JK', daysAgo: 2 });
const malik = add({ email: 'malik@ild.local', status: 'member', first_name: 'Malik', age: 30, job: 'De passage', code: 'MALI-41GH', photo: 14 });
db.prepare('UPDATE users SET trip_lat = ?, trip_lng = ?, trip_label = ?, trip_until = ?, last_seen_at = ?, height_cm = 182, weight_kg = 78, body_type = ?, can = ? WHERE id = ?')
  .run(snap(NEIGHBORHOODS.Bastille[0] + 0.003), snap(NEIGHBORHOODS.Bastille[1] + 0.004), 'Paris', now + 3 * DAY, now - 6 * 60e3, 'athletic', 'travel', malik);
db.prepare("UPDATE users SET last_seen_at = ? WHERE email = 'enzo@ild.local'").run(now - 60e3);

const favorite = db.prepare('INSERT INTO favorites (user_id, target_id, created_at) VALUES (?, ?, ?)');
favorite.run(leo, samir, now - DAY);
favorite.run(leo, karim, now - 3600e3);

// Samir a envoyé une photo à Léo dans le chat ; Karim vient d'écrire à Léo (non lu).
const chatFile = `${randomBytes(16).toString('hex')}.jpg`;
copyFileSync(join(ASSETS, 'album-2.jpg'), join(uploads, chatFile));
const chatPhoto = Number(db.prepare("INSERT INTO photos (user_id, kind, match_id, file, status, created_at) VALUES (?, 'chat', ?, ?, 'approved', ?)")
  .run(samir, match, chatFile, now - 2.5 * 3600e3).lastInsertRowid);
db.prepare("INSERT INTO messages (match_id, sender_id, kind, body, photo_id, created_at) VALUES (?, ?, 'photo', 'Photo', ?, ?)").run(match, samir, chatPhoto, now - 2.5 * 3600e3);
msg.run(match, leo, 'text', 'Top. Je te dis quand je pars.', null, now - 2.4 * 3600e3);
db.prepare('UPDATE matches SET a_read_at = ?, b_read_at = ? WHERE id = ?').run(now - 2 * 3600e3, now - 2 * 3600e3, match);
const fromKarim = Number(db.prepare("INSERT INTO matches (a_id, b_id, origin, opened_by, created_at) VALUES (?, ?, 'chat', ?, ?)")
  .run(Math.min(leo, karim), Math.max(leo, karim), karim, now - 12 * 60e3).lastInsertRowid);
msg.run(fromKarim, karim, 'text', 'Salut, dispo ce soir ? Je reçois.', null, now - 12 * 60e3);

// Plans à plusieurs : un en cours à Pigalle (Bilal), un ce soir dans un établissement (Romain, Léo accepté).
const cell = (v) => Math.floor(v / 0.01) * 0.01 + 0.005;
const plan = db.prepare(`INSERT INTO plans (host_id, title, description, place_kind, lat, lng, address, starts_at, ends_at, max_guests, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const member = db.prepare('INSERT INTO plan_members (plan_id, user_id, status, message, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?)');
const planMsg = db.prepare('INSERT INTO plan_messages (plan_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)');
const p1 = Number(plan.run(bilal, 'Plan à 3 ou 4, Pigalle', 'Chez moi, ambiance détendue. On discute cinq minutes, puis on voit.', 'home',
  cell(NEIGHBORHOODS.Pigalle[0]), cell(NEIGHBORHOODS.Pigalle[1]), 'Exemple : 3e étage, interphone B', now - 20 * 60e3, now + 3 * 3600e3, 4, now - 40 * 60e3).lastInsertRowid);
member.run(p1, karim, 'accepted', 'Dispo dans 20 min', now - 30 * 60e3, now - 25 * 60e3);
member.run(p1, yanis, 'requested', 'Je peux venir vers 23 h', now - 8 * 60e3, null);
planMsg.run(p1, bilal, 'Bienvenue. Sonnez à l’interphone B.', now - 24 * 60e3);
planMsg.run(p1, karim, 'J’arrive dans 15 min.', now - 20 * 60e3);
const p2 = Number(plan.run(romain, 'Soirée cuir, on s’y retrouve', 'Rendez-vous au bar du fond vers 23 h. Dress code cuir ou sportswear.', 'venue',
  cell(NEIGHBORHOODS['Le Marais'][0]), cell(NEIGHBORHOODS['Le Marais'][1]), 'Exemple : club du Marais, bar du fond', now + 2 * 3600e3, now + 6 * 3600e3, 8, now - 3 * 3600e3).lastInsertRowid);
member.run(p2, leo, 'accepted', null, now - 2 * 3600e3, now - 1.9 * 3600e3);
member.run(p2, samir, 'accepted', null, now - 2 * 3600e3, now - 1.8 * 3600e3);
planMsg.run(p2, romain, 'On se retrouve au bar du fond. Dites-moi si vous êtes en retard.', now - 1.7 * 3600e3);
planMsg.run(p2, samir, 'J’y serai vers 23 h 15.', now - 1.5 * 3600e3);

const tonight = new Date(); tonight.setHours(19, 0, 0, 0);
db.prepare(`INSERT INTO posts (user_id, kind, title, body, place, starts_at, visibility, city, created_at)
  VALUES (NULL, 'event', ?, ?, ?, ?, 'members', 'Paris', ?)`)
  .run('Apéro sur un toit, Belleville', 'Organisé par ILD. Adresse envoyée aux invités confirmés.', 'Belleville', tonight.getTime() + DAY, now);
db.prepare("INSERT INTO posts (user_id, kind, body, visibility, city, created_at) VALUES (?, 'post', ?, 'members', 'Paris', ?)")
  .run(samir, 'Soirée techno dans le 11e vers minuit. Qui sort ?', now - 22 * 60e3);

db.prepare(`INSERT INTO reports (reporter_id, target_type, target_id, target_user_id, reason, details, evidence, created_at)
  VALUES (?, 'user', ?, ?, 'spam', ?, ?, ?)`)
  .run(hugo, mathis, mathis, 'Envoie le même message à tout le monde.', JSON.stringify({ profile: { first_name: 'Mathis', job: 'Avocat' } }), now - 5 * 3600e3);

// Kévin a été suspendu et conteste la décision.
db.prepare(`INSERT INTO notices (user_id, kind, ground, explanation, created_at, appeal_text, appeal_at, appeal_status)
  VALUES (?, 'account_suspended', 'harassment', ?, ?, ?, ?, 'pending')`)
  .run(kevin, "Plusieurs membres ont signalé des messages insistants après un refus, le 12 novembre.", now - 2 * DAY,
    "Je n'ai envoyé que deux messages, je ne pensais pas mal faire. Je m'engage à respecter la charte.", now - DAY);

db.prepare('INSERT INTO audit (admin_id, action, target, details, created_at) VALUES (?, ?, ?, ?, ?)').run(admin, 'seed', null, null, now);

console.log('Base de démonstration créée.');
console.log(`  Back office : admin@ild.local / ${adminPassword}`);
console.log(`  Membre      : leo@ild.local / ${demoPassword}  (albums, match avec Samir, album reçu)`);
console.log('  Autres membres : samir@, hugo@, mathis@, yanis@, adrien@, karim@, nathan@, romain@, bilal@, theo@, jules@ild.local');
console.log('  Suspendu    : kevin@ild.local (recours en attente)');
console.log('  Candidats   : thomas@ (dossier complet), nico@ (photo à valider), julien@ (âge en cours), max@ (nouveau)');
console.log(`  Mot de passe des comptes de démo : ${demoPassword}`);
console.log('  Nuit (carte du cruising, par défaut) : npm start, puis http://localhost:3000');
console.log('  ILD (club sur invitation, même base de démo) : ILD_EDITION=club npm start');

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
  if (o.photo) photo(id, `profile-${o.photo}.jpg`, 'profile', null, o.photoStatus || 'approved');
  return id;
}

const admin = add({ email: 'admin@ild.local', password: adminPassword, role: 'admin', status: 'member', first_name: 'Équipe ILD', age: 30, code: 'ADMIN-0001' });
const leo = add({ email: 'leo@ild.local', status: 'member', first_name: 'Léo', age: 29, hood: 'Le Marais', job: 'Directeur artistique',
  bio: 'Toujours partant pour une expo puis un verre.', prompt: 'Marché, brunch, expo et sieste.', tastes: 'Techno,Photo,Vin,Expos',
  seeking: 'dates,relationship', position: 'vers', position_visibility: 'matches', intimate: 'Romantique,Câlins', music: 'Midnight Drive', code: 'LEO-7Q2K', photo: 'L' });
const samir = add({ email: 'samir@ild.local', status: 'member', first_name: 'Samir', age: 33, hood: 'Pigalle', job: 'Chef', tastes: 'Cuisine,Jazz,Vin,Voyages',
  seeking: 'dates,chat', position: 'top', intimate: 'Kink friendly', intimate_visibility: 'matches', code: 'SAMI-31AB', photo: 'S', music: 'Blue in Green' });
const hugo = add({ email: 'hugo@ild.local', status: 'member', first_name: 'Hugo', age: 27, hood: 'Belleville', job: 'Architecte', tastes: 'Running,Design,Brunch',
  seeking: 'friends,network', position: 'vers_bottom', code: 'HUGO-77CD', looking_for: 'dating,friends,network', photo: 'H' });
const mathis = add({ email: 'mathis@ild.local', status: 'member', first_name: 'Mathis', age: 31, hood: 'Oberkampf', job: 'Avocat', tastes: 'Cinéma,Théâtre,Vin',
  seeking: 'relationship', code: 'MATH-12EF', looking_for: 'dating,network', photo: 'M' });
add({ email: 'yanis@ild.local', status: 'member', first_name: 'Yanis', age: 25, hood: 'Bastille', job: 'Étudiant en design', tastes: 'Mode,Danse,Clubbing', seeking: 'now,chat', position: 'bottom', code: 'YANI-90GH', photo: 'Y' });
add({ email: 'adrien@ild.local', status: 'member', first_name: 'Adrien', age: 36, hood: 'Saint-Germain', job: 'Éditeur', tastes: 'Lecture,Voyages,Expos', seeking: 'relationship', code: 'ADRI-45IJ', looking_for: 'dating', photo: 'A' });
add({ email: 'karim@ild.local', status: 'member', first_name: 'Karim', age: 30, hood: 'Le Marais', dLat: 0.002, job: 'Développeur', tastes: 'Jeux vidéo,Salle de sport,Séries', seeking: 'dates,now', position: 'vers_top', code: 'KARI-23KL', photo: 'K' });
add({ email: 'nathan@ild.local', status: 'member', first_name: 'Nathan', age: 28, hood: 'Le Marais', dLng: 0.002, job: 'Infirmier', tastes: 'Yoga,Plage,Pop', seeking: 'relationship,friends', position: 'side', code: 'NATH-61UV', photo: 'N' });
add({ email: 'romain@ild.local', status: 'member', first_name: 'Romain', age: 34, hood: 'Le Marais', dLat: -0.002, job: 'Photographe', tastes: 'Photo,Drag,Clubbing', seeking: 'chat,dates', code: 'ROMA-08WX', photo: 'R' });
add({ email: 'bilal@ild.local', status: 'member', first_name: 'Bilal', age: 26, hood: 'Pigalle', dLat: 0.002, job: 'Barman', tastes: 'House,Apéros,Clubbing', seeking: 'now,dates', position: 'vers', code: 'BILA-72YZ', photo: 'B' });
add({ email: 'theo@ild.local', status: 'member', first_name: 'Théo', age: 23, hood: 'Montmartre', job: 'Comédien', tastes: 'Théâtre,Cinéma,Musique live', seeking: 'friends,dates', code: 'THEO-19AB', photo: 'T' });
add({ email: 'jules@ild.local', status: 'member', first_name: 'Jules', age: 32, hood: 'Canal Saint-Martin', job: 'Chef de projet', tastes: 'Randonnée,Vin,Brunch', seeking: 'relationship', position: 'top', code: 'JULE-33CD', photo: 'J' });
const kevin = add({ email: 'kevin@ild.local', status: 'suspended', first_name: 'Kévin', age: 29, job: 'Commercial', tastes: 'Salle de sport,Voyages,Plage', code: 'KEVI-55EF', photo: 'V' });

// Candidats à chaque étape de la validation.
const thomas = add({ email: 'thomas@ild.local', status: 'waitlist', first_name: 'Thomas', age: 31, job: 'Ingénieur son', tastes: 'Techno,Musique live,Running',
  seeking: 'dates,friends', code: 'THOM-55MN', invited_by: 'LEO-7Q2K', daysAgo: 6, photo: 'O' });
const nico = add({ email: 'nico@ild.local', status: 'waitlist', first_name: 'Nicolas', age: 28, tastes: 'Cinéma,Brunch,Natation', seeking: 'chat', code: 'NICO-66OP', daysAgo: 4, photo: 'C', photoStatus: 'pending' });
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

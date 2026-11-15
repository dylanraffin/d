// Données de démonstration : npm run seed
// Crée un administrateur, des membres, des candidats, un événement et un signalement.
import { randomBytes } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.mjs';
import { hashPassword } from './auth.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.ILD_DATA_DIR || join(ROOT, 'data');
const db = openDb(join(dataDir, 'ild.sqlite'));

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
  console.log('La base contient déjà des données : rien à faire. Supprime le dossier data/ pour repartir de zéro.');
  process.exit(0);
}

const adminPassword = process.env.ILD_ADMIN_PASSWORD || randomBytes(9).toString('base64url');
const demoPassword = process.env.ILD_DEMO_PASSWORD || 'demo-ild-2026';
const now = Date.now();
const DAY = 86400e3;
const year = new Date().getFullYear();

const insert = db.prepare(`INSERT INTO users (email, pass_hash, role, status, first_name, birth_year, city, neighborhood,
  job, bio, prompt_answer, interests, looking_for, music_title, referral_code, invited_by_code, id_check_status,
  id_verified_at, consent_age_at, consent_orientation_at, charter_at, premium, album_enabled, created_at, accepted_at)
  VALUES (?, ?, ?, ?, ?, ?, 'Paris', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

function add(o) {
  const created = now - (o.daysAgo ?? 30) * DAY;
  const verified = ['waitlist', 'member'].includes(o.status) || o.role === 'admin';
  const info = insert.run(o.email, hashPassword(o.password || demoPassword), o.role || 'member', o.status, o.first_name,
    year - o.age, o.neighborhood || null, o.job || null, o.bio || null, o.prompt || null, o.interests || null,
    o.looking_for || 'dating,friends', o.music || null, o.code, o.invited_by || null,
    verified ? 'verified' : (o.id_check || 'none'), verified ? created : null, created, created, created,
    o.premium ? 1 : 0, o.album ? 1 : 0, created, o.status === 'member' ? created + DAY : null);
  return Number(info.lastInsertRowid);
}

const admin = add({ email: 'admin@ild.local', password: adminPassword, role: 'admin', status: 'member', first_name: 'Équipe ILD', age: 30, code: 'ADMIN-0001' });
const leo = add({ email: 'leo@ild.local', status: 'member', first_name: 'Léo', age: 29, neighborhood: 'Le Marais', job: 'Directeur artistique',
  bio: 'Toujours partant pour une expo puis un verre.', prompt: 'Marché, brunch, expo et sieste.', interests: 'Techno, Photographie, Vin nature',
  music: 'Midnight Drive', code: 'LEO-7Q2K', premium: true, album: true });
const samir = add({ email: 'samir@ild.local', status: 'member', first_name: 'Samir', age: 33, neighborhood: 'Pigalle', job: 'Chef', interests: 'Cuisine, Jazz', code: 'SAMI-31AB', album: true });
const hugo = add({ email: 'hugo@ild.local', status: 'member', first_name: 'Hugo', age: 27, neighborhood: 'Belleville', job: 'Architecte', interests: 'Course à pied, Design', code: 'HUGO-77CD', looking_for: 'dating,friends,network' });
const mathis = add({ email: 'mathis@ild.local', status: 'member', first_name: 'Mathis', age: 31, neighborhood: 'Oberkampf', job: 'Avocat', interests: 'Tennis, Cinéma', code: 'MATH-12EF', looking_for: 'dating,network' });
add({ email: 'yanis@ild.local', status: 'member', first_name: 'Yanis', age: 25, neighborhood: 'Bastille', job: 'Étudiant en design', interests: 'Mode, Danse', code: 'YANI-90GH' });
add({ email: 'adrien@ild.local', status: 'member', first_name: 'Adrien', age: 36, neighborhood: 'Saint-Germain', job: 'Éditeur', interests: 'Livres, Voile', code: 'ADRI-45IJ', looking_for: 'dating' });
add({ email: 'karim@ild.local', status: 'member', first_name: 'Karim', age: 30, neighborhood: 'Le Marais', job: 'Développeur', interests: 'Jeux vidéo, Escalade', code: 'KARI-23KL' });

const thomas = add({ email: 'thomas@ild.local', status: 'waitlist', first_name: 'Thomas', age: 31, code: 'THOM-55MN', invited_by: 'LEO-7Q2K', daysAgo: 6 });
const nico = add({ email: 'nico@ild.local', status: 'waitlist', first_name: 'Nicolas', age: 28, code: 'NICO-66OP', daysAgo: 4 });
add({ email: 'julien@ild.local', status: 'pending', first_name: 'Julien', age: 34, code: 'JULI-88QR', id_check: 'submitted', daysAgo: 1 });
add({ email: 'max@ild.local', status: 'pending', first_name: 'Maxime', age: 22, code: 'MAXI-99ST', daysAgo: 0 });

const vouch = db.prepare('INSERT INTO vouches (voucher_id, applicant_id, created_at) VALUES (?, ?, ?)');
vouch.run(leo, thomas, now - 3 * DAY);
vouch.run(hugo, thomas, now - 2 * DAY);
vouch.run(samir, nico, now - DAY);

// Léo et Samir se plaisent : match et conversation.
const like = db.prepare('INSERT INTO likes (from_id, to_id, value, created_at) VALUES (?, ?, 1, ?)');
like.run(leo, samir, now - 2 * DAY);
like.run(samir, leo, now - 2 * DAY);
like.run(hugo, leo, now - DAY);
const match = Number(db.prepare('INSERT INTO matches (a_id, b_id, created_at) VALUES (?, ?, ?)').run(Math.min(leo, samir), Math.max(leo, samir), now - 2 * DAY).lastInsertRowid);
const msg = db.prepare('INSERT INTO messages (match_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)');
msg.run(match, samir, "Salut ! Tu vas à l'apéro sur le toit ce soir ?", now - 3 * 3600e3);
msg.run(match, leo, 'Oui, vers 20h. Et toi ?', now - 2.9 * 3600e3);
db.prepare('INSERT INTO album_grants (owner_id, grantee_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(samir, leo, now + 7 * DAY, now);

const tonight = new Date(); tonight.setHours(19, 0, 0, 0);
db.prepare(`INSERT INTO posts (user_id, kind, title, body, place, starts_at, visibility, city, created_at)
  VALUES (NULL, 'event', ?, ?, ?, ?, 'members', 'Paris', ?)`)
  .run('Apéro sur un toit, Belleville', 'Organisé par ILD. Adresse envoyée aux invités confirmés.', 'Belleville', tonight.getTime() + DAY, now);
db.prepare("INSERT INTO posts (user_id, kind, body, visibility, city, created_at) VALUES (?, 'post', ?, 'members', 'Paris', ?)")
  .run(samir, 'Soirée techno dans le 11e vers minuit. Qui sort ?', now - 22 * 60e3);

db.prepare(`INSERT INTO reports (reporter_id, target_type, target_id, target_user_id, reason, details, evidence, created_at)
  VALUES (?, 'user', ?, ?, 'spam', ?, ?, ?)`)
  .run(hugo, mathis, mathis, 'Envoie le même message à tout le monde.', JSON.stringify({ profile: { first_name: 'Mathis' } }), now - 5 * 3600e3);

db.prepare('INSERT INTO audit (admin_id, action, target, details, created_at) VALUES (?, ?, ?, ?, ?)').run(admin, 'seed', null, null, now);

console.log('Base de démonstration créée.');
console.log(`  Back office : admin@ild.local / ${adminPassword}`);
console.log(`  Membre      : leo@ild.local / ${demoPassword}  (ILD+, album activé)`);
console.log(`  Autres membres : samir@, hugo@, mathis@, yanis@, adrien@, karim@ild.local (même mot de passe)`);
console.log(`  Candidats   : thomas@ (2 parrainages), nico@ (1), julien@ (identité à valider), max@ (nouveau)`);

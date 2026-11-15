// Base de données SQLite (module intégré à Node 22, aucune dépendance).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',            -- member | admin
  status TEXT NOT NULL DEFAULT 'pending',         -- pending | waitlist | member | refused | suspended | banned
  refusal_reason TEXT,
  first_name TEXT NOT NULL,
  birth_year INTEGER NOT NULL,
  birth_date TEXT,                                -- AAAA-MM-JJ
  city TEXT NOT NULL DEFAULT 'Paris',
  neighborhood TEXT,
  job TEXT,
  bio TEXT,
  prompt_answer TEXT,
  interests TEXT,
  tastes TEXT,                                    -- goûts (étiquettes), séparés par des virgules
  seeking TEXT,                                   -- ce que la personne cherche
  position TEXT,                                  -- top | vers_top | vers | vers_bottom | bottom | side
  position_visibility TEXT NOT NULL DEFAULT 'members',  -- members | matches | hidden
  intimate TEXT,                                  -- goûts intimes (étiquettes)
  intimate_visibility TEXT NOT NULL DEFAULT 'matches',
  looking_for TEXT NOT NULL DEFAULT 'dating',     -- modes de Découvrir
  music_title TEXT,
  referral_code TEXT NOT NULL UNIQUE,
  invited_by_code TEXT,
  id_check_status TEXT NOT NULL DEFAULT 'none',   -- none | submitted | verified | failed
  id_verified_at INTEGER,
  age_verified_at INTEGER,
  consent_age_at INTEGER NOT NULL,
  consent_orientation_at INTEGER NOT NULL,
  charter_at INTEGER NOT NULL,
  legal_version TEXT,
  legal_accepted_at INTEGER,
  premium INTEGER NOT NULL DEFAULT 0,             -- ILD+ offert par l'équipe
  travel_city TEXT,
  travel_from TEXT,
  travel_to TEXT,
  hide_from_map INTEGER NOT NULL DEFAULT 0,
  show_distance INTEGER NOT NULL DEFAULT 1,
  incognito INTEGER NOT NULL DEFAULT 0,
  lat REAL,                                       -- position arrondie (grille d'environ 500 m)
  lng REAL,
  location_source TEXT,                           -- gps | neighborhood
  location_updated_at INTEGER,
  geo_consent_at INTEGER,
  map_precision TEXT NOT NULL DEFAULT '1km',      -- zone | 1km | 500m (carte en direct)
  presence_until INTEGER,                         -- « dispo » jusqu'à
  presence_note TEXT,
  presence_place TEXT,                            -- host | travel | out | any
  messages_from TEXT NOT NULL DEFAULT 'everyone', -- everyone | photo | nobody
  album_matches_only INTEGER NOT NULL DEFAULT 1,
  album_enabled INTEGER NOT NULL DEFAULT 0,
  blur_explicit INTEGER NOT NULL DEFAULT 1,
  discreet_icon INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  decided_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                             -- profile | album | chat
  album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',         -- pending | approved | rejected
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Un album envoyé en privé à une personne : durée limitée ou jusqu'au retrait.
CREATE TABLE IF NOT EXISTS album_shares (
  id INTEGER PRIMARY KEY,
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grantee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER,                             -- NULL = jusqu'au retrait
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS album_requests (
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (requester_id, owner_id)
);

CREATE TABLE IF NOT EXISTS vouches (
  voucher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  applicant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (voucher_id, applicant_id)
);

CREATE TABLE IF NOT EXISTS likes (
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value INTEGER NOT NULL,                         -- 1 = j'aime, -1 = passer
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);

-- Conversation entre deux membres : née d'un like réciproque (origin = like) ou d'un premier
-- message envoyé depuis la carte (origin = chat, considérée comme un match une fois la réponse reçue).
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin TEXT NOT NULL DEFAULT 'like',
  opened_by INTEGER,
  replied_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (a_id, b_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'text',              -- text | album | photo
  body TEXT NOT NULL,
  share_id INTEGER,
  removed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,   -- NULL = événement ILD
  kind TEXT NOT NULL DEFAULT 'post',              -- post | event
  title TEXT,
  body TEXT NOT NULL,
  place TEXT,
  starts_at INTEGER,
  visibility TEXT NOT NULL DEFAULT 'members',     -- members | matches
  city TEXT NOT NULL DEFAULT 'Paris',
  removed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rsvps (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'block',             -- block | hide
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Les signalements gardent une copie des preuves : ils survivent à la suppression des comptes.
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  reporter_id INTEGER,
  reporter_contact TEXT,                          -- signalement public (DSA art. 16)
  target_type TEXT NOT NULL,                      -- user | message | photo | post | external
  target_id INTEGER NOT NULL,
  target_user_id INTEGER,
  reason TEXT NOT NULL,
  details TEXT,
  evidence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',            -- open | dismissed | actioned
  resolution TEXT,
  resolved_by INTEGER,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Exposé des motifs envoyé à la personne visée par une décision (DSA art. 17) et son recours (art. 20).
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,             -- application_refused | account_suspended | account_banned | content_removed | photo_rejected
  ground TEXT NOT NULL,           -- motif (clause de la charte ou contenu illégal)
  explanation TEXT NOT NULL,      -- faits et circonstances, écrits pour la personne
  related TEXT,                   -- ex. message:12, post:3, photo:8
  automated INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  appeal_text TEXT,
  appeal_at INTEGER,
  appeal_status TEXT NOT NULL DEFAULT 'none',     -- none | pending | upheld | overturned
  appeal_note TEXT,
  appeal_decided_at INTEGER,
  appeal_decided_by INTEGER
);

-- Empreintes (hachées) d'e-mails bannis : empêche de revenir avec le même e-mail.
CREATE TABLE IF NOT EXISTS blocklist (
  hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Sessions de vérification d'âge chez le prestataire. Aucune pièce d'identité n'est stockée ici.
CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',         -- created | verified | failed | minor
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_ref TEXT,
  status TEXT NOT NULL,                           -- active | canceled | expired
  price_cents INTEGER,
  started_at INTEGER NOT NULL,
  current_period_end INTEGER NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  canceled_at INTEGER
);

-- Lieux de la carte : établissements et événements (bars, clubs, saunas…), validés par la modération.
CREATE TABLE IF NOT EXISTS spots (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',         -- pending | approved | rejected
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spot_checkins (
  spot_id INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  until INTEGER NOT NULL,
  PRIMARY KEY (spot_id, user_id)
);

-- Plans à plusieurs : organisés par un membre. La zone est approximative ; l'adresse n'est visible
-- que de l'hôte et des participants acceptés.
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY,
  host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  place_kind TEXT NOT NULL,                       -- home | hotel | venue | other
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  address TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  max_guests INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',            -- open | cancelled | removed
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_members (
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,                           -- requested | accepted | declined | left
  message TEXT,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  PRIMARY KEY (plan_id, user_id)
);

CREATE TABLE IF NOT EXISTS plan_messages (
  id INTEGER PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Favoris : profils épinglés pour plus tard. Privé : la personne n'est pas prévenue.
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_id)
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER,
  action TEXT NOT NULL,
  target TEXT,
  details TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_geo ON users(lat, lng);
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, id);
CREATE INDEX IF NOT EXISTS idx_photos_user ON photos(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_photos_album ON photos(album_id);
CREATE INDEX IF NOT EXISTS idx_shares_grantee ON album_shares(grantee_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_notices_user ON notices(user_id);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_spots_status ON spots(status);
CREATE INDEX IF NOT EXISTS idx_plans_time ON plans(status, ends_at);
CREATE INDEX IF NOT EXISTS idx_plan_messages ON plan_messages(plan_id, id);
`;

// Colonnes ajoutées après la première version : ajoutées automatiquement aux bases existantes.
const ADDED_COLUMNS = {
  users: {
    birth_date: 'TEXT', tastes: 'TEXT', seeking: 'TEXT', position: 'TEXT',
    position_visibility: "TEXT NOT NULL DEFAULT 'members'", intimate: 'TEXT',
    intimate_visibility: "TEXT NOT NULL DEFAULT 'matches'", age_verified_at: 'INTEGER',
    legal_version: 'TEXT', legal_accepted_at: 'INTEGER', show_distance: 'INTEGER NOT NULL DEFAULT 1',
    incognito: 'INTEGER NOT NULL DEFAULT 0', lat: 'REAL', lng: 'REAL', location_source: 'TEXT',
    location_updated_at: 'INTEGER', geo_consent_at: 'INTEGER', map_precision: "TEXT NOT NULL DEFAULT '1km'",
    presence_until: 'INTEGER', presence_note: 'TEXT', presence_place: 'TEXT', messages_from: "TEXT NOT NULL DEFAULT 'everyone'",
    // Profil cruising
    height_cm: 'INTEGER', weight_kg: 'INTEGER', body_type: 'TEXT', identity: 'TEXT', tribes: 'TEXT', can: 'TEXT', vibes: 'TEXT',
    endowment_cm: 'INTEGER', cut: 'TEXT', safer: 'TEXT',
    // Santé : seulement avec un accord explicite (health_consent_at)
    hiv_status: 'TEXT', last_test: 'TEXT', health_visibility: "TEXT NOT NULL DEFAULT 'matches'", health_consent_at: 'INTEGER',
    last_seen_at: 'INTEGER',
    // Mode voyage : point choisi par le membre, pas sa position
    trip_lat: 'REAL', trip_lng: 'REAL', trip_label: 'TEXT', trip_until: 'INTEGER'
  },
  matches: { origin: "TEXT NOT NULL DEFAULT 'like'", opened_by: 'INTEGER', replied_at: 'INTEGER', a_read_at: 'INTEGER', b_read_at: 'INTEGER' },
  photos: { album_id: 'INTEGER REFERENCES albums(id) ON DELETE CASCADE', match_id: 'INTEGER REFERENCES matches(id) ON DELETE CASCADE' },
  messages: { kind: "TEXT NOT NULL DEFAULT 'text'", share_id: 'INTEGER', photo_id: 'INTEGER' },
  reports: { reporter_contact: 'TEXT' }
};

// Réglages modifiables dans le back office. type : int | text | bool | list
export const SETTINGS_SPEC = {
  // Validation des candidatures
  vouches_required: { type: 'int', min: 0, max: 10, def: '2', label: 'Parrainages conseillés avant examen' },
  vouches_mandatory: { type: 'bool', def: '0', label: 'Parrainages obligatoires pour accepter' },
  // Albums, voyage, carte
  travel_visible_days: { type: 'int', min: 0, max: 30, def: '3', label: 'Visibilité avant un voyage (jours)' },
  map_min_cluster: { type: 'int', min: 2, max: 20, def: '3', label: 'Minimum de membres par zone affichée sur la carte' },
  location_ttl_days: { type: 'int', min: 1, max: 90, def: '7', label: 'Effacement des positions inactives (jours)' },
  // RGPD
  retention_months_applicants: { type: 'int', min: 1, max: 60, def: '12', label: 'Conservation des candidatures non abouties (mois)' },
  retention_months_reports: { type: 'int', min: 6, max: 120, def: '36', label: 'Conservation des signalements traités (mois)' },
  retention_months_blocklist: { type: 'int', min: 6, max: 120, def: '36', label: 'Conservation de la liste des e-mails bannis (mois)' },
  // Abonnement (désactivé : l'app est gratuite)
  payments_enabled: { type: 'bool', def: '0', label: 'Abonnement ILD+ payant activé' },
  plus_price_cents: { type: 'int', min: 0, max: 100000, def: '1499', label: 'Prix mensuel ILD+ (centimes, TTC)' },
  plus_features: { type: 'list', def: 'who_liked_me,travel_mode,advanced_filters,incognito,unlimited_likes,extended_map,read_receipts', label: 'Fonctions réservées à la version payante' },
  plan_max_guests: { type: 'int', min: 2, max: 50, def: '12', label: 'Plans à plusieurs : nombre maximal de participants' },
  chat_photos_per_day: { type: 'int', min: 1, max: 500, def: '60', label: 'Photos envoyées dans le chat par jour et par membre' },
  // International : pays où le service est fermé (codes ISO à deux lettres), lus dans l'en-tête de pays posé par le proxy ou le CDN.
  blocked_countries: { type: 'text', max: 800, def: '', label: 'Pays où le service est fermé (codes ISO séparés par des virgules, ex. « AE, SA, IR »)' },
  free_map_radius_km: { type: 'int', min: 1, max: 500, def: '15', label: 'Carte en direct : rayon gratuit autour de soi (km, si payant activé)' },
  daily_new_chats: { type: 'int', min: 1, max: 1000, def: '40', label: 'Carte en direct : nouvelles conversations par jour et par membre' },
  free_daily_likes: { type: 'int', min: 1, max: 1000, def: '50', label: 'Likes par jour en gratuit (quand le payant est activé)' },
  // Informations légales (mentions légales, CGU, politique de confidentialité)
  legal_company: { type: 'text', max: 120, def: '', label: 'Raison sociale' },
  legal_form: { type: 'text', max: 80, def: '', label: 'Forme et capital (ex. SAS au capital de 1 000 €)' },
  legal_address: { type: 'text', max: 200, def: '', label: 'Adresse du siège' },
  legal_siren: { type: 'text', max: 30, def: '', label: 'RCS / SIREN' },
  legal_vat: { type: 'text', max: 30, def: '', label: 'N° de TVA intracommunautaire' },
  legal_director: { type: 'text', max: 120, def: '', label: 'Directeur de la publication' },
  legal_host: { type: 'text', max: 200, def: '', label: 'Hébergeur (nom, adresse, téléphone)' },
  legal_hosting_eu: { type: 'bool', def: '0', label: "Données hébergées dans l'Union européenne" },
  legal_contact_email: { type: 'text', max: 120, def: '', label: 'E-mail de contact (point de contact DSA)' },
  legal_dpo_email: { type: 'text', max: 120, def: '', label: 'E-mail du DPO' },
  legal_mediator: { type: 'text', max: 200, def: '', label: 'Médiateur de la consommation (si payant)' },
  last_purge_at: { type: 'int', min: 0, max: Number.MAX_SAFE_INTEGER, def: '0', label: 'Dernière purge', hidden: true }
};

export const DEFAULT_SETTINGS = Object.fromEntries(Object.entries(SETTINGS_SPEC).map(([k, v]) => [k, v.def]));

function migrate(db) {
  for (const [table, cols] of Object.entries(ADDED_COLUMNS)) {
    const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    for (const [col, type] of Object.entries(cols)) {
      if (!existing.has(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    }
  }
  // Ancienne version : un seul album par membre, accès par personne. On crée un album « Album privé ».
  const legacy = db.prepare("SELECT DISTINCT user_id FROM photos WHERE kind = 'album' AND album_id IS NULL").all();
  for (const { user_id } of legacy) {
    const id = Number(db.prepare('INSERT INTO albums (user_id, name, created_at) VALUES (?, ?, ?)').run(user_id, 'Album privé', Date.now()).lastInsertRowid);
    db.prepare("UPDATE photos SET album_id = ? WHERE user_id = ? AND kind = 'album' AND album_id IS NULL").run(id, user_id);
  }
  db.prepare("UPDATE users SET birth_date = printf('%04d-01-01', birth_year) WHERE birth_date IS NULL").run();
}

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  migrate(db);
  db.exec(INDEXES);
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  return db;
}

export function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : DEFAULT_SETTINGS[key];
}

export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

export function audit(db, adminId, action, target, details) {
  db.prepare('INSERT INTO audit (admin_id, action, target, details, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(adminId ?? null, action, target ?? null, details == null ? null : JSON.stringify(details), Date.now());
}

// Exécute fn dans une transaction.
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

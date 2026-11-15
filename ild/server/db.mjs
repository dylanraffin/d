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
  city TEXT NOT NULL DEFAULT 'Paris',
  neighborhood TEXT,
  job TEXT,
  bio TEXT,
  prompt_answer TEXT,
  interests TEXT,
  looking_for TEXT NOT NULL DEFAULT 'dating',     -- liste séparée par des virgules
  music_title TEXT,
  referral_code TEXT NOT NULL UNIQUE,
  invited_by_code TEXT,
  id_check_status TEXT NOT NULL DEFAULT 'none',   -- none | submitted | verified | failed
  id_verified_at INTEGER,
  consent_age_at INTEGER NOT NULL,
  consent_orientation_at INTEGER NOT NULL,
  charter_at INTEGER NOT NULL,
  premium INTEGER NOT NULL DEFAULT 0,
  travel_city TEXT,
  travel_from TEXT,
  travel_to TEXT,
  hide_from_map INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                             -- profile | album
  file TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',         -- pending | approved | rejected
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
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

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE (a_id, b_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS album_requests (
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (requester_id, owner_id)
);

CREATE TABLE IF NOT EXISTS album_grants (
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grantee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, grantee_id)
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
  target_type TEXT NOT NULL,                      -- user | message | photo | post
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

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, id);
CREATE INDEX IF NOT EXISTS idx_photos_user ON photos(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
`;

export const DEFAULT_SETTINGS = {
  // Durée de conservation des candidatures refusées ou jamais acceptées (RGPD).
  retention_months_applicants: '12',
  // Durée de conservation des signalements traités.
  retention_months_reports: '36',
  // Nombre de parrainages qui débloquent l'examen par le comité.
  vouches_required: '2',
  // Durée d'accès par défaut à un album privé.
  album_grant_days: '7',
  // Nombre de jours avant un voyage où le membre apparaît dans la ville.
  travel_visible_days: '3'
};

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  return db;
}

export function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : DEFAULT_SETTINGS[key];
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

// Plans à plusieurs : un membre reçoit ou organise, les autres demandent à venir, l'hôte accepte.
//
// Ce qui protège les membres :
//  - sur la carte, un plan est placé au centre d'une case d'environ 1 km, jamais à l'adresse ;
//  - l'adresse et la liste des participants ne sont visibles que de l'hôte et des personnes acceptées ;
//  - aucune contrepartie d'argent (Code pénal, art. 225-5 et suivants : proxénétisme) et aucune drogue :
//    l'hôte s'y engage, un filtre bloque les annonces les plus évidentes, tout plan peut être signalé ;
//  - un plan s'efface tout seul de la carte à son heure de fin.
import { fail } from './http.mjs';
import { requireMember, requireAdmin } from './auth.mjs';
import { getSetting, audit, tx } from './db.mjs';
import { PLAN_KINDS, PLAN_STARTS, PLAN_DURATIONS, GROUNDS } from './options.mjs';
import { DAY, str, hiddenBetween, shownProfilePhoto, notify, saveJpeg, scanImage, deleteFiles } from './core.mjs';
import { effectiveLocation } from './cruise.mjs';
import { requireFeature } from './billing.mjs';
import { haversineKm, distanceBetween } from './geo.mjs';

const CELL = 0.01;
const VIEW_RADIUS_KM = 12;
const SCHEDULE_MAX_DAYS = 7; // un plan se prévoit au plus une semaine à l'avance
const cell = (v) => Math.floor(v / CELL) * CELL + CELL / 2;

const MONEY = /(€|\beuros?\b|\btarifs?\b|\bpayant|\br[ée]mun[ée]r|\bescort|\bpaf\b|participation aux frais)/i;
const DRUGS = /(\bchems?\b|chemsex|\bslam\b|3[- ]?mmc|\bghb\b|\bgbl\b|\btina\b|\bcrystal\b|\bcoke\b|\bmdma\b|k[ée]tamine)/i;

function checkText(...texts) {
  const all = texts.filter(Boolean).join(' ');
  if (MONEY.test(all)) fail(400, "Pas d'argent : un plan à plusieurs ne peut demander ni paiement ni participation.");
  if (DRUGS.test(all)) fail(400, 'Pas de drogue dans une annonce de plan à plusieurs.');
}

const person = (db, x, viewer = null) => ({ id: x.id, first_name: x.first_name, ...shownProfilePhoto(db, viewer, x.id) });
const accepted = (db, planId) => db.prepare("SELECT COUNT(*) AS n FROM plan_members WHERE plan_id = ? AND status = 'accepted'").get(planId).n;
const isLive = (p) => p.status === 'open' && p.ends_at > Date.now();

// Couverture du plan (sans nudité, relue par la modération) : l'hôte voit aussi celle en attente.
function planCover(db, p, isHost) {
  const c = db.prepare(`SELECT id, status FROM photos WHERE plan_id = ? AND kind = 'plan' AND status ${isHost ? "!= 'rejected'" : "= 'approved'"}
    ORDER BY id DESC LIMIT 1`).get(p.id);
  return c ? (isHost ? c : { id: c.id }) : null;
}

function myStatus(db, p, u) {
  if (p.host_id === u.id) return 'host';
  return db.prepare('SELECT status FROM plan_members WHERE plan_id = ? AND user_id = ?').get(p.id, u.id)?.status || null;
}

export function planView(db, u, p, { detail = false } = {}) {
  const host = db.prepare('SELECT * FROM users WHERE id = ?').get(p.host_id);
  const mine = myStatus(db, p, u);
  const inside = mine === 'host' || mine === 'accepted';
  const now = Date.now();
  const d = distanceBetween(u, p);
  const view = {
    id: p.id, title: p.title, place_kind: p.place_kind, starts_at: p.starts_at, ends_at: p.ends_at,
    in_progress: p.starts_at <= now && p.ends_at > now, ended: p.ends_at <= now, status: p.status,
    lat: p.lat, lng: p.lng, max_guests: p.max_guests, going: accepted(db, p.id),
    host: person(db, host, u), my_status: mine, distance: d ? d.label : null,
    description: p.description, cover: planCover(db, p, mine === 'host')
  };
  if (mine === 'host') view.pending = db.prepare("SELECT COUNT(*) AS n FROM plan_members WHERE plan_id = ? AND status = 'requested'").get(p.id).n;
  if (!detail) return view;
  view.description = p.description;
  // Adresse et participants : seulement pour l'hôte et les personnes acceptées.
  view.address = inside ? p.address : null;
  view.members = inside ? db.prepare(`SELECT x.* FROM plan_members m JOIN users x ON x.id = m.user_id
    WHERE m.plan_id = ? AND m.status = 'accepted' AND x.status = 'member' ORDER BY m.decided_at`).all(p.id)
    .filter((x) => x.id === u.id || !hiddenBetween(db, u.id, x.id)).map((x) => person(db, x, u)) : [];
  if (mine === 'host') {
    view.requests = db.prepare(`SELECT x.*, m.message, m.created_at AS asked_at FROM plan_members m JOIN users x ON x.id = m.user_id
      WHERE m.plan_id = ? AND m.status = 'requested' AND x.status = 'member' ORDER BY m.created_at`).all(p.id)
      .filter((x) => !hiddenBetween(db, u.id, x.id)).map((x) => ({ ...person(db, x, u), message: x.message, asked_at: x.asked_at }));
  }
  return view;
}

function visiblePlan(ctx, u, { live = true } = {}) {
  const p = ctx.db.prepare('SELECT * FROM plans WHERE id = ?').get(Number(ctx.params.id));
  if (!p || p.status === 'removed') fail(404, 'Plan introuvable.');
  const host = ctx.db.prepare('SELECT status FROM users WHERE id = ?').get(p.host_id);
  if (!host || host.status !== 'member' || (p.host_id !== u.id && hiddenBetween(ctx.db, u.id, p.host_id))) fail(404, 'Plan introuvable.');
  if (live && !isLive(p)) fail(410, p.status === 'cancelled' ? "L'hôte a annulé ce plan." : 'Ce plan est terminé.');
  return p;
}

function insidePlan(ctx, u) {
  const p = visiblePlan(ctx, u, { live: false });
  const mine = myStatus(ctx.db, p, u);
  if (mine !== 'host' && mine !== 'accepted') fail(403, 'La discussion est réservée aux participants acceptés.');
  return p;
}

// Plans en cours ou à venir autour d'un point (pour la carte).
export function plansAround(db, u, center) {
  return db.prepare("SELECT * FROM plans WHERE status = 'open' AND ends_at > ?").all(Date.now())
    .filter((p) => haversineKm(center.lat, center.lng, p.lat, p.lng) <= VIEW_RADIUS_KM)
    .filter((p) => p.host_id === u.id || !hiddenBetween(db, u.id, p.host_id))
    .filter((p) => db.prepare("SELECT 1 FROM users WHERE id = ? AND status = 'member'").get(p.host_id))
    .map((p) => planView(db, u, p));
}

export function registerPlanRoutes(r) {
  r.get('/api/plans/mine', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const rows = db.prepare(`SELECT DISTINCT p.* FROM plans p LEFT JOIN plan_members m ON m.plan_id = p.id AND m.user_id = ?
      WHERE p.status = 'open' AND p.ends_at > ? AND (p.host_id = ? OR m.status IN ('accepted', 'requested')) ORDER BY p.starts_at`).all(u.id, Date.now() - 6 * 3600e3, u.id);
    return { plans: rows.filter((p) => p.host_id === u.id || !hiddenBetween(db, u.id, p.host_id)).map((p) => planView(db, u, p)) };
  });

  r.post('/api/plans', (ctx) => {
    const u = requireMember(ctx);
    if (ctx.config.edition !== 'cruise') fail(404, 'Route inconnue.');
    const db = ctx.db;
    requireFeature(db, u, 'host_plans');
    const b = ctx.body;
    if (!b.rules) fail(400, "Confirme les règles : adultes consentants, pas d'argent, pas de drogue.");
    const title = str(b.title, 80, { required: true, label: 'Titre' });
    const description = str(b.description, 600, { label: 'Description' });
    const address = str(b.address, 200, { label: 'Adresse' });
    checkText(title, description);
    if (!PLAN_KINDS[b.place_kind]) fail(400, 'Type de lieu inconnu.');
    const startIn = Number(b.starts_in ?? 0);
    const duration = Number(b.duration ?? 120);
    if (!(startIn in PLAN_STARTS) || !(duration in PLAN_DURATIONS)) fail(400, 'Horaire inconnu.');
    // Ou une heure précise, jusqu'à une semaine à l'avance (« Demain à 18:00 »).
    const at = b.starts_at == null || b.starts_at === '' ? null : Number(b.starts_at);
    if (at != null && (!Number.isFinite(at) || at < Date.now() - 5 * 60e3 || at > Date.now() + SCHEDULE_MAX_DAYS * DAY)) {
      fail(400, `Choisis une heure entre maintenant et dans ${SCHEDULE_MAX_DAYS} jours.`);
    }
    const max = Number(b.max_guests);
    const limit = Number(getSetting(db, 'plan_max_guests'));
    if (!Number.isInteger(max) || max < 2 || max > limit) fail(400, `Nombre de participants : entre 2 et ${limit}.`);
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) fail(400, 'Position invalide.');
    if (db.prepare("SELECT 1 FROM plans WHERE host_id = ? AND status = 'open' AND ends_at > ?").get(u.id, Date.now())) {
      fail(409, 'Tu organises déjà un plan. Termine-le ou annule-le avant d’en créer un autre.');
    }
    const starts = at != null ? Math.max(at, Date.now()) : Date.now() + startIn * 60e3;
    const info = db.prepare(`INSERT INTO plans (host_id, title, description, place_kind, lat, lng, address, starts_at, ends_at, max_guests, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(u.id, title, description, b.place_kind, cell(lat), cell(lng), address, starts, starts + duration * 60e3, max, Date.now());
    return { id: Number(info.lastInsertRowid) };
  });

  // « Plans autour de moi » : en cours ou à venir, autour de ma position (ou de ma ville de voyage), les plus proches dans le temps d'abord.
  r.get('/api/plans/nearby', (ctx) => {
    const u = requireMember(ctx);
    const here = effectiveLocation(u);
    if (here.lat == null) return { located: false, plans: [] };
    // center : la case d'environ 1 km du membre, pour placer un nouveau plan depuis la liste (jamais sa position).
    return { located: true, center: { lat: cell(here.lat), lng: cell(here.lng) }, plans: plansAround(ctx.db, u, here).sort((a, b) => a.starts_at - b.starts_at) };
  });

  // Couverture : une photo du lieu ou de l'ambiance, sans nudité, relue par la modération avant d'être montrée.
  r.post('/api/plans/:id/cover', async (ctx) => {
    const u = requireMember(ctx);
    const p = visiblePlan(ctx, u);
    if (p.host_id !== u.id) fail(403, "Seul l'hôte peut changer la couverture.");
    const { file, buf } = saveJpeg(ctx, ctx.body.data);
    const scan = await scanImage(buf);
    if (!scan.ok) { deleteFiles(ctx, [file]); fail(400, 'Image refusée.'); }
    const old = ctx.db.prepare("SELECT file FROM photos WHERE plan_id = ? AND kind = 'plan'").all(p.id);
    deleteFiles(ctx, old.map((x) => x.file));
    ctx.db.prepare("DELETE FROM photos WHERE plan_id = ? AND kind = 'plan'").run(p.id);
    const info = ctx.db.prepare("INSERT INTO photos (user_id, kind, file, status, position, explicit, plan_id, created_at) VALUES (?, 'plan', ?, 'pending', 0, 0, ?, ?)")
      .run(u.id, file, p.id, Date.now());
    return { id: Number(info.lastInsertRowid), status: 'pending' };
  });

  r.delete('/api/plans/:id/cover', (ctx) => {
    const u = requireMember(ctx);
    const p = visiblePlan(ctx, u, { live: false });
    if (p.host_id !== u.id) fail(403, "Seul l'hôte peut changer la couverture.");
    const old = ctx.db.prepare("SELECT file FROM photos WHERE plan_id = ? AND kind = 'plan'").all(p.id);
    deleteFiles(ctx, old.map((x) => x.file));
    ctx.db.prepare("DELETE FROM photos WHERE plan_id = ? AND kind = 'plan'").run(p.id);
    return { ok: true };
  });

  r.get('/api/plans/:id', (ctx) => {
    const u = requireMember(ctx);
    return planView(ctx.db, u, visiblePlan(ctx, u, { live: false }), { detail: true });
  });

  r.post('/api/plans/:id/join', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const p = visiblePlan(ctx, u);
    if (p.host_id === u.id) fail(400, "C'est ton plan.");
    const mine = myStatus(db, p, u);
    if (mine === 'declined') fail(403, "L'hôte a décliné ta demande.");
    if (mine === 'accepted' || mine === 'requested') return { status: mine };
    if (accepted(db, p.id) >= p.max_guests) fail(409, 'Ce plan est complet.');
    const message = str(ctx.body.message, 200, { label: 'Message' });
    checkText(message);
    db.prepare(`INSERT INTO plan_members (plan_id, user_id, status, message, created_at) VALUES (?, ?, 'requested', ?, ?)
      ON CONFLICT (plan_id, user_id) DO UPDATE SET status = 'requested', message = excluded.message, created_at = excluded.created_at, decided_at = NULL`)
      .run(p.id, u.id, message, Date.now());
    return { status: 'requested' };
  });

  r.post('/api/plans/:id/requests/:userId', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const p = visiblePlan(ctx, u);
    if (p.host_id !== u.id) fail(403, "Seul l'hôte décide.");
    const row = db.prepare('SELECT * FROM plan_members WHERE plan_id = ? AND user_id = ?').get(p.id, Number(ctx.params.userId));
    if (!row || !['requested', 'accepted'].includes(row.status)) fail(404, 'Demande introuvable.');
    const accept = ctx.body.decision === 'accept';
    if (accept && row.status !== 'accepted' && accepted(db, p.id) >= p.max_guests) fail(409, 'Le plan est complet.');
    db.prepare('UPDATE plan_members SET status = ?, decided_at = ? WHERE plan_id = ? AND user_id = ?').run(accept ? 'accepted' : 'declined', Date.now(), p.id, row.user_id);
    return { status: accept ? 'accepted' : 'declined' };
  });

  r.post('/api/plans/:id/leave', (ctx) => {
    const u = requireMember(ctx);
    const p = visiblePlan(ctx, u, { live: false });
    if (p.host_id === u.id) fail(400, "Tu es l'hôte : annule le plan pour y mettre fin.");
    ctx.db.prepare("UPDATE plan_members SET status = 'left', decided_at = ? WHERE plan_id = ? AND user_id = ? AND status IN ('requested', 'accepted')").run(Date.now(), p.id, u.id);
    return { ok: true };
  });

  r.delete('/api/plans/:id', (ctx) => {
    const u = requireMember(ctx);
    const p = visiblePlan(ctx, u, { live: false });
    if (p.host_id !== u.id) fail(403, "Seul l'hôte peut annuler.");
    ctx.db.prepare("UPDATE plans SET status = 'cancelled', address = NULL WHERE id = ?").run(p.id);
    return { ok: true };
  });

  // --- discussion du plan (hôte et participants acceptés) ---
  r.get('/api/plans/:id/messages', (ctx) => {
    const u = requireMember(ctx);
    const db = ctx.db;
    const p = insidePlan(ctx, u);
    const after = Number(ctx.query.get('after') || 0);
    const messages = db.prepare(`SELECT m.*, x.first_name FROM plan_messages m JOIN users x ON x.id = m.sender_id
      WHERE m.plan_id = ? AND m.id > ? ORDER BY m.id LIMIT 200`).all(p.id, after)
      .filter((m) => m.sender_id === u.id || !hiddenBetween(db, u.id, m.sender_id))
      .map((m) => ({ id: m.id, mine: m.sender_id === u.id, sender: m.first_name, host: m.sender_id === p.host_id, removed: !!m.removed, body: m.removed ? null : m.body, created_at: m.created_at }));
    return { plan: planView(db, u, p, { detail: true }), messages };
  });

  r.post('/api/plans/:id/messages', (ctx) => {
    const u = requireMember(ctx);
    const p = insidePlan(ctx, u);
    if (p.ends_at < Date.now() - 6 * 3600e3 || p.status !== 'open') fail(410, 'Ce plan est terminé.');
    const body = str(ctx.body.body, 1000, { required: true, label: 'Message' });
    const info = ctx.db.prepare('INSERT INTO plan_messages (plan_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)').run(p.id, u.id, body, Date.now());
    return { id: Number(info.lastInsertRowid) };
  });

  // --- back office ---
  r.get('/api/admin/plans', (ctx) => {
    requireAdmin(ctx);
    const db = ctx.db;
    const rows = db.prepare(`SELECT p.*, u.first_name AS host_name, u.email AS host_email FROM plans p JOIN users u ON u.id = p.host_id
      WHERE p.created_at > ? ORDER BY p.created_at DESC LIMIT 300`).all(Date.now() - 30 * DAY);
    return {
      kinds: PLAN_KINDS, grounds: GROUNDS,
      plans: rows.map((p) => ({ ...p, going: accepted(db, p.id), messages: db.prepare('SELECT COUNT(*) AS n FROM plan_messages WHERE plan_id = ?').get(p.id).n, live: isLive(p) }))
    };
  });

  // Retrait par la modération : l'hôte reçoit l'exposé des motifs (DSA, art. 17) et peut faire un recours.
  r.post('/api/admin/plans/:id/remove', (ctx) => {
    const admin = requireAdmin(ctx);
    const db = ctx.db;
    const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(Number(ctx.params.id));
    if (!p) fail(404, 'Plan introuvable.');
    tx(db, () => {
      notify(db, p.host_id, 'content_removed', String(ctx.body.ground), ctx.body.explanation, `plan:${p.id}`);
      db.prepare("UPDATE plans SET status = 'removed' WHERE id = ?").run(p.id);
    });
    audit(db, admin.id, 'plan_removed', `plan:${p.id}`, { title: p.title, ground: ctx.body.ground });
    return { ok: true };
  });
}

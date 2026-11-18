// Serveur ILD : API membre, API back office, webhooks, pages légales, photos protégées et fichiers de l'app.
import { createServer } from 'node:http';
import { createReadStream, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, HttpError, readBody, parseJson, sendJson, serveStatic, SECURITY_HEADERS, allowImageOrigins } from './http.mjs';
import { openDb } from './db.mjs';
import { currentUser } from './auth.mjs';
import { canSeePhoto, explicitRestricted } from './core.mjs';
import { registerMemberRoutes, mapTiles } from './api.mjs';
import { registerAlbumRoutes } from './albums.mjs';
import { registerNearbyRoutes } from './nearby.mjs';
import { registerBillingRoutes } from './billing.mjs';
import { registerVerificationRoutes } from './verification.mjs';
import { registerNoticeRoutes } from './notices.mjs';
import { registerLegalRoutes, renderLegal } from './legal.mjs';
import { registerAdminRoutes } from './admin.mjs';
import { registerLiveRoutes } from './live.mjs';
import { registerCruiseRoutes } from './cruise.mjs';
import { registerPlanRoutes } from './plans.mjs';
import { registerLivePlayRoutes } from './liveplay.mjs';
import { renderLanding, webManifest, preferredLang, blockedPage } from './site.mjs';
import { getSetting } from './db.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const MAX_BODY = 5 * 1024 * 1024;
const COUNTRY_HEADER = (process.env.ILD_COUNTRY_HEADER || 'cf-ipcountry').toLowerCase();

export function createApp(options = {}) {
  const dataDir = options.dataDir || process.env.ILD_DATA_DIR || join(ROOT, 'data');
  const config = {
    uploadsDir: join(dataDir, 'uploads'),
    secureCookies: options.secureCookies ?? process.env.ILD_SECURE_COOKIES === '1',
    rateLimit: options.rateLimit ?? true,
    // « cruise » (par défaut) : Nuit, la carte du cruising, ouverte à tous les adultes vérifiés. Site d'abord.
    // « club » : ILD, rencontre sur invitation (liste d'attente, parrainages, comité).
    edition: (options.edition || process.env.ILD_EDITION) === 'club' ? 'club' : 'cruise',
    // LivePlay : serveur STUN (découverte d'adresse) et relais TURN facultatif. Avec le relais, les adresses IP restent cachées.
    ice: {
      stun: options.stunUrls ?? process.env.ILD_STUN_URLS ?? 'stun:stun.cloudflare.com:3478',
      turnUrls: options.turnUrls ?? process.env.ILD_TURN_URLS ?? '',
      turnSecret: options.turnSecret ?? process.env.ILD_TURN_SECRET ?? ''
    }
  };
  const brandName = options.brand || process.env.ILD_BRAND || (config.edition === 'cruise' ? 'Nuit' : 'ILD');
  config.brand = { name: brandName, plus: `${brandName}+` };
  mkdirSync(config.uploadsDir, { recursive: true });
  const db = options.db || openDb(options.dbFile || join(dataDir, 'ild.sqlite'));
  try { allowImageOrigins([new URL(mapTiles().url.replace(/[{}]/g, '')).origin]); } catch { /* adresse de tuiles invalide */ }

  const router = new Router();
  for (const register of [registerMemberRoutes, registerAlbumRoutes, registerNearbyRoutes, registerBillingRoutes,
    registerVerificationRoutes, registerNoticeRoutes, registerLegalRoutes, registerAdminRoutes, registerLiveRoutes,
    registerCruiseRoutes, registerPlanRoutes, registerLivePlayRoutes]) register(router);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    try {
      // International : le service est fermé dans les pays listés au back office (là où la loi met les membres en danger).
      // Le pays vient de l'en-tête posé par le proxy ou le CDN ; sans cet en-tête, rien n'est bloqué.
      const country = String(req.headers[COUNTRY_HEADER] || '').trim().toUpperCase();
      if (country && getSetting(db, 'blocked_countries').toUpperCase().split(/[\s,;]+/).includes(country) && !path.startsWith('/app/') && !path.startsWith('/live/')) {
        if (path.startsWith('/api/')) throw new HttpError(451, 'Service not available in your country.');
        res.writeHead(451, { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(blockedPage(config));
        return;
      }
      // Photos : jamais en accès libre, contrôle d'accès à chaque requête.
      const photo = /^\/photos\/(\d+)$/.exec(path);
      if (photo && req.method === 'GET') {
        const user = currentUser(db, req);
        if (user) user._country = country;
        const p = db.prepare('SELECT * FROM photos WHERE id = ?').get(Number(photo[1]));
        if (!p || !canSeePhoto(db, user, p)) throw new HttpError(404, 'Photo introuvable.');
        // Là où les photos de profil explicites sont masquées, seule leur alternative sans nudité est servie.
        if (p.kind === 'profile' && p.explicit && user && user.id !== p.user_id && user.role !== 'admin' && explicitRestricted(db, user)) throw new HttpError(404, 'Photo introuvable.');
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' });
        createReadStream(join(config.uploadsDir, p.file)).on('error', () => res.end()).pipe(res);
        return;
      }

      const legal = /^\/legal\/([a-z]+)$/.exec(path);
      if (legal && req.method === 'GET') {
        const html = renderLegal(db, legal[1], config);
        if (!html) throw new HttpError(404, 'Page introuvable.');
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(html);
        return;
      }

      if (path.startsWith('/api/')) {
        const found = router.match(req.method, path);
        if (!found) throw new HttpError(404, 'Route inconnue.');
        const isWebhook = path.startsWith('/api/webhooks/');
        // Protection CSRF : un formulaire d'un autre site ne peut pas ajouter cet en-tête.
        // Les webhooks n'en ont pas besoin : ils sont authentifiés par leur signature.
        if (req.method !== 'GET' && !isWebhook && req.headers['x-ild'] !== '1') throw new HttpError(403, 'En-tête de requête manquant.');
        const rawBody = req.method === 'GET' ? '' : await readBody(req, MAX_BODY);
        let cookie = null;
        const ctx = {
          db, config, req, res, rawBody,
          params: found.params,
          query: url.searchParams,
          body: parseJson(rawBody),
          user: isWebhook ? null : (() => { const u = currentUser(db, req); if (u) u._country = country; return u; })(),
          ip: req.socket.remoteAddress || 'unknown',
          setCookie: (c) => { cookie = c; }
        };
        // « En ligne » : dernière activité, mise à jour une fois par minute au plus.
        // Une position choisie à la main (quartier, ville) reste valable tant que le membre est actif.
        if (ctx.user && !(ctx.user.last_seen_at > Date.now() - 60e3)) {
          db.prepare(`UPDATE users SET last_seen_at = ?, location_updated_at = CASE WHEN lat IS NOT NULL AND location_source IN ('neighborhood', 'city')
            THEN ? ELSE location_updated_at END WHERE id = ?`).run(Date.now(), Date.now(), ctx.user.id);
        }
        const result = await found.handler(ctx);
        sendJson(res, 200, result ?? { ok: true }, cookie ? { 'Set-Cookie': cookie } : {});
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Méthode non autorisée.');
      if (path === '/manifest.webmanifest') {
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify(webManifest(config)));
        return;
      }
      if (path === '/' || path === '/index.html') {
        if (config.edition === 'cruise') {
          // Site d'abord : la page d'accueil publique pour les visiteurs, la carte pour les membres connectés.
          if (currentUser(db, req)) {
            res.writeHead(302, { ...SECURITY_HEADERS, Location: '/carte', 'Cache-Control': 'no-store' });
            res.end();
            return;
          }
          // Français sur « / », anglais sur « /en ». Un visiteur dont le navigateur n'est pas en français est envoyé sur « /en »,
          // sauf s'il a demandé le français (« /?lang=fr »).
          if (url.searchParams.get('lang') !== 'fr' && preferredLang(req.headers['accept-language']) !== 'fr') {
            res.writeHead(302, { ...SECURITY_HEADERS, Location: '/en', Vary: 'Accept-Language', 'Cache-Control': 'no-store' });
            res.end();
            return;
          }
          const html = renderLanding(PUBLIC, config);
          if (html) {
            res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
            res.end(req.method === 'HEAD' ? undefined : html);
            return;
          }
          if (await serveStatic(res, PUBLIC, 'live/index.html')) return;
        } else if (await serveStatic(res, PUBLIC, 'app/index.html')) return;
      }
      if ((path === '/en' || path === '/en/') && config.edition === 'cruise') {
        const html = renderLanding(PUBLIC, config, 'en');
        if (html) {
          res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
          res.end(req.method === 'HEAD' ? undefined : html);
          return;
        }
      }
      if (path === '/carte' && config.edition === 'cruise') {
        if (await serveStatic(res, PUBLIC, 'live/index.html')) return;
      }
      if (path === '/admin' || path === '/admin/') {
        if (await serveStatic(res, PUBLIC, 'admin/index.html')) return;
      }
      if (await serveStatic(res, PUBLIC, path)) return;
      throw new HttpError(404, 'Page introuvable.');
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (res.headersSent) { res.end(); return; }
      sendJson(res, status, { error: status === 500 ? 'Erreur interne.' : err.message });
    }
  });

  return { server, db, config };
}

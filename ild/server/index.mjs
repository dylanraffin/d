// Serveur ILD : API membre, API back office, webhooks, pages légales, photos protégées et fichiers de l'app.
import { createServer } from 'node:http';
import { createReadStream, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, HttpError, readBody, parseJson, sendJson, serveStatic, SECURITY_HEADERS, allowImageOrigins } from './http.mjs';
import { openDb } from './db.mjs';
import { currentUser } from './auth.mjs';
import { canSeePhoto } from './core.mjs';
import { registerMemberRoutes, mapTiles } from './api.mjs';
import { registerAlbumRoutes } from './albums.mjs';
import { registerNearbyRoutes } from './nearby.mjs';
import { registerBillingRoutes } from './billing.mjs';
import { registerVerificationRoutes } from './verification.mjs';
import { registerNoticeRoutes } from './notices.mjs';
import { registerLegalRoutes, renderLegal } from './legal.mjs';
import { registerAdminRoutes } from './admin.mjs';
import { registerLiveRoutes } from './live.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const MAX_BODY = 5 * 1024 * 1024;

export function createApp(options = {}) {
  const dataDir = options.dataDir || process.env.ILD_DATA_DIR || join(ROOT, 'data');
  const config = {
    uploadsDir: join(dataDir, 'uploads'),
    secureCookies: options.secureCookies ?? process.env.ILD_SECURE_COOKIES === '1',
    rateLimit: options.rateLimit ?? true,
    // « club » : ILD, sur invitation (liste d'attente, parrainages, comité).
    // « cruise » : carte en direct ouverte à tous les adultes vérifiés (façon Sniffies).
    edition: (options.edition || process.env.ILD_EDITION) === 'cruise' ? 'cruise' : 'club'
  };
  const brandName = options.brand || process.env.ILD_BRAND || (config.edition === 'cruise' ? 'Nuit' : 'ILD');
  config.brand = { name: brandName, plus: `${brandName}+` };
  mkdirSync(config.uploadsDir, { recursive: true });
  const db = options.db || openDb(options.dbFile || join(dataDir, 'ild.sqlite'));
  try { allowImageOrigins([new URL(mapTiles().url.replace(/[{}]/g, '')).origin]); } catch { /* adresse de tuiles invalide */ }

  const router = new Router();
  for (const register of [registerMemberRoutes, registerAlbumRoutes, registerNearbyRoutes, registerBillingRoutes,
    registerVerificationRoutes, registerNoticeRoutes, registerLegalRoutes, registerAdminRoutes, registerLiveRoutes]) register(router);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    try {
      // Photos : jamais en accès libre, contrôle d'accès à chaque requête.
      const photo = /^\/photos\/(\d+)$/.exec(path);
      if (photo && req.method === 'GET') {
        const user = currentUser(db, req);
        const p = db.prepare('SELECT * FROM photos WHERE id = ?').get(Number(photo[1]));
        if (!p || !canSeePhoto(db, user, p)) throw new HttpError(404, 'Photo introuvable.');
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
          user: isWebhook ? null : currentUser(db, req),
          ip: req.socket.remoteAddress || 'unknown',
          setCookie: (c) => { cookie = c; }
        };
        const result = await found.handler(ctx);
        sendJson(res, 200, result ?? { ok: true }, cookie ? { 'Set-Cookie': cookie } : {});
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Méthode non autorisée.');
      if (path === '/' || path === '/index.html') {
        if (await serveStatic(res, PUBLIC, config.edition === 'cruise' ? 'live/index.html' : 'app/index.html')) return;
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

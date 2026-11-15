// Construit une démo statique de Nuit : la vraie interface, branchée sur des données fictives.
//
//   node tools/demo/build.mjs [dossier de sortie]      (ou : npm run demo)
//
// Le script crée une base de démonstration temporaire, lance le serveur, se connecte comme un membre fictif,
// enregistre les réponses de l'API et les photos de démo, puis copie le front en remplaçant les adresses
// absolues par des adresses relatives. Dans la démo, tools/demo/mock.js répond à la place du serveur :
// rien ne sort du navigateur et rien n'est enregistré.
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, cpSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const PUBLIC = join(ROOT, 'public');
const OUT = resolve(process.argv[2] || join(ROOT, 'demo-dist'));
const PASSWORD = 'demo-ild-2026';

const tmp = mkdtempSync(join(tmpdir(), 'nuit-demo-'));
const seeded = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', join(ROOT, 'server', 'seed.mjs')],
  { env: { ...process.env, ILD_DATA_DIR: tmp, ILD_DEMO_PASSWORD: PASSWORD }, encoding: 'utf8' });
if (seeded.status !== 0) throw new Error(`Base de démo : ${seeded.stderr}`);
const { createApp } = await import(join(ROOT, 'server', 'index.mjs'));
const app = createApp({ dataDir: tmp, rateLimit: false, edition: 'cruise' });
await new Promise((r) => app.server.listen(0, r));
const base = `http://127.0.0.1:${app.server.address().port}`;

const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ild': '1' },
  body: JSON.stringify({ email: 'leo@ild.local', password: PASSWORD }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
async function get(path) {
  const r = await fetch(base + path, { headers: { cookie } });
  if (!r.ok) throw new Error(`${path} : ${r.status}`);
  return r.json();
}

// ---------- 1. réponses de l'API ----------
const builtAt = Date.now();
const meta = await get('/api/meta');
meta.map = { url: '', attribution: '' }; // pas de tuiles dans la démo : le fond de carte est dessiné par basemap.js
const me = await get('/api/me');
const map = await get('/api/live/map');
const people = (await get('/api/live/people')).people;
const matches = (await get('/api/matches')).matches; // avant les conversations : garde les « non lus »
const ids = new Set([...map.pins, ...map.zones.flatMap((z) => z.people), ...people, ...matches.map((m) => m.user)].map((x) => x.id));
const planIds = new Set([...map.plans, ...(await get('/api/plans/mine')).plans].map((p) => p.id));
const plans = {};
const planMessages = {};
for (const id of planIds) {
  plans[id] = await get(`/api/plans/${id}`);
  ids.add(plans[id].host.id);
  if (['host', 'accepted'].includes(plans[id].my_status)) planMessages[id] = (await get(`/api/plans/${id}/messages`)).messages;
}
const users = {};
for (const id of ids) if (id !== me.id) users[id] = await get(`/api/users/${id}`);
const threads = {};
for (const m of matches) threads[m.id] = await get(`/api/matches/${m.id}/messages`);
const received = await get('/api/albums/received');
const shared = {};
for (const s of received.shares) shared[s.share_id] = await get(`/api/albums/shared/${s.share_id}`);
const data = {
  builtAt, meta, me, map, people, matches, threads, users, plans, planMessages, received, shared,
  myAlbums: await get('/api/me/albums'), blocks: await get('/api/blocks'), billing: await get('/api/billing'),
  notices: await get('/api/notices'), favorites: (await get('/api/favorites')).ids
};

// ---------- 2. fichiers ----------
rmSync(OUT, { recursive: true, force: true });
for (const d of ['app', 'live/icons', 'shared', 'vendor', 'photos', 'legal', 'demo']) mkdirSync(join(OUT, d), { recursive: true });

// Photos que le membre de démo a le droit de voir.
let photoCount = 0;
for (const { id } of app.db.prepare('SELECT id FROM photos ORDER BY id').all()) {
  const r = await fetch(`${base}/photos/${id}`, { headers: { cookie } });
  if (!r.ok) continue;
  writeFileSync(join(OUT, 'photos', `${id}.jpg`), Buffer.from(await r.arrayBuffer()));
  photoCount += 1;
}

// Front : adresses absolues → relatives, photos servies par la démo.
const js = (text) => text
  .replace(/'\/shared\//g, "'../shared/").replace(/'\/app\//g, "'../app/")
  .replace(/`\/photos\/\$\{([^}]+)\}`/g, 'window.demoPhoto($1)')
  .replace(/`\/legal\/\$\{([^}]+)\}`/g, '`legal/${$1}.html`')
  .replace(/'\/legal\/([a-z]+)'/g, "'legal/$1.html'")
  .replace(/href: '\/api\/me\/export', download: '[^']+'/g, "href: '#/me'");
for (const f of readdirSync(join(PUBLIC, 'app'))) {
  if (f.endsWith('.js') && !f.startsWith('verify') && !f.startsWith('legal')) writeFileSync(join(OUT, 'app', f), js(readFileSync(join(PUBLIC, 'app', f), 'utf8')));
}
writeFileSync(join(OUT, 'live', 'live.js'), js(readFileSync(join(PUBLIC, 'live', 'live.js'), 'utf8')));
writeFileSync(join(OUT, 'shared', 'lib.js'), readFileSync(join(PUBLIC, 'shared', 'lib.js'), 'utf8'));
for (const f of ['app/app.css', 'live/live.css', 'live/site.css']) cpSync(join(PUBLIC, f), join(OUT, f));
cpSync(join(PUBLIC, 'live', 'icons'), join(OUT, 'live', 'icons'), { recursive: true });
cpSync(join(PUBLIC, 'vendor', 'leaflet'), join(OUT, 'vendor', 'leaflet'), { recursive: true });
for (const f of ['mock.js', 'basemap.js', 'demo.css']) cpSync(join(HERE, f), join(OUT, 'demo', f));
writeFileSync(join(OUT, 'demo', 'data.js'), `window.DEMO = ${JSON.stringify(data)};\n`);

// Pages légales : rendues par le serveur, liens relatifs.
for (const doc of ['cgu', 'confidentialite', 'charte', 'mentions', 'signaler', 'cgv']) {
  const html = await (await fetch(`${base}/legal/${doc}`)).text();
  writeFileSync(join(OUT, 'legal', `${doc}.html`), html
    .replace(/href="\/legal\/([a-z]+)"/g, 'href="$1.html"').replace('href="/app/app.css"', 'href="../app/app.css"')
    .replace('href="/" class="legal-back"', 'href="../index.html" class="legal-back"')
    .replace(/<script[^>]*src="\/app\/legal-report\.js"[^>]*><\/script>/, ''));
}

// La carte : même coquille que le site, avec les données et le serveur simulé.
writeFileSync(join(OUT, 'carte.html'), `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="robots" content="noindex">
<meta name="site-home" content="index.html">
<title>${meta.brand.name} · démo</title>
<link rel="icon" href="live/icons/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;display=swap">
<link rel="stylesheet" href="vendor/leaflet/leaflet.css">
<link rel="stylesheet" href="app/app.css">
<link rel="stylesheet" href="live/live.css">
<link rel="stylesheet" href="demo/demo.css">
<script src="vendor/leaflet/leaflet.js" defer></script>
<script src="demo/data.js" defer></script>
<script src="demo/basemap.js" defer></script>
<script src="demo/mock.js" defer></script>
</head>
<body>
<div id="app" aria-live="polite"></div>
<script type="module" src="live/live.js"></script>
</body>
</html>
`);

// Page d'accueil : contenu seul (la page hébergée ajoute elle-même <html>, <head> et <body>).
const landing = await (await fetch(`${base}/`)).text();
const head = /<head>([\s\S]*?)<\/head>/.exec(landing)[1];
const body = /<body[^>]*>([\s\S]*?)<\/body>/.exec(landing)[1];
const pick = (re) => (re.exec(head) || [''])[0];
const relative = (html) => html
  .replace(/href="\/carte#/g, 'href="carte.html#').replace(/href="\/legal\/([a-z]+)"/g, 'href="legal/$1.html"')
  .replace(/href="\/live\//g, 'href="live/').replace(/src="\/live\//g, 'src="live/').replace(/href="\/"/g, 'href="index.html"');
writeFileSync(join(OUT, 'index.html'), `<title>Démo ${meta.brand.name}</title>
<meta name="claude:viewport-fit-sides" content="cover">
${pick(/<meta name="description"[^>]*>/)}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;display=swap">
<link rel="stylesheet" href="live/site.css">
<link rel="stylesheet" href="demo/demo.css">
<div class="demo-bar" role="note"><span><b>Démo cliquable.</b> Profils, messages et lieux fictifs. Rien n'est enregistré ni envoyé.</span><a href="carte.html">Ouvrir la carte</a></div>
${relative(body)}
`);

app.server.close();
rmSync(tmp, { recursive: true, force: true });
const files = [];
const walk = (dir, rel = '') => { for (const e of readdirSync(dir, { withFileTypes: true })) e.isDirectory() ? walk(join(dir, e.name), `${rel}${e.name}/`) : files.push(`${rel}${e.name}`); };
walk(OUT);
writeFileSync(`${OUT}.files.json`, JSON.stringify(files.filter((f) => f !== 'index.html').map((path) => ({ path }))));
console.log(`Démo construite dans ${OUT} : ${files.length} fichiers, ${photoCount} photos, ${Object.keys(users).length} profils.`);

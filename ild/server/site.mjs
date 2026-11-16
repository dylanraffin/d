// Le site public : page d'accueil (visiteurs non connectés) et manifeste de l'app installable.
// « Site d'abord » : pas de magasin d'applications, on s'installe depuis le navigateur.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const SITE_LANGS = ['fr', 'en'];

// Page d'accueil : public/live/landing.html (français) ou landing.en.html (anglais), avec le nom de la marque.
export function renderLanding(publicDir, config, lang = 'fr') {
  let html;
  for (const file of [lang === 'fr' ? 'landing.html' : `landing.${lang}.html`, 'landing.html']) {
    try { html = readFileSync(join(publicDir, 'live', file), 'utf8'); break; } catch { /* langue pas encore traduite : page française */ }
  }
  if (!html) return null;
  return html.replaceAll('{{BRAND}}', esc(config.brand.name)).replaceAll('{{PLUS}}', esc(config.brand.plus));
}

// Langue préférée du visiteur d'après son navigateur. Un robot sans préférence reçoit la page française.
export function preferredLang(acceptLanguage) {
  const first = String(acceptLanguage || '').split(',')[0].trim().slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(first) && first !== 'fr' ? 'en' : 'fr';
}

// Page affichée quand le service est fermé dans le pays du visiteur.
export function blockedPage(config) {
  const name = esc(config.brand.name);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${name}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..700&amp;display=swap"><link rel="stylesheet" href="/app/app.css"></head>
<body><main class="legal"><h1>${name}</h1>
<p>${name} is not available in your country. We do not operate where the law puts our members at risk.</p>
<p lang="fr">${name} n'est pas disponible dans ton pays. Nous n'ouvrons pas le service là où la loi met nos membres en danger.</p>
</main></body></html>`;
}

export function webManifest(config) {
  const cruise = config.edition === 'cruise';
  const dir = cruise ? '/live/icons' : '/app';
  return {
    name: config.brand.name,
    short_name: config.brand.name,
    description: cruise ? 'La carte du cruising entre mecs : qui est dispo autour de toi, maintenant.' : 'Club privé sur invitation.',
    lang: 'fr',
    start_url: cruise ? '/carte' : '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#b3bffc',
    categories: ['social', 'lifestyle'],
    icons: cruise ? [
      { src: `${dir}/icon.svg`, sizes: 'any', type: 'image/svg+xml' },
      { src: `${dir}/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${dir}/icon-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `${dir}/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ] : [{ src: `${dir}/icon.svg`, sizes: 'any', type: 'image/svg+xml' }]
  };
}

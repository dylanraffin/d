/* Chargement de Playwright (local ou global) et de three.js pour les outils de rendu et de test */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
export function playwright() {
  try { return req('playwright'); } catch (e) { return req(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
}
/* three.js : THREE_JS=/chemin/three.min.js, sinon node_modules/three, sinon le CDN d'origine */
export async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext(Object.assign({ ignoreHTTPSErrors: true }, opts));
  const local = [process.env.THREE_JS, path.join(root, 'node_modules/three/build/three.min.js')].find(p => p && fs.existsSync(p));
  if (local) await ctx.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ body: fs.readFileSync(local), contentType: 'application/javascript' }));
  return ctx;
}
export const launch = () => playwright().chromium.launch({ args: ['--enable-unsafe-swiftshader'] });

#!/usr/bin/env node
/* Test de fumée de l'interface : chaque onglet, une fiche mouvement en 3D, une séance complète. Échoue sur toute erreur JavaScript. */
import path from 'node:path';
import { root, launch, newContext } from './pw.mjs';

const b = await launch();
const errors = [];
for (const [w, h, scheme] of [[390, 844, 'light'], [1280, 900, 'dark']]) {
  const ctx = await newContext(b, { viewport: { width: w, height: h }, colorScheme: scheme });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${scheme} ${w}: ${e.message}`));
  await p.goto('file://' + path.join(root, 'app/index.html#profil'));
  await p.waitForTimeout(800);
  await p.fill('#pf-age', '31'); await p.fill('#pf-height', '180'); await p.fill('#pf-weight', '76');
  await p.click('button[data-act="pf-save"]');
  for (const tab of ['seance', 'progres', 'nutrition', 'mouvements', 'coach']) { await p.click(`nav button[data-v="${tab}"]`); await p.waitForTimeout(500); }
  await p.click('nav button[data-v="mouvements"]'); await p.waitForTimeout(800);
  await p.click('button.mv[data-id="deadlift"]'); await p.waitForTimeout(1500);
  const is3d = await p.evaluate(() => !!document.querySelector('.stage.is3d'));
  if (!is3d) errors.push(`${scheme} ${w}: lecteur 3D absent`);
  await p.click('[data-close]');
  await p.click('nav button[data-v="seance"]'); await p.waitForTimeout(400);
  await p.click('button[data-act="start"]'); await p.waitForTimeout(400);
  await p.click('button[data-act="set-ok"][data-ex="0"][data-s="0"]'); await p.waitForTimeout(200);
  await p.click('button[data-act="finish"]'); await p.waitForTimeout(400);
  const done = await p.evaluate(() => Object.keys(GYM.store.data.sessions).length);
  if (done !== 1) errors.push(`${scheme} ${w}: séance non enregistrée`);
  await ctx.close();
}
await b.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Interface OK (mobile clair, ordinateur sombre)');

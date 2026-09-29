#!/usr/bin/env node
/* Rendus hors ligne avec le moteur 3D de l'app.
   node tools/render.mjs sheet [id…]   → media/planche.png (chaque mouvement au début, au milieu, à la fin)
   node tools/render.mjs video [id…]   → media/demo.mp4 (30 i/s, intro + 1 répétition + points clés ; ffmpeg avec libx264 : FFMPEG=/chemin) */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, launch, newContext } from './pw.mjs';

const [mode = 'sheet', ...ids] = process.argv.slice(2);
const b = await launch();
const ctx = await newContext(b, { viewport: { width: mode === 'sheet' ? 900 : 820, height: 700 }, deviceScaleFactor: 1 });
const p = await ctx.newPage(), errors = [];
p.on('pageerror', e => errors.push(e.message));
fs.mkdirSync(path.join(root, 'media'), { recursive: true });
await p.goto('file://' + path.join(root, 'tools/render.html'));
await p.waitForFunction(() => window.GYM && GYM.anim3d && GYM.anim3d.Player3D, null, { timeout: 30000 });
if (mode === 'sheet') {
  await p.evaluate(list => sheet(list, [0, .5, 1]), ids);
  await p.waitForFunction(() => GYM.anim3d.pending() === 0, null, { timeout: 300000, polling: 500 });
  const out = path.join(root, 'media/planche.png');
  await p.screenshot({ path: out, fullPage: true }); console.log(out);
} else {
  const ffmpeg = process.env.FFMPEG || 'ffmpeg', dir = fs.mkdtempSync(path.join(root, 'media/.frames-'));
  await p.exposeFunction('saveFrame', (i, url) => fs.writeFileSync(path.join(dir, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64')));
  let n = 0;
  for (const id of (ids.length ? ids : ['squat', 'bench', 'pullup', 'lateral'])) { n += await p.evaluate(([id, s]) => clip(id, s, 1, 30), [id, n]); console.log(id, n); }
  const out = path.join(root, 'media/demo.mp4');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '30', '-i', path.join(dir, 'f%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  fs.rmSync(dir, { recursive: true, force: true }); console.log(out, n + ' images');
}
if (errors.length) { console.error(errors); process.exitCode = 1; }
await b.close();

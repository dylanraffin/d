/* Tests sans dépendance : node tests/run.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';

const js = f => fs.readFileSync(new URL('../app/js/' + f, import.meta.url), 'utf8');
function load(files) {
  const ctx = { window: {}, console, TextDecoder, DecompressionStream, performance, setTimeout, Blob, File };
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(js(f), ctx, { filename: f });
  return ctx.window.GYM;
}
const G = load(['core.js', 'anim.js', 'player.js', 'moves.js', 'moves-upper.js', 'moves-arms.js', 'program.js', 'foods.js', 'nutrition.js', 'health.js']);
let n = 0; const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; console.log('✓', name); });

const base = { sex: 'h', age: 30, height: 178, weight: 75, activity: 'leger', days: 4, sessionMin: 60, goal: 'bulk', level: 'inter', diet: 'omni', meals: 4, excl: [] };

await ok('besoins : Mifflin-St Jeor + activité + séances + surplus', () => {
  const T = G.nutri.targets(base);
  assert.equal(T.bmr, 1718); assert.equal(T.kcal, 2690); assert.equal(T.P, 135); assert.equal(T.F, 68); assert.equal(T.C, 366); assert.equal(T.fib, 38);
  assert.equal(G.nutri.targets({ ...base, weight: '' }), null);
});

await ok('plans de repas : 7 jours dans les cibles, tous régimes', () => {
  const cases = [base, { ...base, diet: 'pesc', meals: 3 }, { ...base, diet: 'vege', excl: ['lactose'], meals: 5 }, { ...base, diet: 'vegan', excl: ['gluten'], meals: 5, goal: 'lean' }, { ...base, sex: 'f', weight: 60, height: 165, goal: 'cut', meals: 3 }];
  for (const p of cases) {
    const T = G.nutri.targets(p);
    for (let d = 0; d < 7; d++) {
      const plan = G.nutri.dayPlan(p, T, G.addDays('2026-09-29', d));
      assert.ok(plan.meals.every(m => m.meal && m.items.length), 'repas manquant ' + JSON.stringify(p));
      assert.ok(Math.abs(plan.tot.p - T.P) <= 8, `protéines ${plan.tot.p.toFixed(0)} vs ${T.P} (${p.diet})`);
      assert.ok(Math.abs(plan.tot.kcal - T.kcal) / T.kcal < .06, `kcal ${plan.tot.kcal.toFixed(0)} vs ${T.kcal} (${p.diet})`);
    }
  }
});

await ok('bilan hebdo : +150 kcal si la prise est trop lente', () => {
  const T = G.nutri.targets(base), s = [];
  for (let i = 13; i >= 0; i--) s.push({ date: G.addDays('2026-09-29', -i), kg: 75 });
  const a = G.nutri.advice(base, T, G.nutri.trend(s, '2026-09-29'));
  assert.equal(a.adj, 150);
});

await ok('programme : 3 à 6 jours × matériel, exercices existants', () => {
  for (const days of [3, 4, 5, 6]) for (const equip of ['salle', 'halteres', 'pdc']) for (const level of ['debutant', 'inter', 'avance']) {
    const prog = G.program.build({ ...base, days, equip, level });
    assert.equal(prog.length, days);
    for (const d of prog) for (const it of d.items) assert.ok(G.moveById[it.move], it.move);
  }
});

await ok('double progression', () => {
  const it = { move: 'bench', sets: 3, reps: [6, 10], rir: 2 }, h = s => [{ date: '2026-09-20', sets: s }];
  assert.equal(G.program.suggest(it, h([{ kg: 60, reps: 10, rir: 2 }, { kg: 60, reps: 10, rir: 2 }, { kg: 60, reps: 10, rir: 1 }]), base).kg, 62.5);
  assert.equal(G.program.suggest(it, h([{ kg: 60, reps: 9 }, { kg: 60, reps: 8 }, { kg: 60, reps: 7 }]), base).reps, 10);
  assert.equal(G.program.suggest(it, [], base).kg, null);
  assert.deepEqual([...G.program.plates(100).perSide.map(p => p.kg)], [25, 15]);
});

await ok('animations : chaque pose est atteignable (mains et pieds à moins de 3 cm)', () => {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const m of G.moves) for (const u of [0, .25, .5, .75, 1]) {
    const J = G.anim.solve(m.pose(u));
    for (const v of Object.values(J)) if (Array.isArray(v) && v.length === 3) assert.ok(v.every(Number.isFinite), m.id + ' NaN');
    assert.ok(d(J.haR, J.handTarget[0]) < .03 && d(J.haL, J.handTarget[1]) < .03, `${m.id} u=${u} main hors de portée`);
    const p = Object.assign({}, G.anim.DEF, m.pose(u));
    assert.ok(d(J.ankR, [p.ax, p.ay, p.az]) < .03, `${m.id} u=${u} pied hors de portée`);
  }
  assert.ok(G.moves.length >= 35);
});

/* Petit écrivain ZIP (deflate) pour tester le lecteur en flux */
function zip(files) {
  const parts = [], cd = []; let off = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text), comp = zlib.deflateRawSync(data), nb = Buffer.from(name), crc = zlib.crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, nb, comp); cd.push(ch, nb); off += 30 + nb.length + comp.length;
  }
  const cdb = Buffer.concat(cd), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cdb.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdb, e]);
}

await ok('Apple Santé : export.zip lu en flux, sources dédoublonnées, sommeil sans « au lit »', async () => {
  const t = G.today(), y = G.addDays(t, -1), L = [];
  for (const [src, v] of [['iPhone', 6000], ['Apple Watch', 7000]]) L.push(`<Record type="HKQuantityTypeIdentifierStepCount" sourceName="${src}" unit="count" startDate="${y} 10:00:00 +0200" endDate="${y} 11:00:00 +0200" value="${v}"/>`);
  L.push(`<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone" startDate="${G.addDays(y, -1)} 23:00:00 +0200" endDate="${y} 07:30:00 +0200" value="HKCategoryValueSleepAnalysisInBed"/>`);
  L.push(`<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="${G.addDays(y, -1)} 23:30:00 +0200" endDate="${y} 06:30:00 +0200" value="HKCategoryValueSleepAnalysisAsleepCore"/>`);
  L.push(`<Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Balance" unit="lb" startDate="${y} 07:00:00 +0200" endDate="${y} 07:00:00 +0200" value="170"/>`);
  L.push(`<Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="3600" durationUnit="s" sourceName="Apple Watch" startDate="${y} 18:00:00 +0200" endDate="${y} 19:00:00 +0200">`, `<WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="400" unit="kcal"/>`, '</Workout>');
  const xml = '<?xml version="1.0"?>\n<HealthData>\n ' + L.join('\n ') + '\n</HealthData>\n';
  const file = new File([zip([['apple_health_export/export_cda.xml', '<x/>'], ['apple_health_export/export.xml', xml]])], 'export.zip');
  const r = await G.health.importFile(file);
  assert.equal(r.days[y].steps, 7000); assert.equal(r.days[y].sleep, 7); assert.equal(r.days[y].weight, 77.1);
  assert.equal(r.workouts[0].type, 'Musculation'); assert.equal(r.workouts[0].min, 60); assert.equal(r.workouts[0].kcal, 400);
  const pasted = G.health.parsePaste('{"date":"2026-09-29","poids":"78,4 kg","pas":8450,"fc_repos":"58","vfc":"42 ms","sommeil":432}');
  assert.deepEqual(JSON.parse(JSON.stringify(pasted['2026-09-29'])), { weight: 78.4, steps: 8450, rhr: 58, hrv: 42, sleep: 7.2 });
});

console.log(`\n${n} tests OK`);

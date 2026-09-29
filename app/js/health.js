/* Apple Santé : lecture de l'export (export.zip ou export.xml) entièrement dans le navigateur,
   en flux (fichiers de plusieurs centaines de Mo), + collage des données d'un Raccourci iOS.
   Rien n'est envoyé ailleurs : les agrégats quotidiens sont rangés dans la base de l'app. */
(function (G) {
  'use strict';
  const TYPES = {
    HKQuantityTypeIdentifierStepCount: 'steps', HKQuantityTypeIdentifierActiveEnergyBurned: 'active',
    HKQuantityTypeIdentifierBasalEnergyBurned: 'basal', HKQuantityTypeIdentifierRestingHeartRate: 'rhr',
    HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'hrv', HKQuantityTypeIdentifierBodyMass: 'weight',
    HKQuantityTypeIdentifierBodyFatPercentage: 'fat', HKQuantityTypeIdentifierVO2Max: 'vo2',
    HKQuantityTypeIdentifierDietaryEnergyConsumed: 'kcalIn', HKQuantityTypeIdentifierDietaryProtein: 'protIn',
    HKCategoryTypeIdentifierSleepAnalysis: 'sleep'
  };
  const SUM = new Set(['steps', 'active', 'basal', 'kcalIn', 'protIn']), AVG = new Set(['rhr', 'hrv', 'vo2']);
  const WK = { TraditionalStrengthTraining: 'Musculation', FunctionalStrengthTraining: 'Renforcement', HighIntensityIntervalTraining: 'HIIT', CoreTraining: 'Gainage',
    Running: 'Course', Walking: 'Marche', Cycling: 'Vélo', Swimming: 'Natation', Yoga: 'Yoga', Rowing: 'Rameur', Elliptical: 'Elliptique', StairClimbing: 'Escaliers',
    Hiking: 'Randonnée', Dance: 'Danse', Boxing: 'Boxe', CrossTraining: 'Cross-training', MixedCardio: 'Cardio', Pilates: 'Pilates', Other: 'Autre' };
  const STRENGTH = new Set(['Musculation', 'Renforcement', 'Gainage', 'Cross-training']);

  const attr = (s, n) => { const k = ' ' + n + '="', i = s.indexOf(k); if (i < 0) return null; const a = i + k.length; return s.slice(a, s.indexOf('"', a)); };
  const iso = s => s ? s.slice(0, 10) + 'T' + s.slice(11, 19) + (s.length >= 25 ? s.slice(20, 23) + ':' + s.slice(23, 25) : '') : null;
  const ms = s => Date.parse(iso(s));

  function newState(minDate) { return { minDate, acc: {}, sleep: {}, workouts: [], wk: null, n: 0 }; }
  const day = (st, d) => st.acc[d] || (st.acc[d] = {});

  function line(st, raw) {
    const s = raw.trimStart(); if (s.charCodeAt(0) !== 60) return;
    if (s.startsWith('<Record ')) {
      const key = TYPES[attr(s, 'type')]; if (!key) return;
      const start = attr(s, 'startDate'); if (!start) return;
      const src = attr(s, 'sourceName') || '?';
      if (key === 'sleep') {
        const v = attr(s, 'value') || ''; if (!v.includes('Asleep')) return;
        const end = attr(s, 'endDate'), night = end.slice(0, 10); if (night < st.minDate) return;
        const m = (ms(end) - ms(start)) / 6e4; if (!(m > 0)) return;
        const n = st.sleep[night] || (st.sleep[night] = {}); n[src] = (n[src] || 0) + m; st.n++; return;
      }
      const d = start.slice(0, 10); if (d < st.minDate) return;
      let v = parseFloat(attr(s, 'value')); if (!isFinite(v)) return;
      const unit = attr(s, 'unit');
      if (key === 'weight' && unit === 'lb') v *= .45359237;
      if (key === 'fat' && v <= 1) v *= 100;
      if (unit === 'kJ') v /= 4.184;
      const o = day(st, d); st.n++;
      if (SUM.has(key)) { const m = o[key] || (o[key] = {}); m[src] = (m[src] || 0) + v; }
      else if (AVG.has(key)) { const m = o[key] || (o[key] = { s: 0, n: 0 }); m.s += v; m.n++; }
      else { const t = ms(start); if (!o[key] || t < o[key].t) o[key] = { t, v }; }
      return;
    }
    if (s.startsWith('<Workout ')) {
      const start = attr(s, 'startDate'); if (!start || start.slice(0, 10) < st.minDate) { st.wk = null; return; }
      const type = (attr(s, 'workoutActivityType') || '').replace('HKWorkoutActivityType', '');
      let min = parseFloat(attr(s, 'duration')); const du = attr(s, 'durationUnit'); if (du === 's') min /= 60; if (du === 'h') min *= 60;
      st.wk = { date: start.slice(0, 10), time: start.slice(11, 16), type: WK[type] || type, min: Math.round(min) || null, kcal: Math.round(parseFloat(attr(s, 'totalEnergyBurned'))) || null, hr: null, src: attr(s, 'sourceName') };
      if (s.endsWith('/>')) { st.workouts.push(st.wk); st.wk = null; }
      return;
    }
    if (st.wk && s.startsWith('<WorkoutStatistics ')) {
      const t = attr(s, 'type');
      if (t === 'HKQuantityTypeIdentifierActiveEnergyBurned') st.wk.kcal = Math.round(parseFloat(attr(s, 'sum'))) || st.wk.kcal;
      if (t === 'HKQuantityTypeIdentifierHeartRate') st.wk.hr = Math.round(parseFloat(attr(s, 'average'))) || null;
      return;
    }
    if (st.wk && s.startsWith('</Workout>')) { st.workouts.push(st.wk); st.wk = null; }
  }

  /* Agrégats quotidiens : sommes par source puis maximum entre sources (évite de compter deux fois iPhone + Watch) */
  function finalize(st) {
    const days = {};
    for (const [d, o] of Object.entries(st.acc)) {
      const r = {};
      for (const [k, v] of Object.entries(o)) {
        if (SUM.has(k)) r[k] = Math.round(Math.max(...Object.values(v)));
        else if (AVG.has(k)) r[k] = +(v.s / v.n).toFixed(k === 'vo2' ? 1 : 0);
        else r[k] = +v.v.toFixed(1);
      }
      days[d] = r;
    }
    for (const [d, o] of Object.entries(st.sleep)) (days[d] = days[d] || {}).sleep = +(Math.max(...Object.values(o)) / 60).toFixed(1);
    return { days, workouts: st.workouts, records: st.n };
  }

  /* ---------- ZIP (y compris ZIP64) lu par morceaux ---------- */
  async function zipEntries(file) {
    const tailN = Math.min(file.size, 70000), tail = new DataView(await file.slice(file.size - tailN).arrayBuffer());
    let e = -1; for (let i = tailN - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw { code: 'notzip' };
    let count = tail.getUint16(e + 10, true), size = tail.getUint32(e + 12, true), off = tail.getUint32(e + 16, true);
    if (off === 0xFFFFFFFF || size === 0xFFFFFFFF || count === 0xFFFF) {
      const loc = e - 20;
      if (loc >= 0 && tail.getUint32(loc, true) === 0x07064b50) {
        const at = Number(tail.getBigUint64(loc + 8, true)), z = new DataView(await file.slice(at, at + 56).arrayBuffer());
        if (z.getUint32(0, true) === 0x06064b50) { count = Number(z.getBigUint64(32, true)); size = Number(z.getBigUint64(40, true)); off = Number(z.getBigUint64(48, true)); }
      }
    }
    const cd = new DataView(await file.slice(off, off + size).arrayBuffer()), dec = new TextDecoder(), out = [];
    let p = 0;
    while (p + 46 <= cd.byteLength && cd.getUint32(p, true) === 0x02014b50) {
      const method = cd.getUint16(p + 10, true), nl = cd.getUint16(p + 28, true), xl = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true);
      let cs = cd.getUint32(p + 20, true), us = cd.getUint32(p + 24, true), lo = cd.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl));
      let x = p + 46 + nl; const xe = x + xl;
      while (x + 4 <= xe) {
        const id = cd.getUint16(x, true), sz = cd.getUint16(x + 2, true);
        if (id === 1) { let q = x + 4; if (us === 0xFFFFFFFF) { us = Number(cd.getBigUint64(q, true)); q += 8; } if (cs === 0xFFFFFFFF) { cs = Number(cd.getBigUint64(q, true)); q += 8; } if (lo === 0xFFFFFFFF) lo = Number(cd.getBigUint64(q, true)); }
        x += 4 + sz;
      }
      out.push({ name, method, cs, us, lo }); p = xe + cl;
    }
    return out;
  }
  async function entryStream(file, en) {
    const h = new DataView(await file.slice(en.lo, en.lo + 30).arrayBuffer());
    if (h.getUint32(0, true) !== 0x04034b50) throw { code: 'notzip' };
    const start = en.lo + 30 + h.getUint16(26, true) + h.getUint16(28, true), raw = file.slice(start, start + en.cs).stream();
    if (en.method === 0) return raw;
    if (en.method !== 8) throw { code: 'method' };
    if (typeof DecompressionStream === 'undefined') throw { code: 'nodecomp' };
    return raw.pipeThrough(new DecompressionStream('deflate-raw'));
  }

  async function parseStream(stream, total, onProgress, minDate) {
    const rd = stream.getReader(), dec = new TextDecoder(), st = newState(minDate);
    let buf = '', seen = 0, last = 0;
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      seen += value.byteLength; buf += dec.decode(value, { stream: true });
      let a = 0, nl;
      while ((nl = buf.indexOf('\n', a)) >= 0) { line(st, buf.slice(a, nl)); a = nl + 1; }
      buf = buf.slice(a);
      const now = performance.now();
      if (onProgress && now - last > 200) { last = now; onProgress(Math.min(.99, seen / (total || 1))); await new Promise(r => setTimeout(r)); }
    }
    buf += dec.decode(); if (buf) line(st, buf);
    return finalize(st);
  }

  /* Point d'entrée : un fichier .zip (export complet) ou .xml (export décompressé) */
  async function importFile(file, onProgress, days = 400) {
    const minDate = G.addDays(G.today(), -days);
    if (/\.xml$/i.test(file.name)) return parseStream(file.stream(), file.size, onProgress, minDate);
    const entries = (await zipEntries(file)).filter(e => /\.xml$/i.test(e.name) && !/cda|electrocardiogram|ecg/i.test(e.name));
    if (!entries.length) throw { code: 'noxml' };
    const en = entries.sort((a, b) => b.us - a.us)[0];
    return parseStream(await entryStream(file, en), en.us, onProgress, minDate);
  }

  /* Rangement par mois : health/AAAA-MM = { days: {...}, workouts: [...] } */
  function toMonths(res, existing = {}) {
    const out = {};
    const get = m => out[m] || (out[m] = { days: Object.assign({}, existing[m]?.days || {}), workouts: [] });
    for (const [d, v] of Object.entries(res.days)) get(d.slice(0, 7)).days[d] = Object.assign({}, get(d.slice(0, 7)).days[d] || {}, v);
    for (const w of res.workouts) get(w.date.slice(0, 7)).workouts.push(w);
    for (const [m, v] of Object.entries(out)) {
      if (!res.workouts.some(w => w.date.startsWith(m))) v.workouts = existing[m]?.workouts || [];
      v.updatedAt = new Date().toISOString();
    }
    return out;
  }

  /* ---------- Raccourci iOS : JSON (ou « clé : valeur ») collé dans l'app ---------- */
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function parsePaste(text) {
    let rows; try { const o = JSON.parse(text); rows = Array.isArray(o) ? o : [o]; } catch (e) { rows = null; }
    if (!rows) { const o = {}; for (const l of String(text).split(/\n|;/)) { const m = l.match(/^\s*([^:=]+?)\s*[:=]\s*(.+)$/); if (m) o[m[1]] = m[2]; } rows = [o]; }
    const out = {};
    for (const o of rows) {
      if (!o || typeof o !== 'object') continue;
      let date = G.today(); const d = {};
      for (const [k0, v0] of Object.entries(o)) {
        const k = norm(k0);
        if (/date|jour|day/.test(k)) { const m = String(v0).match(/\d{4}-\d{2}-\d{2}/); if (m) date = m[0]; continue; }
        const v = typeof v0 === 'number' ? v0 : parseFloat(String(v0).replace(',', '.').replace(/[^\d.\-]/g, ''));
        if (!isFinite(v)) continue;
        if (/poids|weight|masse/.test(k)) d.weight = +v.toFixed(1);
        else if (/^pas$|step|pas_/.test(k)) d.steps = Math.round(v);
        else if (/actif|active/.test(k)) d.active = Math.round(v);
        else if (/(repos|basal|resting)/.test(k) && /(kcal|cal|energ)/.test(k)) d.basal = Math.round(v);
        else if (/vfc|hrv|variab/.test(k)) d.hrv = Math.round(v);
        else if (/fc|freq|heart|cardi/.test(k)) d.rhr = Math.round(v);
        else if (/sommeil|sleep/.test(k)) d.sleep = +(v > 24 ? v / 60 : v).toFixed(1);
        else if (/graisse|fat/.test(k)) d.fat = +(v <= 1 ? v * 100 : v).toFixed(1);
      }
      if (Object.keys(d).length) out[date] = Object.assign(out[date] || {}, d);
    }
    return out;
  }

  /* ---------- Lecture pour l'app ---------- */
  function flatDays(healthDocs) { const o = {}; for (const m of Object.values(healthDocs || {})) Object.assign(o, m.days || {}); return o; }
  function flatWorkouts(healthDocs) { return Object.values(healthDocs || {}).flatMap(m => m.workouts || []).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)); }
  function summary(healthDocs, today = G.today()) {
    const days = flatDays(healthDocs), keys = Object.keys(days).sort();
    if (!keys.length) return null;
    const win = (a, b) => keys.filter(d => d >= G.addDays(today, a) && d <= G.addDays(today, b)).map(d => days[d]);
    const avg = (arr, k) => { const v = arr.map(x => x[k]).filter(x => x > 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const l14 = win(-14, -1).filter(x => x.basal > 0 && x.active > 0);
    const tdee = l14.length ? l14.reduce((s, x) => s + x.basal + x.active, 0) / l14.length * 1.07 : null;
    const base = win(-30, -1), sd = (arr, k) => { const v = arr.map(x => x[k]).filter(x => x > 0); if (v.length < 5) return null; const m = v.reduce((s, x) => s + x, 0) / v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length); };
    const lastWith = k => { for (let i = keys.length - 1; i >= 0; i--) if (days[keys[i]][k] > 0) return { date: keys[i], v: days[keys[i]][k] }; return null; };
    return {
      from: keys[0], to: keys[keys.length - 1], nDays: keys.length, tdee: tdee && Math.round(tdee), tdeeDays: l14.length,
      steps7: avg(win(-7, -1), 'steps'), sleep7: avg(win(-7, 0), 'sleep'), sleepLast: lastWith('sleep'),
      rhr: lastWith('rhr'), rhrBase: avg(base, 'rhr'), hrv: lastWith('hrv'), hrvBase: avg(base, 'hrv'), hrvSd: sd(base, 'hrv'),
      vo2: lastWith('vo2'), weight: lastWith('weight'), days
    };
  }
  /* Indicateur de récupération (indicatif, pas un avis médical) */
  function recovery(s, today = G.today()) {
    if (!s) return null;
    const fresh = x => x && x.date >= G.addDays(today, -1);
    const sl = fresh(s.sleepLast) ? s.sleepLast.v : null, hrv = fresh(s.hrv) ? s.hrv.v : null, rhr = fresh(s.rhr) ? s.rhr.v : null;
    if (sl == null && hrv == null && rhr == null) return { level: 'unknown', text: 'Pas de données récentes de sommeil ou de fréquence cardiaque.' };
    let score = 0; const why = [];
    if (sl != null) { if (sl < 6) { score -= 2; why.push(`sommeil court (${String(sl).replace('.', ',')} h)`); } else if (sl >= 7) score += 1; }
    if (hrv != null && s.hrvBase) { const r = hrv / s.hrvBase; if (r < .8) { score -= 1; why.push('VFC basse'); } else if (r >= 1) score += 1; }
    if (rhr != null && s.rhrBase) { if (rhr > s.rhrBase + 5) { score -= 1; why.push('FC au repos élevée'); } }
    if (score <= -2) return { level: 'low', text: `Récupération basse (${why.join(', ')}). Garde tes charges mais retire une série par exercice, ou vise 1 rep de plus en réserve.` };
    if (score < 0) return { level: 'mid', text: `Récupération moyenne (${why.join(', ')}). Entraîne-toi normalement, sans aller à l’échec.` };
    return { level: 'good', text: 'Bonne récupération : séance normale, vise tes objectifs de progression.' };
  }

  G.health = { importFile, toMonths, parsePaste, flatDays, flatWorkouts, summary, recovery, STRENGTH, _line: line, _newState: newState, _finalize: finalize };
})(window.GYM = window.GYM || {});

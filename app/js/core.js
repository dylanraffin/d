/* Socle : dates, formats, et stockage.
   Dans Claude : base de données de l'artefact (privée, synchronisée entre tes appareils, lisible par Claude).
   Ailleurs (fichier ouvert en local) : repli sur le stockage du navigateur. */
(function (G) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const isoLocal = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  G.today = () => isoLocal(new Date());
  G.addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); };
  G.daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
  G.weekStart = s => { const d = new Date(s + 'T12:00:00'), k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return isoLocal(d); };
  const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  G.fmtDate = (s, o = {}) => { if (!s) return ''; const d = new Date(s + 'T12:00:00'); return (o.wd === false ? '' : DAYS[d.getDay()] + ' ') + d.getDate() + ' ' + MONTHS[d.getMonth()] + (o.y ? ' ' + d.getFullYear() : ''); };
  G.relDate = s => { const t = G.today(); if (s === t) return 'aujourd’hui'; if (s === G.addDays(t, -1)) return 'hier'; if (s === G.addDays(t, 1)) return 'demain'; return G.fmtDate(s); };
  G.num = (x, d = 0) => (x == null || !isFinite(x)) ? '–' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  G.kg = x => x == null || x === '' ? '–' : G.num(x, Number.isInteger(+x) ? 0 : (Math.round(x * 10) === x * 10 ? 1 : 2));
  G.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  G.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  G.clone = o => JSON.parse(JSON.stringify(o));
  G.ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };

  /* ---------- Stockage ---------- */
  const COLS = ['profile', 'sessions', 'days', 'health', 'drafts'];
  const empty = () => ({ profile: {}, sessions: {}, days: {}, health: {}, drafts: {} });
  const S = {
    mode: 'init', data: empty(), ready: false, db: null, listeners: [], pending: {}, inflight: {}, loaded: {},
    local: null, localHasData: false,
    on(fn) { this.listeners.push(fn); },
    emit(what) { for (const f of this.listeners) try { f(what); } catch (e) { console.error(e); } },
    get profile() { return this.data.profile.main || null; },
    get draft() { return this.data.drafts.current || null; },
    sessionsList() { return Object.entries(this.data.sessions).map(([id, s]) => Object.assign({ id }, s)).sort((a, b) => (a.date + (a.endedAt || '')).localeCompare(b.date + (b.endedAt || ''))); },
    async init() {
      this.local = G.ls.get('gym.v1.local', null);
      this.localHasData = !!(this.local && (Object.keys(this.local.sessions || {}).length || this.local.profile?.main));
      const cache = G.ls.get('gym.v1.cache', null);
      this.data = Object.assign(empty(), cache || this.local || {});
      this.emit('boot');
      let db = null;
      try { db = window.claude && window.claude.use ? await window.claude.use('db') : null; } catch (e) { db = null; }
      if (!db) { this.mode = 'local'; this.data = Object.assign(empty(), this.local || {}); this.ready = true; this.emit('mode'); return; }
      this.db = db; this.mode = 'cloud';
      for (const c of COLS) {
        db.collection(c).onSnapshot(snap => {
          const o = {}; for (const d of snap.docs) o[d.id] = d.data();
          for (const [id, w] of Object.entries(this.pending)) if (id.startsWith(c + '/')) { const k = id.slice(c.length + 1); if (w === null) delete o[k]; else o[k] = w; }
          this.data[c] = o; this.loaded[c] = true;
          if (COLS.every(x => this.loaded[x])) { this.ready = true; this.saveCache(); }
          this.emit(c);
        }, err => { console.warn('db', c, err && err.code); if (err && (err.code === 'revoked' || err.code === 'not_granted')) { this.mode = 'readonly'; this.emit('mode'); } });
      }
    },
    saveCache() { if (this.mode === 'cloud') G.ls.set('gym.v1.cache', this.data); else G.ls.set('gym.v1.local', this.data); },
    /* Écriture : état local immédiat, puis une écriture à la fois par document (la dernière version gagne) */
    put(col, id, doc) {
      this.data[col] = Object.assign({}, this.data[col], { [id]: doc });
      this.emit(col);
      if (this.mode !== 'cloud') { this._debouncedLocal(); return Promise.resolve(); }
      return this._write(col + '/' + id, doc);
    },
    del(col, id) {
      const o = Object.assign({}, this.data[col]); delete o[id]; this.data[col] = o; this.emit(col);
      if (this.mode !== 'cloud') { this._debouncedLocal(); return Promise.resolve(); }
      return this._write(col + '/' + id, null);
    },
    _write(path, doc) {
      this.pending[path] = doc;
      if (this.inflight[path]) return this.inflight[path];
      const run = async () => {
        while (path in this.pending) {
          const d = this.pending[path]; delete this.pending[path];
          try {
            if (d === null) await this.db.doc(path).delete(); else await this.db.doc(path).set(JSON.parse(JSON.stringify(d)));
          } catch (e) {
            if (e && e.code === 'unavailable') { await new Promise(r => setTimeout(r, 800 + Math.random() * 800)); if (!(path in this.pending)) this.pending[path] = d; continue; }
            G.toast?.(e && e.code === 'quota_exceeded' ? 'Stockage plein : exporte puis supprime d’anciennes données.' : 'Enregistrement impossible (' + (e && e.code || 'erreur') + ').', 'bad');
            if (e && e.code === 'invalid_argument') { this.mode = 'readonly'; this.emit('mode'); }
          }
        }
        delete this.inflight[path]; this.saveCache();
      };
      return (this.inflight[path] = run());
    },
    _t: 0,
    _debouncedLocal() { clearTimeout(this._t); this._t = setTimeout(() => G.ls.set('gym.v1.local', this.data), 250); },
    exportAll() { return JSON.stringify({ app: 'gym-d', version: 1, exportedAt: new Date().toISOString(), data: this.data }, null, 1); },
    async importAll(json) {
      const o = typeof json === 'string' ? JSON.parse(json) : json, d = o.data || o;
      for (const c of COLS) for (const [id, doc] of Object.entries(d[c] || {})) await this.put(c, id, doc);
    }
  };
  G.store = S;
})(window.GYM = window.GYM || {});

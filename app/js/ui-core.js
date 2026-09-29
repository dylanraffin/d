/* Interface : coque, rendu, délégation d'événements, feuille modale, notifications. */
(function (G) {
  'use strict';
  const U = G.ui = {
    tab: G.ls.get('gym.tab', 'seance'), view: null, nutriDate: null, progMove: null, table: {}, lib: { g: 'all', e: 'all', q: '' },
    pick: {}, food: { q: '', id: null, g: 100 }, coach: { busy: false, text: '', err: '', q: '' }, rest: null, healthMsg: ''
  };
  G.views = {}; G.binds = {}; G.act = {}; G.cap = { sample: null, downloads: null };

  const I = {
    dumbbell: '<path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"/>',
    chart: '<path d="M4 19h16M6 16l4-5 3 3 5-7"/>',
    fork: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1.5-2.5 4-2.5 7h3V21M16.5 3v7"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    pause: '<path d="M9 6v12M15 6v12"/>', play2: '<path d="M8 5.5v13l11-6.5z"/>', left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
    swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>', heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'
  };
  G.icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n] || ''}</svg>`;
  const TABS = [['seance', 'Séance', 'dumbbell'], ['progres', 'Progrès', 'chart'], ['nutrition', 'Nutrition', 'fork'], ['mouvements', 'Mouvements', 'play'], ['coach', 'Coach', 'spark']];

  G.hasProfile = () => { const p = G.store.profile; return !!(p && +p.weight && +p.height && +p.age); };
  G.EXAMPLE_PROFILE = { name: '', sex: 'h', age: 30, height: 178, weight: 75, level: 'inter', days: 4, sessionMin: 60, equip: 'salle', activity: 'leger', goal: 'bulk', diet: 'omni', excl: [], meals: 4, start: null };
  G.profileOrExample = () => G.hasProfile() ? G.store.profile : Object.assign({}, G.EXAMPLE_PROFILE, { start: G.today() });

  function shell(inner) {
    const mode = G.store.mode, p = G.store.profile;
    const chip = mode === 'cloud' ? '<span class="mode cloud" title="Données enregistrées dans la base privée de l’app, synchronisées entre tes appareils">● Synchronisé</span>'
      : mode === 'local' ? '<span class="mode" title="Données enregistrées dans ce navigateur uniquement">Local</span>'
        : mode === 'readonly' ? '<span class="mode">Lecture seule</span>' : '<span class="mode">…</span>';
    const onProfile = U.view === 'profil';
    return `<header class="top"><div class="top-in"><div class="brand"><span class="brand-plate" aria-hidden="true"></span>Training Coach</div>${chip}
      <button class="icon-btn" data-act="go-profile" aria-pressed="${onProfile}" aria-label="Profil et réglages">${G.icon('user')}</button></div></header>
      <main id="main">${inner}</main>
      <nav class="nav" aria-label="Sections">${TABS.map(([k, l, ic]) => `<button data-act="tab" data-v="${k}" ${U.tab === k && !U.view ? 'aria-current="page"' : ''}>${G.icon(ic)}<span>${l}</span></button>`).join('')}</nav>
      ${U.rest ? restBar() : ''}`;
  }
  function restBar() { return `<div class="rest" id="rest" role="timer" aria-live="off"><span class="rest-t" id="rest-t">0:00</span><span class="rest-bar"><i id="rest-i"></i></span><button data-act="rest-add">+30 s</button><button data-act="rest-stop">OK</button></div>`; }

  let raf = 0, lastHtml = '';
  G.render = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderNow(); }); };
  function renderNow() {
    const root = document.getElementById('app'); if (!root) return;
    const key = U.view || U.tab, view = G.views[key];
    let html;
    try { html = shell(view ? view() : ''); } catch (e) { console.error(e); html = shell(`<div class="card"><p>Erreur d’affichage : ${G.esc(e.message)}</p></div>`); }
    if (html === lastHtml) return;
    const a = document.activeElement, fid = a && a.id, s0 = a && a.selectionStart, s1 = a && a.selectionEnd;
    root.innerHTML = html; lastHtml = html;
    try { (G.binds[key] || (() => {}))(root); } catch (e) { console.error(e); }
    root.querySelectorAll('canvas[data-still]').forEach(c => { const m = G.moveById[c.dataset.still]; if (m) try { G.animStill(c, m, +(c.dataset.u || .55)); } catch (e) { console.error(e); } });
    if (fid) { const n = document.getElementById(fid); if (n) { n.focus({ preventScroll: true }); try { if (s0 != null) n.setSelectionRange(s0, s1); } catch (e) { /* type sans sélection */ } } }
    tickRest();
  }
  G.forceRender = () => { lastHtml = ''; G.render(); };

  /* Délégation : data-act="nom" → G.act.nom(el, event) */
  function dispatch(ev) {
    const el = ev.target.closest('[data-act]'); if (!el) return;
    const kind = el.dataset.on || (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'file' ? 'change' : el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? 'input' : 'click');
    if (kind !== ev.type) return;
    const fn = G.act[el.dataset.act]; if (!fn) return;
    if (ev.type === 'click' && (el.tagName === 'A' ? !el.href.startsWith('http') : true)) ev.preventDefault();
    fn(el, ev);
  }
  for (const t of ['click', 'input', 'change']) document.addEventListener(t, dispatch);
  document.addEventListener('submit', ev => ev.preventDefault());

  G.act.tab = el => { U.tab = el.dataset.v; U.view = null; G.ls.set('gym.tab', U.tab); window.scrollTo(0, 0); G.render(); };
  G.act['go-profile'] = () => { U.view = U.view === 'profil' ? null : 'profil'; window.scrollTo(0, 0); G.render(); };

  /* Feuille modale (hors du rendu principal pour ne pas couper les animations) */
  G.openSheet = (html, bind, onClose) => {
    G.closeSheet();
    const d = document.createElement('div'); d.className = 'sheet'; d.id = 'sheet';
    d.innerHTML = `<div class="sheet-p" role="dialog" aria-modal="true">${html}</div>`;
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) G.closeSheet(); });
    document.body.appendChild(d); d._onClose = onClose; document.body.style.overflow = 'hidden';
    if (bind) bind(d);
    const f = d.querySelector('[data-close]'); if (f) f.focus({ preventScroll: true });
  };
  G.closeSheet = () => { const d = document.getElementById('sheet'); if (!d) return; d._onClose && d._onClose(); d.remove(); document.body.style.overflow = ''; };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') G.closeSheet(); });

  let tt = 0;
  G.toast = (msg, kind = '') => {
    let t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.className = 'toast ' + kind; t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 3200);
  };

  /* Minuteur de repos */
  G.startRest = sec => { U.rest = { end: Date.now() + sec * 1000, total: sec * 1000 }; G.render(); };
  G.act['rest-add'] = () => { if (U.rest) { U.rest.end += 30000; U.rest.total += 30000; } };
  G.act['rest-stop'] = () => { U.rest = null; G.render(); };
  function tickRest() {
    if (!U.rest) return;
    const left = Math.max(0, U.rest.end - Date.now()), t = document.getElementById('rest-t'), i = document.getElementById('rest-i');
    if (t) t.textContent = Math.floor(left / 60000) + ':' + String(Math.floor(left / 1000) % 60).padStart(2, '0');
    if (i) i.style.width = (100 - left / U.rest.total * 100) + '%';
    if (left <= 0) { try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { /* non supporté */ } U.rest = null; G.toast('Repos terminé : série suivante.', 'good'); G.render(); }
  }
  setInterval(tickRest, 250);

  /* Petits composants */
  G.meter = (label, v, target, unit = '', d = 0) => {
    const pct = target ? Math.min(100, v / target * 100) : 0, over = target && v > target * 1.08;
    return `<div class="meter ${over ? 'over' : ''}"><div class="meter-h"><span>${label}</span><b>${G.num(v, d)} / ${G.num(target, d)}${unit}</b></div><div class="meter-t"><i style="width:${pct}%"></i></div></div>`;
  };
  G.thumb = (id, u = .55) => `<button class="thumb" data-act="open-move" data-id="${id}" aria-label="Voir l’animation : ${G.esc(G.moveById[id]?.name || id)}"><canvas data-still="${id}" data-u="${u}" width="152" height="120"></canvas></button>`;
  G.plateChips = kg => {
    const r = G.program.plates(kg); if (!r || !r.perSide.length) return '';
    return `<span class="plates">Par côté : ${r.perSide.map(p => `<span class="plate ${p.kg === 5 || p.kg === 1.25 ? 'light' : ''}" style="background:${p.color}">${G.kg(p.kg)}</span>`).join('')}${r.rest ? ` <span>(+${G.kg(r.rest)} kg)</span>` : ''}</span>`;
  };
  G.copyText = async (text, okMsg = 'Copié.') => {
    try { await navigator.clipboard.writeText(text); G.toast(okMsg, 'good'); return true; } catch (e) { G.toast('Copie refusée : sélectionne le texte et copie-le à la main.'); return false; }
  };
  G.saveFile = async (filename, data, fallbackEl) => {
    if (G.cap.downloads) { try { await G.cap.downloads.save({ filename, data }); G.toast('Fichier prêt.', 'good'); return; } catch (e) { if (e && e.code === 'declined') return; } }
    if (fallbackEl && typeof data === 'string') { fallbackEl.hidden = false; fallbackEl.value = data; fallbackEl.select(); G.toast('Copie le contenu affiché.'); }
    else G.toast('Téléchargement indisponible ici.');
  };
})(window.GYM = window.GYM || {});

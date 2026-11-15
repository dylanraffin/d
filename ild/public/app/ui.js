// Outils d'interface partagés par les écrans de l'app membre.
import { api, h, icon, toast } from '/shared/lib.js';
import { LANGS, getLang, setLang, locale } from '/shared/i18n.js';

export const state = { me: null, meta: null, mode: 'dating', filters: {}, aroundView: 'grid', cleanup: [], navItems: null, navExtra: null, lastNav: null };

// L'édition « carte en direct » remplace la barre de navigation.
export function setNav(items, extra) { state.navItems = items; state.navExtra = extra || null; }
export const brand = () => state.meta?.brand || { name: 'ILD', plus: 'ILD+' };
export const isLive = () => state.meta?.edition === 'cruise';
// Écran large (ordinateur, tablette en paysage) : navigation en haut, panneaux latéraux.
export const isWide = () => window.matchMedia('(min-width: 900px)').matches;
export const root = document.getElementById('app');

export const clean = (list) => list.flat(Infinity).filter((n) => n != null && n !== false);
export function mount(...nodes) {
  const list = clean(nodes);
  // Sur grand écran, un membre garde la navigation en haut de chaque page, même celles qui n'en ont pas sur téléphone.
  let hasNav = list.some((n) => n.classList?.contains('nav'));
  if (!hasNav && state.me?.status === 'member' && state.me.role !== 'admin' && !state.me.legal?.needs_consent) {
    const bar = nav(state.lastNav);
    bar.classList.add('desk-only');
    list.push(bar);
    hasNav = true;
  }
  document.body.classList.toggle('has-nav', hasNav);
  root.replaceChildren(...list);
  window.scrollTo(0, 0);
}
export function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }
export function onLeave(fn) { state.cleanup.push(fn); }
export function runCleanup() { state.cleanup.splice(0).forEach((fn) => { try { fn(); } catch { /* déjà nettoyé */ } }); }

export async function run(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    if (e.status === 402) toast(`${e.message} Voir ${brand().plus} dans Moi.`, true);
    else toast(e.message, true);
    e.handled = true; // déjà affiché : l'app ne le signale pas une seconde fois
    throw e;
  }
}

export async function refreshMe() {
  try { state.me = await api('GET', '/api/me'); } catch (e) { if (e.status === 401) state.me = null; else throw e; }
  return state.me;
}

export const label = (group, code) => (state.meta?.[group] || {})[code] || code;

export function backBtn(hash, text = 'Retour') {
  return h('a', { class: 'icon-btn', href: hash, 'aria-label': text }, icon('back'));
}

export function photoEl(id, initial) {
  return h('div', { class: 'thumb' },
    id ? h('img', { src: `/photos/${id}`, alt: '', loading: 'lazy', oncontextmenu: (e) => e.preventDefault() })
      : h('span', { class: 'thumb-initial' }, (initial || '?')[0]));
}

export function avatar(id, name, size) {
  return h('span', { class: 'avatar', style: size ? { width: `${size}px`, height: `${size}px`, borderRadius: `${size / 2}px` } : null },
    id ? h('img', { src: `/photos/${id}`, alt: '' }) : (name || '?')[0]);
}

// Groupe de puces sélectionnables. options : objet {code: libellé} ou tableau de libellés.
export function chips(options, selected, { single = false, max = 50, ariaLabel, onChange } = {}) {
  const entries = Array.isArray(options) ? options.map((o) => [o, o]) : Object.entries(options);
  const set = new Set(selected || []);
  const box = h('div', { class: 'chips', role: 'group', 'aria-label': ariaLabel || null });
  const draw = () => box.replaceChildren(...entries.map(([code, text]) => h('button', {
    type: 'button', class: 'chip-btn', 'aria-pressed': String(set.has(code)),
    onclick: () => {
      if (set.has(code)) set.delete(code);
      else {
        if (single) set.clear();
        if (set.size >= max) { toast(`${max} choix maximum.`, true); return; }
        set.add(code);
      }
      draw();
      onChange?.([...set]);
    }
  }, text)));
  draw();
  return { el: box, values: () => [...set], value: () => [...set][0] || null };
}

export function select(options, value, attrs = {}) {
  return h('select', { class: 'input', ...attrs }, Object.entries(options).map(([k, v]) => h('option', { value: k, selected: k === value }, v)));
}

// Panneau : feuille qui monte du bas sur téléphone, volet à droite sur grand écran.
export function sheet(content, { className = '' } = {}) {
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); };
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } },
    h('div', { class: `sheet ${className}`.trim(), role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'grab' }),
      h('button', { class: 'icon-btn sheet-close', 'aria-label': 'Fermer', onclick: () => close() }, icon('close', 18)),
      ...clean(content(close))));
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  return close;
}

export function nav(active) {
  const items = state.navItems || [
    ['discover', '#/discover', 'card', 'Découvrir'],
    ['around', '#/around', 'map', 'Autour'],
    ['tonight', '#/tonight', 'moon', 'Ce soir'],
    ['messages', '#/messages', 'chat', 'Messages'],
    ['me', '#/me', 'user', 'Moi']
  ];
  const me = state.me || {};
  const badge = (me.vouch_requests || []).length || me.album_requests || me.notices_unread;
  state.lastNav = active || state.lastNav;
  return h('nav', { class: 'nav', 'aria-label': 'Navigation' },
    h('a', { class: 'nav-brand', href: items[0][1] }, brand().name),
    items.map(([k, href, ic, text]) =>
      h('a', { href, class: active === k ? 'on' : '', 'aria-current': active === k ? 'page' : null },
        icon(ic, 22), text, k === 'me' && badge ? h('span', { class: 'dot', 'aria-label': 'Nouveau' }) : null)),
    state.navExtra ? h('div', { class: 'nav-extra' }, state.navExtra()) : null);
}

export function reportSheet(targetType, targetId, what) {
  sheet((close) => {
    const reason = select(state.meta.report_reasons, 'harassment', { 'aria-label': 'Motif' });
    const details = h('textarea', { class: 'input', placeholder: "Ce qui s'est passé (facultatif)", maxlength: 1000, 'aria-label': 'Détails' });
    return [
      h('h2', null, `Signaler ${what}`),
      h('p', { class: 'small' }, "Une copie sécurisée est transmise à l'équipe de modération. La personne n'est pas prévenue que c'est toi."),
      reason, details,
      h('button', { class: 'btn primary block', onclick: async () => {
        await run(() => api('POST', '/api/reports', { target_type: targetType, target_id: targetId, reason: reason.value, details: details.value }), 'Signalement envoyé. Merci.');
        close();
      } }, 'Envoyer le signalement'),
      h('button', { class: 'btn ghost', onclick: close }, 'Annuler')
    ];
  });
}

export async function logout() {
  await api('POST', '/api/auth/logout', {}).catch(() => {});
  state.me = null;
  go('#/');
}

export function deleteAccount() {
  sheet((close) => {
    const pass = h('input', { type: 'password', class: 'input', placeholder: 'Ton mot de passe', autocomplete: 'current-password', 'aria-label': 'Mot de passe' });
    return [h('h2', null, 'Supprimer mon compte'),
      h('p', { class: 'small' }, 'Ton profil, tes photos, tes albums, tes matchs et tes messages sont supprimés définitivement. Les signalements te concernant sont conservés pour la sécurité des membres.'),
      pass,
      h('button', { class: 'btn danger-fill block', onclick: async () => {
        await run(() => api('DELETE', '/api/me', { password: pass.value }), 'Compte supprimé.');
        close(); state.me = null; go('#/');
      } }, 'Supprimer définitivement'),
      h('button', { class: 'btn ghost', onclick: close }, 'Annuler')];
  });
}

// Se placer sans GPS : une ville dans le monde, ou un quartier de Paris.
export function placeSelect() {
  const m = state.meta;
  const el = h('select', { class: 'input', 'aria-label': 'Ville ou quartier' },
    h('option', { value: '' }, 'Choisir une ville…'),
    h('optgroup', { label: 'Paris, par quartier' }, m.neighborhoods.map((n) => h('option', { value: `hood:${n}` }, n))),
    h('optgroup', { label: 'Villes' }, m.cities.map((c) => h('option', { value: `city:${c}` }, c))));
  return {
    el,
    body: () => (el.value.startsWith('hood:') ? { neighborhood: el.value.slice(5) } : el.value.startsWith('city:') ? { city: el.value.slice(5) } : null)
  };
}
export function placeLabel(me) {
  if (!me.location.enabled) return 'Désactivée';
  if (me.location.source === 'gps') return 'Activée';
  return me.location.source === 'city' ? `Ville : ${me.city || ''}` : `Quartier : ${me.neighborhood || ''}`;
}

// Choix de la langue : enregistré sur l'appareil, appliqué tout de suite.
export function langSwitch() {
  return h('p', { class: 'small center legal-links', role: 'group', 'aria-label': 'Langue' }, Object.entries(LANGS).map(([code, name], i) => [i ? ' · ' : '',
    code === getLang() ? h('b', { class: 'text' }, name) : h('a', { href: location.hash || '#/', lang: code, onclick: (e) => {
      e.preventDefault(); setLang(code); window.dispatchEvent(new HashChangeEvent('hashchange'));
    } }, name)]));
}

export function legalLinks() {
  const docs = [['cgu', 'Conditions d\'utilisation'], ['confidentialite', 'Confidentialité'], ['charte', 'Charte'], ['mentions', 'Mentions légales'], ['signaler', 'Signaler un contenu']];
  return h('p', { class: 'small center legal-links' }, docs.map(([k, v], i) => [i ? ' · ' : '', h('a', { href: `/legal/${k}`, target: '_blank', rel: 'noopener' }, v)]));
}

// ---------- fiche cruising : résumé, statut, lignes détaillées ----------
export const hhmm = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
export function monthLabel(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'short', year: 'numeric' });
}

// « 185 cm · 73 kg · Musclé · Actif »
export function personSummary(x) {
  const s = x.stats || {};
  return [s.height_cm ? `${s.height_cm} cm` : null, s.weight_kg ? `${s.weight_kg} kg` : null,
    s.body_type ? label('body_types', s.body_type) : null, x.position ? label('positions', x.position) : null].filter(Boolean).join(' · ');
}

export function presenceText(p) {
  return `Dispo jusqu'à ${hhmm(p.until)}${p.place ? ` · ${label('presence_places', p.place)}` : ''}${p.note ? ` · « ${p.note} »` : ''}`;
}

export function statusLine(x) {
  const parts = [];
  if (x.online === 'now') parts.push(h('span', null, h('span', { class: 'dot-on', 'aria-hidden': 'true' }), 'En ligne'));
  else if (x.online === 'recent') parts.push(h('span', null, h('span', { class: 'dot-recent', 'aria-hidden': 'true' }), 'Vu récemment'));
  if (x.distance) parts.push(h('span', null, x.distance));
  if (x.trip) parts.push(h('span', { class: 'tag-blue' }, `En voyage : ${x.trip.label}`));
  if (x.new_profile) parts.push(h('span', { class: 'badge-new' }, 'Nouveau profil'));
  return parts.length ? h('div', { class: 'status-line' }, parts) : null;
}

// Lignes « Lieu / Ambiance / Style / Pratiques / Santé » : seulement ce que la personne a rempli et choisi de montrer.
export function cruiseRows(p) {
  const rows = [];
  const add = (k, v) => { if (v) rows.push(h('div', null, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v))); };
  const names = (group, codes) => (codes || []).map((c) => label(group, c)).join(' · ');
  add('Lieu', names('can', p.can));
  add('Ambiance', names('vibes', p.vibes));
  add('Style', [p.stats?.identity ? label('identities', p.stats.identity) : null, ...(p.tribes || [])].filter(Boolean).join(' · '));
  const size = p.endowment ? [p.endowment.cm ? `${p.endowment.cm} cm` : null, p.endowment.cut ? label('cut', p.endowment.cut).toLowerCase() : null].filter(Boolean).join(', ') : null;
  add('Pratiques', [names('safer', p.safer), size].filter(Boolean).join(' · '));
  add('Santé', p.health ? [p.health.hiv_status ? label('hiv_status', p.health.hiv_status) : null,
    p.health.last_test ? `dépistage : ${monthLabel(p.health.last_test)}` : null].filter(Boolean).join(' · ') : null);
  return rows.length ? h('div', { class: 'kv' }, rows) : null;
}

export const euros = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;

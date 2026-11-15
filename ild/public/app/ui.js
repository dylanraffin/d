// Outils d'interface partagés par les écrans de l'app membre.
import { api, h, icon, toast } from '/shared/lib.js';

export const state = { me: null, meta: null, mode: 'dating', filters: {}, aroundView: 'grid', cleanup: [], navItems: null };

// L'édition « carte en direct » remplace la barre de navigation.
export function setNav(items) { state.navItems = items; }
export const brand = () => state.meta?.brand || { name: 'ILD', plus: 'ILD+' };
export const isLive = () => state.meta?.edition === 'cruise';
export const root = document.getElementById('app');

export const clean = (list) => list.flat(Infinity).filter((n) => n != null && n !== false);
export function mount(...nodes) { root.replaceChildren(...clean(nodes)); window.scrollTo(0, 0); }
export function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }
export function onLeave(fn) { state.cleanup.push(fn); }
export function runCleanup() { state.cleanup.splice(0).forEach((fn) => { try { fn(); } catch { /* déjà nettoyé */ } }); }

export async function run(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    if (e.status === 402) toast(`${e.message} Voir ILD+ dans Moi.`, true);
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

export function sheet(content) {
  const close = () => backdrop.remove();
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'grab' }), ...clean(content(close))));
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
  return h('nav', { class: 'nav', 'aria-label': 'Navigation' }, items.map(([k, href, ic, text]) =>
    h('a', { href, class: active === k ? 'on' : '', 'aria-current': active === k ? 'page' : null },
      icon(ic, 22), text, k === 'me' && badge ? h('span', { class: 'dot', 'aria-label': 'Nouveau' }) : null)));
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

export function legalLinks() {
  const docs = [['cgu', 'Conditions d\'utilisation'], ['confidentialite', 'Confidentialité'], ['charte', 'Charte'], ['mentions', 'Mentions légales'], ['signaler', 'Signaler un contenu']];
  return h('p', { class: 'small center legal-links' }, docs.map(([k, v], i) => [i ? ' · ' : '', h('a', { href: `/legal/${k}`, target: '_blank', rel: 'noopener' }, v)]));
}

export const euros = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;

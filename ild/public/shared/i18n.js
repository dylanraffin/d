// Traduction de l'interface. Le français est la langue du code ; chaque autre langue est un dictionnaire
// « texte français → traduction » appliqué au moment où un texte est affiché (voir h() dans lib.js).
// Les contenus écrits par les membres (messages, présentations, titres de plans) passent par raw() et ne sont jamais traduits.
import en from './i18n/en.js';

const DICTS = { en };
export const LANGS = { fr: 'Français', en: 'English' };
let lang = 'fr';
let compiled = [];
const missing = new Set();

function detect() {
  try {
    const saved = localStorage.getItem('lang');
    if (saved && LANGS[saved]) return saved;
  } catch { /* stockage indisponible */ }
  return (navigator.language || 'fr').slice(0, 2).toLowerCase() === 'fr' ? 'fr' : 'en';
}

export function setLang(code, { save = true } = {}) {
  lang = LANGS[code] ? code : 'fr';
  compiled = lang === 'fr' ? [] : (DICTS[lang].patterns || []).map(([re, to]) => [new RegExp(re), to]);
  document.documentElement.lang = lang;
  if (save) { try { localStorage.setItem('lang', lang); } catch { /* stockage indisponible */ } }
}
export const getLang = () => lang;
export const locale = () => (lang === 'fr' ? 'fr-FR' : 'en-GB');

// Traduit un texte d'interface : correspondance exacte, puis motifs (« Dispo jusqu'à 19:30 »),
// puis morceau par morceau pour les lignes composées avec « · ».
export function tr(text) {
  if (lang === 'fr' || typeof text !== 'string') return text;
  const core = text.trim();
  if (!core) return text;
  const d = DICTS[lang];
  const exact = d.strings[core];
  if (exact !== undefined) return text.replace(core, () => exact);
  for (const [re, to] of compiled) {
    const m = re.exec(core);
    if (m) return text.replace(core, () => to.replace(/\$(\d)/g, (_, n) => tr(m[Number(n)] ?? '')));
  }
  if (core.includes(' · ')) return text.replace(core, () => core.split(' · ').map(tr).join(' · '));
  if (/[A-Za-zÀ-ÿ]{3}/.test(core)) missing.add(core);
  return text;
}

// Aide au développement : textes affichés sans traduction dans la langue courante.
export const untranslated = () => [...missing];
window.__i18nMissing = untranslated;

setLang(detect(), { save: false });

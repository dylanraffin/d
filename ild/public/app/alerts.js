// Alertes de nouveaux messages : un son (réglage « Sons ») et une notification du navigateur
// (réglage « Autoriser les notifications »). Tout se passe sur l'appareil : il regarde les conversations
// toutes les 20 s. Les notifications sont discrètes : jamais de prénom ni de contenu, un écran verrouillé
// peut être vu par d'autres.
import { api } from '/shared/lib.js';
import { tr } from '/shared/i18n.js';
import { state, storage, brand } from './ui.js';

export const notifyPermission = () => ('Notification' in window ? Notification.permission : 'unsupported');

export const prefs = {
  cluster: () => storage.get('live-cluster') !== '0', // regrouper les photos qui se chevauchent (activé par défaut)
  sounds: () => storage.get('live-sounds') === '1',
  notify: () => storage.get('live-notify') === '1' && notifyPermission() === 'granted'
};

// Un petit carillon synthétisé (aucun fichier). Le navigateur ne joue un son qu'après un premier geste sur la page.
let audio = null;
export function chime(notes = [[660, 0], [880, 0.13]]) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
    const t = audio.currentTime;
    for (const [freq, at] of notes) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.12, t + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.35);
      o.connect(g).connect(audio.destination);
      o.start(t + at);
      o.stop(t + at + 0.4);
    }
  } catch { /* son indisponible sur cet appareil */ }
}
document.addEventListener('pointerdown', () => {
  if (prefs.sounds()) { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch { /* rien */ } }
}, { passive: true });

// Android n'affiche une notification qu'à travers un service worker ; ailleurs, l'API simple suffit.
let worker = null;
function registerWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  worker = worker || navigator.serviceWorker.register('/sw.js').catch(() => null);
  return worker;
}

export async function showNotification(body, hash = '#/messages', tag = 'messages') {
  if (!prefs.notify()) return;
  const title = state.me?.discreet_icon ? tr('Nouvelle activité') : brand().name;
  const options = { body: tr(body), tag, renotify: true, data: { url: `${location.pathname}${hash}` }, icon: '/app/icon.svg' };
  try {
    const reg = await registerWorker();
    if (reg?.showNotification) { await reg.showNotification(title, options); return; }
    const n = new Notification(title, options);
    n.onclick = () => { window.focus(); location.hash = hash; n.close(); };
  } catch { /* notifications indisponibles sur cet appareil */ }
}

// Activer : le navigateur demande l'autorisation (une seule fois ; un refus se change dans ses réglages).
export async function enableNotifications() {
  if (notifyPermission() === 'unsupported') return 'unsupported';
  const permission = notifyPermission() === 'default' ? await Notification.requestPermission() : notifyPermission();
  storage.set('live-notify', permission === 'granted' ? '1' : '0');
  if (permission === 'granted') registerWorker();
  window.dispatchEvent(new Event('nuit-prefs'));
  return permission;
}
export function disableNotifications() {
  storage.set('live-notify', '0');
  window.dispatchEvent(new Event('nuit-prefs'));
}

// Le guetteur : page visible, un son ; page cachée (autre onglet, téléphone en veille), une notification.
export const alerts = {
  timer: null,
  last: null,
  started: false,
  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('nuit-prefs', () => this.sync());
    this.sync();
  },
  sync() {
    clearInterval(this.timer);
    this.timer = null;
    this.last = null;
    if (!prefs.sounds() && !prefs.notify()) return;
    if (prefs.notify()) registerWorker();
    const check = async () => {
      const visible = document.visibilityState === 'visible';
      if (state.me?.status !== 'member' || (!visible && !prefs.notify())) return;
      try {
        const n = (await api('GET', '/api/matches')).matches.filter((m) => m.unread).length;
        if (this.last !== null && n > this.last) {
          if (visible && prefs.sounds()) chime();
          if (!visible) showNotification(n - this.last > 1 ? `${n - this.last} nouveaux messages` : 'Nouveau message');
        }
        this.last = n;
      } catch { /* hors ligne : on réessaie au prochain tour */ }
    };
    check();
    this.timer = setInterval(check, 20000);
  }
};

// App membre ILD : routeur. Chaque écran vit dans onboarding.js, main.js ou me.js.
import { api, h } from '/shared/lib.js';
import { state, mount, refreshMe, runCleanup } from './ui.js';
import { screenWelcome, screenLogin, screenSignup, screenVerify, screenWaitlist, screenNotices, screenConsentUpdate } from './onboarding.js';
import { screenDiscover, screenLikes, screenProfile, screenSharedAlbum, screenAround, screenTonight, screenMessages, screenChat } from './main.js';
import { screenMe, screenEditProfile, screenMyAlbums, screenAlbumDetail, screenPlus, screenLocation, adminHint } from './me.js';

// Les erreurs déjà affichées à l'écran ne sont pas signalées une seconde fois.
window.addEventListener('unhandledrejection', (e) => { if (e.reason?.handled) e.preventDefault(); });

async function render() {
  runCleanup();
  document.querySelectorAll('.sheet-backdrop').forEach((s) => s.remove());
  const [, path = '', arg = ''] = /^#\/([^/]*)\/?(.*)$/.exec(location.hash || '#/') || [];
  try {
    if (!state.meta) state.meta = await api('GET', '/api/meta');
    if (state.me === null) await refreshMe();
    const me = state.me;
    document.title = me?.discreet_icon ? 'Notes' : 'ILD';
    if (!me) {
      if (path === 'login') return screenLogin();
      if (path === 'apply') return screenSignup();
      return screenWelcome();
    }
    if (path === 'admin-hint' || me.role === 'admin') return adminHint();
    if (['suspended', 'banned', 'refused'].includes(me.status)) return await screenNotices({ standalone: true });
    if (me.legal.needs_consent) return screenConsentUpdate();
    if (me.status === 'pending') return screenVerify();
    if (me.status === 'waitlist') {
      if (path === 'me' && arg === 'edit') return await screenEditProfile();
      return screenWaitlist();
    }
    switch (path) {
      case 'u': return await screenProfile(arg);
      case 'shared': return await screenSharedAlbum(arg);
      case 'around': return await screenAround();
      case 'tonight': return await screenTonight();
      case 'messages': return await screenMessages();
      case 'chat': return await screenChat(arg);
      case 'likes': return await screenLikes();
      case 'plus': return await screenPlus();
      case 'me':
        if (arg === 'edit') return await screenEditProfile();
        if (arg === 'albums') return await screenMyAlbums();
        if (arg.startsWith('albums/')) return await screenAlbumDetail(arg.slice(7));
        if (arg === 'location') return await screenLocation();
        if (arg === 'notices') return await screenNotices({ standalone: false });
        return await screenMe();
      default: return await screenDiscover();
    }
  } catch (e) {
    if (e.status === 401) { state.me = null; return render(); }
    if (e.status === 428) { await refreshMe(); return render(); }
    mount(h('main', { class: 'screen' }, h('h1', null, 'Oups'), h('p', { class: 'lead' }, e.message), h('a', { class: 'btn block', href: '#/' }, 'Retour')));
  }
}

window.addEventListener('hashchange', render);
render();

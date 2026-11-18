// LivePlay côté appareil : sonnerie, écran d'appel et connexion vidéo d'appareil à appareil (WebRTC).
// Le serveur ne fait que mettre les deux appareils en relation ; la vidéo ne passe jamais par lui
// et rien n'est enregistré.
import { api, h, icon, toast, raw } from '/shared/lib.js';
import { tr } from '/shared/i18n.js';
import { state, avatarOf, reportSheet, sheet, storage } from './ui.js';
import { chime, showNotification } from './alerts.js';

const END_TEXT = {
  declined: 'Appel refusé.', missed: 'Pas de réponse.', cancelled: 'Appel annulé.', ended: 'Appel terminé.'
};
let session = null;

export const supported = () => !!(navigator.mediaDevices?.getUserMedia && window.RTCPeerConnection);
const getMedia = () => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
const mmss = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// La première fois sur cet appareil : ce qu'il faut savoir avant un appel vidéo.
function privacyNotice(relay) {
  if (storage.get('liveplay-notice') === '1') return Promise.resolve(true);
  return new Promise((resolve) => {
    let answered = false;
    const done = (ok, close) => { answered = true; if (ok) storage.set('liveplay-notice', '1'); close(); resolve(ok); };
    const close = sheet((c) => [
      h('h2', null, 'Avant ton premier appel vidéo'),
      h('ul', { class: 'tips' },
        h('li', null, 'La vidéo va directement de ton appareil à l’autre. Elle ne passe pas par nos serveurs et n’est jamais enregistrée.'),
        relay ? null : h('li', null, 'Comme pour tout appel vidéo direct, l’autre appareil peut connaître ton adresse IP. Elle indique une zone approximative, pas ton adresse.'),
        h('li', null, 'Rien n’empêche techniquement l’autre de filmer son écran : ne montre que ce que tu acceptes de voir circuler.'),
        h('li', null, 'Tu peux couper ta caméra, flouter l’image reçue, raccrocher, bloquer et signaler à tout moment.')),
      h('button', { class: 'btn primary block', onclick: () => done(true, c) }, 'J’ai compris, appeler'),
      h('button', { class: 'btn ghost', onclick: () => done(false, c) }, 'Annuler')]);
    // Fermée sans répondre (Échap, clic à côté) : pas d'appel.
    const watch = setInterval(() => { if (!document.querySelector('.sheet-backdrop')) { clearInterval(watch); if (!answered) resolve(false); } }, 300);
    void close;
  });
}

// ---------- l'écran d'appel ----------
function buildScreen(s) {
  const remote = h('video', { class: 'call-remote', autoplay: true, playsinline: true });
  const local = h('video', { class: 'call-local', autoplay: true, playsinline: true, muted: true });
  local.muted = true;
  const status = h('span', { class: 'small call-status', role: 'status' });
  const clock = h('span', { class: 'small call-clock' });
  const veil = h('button', { class: 'call-veil', onclick: () => s.setBlur(false) }, icon('eyeoff', 22), h('span', null, 'Image floutée'), h('span', { class: 'small' }, 'Touche pour voir'));
  const btn = (ic, text, onclick, cls = '') => h('button', { class: `call-btn ${cls}`.trim(), 'aria-label': text, title: text, onclick }, icon(ic, 22));
  const mic = btn('mic', 'Couper le micro', () => s.toggle('audio'));
  const cam = btn('camera', 'Couper ma caméra', () => s.toggle('video'));
  const blur = btn('eyeoff', 'Flouter l’image reçue', () => s.setBlur(!s.blurred));
  const report = btn('flag', 'Signaler', () => s.report());
  const hang = btn('phoneoff', 'Raccrocher', () => s.hangup(), 'end');
  const accept = h('button', { class: 'btn primary call-accept', onclick: () => s.accept() }, icon('video', 18), 'Accepter');
  const decline = h('button', { class: 'btn danger call-decline', onclick: () => s.decline() }, 'Refuser');
  const ringBox = h('div', { class: 'call-ring' },
    h('p', { class: 'small text2' }, 'Tu pourras couper ta caméra et flouter l’image reçue. Rien n’est enregistré.'),
    h('div', { class: 'row' }, decline, accept));
  const o = s.other;
  const root = h('div', { class: 'call-screen', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Appel vidéo LivePlay' },
    remote, veil, local,
    h('div', { class: 'call-top' }, avatarOf(o), h('div', { class: 'stack small-gap grow' }, h('span', { class: 'strong' }, raw(o.first_name)), h('span', { class: 'row' }, status, clock))),
    h('div', { class: 'call-actions' }, mic, cam, blur, report, hang),
    ringBox);
  document.body.append(root);
  return { root, remote, local, status, clock, veil, mic, cam, blur, ringBox };
}

class Session {
  constructor({ id, role, other, local = null, ice = null }) {
    Object.assign(this, { id, role, other, local, ice, pc: null, last: 0, pendingIce: [], connected: false, closed: false, answeredAt: null });
    this.blurred = !!(state.me?.blur_explicit || state.me?.vanilla);
    this.ui = buildScreen(this);
    this.ui.root.classList.toggle('ringing-in', role === 'callee');
    if (local) this.ui.local.srcObject = local;
    this.setBlur(this.blurred);
    this.setStatus(role === 'caller' ? 'Appel en cours…' : 'Appel vidéo LivePlay');
    if (role === 'callee') this.ring();
    this.loop(role === 'caller' ? 1000 : 1500);
  }

  setStatus(text) { this.ui.status.textContent = text ? tr(text) : ''; }
  setBlur(on) {
    this.blurred = on;
    this.ui.root.classList.toggle('blurred', on);
    this.ui.blur.setAttribute('aria-pressed', String(on));
  }
  toggle(kind) {
    const tracks = this.local ? (kind === 'audio' ? this.local.getAudioTracks() : this.local.getVideoTracks()) : [];
    if (!tracks.length) return;
    const on = !tracks[0].enabled;
    tracks.forEach((t) => { t.enabled = on; });
    const b = kind === 'audio' ? this.ui.mic : this.ui.cam;
    b.classList.toggle('off', !on);
    b.setAttribute('aria-pressed', String(!on));
    if (kind === 'video') this.ui.root.classList.toggle('cam-off', !on);
  }

  // Sonnerie (le membre a choisi d'être dispo pour LivePlay) : un carillon et une vibration toutes les 2 s,
  // et une notification si la page est cachée.
  ring() {
    const beat = () => {
      chime([[880, 0], [660, 0.18], [880, 0.36]]);
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* vibration indisponible */ }
    };
    beat();
    this.ringTimer = setInterval(beat, 2000);
    if (document.visibilityState !== 'visible') showNotification('Appel vidéo entrant', '#/messages', 'call');
  }
  stopRing() { clearInterval(this.ringTimer); }

  loop(ms) { clearTimeout(this.timer); if (!this.closed) this.timer = setTimeout(() => this.tick(), ms); }
  async tick() {
    if (this.closed) return;
    let d;
    try {
      d = await api('GET', `/api/calls/${this.id}/signals?after=${this.last}`);
    } catch (e) {
      if (e.status === 404 || e.status === 401) { this.close('Appel terminé.'); return; }
      this.loop(2000);
      return;
    }
    if (!['ringing', 'active'].includes(d.status)) { this.close(END_TEXT[d.status] || 'Appel terminé.'); return; }
    if (d.status === 'active' && this.role === 'caller' && !this.pc) await this.connect();
    for (const s of d.signals) {
      this.last = s.id;
      try { await this.onSignal(s); } catch { /* signal ignoré */ }
    }
    this.loop(this.connected ? 3000 : 700);
  }

  async connect() {
    this.pc = new RTCPeerConnection({ iceServers: this.ice?.iceServers || [], iceTransportPolicy: this.ice?.iceTransportPolicy || 'all' });
    this.local.getTracks().forEach((t) => this.pc.addTrack(t, this.local));
    this.pc.onicecandidate = (e) => { if (e.candidate) this.send('ice', e.candidate.toJSON()); };
    this.pc.ontrack = (e) => { if (this.ui.remote.srcObject !== e.streams[0]) this.ui.remote.srcObject = e.streams[0]; };
    this.pc.onconnectionstatechange = () => {
      const st = this.pc?.connectionState;
      if (st === 'connected') {
        this.connected = true;
        this.ui.root.classList.add('live');
        this.setStatus('');
        this.answeredAt = this.answeredAt || Date.now();
        clearInterval(this.clock);
        this.clock = setInterval(() => { this.ui.clock.textContent = mmss(Date.now() - this.answeredAt); }, 1000);
      } else if (st === 'disconnected') this.setStatus('Connexion instable…');
      else if (st === 'failed') this.hangup('La connexion a échoué. Réessaie, ou passe en wifi.');
    };
    if (this.role === 'caller') {
      this.setStatus('Connexion…');
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await this.send('offer', { type: offer.type, sdp: offer.sdp });
    }
  }

  async onSignal(s) {
    if (!this.pc) await this.connect();
    if (s.kind === 'offer' && this.role === 'callee') {
      await this.pc.setRemoteDescription(s.payload);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await this.send('answer', { type: answer.type, sdp: answer.sdp });
      await this.flushIce();
    } else if (s.kind === 'answer' && this.role === 'caller') {
      await this.pc.setRemoteDescription(s.payload);
      await this.flushIce();
    } else if (s.kind === 'ice') {
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(s.payload).catch(() => {});
      else this.pendingIce.push(s.payload);
    }
  }
  async flushIce() {
    for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
  }
  send(kind, payload) { return api('POST', `/api/calls/${this.id}/signal`, { kind, payload }).catch(() => {}); }

  async accept() {
    this.stopRing();
    try {
      this.local = await getMedia();
    } catch {
      toast('Caméra ou micro refusés : autorise-les dans le navigateur pour répondre.', true);
      return;
    }
    this.ui.local.srcObject = this.local;
    try {
      this.ice = await api('POST', `/api/calls/${this.id}/accept`, {});
    } catch (e) { this.close(e.message); return; }
    this.ui.root.classList.remove('ringing-in');
    this.setStatus('Connexion…');
    await this.connect();
    this.loop(300);
  }
  decline() {
    this.stopRing();
    api('POST', `/api/calls/${this.id}/decline`, {}).catch(() => {});
    this.close();
  }
  hangup(message) {
    api('POST', `/api/calls/${this.id}/end`, {}).catch(() => {});
    this.close(message || 'Appel terminé.');
  }
  report() {
    const other = this.other;
    this.hangup();
    reportSheet('user', other.id, 'ce membre');
  }
  close(message) {
    if (this.closed) return;
    this.closed = true;
    this.stopRing();
    clearTimeout(this.timer);
    clearInterval(this.clock);
    try { this.pc?.close(); } catch { /* déjà fermé */ }
    this.local?.getTracks().forEach((t) => t.stop());
    this.ui.root.remove();
    session = null;
    if (message) toast(message);
  }
}

// Appeler un membre (depuis la conversation).
export async function startCall(other) {
  if (session) return;
  if (!supported()) { toast('Ce navigateur ne permet pas les appels vidéo.', true); return; }
  let ice;
  try { ice = await api('GET', '/api/calls/ice'); } catch (e) { toast(e.message, true); return; }
  if (!(await privacyNotice(ice.relay))) return;
  let local;
  try {
    local = await getMedia();
  } catch {
    toast('Caméra ou micro refusés : autorise-les dans le navigateur pour appeler.', true);
    return;
  }
  let r;
  try {
    r = await api('POST', '/api/calls', { user_id: other.id });
  } catch (e) {
    local.getTracks().forEach((t) => t.stop());
    toast(e.message, true);
    return;
  }
  session = new Session({ id: r.id, role: 'caller', other, local, ice: r });
}

// Le guetteur : quand le membre est dispo pour LivePlay, l'appareil regarde s'il y a un appel entrant.
export const liveplay = {
  timer: null,
  started: false,
  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('nuit-prefs', () => this.sync());
    document.addEventListener('visibilitychange', () => this.sync());
    this.sync();
  },
  sync() {
    clearInterval(this.timer);
    this.timer = null;
    if (!state.me?.liveplay || state.me.status !== 'member' || !supported()) return;
    const every = document.visibilityState === 'visible' ? 4000 : 15000;
    this.timer = setInterval(() => this.check(), every);
    this.check();
  },
  async check() {
    if (session || !state.me?.liveplay) return;
    try {
      const { call } = await api('GET', '/api/calls/current');
      // Un appel lancé ou déjà décroché ailleurs (autre onglet) n'est pas touché : le serveur le clôt s'il est abandonné.
      if (call && !session && call.role === 'callee' && call.status === 'ringing') session = new Session({ id: call.id, role: 'callee', other: call.other });
    } catch { /* hors ligne : on réessaie */ }
  }
};

/* Rendu 3D (3/3) : lecteur « motion design ».
   Couches animées au-dessus de la 3D : titre de phase cinétique, anneau de tempo, étiquettes des muscles
   reliées au corps, angle articulaire en direct, trajectoire en traînée, flèches de direction ;
   caméra en orbite lente ; export vidéo avec carton d'intro et points clés en fin. */
(function (G) {
  'use strict';
  const X = G.anim3d; if (!X || !X.Studio) return;
  const T = X.T, A = G.anim;
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const easeOut = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const FD = '"Big Shoulders Display", "Barlow Condensed", "Arial Narrow", sans-serif', FB = 'Barlow, system-ui, -apple-system, sans-serif';
  const HOT = '#ff5a45', BLUE = '#8fb8ff';
  const fmtS = s => (Math.round(s * 10) / 10).toString().replace('.', ',') + ' s';

  const ANGLE = { squat: 'knee', lunge: 'knee', quadiso: 'knee', hamiso: 'knee', hinge: 'hip', glute: 'hip', core: 'hip',
    hpush: 'elbow', ipush: 'elbow', vpush: 'elbow', vpushdown: 'elbow', triceps: 'elbow', biceps: 'elbow', hpull: 'elbow', vpull: 'elbow',
    sidedelt: 'shoulder', reardelt: 'shoulder', chestiso: 'shoulder', calf: 'ankle' };
  const JOINT_FR = { knee: 'GENOU', hip: 'HANCHE', elbow: 'COUDE', shoulder: 'ÉPAULE', ankle: 'CHEVILLE' };
  function jointPts(kind, J, R) {
    const g = k => J[k + (R ? 'R' : 'L')];
    if (kind === 'knee') return [g('knee'), g('hip'), g('ank')];
    if (kind === 'hip') return [g('hip'), g('sh'), g('knee')];
    if (kind === 'elbow') return [g('el'), g('sh'), g('ha')];
    if (kind === 'shoulder') return [g('sh'), g('hip'), g('el')];
    if (kind === 'ankle') return [g('ank'), g('knee'), (R ? J.footR : J.footL).toe];
    return null;
  }
  function angle3(v, a, b) {
    const ux = a[0] - v[0], uy = a[1] - v[1], uz = a[2] - v[2], wx = b[0] - v[0], wy = b[1] - v[1], wz = b[2] - v[2];
    const d = (ux * wx + uy * wy + uz * wz) / (Math.hypot(ux, uy, uz) * Math.hypot(wx, wy, wz) || 1);
    return Math.acos(clamp(d, -1, 1)) * 180 / Math.PI;
  }
  function glow(ctx, x, y, r, col) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    g.addColorStop(0, col); g.addColorStop(.35, col.length === 7 ? col + '66' : col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * .55, 0, 7); ctx.fill();
  }
  function chevron(ctx, x, y, ux, uy, a) {
    const px = -uy, py = ux;
    ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - ux * 5 + px * 5, y - uy * 5 + py * 5); ctx.lineTo(x, y); ctx.lineTo(x - ux * 5 - px * 5, y - uy * 5 - py * 5); ctx.stroke();
  }
  function pill(ctx, x, y, big, small) {
    ctx.font = `700 14px ${FB}`; const w1 = ctx.measureText(big).width;
    ctx.font = `700 9px ${FB}`; const w2 = ctx.measureText(small).width, w = w1 + w2 + 22, h = 24;
    const x0 = x - w / 2, y0 = y - h / 2;
    ctx.fillStyle = 'rgba(8,11,10,.72)'; ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0 + 12, y0); ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, 12); ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, 12); ctx.arcTo(x0, y0 + h, x0, y0, 12); ctx.arcTo(x0, y0, x0 + w, y0, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = `700 14px ${FB}`; ctx.fillText(big, x0 + 9, y + .5);
    ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.font = `700 9px ${FB}`; ctx.fillText(small, x0 + 13 + w1, y + 1);
  }
  function wrap(ctx, text, x, y, maxW, lh) {
    const words = text.split(' '); let line = '', yy = y;
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t; }
    if (line) ctx.fillText(line, x, yy);
    return yy;
  }

  const _w = new T.Vector3();
  class Player3D {
    constructor(canvas, ex, o = {}) {
      this.c = canvas; this.ex = ex; this.o = o;
      this.tl = G.animTimeline(ex); this.time = 0; this.speed = 1; this.clock = 0; this.last = 0; this.born = performance.now();
      this.baseYaw = o.yaw ?? X.yawOf(ex); this.yaw = this.baseYaw; this.basePitch = X.pitchOf(ex); this.pitch = this.basePitch;
      this.auto = !reduced(); this.ghost = false; this.trail = o.trail ?? !!ex.track; this.guides = o.guides ?? true;
      this.playing = o.autoplay !== false && !reduced(); this.visible = true; this.hist = []; this.phaseIdx = -1; this.phaseAt = 0;
      this.st = new X.Studio(canvas, { shadow: 2048 });
      this.st.use(ex);
      this.ov = o.overlay || null; this.octx = this.ov ? this.ov.getContext('2d') : null;
      this.path = ex.track ? Array.from({ length: 41 }, (_, i) => ex.track(A.solve(ex.pose(i / 40)))) : null;
      this.angleKind = ANGLE[ex.pattern] || null;
      this._raf = 0;
      this.resize();
      if (window.ResizeObserver) { this.ro = new ResizeObserver(() => { this.resize(); this.draw(); }); this.ro.observe(canvas); }
      if (window.IntersectionObserver) { this.io = new IntersectionObserver(es => { this.visible = es[0].isIntersecting; if (this.visible) this.kick(); }); this.io.observe(canvas); }
      this.bindDrag();
      if (!this.playing) { const p = this.tl.ph.find(q => q.con) || this.tl.ph[0]; this.time = (p.t0 + p.t1) / 2; }
      this.draw(); this.kick();
    }
    resize() {
      if (!this.st) return;
      const r = this.c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = Math.max(160, r.width || 400); this.h = Math.max(120, r.height || this.w * .8); this.dpr = dpr;
      this.st.setSize(this.w, this.h, dpr);
      if (this.ov) { const W = Math.round(this.w * dpr), H = Math.round(this.h * dpr); if (this.ov.width !== W || this.ov.height !== H) { this.ov.width = W; this.ov.height = H; } }
    }
    bindDrag() {
      let x0 = null, y0 = 0, yaw0 = 0, pitch0 = 0, mouse = false;
      this.c.style.touchAction = 'pan-y';
      this.c.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; yaw0 = this.yaw; pitch0 = this.pitch; mouse = e.pointerType === 'mouse'; this.c.setPointerCapture?.(e.pointerId); });
      this.c.addEventListener('pointermove', e => {
        if (x0 == null) return;
        const dx = e.clientX - x0, dy = e.clientY - y0;
        if (Math.abs(dx) < 3 && (!mouse || Math.abs(dy) < 3)) return;
        this.setAuto(false);
        this.yaw = this.baseYaw = yaw0 - dx * .5;
        if (mouse) this.pitch = this.basePitch = clamp(pitch0 + dy * .25, -2, 42);
        this.o.onYaw?.(this.yaw); if (!this.playing) this.draw();
      });
      const end = () => { x0 = null; };
      this.c.addEventListener('pointerup', end); this.c.addEventListener('pointercancel', end);
      this.c.addEventListener('dblclick', () => this.reset());
    }
    setAuto(on) { if (this.auto === on) return; this.auto = on; this.o.onAuto?.(on); this.kick(); }
    reset() { this.baseYaw = this.yaw = X.yawOf(this.ex); this.basePitch = this.pitch = X.pitchOf(this.ex); this.setAuto(!reduced()); this.o.onYaw?.(this.yaw); this.draw(); }
    setYaw(y) { this.baseYaw = this.yaw = y; this.basePitch = this.pitch = X.pitchOf(this.ex); this.o.onYaw?.(y); this.draw(); }
    state() {
      const s = G.animAt(this.tl, this.time), con = !!s.p.con, hold = s.p.hold != null, tot = this.tl.total;
      const act = con ? .5 + .5 * Math.sin(Math.PI * .5 * clamp(s.k * 1.3, 0, 1)) : hold ? .72 : .42;
      const tt = ((this.time % tot) + tot) % tot;
      return { u: s.u, i: s.i, k: s.k, p: s.p, act, frac: tt / tot, rep: (Math.floor(this.time / tot) % 8 + 8) % 8 + 1 };
    }
    draw() {
      if (!this.st) return;
      if (!this.c.isConnected) return this.destroy();
      const st = this.state(), S = this.st;
      if (this.auto) { this.yaw = this.baseYaw + 13 * Math.sin(this.clock * .45); this.pitch = this.basePitch + 2.2 * Math.sin(this.clock * .31 + 1); }
      S.aim(this.yaw, this.pitch, 1.1);
      S.setGhost(this.ghost);
      const J = S.pose(st.u, st.act);
      S.render();
      if (st.i !== this.phaseIdx) { this.phaseIdx = st.i; this.phaseAt = this.clock; this.o.onPhase?.(st.i, st.p); }
      this.o.onTick?.(st.frac);
      if (this.octx) this.overlay(J, st);
      if (this.recFrame) this.recFrame();
    }
    kick() { if (!this._raf && this.visible && this.st && (this.playing || this.auto)) { this.last = performance.now(); this._raf = requestAnimationFrame(t => this.loop(t)); } }
    loop(t) {
      this._raf = 0;
      if (!this.st || !this.c.isConnected) return this.destroy();
      const dt = Math.min(.1, (t - this.last) / 1000); this.last = t;
      this.clock += dt; if (this.playing) this.time += dt * this.speed;
      this.draw();
      if ((this.playing || this.auto) && this.visible) this._raf = requestAnimationFrame(tt => this.loop(tt));
    }
    play() { this.playing = true; this.kick(); }
    pause() { this.playing = false; this.draw(); }
    toggle() { this.playing ? this.pause() : this.play(); return this.playing; }
    setSpeed(s) { this.speed = s; }
    seek(frac) { this.time = frac * this.tl.total; this.draw(); }

    /* ---------- Couches motion design ---------- */
    overlay(J, st) {
      const ctx = this.octx, W = this.w, H = this.h, S = this.st;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const P = p => S.project(p, []), ein = easeOut((performance.now() - this.born) / 800);
      this.hudA = 1;
      if (this.clip) {
        const c = this.clip, t = this.clock - c.t0, to = t - c.intro - c.body;
        this.hudA = to > 0 ? 1 - easeOut(to / .45) : easeOut((t - c.intro + .25) / .6);
      }
      const labels = this.guides ? this.layoutCallouts(ctx, J, P, W, H) : [];
      if (this.trail && this.path) this.drawTrail(ctx, J, st, P);
      if (this.guides && this.angleKind) this.drawAngle(ctx, J, P, ein, labels, W, H);
      if (this.guides) this.drawCallouts(ctx, labels, st, ein);
      this.drawHud(ctx, st, W);
      if (this.clip) this.drawClip(ctx, W, H);
    }
    drawTrail(ctx, J, st, P) {
      const cur = this.ex.track(J);
      ctx.save(); ctx.globalAlpha = this.hudA;
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(143,184,255,.3)'; ctx.setLineDash([2, 6]); ctx.beginPath();
      this.path.forEach((q, i) => { const s = P(q); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.stroke(); ctx.setLineDash([]);
      const last = this.hist[this.hist.length - 1];
      if (!last || last.t !== this.clock) this.hist.push({ t: this.clock, p: cur.slice() });
      while (this.hist.length > 2 && this.clock - this.hist[0].t > 1.1) this.hist.shift();
      ctx.lineCap = 'round';
      for (let i = 1; i < this.hist.length; i++) {
        const a = P(this.hist[i - 1].p), b = P(this.hist[i].p), age = clamp((this.clock - this.hist[i].t) / 1.1, 0, 1);
        ctx.strokeStyle = `rgba(143,184,255,${(1 - age) * .95})`; ctx.lineWidth = 1 + 3.2 * (1 - age);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      const s = P(cur); glow(ctx, s[0], s[1], 3.2, BLUE);
      if (st.p.con && this.hist.length > 4) {
        const a = P(this.hist[this.hist.length - 5].p), dx = s[0] - a[0], dy = s[1] - a[1], d = Math.hypot(dx, dy);
        if (d > 2) { const ux = dx / d, uy = dy / d, ph = (this.clock * 2.2) % 1; for (let k = 0; k < 3; k++) chevron(ctx, s[0] + ux * (16 + (k + ph) * 9), s[1] + uy * (16 + (k + ph) * 9), ux, uy, (.85 - k * .28) * (1 - ph * .3)); }
      }
      ctx.restore();
    }
    drawAngle(ctx, J, P, ein, labels, W, H) {
      const pts = jointPts(this.angleKind, J, this.st.camDir.z >= 0); if (!pts) return;
      const [v, a, b] = pts, deg = angle3(v, a, b), sv = P(v), sa = P(a), sb = P(b);
      const a1 = Math.atan2(sa[1] - sv[1], sa[0] - sv[0]); let d = Math.atan2(sb[1] - sv[1], sb[0] - sv[0]) - a1;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const r = 24, mid = a1 + d / 2;
      ctx.save(); ctx.globalAlpha = ein * this.hudA;
      ctx.beginPath(); ctx.moveTo(sv[0], sv[1]); ctx.arc(sv[0], sv[1], r, a1, a1 + d, d < 0); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
      ctx.beginPath(); ctx.arc(sv[0], sv[1], r, a1, a1 + d, d < 0); ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 1.6; ctx.stroke();
      const hit = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
      const dirs = [[-Math.cos(mid), -Math.sin(mid)], [Math.cos(mid), Math.sin(mid)], [0, 1], [0, -1], [-1, 0], [1, 0]];
      let pos = null;
      for (const [dx, dy] of dirs) {
        const px = sv[0] + dx * (r + 40), py = sv[1] + dy * (r + 22), box = { x: px - 44, y: py - 13, w: 88, h: 26 };
        if (box.x < 6 || box.y < 70 || box.x + box.w > W - 6 || box.y + box.h > H - 6) continue;
        if (labels.some(l => hit(box, l.box))) continue;
        pos = [px, py]; break;
      }
      if (pos) pill(ctx, pos[0], pos[1], Math.round(deg) + '°', JOINT_FR[this.angleKind]);
      ctx.restore();
    }
    layoutCallouts(ctx, J, P, W, H) {
      const cam = this.st.cam.position, hip = P(J.H), out = [];
      this.ex.muscles.p.slice(0, 2).forEach((id, n) => {
        const w = this.st.rig.anchor(id, cam, _w); if (!w) return;
        const s = P(w); out.push({ id, n, x: s[0], y: s[1], side: s[0] < hip[0] ? -1 : 1 });
      });
      if (out.length === 2 && out[0].side === out[1].side && Math.abs(out[0].y - out[1].y) < 60) out[1].side = -out[0].side;
      ctx.font = `700 11.5px ${FB}`;
      for (const side of [-1, 1]) {
        let prev = -1e9;
        for (const o of out.filter(q => q.side === side).sort((p, q) => p.y - q.y)) {
          o.ly = clamp(Math.max(o.y, prev + 40), 84, H - 36); prev = o.ly;
          o.name = (G.MUSCLE_FR[o.id] || o.id).toUpperCase(); o.tw = ctx.measureText(o.name).width;
          o.tx = side < 0 ? 14 : W - 14 - o.tw;
          o.box = { x: o.tx - 6, y: o.ly - 18, w: o.tw + 12, h: 26 };
        }
      }
      return out;
    }
    drawCallouts(ctx, out, st, ein) {
      ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.font = `700 11.5px ${FB}`;
      for (const o of out) {
        const e = easeOut(ein * 1.5 - o.n * .3); if (e <= 0) continue;
        const tx = o.tx + (o.side < 0 ? -1 : 1) * (1 - e) * 10, ly = o.ly, tw = o.tw, jx = o.side < 0 ? tx + tw : tx;
        ctx.globalAlpha = e * this.hudA;
        ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(jx + (o.side < 0 ? 8 : -8), ly + 2); ctx.lineTo(jx, ly + 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,90,69,.22)'; ctx.beginPath(); ctx.arc(o.x, o.y, 5 + 5 * st.act, 0, 7); ctx.fill();
        ctx.fillStyle = HOT; ctx.beginPath(); ctx.arc(o.x, o.y, 3.2, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(o.name, tx, ly - 3);
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(tx, ly + 1, tw, 2.5);
        ctx.fillStyle = HOT; ctx.fillRect(o.side < 0 ? tx : tx + tw * (1 - st.act), ly + 1, tw * st.act, 2.5);
      }
      ctx.restore();
    }
    drawHud(ctx, st, W) {
      const e = easeOut((this.clock - this.phaseAt) / .35), small = W < 440;
      ctx.save(); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.globalAlpha = e * this.hudA; ctx.fillStyle = '#fff'; ctx.font = `700 ${small ? 22 : 27}px ${FD}`;
      ctx.fillText(String(st.p.label || '').toUpperCase(), 16, 14 + (1 - e) * 10);
      ctx.globalAlpha = .9 * e * this.hudA; ctx.fillStyle = st.p.con ? HOT : st.p.hold != null ? 'rgba(255,255,255,.7)' : BLUE; ctx.font = `700 10.5px ${FB}`;
      ctx.fillText(`${st.p.con ? 'CONCENTRIQUE' : st.p.hold != null ? 'PAUSE' : 'EXCENTRIQUE'} · ${fmtS((st.p.hold ?? st.p.d) / this.speed)}`, 16, (small ? 40 : 46) + (1 - e) * 6);
      ctx.restore();
      this.drawRing(ctx, W - 34, 34, 18, st);
    }
    drawRing(ctx, cx, cy, r, st) {
      const tl = this.tl, tot = tl.total, gap = .09; let a0 = -Math.PI / 2;
      ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha = this.hudA;
      tl.ph.forEach((p, i) => {
        const span = (p.t1 - p.t0) / tot * Math.PI * 2, a1 = a0 + span, on = i === st.i;
        if (span > gap * 1.4) {
          ctx.beginPath(); ctx.arc(cx, cy, r, a0 + gap / 2, a1 - gap / 2);
          ctx.strokeStyle = p.con ? `rgba(255,90,69,${on ? 1 : .42})` : p.hold != null ? `rgba(255,255,255,${on ? .9 : .28})` : `rgba(143,184,255,${on ? 1 : .42})`;
          ctx.lineWidth = on ? 4 : 2.6; ctx.stroke();
        }
        a0 = a1;
      });
      const ang = -Math.PI / 2 + st.frac * Math.PI * 2; glow(ctx, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 3, '#ffffff');
      ctx.fillStyle = '#fff'; ctx.font = `800 15px ${FD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(st.rep), cx, cy + 1);
      ctx.font = `700 8.5px ${FB}`; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText('REP', cx, cy + r + 11);
      ctx.restore();
    }
    drawClip(ctx, W, H) {
      const c = this.clip, t = this.clock - c.t0, m = Math.min(W, H * 1.25);
      ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      if (t < c.intro + .45) {
        const fade = t < c.intro ? 1 : 1 - (t - c.intro) / .45, e1 = easeOut(t / .5), e2 = easeOut((t - .2) / .55), e3 = easeOut((t - .45) / .55);
        ctx.fillStyle = `rgba(9,12,11,${.8 * fade})`; ctx.fillRect(0, 0, W, H);
        const y = H * .46;
        ctx.globalAlpha = fade; ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = `700 ${Math.round(m * .026)}px ${FB}`; ctx.fillText('TRAINING COACH · TECHNIQUE', 24, y - m * .1);
        ctx.fillStyle = HOT; ctx.fillRect(24, y - m * .08, m * .09 * e1, 3);
        ctx.globalAlpha = fade * e2; ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(m * .085)}px ${FD}`;
        wrap(ctx, this.ex.name.toUpperCase(), 24, y + (1 - e2) * 16, W - 48, m * .085);
        ctx.globalAlpha = fade * e3; ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.font = `600 ${Math.round(m * .03)}px ${FB}`;
        ctx.fillText(this.ex.muscles.p.map(k => G.MUSCLE_FR[k]).join(' · ').toUpperCase(), 24, y + m * .14 + (1 - e3) * 10);
      }
      const to = t - c.intro - c.body;
      if (to > 0) {
        const e = easeOut(to / .5);
        ctx.globalAlpha = 1; ctx.fillStyle = `rgba(9,12,11,${.74 * e})`; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = e; ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(m * .06)}px ${FD}`; ctx.fillText('POINTS CLÉS', 24, H * .24);
        ctx.font = `500 ${Math.round(m * .03)}px ${FB}`;
        let y = H * .24 + m * .1;
        this.ex.cues.slice(0, 3).forEach((q, i) => {
          const ei = easeOut((to - .3 - i * .28) / .45); if (ei <= 0) return;
          ctx.globalAlpha = ei; ctx.fillStyle = HOT; ctx.fillRect(24, y - m * .012, 14, 3);
          ctx.fillStyle = '#fff'; y = wrap(ctx, q, 48 + (1 - ei) * 12, y, W - 72, m * .042) + m * .07;
        });
        ctx.globalAlpha = e * .6; ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(m * .022)}px ${FB}`; ctx.fillText('TRAINING COACH', 24, H - 20);
      }
      ctx.restore();
    }

    /* ---------- Export vidéo (MP4 si possible, sinon WebM) ---------- */
    async record(loops = 2) {
      if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw { code: 'unsupported' };
      const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const type = types.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } });
      if (!type) throw { code: 'unsupported' };
      const W = Math.round(this.w * this.dpr), H = Math.round(this.h * this.dpr);
      const rc = document.createElement('canvas'); rc.width = W; rc.height = H; const rx = rc.getContext('2d');
      const bg = rx.createRadialGradient(W / 2, H * .58, 10, W / 2, H * .58, Math.max(W, H) * .8);
      bg.addColorStop(0, '#232a28'); bg.addColorStop(.55, '#131817'); bg.addColorStop(1, '#0b0e0d');
      this.recFrame = () => { rx.fillStyle = bg; rx.fillRect(0, 0, W, H); rx.drawImage(this.c, 0, 0, W, H); if (this.ov) rx.drawImage(this.ov, 0, 0, W, H); };
      const stream = rc.captureStream(30), rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5e6 });
      const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(r => { rec.onstop = r; });
      const was = { playing: this.playing, speed: this.speed, auto: this.auto, guides: this.guides };
      this.clip = { t0: this.clock, intro: 1.7, body: this.tl.total * loops, outro: 3 };
      this.time = 0; this.speed = 1; this.auto = true; this.guides = true; this.visible = true; this.playing = true; this.hist = []; this.kick();
      rec.start(250);
      await new Promise(r => setTimeout(r, (this.clip.intro + this.clip.body + this.clip.outro) * 1000 + 250));
      rec.stop(); await stopped; stream.getTracks().forEach(t => t.stop());
      this.clip = null; this.recFrame = null; Object.assign(this, was); this.o.onAuto?.(this.auto); this.kick();
      return { blob: new Blob(chunks, { type: type.split(';')[0] }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
    }
    destroy() {
      cancelAnimationFrame(this._raf); this._raf = 0; this.ro?.disconnect(); this.io?.disconnect();
      this.playing = false; this.auto = false;
      if (this.st) { this.st.dispose(); this.st = null; }
    }
  }

  /* Bascule vers la 3D si WebGL est disponible ; sinon le rendu 2D reste en place */
  function webglOK() {
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return false; gl.getExtension('WEBGL_lose_context')?.loseContext(); return true;
    } catch (e) { return false; }
  }
  if (webglOK()) {
    const P2 = G.Player, S2 = G.animStill;
    let thumbs3D = true;
    G.Player = function (canvas, ex, o) {
      try { return new Player3D(canvas, ex, o); }
      catch (e) { console.warn('Rendu 3D indisponible, retour au 2D', e); const c2 = canvas.cloneNode(); canvas.replaceWith(c2); G.render3D = false; return new P2(c2, ex, o); }
    };
    G.animStill = (canvas, ex, u, yaw) => {
      if (thumbs3D) { try { X.still(canvas, ex, u, yaw); return; } catch (e) { thumbs3D = false; console.warn('Vignettes 3D indisponibles', e); } }
      S2(canvas, ex, u, yaw);
    };
    G.animPreview = (canvas, ex) => thumbs3D ? X.preview(canvas, ex) : () => {};
    G.render3D = true;
  }
  X.Player3D = Player3D;
})(window.GYM = window.GYM || {});

/* Lecteur d'animation : boucle, phases (excentrique / pause / concentrique), vitesse,
   rotation de la caméra au doigt, fantômes, trajectoire, export vidéo (MediaRecorder). */
(function (G) {
  'use strict';
  const A = G.anim, { clamp } = A.v;
  const ease = x => .5 - .5 * Math.cos(Math.PI * clamp(x, 0, 1));
  const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  function timeline(ex) {
    let t = 0, u = 0; const ph = [];
    for (const p of ex.phases) {
      const d = p.hold ?? p.d; const from = u, to = p.hold != null ? u : p.to;
      ph.push(Object.assign({}, p, { t0: t, t1: t + d, from, to })); t += d; u = to;
    }
    return { ph, total: t };
  }
  function at(tl, time) {
    const tt = ((time % tl.total) + tl.total) % tl.total;
    for (let i = 0; i < tl.ph.length; i++) {
      const p = tl.ph[i];
      if (tt < p.t1 || i === tl.ph.length - 1) {
        const k = (tt - p.t0) / ((p.t1 - p.t0) || 1);
        return { i, k, u: p.from + (p.to - p.from) * ease(k), p };
      }
    }
  }

  function drawFrame(ctx, W, H, ex, cam, V, st, o = {}) {
    ctx.save();
    ctx.fillStyle = A.COL.stage; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H * .55, 10, W / 2, H * .55, Math.max(W, H) * .7);
    g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    A.drawFloor(ctx, V, cam);
    const live = A.scene(ex, st.u, cam, { act: st.act });
    A.drawShadow(ctx, V, cam, live.J);
    if (o.ghost) for (const gu of [0, 1]) { ctx.globalAlpha = .2; for (const d of A.scene(ex, gu, cam, { noMuscles: true, ring: false }).list) d.draw(ctx, V); ctx.globalAlpha = 1; }
    if (o.trail && ex.track) {
      ctx.fillStyle = 'rgba(120,170,255,0.75)';
      for (let i = 0; i <= 40; i++) {
        const J = A.solve(ex.pose(i / 40)), q = cam.p(ex.track(J));
        ctx.beginPath(); ctx.arc(V.x(q[0]), V.y(q[1]), Math.max(1.5, V.s * .008), 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const d of live.list) d.draw(ctx, V);
    if (o.overlay) {
      const pad = Math.round(W * .04), fs = Math.round(W * .045);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, fs * 2.2); ctx.fillRect(0, H - fs * 2.6, W, fs * 2.6);
      ctx.fillStyle = '#fff'; ctx.font = `700 ${fs}px "Big Shoulders Display", "Barlow Condensed", sans-serif`; ctx.textBaseline = 'middle';
      ctx.fillText(ex.name.toUpperCase(), pad, fs * 1.1);
      ctx.font = `500 ${Math.round(fs * .62)}px Barlow, system-ui, sans-serif`;
      ctx.fillText((st.p && (st.p.label + ' · ' + (st.p.cue || ''))) || '', pad, H - fs * 1.5, W - pad * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(pad, H - fs * .6, W - pad * 2, 3);
      ctx.fillStyle = '#ff5c48'; ctx.fillRect(pad, H - fs * .6, (W - pad * 2) * st.frac, 3);
    }
    ctx.restore();
  }

  function fitFor(ex, yaws, pitch) {
    let b = null;
    for (const y of yaws) {
      const bb = A.bounds(ex, A.Cam(y, pitch));
      b = b ? { x0: Math.min(b.x0, bb.x0), x1: Math.max(b.x1, bb.x1), y0: Math.min(b.y0, bb.y0), y1: Math.max(b.y1, bb.y1) } : bb;
    }
    return b;
  }

  class Player {
    constructor(canvas, ex, o = {}) {
      this.c = canvas; this.ctx = canvas.getContext('2d'); this.ex = ex; this.o = o;
      this.tl = timeline(ex); this.time = 0; this.speed = 1; this.last = 0;
      this.yaw = o.yaw ?? ex.cam ?? 20; this.pitch = ex.pitch ?? 8;
      this.ghost = !!o.ghost; this.trail = o.trail ?? !!ex.track; this.overlay = false;
      this.playing = o.autoplay !== false && !reduceMotion();
      this.bounds = fitFor(ex, [this.yaw, 0, 45, 90, -45], this.pitch);
      this.phaseIdx = -1; this._raf = 0; this.visible = true;
      this.resize();
      if (window.ResizeObserver) { this.ro = new ResizeObserver(() => { this.resize(); this.draw(); }); this.ro.observe(canvas); }
      if (window.IntersectionObserver) { this.io = new IntersectionObserver(es => { this.visible = es[0].isIntersecting; if (this.visible) this.kick(); }); this.io.observe(canvas); }
      this.bindDrag();
      if (!this.playing) this.time = this.timeFor(.5);
      this.draw(); this.kick();
    }
    timeFor(u) { const p = this.tl.ph.find(q => q.to === 1 && q.from === 0); return p ? p.t0 + (p.t1 - p.t0) * .5 : 0; }
    resize() {
      const r = this.c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(160, Math.round(r.width * dpr)), h = Math.max(120, Math.round((r.height || r.width * .8) * dpr));
      if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    }
    bindDrag() {
      let x0 = null, y0 = 0;
      this.c.style.touchAction = 'pan-y';
      this.c.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = this.yaw; this.c.setPointerCapture?.(e.pointerId); });
      this.c.addEventListener('pointermove', e => { if (x0 == null) return; this.yaw = y0 - (e.clientX - x0) * .6; this.o.onYaw?.(this.yaw); if (!this.playing) this.draw(); });
      const end = () => { x0 = null; };
      this.c.addEventListener('pointerup', end); this.c.addEventListener('pointercancel', end);
      this.c.addEventListener('dblclick', () => { this.setYaw(this.ex.cam ?? 20); });
    }
    setYaw(y) { this.yaw = y; this.o.onYaw?.(y); this.draw(); }
    state() {
      const s = at(this.tl, this.time), con = !!s.p.con, hold = s.p.hold != null;
      const act = con ? .45 + .55 * Math.sin(Math.PI * .5 * s.k) : hold ? .7 : .45;
      return { u: s.u, i: s.i, p: s.p, act, frac: ((this.time % this.tl.total) + this.tl.total) % this.tl.total / this.tl.total };
    }
    draw() {
      if (!this.c.isConnected) return this.destroy();
      const W = this.c.width, H = this.c.height, cam = A.Cam(this.yaw, this.pitch), V = A.viewport(this.bounds, W, H, .05);
      const st = this.state();
      drawFrame(this.ctx, W, H, this.ex, cam, V, st, { ghost: this.ghost, trail: this.trail, overlay: this.overlay });
      if (st.i !== this.phaseIdx) { this.phaseIdx = st.i; this.o.onPhase?.(st.i, st.p); }
      this.o.onTick?.(st.frac);
    }
    kick() { if (!this._raf && this.playing && this.visible) { this.last = performance.now(); this._raf = requestAnimationFrame(t => this.loop(t)); } }
    loop(t) {
      this._raf = 0;
      if (!this.c.isConnected) return this.destroy();
      const dt = Math.min(.1, (t - this.last) / 1000); this.last = t;
      if (this.playing) this.time += dt * this.speed;
      this.draw();
      if (this.playing && this.visible) this._raf = requestAnimationFrame(tt => this.loop(tt));
    }
    play() { this.playing = true; this.kick(); }
    pause() { this.playing = false; this.draw(); }
    toggle() { this.playing ? this.pause() : this.play(); return this.playing; }
    setSpeed(s) { this.speed = s; }
    seek(frac) { this.time = frac * this.tl.total; this.draw(); }
    destroy() { cancelAnimationFrame(this._raf); this._raf = 0; this.ro?.disconnect(); this.io?.disconnect(); this.playing = false; }

    /* Enregistre N boucles en vidéo (mp4 si le navigateur sait, sinon webm) */
    async record(loops = 2) {
      if (!window.MediaRecorder || !this.c.captureStream) throw { code: 'unsupported' };
      const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const type = types.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } });
      if (!type) throw { code: 'unsupported' };
      const stream = this.c.captureStream(30), rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 3e6 });
      const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(r => { rec.onstop = r; });
      const wasPlaying = this.playing, sp = this.speed;
      this.overlay = true; this.time = 0; this.speed = 1; this.visible = true; this.play();
      rec.start(250);
      await new Promise(r => setTimeout(r, this.tl.total * loops * 1000 + 150));
      rec.stop(); await stopped; stream.getTracks().forEach(t => t.stop());
      this.overlay = false; this.speed = sp; if (!wasPlaying) this.pause();
      return { blob: new Blob(chunks, { type: type.split(';')[0] }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
    }
  }

  /* Image fixe (vignette) */
  function still(canvas, ex, u = .5, yaw) {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(120, Math.round(r.width * dpr)); canvas.height = Math.max(96, Math.round(r.height * dpr));
    const y = yaw ?? ex.cam ?? 20, p = ex.pitch ?? 8, cam = A.Cam(y, p);
    const V = A.viewport(fitFor(ex, [y], p), canvas.width, canvas.height, .06);
    drawFrame(canvas.getContext('2d'), canvas.width, canvas.height, ex, cam, V, { u, act: .8, frac: 0 }, {});
  }

  G.Player = Player; G.animStill = still; G.animTimeline = timeline;
})(window.GYM = window.GYM || {});

/* Rendu 3D (2/3) : studio (éclairage d'environnement, lumière clé + contre-jour, ombres douces,
   sol de salle), cadrage automatique, vignettes mises en cache et aperçus animés au survol. */
(function (G) {
  'use strict';
  const X = G.anim3d; if (!X) return;
  const T = X.T, A = G.anim, R2D = X.R2D, lin = X.lin;

  /* Pièce virtuelle avec panneaux lumineux : reflets doux sur le corps et le métal */
  function envScene() {
    const s = new T.Scene();
    s.add(new T.Mesh(new T.BoxGeometry(12, 7, 12), new T.MeshBasicMaterial({ color: lin(0x1c201f), side: T.BackSide })));
    const panel = (w, h, pos, rot, k, hex = 0xffffff) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(hex).multiplyScalar(k), side: T.DoubleSide }));
      m.position.set(pos[0], pos[1], pos[2]); m.rotation.set(rot[0], rot[1], 0); s.add(m);
    };
    panel(5, 3, [0, 3.4, 0], [Math.PI / 2, 0], 2.4);
    panel(2.2, 3, [5.8, 1.4, 2], [0, -Math.PI / 2], 2.2, 0xfff1e0);
    panel(2.2, 3, [-5.8, 1.2, -1.5], [0, Math.PI / 2], 1.4, 0xc9dcff);
    panel(4, 1.2, [0, .8, -5.8], [0, 0], .9);
    return s;
  }
  let FLOOR = null;
  function floorTexture() {
    if (FLOOR) return FLOOR;
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const x = c.getContext('2d'), g = x.createRadialGradient(512, 512, 0, 512, 512, 512);
    g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(.55, 'rgba(255,255,255,0.035)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i <= 1024; i += 73) { x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(i - 1, 0, 2, 1024); x.fillRect(0, i - 1, 1024, 2); }
    FLOOR = new T.CanvasTexture(c); FLOOR.encoding = T.sRGBEncoding; FLOOR.anisotropy = 4;
    return FLOOR;
  }

  const BOUNDS = new Map();
  const _c = new T.Vector3(), _s = new T.Vector3(), _v = new T.Vector3(), _bb = new T.Box3();
  function expandVisible(box, root) {
    root.traverseVisible(o => {
      if (!o.isMesh) return;
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
      _bb.copy(g.boundingBox).applyMatrix4(o.matrixWorld); box.union(_bb);
    });
  }

  class Studio {
    constructor(canvas, o = {}) {
      this.canvas = canvas;
      const r = this.r = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!o.preserve });
      r.setClearColor(0x000000, 0);
      r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = o.exposure || 1.05;
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
      const sc = this.scene = new T.Scene();
      const pm = new T.PMREMGenerator(r); this.env = pm.fromScene(envScene(), .04); sc.environment = this.env.texture; pm.dispose();
      this.cam = new T.PerspectiveCamera(30, 1.25, .05, 80); this.camDir = new T.Vector3(0, 0, 1);
      const key = this.key = new T.DirectionalLight(0xfff4e8, 2.3), sz = o.shadow || 2048;
      key.castShadow = true; key.shadow.mapSize.set(sz, sz); key.shadow.bias = -.0003; key.shadow.normalBias = .02;
      sc.add(key, key.target);
      this.rim = new T.DirectionalLight(0xa8c4ff, 1.6); sc.add(this.rim, this.rim.target);
      sc.add(new T.HemisphereLight(0xeaf0ff, 0x2a2521, .3));
      const floor = new T.Mesh(new T.PlaneGeometry(8, 8), new T.MeshBasicMaterial({ map: floorTexture(), transparent: true, depthWrite: false, toneMapped: false }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = .0005; floor.renderOrder = -1; sc.add(floor);
      const catcher = new T.Mesh(new T.PlaneGeometry(10, 10), new T.ShadowMaterial({ opacity: .46 }));
      catcher.rotation.x = -Math.PI / 2; catcher.position.y = .001; catcher.receiveShadow = true; sc.add(catcher);
      this.disposables = [floor.geometry, floor.material, catcher.geometry, catcher.material];
      this.content = new T.Group(); sc.add(this.content);
      this.rig = new X.Rig(false); this.content.add(this.rig.g);
      this.props = new X.Props(this.content);
      this.ghosts = null; this.ex = null; this.w = 0; this.h = 0;
    }
    setSize(w, h, pr) {
      w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
      if (w === this.w && h === this.h && pr === this.pr) return;
      this.w = w; this.h = h; this.pr = pr;
      this.r.setPixelRatio(pr); this.r.setSize(w, h, false);
      this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    }
    use(ex) {
      if (this.ex === ex) return;
      this.ex = ex;
      let b = BOUNDS.get(ex.id);
      if (!b) {
        b = new T.Box3();
        for (const u of [0, .2, .4, .6, .8, 1]) { this.pose(u, .5); this.content.updateMatrixWorld(true); expandVisible(b, this.content); }
        b.min.y = Math.min(b.min.y, 0);
        BOUNDS.set(ex.id, b);
      }
      this.bounds = b;
      if (this.ghosts) this.ghosts.forEach(g => g.pose(A.solve(ex.pose(g.userU))));
    }
    setGhost(on) {
      if (on && !this.ghosts) {
        this.ghosts = [0, 1].map(u => { const g = new X.Rig(true); g.userU = u; this.content.add(g.g); return g; });
        this.ghosts.forEach(g => g.pose(A.solve(this.ex.pose(g.userU))));
      }
      if (this.ghosts) this.ghosts.forEach(g => { g.g.visible = !!on; });
    }
    pose(u, act) {
      const ex = this.ex, J = A.solve(ex.pose(u));
      this.rig.pose(J); this.rig.muscles(ex.muscles, act);
      this.props.begin(this.camDir);
      if (ex.props) ex.props(J, this.props.api, J.p);
      this.props.end();
      return J;
    }
    /* Caméra en orbite autour du mouvement ; les lumières suivent la caméra pour garder le corps lisible */
    aim(yaw, pitch, zoom = 1) {
      const b = this.bounds, c = b.getCenter(_c), s = b.getSize(_s), cam = this.cam;
      const vf = cam.fov * R2D / 2, hf = Math.atan(Math.tan(vf) * cam.aspect), wide = Math.hypot(s.x, s.z);
      const dist = (Math.max((s.y / 2 + .06) / Math.tan(vf), (wide / 2 + .06) / Math.tan(hf)) + wide * .22) / zoom;
      const y = yaw * R2D, p = pitch * R2D;
      this.camDir.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
      cam.position.copy(c).addScaledVector(this.camDir, dist); cam.lookAt(c); cam.updateMatrixWorld();
      const ky = y + .75, kp = 52 * R2D;
      this.key.position.set(c.x + Math.sin(ky) * Math.cos(kp) * 6, c.y + Math.sin(kp) * 6, c.z + Math.cos(ky) * Math.cos(kp) * 6); this.key.target.position.copy(c);
      const ry = y + Math.PI - .7; this.rim.position.set(c.x + Math.sin(ry) * 5, c.y + 2.6, c.z + Math.cos(ry) * 5); this.rim.target.position.copy(c);
      const ext = Math.max(s.x, s.y, s.z) * .72 + .45, sc = this.key.shadow.camera;
      sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = .3; sc.far = 16; sc.updateProjectionMatrix();
    }
    render() { this.r.render(this.scene, this.cam); }
    /* Coordonnées écran (px CSS) d'un point 3D */
    project(p, out) {
      _v.set(p[0] ?? p.x, p[1] ?? p.y, p[2] ?? p.z).project(this.cam);
      out = out || [0, 0, 0]; out[0] = (_v.x + 1) / 2 * this.w; out[1] = (1 - _v.y) / 2 * this.h; out[2] = _v.z; return out;
    }
    dispose() {
      this.rig.dispose(); if (this.ghosts) this.ghosts.forEach(g => g.dispose());
      this.env.dispose(); this.disposables.forEach(d => d.dispose());
      this.r.dispose(); try { this.r.forceContextLoss(); } catch (e) { /* contexte déjà perdu */ }
    }
  }

  /* Angle de caméra par défaut : de dos quand les muscles travaillés sont à l'arrière */
  const CAM3D = { rdl: -28, rdl_db: -28, deadlift: -26, calf: -45, legcurl: 28, pullup: -62, pulldown: -62, facepull: -70, reardelt: -60, pushdown: -48, ohext: -52, row: -18, cablerow: -30 };
  const yawOf = ex => ex.cam3d ?? CAM3D[ex.id] ?? Math.min(62, (ex.cam ?? 22) + 12);
  const pitchOf = ex => ex.pitch3d ?? 11;

  /* ---------- Vignettes : un seul contexte WebGL hors écran, images mises en cache ---------- */
  const TW = 520, TH = 416, CACHE = new Map(), QUEUE = [];
  let TS = null, pumping = false;
  function thumbStudio() {
    if (!TS) { const c = document.createElement('canvas'); TS = new Studio(c, { shadow: 1024 }); TS.setSize(TW, TH, 1); }
    return TS;
  }
  function renderStill(ex, u, yaw) {
    const st = thumbStudio(); st.use(ex); st.aim(yaw ?? yawOf(ex), pitchOf(ex), 1.1); st.pose(u, .9); st.render();
    const out = document.createElement('canvas'); out.width = TW; out.height = TH; out.getContext('2d').drawImage(st.canvas, 0, 0);
    return out;
  }
  function blit(canvas, img) {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(60, Math.round((r.width || 152) * dpr)), h = Math.max(48, Math.round((r.height || 120) * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const x = canvas.getContext('2d'); x.clearRect(0, 0, w, h);
    const s = Math.max(w / TW, h / TH), dw = TW * s, dh = TH * s; x.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  function pump() {
    pumping = true;
    requestAnimationFrame(() => {
      const t0 = performance.now();
      while (QUEUE.length && performance.now() - t0 < 28) {
        const j = QUEUE.shift();
        if (!j.canvas.isConnected) continue;
        let img = CACHE.get(j.key);
        if (!img) { try { img = renderStill(j.ex, j.u, j.yaw); CACHE.set(j.key, img); } catch (e) { console.error(e); continue; } }
        blit(j.canvas, img);
      }
      if (QUEUE.length) pump(); else pumping = false;
    });
  }
  function still(canvas, ex, u = .55, yaw) {
    thumbStudio();
    const key = ex.id + '|' + u + '|' + (yaw ?? '');
    const img = CACHE.get(key); if (img) { blit(canvas, img); return; }
    QUEUE.push({ canvas, ex, u, yaw, key }); if (!pumping) pump();
  }
  /* Aperçu animé (survol d'une carte) : rend quelques images par seconde dans la vignette */
  function preview(canvas, ex) {
    let alive = true, t = 0, last = performance.now();
    const tl = G.animTimeline(ex), loop = now => {
      if (!alive || !canvas.isConnected) return;
      t += Math.min(.1, (now - last) / 1000); last = now;
      const s = G.animAt(tl, t), st = thumbStudio();
      st.use(ex); st.aim(yawOf(ex) + 10 * Math.sin(t * .7), pitchOf(ex), 1.1); st.pose(s.u, s.p.con ? .6 + .4 * Math.sin(Math.PI * Math.min(1, s.k)) : .5); st.render();
      blit(canvas, st.canvas);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { alive = false; still(canvas, ex, .55); };
  }

  G.anim3d.Studio = Studio; G.anim3d.yawOf = yawOf; G.anim3d.pitchOf = pitchOf;
  G.anim3d.still = still; G.anim3d.preview = preview;
  G.anim3d.pending = () => QUEUE.length + (pumping ? 1 : 0);
})(window.GYM = window.GYM || {});

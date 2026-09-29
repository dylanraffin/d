/* Rendu 3D (1/3) : mannequin anatomique et matériel, avec three.js.
   Les segments suivent le squelette calculé par anim.js (mêmes poses que le rendu 2D) ;
   chaque muscle est un volume qui s'allume quand il travaille. */
(function (G) {
  'use strict';
  const T = window.THREE, A = G.anim;
  if (!T || !A) return;
  const L = A.L, R2D = Math.PI / 180;
  const lin = hex => new T.Color(hex).convertSRGBToLinear();
  const V = (a, o) => o.set(a[0], a[1], a[2]);
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const PAL = { skin: 0xc9c0b2, hair: 0x202526, shoe: 0x1b1f20, sole: 0xe6e2d9, hot: 0xff4631, warm: 0xffa726 };
  const HOT = lin(PAL.hot), WARM = lin(PAL.warm);

  /* ---------- Géométries partagées ---------- */
  const lathe = (pts, seg = 26) => new T.LatheGeometry(pts.map(([y, r]) => new T.Vector2(Math.max(r, 5e-4), y)), seg);
  const GEO = {
    sph: new T.SphereGeometry(1, 28, 18),
    hair: new T.SphereGeometry(1, 30, 14, 0, Math.PI * 2, 0, Math.PI * .56),
    thigh: lathe([[-.082, 0], [-.074, .042], [-.05, .071], [-.015, .083], [.06, .082], [.18, .074], [.3, .062], [.39, .053], [.44, .05], [.47, .043], [.492, .026], [.5, 0]]),
    shin: lathe([[-.05, 0], [-.04, .034], [-.012, .05], [.05, .051], [.14, .047], [.26, .039], [.36, .032], [.43, .03], [.455, .024], [.47, 0]]),
    upper: lathe([[-.058, 0], [-.048, .037], [-.016, .054], [.05, .054], [.16, .049], [.26, .043], [.3, .04], [.322, .03], [.336, 0]]),
    fore: lathe([[-.042, 0], [-.032, .034], [-.005, .044], [.06, .047], [.15, .039], [.23, .029], [.245, .027], [.256, 0]]),
    neck: lathe([[-.02, 0], [0, .05], [.06, .047], [.12, .046], [.14, 0]], 20),
    box: new T.BoxGeometry(2, 2, 2),
    cyl: new T.CylinderGeometry(1, 1, 1, 32, 1),
    disc: new T.CylinderGeometry(1, 1, 1, 56, 1),
    hex: new T.CylinderGeometry(1, 1, 1, 6, 1)
  };

  /* ---------- Tronc : section elliptique extrudée le long de la colonne (bassin → épaules) ---------- */
  // [hauteur depuis les hanches, demi-largeur, profondeur avant, profondeur arrière]
  const TORSO = [[-.118, .02, .02, .02], [-.1, .098, .066, .072], [-.07, .152, .088, .102], [-.03, .172, .094, .116], [.02, .174, .095, .11],
    [.08, .163, .093, .097], [.14, .152, .092, .09], [.2, .156, .098, .092], [.27, .17, .11, .098], [.34, .186, .124, .104],
    [.41, .2, .13, .108], [.47, .206, .118, .108], [.51, .192, .094, .098], [.545, .14, .072, .078], [.565, .062, .05, .056], [.576, .02, .02, .02]];
  const SEG = 30;
  function torsoGeometry() {
    const R = TORSO.length, g = new T.BufferGeometry(), n = R * SEG;
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(n * 3), 3));
    const idx = [];
    for (let r = 0; r < R - 1; r++) for (let s = 0; s < SEG; s++) {
      const a = r * SEG + s, b = r * SEG + (s + 1) % SEG, c = a + SEG, d = b + SEG;
      idx.push(a, d, b, a, c, d);
    }
    g.setIndex(idx);
    return g;
  }
  function torsoUpdate(g, J) {
    const p = J.p, pos = g.attributes.position.array, k0 = L.sp1 - .09, k1 = L.sp1 + .09;
    const p0x = J.H[0] + J.d1[0] * k0, p0y = J.H[1] + J.d1[1] * k0, p2x = J.M[0] + J.d2[0] * (k1 - L.sp1), p2y = J.M[1] + J.d2[1] * (k1 - L.sp1);
    for (let r = 0; r < TORSO.length; r++) {
      const [s, w, df, db] = TORSO[r];
      let cx, cy;
      if (s <= k0) { cx = J.H[0] + J.d1[0] * s; cy = J.H[1] + J.d1[1] * s; }
      else if (s >= k1) { cx = J.M[0] + J.d2[0] * (s - L.sp1); cy = J.M[1] + J.d2[1] * (s - L.sp1); }
      else { const u = (s - k0) / (k1 - k0), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; cx = a * p0x + b * J.M[0] + c * p2x; cy = a * p0y + b * J.M[1] + c * p2y; }
      const ang = (p.t + p.c * smooth(k0, k1, s)) * R2D, fx = Math.cos(ang), fy = -Math.sin(ang), dm = (df + db) / 2, dd = (df - db) / 2;
      for (let i = 0; i < SEG; i++) {
        const th = i / SEG * Math.PI * 2, sn = Math.sin(th), fo = dm * sn + dd * sn * sn, o = (r * SEG + i) * 3;
        pos[o] = cx + fx * fo; pos[o + 1] = cy + fy * fo; pos[o + 2] = w * Math.cos(th);
      }
    }
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  }

  /* ---------- Repères orthonormés ---------- */
  const _x = new T.Vector3(), _y = new T.Vector3(), _z = new T.Vector3();
  function setLimb(o, a, b, pole) {
    _y.copy(b).sub(a); const len = _y.length(); _y.divideScalar(len || 1);
    _z.copy(pole).addScaledVector(_y, -pole.dot(_y));
    if (_z.lengthSq() < 1e-6) { _z.set(1, 0, 0).addScaledVector(_y, -_y.x); if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1); }
    _z.normalize(); _x.crossVectors(_y, _z);
    o.matrix.makeBasis(_x, _y, _z).setPosition(a); o.matrixWorldNeedsUpdate = true;
  }

  /* ---------- Peinture des muscles : poids par sommet, couleur + lueur (émission) dans le shader ---------- */
  const ss = (a, b, x) => smooth(a, b, x);
  const band = (x, a, b, f) => ss(a - f, a + f, x) * (1 - ss(b - f, b + f, x));
  /* t = position le long du segment (0 → 1), c = orientation (+1 devant, −1 derrière), inn = côté intérieur */
  const PAINT = {
    thigh: (t, c, inn) => ({ quads: band(t, .06, .9, .07) * ss(-.2, .45, c), hams: band(t, .06, .86, .07) * ss(-.2, .45, -c),
      adductors: band(t, 0, .55, .08) * ss(.25, .8, inn), glutes: (1 - ss(.02, .15, t)) * ss(0, .5, -c) }),
    shin: (t, c) => ({ calves: band(t, .04, .62, .09) * ss(-.15, .5, -c) }),
    upper: (t, c) => ({ delts: (1 - ss(.1, .32, t)) * ss(-.5, .25, c), reardelts: (1 - ss(.1, .32, t)) * ss(-.25, .5, -c),
      biceps: band(t, .24, .92, .1) * ss(-.05, .55, c), triceps: band(t, .16, .92, .1) * ss(-.05, .55, -c) }),
    fore: t => ({ forearms: band(t, -.05, .72, .1) }),
    torso: (s, sn, cs) => ({ pecs: band(s, .33, .5, .035) * ss(.28, .7, sn), abs: band(s, .02, .32, .045) * ss(.5, .82, sn) * (1 - ss(.55, .82, Math.abs(cs))),
      lats: band(s, .17, .46, .06) * ss(-.15, .3, .25 - sn) * ss(.3, .75, Math.abs(cs)), traps: band(s, .42, .63, .04) * ss(-.25, .45, -sn),
      lowback: band(s, -.02, .25, .05) * ss(.45, .85, -sn) * (1 - ss(.5, .85, Math.abs(cs))), glutes: band(s, -.13, .06, .04) * ss(.15, .65, -sn) })
  };
  const GLOW_HOOK = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 glow;\nvarying vec3 vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vGlow;');
  };
  function paintable(geo, weightsOf) {
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('glow', new T.BufferAttribute(new Float32Array(n * 3), 3));
    const w = {};
    for (let i = 0; i < n; i++) {
      const o = weightsOf(i);
      for (const id in o) if (o[id] > .01) { (w[id] = w[id] || new Float32Array(n))[i] = o[id]; }
    }
    return { geo, n, w, best: new Float32Array(n), who: new Int8Array(n) };
  }
  function limbWeights(geo, kind, len, innerSign) {
    const pos = geo.attributes.position, f = PAINT[kind];
    return i => { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), r = Math.hypot(x, z) || 1; return f(y / len, z / r, innerSign * x / r); };
  }

  /* ---------- Mannequin ---------- */
  const t1 = new T.Vector3(), t2 = new T.Vector3(), t3 = new T.Vector3(), t4 = new T.Vector3(), t5 = new T.Vector3();
  class Rig {
    constructor(ghost) {
      this.g = new T.Group(); this.ghost = !!ghost; this.mm = {}; this.anchors = {}; this.painted = []; this.geos = [];
      const skin = this.skin = ghost
        ? new T.MeshStandardMaterial({ color: lin(0xe3ebe7), roughness: .6, transparent: true, opacity: .13, depthWrite: false })
        : new T.MeshStandardMaterial({ color: lin(PAL.skin), roughness: .55, metalness: 0, envMapIntensity: .9 });
      this.skinColor = skin.color.clone();
      const body = ghost ? skin : new T.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .55, metalness: 0, envMapIntensity: .9 });
      if (!ghost) body.onBeforeCompile = GLOW_HOOK;
      const mat = (hex, rough) => ghost ? skin : new T.MeshStandardMaterial({ color: lin(hex), roughness: rough, metalness: 0, envMapIntensity: .8 });
      const hair = mat(PAL.hair, .7), shoe = mat(PAL.shoe, .55), sole = mat(PAL.sole, .8);
      this.mats = ghost ? [skin] : [skin, body, hair, shoe, sole];
      const mk = (geo, m, parent, manual) => {
        const o = new T.Mesh(geo, m); o.castShadow = !ghost; o.receiveShadow = !ghost;
        if (manual) o.matrixAutoUpdate = false;
        (parent || this.g).add(o); return o;
      };
      const frame = () => { const o = new T.Group(); o.matrixAutoUpdate = false; this.g.add(o); return o; };
      const muscle = (parent, id, x, y, z, sx, sy, sz) => {
        let m = skin;
        if (!ghost) { m = this.mm[id]; if (!m) { m = this.mm[id] = skin.clone(); this.mats.push(m); } }
        const o = mk(GEO.sph, m, parent); o.position.set(x, y, z); o.scale.set(sx, sy, sz);
        (this.anchors[id] = this.anchors[id] || []).push(o); return o;
      };
      const limb = (kind, len, inner) => {
        const geo = GEO[kind].clone(); this.geos.push(geo);
        if (!ghost) this.painted.push(paintable(geo, limbWeights(geo, kind, len, inner)));
        return mk(geo, body, null, true);
      };

      const tg = torsoGeometry(); this.geos.push(tg);
      this.torso = mk(tg, body);
      if (!ghost) this.painted.push(paintable(tg, i => { const r = Math.floor(i / SEG), th = (i % SEG) / SEG * Math.PI * 2; return PAINT.torso(TORSO[r][0], Math.sin(th), Math.cos(th)); }));
      this.lo = frame(); this.up = frame(); this.hd = frame();
      for (const s of [-1, 1]) {
        muscle(this.lo, 'glutes', s * .068, -.035, -.07, .066, .08, .044);
        muscle(this.up, 'lats', s * .15, -.16, -.03, .036, .11, .06);
      }
      muscle(this.up, 'traps', 0, .01, -.05, .1, .06, .032);
      const anchorOnly = (parent, id, x, y, z) => { const o = new T.Object3D(); o.position.set(x, y, z); parent.add(o); (this.anchors[id] = this.anchors[id] || []).push(o); return o; };
      anchorOnly(this.lo, 'abs', 0, .17, .1); anchorOnly(this.up, 'abs', 0, -.27, .11);
      for (const s of [-1, 1]) { anchorOnly(this.lo, 'lowback', s * .045, .14, -.1); anchorOnly(this.up, 'pecs', s * .085, -.1, .13); }

      const skull = mk(GEO.sph, skin, this.hd); skull.position.set(0, .01, -.005); skull.scale.set(.092, .105, .1);
      const jaw = mk(GEO.sph, skin, this.hd); jaw.position.set(0, -.05, .022); jaw.scale.set(.062, .058, .07);
      for (const s of [-1, 1]) { const ear = mk(GEO.sph, skin, this.hd); ear.position.set(s * .087, -.034, -.004); ear.scale.set(.016, .026, .02); }
      const cap = mk(GEO.hair, hair, this.hd); cap.position.set(0, .012, -.012); cap.scale.set(.097, .11, .105); cap.rotation.x = -.5;
      this.neck = mk(GEO.neck, skin, null, true);

      this.sides = {};
      for (const side of ['R', 'L']) {
        const o = {}, inner = side === 'R' ? -1 : 1;
        o.thigh = limb('thigh', L.thigh, inner); o.shin = limb('shin', L.shin, inner);
        o.upper = limb('upper', L.upper, inner); o.fore = limb('fore', L.fore, inner);
        muscle(o.thigh, 'quads', 0, .2, .03, .055, .15, .045);
        o.vmo = muscle(o.thigh, 'quads', 0, .36, .024, .032, .055, .03);
        muscle(o.thigh, 'hams', 0, .22, -.028, .052, .15, .042);
        for (const s of [-1, 1]) muscle(o.shin, 'calves', s * .015, .12, -.024, .026, .085, .03);
        muscle(o.upper, 'delts', 0, .03, .004, .064, .088, .062);
        muscle(o.upper, 'biceps', 0, .15, .024, .036, .085, .031);
        muscle(o.upper, 'triceps', 0, .13, -.026, .039, .1, .033);
        muscle(o.fore, 'forearms', 0, .085, .012, .039, .085, .031);
        o.addA = anchorOnly(o.thigh, 'adductors', 0, .13, 0); anchorOnly(o.upper, 'reardelts', 0, .04, -.056);
        const hand = mk(GEO.sph, skin, o.fore); hand.position.set(0, .283, .004); hand.scale.set(.036, .054, .027);
        const knee = mk(GEO.sph, skin, o.shin); knee.position.set(0, -.004, .028); knee.scale.setScalar(.034);
        const elbow = mk(GEO.sph, skin, o.fore); elbow.position.set(0, -.004, -.012); elbow.scale.setScalar(.038);
        o.foot = frame();
        const sh = mk(GEO.sph, shoe, o.foot); sh.position.set(0, .03, 0); sh.scale.set(.13, .043, .05);
        const so = mk(GEO.sph, sole, o.foot); so.position.set(0, .006, 0); so.scale.set(.136, .016, .052);
        o.ankle = mk(GEO.sph, skin); o.ankle.scale.setScalar(.036);
        this.sides[side] = o;
      }
      this.muscles(null, 0);
    }

    pose(J) {
      const p = J.p;
      torsoUpdate(this.torso.geometry, J);
      const frm = (o, up, front, pos) => setLimb(o, pos, t4.copy(pos).add(up), front);
      frm(this.lo, V(J.d1, t1), V(J.f1, t2), V(J.H, t3));
      frm(this.up, V(J.d2, t1), V(J.f2, t2), V(J.S, t3));
      const ha = (p.t + p.c + p.n) * R2D;
      frm(this.hd, t1.set(Math.sin(ha), Math.cos(ha), 0), t2.set(Math.cos(ha), -Math.sin(ha), 0), V(J.head, t3));
      V(J.S, t3).addScaledVector(V(J.d2, t1), .02);
      setLimb(this.neck, t3, V(J.neckTop, t4), V(J.f2, t2));
      const kp = p.kp, kq = p.kq || [kp[0], kp[1], -kp[2]], ep = p.ep, eq = p.eq || [ep[0], ep[1], -ep[2]];
      for (const side of ['R', 'L']) {
        const o = this.sides[side], R = side === 'R';
        const kpole = V(R ? kp : kq, t5);
        setLimb(o.thigh, V(R ? J.hipR : J.hipL, t1), V(R ? J.kneeR : J.kneeL, t2), kpole);
        const xz = o.thigh.matrix.elements[2], sgn = (R ? -xz : xz) >= 0 ? 1 : -1;
        o.vmo.position.x = sgn * .028; o.addA.position.x = sgn * .06;
        setLimb(o.shin, V(R ? J.kneeR : J.kneeL, t1), V(R ? J.ankR : J.ankL, t2), kpole);
        const epole = V(R ? ep : eq, t5).negate();
        setLimb(o.upper, V(R ? J.shR : J.shL, t1), V(R ? J.elR : J.elL, t2), epole);
        setLimb(o.fore, V(R ? J.elR : J.elL, t1), V(R ? J.haR : J.haL, t2), epole);
        const F = R ? J.footR : J.footL;
        V(F.heel, t1); V(F.toe, t2);
        const fx = t3.copy(t2).sub(t1).normalize(), fz = t4.set(0, 0, 1), fy = t5.crossVectors(fz, fx).normalize();
        o.foot.matrix.makeBasis(fx, fy, fz).setPosition(t1.add(t2).multiplyScalar(.5)); o.foot.matrixWorldNeedsUpdate = true;
        const an = R ? J.ankR : J.ankL; o.ankle.position.set(an[0], an[1], an[2]);
      }
    }

    /* Couleur des muscles : rouge = principaux, ambre = secondaires ; l'intensité suit l'effort (act) */
    muscles(mus, act = .8) {
      if (this.ghost) return;
      const P = (mus && mus.p) || [], S = (mus && mus.s) || [], sk = this.skinColor;
      const key = P.join() + '|' + S.join() + '|' + Math.round(act * 40);
      if (key === this._key) return; this._key = key;
      const lv = {};
      for (const id of [...S, ...P]) {
        const hot = P.includes(id), c = hot ? HOT : WARM;
        lv[id] = { c: sk.clone().lerp(c, hot ? .62 + .38 * act : .45 + .3 * act), g: c.clone().multiplyScalar(hot ? .1 + .34 * act : .04 + .1 * act), rank: hot ? 2 : 1 };
      }
      for (const id in this.mm) {
        const m = this.mm[id], L2 = lv[id];
        if (!L2) { m.color.copy(sk); m.emissive.setRGB(0, 0, 0); } else { m.color.copy(L2.c); m.emissive.copy(L2.g); }
      }
      for (const pm of this.painted) {
        const col = pm.geo.attributes.color.array, glow = pm.geo.attributes.glow.array, best = pm.best, who = pm.who, n = pm.n, ids = [];
        best.fill(0); who.fill(-1);
        for (const id in pm.w) {
          const L2 = lv[id]; if (!L2) continue;
          const k = ids.push(L2) - 1, w = pm.w[id];
          for (let i = 0; i < n; i++) { const v = w[i] * (L2.rank === 2 ? 1 : .92); if (v > best[i]) { best[i] = v; who[i] = k; } }
        }
        for (let i = 0, j = 0; i < n; i++, j += 3) {
          const k = who[i];
          if (k < 0) { col[j] = sk.r; col[j + 1] = sk.g; col[j + 2] = sk.b; glow[j] = glow[j + 1] = glow[j + 2] = 0; continue; }
          const L2 = ids[k], b = Math.min(1, best[i]);
          col[j] = sk.r + (L2.c.r - sk.r) * b; col[j + 1] = sk.g + (L2.c.g - sk.g) * b; col[j + 2] = sk.b + (L2.c.b - sk.b) * b;
          glow[j] = L2.g.r * b; glow[j + 1] = L2.g.g * b; glow[j + 2] = L2.g.b * b;
        }
        pm.geo.attributes.color.needsUpdate = true; pm.geo.attributes.glow.needsUpdate = true;
      }
    }

    /* Point d'ancrage d'un muscle (côté visible par la caméra) */
    anchor(id, camPos, out) {
      const list = this.anchors[id]; if (!list || !list.length) return null;
      let best = null, bd = 1e9;
      for (const m of list) { m.getWorldPosition(t1); const d = t1.distanceToSquared(camPos); if (d < bd) { bd = d; best = m; } }
      return best.getWorldPosition(out || new T.Vector3());
    }

    dispose() { for (const g of this.geos) g.dispose(); for (const m of this.mats) m.dispose(); }
  }

  /* ---------- Matériel : mêmes appels que le rendu 2D (P.box, P.cyl, P.barbell…), en maillages 3D réutilisés ---------- */
  const MATS = new Map();
  const PRESET = {
    '178,186,182': [0xcfd5d8, .22, .95], '66,74,71': [0x30363a, .7, .08], '52,100,200': [0x2c5fd0, .5, .05], '38,42,41': [0x222526, .78, 0],
    '58,64,62': [0x2c3235, .85, 0], '196,204,200': [0xdce1e3, .3, .85], '44,68,60': [0x1c2622, 1, 0], '214,200,160': [0xd4c49a, .9, 0], '58,150,90': [0x2f9a58, .5, .05]
  };
  function propMat(col, alpha = 1, flat = false) {
    const k = col.join(','), key = k + '|' + alpha + '|' + flat;
    let m = MATS.get(key); if (m) return m;
    const [hex, rough, metal] = PRESET[k] || [(col[0] << 16) | (col[1] << 8) | col[2], .6, .1];
    m = new T.MeshStandardMaterial({ color: lin(hex), roughness: rough, metalness: metal, flatShading: flat, envMapIntensity: 1 });
    if (alpha < 1) { m.transparent = true; m.opacity = alpha; m.depthWrite = false; }
    MATS.set(key, m); return m;
  }
  const q1 = new T.Vector3(), q2 = new T.Vector3(), q3 = new T.Vector3(), q4 = new T.Vector3(), qv = new T.Vector3();
  class Props {
    constructor(parent) { this.g = new T.Group(); parent.add(this.g); this.pool = []; this.i = 0; this.camDir = new T.Vector3(0, 0, 1); this.api = this.makeApi(); }
    begin(camDir) { this.i = 0; if (camDir) this.camDir.copy(camDir); }
    end() { for (let k = this.i; k < this.pool.length; k++) this.pool[k].visible = false; }
    take(geo, mat) {
      let m = this.pool[this.i];
      if (!m) { m = new T.Mesh(geo, mat); m.matrixAutoUpdate = false; m.castShadow = true; m.receiveShadow = true; this.g.add(m); this.pool[this.i] = m; }
      m.geometry = geo; m.material = mat; m.visible = true; this.i++; return m;
    }
    makeApi() {
      const self = this, C = A.COL;
      const box = (c, ax, ay, az, color) => {
        q1.set(ax[0], ax[1], ax[2]); q2.set(ay[0], ay[1], ay[2]); q3.set(az[0], az[1], az[2]);
        if (q4.crossVectors(q1, q2).dot(q3) < 0) q3.negate();
        const m = self.take(GEO.box, propMat(color || C.iron));
        m.matrix.makeBasis(q1, q2, q3).setPosition(c[0], c[1], c[2]); m.matrixWorldNeedsUpdate = true; return m;
      };
      const cyl = (a, b, r, color, _bias, _cap, alpha = 1, geo = GEO.cyl, flat = false) => {
        q2.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = q2.length(); if (len < 1e-6) return null;
        q4.copy(q2).divideScalar(len);
        if (Math.abs(q4.y) < .9) q1.set(0, 1, 0).addScaledVector(q4, -q4.y); else q1.set(1, 0, 0).addScaledVector(q4, -q4.x);
        q1.normalize(); q3.crossVectors(q1, q4).multiplyScalar(r); q1.multiplyScalar(r);
        const m = self.take(geo, propMat(color || C.steel, alpha, flat));
        m.matrix.makeBasis(q1, q2, q3).setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.matrixWorldNeedsUpdate = true; return m;
      };
      const line = (a, b, w, color) => cyl(a, b, Math.max(.004, w / 2), color || C.cable);
      const barbell = (c, o = {}) => {
        const r = o.plateR ?? .225, half = o.half ?? 1.05, pz = o.pz ?? .74, col = o.plate || C.plate, inner = pz - .045;
        cyl([c[0], c[1], -inner], [c[0], c[1], inner], .0145, C.steel);
        for (const s of [-1, 1]) {
          const al = s * self.camDir.z > .62 ? .38 : 1;
          cyl([c[0], c[1], s * inner], [c[0], c[1], s * (inner + .03)], .036, C.steel, 0, 0, al);
          cyl([c[0], c[1], s * (inner + .03)], [c[0], c[1], s * half], .025, C.steel, 0, 0, al);
          cyl([c[0], c[1], s * pz], [c[0], c[1], s * (pz + .06)], r, col, 0, 0, al, GEO.disc);
          cyl([c[0], c[1], s * (pz + .06)], [c[0], c[1], s * (pz + .066)], .056, C.steel, 0, 0, al);
          cyl([c[0], c[1], s * (pz + .075)], [c[0], c[1], s * (pz + .1)], .034, C.iron, 0, 0, al);
        }
        return [];
      };
      const db = (c, axis, o = {}) => {
        qv.set(axis[0], axis[1], axis[2]).normalize();
        const h = o.half ?? .075, hr = o.r ?? .058, hl = o.len ?? .055, at = k => [c[0] + qv.x * k, c[1] + qv.y * k, c[2] + qv.z * k];
        const e0 = at(-h - .004), e1 = at(h + .004), a0 = at(-h - hl), a1 = at(-h), b0 = at(h), b1 = at(h + hl);
        cyl(e0, e1, .016, C.steel);
        cyl(a0, a1, hr, C.rubber, 0, 0, 1, GEO.hex, true);
        cyl(b0, b1, hr, C.rubber, 0, 0, 1, GEO.hex, true);
        return [];
      };
      const bench = (x0, x1, y = .43) => {
        const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2;
        box([cx, y - .045, 0], [hw, 0, 0], [0, .045, 0], [0, 0, .14], C.pad);
        box([cx, y - .1, 0], [hw - .04, 0, 0], [0, .012, 0], [0, 0, .06], C.iron);
        for (const lx of [x0 + .1, x1 - .1]) {
          box([lx, (y - .1) / 2, 0], [.025, 0, 0], [0, (y - .1) / 2, 0], [0, 0, .025], C.iron);
          box([lx, .015, 0], [.03, 0, 0], [0, .015, 0], [0, 0, .2], C.iron);
        }
        return [];
      };
      const pad = (c, dir, hl, thick = .04, hw = .14) => {
        q1.set(dir[0], dir[1], dir[2]).normalize(); const n = [-q1.y, q1.x, 0];
        return box(c, [q1.x * hl, q1.y * hl, q1.z * hl], [n[0] * thick, n[1] * thick, 0], [0, 0, hw], C.pad);
      };
      const tower = (x, z = 0, h = 2.2) => box([x, h / 2, z], [.08, 0, 0], [0, h / 2, 0], [0, 0, .08], C.iron);
      const pulley = c => cyl([c[0], c[1], c[2] - .022], [c[0], c[1], c[2] + .022], .05, C.steel);
      return { box, cyl, line, barbell, db, bench, pad, tower, pulley, floor: () => [] };
    }
  }

  G.anim3d = { T, GEO, PAL, lin, Rig, Props, propMat, R2D };
})(window.GYM = window.GYM || {});

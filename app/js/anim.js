/* Moteur d'animation : mannequin 3D, cinématique inverse (IK) à 2 os,
   projection orthographique avec lacet (rotation autour du corps) et légère plongée.
   Unités : mètres. Repère : x = avant du pratiquant, y = haut, z = côté droit. */
(function (G) {
  'use strict';
  const D = Math.PI / 180;
  const L = { shin: .44, thigh: .44, sp1: .26, sp2: .26, neck: .10, headR: .105, upper: .30, fore: .31, ankleH: .08, hipHalf: .09, shHalf: .18 };
  L.torso = L.sp1 + L.sp2; L.arm = L.upper + L.fore; L.leg = L.thigh + L.shin;

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dirT = deg => [Math.sin(deg * D), Math.cos(deg * D), 0];      // axe du tronc (penché vers l'avant si deg > 0)
  const faceT = deg => [Math.cos(deg * D), -Math.sin(deg * D), 0];    // normale « avant » du tronc
  const perp = u => { const r = Math.abs(u[1]) < .9 ? [0, 1, 0] : [1, 0, 0]; return nrm(sub(r, mul(u, dot(r, u)))); };

  /* IK 2 os : racine A, cible T, longueurs l1/l2, vecteur de pôle (direction de flexion). */
  function ik(A, T, l1, l2, pole) {
    const d = sub(T, A); let dist = len(d);
    const u = dist > 1e-6 ? mul(d, 1 / dist) : [0, -1, 0];
    dist = clamp(dist, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
    let p = sub(pole, mul(u, dot(pole, u)));
    const w = len(p) < 1e-5 ? perp(u) : nrm(p);
    const ca = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const sa = Math.sqrt(1 - ca * ca);
    return [add(A, add(mul(u, l1 * ca), mul(w, l1 * sa))), add(A, mul(u, dist))];
  }

  const DEF = { hx: 0, hy: .955, t: 0, c: 0, n: 0, ax: 0, ay: L.ankleH, az: .12, aa: 0,
    kp: [1, 0, .12], ep: [-1, -.25, .25], hf: 's', wx: .02, wy: -.6, wz: .21 };

  function shoulderOf(p) {
    const q = Object.assign({}, DEF, p);
    const H = [q.hx, q.hy, 0], M = add(H, mul(dirT(q.t), L.sp1));
    return add(M, mul(dirT(q.t + q.c), L.sp2));
  }

  function footPts(A, aa) {
    const c = Math.cos(aa * D), s = Math.sin(aa * D);
    const r = (x, y) => [A[0] + x * c - y * s, A[1] + x * s + y * c, A[2]];
    return { ank: A, heel: r(-.06, -.062), toe: r(.18, -.068), ball: r(.13, -.06), top: r(.08, -.02) };
  }

  /* Pose (paramètres) -> articulations 3D */
  function solve(P) {
    const p = Object.assign({}, DEF, P);
    const H = [p.hx, p.hy, 0];
    const d1 = dirT(p.t), d2 = dirT(p.t + p.c);
    const M = add(H, mul(d1, L.sp1)), S = add(M, mul(d2, L.sp2));
    const f1 = faceT(p.t), f2 = faceT(p.t + p.c), dh = dirT(p.t + p.c + p.n);
    const head = add(S, mul(dh, L.neck + L.headR));
    const neckTop = add(S, mul(dh, L.neck + .02));
    const hipR = [H[0], H[1], L.hipHalf], hipL = [H[0], H[1], -L.hipHalf];
    const shR = [S[0], S[1], L.shHalf], shL = [S[0], S[1], -L.shHalf];
    const kp = p.kp, kq = p.kq || [kp[0], kp[1], -kp[2]];
    const tR = [p.ax, p.ay, p.az];
    const tL = [p.bx ?? p.ax, p.by ?? p.ay, -(p.bz ?? p.az)];
    const [kneeR, ankR] = ik(hipR, tR, L.thigh, L.shin, kp);
    const [kneeL, ankL] = ik(hipL, tL, L.thigh, L.shin, kq);
    const toW = (x, y, z) => p.hf === 'w' ? [x, y, z]
      : p.hf === 't' ? [S[0] + f2[0] * x + d2[0] * y, S[1] + f2[1] * x + d2[1] * y, z]
        : [S[0] + x, S[1] + y, z];
    const hR = toW(p.wx, p.wy, p.wz);
    const hL = toW(p.vx ?? p.wx, p.vy ?? p.wy, -(p.vz ?? p.wz));
    const ep = p.ep, eq = p.eq || [ep[0], ep[1], -ep[2]];
    const [elR, haR] = ik(shR, hR, L.upper, L.fore, ep);
    const [elL, haL] = ik(shL, hL, L.upper, L.fore, eq);
    return { p, H, M, S, head, neckTop, d1, d2, f1, f2, dh, hipR, hipL, shR, shL, kneeR, kneeL, ankR, ankL, elR, elL, haR, haL,
      footR: footPts(ankR, p.aa), footL: footPts(ankL, p.ba ?? p.aa), handTarget: [hR, hL] };
  }

  /* Interpolation de poses (clés numériques et vecteurs) */
  function lerpPose(A, B, t) {
    const o = {};
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const a = A[k], b = B[k];
      if (typeof a === 'number' && typeof b === 'number') o[k] = lerp(a, b, t);
      else if (Array.isArray(a) && Array.isArray(b)) o[k] = a.map((x, i) => lerp(x, b[i], t));
      else o[k] = a !== undefined ? a : b;
    }
    return o;
  }
  function keys(frames, u) {
    if (u <= frames[0][0]) return Object.assign({}, frames[0][1]);
    for (let i = 1; i < frames.length; i++) {
      const [u1, p1] = frames[i];
      if (u <= u1) { const [u0, p0] = frames[i - 1]; return lerpPose(p0, p1, (u - u0) / (u1 - u0 || 1)); }
    }
    return Object.assign({}, frames[frames.length - 1][1]);
  }

  /* Bras tendus vers une barre en x = barX : calcule la hauteur de la barre */
  function hang(p, barX, gz) {
    const S = shoulderOf(p), dz = gz - L.shHalf;
    const r = Math.sqrt(Math.max(0, (L.arm - .004) ** 2 - dz * dz));
    const dx = S[0] - barX, dy = Math.sqrt(Math.max(0, r * r - dx * dx));
    Object.assign(p, { hf: 'w', wx: barX, wy: S[1] - dy, wz: gz });
    return p.wy;
  }
  /* Inclinaison du tronc pour que des bras tendus atteignent la barre */
  function torsoForBar(hx, hy, bx, by, gz) {
    const dz = gz - L.shHalf, A = Math.sqrt((L.arm - .004) ** 2 - dz * dz), T = L.torso;
    const dx = bx - hx, dy = by - hy, R = Math.hypot(dx, dy);
    const cv = clamp((T * T + R * R - A * A) / (2 * T * R), -1, 1);
    return Math.atan2(dx, dy) / D - Math.acos(cv) / D;
  }
  /* Point dans le repère du haut du tronc (x = vers l'avant, y = le long du tronc) */
  function torsoPt(p, x, y, z = 0) {
    const q = Object.assign({}, DEF, p), S = shoulderOf(q), f = faceT(q.t + q.c), d = dirT(q.t + q.c);
    return [S[0] + f[0] * x + d[0] * y, S[1] + f[1] * x + d[1] * y, z];
  }

  /* Caméra : lacet (yaw) autour de l'axe vertical, plongée (pitch) */
  function Cam(yaw, pitch) {
    const cy = Math.cos(yaw * D), sy = Math.sin(yaw * D), cp = Math.cos(pitch * D), sp = Math.sin(pitch * D);
    return {
      yaw, pitch, view: [sy * cp, sp, cy * cp],
      p(v) { const x1 = v[0] * cy - v[2] * sy, z1 = v[0] * sy + v[2] * cy; return [x1, v[1] * cp - z1 * sp, z1 * cp + v[1] * sp]; },
      d(v) { const x1 = v[0] * cy - v[2] * sy, z1 = v[0] * sy + v[2] * cy; return [x1, v[1] * cp - z1 * sp]; }
    };
  }

  /* ---------- Rendu ---------- */
  const COL = {
    near: [233, 237, 231], far: [120, 130, 125], hair: [40, 46, 43], stage: '#101413',
    hot: [255, 92, 72], warm: [255, 184, 64],
    iron: [66, 74, 71], steel: [178, 186, 182], plate: [52, 100, 200], rubber: [38, 42, 41], pad: [58, 64, 62], cable: [196, 204, 200], wood: [120, 96, 70]
  };
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const shadeByDepth = (d, near = COL.near, far = COL.far) => mix(far, near, clamp((d + .22) / .44, 0, 1));

  function hull(pts) {
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (P.length < 3) return P;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    up.pop(); lo.pop(); return lo.concat(up);
  }
  function polyPath(ctx, V, pts) { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(V.x(q[0]), V.y(q[1])) : ctx.moveTo(V.x(q[0]), V.y(q[1]))); ctx.closePath(); }
  function capsulePath(ctx, a, b, ra, rb) {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
    ctx.beginPath();
    if (d <= Math.abs(ra - rb) + .5) { const big = ra > rb; ctx.arc(big ? a[0] : b[0], big ? a[1] : b[1], Math.max(ra, rb), 0, Math.PI * 2); return; }
    const ang = Math.atan2(dy, dx), th = Math.acos(clamp((ra - rb) / d, -1, 1));
    ctx.arc(a[0], a[1], ra, ang + th, ang + 2 * Math.PI - th);
    ctx.arc(b[0], b[1], rb, ang - th, ang + th);
    ctx.closePath();
  }
  /* Ellipse = projection d'un disque (centre c, axes unitaires e1/e2, rayons r1/r2) */
  function discPath(ctx, V, cam, c, e1, r1, e2, r2) {
    const C = cam.p(c), a = cam.d(e1), b = cam.d(e2), s = V.s;
    const m = [a[0] * r1 * s, -a[1] * r1 * s, b[0] * r2 * s, -b[1] * r2 * s];
    ctx.beginPath();
    if (Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-3) return false;
    ctx.save();
    ctx.transform(m[0], m[1], m[2], m[3], V.x(C[0]), V.y(C[1]));
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.restore();
    return true;
  }

  const MUS = {
    pecs: [{ seg: 'up', side: 1, s: .6, r1: .075, r2: .075, z: [.075, -.075] }],
    abs: [{ seg: 'lo', side: 1, s: .55, r1: .11, r2: .07 }],
    lats: [{ seg: 'up', side: -1, s: .4, r1: .12, r2: .07, z: [.09, -.09] }],
    traps: [{ seg: 'up', side: -1, s: .9, r1: .07, r2: .11 }],
    lowback: [{ seg: 'lo', side: -1, s: .5, r1: .10, r2: .06 }],
    delts: [{ joint: 'sh', r: .07, off: [0, .01, .035], fwd: .015 }],
    reardelts: [{ joint: 'sh', r: .06, off: [0, .01, .03], fwd: -.05 }],
    biceps: [{ seg: 'upper', side: 1, s: .55, r1: .09, r2: .038 }],
    triceps: [{ seg: 'upper', side: -1, s: .5, r1: .10, r2: .04 }],
    forearms: [{ seg: 'fore', side: 1, s: .32, r1: .08, r2: .032 }],
    quads: [{ seg: 'thigh', side: 1, s: .52, r1: .15, r2: .058 }],
    hams: [{ seg: 'thigh', side: -1, s: .52, r1: .14, r2: .052 }],
    glutes: [{ seg: 'thigh', side: -1, s: .06, r1: .085, r2: .075 }],
    adductors: [{ seg: 'thigh', side: 1, s: .3, r1: .09, r2: .035, inner: true }],
    calves: [{ seg: 'shin', side: -1, s: .3, r1: .11, r2: .042 }]
  };

  function figure(J, cam, opt = {}) {
    const out = [], pr = v => cam.p(v);
    const act = opt.act ?? .8, alpha = opt.alpha ?? 1, mus = opt.muscles || { p: [], s: [] };
    const hlList = [...(mus.p || []).map(m => [m, 1]), ...(mus.s || []).map(m => [m, 0])];
    const patchColor = (lvl) => lvl ? rgb(COL.hot, (.35 + .55 * act) * alpha) : rgb(COL.warm, (.2 + .35 * act) * alpha);
    const ring = opt.ring !== false;

    /* Muscles : ellipses 2D découpées dans la silhouette du segment, décalées vers la face qui travaille */
    function patch2D(ctx, V, axisA, axisB, s, n, r, r1, r2, lvl, extra) {
      const vis = dot(n, cam.view), k = clamp(.62 + .6 * vis, 0, 1); if (k <= .02) return;
      const A2 = cam.p(axisA), B2 = cam.p(axisB), n2 = cam.d(n);
      let cx = lerp(A2[0], B2[0], s) + n2[0] * r * .55, cy = lerp(A2[1], B2[1], s) + n2[1] * r * .55;
      if (extra) { const e = cam.d(extra); cx += e[0]; cy += e[1]; }
      const rot = Math.atan2(-(B2[1] - A2[1]), B2[0] - A2[0]);
      ctx.globalAlpha = k;
      ctx.beginPath(); ctx.ellipse(V.x(cx), V.y(cy), Math.max(1, r1 * V.s), Math.max(1, r2 * V.s), rot, 0, Math.PI * 2);
      ctx.fillStyle = patchColor(lvl); ctx.fill(); ctx.globalAlpha = 1;
    }
    function limbPatches(ctx, V, kind, a, b, ra, rb, sideSign) {
      if (!hlList.length) return;
      const u = nrm(sub(b, a)), h = Math.hypot(u[0], u[1]);
      const nf = h > .2 ? nrm([-u[1], u[0], 0]) : [1, 0, 0];
      for (const [m, lvl] of hlList) for (const d of (MUS[m] || [])) {
        if (d.seg !== kind) continue;
        let n = mul(nf, d.side);
        if (d.inner) n = nrm(add(mul(n, .4), [0, 0, -sideSign]));
        const r = lerp(ra, rb, d.s);
        patch2D(ctx, V, a, b, d.s, n, r, d.r1, r * .62, lvl);
      }
    }

    const limbs = [
      ['thigh', 'hipR', 'kneeR', .086, .06, 1], ['shin', 'kneeR', 'ankR', .06, .04, 1],
      ['thigh', 'hipL', 'kneeL', .086, .06, -1], ['shin', 'kneeL', 'ankL', .06, .04, -1],
      ['upper', 'shR', 'elR', .058, .045, 1], ['fore', 'elR', 'haR', .047, .033, 1],
      ['upper', 'shL', 'elL', .058, .045, -1], ['fore', 'elL', 'haL', .047, .033, -1]
    ];
    for (const [kind, ka, kb, ra, rb, side] of limbs) {
      const a = J[ka], b = J[kb], A = pr(a), B = pr(b), dep = (A[2] + B[2]) / 2 + (kind === 'fore' || kind === 'shin' ? .004 : 0);
      out.push({
        d: dep, pts: [A, B],
        draw(ctx, V) {
          const col = shadeByDepth(dep);
          capsulePath(ctx, [V.x(A[0]), V.y(A[1])], [V.x(B[0]), V.y(B[1])], ra * V.s, rb * V.s);
          ctx.fillStyle = rgb(col, alpha); ctx.fill();
          if (ring) { ctx.lineWidth = Math.max(1, V.s * .007); ctx.strokeStyle = COL.stage; ctx.stroke(); }
          if (hlList.length) { ctx.save(); ctx.clip(); limbPatches(ctx, V, kind, a, b, ra, rb, side); ctx.restore(); }
        }
      });
    }
    // Pieds
    for (const [fk, side] of [['footR', 1], ['footL', -1]]) {
      const F = J[fk], pts = [F.ank, F.heel, F.toe, F.top].map(pr), dep = pts.reduce((s, q) => s + q[2], 0) / 4 + .003;
      out.push({ d: dep, pts, draw(ctx, V) {
        polyPath(ctx, V, [pts[0], pts[1], pts[2], pts[3]]); ctx.fillStyle = rgb(shadeByDepth(dep), alpha);
        ctx.lineJoin = 'round'; ctx.lineWidth = V.s * .05; ctx.strokeStyle = rgb(shadeByDepth(dep), alpha); ctx.stroke(); ctx.fill();
      } });
    }
    // Mains
    for (const hk of ['haR', 'haL']) {
      const P = pr(J[hk]);
      out.push({ d: P[2] + .012, pts: [P], draw(ctx, V) {
        ctx.beginPath(); ctx.arc(V.x(P[0]), V.y(P[1]), .043 * V.s, 0, Math.PI * 2);
        ctx.fillStyle = rgb(shadeByDepth(P[2]), alpha); ctx.fill();
        if (ring) { ctx.lineWidth = Math.max(1, V.s * .006); ctx.strokeStyle = COL.stage; ctx.stroke(); }
      } });
    }
    // Tronc : deux blocs (lombaires / thorax)
    const z = [0, 0, 1];
    const block = (base, top, dir, f, wB, dB, wT, dT, kind) => {
      const c = [];
      for (const [P0, w, dd] of [[base, wB, dB], [top, wT, dT]])
        for (const sz of [-1, 1]) for (const sf of [-1, 1]) c.push(add(add(P0, mul(z, sz * w)), mul(f, sf * dd)));
      const pts = c.map(pr), dep = (pr(base)[2] + pr(top)[2]) / 2;
      return { d: dep - .001, pts, draw(ctx, V) {
        const hp = hull(pts), col = shadeByDepth(dep * .4, [218, 223, 217], [150, 160, 155]);
        polyPath(ctx, V, hp); ctx.fillStyle = rgb(col, alpha); ctx.lineJoin = 'round';
        ctx.lineWidth = V.s * .06; ctx.strokeStyle = rgb(col, alpha); ctx.stroke(); ctx.fill();
        if (!hlList.length) return;
        ctx.save(); polyPath(ctx, V, hp); ctx.clip();
        for (const [m, lvl] of hlList) for (const d of (MUS[m] || [])) {
          if (d.seg !== kind) continue;
          const n = mul(f, d.side), r = (kind === 'up' ? dT : dB) * 1.3;
          for (const zz of (d.z || [0])) patch2D(ctx, V, base, top, d.s, n, r, d.r1, d.r2, lvl, [0, 0, zz]);
        }
        ctx.restore();
      } };
    };
    out.push(block(J.H, J.M, J.d1, J.f1, .15, .1, .15, .095, 'lo'));
    out.push(block(J.M, J.S, J.d2, J.f2, .15, .1, .185, .115, 'up'));
    // Épaules (deltoïdes)
    for (const [sk, sgn] of [['shR', 1], ['shL', -1]]) {
      const P0 = J[sk];
      out.push({ d: pr(P0)[2] + .002, pts: [pr(P0)], draw(ctx, V) {
        for (const [m, lvl] of hlList) for (const d of (MUS[m] || [])) {
          if (d.joint !== 'sh') continue;
          const c = add(add(P0, [d.off[0], d.off[1], d.off[2] * sgn]), mul(J.f2, d.fwd));
          const C = pr(c); ctx.beginPath(); ctx.arc(V.x(C[0]), V.y(C[1]), d.r * V.s, 0, Math.PI * 2);
          ctx.fillStyle = patchColor(lvl); ctx.fill();
        }
      } });
    }
    // Cou + tête
    const Hd = pr(J.head), Sp = pr(J.S), Nt = pr(J.neckTop);
    out.push({ d: Hd[2] + .001, pts: [Hd, [Hd[0], Hd[1] + L.headR], [Hd[0], Hd[1] - L.headR], [Hd[0] - L.headR, Hd[1]], [Hd[0] + L.headR, Hd[1]]], draw(ctx, V) {
      const col = rgb(shadeByDepth(Hd[2] * .4, [226, 230, 224], [150, 160, 155]), alpha);
      capsulePath(ctx, [V.x(Sp[0]), V.y(Sp[1])], [V.x(Nt[0]), V.y(Nt[1])], .05 * V.s, .045 * V.s); ctx.fillStyle = col; ctx.fill();
      const cx = V.x(Hd[0]), cy = V.y(Hd[1]), r = L.headR * V.s;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      // cheveux côté nuque : indique l'orientation du visage
      const fv = cam.d(J.f2), up = cam.d(J.dh), fl = Math.hypot(fv[0], fv[1]);
      const upA = Math.atan2(-up[1], up[0]);
      const back = fl > .3 ? Math.atan2(fv[1], -fv[0]) : upA;
      const a0 = Math.atan2(Math.sin(back) + Math.sin(upA), Math.cos(back) + Math.cos(upA));
      const span = fl > .3 ? 1.35 : 1.1;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.01, a0 - span, a0 + span); ctx.closePath();
      ctx.fillStyle = rgb(COL.hair, alpha); ctx.fill();
    } });
    return out;
  }

  /* ---------- Accessoires ---------- */
  function mkProps(cam) {
    const pr = v => cam.p(v);
    const light = nrm([.35, .9, .45]);
    const shade = (c, n) => mix(c.map(x => x * .55), c, clamp(.35 + .65 * Math.max(0, dot(n, light)), 0, 1));
    const P = {};
    P.box = (c, ax, ay, az, color, bias = 0) => {
      const corners = []; for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) corners.push(add(add(add(c, mul(ax, i)), mul(ay, j)), mul(az, k)));
      const pts = corners.map(pr);
      return { d: pr(c)[2] + bias, pts, draw(ctx, V) {
        for (const [A, B, C] of [[ax, ay, az], [ay, az, ax], [az, ax, ay]]) for (const s of [-1, 1]) {
          const n = nrm(mul(A, s)); if (dot(n, cam.view) <= .001) continue;
          const f0 = add(c, mul(A, s)), q = [add(add(f0, B), C), add(sub(f0, B), C), sub(sub(f0, B), C), sub(add(f0, B), C)].map(pr);
          polyPath(ctx, V, q); ctx.fillStyle = rgb(shade(color, n)); ctx.fill();
          ctx.lineWidth = 1; ctx.strokeStyle = rgb(shade(color, n)); ctx.stroke();
        }
      } };
    };
    P.cyl = (a, b, r, color, bias = 0, capCol, alpha = 1) => {
      const u = nrm(sub(b, a)), e1 = perp(u), e2 = nrm(cross(u, e1)), ring = [];
      for (let i = 0; i < 20; i++) { const t = i / 20 * Math.PI * 2, o = add(mul(e1, Math.cos(t) * r), mul(e2, Math.sin(t) * r)); ring.push(pr(add(a, o)), pr(add(b, o))); }
      const mid = pr(mul(add(a, b), .5));
      return { d: mid[2] + bias, pts: ring, draw(ctx, V) {
        ctx.save(); ctx.globalAlpha *= alpha;
        polyPath(ctx, V, hull(ring)); ctx.fillStyle = rgb(color); ctx.fill();
        const near = dot(u, cam.view) > 0 ? [b, u] : [a, mul(u, -1)];
        if (Math.abs(dot(u, cam.view)) > .05) { discPath(ctx, V, cam, near[0], e1, r, e2, r); ctx.fillStyle = rgb(capCol || mix(color, [255, 255, 255], .18)); ctx.fill(); }
        if (alpha < 1) { polyPath(ctx, V, hull(ring)); ctx.globalAlpha = .9; ctx.lineWidth = Math.max(1, V.s * .006); ctx.strokeStyle = rgb(mix(color, [255, 255, 255], .35)); ctx.stroke(); }
        ctx.restore();
      } };
    };
    P.line = (a, b, w, color, bias = 0) => {
      const A = pr(a), B = pr(b);
      return { d: (A[2] + B[2]) / 2 + bias, pts: [A, B], draw(ctx, V) {
        ctx.beginPath(); ctx.moveTo(V.x(A[0]), V.y(A[1])); ctx.lineTo(V.x(B[0]), V.y(B[1]));
        ctx.lineWidth = Math.max(1, w * V.s); ctx.lineCap = 'round'; ctx.strokeStyle = rgb(color); ctx.stroke();
      } };
    };
    /* Barre olympique + disques de 20 kg (bleus) le long de l'axe z */
    P.barbell = (c, o = {}) => {
      const r = o.plateR ?? .225, out = [], half = o.half ?? 1.05, pz = o.pz ?? .74;
      const cuts = [-half, -.45, 0, .45, half];
      for (let i = 0; i < 4; i++) out.push(P.cyl([c[0], c[1], cuts[i]], [c[0], c[1], cuts[i + 1]], .016, COL.steel, .002));
      for (const s of [-1, 1]) {
        const nearSide = pr([c[0], c[1], s * pz])[2] > pr([c[0], c[1], 0])[2] + .1;
        out.push(P.cyl([c[0], c[1], s * pz], [c[0], c[1], s * (pz + .06)], r, o.plate || COL.plate, 0, mix(o.plate || COL.plate, [255, 255, 255], .12), nearSide ? .42 : 1));
        out.push(P.cyl([c[0], c[1], s * (pz - .02)], [c[0], c[1], s * pz], .04, COL.steel));
      }
      return out;
    };
    /* Haltère : poignée le long de axis, têtes hexagonales approximées par des cylindres */
    P.db = (c, axis = [0, 0, 1], o = {}) => {
      const u = nrm(axis), h = o.half ?? .075, hr = o.r ?? .058, hl = o.len ?? .055;
      return [
        P.cyl(sub(c, mul(u, h)), add(c, mul(u, h)), .016, COL.steel, -.02),
        P.cyl(sub(c, mul(u, h + hl)), sub(c, mul(u, h)), hr, COL.rubber, -.02, [70, 76, 74]),
        P.cyl(add(c, mul(u, h)), add(c, mul(u, h + hl)), hr, COL.rubber, -.02, [70, 76, 74])
      ];
    };
    P.bench = (x0, x1, y = .43, o = {}) => {
      const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2, out = [];
      out.push(P.box([cx, y - .04, 0], [hw, 0, 0], [0, .04, 0], [0, 0, .135], COL.pad, o.bias ?? -.6));
      for (const lx of [x0 + .1, x1 - .1]) out.push(P.box([lx, (y - .08) / 2, 0], [.03, 0, 0], [0, (y - .08) / 2, 0], [0, 0, .12], COL.iron, (o.bias ?? -.6) - .01));
      return out;
    };
    /* Pad orienté (dossier incliné, etc.) : centre, direction longue, demi-longueur */
    P.pad = (c, dir, hl, thick = .04, hw = .14, bias = -.6) => {
      const u = nrm(dir), n = nrm(cross([0, 0, 1], u));
      return P.box(c, mul(u, hl), mul(n, thick), [0, 0, hw], COL.pad, bias);
    };
    P.tower = (x, z = 0, h = 2.2, bias = -.7) => P.box([x, h / 2, z], [.09, 0, 0], [0, h / 2, 0], [0, 0, .09], COL.iron, bias);
    P.pulley = (c, bias = -.05) => P.cyl(add(c, [0, 0, -.02]), add(c, [0, 0, .02]), .05, COL.steel, bias);
    P.floor = () => [];
    return P;
  }

  /* ---------- Scène complète ---------- */
  function scene(ex, u, cam, opt = {}) {
    const p = ex.pose(u);
    const J = solve(p);
    const P = mkProps(cam);
    const list = figure(J, cam, { muscles: opt.noMuscles ? null : ex.muscles, act: opt.act, alpha: opt.alpha, ring: opt.ring });
    if (ex.props) for (const d of [].concat(...ex.props(J, P, p).map(x => [].concat(x)))) if (d) list.push(d);
    list.sort((a, b) => a.d - b.d);
    return { J, list, p };
  }

  function bounds(ex, cam, samples = [0, .2, .4, .6, .8, 1]) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const u of samples) for (const d of scene(ex, u, cam, { noMuscles: true }).list) for (const q of d.pts) {
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    }
    return { x0: x0 - .08, x1: x1 + .08, y0: Math.min(y0, -.02) - .04, y1: y1 + .1 };
  }

  function viewport(b, W, H, padFrac = .06) {
    const s = Math.min(W * (1 - 2 * padFrac) / (b.x1 - b.x0), H * (1 - 2 * padFrac) / (b.y1 - b.y0));
    const ox = W / 2 - s * (b.x0 + b.x1) / 2, oy = H / 2 + s * (b.y0 + b.y1) / 2;
    return { s, x: X => ox + X * s, y: Y => oy - Y * s };
  }

  function drawFloor(ctx, V, cam, b) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    const span = 3;
    for (let i = -span; i <= span; i += .5) {
      for (const [a, c] of [[[i, 0, -span], [i, 0, span]], [[-span, 0, i], [span, 0, i]]]) {
        const A = cam.p(a), C = cam.p(c); ctx.beginPath(); ctx.moveTo(V.x(A[0]), V.y(A[1])); ctx.lineTo(V.x(C[0]), V.y(C[1])); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawShadow(ctx, V, cam, J) {
    const c = [(J.ankR[0] + J.ankL[0]) / 2 * .5 + J.H[0] * .5, 0, 0];
    discPath(ctx, V, cam, c, [1, 0, 0], .42, [0, 0, 1], .3);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
  }

  G.anim = { L, D, DEF, solve, keys, lerpPose, hang, torsoForBar, torsoPt, shoulderOf, Cam, scene, bounds, viewport, drawFloor, drawShadow, COL, rgb, mix,
    v: { add, sub, mul, dot, cross, len, nrm, lerp, clamp, dirT, faceT } };
})(window.GYM = window.GYM || {});

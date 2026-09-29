/* Graphiques SVG : courbes (réticule + infobulle au survol), barres horizontales avec zone cible, sparklines.
   Couleurs uniquement via les variables CSS du thème (clair/sombre). */
(function (G) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const t = s => new Date(s + 'T12:00:00').getTime();
  function nice(lo, hi, n = 4) {
    if (lo === hi) { lo -= 1; hi += 1; }
    const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, ticks = [];
    for (let v = a; v <= b + step / 2; v += step) ticks.push(+v.toFixed(6));
    return { lo: a, hi: b, ticks, step };
  }
  const el = (name, attrs = {}, parent) => { const e = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };

  /* series : [{name, color, points:[{x:'AAAA-MM-JJ', y}], line:true, dots:'all'|'end'|'small', area:bool}] */
  function line(host, o) {
    host.innerHTML = ''; host.classList.add('chart');
    const W = Math.max(260, host.clientWidth || 320), H = o.height || 200, m = { l: 44, r: o.endLabel ? 52 : 14, t: 12, b: 26 };
    const pts = o.series.flatMap(s => s.points);
    if (!pts.length) { host.innerHTML = `<p class="empty">${G.esc(o.empty || 'Pas encore de données.')}</p>`; return; }
    const xs = pts.map(p => t(p.x)), ys = pts.map(p => p.y);
    let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= 3 * 864e5; x1 += 3 * 864e5; }
    const yr = nice(o.yMin ?? Math.min(...ys) - (o.pad ?? 0), o.yMax ?? Math.max(...ys) + (o.pad ?? 0), 4);
    const X = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r), Y = v => m.t + (1 - (v - yr.lo) / (yr.hi - yr.lo)) * (H - m.t - m.b);
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': o.label || 'Graphique' }, host);
    for (const v of yr.ticks) {
      el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: v === yr.lo ? 'ax-base' : 'ax-grid' }, svg);
      const tx = el('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'ax-t' }, svg); tx.textContent = (o.yFmt || G.num)(v);
    }
    const nX = Math.max(2, Math.min(5, Math.floor((W - m.l - m.r) / 90)));
    for (let i = 0; i < nX; i++) {
      const v = x0 + (x1 - x0) * i / (nX - 1), d = new Date(v), s = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const tx = el('text', { x: X(v), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === nX - 1 ? 'end' : 'middle', class: 'ax-t' }, svg); tx.textContent = G.fmtDate(s, { wd: false });
    }
    for (const s of o.series) {
      const P = s.points.slice().sort((a, b) => t(a.x) - t(b.x)); if (!P.length) continue;
      const d = P.map((p, i) => (i ? 'L' : 'M') + X(t(p.x)).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
      if (s.area && P.length > 1) el('path', { d: d + ` L${X(t(P[P.length - 1].x)).toFixed(1)} ${Y(yr.lo)} L${X(t(P[0].x)).toFixed(1)} ${Y(yr.lo)} Z`, fill: s.color, 'fill-opacity': .1, stroke: 'none' }, svg);
      if (s.line !== false && P.length > 1) el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      const dots = s.dots || 'end';
      P.forEach((p, i) => {
        if (dots === 'end' && i !== P.length - 1) return;
        el('circle', { cx: X(t(p.x)), cy: Y(p.y), r: dots === 'small' ? 2.6 : 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': dots === 'small' ? 1 : 2 }, svg);
      });
      if (o.endLabel && s.label !== false) {
        const L = P[P.length - 1], tx = el('text', { x: X(t(L.x)) + 8, y: Y(L.y) + 4, class: 'ax-end' }, svg); tx.textContent = (o.yFmt || G.num)(L.y);
      }
    }
    /* Réticule + infobulle */
    const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; host.appendChild(tip);
    const cross = el('line', { y1: m.t, y2: H - m.b, class: 'ax-cross', visibility: 'hidden' }, svg);
    const allX = [...new Set(pts.map(p => p.x))].sort();
    const hit = el('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: 'transparent' }, svg);
    const move = ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / r.width);
      let best = allX[0], bd = 1e18; for (const x of allX) { const dd = Math.abs(X(t(x)) - px); if (dd < bd) { bd = dd; best = x; } }
      const cx = X(t(best)); cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      const rows = o.series.map(s => { const p = s.points.find(q => q.x === best); return p ? `<div><i style="background:${s.color}"></i>${G.esc(s.name)} <b>${(o.tipFmt || o.yFmt || G.num)(p.y)}</b></div>` : ''; }).join('');
      tip.innerHTML = `<div class="tip-d">${G.fmtDate(best, { y: true })}</div>${rows}`; tip.hidden = false;
      const left = cx / W * r.width; tip.style.left = Math.min(Math.max(0, left - 70), r.width - 150) + 'px'; tip.style.top = '4px';
    };
    hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  }

  /* Barres horizontales : rows [{label, v, lo, hi}] ; zone cible ombrée */
  function bars(host, rows, o = {}) {
    const max = o.max || Math.max(o.hi || 20, ...rows.map(r => r.v)) * 1.1;
    host.innerHTML = `<div class="hbars" role="list">${rows.map(r => {
      const w = Math.min(100, r.v / max * 100), under = r.lo != null && r.v < r.lo, over = r.hi != null && r.v > r.hi;
      return `<div class="hb" role="listitem"><span class="hb-l">${G.esc(r.label)}</span><span class="hb-t">
        ${r.lo != null ? `<span class="hb-band" style="left:${r.lo / max * 100}%;width:${(r.hi - r.lo) / max * 100}%"></span>` : ''}
        <span class="hb-f" style="width:${w}%"></span><span class="hb-v" style="left:calc(${w}% + 6px)">${G.num(r.v, r.v % 1 ? 1 : 0)}${under ? ' <em class="st warn">▾ sous la cible</em>' : over ? ' <em class="st info">▴ au-dessus</em>' : ''}</span></span></div>`;
    }).join('')}</div>${o.legend ? `<p class="hb-leg"><span class="hb-sw"></span>${G.esc(o.legend)}</p>` : ''}`;
  }

  function spark(vals, o = {}) {
    const v = vals.filter(x => x != null && isFinite(x)); if (v.length < 2) return '';
    const W = o.w || 96, H = o.h || 28, lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
    const P = v.map((y, i) => [i / (v.length - 1) * (W - 6) + 3, H - 3 - (y - lo) / r * (H - 6)]);
    const d = P.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '), L = P[P.length - 1];
    return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${L[0]}" cy="${L[1]}" r="3" fill="var(--series-1)" stroke="var(--surface)" stroke-width="1.5"/></svg>`;
  }

  G.charts = { line, bars, spark, nice };
})(window.GYM = window.GYM || {});

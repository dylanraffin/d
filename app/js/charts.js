/* Graphiques SVG (méthode dataviz) : courbes avec zone cible, lignes de référence et records,
   colonnes avec cible, barres « réalisé / prévu », petits multiples, sparklines.
   Couleurs uniquement via les variables du thème ; survol sur chaque graphique ; redessin à la largeur. */
(function (G) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const day = s => new Date(s + 'T12:00:00').getTime();
  const iso = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function nice(lo, hi, n = 4) {
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (lo === hi) { lo -= 1; hi += 1; }
    const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, ticks = [];
    for (let v = a; v <= b + step / 2; v += step) ticks.push(+v.toFixed(6));
    return { lo: a, hi: b, ticks, step };
  }
  const fmt0 = v => G.num(v, Math.abs(v % 1) > 1e-9 ? 1 : 0);
  const el = (name, attrs = {}, parent) => { const e = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };
  const txt = (parent, x, y, s, cls, anchor = 'start') => { const t = el('text', { x, y, class: cls, 'text-anchor': anchor }, parent); t.textContent = s; return t; };

  /* Redessin quand la largeur change (rotation du téléphone, colonne qui s'élargit) */
  const RO = window.ResizeObserver ? new ResizeObserver(es => {
    for (const e of es) { const h = e.target, w = Math.round(e.contentRect.width); if (h._draw && h._w && Math.abs(h._w - w) > 4) { h._w = w; h._draw(); } }
  }) : null;
  function mount(host, draw) { host._draw = draw; draw(); host._w = Math.round(host.clientWidth); if (RO && !host._obs) { RO.observe(host); host._obs = true; } }

  /* Infobulle : valeur en gras, libellé en second ; clé en trait (courbes) ou en point (barres) */
  function tipEl(host) {
    let t = host.querySelector(':scope > .tip');
    if (!t) { t = document.createElement('div'); t.className = 'tip'; t.hidden = true; host.appendChild(t); }
    return t;
  }
  function tipFill(t, head, rows) {
    t.textContent = '';
    const h = document.createElement('div'); h.className = 'tip-d'; h.textContent = head; t.appendChild(h);
    for (const r of rows) {
      const d = document.createElement('div'); d.className = 'tip-r';
      if (r.color) { const i = document.createElement('i'); i.className = r.shape === 'dot' ? 'k-dot' : r.shape === 'band' ? 'k-band' : 'k-line'; i.style.background = r.color; d.appendChild(i); }
      const b = document.createElement('b'); b.textContent = r.value; d.appendChild(b);
      if (r.label) { const s = document.createElement('span'); s.textContent = ' ' + r.label; d.appendChild(s); }
      t.appendChild(d);
    }
  }
  function tipAt(t, host, x) { t.hidden = false; const W = host.clientWidth, tw = t.offsetWidth || 160; t.style.left = Math.max(0, Math.min(W - tw, x - tw / 2)) + 'px'; t.style.top = '2px'; }

  /* ---------- Courbe ---------- */
  function line(host, o) { mount(host, () => drawLine(host, o)); }
  function drawLine(host, o) {
    host.innerHTML = ''; host.classList.add('chart');
    const mini = !!o.mini, W = Math.max(mini ? 110 : 260, host.clientWidth || 320), H = o.height || (mini ? 58 : 210);
    const m = mini ? { l: 3, r: o.endLabel ? 46 : 6, t: 8, b: 6 } : { l: 44, r: o.endLabel ? 58 : 14, t: 14, b: 26 };
    const pts = o.series.flatMap(s => s.points), bands = o.bands || [], bp = bands.flatMap(b => b.points);
    if (!pts.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = o.empty || 'Pas encore de données.'; host.appendChild(p); return; }
    const xs = [...pts, ...bp].map(p => day(p.x));
    let x0 = o.xMin ? day(o.xMin) : Math.min(...xs), x1 = o.xMax ? day(o.xMax) : Math.max(...xs);
    if (x1 - x0 < 864e5) { x0 -= 3 * 864e5; x1 += 3 * 864e5; }
    const ys = [...pts.map(p => p.y), ...bp.flatMap(p => [p.lo, p.hi]), ...(o.refs || []).map(r => r.y)];
    const yr = nice(o.yMin ?? Math.min(...ys) - (o.pad ?? 0), o.yMax ?? Math.max(...ys) + (o.pad ?? 0), mini ? 2 : 4);
    const X = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r), Y = v => m.t + (1 - (v - yr.lo) / (yr.hi - yr.lo)) * (H - m.t - m.b);
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': o.label || '' }, host);
    if (!mini) {
      for (const v of yr.ticks) { el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: v === yr.lo ? 'ax-base' : 'ax-grid' }, svg); txt(svg, m.l - 8, Y(v) + 4, (o.yFmt || fmt0)(v), 'ax-t', 'end'); }
      const nX = Math.max(2, Math.min(5, Math.floor((W - m.l - m.r) / 92)));
      for (let i = 0; i < nX; i++) { const v = x0 + (x1 - x0) * i / (nX - 1); txt(svg, X(v), H - 7, G.fmtDate(iso(v), { wd: false }), 'ax-t', i === 0 ? 'start' : i === nX - 1 ? 'end' : 'middle'); }
    } else el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'ax-base' }, svg);
    for (const b of bands) {
      const P = b.points.slice().sort((p, q) => day(p.x) - day(q.x)); if (P.length < 2) continue;
      const top = P.map((p, i) => (i ? 'L' : 'M') + X(day(p.x)).toFixed(1) + ' ' + Y(p.hi).toFixed(1)).join(' ');
      const bot = P.slice().reverse().map(p => 'L' + X(day(p.x)).toFixed(1) + ' ' + Y(p.lo).toFixed(1)).join(' ');
      el('path', { d: top + ' ' + bot + ' Z', fill: b.color, 'fill-opacity': b.opacity ?? .14, stroke: 'none' }, svg);
    }
    for (const r of (o.refs || [])) {
      el('line', { x1: m.l, x2: W - m.r, y1: Y(r.y), y2: Y(r.y), class: 'ax-ref' }, svg);
      if (r.label && !mini) txt(svg, W - m.r, Y(r.y) - 5, r.label, 'ax-t', 'end');
    }
    if (o.today && !mini) { const t = day(o.today); if (t > x0 && t < x1) { el('line', { x1: X(t), x2: X(t), y1: m.t, y2: H - m.b, class: 'ax-grid' }, svg); txt(svg, X(t) + 4, m.t + 9, 'aujourd’hui', 'ax-t'); } }
    for (const s of o.series) {
      const P = s.points.slice().sort((a, b) => day(a.x) - day(b.x)); if (!P.length) continue;
      const d = P.map((p, i) => (i ? 'L' : 'M') + X(day(p.x)).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
      if (s.area && P.length > 1) el('path', { d: `${d} L${X(day(P[P.length - 1].x)).toFixed(1)} ${Y(yr.lo)} L${X(day(P[0].x)).toFixed(1)} ${Y(yr.lo)} Z`, fill: s.color, 'fill-opacity': .1, stroke: 'none' }, svg);
      if (s.line !== false && P.length > 1) el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      const dots = s.dots || 'end';
      P.forEach((p, i) => {
        const cx = X(day(p.x)), cy = Y(p.y);
        if (p.pr && !mini) { el('circle', { cx, cy, r: 6.5, fill: 'var(--surface)', stroke: s.color, 'stroke-width': 2 }, svg); el('circle', { cx, cy, r: 2.5, fill: s.color }, svg); return; }
        if (dots === 'none' || (dots === 'end' && i !== P.length - 1)) return;
        el('circle', { cx, cy, r: dots === 'small' ? 2.6 : 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': dots === 'small' ? 1 : 2 }, svg);
      });
      if (o.endLabel && s.label !== false) { const L = P[P.length - 1]; txt(svg, X(day(L.x)) + 8, Y(L.y) + 4, (o.endFmt || o.yFmt || G.num)(L.y), 'ax-end'); }
    }
    if (mini) return;
    const t = tipEl(host), cross = el('line', { y1: m.t, y2: H - m.b, class: 'ax-cross', visibility: 'hidden' }, svg);
    const allX = [...new Set([...pts, ...bp].map(p => p.x))].sort();
    const hit = el('rect', { x: m.l, y: 0, width: Math.max(0, W - m.l - m.r), height: H, fill: 'transparent' }, svg);
    const move = ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / r.width);
      let best = allX[0], bd = 1e18; for (const x of allX) { const dd = Math.abs(X(day(x)) - px); if (dd < bd) { bd = dd; best = x; } }
      const cx = X(day(best)); cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      const rows = [];
      for (const s of o.series) { const p = s.points.find(q => q.x === best); if (p) rows.push({ color: s.color, value: (o.tipFmt || o.yFmt || fmt0)(p.y), label: s.name + (p.pr ? ' · record' : '') }); }
      for (const b of bands) { const p = b.points.find(q => q.x === best); if (p) rows.push({ color: b.color, shape: 'band', value: `${(o.tipFmt || o.yFmt || G.num)(p.lo)} – ${(o.tipFmt || o.yFmt || G.num)(p.hi)}`, label: b.name }); }
      tipFill(t, G.fmtDate(best, { y: true }), rows); tipAt(t, host, cx / W * r.width);
    };
    hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { t.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  }

  /* ---------- Colonnes par jour avec ligne de cible ---------- */
  function columns(host, o) { mount(host, () => drawColumns(host, o)); }
  function drawColumns(host, o) {
    host.innerHTML = ''; host.classList.add('chart');
    const W = Math.max(260, host.clientWidth || 320), H = o.height || 168, m = { l: 44, r: o.target ? 58 : 12, t: 16, b: 26 };
    const data = o.data, vals = data.map(d => d.v).filter(v => v != null && v > 0);
    const yr = nice(0, Math.max(o.target || 0, ...vals, 1) * 1.06, 4);
    const n = data.length, slot = (W - m.l - m.r) / n, bw = Math.max(3, Math.min(24, slot - 2));
    const X = i => m.l + slot * i + (slot - bw) / 2, Y = v => m.t + (1 - v / yr.hi) * (H - m.t - m.b), y0 = Y(0);
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': o.label || '' }, host);
    for (const v of yr.ticks) { el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: v === 0 ? 'ax-base' : 'ax-grid' }, svg); txt(svg, m.l - 8, Y(v) + 4, (o.yFmt || fmt0)(v), 'ax-t', 'end'); }
    const every = Math.ceil(n / Math.max(2, Math.floor((W - m.l - m.r) / 58)));
    data.forEach((d, i) => { if (i % every === 0 || i === n - 1) txt(svg, X(i) + bw / 2, H - 7, G.fmtDate(d.x, { wd: false }).replace(/\s\S+$/, ''), 'ax-t', 'middle'); });
    const bars = data.map((d, i) => {
      if (d.v == null || d.v <= 0) { el('line', { x1: X(i), x2: X(i) + bw, y1: y0 - .5, y2: y0 - .5, class: 'ax-miss' }, svg); return null; }
      const x = X(i), y = Y(d.v), r = Math.min(4, bw / 2, y0 - y);
      return el('path', { d: `M${x},${y0} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + bw - r},${y} Q${x + bw},${y} ${x + bw},${y + r} L${x + bw},${y0} Z`, fill: o.color || 'var(--series-1)', class: 'bar' }, svg);
    });
    if (o.target) { el('line', { x1: m.l, x2: W - m.r + 4, y1: Y(o.target), y2: Y(o.target), class: 'ax-ref' }, svg); txt(svg, W - m.r + 8, Y(o.target) + 4, o.targetLabel || 'Cible', 'ax-t'); }
    const t = tipEl(host);
    data.forEach((d, i) => {
      const r = el('rect', { x: m.l + slot * i, y: 0, width: slot, height: H, fill: 'transparent' }, svg);
      const show = () => {
        bars.forEach((b, k) => b && b.setAttribute('fill-opacity', k === i ? '1' : '.55'));
        tipFill(t, G.fmtDate(d.x, { y: true }), d.v == null || d.v <= 0 ? [{ value: 'Rien de saisi', label: '' }] : [{ color: o.color || 'var(--series-1)', shape: 'dot', value: (o.tipFmt || o.yFmt || G.num)(d.v), label: o.name || '' }, ...(o.target ? [{ value: (o.tipFmt || o.yFmt || G.num)(o.target), label: 'cible' }] : [])]);
        const box = svg.getBoundingClientRect(); tipAt(t, host, (X(i) + bw / 2) / W * box.width);
      };
      r.addEventListener('pointerenter', show); r.addEventListener('pointerdown', show);
      r.addEventListener('pointerleave', () => { t.hidden = true; bars.forEach(b => b && b.removeAttribute('fill-opacity')); });
    });
  }

  /* ---------- Réalisé / prévu avec zone conseillée (bullet) ---------- */
  function bullets(host, rows, o = {}) {
    const max = o.max || Math.max(22, ...rows.map(r => Math.max(r.done, r.planned || 0))) * 1.05, pct = v => Math.min(100, Math.max(0, v / max * 100));
    const fmt = v => G.num(v, v % 1 ? 1 : 0);
    host.classList.add('chart');
    host.innerHTML = `<div class="bl" role="list">${rows.map((r, i) => {
      const st = r.planned == null ? '' : r.planned < r.lo ? '<span class="st st-warn">▾ Programme léger</span>' : r.planned > r.hi ? '<span class="st st-warn">▴ Programme chargé</span>' : '<span class="st st-good">✓ Bien dosé</span>';
      return `<div class="bl-r" role="listitem" tabindex="0" data-i="${i}"><span class="bl-l">${G.esc(r.label)}</span>
        <span class="bl-t"><span class="bl-band" style="left:${pct(r.lo)}%;width:${pct(r.hi) - pct(r.lo)}%"></span>${r.planned != null ? `<span class="bl-plan" style="width:${pct(r.planned)}%"></span>` : ''}<span class="bl-done" style="width:${pct(r.done)}%"></span></span>
        <span class="bl-v"><b>${fmt(r.done)}</b>${r.planned != null ? `<span> / ${fmt(r.planned)}</span>` : ''}</span>${st}</div>`;
    }).join('')}</div>
    <div class="legend"><span><i class="k-bar"></i>Fait cette semaine</span><span><i class="k-bar k-plan"></i>Prévu par ton programme</span><span><i class="k-bar k-zone"></i>Zone conseillée ${o.zone || '10 à 20 séries'}</span></div>`;
    const t = tipEl(host);
    host.querySelectorAll('.bl-r').forEach(el2 => {
      const r = rows[+el2.dataset.i];
      const show = () => { tipFill(t, r.label, [{ color: 'var(--series-1)', shape: 'dot', value: fmt(r.done) + ' séries', label: 'faites' }, ...(r.planned != null ? [{ value: fmt(r.planned) + ' séries', label: 'prévues' }] : []), { value: `${r.lo} – ${r.hi}`, label: 'zone conseillée' }]); t.hidden = false; t.style.left = '0px'; t.style.top = (el2.offsetTop + el2.offsetHeight) + 'px'; };
      el2.addEventListener('pointerenter', show); el2.addEventListener('focus', show);
      el2.addEventListener('pointerleave', () => { t.hidden = true; }); el2.addEventListener('blur', () => { t.hidden = true; });
    });
  }

  /* ---------- Sparkline (tuiles) ---------- */
  function spark(vals, o = {}) {
    const v = vals.filter(x => x != null && isFinite(x)); if (v.length < 2) return '';
    const W = o.w || 96, H = o.h || 28, lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
    const P = v.map((y, i) => [i / (v.length - 1) * (W - 8) + 4, H - 4 - (y - lo) / r * (H - 8)]);
    const d = P.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '), L = P[P.length - 1];
    return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${L[0].toFixed(1)}" cy="${L[1].toFixed(1)}" r="3.5" fill="var(--series-1)" stroke="var(--surface)" stroke-width="1.5"/></svg>`;
  }

  /* ---------- Tableau jumeau ---------- */
  function table(cols, rows) {
    return `<div class="tscroll"><table class="t"><thead><tr>${cols.map(c => `<th class="${c.r ? 'r' : ''}">${G.esc(c.h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((v, i) => `<td class="${cols[i].r ? 'r' : ''}">${G.esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  G.charts = { line, columns, bullets, spark, table, nice };
})(window.GYM = window.GYM || {});

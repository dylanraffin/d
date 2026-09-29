/* Onglet Mouvements : bibliothèque filtrable (aperçu animé au survol) + lecteur 3D « motion design »
   (caméra en orbite, repères animés, vitesse, angles de vue, fantôme, trajectoire, export vidéo) et fiche technique. */
(function (G) {
  'use strict';
  const U = G.ui, esc = G.esc;
  const HOT = 'rgb(255,70,49)', WARM = 'rgb(255,167,38)';
  const EQ = ['barre', 'halteres', 'machine', 'poulie', 'pdc'];
  const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const filtered = () => {
    const q = fold(U.lib.q);
    return G.moves.filter(m => (U.lib.g === 'all' || m.group === U.lib.g) && (U.lib.e === 'all' || m.equip === U.lib.e)
      && (!q || fold(m.name + ' ' + m.muscles.p.map(x => G.MUSCLE_FR[x]).join(' ')).includes(q)));
  };
  const card = m => `<button class="mv" data-act="open-move" data-id="${m.id}"><canvas data-still="${m.id}" data-u=".6" width="300" height="240" aria-hidden="true"></canvas>
    <span class="mv-b"><b>${esc(m.name)}</b><span class="small muted">${m.muscles.p.map(x => G.MUSCLE_FR[x]).join(', ')}</span><span class="tiny muted">${G.EQUIP_FR[m.equip]}</span></span></button>`;

  /* Aperçu animé au survol (souris uniquement) */
  let stopPreview = null;
  const endPreview = () => { if (stopPreview) { stopPreview(); stopPreview = null; } };
  function bindHover(root) {
    if (!G.animPreview) return;
    root.querySelectorAll('.mv').forEach(el => {
      el.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse') return; endPreview(); stopPreview = G.animPreview(el.querySelector('canvas'), G.moveById[el.dataset.id]); });
      el.addEventListener('pointerleave', endPreview);
    });
  }

  G.views.mouvements = () => {
    const list = filtered();
    return `<div class="stack"><section class="card"><p class="eyebrow">${G.moves.length} mouvements animés${G.render3D ? ' en 3D' : ''}</p><h1 class="h1" style="margin-top:6px">Technique</h1>
      <p class="lead">Chaque mouvement est animé en 3D : la caméra tourne autour, les muscles qui travaillent s’allument (rouge : principaux, ambre : secondaires), l’angle articulaire et la trajectoire s’affichent en direct.</p>
      <div class="stack-s" style="margin-top:12px"><div class="chips scroll" role="group" aria-label="Groupe musculaire"><button class="chip" data-act="lib-g" data-v="all" aria-pressed="${U.lib.g === 'all'}">Tous</button>${G.LIB_GROUPS.map(g => `<button class="chip" data-act="lib-g" data-v="${g.id}" aria-pressed="${U.lib.g === g.id}">${g.name}</button>`).join('')}</div>
      <div class="chips scroll" role="group" aria-label="Matériel"><button class="chip" data-act="lib-e" data-v="all" aria-pressed="${U.lib.e === 'all'}">Tout matériel</button>${EQ.map(e => `<button class="chip" data-act="lib-e" data-v="${e}" aria-pressed="${U.lib.e === e}">${G.EQUIP_FR[e]}</button>`).join('')}</div>
      <input id="libq" type="search" data-act="lib-q" placeholder="Rechercher un exercice ou un muscle" value="${esc(U.lib.q)}" aria-label="Rechercher"></div></section>
      <div class="lib" id="libgrid">${list.map(card).join('') || '<p class="empty">Aucun mouvement ne correspond.</p>'}</div></div>`;
  };
  G.binds.mouvements = root => bindHover(root);
  G.act['lib-g'] = el => { U.lib.g = el.dataset.v; G.render(); };
  G.act['lib-e'] = el => { U.lib.e = el.dataset.v; G.render(); };
  G.act['lib-q'] = el => {
    U.lib.q = el.value; const grid = document.getElementById('libgrid'); if (!grid) return;
    endPreview();
    grid.innerHTML = filtered().map(card).join('') || '<p class="empty">Aucun mouvement ne correspond.</p>';
    grid.querySelectorAll('canvas[data-still]').forEach(c => G.animStill(c, G.moveById[c.dataset.still], .6));
    bindHover(grid);
  };

  /* ---------- Fiche + lecteur ---------- */
  const VIEWS = [['Côté', 0], ['3/4', 35], ['Face', 90], ['Dos', -90]];
  G.act['open-move'] = el => openMove(el.dataset.id);
  function openMove(id) {
    const m = G.moveById[id]; if (!m) return;
    endPreview();
    const is3d = !!G.render3D;
    const inProg = (() => { try { const p = G.profileOrExample(); return G.program.build(p).flatMap(d => d.items.filter(i => i.move === id).map(i => `${d.name} : ${i.sets} × ${i.reps[0]}–${i.reps[1]}${i.timed ? ' s' : ''}`)); } catch (e) { return []; } })();
    const yt = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(m.video || m.name + ' technique');
    const html = `<div class="sheet-top"><div><p class="eyebrow">${G.EQUIP_FR[m.equip]} · ${m.kind === 'compound' ? 'polyarticulaire' : 'isolation'}</p><h2 class="h2">${esc(m.name)}</h2></div><button class="icon-btn" data-close aria-label="Fermer">${G.icon('x')}</button></div>
      <div class="cols"><div class="stack-s"><div class="stage ${is3d ? 'is3d' : ''}"><div class="stage-view"><canvas id="pl-c" aria-label="Animation : ${esc(m.name)}"></canvas>${is3d ? '<canvas id="pl-o" class="ov" aria-hidden="true"></canvas>' : ''}
        <span class="stage-hint">Glisse pour tourner · double-clic : vue d’origine</span></div>
        <div class="phase" aria-live="polite"><b id="pl-l">—</b><span id="pl-q"></span><div class="prog"><i id="pl-p"></i></div></div></div>
        <div class="ctrl"><button class="btn sm" id="pl-play" aria-label="Lecture ou pause">${G.icon('pause')} Pause</button>
          <div class="seg" role="group" aria-label="Vitesse"><button data-sp="0.5" aria-pressed="false">0,5×</button><button data-sp="1" aria-pressed="true">1×</button></div>
          <div class="seg" role="group" aria-label="Angle de vue">${VIEWS.map(([l, y]) => `<button data-yaw="${y}" aria-pressed="false">${l}</button>`).join('')}</div></div>
        <div class="ctrl">${is3d ? '<button class="chip" id="pl-auto" aria-pressed="true">Caméra auto</button><button class="chip" id="pl-guides" aria-pressed="true">Repères</button>' : ''}<button class="chip" id="pl-ghost" aria-pressed="false">Début/fin en transparence</button>${m.track ? '<button class="chip" id="pl-trail" aria-pressed="true">Trajectoire</button>' : ''}</div>
        <div class="ctrl"><button class="btn ghost sm" id="pl-rec">${G.icon('video')} Exporter en vidéo</button><a class="btn ghost sm" href="${yt}" target="_blank" rel="noopener">${G.icon('play')} Vraies vidéos (YouTube)</a></div></div>
      <div class="stack"><div class="mus">${m.muscles.p.map(x => `<span class="pill"><i style="background:${HOT}"></i>${G.MUSCLE_FR[x]}</span>`).join('')}${(m.muscles.s || []).map(x => `<span class="pill"><i style="background:${WARM}"></i>${G.MUSCLE_FR[x]}</span>`).join('')}</div>
        <section><h3 class="h3">Points clés</h3><ul class="cues" style="margin-top:8px">${m.cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul></section>
        <section><h3 class="h3">Erreurs fréquentes</h3><ul class="cues bad" style="margin-top:8px">${m.errors.map(c => `<li>${esc(c)}</li>`).join('')}</ul></section>
        ${m.tip ? `<p class="note">${esc(m.tip)}</p>` : ''}
        ${inProg.length ? `<p class="small muted">Dans ton programme : ${inProg.map(esc).join(' · ')}</p>` : ''}
        <p class="tiny muted">Tempo : ${m.phases.map(ph => `${esc(ph.label.toLowerCase())} ${G.num(ph.hold ?? ph.d, 1)} s`).join(', ')}.</p></div></div>`;
    let player = null;
    G.openSheet(html, root => {
      const c = root.querySelector('#pl-c'), ov = root.querySelector('#pl-o'), lab = root.querySelector('#pl-l'), cue = root.querySelector('#pl-q'), bar = root.querySelector('#pl-p');
      const yawBtns = [...root.querySelectorAll('[data-yaw]')], autoBtn = root.querySelector('#pl-auto');
      const markYaw = y => yawBtns.forEach(b => b.setAttribute('aria-pressed', String(Math.abs(((+b.dataset.yaw - y) % 360 + 540) % 360 - 180) < 8)));
      const playBtn = root.querySelector('#pl-play');
      const syncPlay = () => { playBtn.innerHTML = player && player.playing ? `${G.icon('pause')} Pause` : `${G.icon('play2')} Lecture`; };
      requestAnimationFrame(() => {
        player = new G.Player(c, m, {
          overlay: ov,
          onPhase: (i, ph) => { lab.textContent = ph.label; cue.textContent = ph.cue || ''; cue.classList.remove('in'); void cue.offsetWidth; cue.classList.add('in'); },
          onTick: f => { bar.style.width = (f * 100) + '%'; },
          onYaw: y => { if (!player || !player.auto) markYaw(y); },
          onAuto: on => { if (autoBtn) autoBtn.setAttribute('aria-pressed', String(on)); }
        });
        root.querySelector('.stage').classList.toggle('is3d', !!player.st);
        if (!player.st && ov) ov.remove();
        if (autoBtn) autoBtn.setAttribute('aria-pressed', String(!!player.auto));
        markYaw(player.baseYaw ?? player.yaw); syncPlay();
      });
      playBtn.onclick = () => { player.toggle(); syncPlay(); };
      root.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { player.setSpeed(+b.dataset.sp); root.querySelectorAll('[data-sp]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
      yawBtns.forEach(b => b.onclick = () => { player.setYaw(+b.dataset.yaw); markYaw(+b.dataset.yaw); });
      if (autoBtn) autoBtn.onclick = () => player.setAuto(!player.auto);
      const gd = root.querySelector('#pl-guides'); if (gd) gd.onclick = () => { player.guides = !player.guides; gd.setAttribute('aria-pressed', String(player.guides)); player.draw(); };
      const gh = root.querySelector('#pl-ghost'); gh.onclick = () => { player.ghost = !player.ghost; gh.setAttribute('aria-pressed', String(player.ghost)); player.draw(); };
      const tr = root.querySelector('#pl-trail'); if (tr) tr.onclick = () => { player.trail = !player.trail; tr.setAttribute('aria-pressed', String(player.trail)); player.draw(); };
      const rec = root.querySelector('#pl-rec');
      rec.onclick = async () => {
        if (rec.disabled) return; rec.disabled = true;
        const loops = 2, secs = Math.round(player.tl.total * loops + (player.st ? 4.7 : 0));
        rec.textContent = `Enregistrement… ${secs} s`;
        try { const { blob, ext } = await player.record(loops); await G.saveFile(`${m.id}-technique.${ext}`, blob); }
        catch (e) { G.toast(e && e.code === 'unsupported' ? 'Ce navigateur ne sait pas enregistrer de vidéo.' : 'Enregistrement impossible.'); }
        rec.disabled = false; rec.innerHTML = `${G.icon('video')} Exporter en vidéo`; syncPlay();
      };
    }, () => { if (player) player.destroy(); });
  }
  G.openMove = openMove;
})(window.GYM = window.GYM || {});

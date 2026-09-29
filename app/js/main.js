/* Démarrage : premier rendu immédiat (cache), puis base de données et capacités Claude si disponibles. */
(function (G) {
  'use strict';
  const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'file'; };
  G.store.on(what => {
    if (what === 'drafts' && typing()) return;
    G.render();
  });
  const h = location.hash.slice(1);
  if (['seance', 'progres', 'nutrition', 'mouvements', 'coach'].includes(h)) G.ui.tab = h;
  else if (h === 'profil' || h === 'sante') G.ui.view = 'profil';
  G.render();
  G.store.init();
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('sample').then(s => { G.cap.sample = s; G.render(); }, () => {});
    window.claude.use('downloads').then(d => { G.cap.downloads = d; }, () => {});
  }
  setInterval(() => { if (G.store.draft && !typing()) G.render(); }, 30000);
})(window.GYM);

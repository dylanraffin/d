// Fond de carte de la démo : un Paris stylisé, dessiné en vecteur (aucune tuile, aucun appel réseau).
// Les tracés sont approximatifs : c'est une illustration, pas une carte de référence.
(() => {
  const L = window.L;
  if (!L) return;
  const C = { lat: 48.859, lng: 2.347, a: 0.0445, b: 0.081 }; // ellipse du boulevard périphérique
  const inside = (lat, lng, k = 1) => ((lat - C.lat) / (C.a * k)) ** 2 + ((lng - C.lng) / (C.b * k)) ** 2 <= 1;
  const ring = (k = 1, n = 72) => Array.from({ length: n }, (_, i) => {
    const t = (i / n) * 2 * Math.PI;
    return [C.lat + C.a * k * Math.sin(t), C.lng + C.b * k * Math.cos(t)];
  });
  const SEINE = [[48.8165, 2.4145], [48.8262, 2.3893], [48.834, 2.3768], [48.8402, 2.3712], [48.8452, 2.3655], [48.85, 2.3598], [48.8528, 2.3545], [48.8553, 2.348],
    [48.8572, 2.342], [48.859, 2.3368], [48.8607, 2.3292], [48.8632, 2.3212], [48.8641, 2.3135], [48.8639, 2.3025], [48.861, 2.2945], [48.8562, 2.2878],
    [48.8495, 2.2795], [48.8462, 2.2752], [48.839, 2.269], [48.8322, 2.2618]];
  const CANAL = [[48.8508, 2.3672], [48.8598, 2.3688], [48.8688, 2.3652], [48.8765, 2.3665], [48.8842, 2.3692], [48.8905, 2.381], [48.8975, 2.392]];
  const MAJOR = [
    [[48.8656, 2.3212], [48.8698, 2.3078], [48.8738, 2.295]], // Champs-Élysées
    [[48.8656, 2.3212], [48.8615, 2.3358], [48.8566, 2.3522], [48.8532, 2.3692]], // Rivoli
    [[48.87, 2.3245], [48.871, 2.332], [48.8715, 2.3435], [48.869, 2.354], [48.8674, 2.3636], [48.8605, 2.3672], [48.8532, 2.3692]], // Grands Boulevards
    [[48.876, 2.359], [48.867, 2.3545], [48.858, 2.347], [48.853, 2.344], [48.84, 2.337], [48.834, 2.332]], // Sébastopol, Saint-Michel
    [[48.8615, 2.317], [48.855, 2.326], [48.852, 2.339], [48.85, 2.3525], [48.8505, 2.362]], // Saint-Germain
    [[48.8835, 2.327], [48.8822, 2.3376], [48.8838, 2.3495], [48.8842, 2.3692]], // Clichy, Rochechouart
    [[48.8674, 2.3636], [48.872, 2.377], [48.862, 2.386], [48.8483, 2.3958]], // Belleville, Ménilmontant
    [[48.8738, 2.295], [48.8835, 2.327]], [[48.8738, 2.295], [48.8638, 2.2885]], [[48.8738, 2.295], [48.8795, 2.283]], [[48.8738, 2.295], [48.866, 2.276]],
    [[48.8532, 2.3692], [48.8483, 2.3958]], [[48.8532, 2.3692], [48.842, 2.386]], [[48.834, 2.332], [48.842, 2.322], [48.8475, 2.3015], [48.856, 2.2985]],
    [[48.834, 2.332], [48.831, 2.356], [48.84, 2.371]], [[48.8674, 2.3636], [48.876, 2.359], [48.8805, 2.355], [48.8975, 2.359]]
  ];
  const PARKS = [
    { at: [48.862, 2.249], r: [0.016, 0.02] }, { at: [48.833, 2.433], r: [0.014, 0.024] }, { at: [48.8809, 2.3828], r: [0.0032, 0.0052] },
    { at: [48.8462, 2.3372], r: [0.0026, 0.0042] }, { at: [48.8635, 2.3275], r: [0.0012, 0.0058] }, { at: [48.8556, 2.2986], r: [0.0036, 0.0022] },
    { at: [48.8797, 2.3088], r: [0.0016, 0.0026] }, { at: [48.8614, 2.3933], r: [0.0036, 0.0042] }, { at: [48.8215, 2.3385], r: [0.0022, 0.0036] }
  ];
  const LABELS = [
    ['Montmartre', 48.8885, 2.3431], ['Pigalle', 48.8806, 2.3376], ['Le Marais', 48.8578, 2.3608], ['Bastille', 48.8518, 2.3712], ['Belleville', 48.8735, 2.3795],
    ['Oberkampf', 48.866, 2.376], ['Saint-Germain', 48.8518, 2.333], ['Canal Saint-Martin', 48.8745, 2.3625], ['Batignolles', 48.887, 2.317],
    ['Louvre', 48.8618, 2.3365], ['Bercy', 48.837, 2.3835], ['Montparnasse', 48.8415, 2.321], ['La Villette', 48.893, 2.389], ['Nation', 48.847, 2.397],
    ['République', 48.8682, 2.3628], ['Étoile', 48.875, 2.2935], ['La Seine', 48.8625, 2.3068, 'water'], ['Bois de Boulogne', 48.862, 2.249, 'park'], ['Bois de Vincennes', 48.833, 2.433, 'park']
  ];

  // Trame de rues : deux familles de lignes légèrement inclinées, coupées au périphérique.
  function fabric() {
    const lines = [];
    const sweep = (angle, step) => {
      const dir = [Math.sin(angle), Math.cos(angle) * 1.52];
      const nor = [Math.cos(angle), -Math.sin(angle) * 1.52];
      for (let k = -0.1; k <= 0.1; k += step) {
        let run = [];
        for (let t = -0.12; t <= 0.12; t += 0.004) {
          const lat = C.lat + nor[0] * k + dir[0] * t;
          const lng = C.lng + nor[1] * k + dir[1] * t;
          if (inside(lat, lng, 0.985)) run.push([lat, lng]);
          else { if (run.length > 1) lines.push(run); run = []; }
        }
        if (run.length > 1) lines.push(run);
      }
    };
    sweep(0.28, 0.0052);
    sweep(0.28 + Math.PI / 2, 0.0064);
    return lines;
  }

  window.demoBasemap = (map) => {
    if (!map.getPane('base')) { map.createPane('base'); map.getPane('base').style.zIndex = 250; }
    const svg = L.svg({ pane: 'base', padding: 0.6 });
    const add = (layer) => layer.addTo(map);
    const opts = (o) => ({ renderer: svg, pane: 'base', interactive: false, ...o });
    add(L.polygon(ring(1.03), opts({ stroke: false, fillColor: '#eceef5', fillOpacity: 1 })));
    for (const p of PARKS) {
      add(L.polygon(Array.from({ length: 28 }, (_, i) => { const t = (i / 28) * 2 * Math.PI; return [p.at[0] + p.r[0] * Math.sin(t), p.at[1] + p.r[1] * Math.cos(t)]; }),
        opts({ stroke: false, fillColor: '#dfe2ec', fillOpacity: 1 })));
    }
    add(L.polyline(fabric(), opts({ color: '#f7f8fb', weight: 1, opacity: 1 })));
    add(L.polyline(ring(1), opts({ color: '#ffffff', weight: 5, opacity: 1, fill: false })));
    add(L.polyline(ring(0.93), opts({ color: '#ffffff', weight: 2, opacity: 1, fill: false })));
    add(L.polyline(MAJOR, opts({ color: '#ffffff', weight: 3, opacity: 1, lineJoin: 'round' })));
    add(L.polyline(CANAL, opts({ color: '#c9cee0', weight: 3, opacity: 1 })));
    add(L.polyline(SEINE, opts({ color: '#c9cee0', weight: 13, opacity: 1, lineJoin: 'round', lineCap: 'round' })));
    for (const [name, lat, lng, kind] of LABELS) {
      add(L.marker([lat, lng], { pane: 'base', interactive: false, keyboard: false,
        icon: L.divIcon({ className: `map-label${kind ? ` ${kind}` : ''}`, html: name.replace(/[&<>]/g, ''), iconSize: [160, 12], iconAnchor: [80, 6] }) }));
    }
  };
})();

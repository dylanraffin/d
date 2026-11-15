// Géolocalisation protectrice : positions arrondies, distances par tranches, zones anonymes sur la carte.
// Objectif : rendre impossible la localisation précise d'un membre par trilatération.

export const GRID = 0.005;           // ≈ 550 m en latitude : seule précision stockée
export const MIN_UPDATE_MS = 60e3;   // une mise à jour de position par minute au plus

export function snap(v) {
  return Math.round(v / GRID) * GRID;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Tranches de distance affichées. Jamais de valeur exacte.
export const BUCKETS = [
  [1, 'Moins de 1 km'], [2, '1 à 2 km'], [5, '2 à 5 km'], [10, '5 à 10 km'], [25, '10 à 25 km'], [Infinity, 'Plus de 25 km']
];

export function bucketIndex(km) {
  return BUCKETS.findIndex(([max]) => km < max);
}

export function distanceBetween(a, b) {
  if (a?.lat == null || b?.lat == null) return null;
  const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
  const i = bucketIndex(km);
  return { index: i, label: BUCKETS[i][1], max_km: BUCKETS[i][0] };
}

// Ordre stable mais imprévisible à l'intérieur d'une tranche (change chaque jour) :
// trier par distance exacte permettrait de retrouver la position même avec la distance masquée.
export function dailyShuffleKey(viewerId, targetId) {
  const day = Math.floor(Date.now() / 86400e3);
  let x = (viewerId * 73856093) ^ (targetId * 19349663) ^ (day * 83492791);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

// Regroupe des membres en zones. Une zone de moins de `k` membres est fusionnée dans une zone
// plus grande ; si elle reste trop petite, elle n'est pas affichée (anonymat de groupe).
export function clusters(people, k) {
  const levels = [0.01, 0.04, 0.16];
  let pending = people;
  const out = [];
  for (const size of levels) {
    const cells = new Map();
    for (const p of pending) {
      const key = `${Math.floor(p.lat / size)}:${Math.floor(p.lng / size)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(p);
    }
    const next = [];
    for (const [key, members] of cells) {
      if (members.length >= k) {
        const [i, j] = key.split(':').map(Number);
        out.push({ key: `${size}:${key}`, lat: (i + 0.5) * size, lng: (j + 0.5) * size, size_km: Math.round(size * 111), members });
      } else {
        next.push(...members);
      }
    }
    pending = next;
  }
  return { zones: out, hidden: pending.length };
}

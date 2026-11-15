// Version des CGU, de la politique de confidentialité et de la charte. La changer redemande l'accord de chacun.
export const LEGAL_VERSION = '2026-11-15';

// Listes fermées utilisées par le formulaire d'inscription, le profil et les filtres.
// Ce sont des données sensibles (vie sexuelle, RGPD art. 9) : toujours facultatives, visibilité au choix.

export const MODES = { dating: 'Rencontre', friends: 'Amis', network: 'Pro' };

export const SEEKING = {
  chat: 'Discuter', dates: 'Rendez-vous', relationship: 'Relation sérieuse',
  friends: 'Amis', network: 'Réseau pro', now: 'Maintenant'
};

export const POSITIONS = {
  top: 'Actif', vers_top: 'Plutôt actif', vers: 'Versatile',
  vers_bottom: 'Plutôt passif', bottom: 'Passif', side: 'Side'
};

export const VISIBILITY = { members: 'Tous les membres', matches: 'Mes matchs', hidden: 'Personne' };

export const TASTES = [
  'Techno', 'House', 'Pop', 'Rap', 'Jazz', 'Musique live', 'Cinéma', 'Séries', 'Expos', 'Théâtre',
  'Mode', 'Design', 'Photo', 'Lecture', 'Cuisine', 'Vin', 'Brunch', 'Apéros', 'Clubbing', 'Drag',
  'Danse', 'Salle de sport', 'Running', 'Yoga', 'Randonnée', 'Natation', 'Voyages', 'Plage', 'Jeux vidéo', 'Animaux'
];

export const INTIMATE = [
  'Câlins', 'Romantique', 'Vanille', 'Safer sex', 'Kink friendly', 'Cuir', 'Sportswear',
  'Uniformes', 'Jeux de rôle', 'Dominant', 'Soumis', 'À plusieurs'
];

export const REPORT_REASONS = {
  harassment: 'Harcèlement', fake: 'Faux profil', minor: 'Personne mineure', non_consensual: 'Contenu partagé sans accord',
  hate: 'Propos haineux', spam: 'Spam ou arnaque', prostitution: 'Prostitution ou contenu payant', drugs: 'Drogue (vente, chemsex)',
  danger: 'Guet-apens ou menace', illegal: 'Contenu illégal', other: 'Autre'
};

// Carte en direct
export const SPOT_CATEGORIES = { bar: 'Bar', club: 'Club', sauna: 'Sauna', cafe: 'Café ou resto', event: 'Événement', other: 'Autre établissement' };
export const PRESENCE_PLACES = { host: 'Je reçois', travel: 'Je me déplace', venue: 'Sur place (bar, club, sauna)', out: 'Verre ou café d’abord', any: 'À voir' };
export const MAP_PRECISION = { zone: 'Seulement dans une zone (pas de point à moi)', '1km': 'Environ 1 km', '500m': 'Environ 500 m' };
export const MESSAGES_FROM = { everyone: 'Tout le monde', photo: 'Profils avec une photo validée', nobody: 'Personne (seulement mes matchs)' };

// Profil « cruising » : tout est facultatif. Identité, rôle, pratiques et santé sont des données sensibles (RGPD art. 9).
export const BODY_TYPES = { slim: 'Mince', average: 'Moyen', athletic: 'Sportif', muscular: 'Musclé', stocky: 'Costaud', bear: 'Ours', large: 'Fort' };
export const IDENTITIES = { gay: 'Gay', bi: 'Bi', curious: 'Curieux', straight: 'Hétéro', queer: 'Queer', trans: 'Trans', nonbinary: 'Non binaire' };
export const TRIBES = ['Daddy', 'Discret', 'Ours', 'Minet', 'Jock', 'Muscle', 'Cuir', 'Sneakers', 'Poilu', 'Lisse', 'Tatoué', 'Mûr', 'Geek', 'Chaser'];
export const CAN = { host: 'Peut recevoir', travel: 'Peut se déplacer', venue: 'Sur place (bar, club, sauna)' };
export const VIBES = { talk: 'Discuter d’abord', direct: 'Direct', dirty_talk: 'Dirty talk', no_talk: 'Sans parler', group: 'À plusieurs', watch: 'Mater ou être maté' };
export const CUT = { cut: 'Circoncis', uncut: 'Non circoncis' };
export const SAFER = { condoms: 'Toujours avec capote', bb_prep: 'Sans capote si PrEP', ask: 'À discuter' };
// Données de santé : accord explicite séparé, visibilité au choix, jamais transmises à des tiers.
export const HIV_STATUS = { neg: 'Négatif', neg_prep: 'Négatif, sous PrEP', undetectable: 'Positif indétectable (I = I)', pos: 'Positif', unknown: 'Je ne sais pas' };

// Mode voyage : apparaître dans une autre ville avant d'y aller.
export const TRIP_DAYS = [1, 3, 7, 14];
// Villes proposées pour se placer sans GPS et pour le mode voyage. Seulement des pays où l'homosexualité est légale.
export const CITIES = {
  // France
  Paris: [48.8566, 2.3522], Lyon: [45.764, 4.8357], Marseille: [43.2965, 5.3698], Toulouse: [43.6047, 1.4442], Nice: [43.7102, 7.262],
  Nantes: [47.2184, -1.5536], Montpellier: [43.6108, 3.8767], Strasbourg: [48.5734, 7.7521], Bordeaux: [44.8378, -0.5792], Lille: [50.6292, 3.0573],
  Rennes: [48.1173, -1.6778], Grenoble: [45.1885, 5.7245],
  // Europe
  Bruxelles: [50.8503, 4.3517], Anvers: [51.2194, 4.4025], 'Genève': [46.2044, 6.1432], Zurich: [47.3769, 8.5417], Amsterdam: [52.3676, 4.9041],
  Berlin: [52.52, 13.405], Cologne: [50.9375, 6.9603], Hambourg: [53.5511, 9.9937], Munich: [48.1351, 11.582], Vienne: [48.2082, 16.3738],
  Londres: [51.5072, -0.1276], Manchester: [53.4808, -2.2426], Brighton: [50.8225, -0.1372], Dublin: [53.3498, -6.2603],
  Barcelone: [41.3874, 2.1686], Madrid: [40.4168, -3.7038], Valence: [39.4699, -0.3763], Sitges: [41.237, 1.8059], Ibiza: [38.9067, 1.4206],
  'Gran Canaria': [27.7606, -15.586], Lisbonne: [38.7223, -9.1393], Porto: [41.1579, -8.6291], Rome: [41.9028, 12.4964], Milan: [45.4642, 9.19],
  'Athènes': [37.9838, 23.7275], Mykonos: [37.4467, 25.3289], Prague: [50.0755, 14.4378], Copenhague: [55.6761, 12.5683], Stockholm: [59.3293, 18.0686],
  Oslo: [59.9139, 10.7522], Helsinki: [60.1699, 24.9384], 'Tel Aviv': [32.0853, 34.7818],
  // Amériques
  'New York': [40.7128, -74.006], 'Los Angeles': [34.0522, -118.2437], 'San Francisco': [37.7749, -122.4194], Chicago: [41.8781, -87.6298],
  Miami: [25.7617, -80.1918], 'Montréal': [45.5019, -73.5674], Toronto: [43.6532, -79.3832], Vancouver: [49.2827, -123.1207],
  Mexico: [19.4326, -99.1332], 'São Paulo': [-23.5505, -46.6333], 'Rio de Janeiro': [-22.9068, -43.1729], 'Buenos Aires': [-34.6037, -58.3816],
  // Asie, Pacifique, Afrique
  Sydney: [-33.8688, 151.2093], Melbourne: [-37.8136, 144.9631], Bangkok: [13.7563, 100.5018], Tokyo: [35.6762, 139.6503], Taipei: [25.033, 121.5654],
  'Le Cap': [-33.9249, 18.4241]
};

// Plans à plusieurs : organisés par un membre, sur demande, adresse visible des seuls participants acceptés.
export const PLAN_KINDS = { home: 'Chez moi', hotel: 'Hôtel', venue: 'Établissement (sauna, club…)', other: 'Autre lieu privé' };
export const PLAN_STARTS = { 0: 'Maintenant', 60: 'Dans 1 h', 120: 'Dans 2 h', 240: 'Dans 4 h' };
export const PLAN_DURATIONS = { 60: '1 h', 120: '2 h', 240: '4 h', 480: '8 h' };

// Motifs qu'un administrateur peut invoquer. Jamais l'apparence, l'âge (au-delà de 18 ans), l'origine, etc.
export const GROUNDS = {
  fake_profile: "Faux profil ou identité non confirmée (charte, art. 1)",
  minor: "Personne mineure (CGU, art. 3 : service réservé aux majeurs)",
  safety: "Risque pour la sécurité des membres (charte, art. 4)",
  harassment: "Harcèlement ou comportement insistant (charte, art. 2)",
  hate: "Propos haineux ou discriminatoires (charte, art. 2 ; loi du 29 juillet 1881)",
  non_consensual: "Diffusion d'un contenu intime sans accord (charte, art. 3 ; Code pénal, art. 226-2-1)",
  explicit_public: "Nudité hors de l'album privé (charte, art. 3)",
  prostitution: "Prostitution, escort ou contenu payant (charte, art. 5)",
  spam: 'Spam, arnaque ou publicité (charte, art. 5)',
  drugs: 'Vente ou incitation à consommer des drogues (charte, art. 5)',
  danger: 'Guet-apens, menace ou mise en danger (charte, art. 4)',
  illegal: 'Contenu illégal (CGU, art. 7)',
  charter: 'Autre manquement à la charte'
};

export const NEIGHBORHOODS = {
  'Le Marais': [48.8590, 2.3622], Pigalle: [48.8822, 2.3376], Montmartre: [48.8867, 2.3431],
  Belleville: [48.8721, 2.3768], Oberkampf: [48.8650, 2.3770], Bastille: [48.8532, 2.3692],
  'Canal Saint-Martin': [48.8711, 2.3646], Batignolles: [48.8873, 2.3175], 'Saint-Germain': [48.8540, 2.3340],
  'Quartier Latin': [48.8486, 2.3440], Montparnasse: [48.8421, 2.3219], 'Châtelet': [48.8584, 2.3470]
};

// Valide une liste séparée par des virgules (ou un tableau) contre une liste fermée.
export function pickList(value, allowed, max = 50) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const ok = new Set(Array.isArray(allowed) ? allowed : Object.keys(allowed));
  const out = [...new Set(list.map((s) => String(s).trim()).filter((s) => ok.has(s)))];
  return out.slice(0, max);
}

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
  hate: 'Propos haineux', spam: 'Spam ou arnaque', prostitution: 'Prostitution ou contenu payant', illegal: 'Contenu illégal', other: 'Autre'
};

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

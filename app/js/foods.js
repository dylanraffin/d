/* Aliments (valeurs moyennes pour 100 g, d'après les tables CIQUAL/USDA ; vérifie l'étiquette de tes produits).
   d : régime minimum (v = végan, o = végétarien, p = pescétarien, m = omnivore). x : exclusions possibles. */
(function (G) {
  'use strict';
  const F = (id, n, cat, kcal, p, c, f, fib, d, o = {}) => Object.assign({ id, n, cat, kcal, p, c, f, fib, d, x: [] }, o);
  G.FOODS = [
    F('poulet', 'Blanc de poulet (cru)', 'prot', 110, 23, 0, 1.5, 0, 'm', { max: 260 }),
    F('dinde', 'Escalope de dinde (crue)', 'prot', 105, 23.5, 0, 1.2, 0, 'm', { max: 260 }),
    F('boeuf5', 'Bœuf haché 5 % MG (cru)', 'prot', 130, 21, 0, 5, 0, 'm', { max: 250 }),
    F('jambon', 'Jambon blanc', 'prot', 112, 20, 1, 3, 0, 'm', { x: ['porc'], max: 150 }),
    F('saumon', 'Pavé de saumon (cru)', 'prot', 200, 20, 0, 13, 0, 'p', { max: 220 }),
    F('cabillaud', 'Cabillaud (cru)', 'prot', 80, 18, 0, .7, 0, 'p', { max: 280 }),
    F('thon', 'Thon au naturel (égoutté)', 'prot', 110, 25, 0, 1, 0, 'p', { max: 200 }),
    F('oeuf', 'Œufs', 'prot', 140, 12.5, .5, 10, 0, 'o', { unit: [55, 'œuf', 'œufs'], max: 220 }),
    F('blanc_oeuf', 'Blancs d’œufs', 'prot', 48, 10.5, .7, .2, 0, 'o', { max: 300 }),
    F('skyr', 'Skyr nature', 'laitier', 62, 11, 4, .2, 0, 'o', { x: ['lactose'], max: 400 }),
    F('fb0', 'Fromage blanc 0 %', 'laitier', 46, 7.5, 4, .2, 0, 'o', { x: ['lactose'], max: 400 }),
    F('lait', 'Lait demi-écrémé', 'laitier', 46, 3.3, 4.8, 1.6, 0, 'o', { x: ['lactose'], max: 400 }),
    F('emmental', 'Emmental', 'laitier', 380, 28, .5, 29, 0, 'o', { x: ['lactose'], max: 60 }),
    F('whey', 'Protéine en poudre (whey)', 'prot', 380, 78, 6, 6, 0, 'o', { x: ['lactose'], logOnly: true }),
    F('tofu', 'Tofu ferme', 'prot', 125, 13, 1.5, 7.5, 1, 'v', { x: ['soja'], max: 300 }),
    F('tempeh', 'Tempeh', 'prot', 190, 19, 9, 11, 5, 'v', { x: ['soja'], max: 220 }),
    F('lait_soja', 'Boisson soja nature', 'laitier', 36, 3.3, .8, 1.9, .5, 'v', { x: ['soja'], max: 400 }),
    F('yaourt_soja', 'Yaourt soja nature', 'laitier', 50, 4, 2, 2.3, .5, 'v', { x: ['soja'], max: 250 }),
    F('lentilles', 'Lentilles vertes (sèches)', 'feculent', 330, 25, 48, 1.5, 15, 'v', { max: 120 }),
    F('poischiches', 'Pois chiches (conserve, égouttés)', 'feculent', 135, 7.5, 17, 2.5, 6, 'v', { max: 250 }),
    F('riz', 'Riz basmati (cru)', 'feculent', 355, 8.5, 78, .6, 1.3, 'v', { max: 190 }),
    F('pates_c', 'Pâtes complètes (crues)', 'feculent', 350, 13, 64, 2.5, 8, 'v', { x: ['gluten'], max: 190 }),
    F('pates', 'Pâtes (crues)', 'feculent', 355, 12.5, 71, 1.5, 3, 'v', { x: ['gluten'], max: 190 }),
    F('avoine', 'Flocons d’avoine', 'feculent', 370, 13.5, 58.7, 7, 10, 'v', { x: ['gluten'], max: 150 }),
    F('pain_c', 'Pain complet', 'feculent', 240, 9, 41, 2.5, 7, 'v', { x: ['gluten'], max: 200 }),
    F('pdt', 'Pommes de terre (crues)', 'feculent', 80, 2, 17, .1, 1.8, 'v', { max: 550 }),
    F('patate_douce', 'Patate douce (crue)', 'feculent', 82, 1.6, 17, .1, 3, 'v', { max: 550 }),
    F('quinoa', 'Quinoa (cru)', 'feculent', 355, 14, 57, 6, 7, 'v', { max: 180 }),
    F('semoule', 'Semoule de blé (crue)', 'feculent', 358, 12.5, 72, 1.5, 3.5, 'v', { x: ['gluten'], max: 180 }),
    F('galettes_riz', 'Galettes de riz soufflé', 'feculent', 385, 8, 80, 3, 3, 'v', { unit: [8, 'galette', 'galettes'], max: 100 }),
    F('banane', 'Banane', 'fruit', 90, 1.1, 20, .3, 2.6, 'v', { unit: [120, 'banane', 'bananes'] }),
    F('pomme', 'Pomme', 'fruit', 53, .3, 11.5, .2, 2.4, 'v', { unit: [150, 'pomme', 'pommes'] }),
    F('fruits_rouges', 'Fruits rouges (surgelés)', 'fruit', 45, 1, 7, .4, 4, 'v'),
    F('huile', 'Huile d’olive', 'gras', 900, 0, 0, 100, 0, 'v', { max: 35, step: 1, spoon: 13 }),
    F('beurre_cacahuete', 'Beurre de cacahuète', 'gras', 610, 25, 12, 50, 6, 'v', { x: ['arachide'], max: 40 }),
    F('amandes', 'Amandes', 'gras', 600, 21, 8, 51, 12, 'v', { x: ['fruits_coque'], max: 45 }),
    F('noix', 'Cerneaux de noix', 'gras', 690, 15, 7, 65, 6.7, 'v', { x: ['fruits_coque'], max: 40 }),
    F('avocat', 'Avocat', 'gras', 160, 2, 1.8, 14.7, 6.7, 'v', { max: 200 }),
    F('brocoli', 'Brocoli', 'legume', 34, 2.8, 4, .4, 2.6, 'v'),
    F('haricots_verts', 'Haricots verts', 'legume', 31, 1.8, 4.5, .2, 3, 'v'),
    F('poelee', 'Poêlée de légumes (surgelée)', 'legume', 42, 2, 6, .5, 3, 'v'),
    F('courgette', 'Courgette', 'legume', 19, 1.2, 2.2, .3, 1.1, 'v'),
    F('epinards', 'Épinards', 'legume', 25, 2.9, 1.4, .4, 2.2, 'v'),
    F('tomates', 'Tomates', 'legume', 18, .9, 2.9, .2, 1.2, 'v'),
    F('coulis', 'Coulis de tomate', 'legume', 35, 1.5, 5.5, .3, 1.5, 'v'),
    F('salade', 'Salade verte', 'legume', 15, 1.4, 1.5, .2, 1.3, 'v'),
    F('carottes', 'Carottes', 'legume', 39, .9, 7, .2, 2.8, 'v')
  ];
  G.FOOD = Object.fromEntries(G.FOODS.map(f => [f.id, f]));
  G.FOOD_CAT = { prot: 'Protéines', laitier: 'Produits laitiers & alternatives', feculent: 'Féculents & légumineuses', fruit: 'Fruits', legume: 'Légumes', gras: 'Matières grasses & oléagineux' };

  /* Repas types : P / C / F = portions calculées pour tomber sur tes macros ; X = quantité fixe (g). */
  const T = (id, slot, name, d, items) => ({ id, slot, name, d, items });
  G.MEALS = [
    T('pdj_porridge', 'pdj', 'Porridge skyr & fruits rouges', 'o', [['avoine', 'C'], ['skyr', 'P'], ['fruits_rouges', 'X', 100], ['beurre_cacahuete', 'F']]),
    T('pdj_omelette', 'pdj', 'Omelette & tartines d’avocat', 'o', [['oeuf', 'X', 110], ['blanc_oeuf', 'P'], ['pain_c', 'C'], ['avocat', 'F'], ['tomates', 'X', 100]]),
    T('pdj_fb', 'pdj', 'Fromage blanc, flocons & banane', 'o', [['fb0', 'P'], ['avoine', 'C'], ['banane', 'X', 120], ['amandes', 'F']]),
    T('pdj_tofu', 'pdj', 'Tofu brouillé & pain complet', 'v', [['tofu', 'P'], ['pain_c', 'C'], ['avocat', 'F'], ['epinards', 'X', 80]]),
    T('pdj_riz', 'pdj', 'Galettes de riz, œufs & banane', 'o', [['oeuf', 'X', 110], ['blanc_oeuf', 'P'], ['galettes_riz', 'C'], ['banane', 'X', 120], ['huile', 'F']]),
    T('pdj_quinoa', 'pdj', 'Porridge de quinoa au lait de soja', 'v', [['quinoa', 'C'], ['lait_soja', 'P'], ['beurre_cacahuete', 'F'], ['fruits_rouges', 'X', 100]]),

    T('r_poulet_riz', 'repas', 'Poulet, riz basmati & brocoli', 'm', [['poulet', 'P'], ['riz', 'C'], ['huile', 'F'], ['brocoli', 'X', 150]]),
    T('r_boeuf_pates', 'repas', 'Pâtes complètes bolognaise', 'm', [['boeuf5', 'P'], ['pates_c', 'C'], ['huile', 'F'], ['coulis', 'X', 120], ['courgette', 'X', 120]]),
    T('r_dinde_quinoa', 'repas', 'Bowl dinde, quinoa & avocat', 'm', [['dinde', 'P'], ['quinoa', 'C'], ['avocat', 'F'], ['salade', 'X', 60], ['tomates', 'X', 100]]),
    T('r_poulet_patate', 'repas', 'Poulet, patate douce & épinards', 'm', [['poulet', 'P'], ['patate_douce', 'C'], ['huile', 'F'], ['epinards', 'X', 100]]),
    T('r_saumon_pdt', 'repas', 'Saumon, pommes de terre & haricots verts', 'p', [['saumon', 'P'], ['pdt', 'C'], ['huile', 'F'], ['haricots_verts', 'X', 150]]),
    T('r_cabillaud_riz', 'repas', 'Cabillaud, riz & poêlée de légumes', 'p', [['cabillaud', 'P'], ['riz', 'C'], ['huile', 'F'], ['poelee', 'X', 200]]),
    T('r_thon_pates', 'repas', 'Pâtes au thon & tomates', 'p', [['thon', 'P'], ['pates', 'C'], ['huile', 'F'], ['tomates', 'X', 150]]),
    T('r_oeufs_riz', 'repas', 'Riz sauté aux œufs & légumes', 'o', [['oeuf', 'X', 110], ['blanc_oeuf', 'P'], ['riz', 'C'], ['huile', 'F'], ['poelee', 'X', 180]]),
    T('r_omelette_pdt', 'repas', 'Omelette, pommes de terre & salade', 'o', [['oeuf', 'X', 165], ['blanc_oeuf', 'P'], ['pdt', 'C'], ['huile', 'F'], ['salade', 'X', 80]]),
    T('r_tofu_riz', 'repas', 'Curry de tofu, lentilles & riz', 'v', [['tofu', 'P'], ['riz', 'C'], ['huile', 'F'], ['lentilles', 'X', 50], ['carottes', 'X', 100]]),
    T('r_tempeh_pates', 'repas', 'Pâtes complètes, tempeh & courgettes', 'v', [['tempeh', 'P'], ['pates_c', 'C'], ['huile', 'F'], ['courgette', 'X', 150], ['coulis', 'X', 100]]),
    T('r_tofu_semoule', 'repas', 'Couscous végétal tofu & pois chiches', 'v', [['tofu', 'P'], ['semoule', 'C'], ['huile', 'F'], ['poischiches', 'X', 100], ['poelee', 'X', 150]]),
    T('r_tempeh_patate', 'repas', 'Tempeh, patate douce & brocoli', 'v', [['tempeh', 'P'], ['patate_douce', 'C'], ['huile', 'F'], ['brocoli', 'X', 150]]),
    T('r_tofu_quinoa', 'repas', 'Bowl tofu, quinoa & pois chiches', 'v', [['tofu', 'P'], ['quinoa', 'C'], ['avocat', 'F'], ['poischiches', 'X', 80], ['tomates', 'X', 100]]),

    T('c_skyr', 'col', 'Skyr, banane & amandes', 'o', [['skyr', 'P'], ['banane', 'X', 120], ['galettes_riz', 'C'], ['amandes', 'F']]),
    T('c_fb', 'col', 'Fromage blanc, pomme & noix', 'o', [['fb0', 'P'], ['pomme', 'X', 150], ['avoine', 'C'], ['noix', 'F']]),
    T('c_thon', 'col', 'Tartine thon-avocat', 'p', [['thon', 'P'], ['pain_c', 'C'], ['avocat', 'F'], ['salade', 'X', 30]]),
    T('c_jambon', 'col', 'Sandwich jambon-emmental', 'm', [['jambon', 'P'], ['pain_c', 'C'], ['emmental', 'F'], ['tomates', 'X', 60]]),
    T('c_soja', 'col', 'Yaourt soja, tofu fumé & tartine', 'v', [['tofu', 'P'], ['pain_c', 'C'], ['beurre_cacahuete', 'F'], ['yaourt_soja', 'X', 125], ['banane', 'X', 120]]),
    T('c_galettes', 'col', 'Galettes de riz, lait de soja & banane', 'v', [['lait_soja', 'P'], ['galettes_riz', 'C'], ['beurre_cacahuete', 'F'], ['banane', 'X', 120]])
  ];
})(window.GYM = window.GYM || {});

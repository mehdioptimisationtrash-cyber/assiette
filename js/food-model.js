// Modèle d'aliment commun + conversions depuis CIQUAL et Open Food Facts (fonctions pures).
//
// Aliment normalisé :
// { id, source: 'ciqual'|'off'|'custom'|'recipe'|'ai', name, brand, group, unit: 'g'|'ml',
//   per100: { kcal, p, c, f, sug, fib, sat, salt, ... }, portions: [{ label, g }],
//   image, nutriscore, nova, ecoscore, additives, allergens, ingredients, barcode }

import { NUTRIENT_KEYS } from './nutrition.js';

/** Minuscules, sans accents ni ponctuation — pour la recherche. */
export function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Portions usuelles par mot-clé (première correspondance gagnante), en grammes.
const PORTION_RULES = [
  [/\boeuf\b/, [{ label: '1 œuf', g: 55 }]],
  [/\bpomme\b(?! de terre)/, [{ label: '1 pomme', g: 150 }]],
  [/\bbanane\b/, [{ label: '1 banane', g: 120 }]],
  [/\borange\b/, [{ label: '1 orange', g: 150 }]],
  [/\bkiwi\b/, [{ label: '1 kiwi', g: 75 }]],
  [/\byaourt\b/, [{ label: '1 pot', g: 125 }]],
  [/\bpain\b/, [{ label: '1 tranche', g: 30 }, { label: '1/4 baguette', g: 60 }]],
  [/\bbaguette\b/, [{ label: '1/4 baguette', g: 60 }]],
  [/\bcroissant\b/, [{ label: '1 croissant', g: 60 }]],
  [/\b(pates|riz|semoule|quinoa|boulgour)\b.*\bcuit/, [{ label: '1 assiette', g: 200 }]],
  [/\b(pates|riz|semoule)\b/, [{ label: '1 portion crue', g: 80 }]],
  [/\bfromage\b|\bcamembert\b|\bcomte\b|\bemmental\b/, [{ label: '1 portion', g: 30 }]],
  [/\bbeurre\b/, [{ label: '1 noisette', g: 10 }]],
  [/\bhuile\b/, [{ label: '1 c. à soupe', g: 10 }]],
  [/\bsucre\b/, [{ label: '1 morceau', g: 5 }]],
  [/\bsteak|escalope|filet|blanc de poulet|cuisse/, [{ label: '1 pièce', g: 120 }]],
  [/\bjambon\b/, [{ label: '1 tranche', g: 40 }]],
  [/\bbiere\b/, [{ label: '1 demi', g: 250 }, { label: '1 pinte', g: 500 }]],
  [/\bvin\b/, [{ label: '1 verre', g: 125 }]],
  [/\b(lait|jus|soda|eau|cafe|the|boisson)\b/, [{ label: '1 verre', g: 200 }, { label: '1 tasse', g: 150 }]],
  [/\bsoupe|potage|veloute\b/, [{ label: '1 bol', g: 250 }]],
  [/\bpizza\b/, [{ label: '1 part', g: 120 }]],
  [/\bchocolat\b/, [{ label: '1 carré', g: 5 }]],
  [/\bbiscuit|gateau sec\b/, [{ label: '1 biscuit', g: 10 }]],
];

// Aliments du quotidien, remontés en tête de recherche (libellés Ciqual exacts).
const EVERYDAY = new Set([
  'Pain, baguette, courante', 'Pain de mie, courant', 'Pain complet ou intégral (à la farine T150)',
  'Lait demi-écrémé, UHT', 'Lait entier, UHT', 'Pâtes sèches standard, cuites, non salées',
  'Riz blanc, cuit, non salé', 'Poulet, filet, sans peau, sauté/poêlé', 'Boeuf, steak haché 5% MG, cuit',
  'Boeuf, steak haché 15% MG, cuit', 'Oeuf, dur', 'Oeuf, cru', 'Café, non instantané, non sucré, prêt à boire',
  'Thé infusé, non sucré', 'Cola, sucré', 'Fromage blanc nature, 0% MG', 'Beurre à 82% MG, doux',
  "Huile d'olive vierge extra", "Pomme de terre, bouillie/cuite à l'eau", 'Jambon cuit, supérieur',
  'Saumon, cuit, sans précision (aliment moyen)', 'Thon, rôti/cuit au four', 'Emmental ou emmenthal',
  'Camembert, sans précision', 'Carotte, crue', 'Tomate, crue', 'Bière "coeur de marché" (4-5° alcool)',
  'Vin rouge', 'Chocolat noir à moins de 70% de cacao, à croquer, tablette',
  'Frites de pommes de terre, surgelées, cuites en friteuse', 'Pizza au fromage ou Pizza margherita, préemballée',
  'Muesli (aliment moyen)', "Lentille, bouillie/cuite à l'eau", "Pois chiche, bouilli/cuit à l'eau",
  'Haricot vert, cuit', 'Brocoli, cuit', 'Courgette, pulpe et peau, cuite', 'Avocat, pulpe, cru', 'Fraise, crue',
  'Orange, pulpe, crue', 'Croissant, sans précision', 'Sucre blanc', 'Miel', 'Pâte à tartiner chocolat et noisette',
  'Confiture ou Marmelade, tout type de fruits (aliment moyen)', 'Pomme, pulpe et peau, crue', 'Banane, pulpe, crue',
  'Eau minérale, plate (aliment moyen)', 'Yaourt, lait fermenté ou spécialité laitière, nature',
]);
export const EVERYDAY_BONUS = 6;

const LIQUID = /\b(boisson|jus|lait|eau|soda|biere|vin|cafe|the|sirop|nectar|soupe|bouillon)\b/;

export function defaultPortions(name) {
  const text = normalizeText(name);
  const rule = PORTION_RULES.find(([re]) => re.test(text));
  return [...(rule ? rule[1] : []), { label: '100 g', g: 100 }];
}

/** Ligne compacte de data/ciqual.json -> aliment normalisé. */
export function fromCiqualRow(fields, row) {
  const record = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
  const per100 = Object.fromEntries(
    NUTRIENT_KEYS.filter((k) => record[k] != null).map((k) => [k, record[k]]),
  );
  return {
    id: `ciqual:${record.id}`,
    source: 'ciqual',
    name: record.name,
    group: record.group,
    unit: LIQUID.test(normalizeText(record.name)) ? 'ml' : 'g',
    per100,
    portions: defaultPortions(record.name),
    ...(EVERYDAY.has(record.name) ? { everyday: true } : {}),
  };
}

// Open Food Facts : clé OFF (_100g) -> [clé interne, facteur vers notre unité]
const OFF_NUTRIENTS = [
  ['energy-kcal', 'kcal', 1],
  ['proteins', 'p', 1],
  ['carbohydrates', 'c', 1],
  ['fat', 'f', 1],
  ['sugars', 'sug', 1],
  ['fiber', 'fib', 1],
  ['saturated-fat', 'sat', 1],
  ['salt', 'salt', 1],
  ['alcohol', 'alc', 1],
  ['calcium', 'ca', 1000],
  ['iron', 'fe', 1000],
  ['magnesium', 'mg', 1000],
  ['potassium', 'k', 1000],
  ['sodium', 'na', 1000],
  ['vitamin-c', 'vc', 1000],
  ['vitamin-d', 'vd', 1e6],
  ['vitamin-b9', 'b9', 1e6],
  ['vitamin-b12', 'b12', 1e6],
];

export const OFF_FIELDS = [
  'code', 'product_name', 'product_name_fr', 'generic_name_fr', 'brands', 'quantity',
  'serving_size', 'serving_quantity', 'nutriments', 'nutriscore_grade', 'nova_group',
  'ecoscore_grade', 'image_front_small_url', 'image_front_url', 'allergens_tags',
  'additives_tags', 'ingredients_text_fr', 'ingredients_text', 'categories_tags',
].join(',');

const cleanTag = (tag) => String(tag).replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
const validGrade = (g) => (/^[a-e]$/.test(g ?? '') ? g : null);

/** Produit Open Food Facts -> aliment normalisé (null si aucune valeur nutritionnelle). */
export function fromOffProduct(product) {
  if (!product) return null;
  const n = product.nutriments ?? {};
  const per100 = {};
  for (const [offKey, key, factor] of OFF_NUTRIENTS) {
    const raw = n[`${offKey}_100g`];
    if (raw != null && raw !== '' && !Number.isNaN(Number(raw))) per100[key] = Number(raw) * factor;
  }
  if (per100.kcal == null && n['energy_100g'] != null) per100.kcal = Number(n['energy_100g']) / 4.184;
  if (per100.kcal == null) return null;

  const name =
    product.product_name_fr || product.product_name || product.generic_name_fr || 'Produit sans nom';
  const servingG = Number(product.serving_quantity);
  const portions = [
    ...(servingG > 0 ? [{ label: `1 portion (${product.serving_size || `${servingG} g`})`, g: servingG }] : []),
    ...defaultPortions(name).filter((p) => !(servingG > 0 && p.g === servingG)),
  ];
  const categories = (product.categories_tags ?? []).join(' ');
  return {
    id: `off:${product.code}`,
    source: 'off',
    barcode: product.code,
    name: name.trim(),
    brand: (product.brands ?? '').split(',')[0].trim() || null,
    quantity: product.quantity || null,
    unit: /beverages|boissons/.test(categories) ? 'ml' : 'g',
    per100,
    portions,
    image: product.image_front_small_url || product.image_front_url || null,
    nutriscore: validGrade(product.nutriscore_grade),
    nova: [1, 2, 3, 4].includes(Number(product.nova_group)) ? Number(product.nova_group) : null,
    ecoscore: validGrade(product.ecoscore_grade),
    additives: (product.additives_tags ?? []).map((t) => cleanTag(t).toUpperCase()),
    allergens: (product.allergens_tags ?? []).map(cleanTag),
    ingredients: product.ingredients_text_fr || product.ingredients_text || null,
  };
}

/**
 * Score de pertinence d'un nom pour une requête (0 = pas de correspondance).
 * Tous les mots de la requête doivent apparaître ; bonus si le nom commence par la requête
 * et pour les noms courts (aliments « de base » avant les plats composés).
 */
export function matchScore(query, name) {
  const q = normalizeText(query);
  const n = normalizeText(name);
  if (!q) return 0;
  const words = q.split(' ');
  const nameWords = n.split(' ');
  let score = 0;
  for (const w of words) {
    const exact = nameWords.includes(w) || nameWords.includes(`${w}s`) || nameWords.includes(w.replace(/s$/, ''));
    if (exact) score += 10;
    else if (nameWords.some((nw) => nw.startsWith(w))) score += 6;
    else if (n.includes(w)) score += 3;
    else return 0;
  }
  if (n.startsWith(q)) score += 8;
  if (nameWords[0] === words[0]) score += 4;
  // « pomme » ne doit pas faire remonter « pomme de terre » ni « noix de coco » avant le fruit.
  const lastWord = words.at(-1);
  if (new RegExp(`\\b${lastWord}s? d(e|u|es) `).test(n) && !/ d(e|u|es)$/.test(q)) score -= 12;
  if (/\b(cru|crue|nature)\b/.test(n)) score += 2;
  if (/\b(sec|seche|deshydrate|deshydrates|poudre|lyophilise)\b/.test(n) && !/\b(sec|seche|deshydrat|poudre)/.test(q)) score -= 4;
  return score - n.length / 40;
}

/** Aliment composé (recette) : somme des ingrédients ramenée à 100 g. */
export function buildRecipe({ id, name, ingredients, servings }) {
  const totalG = ingredients.reduce((acc, ing) => acc + ing.grams, 0);
  if (!totalG) return null;
  const per100 = Object.fromEntries(
    NUTRIENT_KEYS.map((k) => {
      const sum = ingredients.reduce((acc, ing) => acc + ((ing.food.per100[k] ?? 0) * ing.grams) / 100, 0);
      return [k, (sum / totalG) * 100];
    }),
  );
  const portionG = Math.round(totalG / Math.max(1, servings));
  return {
    id,
    source: 'recipe',
    name,
    unit: 'g',
    per100,
    portions: [{ label: `1 part (${portionG} g)`, g: portionG }, { label: '100 g', g: 100 }],
    ingredients: ingredients.map((ing) => `${ing.food.name} (${Math.round(ing.grams)} g)`).join(', '),
    recipe: { servings, items: ingredients.map((ing) => ({ food: ing.food, grams: ing.grams })) },
  };
}

/** Version allégée d'un aliment pour l'enregistrer dans le journal. */
export function snapshot(food) {
  const { recipe, ingredients, additives, allergens, ...light } = food;
  return light;
}

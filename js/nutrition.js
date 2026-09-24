// Calculs nutritionnels purs (aucun accès au DOM ni au stockage) — testés dans tests/.

export const MEALS = [
  { id: 'breakfast', label: 'Petit-déjeuner', share: 0.25 },
  { id: 'lunch', label: 'Déjeuner', share: 0.35 },
  { id: 'dinner', label: 'Dîner', share: 0.3 },
  { id: 'snack', label: 'Collations', share: 0.1 },
];

export const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Sédentaire', hint: 'Bureau, peu de marche', factor: 1.2 },
  { id: 'light', label: 'Légèrement actif', hint: '1 à 3 séances / semaine', factor: 1.375 },
  { id: 'moderate', label: 'Actif', hint: '3 à 5 séances / semaine', factor: 1.55 },
  { id: 'very', label: 'Très actif', hint: '6 à 7 séances / semaine', factor: 1.725 },
  { id: 'athlete', label: 'Extrême', hint: 'Travail physique + sport', factor: 1.9 },
];

export const GOALS = [
  { id: 'lose', label: 'Perdre du poids' },
  { id: 'maintain', label: 'Rester stable' },
  { id: 'gain', label: 'Prendre du muscle' },
];

// Nutriments suivis : clé courte, libellé, unité, apport de référence journalier (adulte, INCO/ANSES)
// `limit: true` = à ne pas dépasser (sucres, sel, graisses saturées).
export const NUTRIENTS = [
  { key: 'kcal', label: 'Énergie', unit: 'kcal' },
  { key: 'p', label: 'Protéines', unit: 'g' },
  { key: 'c', label: 'Glucides', unit: 'g' },
  { key: 'f', label: 'Lipides', unit: 'g' },
  { key: 'sug', label: 'Sucres', unit: 'g', ref: 90, limit: true },
  { key: 'fib', label: 'Fibres', unit: 'g', ref: 30 },
  { key: 'sat', label: 'Acides gras saturés', unit: 'g', ref: 20, limit: true },
  { key: 'salt', label: 'Sel', unit: 'g', ref: 6, limit: true },
  { key: 'alc', label: 'Alcool', unit: 'g' },
  { key: 'ca', label: 'Calcium', unit: 'mg', ref: 950 },
  { key: 'fe', label: 'Fer', unit: 'mg', ref: 11 },
  { key: 'mg', label: 'Magnésium', unit: 'mg', ref: 380 },
  { key: 'k', label: 'Potassium', unit: 'mg', ref: 3500 },
  { key: 'na', label: 'Sodium', unit: 'mg' },
  { key: 'vc', label: 'Vitamine C', unit: 'mg', ref: 110 },
  { key: 'vd', label: 'Vitamine D', unit: 'µg', ref: 15 },
  { key: 'b9', label: 'Folates (B9)', unit: 'µg', ref: 330 },
  { key: 'b12', label: 'Vitamine B12', unit: 'µg', ref: 4 },
];

export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);

const KCAL_PER_KG_FAT = 7700;
const MIN_KCAL = { male: 1500, female: 1200 };
const FAT_SHARE = 0.3;
const HEALTHY_BMI_CAP = 25;
const PACE_LIMITS = { min: 0.1, max: 1 };

/** Âge en années révolues à partir d'une date ISO (YYYY-MM-DD). */
export function ageFrom(birthDate, today = new Date()) {
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function bmi(weightKg, heightCm) {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Métabolisme de base — équation de Mifflin-St Jeor (kcal/jour). */
export function bmr({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'female' ? base - 161 : base + 5;
}

export function tdee(profile) {
  const level = ACTIVITY_LEVELS.find((a) => a.id === profile.activity) ?? ACTIVITY_LEVELS[0];
  return bmr(profile) * level.factor;
}

/**
 * Objectifs journaliers : calories, macros, eau.
 * `pace` = kg par semaine visés (perte ou prise), borné à 0,1–1 kg.
 * Protéines calculées sur un poids de référence plafonné à IMC 25 pour ne pas surestimer
 * les besoins des personnes en surpoids.
 */
export function computeTargets(profile) {
  const pace = clamp(profile.pace ?? 0.5, PACE_LIMITS.min, PACE_LIMITS.max);
  const maintenance = tdee(profile);
  const dailyDelta = (pace * KCAL_PER_KG_FAT) / 7;
  let kcal = maintenance;
  if (profile.goal === 'lose') kcal = maintenance - dailyDelta;
  if (profile.goal === 'gain') kcal = maintenance + Math.min(dailyDelta, 500);
  kcal = Math.max(kcal, MIN_KCAL[profile.sex] ?? MIN_KCAL.male);

  const m = profile.heightCm / 100;
  const refWeight = Math.min(profile.weightKg, HEALTHY_BMI_CAP * m * m);
  const proteinPerKg = profile.goal === 'maintain' ? 1.4 : 1.8;
  const p = refWeight * proteinPerKg;
  const f = (kcal * FAT_SHARE) / 9;
  const c = Math.max(0, (kcal - p * 4 - f * 9) / 4);

  return {
    kcal: Math.round(kcal / 10) * 10,
    p: Math.round(p),
    c: Math.round(c),
    f: Math.round(f),
    fib: 30,
    waterMl: Math.round(Math.min(3500, profile.weightKg * 33) / 250) * 250,
    maintenance: Math.round(maintenance),
  };
}

/** Valeurs nutritionnelles d'une quantité (g ou ml) à partir des valeurs pour 100. */
export function scale(per100, grams) {
  const ratio = grams / 100;
  return Object.fromEntries(
    NUTRIENT_KEYS.filter((k) => per100[k] != null).map((k) => [k, per100[k] * ratio]),
  );
}

/** Somme des nutriments d'une liste d'entrées du journal ({ food: { per100 }, grams }). */
export function sumEntries(entries) {
  return entries.reduce((total, entry) => {
    const part = scale(entry.food.per100, entry.grams);
    return Object.fromEntries(
      NUTRIENT_KEYS.map((k) => [k, (total[k] ?? 0) + (part[k] ?? 0)]),
    );
  }, Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])));
}

/** Répartition des calories entre protéines, glucides, lipides (en %). */
export function macroSplit({ p = 0, c = 0, f = 0 }) {
  const kp = p * 4;
  const kc = c * 4;
  const kf = f * 9;
  const total = kp + kc + kf;
  if (!total) return { p: 0, c: 0, f: 0 };
  return { p: (kp / total) * 100, c: (kc / total) * 100, f: (kf / total) * 100 };
}

/**
 * Note de la journée sur 100, façon « équilibre » : proximité de l'objectif calorique,
 * protéines atteintes, fibres, et pénalités sucres / sel / saturés au-delà des repères.
 */
export function dayScore(totals, targets) {
  if (!totals.kcal) return null;
  const kcalGap = Math.abs(totals.kcal - targets.kcal) / targets.kcal;
  const energy = Math.max(0, 1 - kcalGap * 2) * 35;
  const protein = Math.min(1, totals.p / targets.p) * 25;
  const fiber = Math.min(1, totals.fib / targets.fib) * 15;
  const limits = [
    ['sug', 90],
    ['salt', 6],
    ['sat', 20],
  ];
  const moderation = limits.reduce((acc, [k, ref]) => {
    const excess = Math.max(0, totals[k] / ref - 1);
    return acc + Math.max(0, 1 - excess) * (25 / limits.length);
  }, 0);
  return Math.round(energy + protein + fiber + moderation);
}

/** Moyenne mobile simple pour lisser une courbe de poids. */
export function movingAverage(values, window = 7) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/** Variation hebdomadaire estimée (kg/semaine) par régression linéaire sur [{date, kg}]. */
export function weeklyTrend(points) {
  if (points.length < 2) return null;
  const t0 = new Date(points[0].date).getTime();
  const xs = points.map((pt) => (new Date(pt.date).getTime() - t0) / 86400000);
  const ys = points.map((pt) => pt.kg);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
  if (!den) return null;
  return (num / den) * 7;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

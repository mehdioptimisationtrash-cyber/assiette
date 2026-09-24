// Préparation des envois vers Google Sheets (fonctions pures, testées).
// Principe : on compare une empreinte de chaque jour à celle déjà envoyée ; seuls les jours
// modifiés partent. La bibliothèque (profil, favoris, recettes…) et les pesées partent en bloc
// quand elles changent.

import { MEALS, dayScore, sumEntries, scale } from './nutrition.js';

const LIBRARY_KEYS = ['profile', 'targets', 'favorites', 'customFoods', 'recipes', 'recents'];

/** Empreinte courte d'une chaîne (djb2) — sert seulement à détecter un changement. */
export function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Toutes les dates qui ont du contenu (repas, eau ou notes). */
export function knownDates(state) {
  return [...new Set([...Object.keys(state.entries), ...Object.keys(state.water), ...Object.keys(state.notes ?? {})])].sort();
}

/** Données brutes d'un jour, telles que stockées dans la feuille (et relues à la restauration). */
export function dayData(state, date) {
  return {
    date,
    entries: state.entries[date] ?? [],
    water: state.water[date] ?? 0,
    note: state.notes?.[date] ?? null,
  };
}

/** Résumé lisible d'un jour pour l'onglet « jours ». */
export function daySummary(state, date) {
  const { entries, water, note } = dayData(state, date);
  const totals = sumEntries(entries);
  const weight = state.weights.find((w) => w.date === date)?.kg ?? null;
  const meals = MEALS.map((m) => {
    const items = entries.filter((e) => e.meal === m.id);
    return items.length ? `${m.label} : ${items.map((e) => e.food.name).join(', ')}` : null;
  }).filter(Boolean);
  return {
    kcal: Math.round(totals.kcal),
    p: Math.round(totals.p),
    c: Math.round(totals.c),
    f: Math.round(totals.f),
    fib: Math.round(totals.fib),
    waterL: Math.round(water / 100) / 10,
    weight,
    score: state.targets && entries.length ? dayScore(totals, state.targets) : null,
    mood: note?.mood ?? null,
    hunger: note?.hunger ?? null,
    sleep: note?.sleep ?? null,
    text: note?.text ?? '',
    meals: meals.join(' | '),
  };
}

/** Ligne lisible par aliment pour l'onglet « repas ». */
export function entryRows(state, date) {
  return (state.entries[date] ?? []).map((e) => {
    const v = scale(e.food.per100, e.grams);
    return {
      date,
      meal: MEALS.find((m) => m.id === e.meal)?.label ?? e.meal,
      name: e.food.name,
      brand: e.food.brand ?? '',
      grams: Math.round(e.grams),
      kcal: Math.round(v.kcal ?? 0),
      p: Math.round((v.p ?? 0) * 10) / 10,
      c: Math.round((v.c ?? 0) * 10) / 10,
      f: Math.round((v.f ?? 0) * 10) / 10,
    };
  });
}

export function libraryData(state) {
  return Object.fromEntries(LIBRARY_KEYS.map((k) => [k, state[k]]));
}

/**
 * Ce qu'il faut envoyer par rapport aux empreintes déjà envoyées (`synced`).
 * Renvoie { payload, hashes } où `hashes` sont les empreintes à mémoriser si l'envoi réussit,
 * ou null s'il n'y a rien à envoyer.
 */
export function buildPush(state, synced = {}) {
  const hashes = { days: { ...(synced.days ?? {}) } };
  const days = {};
  const dates = new Set([...knownDates(state), ...Object.keys(synced.days ?? {})]);
  // Le poids apparaît dans le résumé du jour : un changement de pesée rafraîchit le jour concerné.
  state.weights.forEach((w) => dates.add(w.date));
  for (const date of dates) {
    const data = dayData(state, date);
    const summary = daySummary(state, date);
    const h = hash(JSON.stringify([data, summary.weight]));
    if (h !== synced.days?.[date]) {
      days[date] = { data, summary, rows: entryRows(state, date) };
      hashes.days[date] = h;
    }
  }
  const library = libraryData(state);
  hashes.library = hash(JSON.stringify(library));
  hashes.weights = hash(JSON.stringify(state.weights));

  const payload = {};
  if (Object.keys(days).length) payload.days = days;
  if (hashes.library !== synced.library) payload.library = library;
  if (hashes.weights !== synced.weights) payload.weights = state.weights;
  return Object.keys(payload).length ? { payload, hashes } : null;
}

/** Reconstruit les données de l'app à partir de la réponse du script (restauration). */
export function fromRemote(remote) {
  const entries = {};
  const water = {};
  const notes = {};
  for (const day of Object.values(remote.days ?? {})) {
    if (!day?.date) continue;
    if (day.entries?.length) entries[day.date] = day.entries;
    if (day.water) water[day.date] = day.water;
    if (day.note) notes[day.date] = day.note;
  }
  const library = remote.library ?? {};
  return {
    entries,
    water,
    notes,
    weights: Array.isArray(remote.weights) ? [...remote.weights].sort((a, b) => a.date.localeCompare(b.date)) : [],
    ...Object.fromEntries(LIBRARY_KEYS.filter((k) => library[k] !== undefined).map((k) => [k, library[k]])),
  };
}

/** Empreintes correspondant à un état tout juste restauré (évite de tout renvoyer). */
export function hashesFor(state) {
  return buildPush(state, {})?.hashes ?? {};
}

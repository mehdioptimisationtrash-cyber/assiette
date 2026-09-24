// État de l'app, persisté dans le navigateur (localStorage). Mises à jour immuables.

const STORAGE_KEY = 'assiette:v1';
const MAX_RECENTS = 30;

const EMPTY_STATE = Object.freeze({
  profile: null, // { name, sex, birthDate, heightCm, weightKg, activity, goal, pace }
  targets: null, // calculé depuis le profil, ajustable à la main
  entries: {}, // { 'YYYY-MM-DD': [{ id, meal, grams, food, at }] }
  water: {}, // { 'YYYY-MM-DD': ml }
  weights: [], // [{ date, kg }] trié par date
  favorites: [], // [food]
  customFoods: [], // [food]
  recipes: [], // [food]
  recents: [], // [food]
  settings: { apiKey: '', model: 'claude-opus-5' },
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const saved = JSON.parse(raw);
    return { ...EMPTY_STATE, ...saved, settings: { ...EMPTY_STATE.settings, ...saved.settings } };
  } catch (err) {
    console.error('Lecture des données impossible', err);
    return EMPTY_STATE;
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Sauvegarde impossible', err);
    return false;
  }
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Applique `updater(state) -> nouvel état`, sauvegarde et notifie. */
export function update(updater) {
  state = updater(state);
  const saved = persist();
  listeners.forEach((fn) => fn(state));
  return saved;
}

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

// ——— Journal ———

export function addEntries(date, meal, items) {
  const created = items.map(({ food, grams }) => ({ id: uid(), meal, grams, food, at: Date.now() }));
  return update((s) => ({
    ...s,
    entries: { ...s.entries, [date]: [...(s.entries[date] ?? []), ...created] },
    recents: mergeRecents(s.recents, items.map((i) => i.food)),
  }));
}

export function updateEntry(date, id, changes) {
  return update((s) => ({
    ...s,
    entries: {
      ...s.entries,
      [date]: (s.entries[date] ?? []).map((e) => (e.id === id ? { ...e, ...changes } : e)),
    },
  }));
}

export function removeEntry(date, id) {
  return update((s) => ({
    ...s,
    entries: { ...s.entries, [date]: (s.entries[date] ?? []).filter((e) => e.id !== id) },
  }));
}

export function copyMeal(fromDate, toDate, meal) {
  const source = (state.entries[fromDate] ?? []).filter((e) => e.meal === meal);
  if (!source.length) return 0;
  addEntries(toDate, meal, source.map((e) => ({ food: e.food, grams: e.grams })));
  return source.length;
}

function mergeRecents(recents, foods) {
  const ids = new Set(foods.map((f) => f.id));
  return [...[...foods].reverse(), ...recents.filter((f) => !ids.has(f.id))].slice(0, MAX_RECENTS);
}

// ——— Eau & poids ———

export function addWater(date, ml) {
  return update((s) => ({
    ...s,
    water: { ...s.water, [date]: Math.max(0, (s.water[date] ?? 0) + ml) },
  }));
}

export function logWeight(date, kg) {
  return update((s) => {
    const weights = [...s.weights.filter((w) => w.date !== date), { date, kg }].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const latest = weights.at(-1);
    const profile = s.profile ? { ...s.profile, weightKg: latest.kg } : s.profile;
    return { ...s, weights, profile };
  });
}

export function removeWeight(date) {
  return update((s) => ({ ...s, weights: s.weights.filter((w) => w.date !== date) }));
}

// ——— Bibliothèque perso ———

export function toggleFavorite(food) {
  return update((s) => {
    const exists = s.favorites.some((f) => f.id === food.id);
    return {
      ...s,
      favorites: exists ? s.favorites.filter((f) => f.id !== food.id) : [food, ...s.favorites],
    };
  });
}

export function isFavorite(id) {
  return state.favorites.some((f) => f.id === id);
}

export function saveCustomFood(food) {
  return update((s) => ({
    ...s,
    customFoods: [food, ...s.customFoods.filter((f) => f.id !== food.id)],
  }));
}

export function saveRecipe(food) {
  return update((s) => ({ ...s, recipes: [food, ...s.recipes.filter((f) => f.id !== food.id)] }));
}

export function deleteLibraryFood(id) {
  return update((s) => ({
    ...s,
    customFoods: s.customFoods.filter((f) => f.id !== id),
    recipes: s.recipes.filter((f) => f.id !== id),
    favorites: s.favorites.filter((f) => f.id !== id),
  }));
}

// ——— Profil & réglages ———

export function saveProfile(profile, targets) {
  return update((s) => ({ ...s, profile, targets }));
}

export function saveTargets(targets) {
  return update((s) => ({ ...s, targets }));
}

export function saveSettings(changes) {
  return update((s) => ({ ...s, settings: { ...s.settings, ...changes } }));
}

// ——— Sauvegarde / restauration ———

export function exportData() {
  const { settings, ...data } = state;
  return JSON.stringify({ app: 'assiette', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

export function importData(json) {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'assiette' || typeof parsed.data !== 'object') {
    throw new Error("Ce fichier n'est pas une sauvegarde Assiette.");
  }
  return update((s) => ({ ...EMPTY_STATE, ...parsed.data, settings: s.settings }));
}

export function resetAll() {
  return update(() => EMPTY_STATE);
}

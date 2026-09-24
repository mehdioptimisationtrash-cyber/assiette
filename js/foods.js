// Accès aux bases d'aliments : CIQUAL (locale, hors-ligne) + Open Food Facts (en ligne).

import { EVERYDAY_BONUS, fromCiqualRow, fromOffProduct, matchScore, OFF_FIELDS } from './food-model.js';
import { getState } from './store.js';

const OFF_BASE = 'https://world.openfoodfacts.org';
const OFF_TIMEOUT_MS = 9000;
const LOCAL_LIMIT = 25;
const OFF_PAGE_SIZE = 24;
const OFF_RETRY_DELAY_MS = 1500;

let ciqualPromise = null;

/** Charge la table CIQUAL une seule fois (mise en cache par le service worker). */
export function loadCiqual() {
  if (!ciqualPromise) {
    ciqualPromise = fetch('data/ciqual.json')
      .then((res) => {
        if (!res.ok) throw new Error(`CIQUAL indisponible (${res.status})`);
        return res.json();
      })
      .then(({ fields, foods }) => foods.map((row) => fromCiqualRow(fields, row)))
      .catch((err) => {
        ciqualPromise = null;
        throw err;
      });
  }
  return ciqualPromise;
}

/** Recherche locale : aliments perso + recettes + CIQUAL, triés par pertinence. */
export async function searchLocal(query, limit = LOCAL_LIMIT) {
  const { customFoods, recipes } = getState();
  const ciqual = await loadCiqual();
  return [...recipes, ...customFoods, ...ciqual]
    .map((food) => ({ food, base: matchScore(query, `${food.name} ${food.brand ?? ''}`) }))
    .filter((r) => r.base > 0)
    .map((r) => ({ ...r, score: r.base + (r.food.source === 'ciqual' ? 0 : 3) + (r.food.everyday ? EVERYDAY_BONUS : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.food);
}

async function fetchJson(url, signal) {
  const timeout = AbortSignal.timeout(OFF_TIMEOUT_MS);
  const combined = signal && AbortSignal.any ? AbortSignal.any([signal, timeout]) : timeout;
  const res = await fetch(url, { signal: combined });
  if (!res.ok) throw new Error(`Open Food Facts a répondu ${res.status}`);
  return res.json();
}

/** Recherche de produits du commerce par nom ou marque. */
export async function searchOff(query, signal) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(OFF_PAGE_SIZE),
    sort_by: 'unique_scans_n',
    fields: OFF_FIELDS,
    lc: 'fr',
    cc: 'fr',
  });
  const url = `${OFF_BASE}/cgi/search.pl?${params}`;
  let data;
  try {
    data = await fetchJson(url, signal);
  } catch (err) {
    // Le moteur de recherche d'Open Food Facts renvoie parfois 503 quand il est saturé.
    if (signal?.aborted) throw err;
    await new Promise((resolve) => setTimeout(resolve, OFF_RETRY_DELAY_MS));
    data = await fetchJson(url, signal);
  }
  return (data.products ?? []).map(fromOffProduct).filter(Boolean);
}

/** Produit par code-barres. Renvoie null si inconnu ou sans valeurs nutritionnelles. */
export async function getByBarcode(code) {
  const clean = String(code).replace(/\D/g, '');
  if (clean.length < 6) return null;
  const data = await fetchJson(`${OFF_BASE}/api/v2/product/${clean}.json?fields=${OFF_FIELDS}&lc=fr`);
  if (data.status !== 1) return null;
  return fromOffProduct({ ...data.product, code: data.product.code ?? clean });
}

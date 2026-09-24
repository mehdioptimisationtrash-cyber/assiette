// Ajout d'aliments à un repas : recherche, code-barres, photo, saisie rapide, bibliothèque.

import { h, fmt, openSheet, toast } from '../ui.js';
import { MEALS } from '../nutrition.js';
import { searchLocal, searchOff, getByBarcode } from '../foods.js';
import { snapshot } from '../food-model.js';
import { addEntries, getState, uid } from '../store.js';
import { startScan, explainCameraError } from '../scanner.js';
import { openProduct } from './product.js';
import { openPhoto } from './photo.js';
import { openCustomFood, openRecipe } from './library.js';

const SEARCH_DELAY_MS = 350;

export function openAdd(date, mealId) {
  const meal = MEALS.find((m) => m.id === mealId) ?? MEALS[0];
  openSheet(`Ajouter · ${meal.label}`, (close) => renderAdd(date, meal.id, close));
}

function pickFood(date, meal, food, close) {
  openProduct(food, {
    onConfirm: (grams) => {
      addEntries(date, meal, [{ food: snapshot(food), grams }]);
      toast(`${food.name} ajouté`);
      close();
    },
  });
}

function foodRow(food, onPick) {
  const portion = food.portions?.[0];
  const kcal = portion ? (food.per100.kcal * portion.g) / 100 : food.per100.kcal;
  return h(
    'button.row',
    { type: 'button', onclick: () => onPick(food) },
    h('span.row-main', {}, h('span', {}, food.name), h('small.muted', {}, [food.brand, portion?.label ?? '100 g'].filter(Boolean).join(' · '))),
    h('span.row-side', {}, `${fmt(kcal)} kcal`),
  );
}

function renderAdd(date, meal, close) {
  const onPick = (food) => pickFood(date, meal, food, close);
  const results = h('div.list');
  const offResults = h('div.list');
  const input = h('input.search', { type: 'search', placeholder: 'Rechercher un aliment ou une marque', enterKeyHint: 'search', autocomplete: 'off' });

  const showLibrary = () => {
    const { favorites, recents, recipes, customFoods } = getState();
    const section = (title, foods) => (foods.length ? [h('h3', {}, title), ...foods.map((f) => foodRow(f, onPick))] : []);
    results.replaceChildren(
      ...section('Favoris', favorites),
      ...section('Récents', recents.slice(0, 12)),
      ...section('Mes recettes', recipes),
      ...section('Mes aliments', customFoods),
    );
    if (!results.childElementCount) results.append(h('p.muted', {}, 'Tape le nom d’un aliment, scanne un code-barres ou prends une photo.'));
    offResults.replaceChildren();
  };

  let timer = null;
  let controller = null;
  const runSearch = async (query) => {
    controller?.abort();
    if (query.trim().length < 2) return showLibrary();
    controller = new AbortController();
    const { signal } = controller;
    try {
      const local = await searchLocal(query);
      results.replaceChildren(h('h3', {}, 'Aliments génériques (Ciqual)'), ...(local.length ? local.map((f) => foodRow(f, onPick)) : [h('p.muted', {}, 'Aucun résultat.')]));
    } catch (err) {
      results.replaceChildren(h('p.error', {}, err.message));
    }
    offResults.replaceChildren(h('h3', {}, 'Produits du commerce (Open Food Facts)'), h('p.muted', {}, 'Recherche…'));
    try {
      const products = await searchOff(query, signal);
      if (signal.aborted) return;
      offResults.replaceChildren(h('h3', {}, 'Produits du commerce (Open Food Facts)'), ...(products.length ? products.map((f) => foodRow(f, onPick)) : [h('p.muted', {}, 'Aucun produit trouvé.')]));
    } catch (err) {
      if (signal.aborted) return;
      offResults.replaceChildren(h('h3', {}, 'Produits du commerce'), h('p.muted', {}, navigator.onLine ? 'Open Food Facts ne répond pas, réessaie.' : 'Hors ligne : seuls les aliments génériques sont disponibles.'));
    }
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(input.value), SEARCH_DELAY_MS);
  });

  showLibrary();

  return h(
    'div.stack',
    {},
    h(
      'div.actions',
      {},
      h('button.action', { type: 'button', onclick: () => openScanner(onPick) }, '▦ Code-barres'),
      h('button.action', { type: 'button', onclick: () => openPhoto(date, meal, close) }, '◉ Photo du repas'),
      h('button.action', { type: 'button', onclick: () => openQuickAdd(date, meal, close) }, '＋ Calories rapides'),
    ),
    input,
    results,
    offResults,
    h(
      'div.actions',
      {},
      h('button.link', { type: 'button', onclick: () => openCustomFood(onPick) }, 'Créer un aliment'),
      h('button.link', { type: 'button', onclick: () => openRecipe(onPick) }, 'Créer une recette'),
    ),
  );
}

function openScanner(onPick) {
  let stop = null;
  openSheet(
    'Scanner un code-barres',
    (close) => {
      const video = h('video.scan-video', { playsInline: true, muted: true, autoplay: true });
      const status = h('p.muted', {}, 'Vise le code-barres du produit…');
      const manual = h('input', { type: 'text', inputMode: 'numeric', placeholder: 'ou tape les chiffres du code', autocomplete: 'off' });

      const lookup = async (code) => {
        status.textContent = `Code ${code} : recherche…`;
        try {
          const food = await getByBarcode(code);
          if (!food) {
            status.textContent = `Produit ${code} inconnu d'Open Food Facts. Tu peux le créer avec « Créer un aliment ».`;
            return;
          }
          close();
          onPick(food);
        } catch (err) {
          status.textContent = navigator.onLine ? `Erreur : ${err.message}` : 'Pas de connexion internet.';
        }
      };

      startScan(video, lookup)
        .then((fn) => { stop = fn; })
        .catch((err) => { status.textContent = explainCameraError(err); });

      return h(
        'div.stack',
        {},
        video,
        status,
        h('form.inline', { onsubmit: (e) => { e.preventDefault(); if (manual.value) lookup(manual.value); } }, manual, h('button', { type: 'submit' }, 'Chercher')),
      );
    },
    { onClose: () => stop?.() },
  );
}

function openQuickAdd(date, meal, closeParent) {
  openSheet('Calories rapides', (close) => {
    const name = h('input', { type: 'text', placeholder: 'ex. Repas au restaurant', value: 'Saisie rapide' });
    const kcal = h('input', { type: 'number', inputMode: 'numeric', min: '0', required: true });
    const p = h('input', { type: 'text', inputMode: 'decimal', pattern: '[0-9]*[.,]?[0-9]*', min: '0', placeholder: 'facultatif' });
    const c = h('input', { type: 'text', inputMode: 'decimal', pattern: '[0-9]*[.,]?[0-9]*', min: '0', placeholder: 'facultatif' });
    const f = h('input', { type: 'text', inputMode: 'decimal', pattern: '[0-9]*[.,]?[0-9]*', min: '0', placeholder: 'facultatif' });
    const num = (el) => Number(el.value.replace(',', '.')) || 0;
    const submit = (e) => {
      e.preventDefault();
      if (num(kcal) <= 0) return toast('Indique les calories', 'error');
      // Stocké comme 100 g = la saisie, quantité 100 → valeurs exactes.
      const food = { id: `quick:${uid()}`, source: 'custom', name: name.value.trim() || 'Saisie rapide', unit: 'g', per100: { kcal: num(kcal), p: num(p), c: num(c), f: num(f) }, portions: [] };
      addEntries(date, meal, [{ food, grams: 100 }]);
      toast('Ajouté');
      close();
      closeParent();
    };
    return h(
      'form.stack',
      { onsubmit: submit },
      h('label.field', {}, 'Nom', name),
      h('label.field', {}, 'Calories (kcal)', kcal),
      h('div.grid3', {}, h('label.field', {}, 'Protéines g', p), h('label.field', {}, 'Glucides g', c), h('label.field', {}, 'Lipides g', f)),
      h('button.primary', { type: 'submit' }, 'Ajouter'),
    );
  });
}

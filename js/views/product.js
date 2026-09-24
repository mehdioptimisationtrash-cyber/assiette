// Fiche aliment : choix de la quantité, valeurs nutritionnelles, scores, favori.

import { h, fmt, gradeBadge, openSheet } from '../ui.js';
import { NUTRIENTS, scale } from '../nutrition.js';
import { isFavorite, toggleFavorite } from '../store.js';

const SOURCE_LABEL = {
  ciqual: 'Table Ciqual (ANSES)',
  off: 'Open Food Facts',
  custom: 'Mon aliment',
  recipe: 'Ma recette',
  ai: 'Estimation IA',
};

/**
 * Ouvre la fiche. `onConfirm(grams)` est appelé au clic sur le bouton principal.
 * `initialGrams` permet de modifier une entrée existante.
 */
export function openProduct(food, { confirmLabel = 'Ajouter', initialGrams, onConfirm, onDelete } = {}) {
  openSheet(food.name, (close) => renderProduct(food, { confirmLabel, initialGrams, onConfirm, onDelete, close }));
}

function renderProduct(food, { confirmLabel, initialGrams, onConfirm, onDelete, close }) {
  const unit = food.unit === 'ml' ? 'ml' : 'g';
  let grams = initialGrams ?? food.portions?.[0]?.g ?? 100;

  const qty = h('input.qty', { type: 'text', inputMode: 'decimal', pattern: '[0-9]*[.,]?[0-9]*', min: '0', step: '1', value: String(grams), 'aria-label': `Quantité en ${unit}` });
  const summary = h('div.summary');
  const table = h('table.nutri');

  const refresh = () => {
    grams = Math.max(0, Number(qty.value.replace(',', '.')) || 0);
    const values = scale(food.per100, grams);
    summary.replaceChildren(
      h('strong.big', {}, `${fmt(values.kcal)} kcal`),
      h('span.muted', {}, ` · P ${fmt(values.p, 1)} g · G ${fmt(values.c, 1)} g · L ${fmt(values.f, 1)} g`),
    );
    table.replaceChildren(
      h('tr', {}, h('th', {}, ''), h('th', {}, `100 ${unit}`), h('th', {}, `${fmt(grams)} ${unit}`)),
      ...NUTRIENTS.filter((n) => food.per100[n.key] != null).map((n) =>
        h('tr', {}, h('td', {}, n.label), h('td', {}, `${fmt(food.per100[n.key], 1)} ${n.unit}`), h('td', {}, `${fmt(values[n.key], 1)} ${n.unit}`)),
      ),
    );
  };
  qty.addEventListener('input', refresh);

  const portions = h(
    'div.chips',
    {},
    (food.portions ?? []).map((p) =>
      h('button.chip', { type: 'button', onclick: () => { qty.value = String(p.g); refresh(); } }, p.label),
    ),
  );

  const favBtn = h('button.link', { type: 'button' });
  const paintFav = () => { favBtn.textContent = isFavorite(food.id) ? '★ Favori' : '☆ Ajouter aux favoris'; };
  favBtn.addEventListener('click', () => { toggleFavorite(food); paintFav(); });
  paintFav();

  refresh();

  return h(
    'div.stack',
    {},
    food.image ? h('img.product-img', { src: food.image, alt: '', width: 96, height: 96 }) : null,
    h('p.muted', {}, [food.brand, food.quantity, SOURCE_LABEL[food.source]].filter(Boolean).join(' · ')),
    h('div.badges', {}, gradeBadge('nutri', food.nutriscore), gradeBadge('nova', food.nova), gradeBadge('eco', food.ecoscore)),
    h('label.field', {}, `Quantité (${unit})`, qty),
    portions,
    summary,
    h('button.primary', { type: 'button', onclick: () => { if (grams > 0) { onConfirm?.(grams); close(); } } }, confirmLabel),
    onDelete ? h('button.danger', { type: 'button', onclick: () => { onDelete(); close(); } }, 'Supprimer du journal') : null,
    favBtn,
    h('h3', {}, 'Valeurs nutritionnelles'),
    table,
    food.allergens?.length ? h('p', {}, h('strong', {}, 'Allergènes : '), food.allergens.join(', ')) : null,
    food.additives?.length ? h('p', {}, h('strong', {}, 'Additifs : '), food.additives.join(', ')) : null,
    food.ingredients ? h('details', {}, h('summary', {}, 'Ingrédients'), h('p', {}, food.ingredients)) : null,
  );
}

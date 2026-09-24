// Onglet Journal : résumé de la journée, repas, eau, bilan nutritionnel.

import { h, fmt, bar, dateLabel, shiftDate, toast } from '../ui.js';
import { MEALS, NUTRIENTS, dayScore, sumEntries, scale } from '../nutrition.js';
import { addWater, copyMeal, getState, removeEntry, updateEntry } from '../store.js';
import { openAdd } from './add.js';
import { openProduct } from './product.js';

const WATER_STEP_ML = 250;

export function renderJournal(date, setDate) {
  const { entries, targets, water } = getState();
  const dayEntries = entries[date] ?? [];
  const totals = sumEntries(dayEntries);
  const remaining = targets.kcal - totals.kcal;
  const score = dayScore(totals, targets);
  const waterMl = water[date] ?? 0;

  return h(
    'div.stack',
    {},
    h(
      'nav.day-nav',
      { 'aria-label': 'Changer de jour' },
      h('button.icon', { type: 'button', 'aria-label': 'Jour précédent', onclick: () => setDate(shiftDate(date, -1)) }, '‹'),
      h('h1', {}, dateLabel(date)),
      h('button.icon', { type: 'button', 'aria-label': 'Jour suivant', onclick: () => setDate(shiftDate(date, 1)) }, '›'),
    ),
    h(
      'section.card',
      {},
      h('p.big', {}, remaining >= 0 ? `${fmt(remaining)} kcal restantes` : `${fmt(-remaining)} kcal de trop`),
      h('p.muted', {}, `${fmt(totals.kcal)} mangées sur ${fmt(targets.kcal)} kcal`),
      bar(totals.kcal, targets.kcal, { label: 'Calories', unit: 'kcal' }),
      bar(totals.p, targets.p, { label: 'Protéines' }),
      bar(totals.c, targets.c, { label: 'Glucides' }),
      bar(totals.f, targets.f, { label: 'Lipides' }),
    ),
    ...MEALS.map((meal) => renderMeal(date, meal, dayEntries.filter((e) => e.meal === meal.id), targets)),
    h(
      'section.card',
      {},
      h('div.bar-row', {}, h('h2', {}, 'Eau'), h('span.muted', {}, `${fmt(waterMl / 1000, 2)} / ${fmt(targets.waterMl / 1000, 1)} L`)),
      h(
        'div.actions',
        {},
        h('button', { type: 'button', onclick: () => addWater(date, -WATER_STEP_ML), disabled: waterMl <= 0 }, '− 1 verre'),
        h('button.primary', { type: 'button', onclick: () => addWater(date, WATER_STEP_ML) }, '+ 1 verre (25 cl)'),
      ),
    ),
    dayEntries.length ? renderBalance(totals, targets, score) : null,
  );
}

function renderMeal(date, meal, list, targets) {
  const totals = sumEntries(list);
  const yesterday = shiftDate(date, -1);
  const canCopy = !list.length && (getState().entries[yesterday] ?? []).some((e) => e.meal === meal.id);
  return h(
    'section.card',
    {},
    h(
      'div.bar-row',
      {},
      h('h2', {}, meal.label),
      h('span.muted', {}, `${fmt(totals.kcal)} / ${fmt(targets.kcal * meal.share)} kcal`),
    ),
    ...list.map((entry) => {
      const v = scale(entry.food.per100, entry.grams);
      return h(
        'button.row',
        {
          type: 'button',
          onclick: () =>
            openProduct(entry.food, {
              confirmLabel: 'Enregistrer',
              initialGrams: entry.grams,
              onConfirm: (grams) => updateEntry(date, entry.id, { grams }),
              onDelete: () => removeEntry(date, entry.id),
            }),
        },
        h('span.row-main', {}, h('span', {}, entry.food.name), h('small.muted', {}, `${fmt(entry.grams)} ${entry.food.unit === 'ml' ? 'ml' : 'g'}`)),
        h('span.row-side', {}, `${fmt(v.kcal)} kcal`),
      );
    }),
    h(
      'div.actions',
      {},
      h('button.link', { type: 'button', onclick: () => openAdd(date, meal.id) }, '＋ Ajouter'),
      canCopy
        ? h('button.link', { type: 'button', onclick: () => toast(`${copyMeal(yesterday, date, meal.id)} aliment(s) copiés`) }, 'Comme hier')
        : null,
    ),
  );
}

function renderBalance(totals, targets, score) {
  const refs = NUTRIENTS.filter((n) => n.ref);
  return h(
    'section.card',
    {},
    h('div.bar-row', {}, h('h2', {}, 'Bilan du jour'), score != null ? h('strong', {}, `${score}/100`) : null),
    h('p.muted', {}, adviceFor(totals, targets)),
    h(
      'details',
      {},
      h('summary', {}, 'Fibres, sucres, sel, vitamines et minéraux'),
      ...refs.map((n) => bar(totals[n.key] ?? 0, n.ref, { label: n.limit ? `${n.label} (max)` : n.label, unit: n.unit, limit: n.limit })),
      h('p.muted', {}, 'Repères pour un adulte (ANSES / étiquetage UE). Les micronutriments des produits du commerce sont souvent incomplets.'),
    ),
  );
}

function adviceFor(t, targets) {
  const tips = [];
  if (t.p < targets.p * 0.8) tips.push('un peu plus de protéines (œufs, viande, poisson, légumineuses, skyr)');
  if (t.fib < 20) tips.push('plus de fibres (légumes, fruits, pain complet)');
  if (t.sug > 90) tips.push('moins de sucres');
  if (t.salt > 6) tips.push('moins de sel');
  if (t.sat > 20) tips.push('moins de graisses saturées');
  if (t.alc > 20) tips.push("moins d'alcool");
  return tips.length ? `À surveiller : ${tips.join(', ')}.` : 'Journée bien équilibrée, continue comme ça.';
}

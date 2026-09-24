import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeText, defaultPortions, fromCiqualRow, fromOffProduct, matchScore, buildRecipe, snapshot,
} from '../js/food-model.js';

const ciqual = JSON.parse(readFileSync(new URL('../data/ciqual.json', import.meta.url)));

test('normalizeText retire accents et ponctuation', () => {
  assert.equal(normalizeText('Œuf dur, écalé'), 'oeuf dur ecale');
});

test('defaultPortions propose des portions parlantes et toujours 100 g', () => {
  assert.deepEqual(defaultPortions('Banane, pulpe, crue').map((p) => p.g), [120, 100]);
  assert.deepEqual(defaultPortions('Pomme de terre, cuite').map((p) => p.g), [100]);
});

test('la table CIQUAL embarquée est complète et convertible', () => {
  assert.ok(ciqual.foods.length > 3000);
  const food = fromCiqualRow(ciqual.fields, ciqual.foods[0]);
  assert.match(food.id, /^ciqual:\d+$/);
  assert.equal(typeof food.per100.kcal, 'number');
});

test('fromOffProduct convertit unités et grades', () => {
  const food = fromOffProduct({
    code: '3017620422003', product_name: 'Nutella', brands: 'Nutella, Ferrero',
    serving_quantity: 15, serving_size: '15 g', nutriscore_grade: 'e', nova_group: 4, ecoscore_grade: 'unknown',
    nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, calcium_100g: 0.107, 'vitamin-d_100g': 2e-7 },
    additives_tags: ['en:e322'], allergens_tags: ['en:milk'],
  });
  assert.equal(food.brand, 'Nutella');
  assert.equal(food.per100.kcal, 539);
  assert.ok(Math.abs(food.per100.ca - 107) < 1e-9);
  assert.ok(Math.abs(food.per100.vd - 0.2) < 1e-9);
  assert.equal(food.nutriscore, 'e');
  assert.equal(food.ecoscore, null);
  assert.equal(food.portions[0].g, 15);
  assert.deepEqual(food.additives, ['E322']);
});

test('fromOffProduct retombe sur les kJ et refuse un produit vide', () => {
  assert.ok(Math.abs(fromOffProduct({ code: '1', nutriments: { energy_100g: 418.4 } }).per100.kcal - 100) < 1e-9);
  assert.equal(fromOffProduct({ code: '1', nutriments: {} }), null);
  assert.equal(fromOffProduct(null), null);
});

test('matchScore classe les aliments simples avant les plats', () => {
  const names = ciqual.foods.map((r) => r[1]);
  const best = names
    .map((n) => [n, matchScore('pomme', n)])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])[0][0];
  assert.match(normalizeText(best), /^pomme(?! de terre)/);
  assert.equal(matchScore('xyz', 'Pomme'), 0);
});

test('buildRecipe ramène la recette à 100 g et calcule la part', () => {
  const riz = { name: 'Riz', per100: { kcal: 130, p: 3 } };
  const poulet = { name: 'Poulet', per100: { kcal: 165, p: 31 } };
  const r = buildRecipe({ id: 'recipe:1', name: 'Riz poulet', servings: 2, ingredients: [{ food: riz, grams: 200 }, { food: poulet, grams: 200 }] });
  assert.equal(r.per100.kcal, 147.5);
  assert.equal(r.portions[0].g, 200);
  assert.equal(buildRecipe({ id: 'x', name: 'vide', servings: 1, ingredients: [] }), null);
  assert.equal(snapshot(r).recipe, undefined);
});

test('parseConnection accepte « adresse#code » et nettoie les caractères invisibles', async () => {
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  const { parseConnection } = await import('../js/sync.js');
  const url = 'https://script.google.com/macros/s/AKfy-cb_1/exec';
  assert.deepEqual(parseConnection(` ${url}#abc123​ `, ''), { url, token: 'abc123' });
  assert.deepEqual(parseConnection(url, ' abc123\n'), { url, token: 'abc123' });
  assert.deepEqual(parseConnection(`${url}#ignoré`, 'prioritaire'), { url, token: 'prioritaire' });
});

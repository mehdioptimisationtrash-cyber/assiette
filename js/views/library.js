// Création d'aliments personnels et de recettes.

import { h, fmt, openSheet, toast } from '../ui.js';
import { buildRecipe, defaultPortions, snapshot } from '../food-model.js';
import { searchLocal } from '../foods.js';
import { saveCustomFood, saveRecipe, uid } from '../store.js';

const FIELDS = [
  ['kcal', 'Calories (kcal)', true],
  ['p', 'Protéines (g)'],
  ['c', 'Glucides (g)'],
  ['sug', 'dont sucres (g)'],
  ['f', 'Lipides (g)'],
  ['sat', 'dont saturés (g)'],
  ['fib', 'Fibres (g)'],
  ['salt', 'Sel (g)'],
];

const num = (el) => Number(String(el.value).replace(',', '.'));

export function openCustomFood(onCreated) {
  openSheet('Nouvel aliment', (close) => {
    const name = h('input', { type: 'text', required: true, placeholder: 'ex. Galette de mon boulanger' });
    const brand = h('input', { type: 'text', placeholder: 'facultatif' });
    const portion = h('input', { type: 'text', inputMode: 'decimal', pattern: '[0-9]*[.,]?[0-9]*', min: '0', placeholder: 'ex. 45' });
    const inputs = Object.fromEntries(FIELDS.map(([key]) => [key, h('input', { type: 'text', inputMode: 'decimal', pattern: '[0-9]*[.,]?[0-9]*', min: '0', step: 'any' })]));

    const submit = (e) => {
      e.preventDefault();
      if (!name.value.trim() || !(num(inputs.kcal) >= 0) || inputs.kcal.value === '') return toast('Nom et calories obligatoires', 'error');
      const per100 = Object.fromEntries(FIELDS.filter(([k]) => inputs[k].value !== '').map(([k]) => [k, num(inputs[k])]));
      const portionG = num(portion);
      const food = {
        id: `custom:${uid()}`,
        source: 'custom',
        name: name.value.trim(),
        brand: brand.value.trim() || null,
        unit: 'g',
        per100,
        portions: [...(portionG > 0 ? [{ label: `1 portion (${portionG} g)`, g: portionG }] : []), ...defaultPortions(name.value)],
      };
      saveCustomFood(food);
      toast('Aliment enregistré');
      close();
      onCreated?.(food);
    };

    return h(
      'form.stack',
      { onsubmit: submit },
      h('label.field', {}, 'Nom', name),
      h('label.field', {}, 'Marque', brand),
      h('p.muted', {}, 'Valeurs pour 100 g (recopie l’étiquette) :'),
      h('div.grid2', {}, FIELDS.map(([key, label]) => h('label.field', {}, label, inputs[key]))),
      h('label.field', {}, 'Poids d’une portion (g)', portion),
      h('button.primary', { type: 'submit' }, 'Enregistrer'),
    );
  });
}

export function openRecipe(onCreated) {
  openSheet('Nouvelle recette', (close) => {
    const name = h('input', { type: 'text', required: true, placeholder: 'ex. Chili maison' });
    const servings = h('input', { type: 'number', inputMode: 'numeric', min: '1', value: '4' });
    const items = [];
    const list = h('div.list');
    const total = h('p.muted');

    const paint = () => {
      list.replaceChildren(
        ...items.map((it, i) =>
          h(
            'div.item-row',
            {},
            h('span.row-main', {}, it.food.name),
            h('label.inline', {}, h('input.qty-sm', { type: 'number', inputMode: 'numeric', value: String(it.grams), oninput: (e) => { items[i] = { ...it, grams: Number(e.target.value) || 0 }; paintTotal(); } }), ' g'),
            h('button.link', { type: 'button', onclick: () => { items.splice(i, 1); paint(); } }, '✕'),
          ),
        ),
      );
      paintTotal();
    };
    const paintTotal = () => {
      const kcal = items.reduce((a, it) => a + (it.food.per100.kcal * it.grams) / 100, 0);
      const weight = items.reduce((a, it) => a + it.grams, 0);
      const parts = Math.max(1, Number(servings.value) || 1);
      total.textContent = items.length ? `${fmt(weight)} g · ${fmt(kcal)} kcal au total · ${fmt(kcal / parts)} kcal par part` : 'Ajoute des ingrédients.';
    };
    servings.addEventListener('input', paintTotal);

    const search = h('input.search', { type: 'search', placeholder: 'Ajouter un ingrédient', onkeydown: (e) => e.key === 'Enter' && e.preventDefault() });
    const found = h('div.list');
    search.addEventListener('input', async () => {
      if (search.value.trim().length < 2) return found.replaceChildren();
      const foods = await searchLocal(search.value, 8);
      found.replaceChildren(
        ...foods.map((food) =>
          h('button.row', { type: 'button', onclick: () => { items.push({ food: snapshot(food), grams: food.portions?.[0]?.g ?? 100 }); search.value = ''; found.replaceChildren(); paint(); } }, h('span.row-main', {}, food.name), h('span.row-side', {}, '＋')),
        ),
      );
    });

    const submit = (e) => {
      e.preventDefault();
      const recipe = buildRecipe({ id: `recipe:${uid()}`, name: name.value.trim(), servings: Math.max(1, Number(servings.value) || 1), ingredients: items.filter((i) => i.grams > 0) });
      if (!recipe || !recipe.name) return toast('Nom et au moins un ingrédient', 'error');
      saveRecipe(recipe);
      toast('Recette enregistrée');
      close();
      onCreated?.(recipe);
    };

    paint();
    return h(
      'form.stack',
      { onsubmit: submit },
      h('label.field', {}, 'Nom de la recette', name),
      h('label.field', {}, 'Nombre de parts', servings),
      list,
      total,
      search,
      found,
      h('button.primary', { type: 'submit' }, 'Enregistrer la recette'),
    );
  });
}

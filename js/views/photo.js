// Photo d'un repas -> liste d'aliments reconnus, modifiable, puis ajout au journal.

import { h, fmt, openSheet, toast } from '../ui.js';
import { analyzeMealPhoto, prepareImage } from '../vision.js';
import { bestLocalMatch, searchLocal } from '../foods.js';
import { snapshot } from '../food-model.js';
import { addEntries, getState, uid } from '../store.js';

export function openPhoto(date, meal, closeParent) {
  openSheet('Photo du repas', (close) => renderPhoto(date, meal, () => { close(); closeParent(); }));
}

function aiFood(item) {
  return {
    id: `ai:${uid()}`,
    source: 'ai',
    name: item.name,
    unit: 'g',
    per100: { kcal: item.kcal_100g, p: item.protein_100g, c: item.carbs_100g, f: item.fat_100g },
    portions: [],
  };
}

function renderPhoto(date, meal, done) {
  const { settings } = getState();
  const file = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const hint = h('input', { type: 'text', placeholder: 'Précision facultative (ex. « sauce au roquefort »)' });
  const preview = h('div');
  const output = h('div.stack');

  if (!settings.apiKey) {
    output.append(h('p.notice', {}, "La reconnaissance photo utilise l'IA Claude. Ajoute ta clé d'API dans l'onglet Profil pour l'activer."));
  }

  file.addEventListener('change', async () => {
    const picked = file.files?.[0];
    if (!picked) return;
    output.replaceChildren(h('p.muted', {}, 'Analyse de la photo… (10 à 30 secondes)'));
    try {
      const image = await prepareImage(picked);
      preview.replaceChildren(h('img.photo', { src: image.dataUrl, alt: 'Photo du repas' }));
      const result = await analyzeMealPhoto({ base64: image.base64, apiKey: settings.apiKey, model: settings.model, hint: hint.value.trim() });
      const rows = await Promise.all(
        result.items.map(async (item) => ({ item, grams: Math.round(item.grams), food: (await bestLocalMatch(item.ciqual_query)) ?? aiFood(item) })),
      );
      output.replaceChildren(renderResults(result, rows, date, meal, done));
    } catch (err) {
      output.replaceChildren(h('p.error', {}, err.message));
    }
  });

  return h(
    'div.stack',
    {},
    h('button.primary', { type: 'button', onclick: () => file.click() }, 'Prendre ou choisir une photo'),
    hint,
    file,
    preview,
    output,
  );
}

function renderResults(result, rows, date, meal, done) {
  if (!rows.length) return h('p.muted', {}, result.note || 'Aucun aliment reconnu.');
  const state = rows.map((r) => ({ ...r, keep: true }));
  const total = h('p.big');
  const paintTotal = () => {
    const kcal = state.filter((r) => r.keep).reduce((acc, r) => acc + (r.food.per100.kcal * r.grams) / 100, 0);
    total.textContent = `Total : ${fmt(kcal)} kcal`;
  };

  const list = state.map((row) => {
    const grams = h('input.qty-sm', { type: 'number', inputMode: 'numeric', min: '0', value: String(row.grams), 'aria-label': `Grammes de ${row.item.name}` });
    const keep = h('input', { type: 'checkbox', checked: true, 'aria-label': `Garder ${row.item.name}` });
    const match = h('small.muted');
    const paintMatch = () => { match.textContent = `→ ${row.food.name}${row.food.source === 'ai' ? ' (estimation IA)' : ''}`; };
    const change = h('button.link', { type: 'button', onclick: () => chooseMatch(row, () => { paintMatch(); paintTotal(); }) }, 'changer');
    grams.addEventListener('input', () => { row.grams = Number(grams.value) || 0; paintTotal(); });
    keep.addEventListener('change', () => { row.keep = keep.checked; paintTotal(); });
    paintMatch();
    return h(
      'div.photo-row',
      {},
      keep,
      h('div.row-main', {}, h('span', {}, `${row.item.name} `, h('small.muted', {}, `(confiance ${row.item.confidence})`)), h('span', {}, match, ' ', change)),
      h('label.inline', {}, grams, ' g'),
    );
  });

  paintTotal();
  const add = () => {
    const items = state.filter((r) => r.keep && r.grams > 0).map((r) => ({ food: snapshot(r.food), grams: r.grams }));
    if (!items.length) return toast('Rien à ajouter', 'error');
    addEntries(date, meal, items);
    toast(`${items.length} aliment(s) ajouté(s)`);
    done();
  };

  return h(
    'div.stack',
    {},
    h('h3', {}, result.meal_name),
    ...list,
    total,
    result.note ? h('p.muted', {}, result.note) : null,
    h('p.muted', {}, 'Les quantités sont estimées : corrige-les si besoin.'),
    h('button.primary', { type: 'button', onclick: add }, 'Ajouter au repas'),
  );
}

function chooseMatch(row, onChange) {
  openSheet('Choisir l’aliment', (close) => {
    const input = h('input.search', { type: 'search', value: row.item.ciqual_query });
    const list = h('div.list');
    const run = async () => {
      const foods = await searchLocal(input.value, 20);
      list.replaceChildren(
        ...foods.map((food) =>
          h('button.row', { type: 'button', onclick: () => { row.food = food; onChange(); close(); } }, h('span.row-main', {}, food.name), h('span.row-side', {}, `${fmt(food.per100.kcal)} kcal/100 g`)),
        ),
        h('button.row', { type: 'button', onclick: () => { row.food = aiFood(row.item); onChange(); close(); } }, h('span.row-main', {}, 'Garder l’estimation de l’IA'), h('span.row-side', {}, `${fmt(row.item.kcal_100g)} kcal/100 g`)),
      );
    };
    input.addEventListener('input', run);
    run();
    return h('div.stack', {}, input, list);
  });
}

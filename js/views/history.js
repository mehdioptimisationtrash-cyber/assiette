// Onglet Historique : tous les jours passés, regroupés par mois, avec recherche dans les notes.

import { h, fmt, dateLabel } from '../ui.js';
import { knownDates, daySummary } from '../sync-model.js';
import { normalizeText } from '../food-model.js';
import { getState } from '../store.js';
import { MOODS } from './journal.js';

const PAGE_DAYS = 60;

export function renderHistory(openDay) {
  const state = getState();
  const dates = [...new Set([...knownDates(state), ...state.weights.map((w) => w.date)])].sort().reverse();
  const search = h('input.search', { type: 'search', placeholder: 'Chercher dans les notes et les repas', autocomplete: 'off' });
  const list = h('div.stack');
  let limit = PAGE_DAYS;

  const paint = () => {
    const q = normalizeText(search.value);
    const rows = dates
      .map((date) => ({ date, s: daySummary(state, date) }))
      .filter(({ s }) => !q || normalizeText(`${s.text} ${s.meals}`).includes(q));
    const shown = rows.slice(0, limit);
    const months = new Map();
    shown.forEach((r) => {
      const key = r.date.slice(0, 7);
      months.set(key, [...(months.get(key) ?? []), r]);
    });
    list.replaceChildren(
      ...(rows.length ? [] : [h('p.muted', {}, dates.length ? 'Aucun jour ne correspond.' : 'Ton historique apparaîtra ici dès ton premier repas noté.')]),
      ...[...months].map(([month, days]) =>
        h(
          'section.card',
          {},
          h('h2', {}, new Date(`${month}-15T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })),
          days.map(({ date, s }) => dayRow(date, s, state.targets, openDay)),
        ),
      ),
      ...(rows.length > limit ? [h('button', { type: 'button', onclick: () => { limit += PAGE_DAYS; paint(); } }, 'Voir les jours plus anciens')] : []),
    );
  };
  search.addEventListener('input', paint);
  paint();

  return h('div.stack', {}, h('h1', {}, 'Historique'), search, list);
}

function dayRow(date, s, targets, openDay) {
  const details = [
    s.kcal ? `${fmt(s.kcal)} / ${fmt(targets.kcal)} kcal` : null,
    s.p ? `P ${fmt(s.p)} g` : null,
    s.weight ? `${fmt(s.weight, 1)} kg` : null,
    s.sleep != null ? `${fmt(s.sleep, 1)} h de sommeil` : null,
  ].filter(Boolean);
  return h(
    'button.row',
    { type: 'button', onclick: () => openDay(date) },
    h(
      'span.row-main',
      {},
      h('span', {}, `${s.mood ? `${MOODS[s.mood - 1]} ` : ''}${dateLabel(date)}`),
      h('small.muted', {}, details.join(' · ') || 'Pas de repas noté'),
      s.text ? h('small.note-line', {}, `« ${s.text} »`) : null,
    ),
    h('span.row-side', {}, s.score != null ? `${s.score}/100` : ''),
  );
}

// Point d'entrée : onglets, date affichée, rafraîchissement à chaque changement d'état.

import { h, isoDate } from './ui.js';
import { getState, subscribe } from './store.js';
import { loadCiqual } from './foods.js';
import { renderJournal } from './views/journal.js';
import { renderProgress } from './views/progress.js';
import { renderProfile } from './views/profile.js';
import { renderHistory } from './views/history.js';
import { startSync } from './sync.js';
import { openAdd } from './views/add.js';

const TABS = [
  { id: 'journal', label: 'Journal', icon: '▤' },
  { id: 'add', label: 'Ajouter', icon: '＋' },
  { id: 'history', label: 'Historique', icon: '☰' },
  { id: 'progress', label: 'Progrès', icon: '↗' },
  { id: 'profile', label: 'Profil', icon: '◎' },
];

const main = document.querySelector('main');
const nav = document.querySelector('nav.tabs');
let current = { tab: 'journal', date: isoDate() };

function suggestedMeal() {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 18) return 'snack';
  return 'dinner';
}

function setDate(date) {
  current = { ...current, date };
  render();
}

function openDay(date) {
  current = { tab: 'journal', date };
  render();
  window.scrollTo(0, 0);
}

function setTab(tab) {
  if (tab === 'add') return openAdd(current.date, suggestedMeal());
  current = { ...current, tab };
  render();
  window.scrollTo(0, 0);
}

function render() {
  const { profile, targets } = getState();
  const onboarding = !profile || !targets;
  nav.hidden = onboarding;
  let view;
  if (onboarding) view = renderProfile({ onboarding: true });
  else if (current.tab === 'history') view = renderHistory(openDay);
  else if (current.tab === 'progress') view = renderProgress();
  else if (current.tab === 'profile') view = renderProfile();
  else view = renderJournal(current.date, setDate);
  main.replaceChildren(view);
  nav.replaceChildren(
    ...TABS.map((t) =>
      h(
        'button',
        { type: 'button', 'aria-current': t.id === current.tab ? 'page' : null, onclick: () => setTab(t.id) },
        h('span.tab-icon', { 'aria-hidden': 'true' }, t.icon),
        t.label,
      ),
    ),
  );
}

// Le jour change pendant que l'app reste ouverte (ex. après minuit).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current.date < isoDate() && current.tab === 'journal') setDate(isoDate());
});

subscribe((_state, meta) => { if (!meta?.quiet) render(); });
render();
startSync();
loadCiqual().catch((err) => console.error(err));

if ('serviceWorker' in navigator) {
  // Une nouvelle version vient de s'installer : on recharge une fois pour l'afficher.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch((err) => console.error('Service worker', err));
}

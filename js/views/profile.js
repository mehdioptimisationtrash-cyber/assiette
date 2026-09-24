// Onglet Profil : informations personnelles, objectifs, Google Sheets, sauvegarde. Sert aussi d'accueil.

import { h, fmt, isoDate, toast } from '../ui.js';
import { ACTIVITY_LEVELS, GOALS, ageFrom, bmi, computeTargets } from '../nutrition.js';
import { exportData, getState, importData, resetAll, saveProfile, saveTargets } from '../store.js';
import { renderSheets } from './sheets.js';

const select = (options, value) =>
  h('select', {}, options.map((o) => h('option', { value: o.id, selected: o.id === value }, o.hint ? `${o.label} — ${o.hint}` : o.label)));

export function renderProfile({ onboarding = false } = {}) {
  const { profile, targets } = getState();
  return h(
    'div.stack',
    {},
    h('h1', {}, onboarding ? 'Bienvenue dans Assiette' : 'Profil'),
    onboarding ? h('p', {}, 'Quelques informations pour calculer tes objectifs de calories et de protéines.') : null,
    renderProfileForm(profile, onboarding),
    onboarding ? null : renderTargets(targets),
    renderSheets({ onboarding }),
    onboarding ? null : renderBackup(),
    h('p.muted', {}, 'Données : table Ciqual 2020 (ANSES) et Open Food Facts (licence ODbL). Assiette donne des repères, pas un avis médical.'),
  );
}

function renderProfileForm(profile, onboarding) {
  const p = profile ?? { sex: 'male', activity: 'light', goal: 'lose', pace: 0.5 };
  const sex = select([{ id: 'male', label: 'Homme' }, { id: 'female', label: 'Femme' }], p.sex);
  const birth = h('input', { type: 'date', required: true, value: p.birthDate ?? '', max: isoDate() });
  const height = h('input', { type: 'number', inputMode: 'numeric', min: '120', max: '230', required: true, value: p.heightCm ?? '' });
  const weight = h('input', { type: 'text', inputMode: 'decimal', pattern: '[0-9]*[.,]?[0-9]*', step: '0.1', min: '30', max: '400', required: true, value: p.weightKg ?? '' });
  const activity = select(ACTIVITY_LEVELS, p.activity);
  const goal = select(GOALS, p.goal);
  const pace = h('select', {}, [0.25, 0.5, 0.75, 1].map((v) => h('option', { value: v, selected: v === p.pace }, `${fmt(v, 2)} kg / semaine`)));

  const submit = (e) => {
    e.preventDefault();
    const next = {
      sex: sex.value,
      birthDate: birth.value,
      heightCm: Number(height.value),
      weightKg: Number(weight.value.replace(',', '.')),
      activity: activity.value,
      goal: goal.value,
      pace: Number(pace.value),
    };
    const age = ageFrom(next.birthDate);
    if (!(age >= 14 && age <= 110)) return toast('Date de naissance invalide', 'error');
    if (!(next.heightCm >= 120 && next.weightKg >= 30)) return toast('Taille ou poids invalide', 'error');
    saveProfile(next, computeTargets({ ...next, age }));
    toast('Objectifs calculés');
  };

  const b = profile ? bmi(profile.weightKg, profile.heightCm) : null;
  return h(
    'form.card.stack',
    { onsubmit: submit },
    h('div.grid2', {}, h('label.field', {}, 'Sexe', sex), h('label.field', {}, 'Date de naissance', birth)),
    h('div.grid2', {}, h('label.field', {}, 'Taille (cm)', height), h('label.field', {}, 'Poids (kg)', weight)),
    h('label.field', {}, 'Activité', activity),
    h('div.grid2', {}, h('label.field', {}, 'Objectif', goal), h('label.field', {}, 'Rythme', pace)),
    b ? h('p.muted', {}, `IMC : ${fmt(b, 1)}`) : null,
    h('button.primary', { type: 'submit' }, onboarding ? 'Commencer' : 'Recalculer mes objectifs'),
  );
}

function renderTargets(targets) {
  const fields = [
    ['kcal', 'Calories (kcal)'],
    ['p', 'Protéines (g)'],
    ['c', 'Glucides (g)'],
    ['f', 'Lipides (g)'],
    ['waterMl', 'Eau (ml)'],
  ];
  const inputs = Object.fromEntries(fields.map(([k]) => [k, h('input', { type: 'number', inputMode: 'numeric', min: '0', value: targets[k] })]));
  const submit = (e) => {
    e.preventDefault();
    const next = { ...targets, ...Object.fromEntries(fields.map(([k]) => [k, Math.max(0, Number(inputs[k].value) || 0)])) };
    if (next.kcal < 800) return toast('Objectif calorique trop bas', 'error');
    saveTargets(next);
    toast('Objectifs enregistrés');
  };
  return h(
    'form.card.stack',
    { onsubmit: submit },
    h('h2', {}, 'Mes objectifs du jour'),
    h('p.muted', {}, `Dépense estimée : ${fmt(targets.maintenance)} kcal/jour. Tu peux ajuster à la main.`),
    h('div.grid2', {}, fields.map(([k, label]) => h('label.field', {}, label, inputs[k]))),
    h('button', { type: 'submit' }, 'Enregistrer'),
  );
}

function renderBackup() {
  const download = () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `assiette-${isoDate()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  file.addEventListener('change', async () => {
    const picked = file.files?.[0];
    if (!picked) return;
    try {
      importData(await picked.text());
      toast('Sauvegarde restaurée');
    } catch (err) {
      toast(err.message || 'Fichier illisible', 'error');
    }
  });
  const reset = () => {
    if (confirm('Effacer toutes les données (journal, poids, recettes) de ce téléphone ?')) resetAll();
  };
  return h(
    'section.card.stack',
    {},
    h('h2', {}, 'Fichier de sauvegarde'),
    h('p.muted', {}, 'Les données sont enregistrées dans Safari sur ce téléphone. En plus de Google Sheets, tu peux les exporter dans un fichier (à garder dans iCloud Drive).'),
    h('div.actions', {}, h('button', { type: 'button', onclick: download }, 'Exporter'), h('button', { type: 'button', onclick: () => file.click() }, 'Importer'), file),
    h('button.danger', { type: 'button', onclick: reset }, 'Tout effacer'),
  );
}

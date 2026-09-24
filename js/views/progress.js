// Onglet Progrès : poids (courbe + tendance) et calories des 7 derniers jours.

import { h, fmt, isoDate, shiftDate, toast } from '../ui.js';
import { sumEntries, weeklyTrend, macroSplit } from '../nutrition.js';
import { getState, logWeight, removeWeight } from '../store.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DAYS = 7;
const TREND_WINDOW_DAYS = 28;

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  children.forEach((c) => el.append(c));
  return el;
}

export function renderProgress() {
  const { weights, targets, profile } = getState();
  return h('div.stack', {}, h('h1', {}, 'Progrès'), renderWeight(weights, profile), renderWeek(targets));
}

function renderWeight(weights, profile) {
  const input = h('input', { type: 'text', inputMode: 'decimal', pattern: '[0-9]*[.,]?[0-9]*', step: '0.1', min: '20', max: '400', placeholder: 'kg', value: profile?.weightKg ?? '' });
  const date = h('input', { type: 'date', value: isoDate(), max: isoDate() });
  const submit = (e) => {
    e.preventDefault();
    const kg = Number(input.value.replace(',', '.'));
    if (!(kg >= 20 && kg <= 400)) return toast('Poids invalide', 'error');
    logWeight(date.value, kg);
    toast('Pesée enregistrée');
  };

  const recent = weights.filter((w) => w.date >= shiftDate(isoDate(), -TREND_WINDOW_DAYS));
  const trend = weeklyTrend(recent);
  const first = weights[0];
  const last = weights.at(-1);

  return h(
    'section.card',
    {},
    h('h2', {}, 'Poids'),
    last
      ? h('p', {}, h('strong.big', {}, `${fmt(last.kg, 1)} kg`), first && first !== last ? h('span.muted', {}, `  (${last.kg - first.kg > 0 ? '+' : ''}${fmt(last.kg - first.kg, 1)} kg depuis le ${new Date(first.date).toLocaleDateString('fr-FR')})`) : null)
      : h('p.muted', {}, 'Aucune pesée pour l’instant.'),
    trend != null ? h('p.muted', {}, `Tendance sur 4 semaines : ${trend > 0 ? '+' : ''}${fmt(trend, 2)} kg / semaine`) : null,
    weights.length >= 2 ? weightChart(weights.slice(-60)) : null,
    h('form.inline', { onsubmit: submit }, date, input, h('button.primary', { type: 'submit' }, 'Enregistrer')),
    weights.length
      ? h(
          'details',
          {},
          h('summary', {}, 'Historique'),
          ...[...weights].reverse().map((w) =>
            h('div.bar-row', {}, h('span', {}, new Date(w.date).toLocaleDateString('fr-FR')), h('span', {}, `${fmt(w.kg, 1)} kg `, h('button.link', { type: 'button', 'aria-label': `Supprimer la pesée du ${w.date}`, onclick: () => removeWeight(w.date) }, '✕'))),
          ),
        )
      : null,
  );
}

function weightChart(points) {
  const W = 320;
  const H = 140;
  const PAD = 24;
  const kgs = points.map((p) => p.kg);
  const min = Math.floor(Math.min(...kgs) - 1);
  const max = Math.ceil(Math.max(...kgs) + 1);
  const t0 = new Date(points[0].date).getTime();
  const span = Math.max(1, new Date(points.at(-1).date).getTime() - t0);
  const x = (d) => PAD + ((new Date(d).getTime() - t0) / span) * (W - PAD * 2);
  const y = (kg) => H - PAD - ((kg - min) / (max - min)) * (H - PAD * 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  return svg(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `Courbe de poids de ${min} à ${max} kg` },
    svg('text', { x: 2, y: y(max) + 4, class: 'axis' }, document.createTextNode(`${max}`)),
    svg('text', { x: 2, y: y(min) + 4, class: 'axis' }, document.createTextNode(`${min}`)),
    svg('path', { d: path, class: 'line' }),
    ...points.map((p) => svg('circle', { cx: x(p.date), cy: y(p.kg), r: 2.5, class: 'dot' })),
  );
}

function renderWeek(targets) {
  const { entries } = getState();
  const days = Array.from({ length: DAYS }, (_, i) => shiftDate(isoDate(), i - DAYS + 1));
  const totals = days.map((d) => ({ date: d, ...sumEntries(entries[d] ?? []) }));
  const logged = totals.filter((t) => t.kcal > 0);
  const avg = (key) => (logged.length ? logged.reduce((a, t) => a + t[key], 0) / logged.length : 0);
  const peak = Math.max(targets.kcal * 1.3, ...totals.map((t) => t.kcal));
  const split = macroSplit({ p: avg('p'), c: avg('c'), f: avg('f') });

  return h(
    'section.card',
    {},
    h('h2', {}, '7 derniers jours'),
    h(
      'div.week',
      { role: 'img', 'aria-label': 'Calories par jour sur 7 jours' },
      totals.map((t) =>
        h(
          'div.week-col',
          {},
          h('div.week-bar-wrap', {}, h(`div.week-bar${t.kcal > targets.kcal * 1.05 ? '.over' : ''}`, { style: { height: `${(t.kcal / peak) * 100}%` }, title: `${fmt(t.kcal)} kcal` }), h('div.week-target', { style: { bottom: `${(targets.kcal / peak) * 100}%` } })),
          h('small', {}, new Date(`${t.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'narrow' })),
        ),
      ),
    ),
    logged.length
      ? h(
          'p',
          {},
          `Moyenne : ${fmt(avg('kcal'))} kcal/jour (objectif ${fmt(targets.kcal)}) · `,
          `protéines ${fmt(avg('p'))} g · répartition P ${fmt(split.p)} % / G ${fmt(split.c)} % / L ${fmt(split.f)} %`,
          h('br'),
          h('span.muted', {}, `${logged.length} jour(s) renseigné(s) sur 7.`),
        )
      : h('p.muted', {}, 'Remplis ton journal pour voir tes moyennes.'),
  );
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageFrom, bmr, computeTargets, scale, sumEntries, macroSplit, dayScore, weeklyTrend, movingAverage,
} from '../js/nutrition.js';

const mehdi = { sex: 'male', weightKg: 112, heightCm: 187, age: 36, activity: 'light', goal: 'lose', pace: 0.5 };

test('ageFrom compte les années révolues', () => {
  assert.equal(ageFrom('1990-06-15', new Date('2026-06-14')), 35);
  assert.equal(ageFrom('1990-06-15', new Date('2026-06-15')), 36);
  assert.equal(ageFrom('pas une date'), null);
});

test('bmr applique Mifflin-St Jeor selon le sexe', () => {
  assert.equal(bmr({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 }), 1780);
  assert.equal(bmr({ sex: 'female', weightKg: 60, heightCm: 165, age: 30 }), 1320.25);
});

test('computeTargets crée un déficit pour perdre du poids', () => {
  const t = computeTargets(mehdi);
  assert.ok(t.kcal < t.maintenance, 'objectif sous la maintenance');
  assert.ok(Math.abs(t.maintenance - t.kcal - 550) < 10, 'déficit ≈ 550 kcal pour 0,5 kg/sem');
  assert.ok(t.p >= 150 && t.p <= 165, `protéines plafonnées à IMC 25 (${t.p})`);
  assert.ok(t.c > 0 && t.f > 0);
});

test('computeTargets ne descend jamais sous le plancher de sécurité', () => {
  const t = computeTargets({ sex: 'female', weightKg: 50, heightCm: 155, age: 60, activity: 'sedentary', goal: 'lose', pace: 1 });
  assert.equal(t.kcal, 1200);
});

test('computeTargets borne la prise de masse à +500 kcal', () => {
  const t = computeTargets({ ...mehdi, goal: 'gain', pace: 1 });
  assert.ok(t.kcal - t.maintenance <= 505);
});

test('scale et sumEntries additionnent les portions', () => {
  const pain = { per100: { kcal: 250, p: 8, c: 50, f: 1 } };
  assert.deepEqual(scale(pain.per100, 50), { kcal: 125, p: 4, c: 25, f: 0.5 });
  const total = sumEntries([{ food: pain, grams: 100 }, { food: pain, grams: 60 }]);
  assert.equal(total.kcal, 400);
  assert.equal(total.fib, 0);
});

test('macroSplit renvoie des pourcentages de calories', () => {
  const s = macroSplit({ p: 25, c: 50, f: 11.11 });
  assert.ok(Math.abs(s.p + s.c + s.f - 100) < 1e-9);
  assert.deepEqual(macroSplit({}), { p: 0, c: 0, f: 0 });
});

test('dayScore récompense une journée équilibrée', () => {
  const targets = { kcal: 2000, p: 120, fib: 30 };
  const good = dayScore({ kcal: 2000, p: 130, fib: 32, sug: 40, salt: 5, sat: 15 }, targets);
  const bad = dayScore({ kcal: 3200, p: 50, fib: 8, sug: 180, salt: 12, sat: 45 }, targets);
  assert.equal(good, 100);
  assert.ok(bad < 40, `score faible (${bad})`);
  assert.equal(dayScore({ kcal: 0 }, targets), null);
});

test('weeklyTrend estime la pente en kg/semaine', () => {
  const pts = [0, 7, 14].map((d, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10), kg: 100 - i * 0.5 }));
  assert.ok(Math.abs(weeklyTrend(pts) + 0.5) < 1e-9);
  assert.equal(weeklyTrend(pts.slice(0, 1)), null);
});

test('movingAverage lisse sur la fenêtre', () => {
  assert.deepEqual(movingAverage([1, 2, 3, 4], 2), [1, 1.5, 2.5, 3.5]);
});

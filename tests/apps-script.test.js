// Exécute apps-script/Code.gs dans une fausse feuille Google pour vérifier l'aller-retour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildPush, fromRemote } from '../js/sync-model.js';

function fakeSheet() {
  let cells = [];
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cells[r - 1 + i]?.[c - 1 + j] ?? '')),
    setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { cells[r - 1 + i] ??= []; cells[r - 1 + i][c - 1 + j] = x; })); return this; },
    clearContent() { for (let i = 0; i < nr; i += 1) for (let j = 0; j < nc; j += 1) if (cells[r - 1 + i]) cells[r - 1 + i][c - 1 + j] = ''; return this; },
    setFontWeight() { return this; },
    setNumberFormat() { return this; },
    sort() { const body = cells.slice(r - 1, r - 1 + nr).sort((a, b) => String(a[0]).localeCompare(String(b[0]))); cells.splice(r - 1, nr, ...body); return this; },
  });
  return {
    getRange: (a, ...rest) => (typeof a === 'string' ? range(1, 1) : range(a, ...rest)),
    getLastRow: () => { let last = 0; cells.forEach((row, i) => { if (row?.some((x) => x !== '' && x != null)) last = i + 1; }); return last; },
    setFrozenRows() {},
    cells: () => cells,
  };
}

function loadScript() {
  const sheets = {};
  const ss = { getSheetByName: (n) => sheets[n] ?? null, insertSheet: (n) => (sheets[n] = fakeSheet()), getSpreadsheetTimeZone: () => 'Europe/Paris' };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }), MimeType: { JSON: 'json' } },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
  };
  vm.createContext(ctx);
  const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8').replace(/const TOKEN = '[^']*'/, "const TOKEN = 'test'");
  vm.runInContext(code, ctx);
  return { ctx, sheets };
}

const food = { id: 'ciqual:1', source: 'ciqual', name: 'Pomme', unit: 'g', per100: { kcal: 50, p: 0.3, c: 12, f: 0.2 } };
const state = {
  profile: { sex: 'male' }, targets: { kcal: 2000, p: 150, fib: 30, c: 200, f: 70 },
  entries: { '2026-09-23': [{ id: 'a', meal: 'lunch', grams: 150, food }], '2026-09-24': [{ id: 'b', meal: 'snack', grams: 100, food }] },
  water: { '2026-09-24': 750 }, notes: { '2026-09-24': { mood: 4, text: 'Bonne journée' } },
  weights: [{ date: '2026-09-24', kg: 111.4 }], favorites: [food], customFoods: [], recipes: [], recents: [food],
};
const post = (ctx, payload) => ctx.doPost({ postData: { contents: JSON.stringify({ token: 'test', ...payload }) } });

test('le script refuse un mauvais code secret', () => {
  const { ctx } = loadScript();
  assert.equal(ctx.doGet({ parameter: { token: 'faux' } }).error, 'unauthorized');
  assert.equal(ctx.doPost({ postData: { contents: '{"token":"faux"}' } }).error, 'unauthorized');
});

test('aller-retour complet téléphone → feuille → téléphone', () => {
  const { ctx, sheets } = loadScript();
  const push = buildPush(state, {});
  assert.equal(post(ctx, push.payload).ok, true);
  const jours = sheets.jours.cells();
  assert.equal(jours.length, 3); // en-tête + 2 jours
  assert.deepEqual(jours[2].slice(0, 2), ['2026-09-24', 50]);
  assert.equal(jours[2][7], 111.4);
  assert.equal(jours[2][12], 'Bonne journée');
  assert.equal(sheets.repas.getLastRow(), 3);

  const remote = ctx.doGet({ parameter: { token: 'test' } });
  const restored = fromRemote(remote);
  assert.deepEqual(restored.entries, state.entries);
  assert.deepEqual(restored.notes, state.notes);
  assert.deepEqual(restored.water, state.water);
  assert.deepEqual(restored.weights, state.weights);
  assert.deepEqual(restored.favorites, state.favorites);
});

test('seuls les jours modifiés repartent, et une suppression vide bien la feuille', () => {
  const { ctx, sheets } = loadScript();
  const first = buildPush(state, {});
  post(ctx, first.payload);
  assert.equal(buildPush(state, first.hashes), null, 'rien à renvoyer');

  const edited = { ...state, entries: { ...state.entries, '2026-09-23': [] } };
  const second = buildPush(edited, first.hashes);
  assert.deepEqual(Object.keys(second.payload), ['days']);
  assert.deepEqual(Object.keys(second.payload.days), ['2026-09-23']);
  post(ctx, second.payload);
  assert.equal(sheets.repas.getLastRow(), 2, 'la ligne du 23 a disparu');
  assert.equal(sheets.jours.cells()[1][1], 0);
});

test('une grosse bibliothèque est découpée puis recollée', () => {
  const { ctx } = loadScript();
  const big = { ...state, recents: Array.from({ length: 400 }, (_, i) => ({ ...food, id: `x${i}`, name: 'Aliment '.repeat(20) })) };
  post(ctx, buildPush(big, {}).payload);
  const restored = fromRemote(ctx.doGet({ parameter: { token: 'test' } }));
  assert.equal(restored.recents.length, 400);
});

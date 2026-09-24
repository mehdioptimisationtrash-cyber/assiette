/**
 * Assiette — script Google Apps Script (VERSION 1).
 * À coller dans une feuille Google (Extensions → Apps Script), puis :
 *   Déployer → Nouveau déploiement → Type : Application web
 *   Exécuter en tant que : Moi · Qui a accès : Tout le monde → Déployer → copier l'URL (…/exec).
 * Pour une mise à jour : Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version (l'URL ne change pas).
 *
 * Onglets créés automatiquement (lisibles, ne pas modifier la dernière colonne « données brutes ») :
 *  - jours         : une ligne par jour (calories, macros, eau, poids, note /100, humeur, faim, sommeil, notes, repas)
 *  - repas         : une ligne par aliment mangé
 *  - poids         : une ligne par pesée
 *  - bibliotheque  : profil, objectifs, favoris, aliments perso, recettes (sauvegarde brute)
 *
 * TOKEN = le « code secret » à saisir dans l'app (Profil → Google Sheets).
 */
const TOKEN = 'COLLE_ICI_TON_CODE_SECRET';
const VERSION = 1;
const CELL_MAX = 45000; // une cellule Google Sheets contient au plus 50 000 caractères

const DAYS_HEADER = ['date', 'kcal', 'protéines (g)', 'glucides (g)', 'lipides (g)', 'fibres (g)', 'eau (L)', 'poids (kg)',
  'note du jour /100', 'humeur /5', 'faim /5', 'sommeil (h)', 'notes', 'repas', 'données brutes'];
const MEALS_HEADER = ['date', 'repas', 'aliment', 'marque', 'quantité (g)', 'kcal', 'protéines (g)', 'glucides (g)', 'lipides (g)'];
const WEIGHTS_HEADER = ['date', 'poids (kg)'];

function doGet(e) {
  if (!e || !e.parameter || e.parameter.token !== TOKEN) return out({ ok: false, error: 'unauthorized' });
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return out({ ok: true, v: VERSION, days: readDays(ss), weights: readWeights(ss), library: readLibrary(ss) });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'bad json' }); }
  if (!body || body.token !== TOKEN) return out({ ok: false, error: 'unauthorized' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.days && typeof body.days === 'object') upsertDays(ss, body.days);
    if (Array.isArray(body.weights)) writeWeights(ss, body.weights);
    if (body.library && typeof body.library === 'object') writeLibrary(ss, body.library);
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
  return out({ ok: true, v: VERSION });
}

/* ---------- jours + repas ---------- */

function upsertDays(ss, days) {
  const dates = Object.keys(days).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!dates.length) return;
  const js = sheet(ss, 'jours', DAYS_HEADER);
  const n = js.getLastRow() - 1;
  const existing = n > 0 ? js.getRange(2, 1, n, 1).getValues().map((r) => dateKey(r[0])) : [];
  const toAppend = [];
  dates.forEach((date) => {
    const d = days[date] || {};
    const s = d.summary || {};
    const raw = JSON.stringify(d.data || { date: date });
    const row = [date, s.kcal, s.p, s.c, s.f, s.fib, s.waterL, blank(s.weight), blank(s.score), blank(s.mood),
      blank(s.hunger), blank(s.sleep), s.text || '', s.meals || '', raw.length > CELL_MAX ? '' : raw];
    const i = existing.indexOf(date);
    if (i >= 0) js.getRange(i + 2, 1, 1, row.length).setValues([row]);
    else toAppend.push(row);
  });
  if (toAppend.length) js.getRange(js.getLastRow() + 1, 1, toAppend.length, DAYS_HEADER.length).setValues(toAppend);
  const total = js.getLastRow() - 1;
  if (total > 1) js.getRange(2, 1, total, DAYS_HEADER.length).sort(1);

  // repas : on retire les lignes des jours envoyés, puis on remet les lignes à jour
  const ms = sheet(ss, 'repas', MEALS_HEADER);
  const m = ms.getLastRow() - 1;
  const kept = m > 0 ? ms.getRange(2, 1, m, MEALS_HEADER.length).getValues().filter((r) => dates.indexOf(dateKey(r[0])) < 0) : [];
  const fresh = [];
  dates.forEach((date) => (days[date].rows || []).forEach((r) => fresh.push([date, r.meal, r.name, r.brand, r.grams, r.kcal, r.p, r.c, r.f])));
  const all = kept.map((r) => [dateKey(r[0])].concat(r.slice(1))).concat(fresh).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (m > 0) ms.getRange(2, 1, m, MEALS_HEADER.length).clearContent();
  if (all.length) ms.getRange(2, 1, all.length, MEALS_HEADER.length).setValues(all);
}

function readDays(ss) {
  const js = ss.getSheetByName('jours');
  const n = js ? js.getLastRow() - 1 : 0;
  const days = {};
  if (n <= 0) return days;
  js.getRange(2, 1, n, DAYS_HEADER.length).getValues().forEach((r) => {
    const raw = r[DAYS_HEADER.length - 1];
    if (!raw) return;
    try { const d = JSON.parse(raw); days[d.date || dateKey(r[0])] = d; } catch (err) { /* ligne abîmée : ignorée */ }
  });
  return days;
}

/* ---------- poids ---------- */

function writeWeights(ss, weights) {
  const ws = sheet(ss, 'poids', WEIGHTS_HEADER);
  const n = ws.getLastRow() - 1;
  if (n > 0) ws.getRange(2, 1, n, 2).clearContent();
  const rows = weights.filter((w) => w && /^\d{4}-\d{2}-\d{2}$/.test(w.date) && Number(w.kg) > 0).map((w) => [w.date, Number(w.kg)]);
  if (rows.length) ws.getRange(2, 1, rows.length, 2).setValues(rows);
}

function readWeights(ss) {
  const ws = ss.getSheetByName('poids');
  const n = ws ? ws.getLastRow() - 1 : 0;
  if (n <= 0) return [];
  return ws.getRange(2, 1, n, 2).getValues().filter((r) => r[0] && Number(r[1]) > 0).map((r) => ({ date: dateKey(r[0]), kg: Number(r[1]) }));
}

/* ---------- bibliothèque (sauvegarde brute découpée en morceaux) ---------- */

function writeLibrary(ss, library) {
  const bs = sheet(ss, 'bibliotheque', ['sauvegarde — ne pas modifier']);
  const text = JSON.stringify(library);
  const chunks = [];
  for (let i = 0; i < text.length; i += CELL_MAX) chunks.push([text.slice(i, i + CELL_MAX)]);
  const n = bs.getLastRow() - 1;
  if (n > 0) bs.getRange(2, 1, n, 1).clearContent();
  bs.getRange(2, 1, chunks.length, 1).setValues(chunks);
}

function readLibrary(ss) {
  const bs = ss.getSheetByName('bibliotheque');
  const n = bs ? bs.getLastRow() - 1 : 0;
  if (n <= 0) return null;
  const text = bs.getRange(2, 1, n, 1).getValues().map((r) => r[0]).join('');
  return text ? JSON.parse(text) : null;
}

/* ---------- outils ---------- */

function sheet(ss, name, header) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@'); // dates gardées en texte AAAA-MM-JJ
  }
  return sh;
}

// Google Sheets peut convertir « 2026-09-24 » en vraie date : on revient toujours au texte AAAA-MM-JJ.
function dateKey(v) {
  if (v && typeof v.getTime === 'function') return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return String(v);
}

function blank(v) {
  return v === null || v === undefined ? '' : v;
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

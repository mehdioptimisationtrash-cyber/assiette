// Sauvegarde automatique dans Google Sheets via une application web Apps Script
// (voir apps-script/Code.gs). L'adresse et le code secret restent sur le téléphone.

import { buildPush, fromRemote, hashesFor } from './sync-model.js';
import { getState, replaceData, subscribe } from './store.js';

const CONFIG_KEY = 'assiette:sync';
const SYNCED_KEY = 'assiette:synced';
const DELAY_MS = 2500;
const RETRY_MS = 30000;
const TIMEOUT_MS = 25000;
const SCRIPT_ERRORS = {
  unauthorized: 'Code secret refusé : il doit être identique à celui écrit dans le script Google (ligne const TOKEN)',
  script_not_configured: 'Le script Google n’a pas de code secret : remplace COLLE_ICI_TON_CODE_SECRET dans Apps Script, puis redéploie une nouvelle version',
};
const URL_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;

let timer = null;
let inflight = null;
let status = { state: 'off', label: 'Non configurée' };
const statusListeners = new Set();

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Stockage local impossible', err);
  }
};

export const getConfig = () => read(CONFIG_KEY, { url: '', token: '' });
export const isConnected = () => URL_PATTERN.test(getConfig().url) && Boolean(getConfig().token);
// `ready` : l'utilisateur a choisi entre récupérer la feuille ou y envoyer le téléphone.
export const isEnabled = () => isConnected() && getConfig().ready === true;
export const isValidUrl = (url) => URL_PATTERN.test(url);

/** Retire espaces, retours à la ligne et caractères invisibles (copier-coller depuis Notes). */
export const cleanText = (text) => String(text ?? '').replace(/[\s\u200b-\u200f\u2060\ufeff]/g, '');

/**
 * Accepte l'adresse seule, ou « adresse#code » (une seule ligne à coller).
 * Renvoie { url, token } nettoyés.
 */
export function parseConnection(urlInput, tokenInput) {
  const raw = cleanText(urlInput);
  const [url, fromUrl = ''] = raw.split('#');
  return { url, token: cleanText(tokenInput) || fromUrl };
}
export const getStatus = () => status;

export function onStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

function setStatus(state, label) {
  status = { state, label };
  statusListeners.forEach((fn) => fn(status));
}

const hhmm = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

async function request(method, body) {
  const { url, token } = getConfig();
  const opts = { method, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) };
  let target = url;
  if (method === 'GET') {
    target += `?token=${encodeURIComponent(token)}&t=${Date.now()}`;
  } else {
    // text/plain évite la requête de pré-vérification CORS qu'Apps Script ne gère pas.
    opts.body = JSON.stringify({ token, ...body });
    opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
  }
  let res;
  try {
    res = await fetch(target, opts);
  } catch (err) {
    if (!navigator.onLine) throw new Error('Pas de connexion internet');
    if (err.name === 'TimeoutError') throw new Error('Google ne répond pas, réessaie');
    // Google renvoie vers sa page de connexion quand le script n'est pas ouvert à « Tout le monde ».
    throw new Error('Google refuse l’accès : dans Apps Script, le déploiement doit être réglé sur « Qui a accès : Tout le monde »');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data?.ok !== true) throw new Error(SCRIPT_ERRORS[data?.error] ?? data?.error ?? 'Réponse invalide');
  return data;
}

/** Envoie les changements en attente. */
export function flush() {
  clearTimeout(timer);
  timer = null;
  if (!isEnabled()) return Promise.resolve();
  if (inflight) return inflight;
  const push = buildPush(getState(), read(SYNCED_KEY, {}));
  if (!push) {
    if (status.state !== 'ok') setStatus('ok', 'À jour');
    return Promise.resolve();
  }
  if (!navigator.onLine) {
    setStatus('pending', 'Hors ligne — envoi au retour du réseau');
    return Promise.resolve();
  }
  setStatus('pending', 'Envoi vers Google Sheets…');
  inflight = request('POST', push.payload)
    .then(() => {
      write(SYNCED_KEY, push.hashes);
      setStatus('ok', `Enregistré sur Google Sheets à ${hhmm()}`);
    })
    .catch((err) => {
      console.error('Sauvegarde Google Sheets échouée', err);
      setStatus('error', `Échec (${err.message}) — nouvel essai dans 30 s`);
      timer = setTimeout(flush, RETRY_MS);
    })
    .finally(() => {
      inflight = null;
      // Des changements faits pendant l'envoi partiront au tour suivant.
      if (!timer && buildPush(getState(), read(SYNCED_KEY, {}))) timer = setTimeout(flush, DELAY_MS);
    });
  return inflight;
}

function schedule() {
  if (!isEnabled()) return;
  clearTimeout(timer);
  setStatus('pending', 'Modifications à envoyer…');
  timer = setTimeout(flush, DELAY_MS);
}

/**
 * Enregistre l'adresse et vérifie la connexion. Renvoie le nombre de jours déjà dans la feuille :
 * s'il y en a, l'app attend le choix de l'utilisateur (`chooseStart`) avant tout envoi.
 */
export async function saveConfig(url, token) {
  write(CONFIG_KEY, { url: cleanText(url), token: cleanText(token), ready: false });
  write(SYNCED_KEY, null);
  let data;
  try {
    data = await request('GET');
  } catch (err) {
    write(CONFIG_KEY, null);
    throw err;
  }
  const remoteDays = Object.keys(data.days ?? {}).length;
  if (!remoteDays) await chooseStart('push');
  return remoteDays;
}

/** 'restore' : la feuille remplace le téléphone ; 'push' : le téléphone est envoyé dans la feuille. */
export async function chooseStart(choice) {
  if (choice === 'restore') await restoreFromSheet();
  write(CONFIG_KEY, { ...getConfig(), ready: true });
  return flush();
}

export function disconnect() {
  write(CONFIG_KEY, null);
  write(SYNCED_KEY, null);
  clearTimeout(timer);
  setStatus('off', 'Non configurée');
}

/** Remplace les données du téléphone par celles de la feuille. */
export async function restoreFromSheet() {
  setStatus('pending', 'Lecture de Google Sheets…');
  const data = await request('GET');
  const restored = fromRemote(data);
  replaceData(restored);
  write(SYNCED_KEY, hashesFor(getState()));
  setStatus('ok', `Données récupérées à ${hhmm()}`);
  return Object.keys(restored.entries).length;
}

export function startSync() {
  subscribe(schedule);
  window.addEventListener('online', () => flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  if (isEnabled()) flush();
}

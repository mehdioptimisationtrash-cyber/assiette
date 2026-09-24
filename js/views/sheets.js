// Réglage de la sauvegarde Google Sheets (dans Profil et sur l'écran d'accueil).

import { h, toast } from '../ui.js';
import { chooseStart, disconnect, flush, getConfig, getStatus, isConnected, isEnabled, isValidUrl, parseConnection, restoreFromSheet, saveConfig } from '../sync.js';

const HELP_URL = 'https://github.com/mehdioptimisationtrash-cyber/assiette#sauvegarde-google-sheets';

export function renderSheets({ onboarding = false } = {}) {
  const card = h('section.card.stack');
  const paint = () => card.replaceChildren(...(isEnabled() ? connected() : isConnected() ? choose() : form()));

  // Premier branchement alors que la feuille contient déjà des jours : on demande quoi faire.
  const choose = () => [
    h('h2', {}, 'Google Sheets'),
    h('p', {}, 'Ta feuille contient déjà des données. Que veux-tu faire ?'),
    h('button.primary', { type: 'button', onclick: () => run(() => chooseStart('restore'), 'Données récupérées') }, 'Récupérer les données de la feuille (remplace celles du téléphone)'),
    h('button', { type: 'button', onclick: () => run(() => chooseStart('push'), 'Téléphone envoyé dans la feuille') }, 'Envoyer les données du téléphone dans la feuille'),
    h('button.link', { type: 'button', onclick: () => { disconnect(); paint(); } }, 'Annuler'),
  ];

  const connected = () => [
    h('h2', {}, 'Google Sheets'),
    h('p', {}, `✓ ${getStatus().label}`),
    h('p.muted', {}, 'Chaque jour modifié est envoyé automatiquement dans ta feuille (onglets jours, repas, poids).'),
    h(
      'div.actions',
      {},
      h('button', { type: 'button', onclick: () => run(async () => { await flush(); return getStatus().label; }) }, 'Envoyer maintenant'),
      h('button', {
        type: 'button',
        onclick: () => confirm('Remplacer les données de ce téléphone par celles de la feuille ?') && run(restoreFromSheet, 'Données récupérées'),
      }, 'Récupérer depuis la feuille'),
    ),
    h('button.link', { type: 'button', onclick: () => { if (confirm('Arrêter la sauvegarde vers Google Sheets ? (la feuille est conservée)')) { disconnect(); paint(); } } }, 'Débrancher la feuille'),
  ];

  const form = () => {
    const noAuto = { autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: false };
    const url = h('input', { type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', ...noAuto, value: getConfig().url });
    const token = h('input', { type: 'text', placeholder: 'code secret (inutile si collé avec l’adresse)', ...noAuto, value: getConfig().token });
    const submit = (e) => {
      e.preventDefault();
      const conn = parseConnection(url.value, token.value);
      if (!isValidUrl(conn.url)) return toast("L'adresse doit commencer par https://script.google.com/macros/s/ et finir par /exec", 'error');
      if (!conn.token) return toast('Indique le code secret', 'error');
      run(async () => {
        const days = await saveConfig(conn.url, conn.token);
        return days ? null : 'Feuille branchée';
      });
    };
    return [
      h('h2', {}, onboarding ? 'Déjà utilisé Assiette ?' : 'Sauvegarde Google Sheets'),
      h('p.muted', {}, onboarding
        ? 'Branche ta feuille Google pour récupérer ton journal, ton profil et tes recettes.'
        : 'Sans elle, tes données ne sont que sur ce téléphone. Branche une feuille Google pour ne rien perdre et tout consulter sur l’ordinateur.'),
      h(
        'form.stack',
        { onsubmit: submit },
        h('label.field', {}, 'Adresse du script', url),
        h('label.field', {}, 'Code secret', token),
        h('button', { type: 'submit' }, 'Brancher la feuille'),
      ),
      h('a.link', { href: HELP_URL, target: '_blank', rel: 'noopener' }, 'Comment créer la feuille ?'),
    ];
  };

  async function run(action, success) {
    try {
      const message = await action();
      toast(typeof message === 'string' ? message : success ?? 'OK');
    } catch (err) {
      toast(err.message || 'Erreur', 'error');
    }
    paint();
  }

  paint();
  return card;
}

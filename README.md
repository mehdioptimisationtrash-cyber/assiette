# Assiette — journal alimentaire (PWA Safari)

Équivalent simple de Foodvisor, sans compte ni serveur : tout reste sur le téléphone.

## Fonctions
- **Journal** par jour et par repas (petit-déj, déjeuner, dîner, collations), calories restantes, protéines / glucides / lipides, eau, « comme hier ».
- **Recherche** : 3 092 aliments génériques de la table **Ciqual 2020 (ANSES)**, embarquée (marche hors ligne) + produits du commerce **Open Food Facts** (en ligne).
- **Code-barres** avec la caméra (ou saisie des chiffres) → fiche Open Food Facts : Nutri-Score, NOVA, Éco-Score, allergènes, additifs, ingrédients.
- **Saisie rapide** de calories, **aliments perso**, **recettes** (calcul par part), **favoris** et **récents**.
- **Mes notes** chaque jour : humeur, faim, sommeil, texte libre.
- **Historique** de tous les jours passés, par mois, avec recherche dans les notes et les repas.
- **Bilan du jour** /100, conseils, fibres, sucres, sel, vitamines et minéraux.
- **Progrès** : pesées, courbe, tendance kg/semaine, calories des 7 derniers jours.
- **Profil** : objectifs calculés (Mifflin-St Jeor + activité + rythme de perte/prise), ajustables ; export/import JSON.

## Où sont les données ?
Dans Safari, sur le téléphone (localStorage). Pour ne rien perdre : la sauvegarde Google Sheets ci-dessous, et/ou « Exporter » dans Profil.

## Sauvegarde Google Sheets
Chaque jour modifié est envoyé automatiquement dans une feuille Google (onglets `jours`, `repas`, `poids`, `bibliotheque`). La feuille sert aussi à tout récupérer sur un nouveau téléphone.

1. Crée une feuille vide sur [sheets.google.com](https://sheets.google.com) (nom au choix, ex. « Assiette »).
2. Menu **Extensions → Apps Script**. Efface le contenu, colle le code de [`apps-script/Code.gs`](apps-script/Code.gs).
3. Remplace `COLLE_ICI_TON_CODE_SECRET` par un code secret de ton choix (lettres et chiffres, au moins 20 caractères). Enregistre (💾). Tant que ce n'est pas fait, le script refuse tout.
4. **Déployer → Nouveau déploiement** → roue dentée → **Application web**. Exécuter en tant que : **Moi**. Qui a accès : **Tout le monde**. → **Déployer**, puis autorise l'accès à ton compte (« Paramètres avancés » → « Accéder à… »).
5. Copie l'**URL de l'application web** (elle finit par `/exec`).
6. Dans Assiette : **Profil → Sauvegarde Google Sheets** : colle l'adresse et le code secret → **Brancher la feuille**.

L'adresse et le code restent sur le téléphone : ils ne sont pas publiés avec le site.
Pour mettre à jour le script plus tard : Déployer → Gérer les déploiements → ✏️ → Nouvelle version (l'adresse ne change pas).

## Lancer en local
```bash
python3 -m http.server 8765   # puis http://localhost:8765
npm test                      # tests des calculs et des bases
```
La caméra exige https (ou localhost) : pour l'iPhone, publier sur GitHub Pages puis Safari → Partager → « Sur l'écran d'accueil ».

## Mettre à jour la base Ciqual
Télécharger la table Excel ANSES dans `tools/raw/ciqual2020.xls`, puis `python3 tools/build_ciqual.py`.

## Après chaque modification
Augmenter `CACHE_VERSION` dans `sw.js`, sinon l'iPhone garde l'ancienne version.

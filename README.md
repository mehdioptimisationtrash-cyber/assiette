# Assiette — journal alimentaire (PWA Safari)

Équivalent simple de Foodvisor, sans compte ni serveur : tout reste sur le téléphone.

## Fonctions
- **Journal** par jour et par repas (petit-déj, déjeuner, dîner, collations), calories restantes, protéines / glucides / lipides, eau, « comme hier ».
- **Recherche** : 3 092 aliments génériques de la table **Ciqual 2020 (ANSES)**, embarquée (marche hors ligne) + produits du commerce **Open Food Facts** (en ligne).
- **Code-barres** avec la caméra (ou saisie des chiffres) → fiche Open Food Facts : Nutri-Score, NOVA, Éco-Score, allergènes, additifs, ingrédients.
- **Saisie rapide** de calories, **aliments perso**, **recettes** (calcul par part), **favoris** et **récents**.
- **Bilan du jour** /100, conseils, fibres, sucres, sel, vitamines et minéraux.
- **Progrès** : pesées, courbe, tendance kg/semaine, calories des 7 derniers jours.
- **Profil** : objectifs calculés (Mifflin-St Jeor + activité + rythme de perte/prise), ajustables ; export/import JSON.

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

# assiette — INDEX

> Dernière analyse: 2026-09-24

PWA Safari (iPhone) de suivi alimentaire façon Foodvisor, sans framework ni serveur, données en localStorage.

## Architecture & fichiers clés
| Fichier | Rôle |
|---|---|
| `index.html`, `css/app.css` | Page unique, style sobre clair/sombre, CSP |
| `js/app.js` | Onglets (Journal / Ajouter / Progrès / Profil), onboarding si pas de profil |
| `js/store.js` | État + persistance localStorage (`assiette:v1`), mises à jour immuables, export/import |
| `js/nutrition.js` | Calculs purs : BMR Mifflin-St Jeor, objectifs, sommes, score du jour, tendance poids |
| `js/food-model.js` | Modèle d'aliment commun, conversion Ciqual / Open Food Facts, portions, recherche (score), recettes |
| `js/foods.js` | Chargement Ciqual, recherche locale, API Open Food Facts (recherche + code-barres, 1 réessai sur 503) |
| `js/scanner.js` | Code-barres via ZXing (CDN jsdelivr, chargé au 1er scan) |
| `js/vision.js` | Photo → Claude (`claude-opus-5`, SDK via jsdelivr, sortie JSON structurée, fallbacks serveur) |
| `js/views/*.js` | journal, add (recherche/scan/rapide), product (fiche), photo, library (aliment perso, recette), progress, profile |
| `data/ciqual.json` | 3 092 aliments Ciqual 2020, généré par `tools/build_ciqual.py` (kcal recalculées depuis macros si absentes) |
| `sw.js` | Cache hors ligne — **bump `CACHE_VERSION` à chaque modif** |
| `tests/*.test.js` | `npm test` (node:test), 17 tests |

## Bases de données
- Ciqual 2020 ANSES (data.gouv) — embarquée.
- Open Food Facts — `cgi/search.pl` (le nouveau `search.openfoodfacts.org` n'a pas d'en-tête CORS) et `api/v2/product/<code>.json`.

## Activité récente
- 2026-09-24 : création complète, testée dans WebKit (Playwright) : onboarding, recherche, fiche, code-barres Nutella, eau, pesée, persistance. Appel Claude vérifié avec fausse clé (401 géré) ; analyse réelle non testée (pas de clé).

## TODO
- Publier sur GitHub Pages (https requis pour la caméra) et installer sur l'iPhone.
- Tester une vraie photo avec la clé d'API de Mehdi.
- Option : synchro Google Sheets comme carnet-muscu.

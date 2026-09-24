# assiette — INDEX

> Dernière analyse: 2026-09-24

Site : https://mehdioptimisationtrash-cyber.github.io/assiette/ (repo GitHub `mehdioptimisationtrash-cyber/assiette`, Pages sur `main`).

PWA Safari (iPhone) de suivi alimentaire façon Foodvisor, sans framework ni serveur, données en localStorage.

## Architecture & fichiers clés
| Fichier | Rôle |
|---|---|
| `index.html`, `css/app.css` | Page unique, style sobre clair/sombre, CSP |
| `js/app.js` | Onglets (Journal / Ajouter / Progrès / Profil), onboarding si pas de profil |
| `js/sync.js`, `js/sync-model.js` | Sauvegarde Google Sheets : envoi des seuls jours modifiés (empreintes), réessai hors ligne, restauration, choix au 1er branchement |
| `apps-script/Code.gs` | Script Google (v2, refuse tout si le code secret est encore le texte à remplacer) : onglets jours / repas / poids / bibliotheque. Dépôt = code secret vide ; `Code.local.gs` (non versionné) = version de Mehdi |
| `js/store.js` | État + persistance localStorage (`assiette:v1`), mises à jour immuables, export/import |
| `js/nutrition.js` | Calculs purs : BMR Mifflin-St Jeor, objectifs, sommes, score du jour, tendance poids |
| `js/food-model.js` | Modèle d'aliment commun, conversion Ciqual / Open Food Facts, portions, recherche (score), recettes |
| `js/foods.js` | Chargement Ciqual, recherche locale, API Open Food Facts (recherche + code-barres, 1 réessai sur 503) |
| `js/scanner.js` | Code-barres via ZXing (CDN jsdelivr, chargé au 1er scan) |
| `js/views/*.js` | journal (+ Mes notes), history (Historique), sheets (réglage Google Sheets), add (recherche/scan/rapide), product (fiche), library (aliment perso, recette), progress, profile |
| `data/ciqual.json` | 3 092 aliments Ciqual 2020, généré par `tools/build_ciqual.py` (kcal recalculées depuis macros si absentes) |
| `sw.js` | Hors ligne : fichiers de l'app en réseau d'abord (mises à jour immédiates), Ciqual + ZXing en cache d'abord. **Bump `CACHE_VERSION` + `js/version.js` à chaque modif** |
| `tests/*.test.js` | `npm test` (node:test), 21 tests dont Code.gs exécuté dans une fausse feuille |

## Bases de données
- Ciqual 2020 ANSES (data.gouv) — embarquée.
- Open Food Facts — `cgi/search.pl` (le nouveau `search.openfoodfacts.org` n'a pas d'en-tête CORS) et `api/v2/product/<code>.json`.

## Activité récente
- 2026-09-24 : création complète, testée dans WebKit (Playwright) : onboarding, recherche, fiche, code-barres Nutella, eau, pesée, persistance.
- 2026-09-24 : reconnaissance photo (API Claude) retirée à la demande de Mehdi (pas de clé d'API).
- 2026-09-24 : publié sur GitHub Pages, vérifié en ligne (WebKit).
- 2026-09-24 : notes du jour (humeur, faim, sommeil, texte), onglet Historique, sauvegarde Google Sheets. Testé à deux téléphones avec une fausse feuille (Playwright, service worker bloqué car il empêche l'interception).
- 2026-09-24 : Mehdi ne voyait pas la carte Google Sheets (iPhone resté sur l'ancienne version, cache d'abord). Service worker passé en réseau d'abord + rechargement auto + numéro de version en bas du Profil (v9).
- 2026-09-24 : feuille Google de Mehdi branchée et vérifiée (profil + 9 aliments du jour reçus). Causes des blocages rencontrés : déploiement pas en « Tout le monde », puis script collé avec le texte à remplacer au lieu du code. Son script est en v1 (fonctionne ; v2 n'ajoute que la garde « code non choisi »).

## TODO
- Mehdi installe l'app sur l'iPhone (Safari → Partager → Sur l'écran d'accueil).
- Option : synchro Google Sheets comme carnet-muscu.

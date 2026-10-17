# Hawta — plan multi-boutiques et collaboration

## 1. Stabiliser le travail actuel

Sur `trotinat/MJ_Scrap`, intégrer les changements locaux existants dans une PR avant que les branches boutiques partent de `main`. Conserver les migrations et données actuelles. Le dépôt est public : ne pousser aucun secret ni capture de session.

## 2. Construire le cœur multi-boutiques (Houssam)

- Marque Hawta dans l'interface et les métadonnées, avec nom de dépôt/package renommé plus tard si utile.
- Registre de boutiques et contrat de collecteur typé conforme à `CONNECTOR_CONTRACT.md`.
- Migration PostgreSQL : ajouter `shop_id` aux offres, observations de listes, collectes et recherches ; remplacer l'unicité de `source_id` par `(shop_id, source_id)` ; attribuer `marjane-mall` aux données anciennes sans effacer l'historique.
- Planifier, limiter et isoler la collecte par boutique. Revoir rapprochement de produits, filtres, score, alertes et liens sortants pour qu'ils portent l'identité de la boutique.
- Adapter la création de recherche : « toutes les boutiques » ou sélection explicite ; catégories/facettes par boutique ; prévisualisation et résultats progressifs.

État : `shop_id`, droits par compte, séparation des offres/historiques, sélection d'une boutique par recherche et filtre des résultats sont implémentés. La sélection « toutes les boutiques » se fera via des recherches par boutique, puis éventuellement une recherche groupée. Le registre de collecteurs et les catégories/facettes de nouvelles boutiques restent à développer.

## 3. Développer les collecteurs en parallèle (Saad et Houssam)

Chaque contributeur part de `main`, crée `feat/<boutique>-connector`, lit `HAWTA_CONTEXT.md` et `CONNECTOR_CONTRACT.md`, puis ne touche qu'à son module et ses fixtures sauf accord dans la PR. Exemple Saad : vérifier d'abord si `nike.com/ma` propose des articles commandables au Maroc avec prix exploitables ; implémenter listes, fiches, variantes, promotions et stock ; documenter les pages bloquées ou incomplètes. Une autre boutique suit le même contrat, sans modifier la logique commune.

Flux GitHub : `git switch main` → `git pull` → `git switch -c feat/nike-connector` → commits ciblés → `git push -u origin feat/nike-connector` → PR vers `main`. Saad a besoin d'un accès GitHub au dépôt (collaborateur ou fork). La PR contient exemples source→données, limites, vérifications ciblées et impact collecte ; le mainteneur revoit puis fusionne.

## 4. Piloter et publier

Activer la boutique derrière un réglage par boutique, collecter un petit échantillon, contrôler à la main prix, variantes, disponibilité et liens, puis élargir. Afficher la source et la fraîcheur sur chaque deal. Vérifier les builds web/worker en fin de lot et publier la version saine sur l'URL Tailscale iPhone selon `AGENTS.md`.

**Critère de réussite :** une recherche personnelle peut trouver des offres Marjane et d'une nouvelle boutique, filtrer par boutique, comparer les prix observés sans mélanger leurs historiques, et continuer à fonctionner si un collecteur échoue.

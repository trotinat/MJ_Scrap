# Hawta — contexte à partager avec toute IA du projet

Hawta est une application marocaine de découverte de bons plans, en français et en dirhams (MAD). Elle compare des prix observés dans le temps et propose des résultats pertinents pour les recherches et le profil de chaque utilisateur. Le nom public est **Hawta** ; le dépôt et les noms internes `MJ_Scrap` / `@mdw/*` peuvent être renommés progressivement.

## Dépôt et état actuel

- Dépôt GitHub : https://github.com/trotinat/MJ_Scrap (`main` est la branche principale).
- Monorepo pnpm : `apps/web` (Next.js), `apps/worker` (collecte), `packages/database` (PostgreSQL/Drizzle), `packages/shared` (types/filtres), `packages/scraper` (actuellement Marjane), `packages/scoring` (pertinence), `packages/notifications` (Telegram).
- Le cœur porte désormais `shop_id` sur les recherches, produits, offres, collectes et pages explorées ; les comptes ont des droits par boutique (`user_shops`). `SiteAdapter` accepte un `shopId`, mais seul le collecteur Marjane est branché à ce jour. Les rayons Marjane et ses pages promotionnelles restent spécifiques à ce site.
- Les recherches et profils sont privés par utilisateur. La migration multi-boutiques doit conserver les comptes, recherches, produits et historiques déjà enregistrés.
- Des changements locaux non commités peuvent exister. Inspecter `git status` ; ne jamais les effacer ni pousser `.env`, base locale, identifiants ou cookies.

## Direction produit

- Plusieurs boutiques dans Hawta, avec la source visible sur chaque offre et des filtres par boutique.
- Les collecteurs sont développés **par notre équipe** (Houssam et Saad, chacun pouvant utiliser son IA), dans ce même dépôt via branches et pull requests. Aucun service tiers de collecte n'est requis.
- Les éventuels accords avec les boutiques sont traités **hors de l'application**. Le contrat dans `docs/CONNECTOR_CONTRACT.md` est exclusivement un contrat technique entre Hawta et un collecteur.
- Priorités : exactitude des prix et des variantes, pertinence personnelle, interface iPhone claire, collecte respectueuse et diagnostic des échecs. Une remise affichée par un site n'est pas une baisse de prix vérifiée par Hawta.

## Avant de développer un collecteur

Lire `docs/CONNECTOR_CONTRACT.md` et `docs/HAWTA_PLAN.md`. Examiner les types existants dans `packages/shared/src/types.ts`, l'adaptateur Marjane et `apps/worker/src/pipeline.ts`. Identifier le site exact, son périmètre marocain, sa devise, ses catégories, ses règles d'accès et ses limites de collecte. Une page dans une autre devise ou non achetable au Maroc ne doit pas entrer parmi les bons plans marocains sans traitement explicite.

## Consignes à donner à une IA contributrice

> Tu contribues à Hawta dans https://github.com/trotinat/MJ_Scrap. Lis `HAWTA_CONTEXT.md`, `docs/CONNECTOR_CONTRACT.md` et `docs/HAWTA_PLAN.md` avant de coder. Développe uniquement le connecteur de la boutique qui t'est assignée et ses fixtures/vérifications ciblées sur une branche `feat/<boutique>-connector`. Ne modifie pas le schéma SQL, le worker central, le score ou l'interface sans coordination préalable. Signale tout champ manquant dans le contrat ; n'invente pas les prix, stocks, variantes ou remises. Prépare une PR avec exemples d'extraction et limites connues.

## Vérification et livraison

Vérifier les cas utiles à la fin d'un lot, pas après chaque petite modification. Le mainteneur intègre la PR, lance les builds web/worker, effectue une collecte pilote puis déploie la version compilée sur l'URL privée du téléphone. Voir `AGENTS.md` pour les règles locales de déploiement.

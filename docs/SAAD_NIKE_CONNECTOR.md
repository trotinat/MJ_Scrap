# Brief Saad — connecteur Nike Maroc pour Hawta

Ce brief est à donner à l’agent IA qui travaillera sur le collecteur Nike. Le dépôt partagé est [trotinat/MJ_Scrap](https://github.com/trotinat/MJ_Scrap), nom public **Hawta**.

## État du projet et branche de départ

Le cœur multi-boutiques est actuellement sur `feat/profil-destockage-ui` et doit être poussé/fusionné avant l’intégration Nike. Tant que ce cœur n’est pas dans `main`, crée ta branche depuis `origin/feat/profil-destockage-ui` et ouvre une PR vers cette branche. Après sa fusion dans `main`, les travaux suivants partiront de `main`.

```powershell
git fetch origin
git switch -c feat/nike-ma-connector origin/feat/profil-destockage-ui
```

Si cette branche est déjà intégrée à `main`, utilise plutôt :

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/nike-ma-connector
```

## Prompt à copier dans l’agent IA de Saad

> Tu développes le connecteur Nike Maroc pour Hawta dans `https://github.com/trotinat/MJ_Scrap`. Avant de coder, lis `HAWTA_CONTEXT.md`, `docs/CONNECTOR_CONTRACT.md`, `docs/HAWTA_PLAN.md`, ce brief, `packages/shared/src/types.ts`, `packages/scraper/src/adapter.ts` et `apps/worker/src/pipeline.ts`.
>
> Travaille uniquement sur la collecte Nike dans `packages/scraper` et ses fixtures/tests ciblés. Ne modifie pas le schéma SQL, le worker central (`apps/worker`), le scoring, les comptes/droits, ni les écrans sans accord préalable avec Houssam. Le contrat actuel côté worker est `SiteAdapter` (`discover`, `fetchProduct`, `close`, `shopId`); les types normalisés sont `ListingItem`, `ProductDetail`, `ListingResult` et `DetailResult`. Si l’intégration nécessite une extension commune, décris précisément le besoin dans la PR au lieu de créer une API parallèle ou de brancher Nike seul dans le worker.
>
> D’abord vérifie si Nike propose un catalogue réellement achetable au Maroc avec prix en MAD, livraison et URL du marché marocain. N’utilise pas un autre pays/devise comme offre marocaine. Respecte robots.txt, limites d’accès et délais; ne contourne aucune protection. Si l’accès est bloqué ou si le marché marocain n’existe pas, documente le constat et arrête la collecte plutôt que d’inventer ou de scraper un autre marché.
>
> Implémente les listes et fiches produits utiles, les identifiants et URL canoniques, le prix courant et ancien seulement s’ils sont explicitement présents, la devise, vendeur, disponibilité et variantes (pointure/couleur) quand elles changent prix ou stock. Utilise `unknown` si le stock n’est pas démontré. Ne traite jamais le pourcentage de remise du site comme une baisse de prix Hawta. Une page ou pagination incomplète doit rester `complete: false` afin que Hawta ne marque pas à tort des offres comme disparues.
>
> Ajoute des fixtures anonymisées sans cookies/tokens : liste, fiche avec promotion, variante, rupture/stock inconnu et cas incomplet ou erreur. Ajoute des tests ciblés sur ID, URL, prix/devise, variante, stock et couverture. À la fin, fournis un résumé, les fichiers touchés, les commandes de vérification exécutées et les limites connues. Committe sur `feat/nike-ma-connector`, pousse cette branche sur `origin`, puis ouvre une PR vers la branche de base indiquée ci-dessus. Ne pousse aucun `.env`, base locale, compte, cookie, session ou donnée privée.

## Livrer la branche et la voir sur le PC de Houssam

Sur le PC de Saad, après ses commits :

```powershell
git push -u origin feat/nike-ma-connector
```

Puis ouvrir une Pull Request GitHub vers `feat/profil-destockage-ui` (ou vers `main` si le cœur a déjà été fusionné). Saad envoie à Houssam le lien de la PR. Il n’a pas besoin d’accéder à distance au PC de Houssam : GitHub transporte la branche.

Sur le PC de Houssam, après revue/validation de la PR, récupérer les changements :

```powershell
git fetch origin
git switch -c review/nike-ma origin/feat/nike-ma-connector
pnpm install --frozen-lockfile
```

Le dépôt local doit déjà avoir son `.env` privé configuré; ne le copiez pas dans Git. Pour voir le code dans l’application, le connecteur doit ensuite être enregistré dans le worker, la boutique créée/activée et attribuée au compte de test. Ce branchement central est actuellement une étape d’intégration à faire avec Houssam; la seule présence de la branche Nike ne lance pas encore la collecte. Après cette étape, démarrer l’app comme d’habitude (`pnpm dev`) ou faire un build de validation (`pnpm build`) et ouvrir l’URL Tailscale Hawta.

Saad doit avoir les droits d’écriture sur `trotinat/MJ_Scrap` pour pousser sa branche `origin`. Sinon, il crée un fork, pousse la branche sur son fork et ouvre une PR vers le dépôt principal. GitHub ne copie pas les fichiers directement sur le PC de Houssam : celui-ci récupère la branche avec `git fetch` comme ci-dessus.

## Critères d’acceptation

- Le périmètre Maroc, les prix en MAD, la disponibilité et la livraison sont prouvés par les données source.
- Les fiches et variantes gardent des identifiants/URL stables; deux tailles ne sont pas fusionnées si prix ou stock diffèrent.
- Une erreur ou pagination partielle ne supprime pas les anciennes offres.
- Les fixtures et vérifications ne contiennent aucune donnée de compte ni de session.
- La PR garde le connecteur isolé et indique clairement ce qui reste nécessaire pour l’enregistrer dans le worker et l’activer pour un profil.

# Brief Saad — développer un connecteur boutique pour Hawta

Ce brief est à donner à l’agent IA de Saad. Saad choisit la boutique et le périmètre qu’il veut développer. Le dépôt partagé est [trotinat/MJ_Scrap](https://github.com/trotinat/MJ_Scrap), nom public **Hawta**.

## État du projet et branche de départ

Le cœur multi-boutiques est actuellement sur `feat/profil-destockage-ui`. Tant qu’il n’est pas dans `main`, crée ta branche depuis `origin/feat/profil-destockage-ui` et ouvre une PR vers cette branche. Après sa fusion dans `main`, les travaux suivants partiront de `main`.

```powershell
git fetch origin
git switch -c feat/<boutique>-connector origin/feat/profil-destockage-ui
```

Si cette branche est déjà intégrée à `main`, utilise plutôt :

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/<boutique>-connector
```

## Prompt à copier dans l’agent IA de Saad

> Tu développes un connecteur pour la boutique que Saad a choisie dans Hawta (`https://github.com/trotinat/MJ_Scrap`). Confirme avec Saad le nom de boutique, le pays/marché et le périmètre produit à couvrir. Avant de coder, lis `HAWTA_CONTEXT.md`, `docs/CONNECTOR_CONTRACT.md`, `docs/HAWTA_PLAN.md`, ce brief, `packages/shared/src/types.ts`, `packages/scraper/src/adapter.ts` et `apps/worker/src/pipeline.ts`.
>
> Travaille uniquement sur la collecte de la boutique choisie dans `packages/scraper` et ses fixtures/vérifications ciblées. Ne modifie pas le schéma SQL, le worker central (`apps/worker`), le scoring, les comptes/droits, ni les écrans sans accord préalable avec Houssam. Le contrat actuel côté worker est `SiteAdapter` (`discover`, `fetchProduct`, `close`, `shopId`); les types normalisés sont `ListingItem`, `ProductDetail`, `ListingResult` et `DetailResult`. Si l’intégration nécessite une extension commune, décris précisément le besoin dans la PR au lieu de créer une API parallèle ou de brancher la boutique directement dans le worker.
>
> D’abord vérifie que la boutique et le périmètre choisi sont réellement accessibles aux utilisateurs ciblés, avec prix/devise, disponibilité, livraison et URL du marché approprié. N’utilise pas un autre pays ou une autre devise comme offre locale. Respecte robots.txt, limites d’accès et délais; ne contourne aucune protection. Si l’accès est bloqué ou si le marché ciblé n’est pas pris en charge, documente le constat et arrête la collecte plutôt que d’inventer des données.
>
> Implémente les listes et fiches produits utiles, les identifiants et URL canoniques, le prix courant et ancien seulement s’ils sont explicitement présents, la devise, vendeur, disponibilité et variantes (pointure/couleur) quand elles changent prix ou stock. Utilise `unknown` si le stock n’est pas démontré. Ne traite jamais le pourcentage de remise du site comme une baisse de prix Hawta. Une page ou pagination incomplète doit rester `complete: false` afin que Hawta ne marque pas à tort des offres comme disparues.
>
> Ajoute des fixtures anonymisées sans cookies/tokens : liste, fiche avec promotion, variante, rupture/stock inconnu et cas incomplet ou erreur. Ajoute des tests ciblés sur ID, URL, prix/devise, variante, stock et couverture. À la fin, fournis un résumé, les fichiers touchés, les commandes de vérification exécutées et les limites connues. Committe sur `feat/<boutique>-connector`, pousse cette branche sur `origin`, puis ouvre une PR vers la branche de base indiquée ci-dessus. Ne pousse aucun `.env`, base locale, compte, cookie, session ou donnée privée.

## Livrer la branche et la voir sur le PC de Houssam

Sur le PC de Saad, après ses commits :

```powershell
git push -u origin feat/<boutique>-connector
```

Puis ouvrir une Pull Request GitHub vers `feat/profil-destockage-ui` (ou vers `main` si le cœur a déjà été fusionné). Saad envoie à Houssam le lien de la PR. Il n’a pas besoin d’accéder à distance au PC de Houssam : GitHub transporte la branche.

Sur le PC de Houssam, après revue/validation de la PR, récupérer les changements :

```powershell
git fetch origin
git switch -c review/<boutique> origin/feat/<boutique>-connector
pnpm install --frozen-lockfile
```

Le dépôt local doit déjà avoir son `.env` privé configuré; ne le copiez pas dans Git. Pour voir le code dans l’application, le connecteur doit ensuite être enregistré dans le worker, la boutique créée/activée et attribuée au compte de test. Ce branchement central est actuellement une étape d’intégration à faire avec Houssam; la seule présence de la branche ne lance pas encore la collecte. Après cette étape, démarrer l’app comme d’habitude (`pnpm dev`) ou faire un build de validation (`pnpm build`) et ouvrir l’URL Tailscale Hawta.

Saad doit avoir les droits d’écriture sur `trotinat/MJ_Scrap` pour pousser sa branche `origin`. Sinon, il crée un fork, pousse la branche sur son fork et ouvre une PR vers le dépôt principal. GitHub ne copie pas les fichiers directement sur le PC de Houssam : celui-ci récupère la branche avec `git fetch` comme ci-dessus.

## Critères d’acceptation

- Le marché et le public visés sont documentés; prix, devise, disponibilité et livraison sont prouvés par la source et normalisés pour Hawta.
- Les fiches et variantes gardent des identifiants/URL stables; deux tailles ne sont pas fusionnées si prix ou stock diffèrent.
- Une erreur ou pagination partielle ne supprime pas les anciennes offres.
- Les fixtures et vérifications ne contiennent aucune donnée de compte ni de session.
- La PR garde le connecteur isolé et indique clairement ce qui reste nécessaire pour l’enregistrer dans le worker et l’activer pour un profil.

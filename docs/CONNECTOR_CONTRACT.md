# Contrat technique Hawta ↔ collecteur boutique (v1)

Ce document décrit la frontière **logicielle**. Les accords éventuels avec les boutiques sont gérés hors de Hawta. Une boutique = un module indépendant dans le monorepo ; elle n'écrit jamais directement dans PostgreSQL et ne calcule ni score ni alertes.

## Identité et entrée

Chaque module expose un identifiant stable (`marjane-mall`, `nike-ma`…), un nom affichable, les domaines autorisés, le pays et la devise source. Il accepte une liste de pages de départ appartenant à cette boutique et un budget de collecte fourni par le worker. Il fournit `discover(listing, budget)`, `fetchProduct(url)` et `close()`. L'enregistrement, la planification et les limites de concurrence appartiennent au worker Hawta.

Une entrée de liste comporte `listingId` stable et `url` canonique. La boutique peut proposer une arborescence de catégories, des pages promotions et des facettes (pointure, genre, etc.) ; leurs identifiants restent dans l'espace de cette boutique. Les URL complètes sont validées contre ses domaines autorisés pour éviter de visiter une adresse arbitraire.

## Sortie normalisée

Un résultat produit comporte au minimum :

| Champ | Règle |
| --- | --- |
| `shopId`, `externalId` | Stables ; l'identité d'une offre est **(`shopId`, `externalId`)**. |
| `url`, `title` | URL canonique valide et titre réel de la source. |
| `priceCents`, `currency` | Prix numérique observé, devise explicite ; affichage et comparaison en MAD seulement après conversion documentée. Pas de prix déduit d'un pourcentage. |
| `observedAt`, `extraction` | Heure de l'observation et méthode (`structured-data`, `embedded-data`, `html`, `browser`). |
| `stock` | `in_stock`, `out_of_stock` ou `unknown` ; `unknown` si la source ne prouve rien. |
| `brand`, `modelRef`, `variant` | Facultatifs ; une pointure/couleur est conservée comme variante distincte quand elle change prix ou disponibilité. |
| `originalPriceCents`, `advertisedDiscountPct` | Facultatifs ; la remise annoncée par le site reste séparée de la baisse constatée dans l'historique Hawta. |
| `seller`, `imageUrl`, `category`, `gender`, `sizes` | Facultatifs ; ne pas inventer des attributs absents. |

Un résultat de liste indique aussi `complete`, `pagesLoaded` et les erreurs éventuelles. `complete` n'est vrai que si la pagination et l'extraction couvrent réellement la page ; une liste vide ou bloquée ne permet jamais de déclarer des offres disparues. Une erreur locale n'arrête pas les autres boutiques.

## Règles d'exactitude et d'exploitation

- Préférer les données structurées exactes ; utiliser le navigateur seulement quand nécessaire. Respecter les règles d'accès du site, les délais, les limites de requêtes et les blocages. Ne pas contourner une protection.
- Sauver quelques fixtures représentatives sans données de session ni secrets : liste, produit en stock, rupture, promotion, variante et échec. Vérifier prix/devise/ID/URL et absence de fausse remise.
- Une même référence vendue par deux boutiques peut être rapprochée pour comparaison **seulement si marque, modèle et variante sont suffisamment prouvés**. Les offres et leurs historiques restent distincts.
- Les pages non achetables au Maroc ou en devise non prise en charge sont écartées du classement principal tant que les frais, disponibilité et conversion ne sont pas fiables.
- Exposer des métriques par boutique : dernière réussite, couverture, produits observés, erreurs, blocages et durée. Activer une nouvelle boutique progressivement.

## Statut d'implémentation

Le schéma et le worker savent désormais séparer produits, offres, recherches et collectes par `shop_id`, mais le branchement dynamique d'un deuxième adaptateur, les rayons/facettes propres à chaque site et sa collecte pilote restent à faire. Ne pas présenter un nouveau collecteur comme intégré avant ces étapes.

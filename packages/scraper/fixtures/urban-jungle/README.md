# Fixtures Urban Jungle Maroc

Réponses publiques réelles de `https://ma.urbanjunglestore.com`, relevées le 17 octobre 2026, sans cookie ni session :

- `collection-soldes.json` — six produits de `/products.json` : chaussure en promotion avec une pointure épuisée, t-shirt plein tarif, t-shirt dont une taille épuisée est affichée à 0,00, chaussure enfant (`BOY`), accessoire taille unique en promotion, pointures écrites `40_2/3`.
- `product-puma-v-s1-totalenergies-afcon-egypte-404147-05.js.json` — fiche `/products/<handle>.js` (prix en centimes).

Descriptions vidées, une seule image et `featured_image` des variantes retirés pour alléger. Les cas « prix différent selon la taille », « tout épuisé » et « devise autre que MAD » sont dérivés dans les tests à partir de ces fichiers.

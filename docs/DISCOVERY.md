# Phase 1 — Inspection de Marjane Mall (octobre 2026)

## Méthode et limite importante

L'environnement de développement (conteneur cloud) **ne pouvait pas joindre
marjanemall.ma directement** : son proxy de sortie refuse la connexion
(`CONNECT tunnel failed, response 403`). Le site a été inspecté via un lecteur
de pages qui renvoie le **texte rendu** (balisage et scripts retirés). Les
constats ci-dessous sont donc fiables pour le contenu visible, mais pas pour
la structure HTML exacte (classes CSS, présence éventuelle de JSON-LD dans les
`<script>`).

Conséquence : l'extracteur est conçu pour ne pas dépendre de classes CSS
(voir plus bas) et **l'extraction en direct n'a pas été validée**. Elle doit
l'être sur le VPS avec :

```bash
docker compose run --rm migrate node dist/cli.js probe
```

## robots.txt (règles `User-agent: *`)

- Interdits : `/api/`, `/_next/`, `/app/`, `/lib/`, `/dev/`, panier, commande,
  compte, connexion, liste de souhaits, comparaisons, fichiers de configuration.
- Autorisés : pages catégories, pages promotions, fiches `/p/…`, `/pub/media/`,
  `/sitemaps/` (sitemap : `/sitemap_index.xml`).
- Plusieurs robots d'entraînement IA et outils SEO agressifs sont bloqués
  nommément ; notre agent utilisateur s'identifie (`MarjaneDealsWatcher/1.0`)
  et relève donc du groupe `*`.

Le scraper lit et applique robots.txt avant chaque collecte. S'il ne peut pas
le lire, il s'arrête (RFC 9309 : en cas d'indisponibilité, tout est interdit).

## Structure du site

| Élément | Constat |
|---|---|
| Technologie | Front Next.js ; catalogue Magento 2 (marketplace multi-vendeurs, « Vendu par … ») |
| Catégories | `/tv-son-photo`, `/informatique-gaming`, `/telephone-objets-connectes`, `/electromenager`, `/maison-cuisine-deco`, `/beaute-sante`, `/sport`, `/bebe-jouets`, `/auto-moto`, `/brico-jardin-animalerie`, `/vetements-chaussures-bijoux-accessoires` |
| Sous-catégories | ex. `/tv-son-photo/tv-home-cinema/televiseur`, `/tv-son-photo/audio-hifi-musique/casque-ecouteur`, `/electromenager/cuisine-et-cuisson/airfryer` |
| Pages promotions | `/ventes-flash`, `/destockage`, `/les-deals-de-l-automne`, `/tout-a-moins-de-200-dh`, `/trouvailles-marjane-mall`, `/panier-malin` (saisonnières : `/offres-ramadan`, `/back-to-school`…) |
| Fiches produit | `/p/<slug>-<identifiant>` ; l'identifiant (ex. `abbb332004180907425`, `aaaaa50123`) est stable et sert de clé |
| Recherche | `/search?q=…` renvoie une 404 : **pas de recherche publique exploitable** → chaque critère est rattaché à des catégories |

## Rendu et données

- **Pages catégories de premier niveau** (ex. `/tv-son-photo`) : ~40 cartes
  produit présentes dans le HTML serveur → extraction HTTP + Cheerio.
- **Sous-catégories** (ex. `/…/televiseur`) : le HTML serveur ne contient que
  le guide d'achat ; les produits sont chargés côté client → **Playwright**
  nécessaire (mode `RENDER_MODE=auto`, bascule automatique si aucune carte).
- **Fiche produit** : titre, prix, prix barré, remise, vendeur et liste
  « Description produit » (Marque, Résolution d'affichage, Classe de diagonale,
  Nombre de ports HDMI, Type de téléviseur…) sont dans le HTML serveur.
- **Format des prix** : le prix courant est affiché en deux éléments
  `4149` + `00DH` (centimes en exposant) — aplati, cela donne `449900DH` ;
  le prix barré s'affiche `6500.00 DH` ou `1299 DH` ; la remise `-31%`.
  Le parseur teste les lectures possibles et retient celle qui est cohérente
  avec la remise annoncée.
- **Stock** : rarement affiché ; seul le bouton « Ajouter au panier » est un
  indice. Le stock est donc souvent « non indiqué » et n'est jamais deviné.
- **Notes / avis** : seulement « (13 avis) » sur certaines cartes ; pas de note.
- **Variantes** : chaque taille / capacité a sa propre fiche `/p/…` ;
  plusieurs vendeurs peuvent proposer le même modèle (fiches distinctes).
- **Prix instables** : deux lectures à quelques minutes d'écart ont montré le
  même téléviseur à 4 149 MAD (-36 %) puis 4 499 MAD (-31 %) — d'où
  l'importance de l'historique horodaté.

## Règles d'extraction retenues

1. Fiche produit : JSON-LD `Product` s'il existe et si son prix concorde avec
   le prix affiché ; sinon texte du bloc qui suit le `<h1>` (le bloc
   « produits similaires » est exclu).
2. Cartes de liste : chaque lien `/p/…` est étendu jusqu'au plus grand parent
   ne contenant aucun autre produit ; le texte de ce bloc est analysé nœud par
   nœud (prix, vendeur, remise, avis).
3. Validation : une fiche sans titre ou sans prix plausible est rejetée
   (erreur enregistrée), jamais complétée par des valeurs inventées.
4. Politesse : une requête à la fois, 3 s (configurable) + aléa entre deux
   requêtes, 3 essais maximum avec attente exponentielle, `Retry-After`
   respecté, pages produit limitées à 150 par collecte.
5. Blocage (403, CAPTCHA, page de challenge) : la collecte s'arrête et le
   signale, sans tentative de contournement. Les données existantes ne sont
   pas modifiées.

## Alternative autorisée si l'accès automatisé est refusé

Si `probe` indique un blocage depuis le VPS : demander à Marjane Mall un accès
partenaire / flux produits, ou se limiter aux pages autorisées à une fréquence
plus faible. Le scraper ne doit pas être modifié pour contourner une
protection.

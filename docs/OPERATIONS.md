# Exploitation et règles métier

## Commandes utiles

| Action | Commande |
|---|---|
| État des services | `docker compose ps` |
| Journaux du worker | `docker compose logs -f worker` |
| Collecte immédiate | bouton « Lancer une collecte maintenant » ou `docker compose run --rm migrate node dist/cli.js run-now` |
| Validation en direct | `docker compose run --rm migrate node dist/cli.js probe` |
| Test Telegram | `docker compose run --rm migrate node dist/cli.js test-telegram` |
| Créer un administrateur | `docker compose run --rm -it migrate node dist/cli.js create-admin vous@exemple.ma` |
| Réinitialiser un mot de passe | `docker compose run --rm -it migrate node dist/cli.js reset-password vous@exemple.ma` |
| Critères d'exemple | `docker compose run --rm migrate node dist/cli.js seed-examples` |
| Sauvegarde / restauration | `./scripts/backup.sh` · `./scripts/restore.sh backups/daily/<f>.dump` |

## Déroulement d'une collecte

1. Chargement des critères actifs et des paramètres (aucun redémarrage requis).
2. Pour chaque catégorie des critères + pages promotions des Paramètres :
   lecture de la liste (HTTP, ou Chromium si la liste est rendue côté client).
3. Dédoublonnage par identifiant de fiche ; présélection légère (mots-clés,
   fourchette de prix ±15 %) pour limiter les requêtes.
4. Consultation des fiches produit (budget : 150 par collecte), les offres
   déjà suivies d'abord ; si une fiche échoue, la carte de liste sert de relevé.
5. Pour chaque offre, dans **une transaction** : produit, offre, relevé de
   prix, évaluation de chaque critère, file d'alertes.
6. Les offres déjà suivies qui n'apparaissent plus dans les listes sont
   vérifiées directement (404 → « indisponible »).
7. Politique d'absence (voir ci-dessous), puis envoi des alertes.
8. Statut (`réussie`, `partielle`, `échec`, `ignorée`, `interrompue`), durée,
   compteurs et erreurs détaillées sont enregistrés.

## Produits, offres et variantes

- **Offre** = une fiche `/p/…` (un vendeur, une variante). Clé : l'identifiant
  de la fiche.
- **Produit** = regroupement d'offres de même marque + même référence modèle +
  mêmes facettes de variante (taille d'écran, RAM, stockage). Sans référence
  fiable, chaque fiche reste un produit distinct : deux variantes ne sont
  jamais fusionnées par erreur.

## Politique d'absence (aucune suppression)

- Une offre vue sur une liste explorée avec succès → `active`, compteur remis à 0.
- Une offre non vue sur une liste explorée avec succès → +1 absence ; après
  `missingAfterRuns` absences consécutives (3 par défaut) → `missing`
  (« plus listé »).
- Fiche produit en 404/410 → `unavailable`.
- Une collecte échouée, bloquée ou une liste vide ne comptent **jamais** comme
  absence. Les offres et leur historique ne sont jamais supprimés ; une offre
  qui réapparaît redevient `active`.

## Trois notions de prix distinctes

1. **Remise annoncée** : affichée par Marjane Mall (prix barré, -xx %).
2. **Évolution observée** : différence entre deux relevés de l'application.
3. **Plus bas observé** : minimum des relevés enregistrés.

Aucun prix antérieur au premier relevé n'est supposé ; les explications ne
citent une évolution chiffrée que si au moins deux relevés existent.

## Correspondance et score

- **Filtres obligatoires** : mots-clés (au moins un dans le titre), référence,
  catégorie, marques imposées/exclues, prix min/max, remise minimale,
  exigences techniques, caractéristiques exclues, vendeurs exclus, note et
  nombre d'avis minimum, état neuf. Une donnée absente pour une exigence
  obligatoire rend la correspondance « non vérifiable » : elle est exclue.
- **Score 0–100** : moyenne pondérée des composantes applicables (prix vs
  objectif 30, baisse observée 20, remise annoncée 15, spécifications
  préférées 15, marque préférée 10, avis 5, vendeur 5, stock 5 — réglable).
  Une composante sans donnée (pas d'historique, pas de note, stock non
  affiché) est exclue du calcul et signalée, jamais créditée. Un score élevé
  ne transforme jamais un produit non conforme en correspondance.
- Classes réglables : ≥ 85 exceptionnelle, ≥ 70 très bonne, ≥ 50 intéressante.

## Règles d'alerte

| Événement | Déclencheur | Clé d'idempotence |
|---|---|---|
| Nouvelle offre | l'offre devient conforme avec un score ≥ seuil du critère | `new:<critère>:<offre>` |
| Prix cible atteint | le prix passe sous la cible (ignore le seuil de score) | `target:<critère>:<offre>:<cible>:<prix>` |
| Baisse de prix | baisse ≥ seuil du critère vs dernier relevé ou dernière alerte | `drop:<critère>:<offre>:<prix>` |
| Offre exceptionnelle | passage en classe exceptionnelle | `exc:<critère>:<offre>:<prix>` |
| Retour en stock | rupture → en stock, observé sur deux relevés | `restock:<critère>:<offre>:<relevé>` |

Modes : toutes les correspondances, nouvelles offres uniquement, baisses de
prix uniquement (baisses + prix cible), offres exceptionnelles uniquement.
Si plusieurs événements surviennent en même temps, un seul message est
envoyé (le plus important). Garantie de livraison « au moins une fois » :
seul un crash pendant l'appel à Telegram peut produire un doublon.

## Limitations connues

- **Extraction non validée en direct** depuis l'environnement de
  développement (accès réseau refusé) : exécutez `probe` sur le VPS et
  ajoutez des fixtures réelles aux tests (`packages/scraper/fixtures/`).
- La recherche du site n'est pas exploitable : un critère sans catégorie ne
  trouve des produits que via les pages promotions configurées.
- Le stock et les notes sont rarement affichés : les filtres « note minimale »
  et « nombre d'avis » excluront la plupart des produits.
- Les listes chargées côté client nécessitent Chromium (≈300–500 Mo de RAM
  pendant la collecte).
- Les images de produits sont affichées depuis le site de Marjane Mall ;
  Telegram doit pouvoir les télécharger, sinon le message part sans image.

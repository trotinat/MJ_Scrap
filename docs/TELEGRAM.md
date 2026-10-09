# Configurer Telegram

## 1. Créer le bot (BotFather)

1. Dans Telegram, ouvrez une conversation avec **@BotFather** (badge bleu vérifié).
2. Envoyez `/newbot`, choisissez un nom (ex. « Marjane Deals ») puis un
   identifiant se terminant par `bot` (ex. `mes_deals_marjane_bot`).
3. BotFather répond avec un **jeton** du type `123456789:AA…`. C'est un secret :
   ne le collez nulle part ailleurs que dans le fichier `.env` du serveur.

## 2. Trouver le chat ID

**Conversation privée**

1. Ouvrez votre bot et envoyez-lui `/start` (obligatoire : un bot ne peut pas
   écrire en premier).
2. Sur le serveur :
   ```bash
   curl -s "https://api.telegram.org/bot<JETON>/getUpdates" | grep -o '"chat":{"id":-\?[0-9]*' | head -1
   ```
   Le nombre affiché est votre `TELEGRAM_CHAT_ID`.

**Groupe** : ajoutez le bot au groupe, envoyez un message dans le groupe, puis
utilisez la même commande ; l'identifiant d'un groupe est négatif
(ex. `-1001234567890`).

## 3. Renseigner `.env` et redémarrer

```env
TELEGRAM_BOT_TOKEN=123456789:AA...
TELEGRAM_CHAT_ID=987654321
```

```bash
docker compose up -d web worker
```

## 4. Tester

- Depuis le tableau de bord : **Notifications Telegram → Envoyer une
  notification de test** (le résultat et l'identifiant du message s'affichent).
- Ou en ligne de commande :
  ```bash
  docker compose run --rm migrate node dist/cli.js test-telegram
  ```

## Fonctionnement des alertes

- Une alerte est envoyée lorsqu'une offre **devient** une correspondance, quand
  le **prix cible** est atteint, lors d'une **nouvelle baisse** d'au moins le
  seuil du critère (5 % par défaut) depuis la dernière alerte, quand une offre
  devient **exceptionnelle**, ou lors d'un **retour en stock** observé.
- Une offre inchangée ne produit jamais de nouvelle alerte. Chaque événement a
  une clé d'idempotence unique en base : une relance ou un redémarrage ne
  crée pas de doublon.
- Si Telegram est indisponible, le message reste en file et est réessayé
  (30 s, 1 min, 2 min… jusqu'à 1 h, 8 tentatives par défaut). Les erreurs
  définitives (jeton invalide, chat introuvable) sont marquées « abandonnée »
  et peuvent être relancées depuis le tableau de bord.
- Le jeton n'apparaît jamais dans l'interface, les journaux ni les réponses
  d'API (il est masqué dans les messages d'erreur).

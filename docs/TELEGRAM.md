# Configurer Telegram

Le bot Telegram est **interactif** : chaque personne (ou groupe) qui lui envoie
`/start` s'abonne elle-même aux alertes. Plus besoin de chercher un « chat ID »
à la main.

## 1. Créer le bot (BotFather)

1. Dans Telegram, ouvrez une conversation avec **@BotFather** (badge bleu vérifié).
2. Envoyez `/newbot`, choisissez un nom puis un identifiant se terminant par
   `bot`. BotFather répond avec un **jeton** du type `123456789:AA…`.
3. C'est un secret : collez-le uniquement dans le fichier `.env` du serveur.

## 2. Renseigner `.env`

```env
TELEGRAM_BOT_TOKEN=123456789:AA...
# Laissez CHAT_ID vide : le bot enregistre lui-même les abonnés.
TELEGRAM_CHAT_ID=
```

## 3. Démarrer le bot

Le bot tourne dans son propre service, à côté du worker et du web :

```bash
docker compose up -d --build db migrate worker web bot
```

En développement local :

```bash
pnpm dev:bot        # ou : pnpm --filter @mdw/worker start:bot (après build)
```

## 4. S'abonner

1. Ouvrez votre bot dans Telegram et envoyez **`/start`**.
2. Le bot confirme l'activation. À partir de là, vous recevez les alertes.
3. Pour un **groupe** : ajoutez le bot au groupe et envoyez `/start` dans le
   groupe (chacun n'a pas à le faire, un seul `/start` abonne le groupe).

### Commandes

| Commande | Effet |
| --- | --- |
| `/start` | Activer les alertes sur ce chat |
| `/mes_recherches` | Lister vos recherches suivies |
| `/statut` | État de votre abonnement |
| `/pause` | Suspendre les alertes (rien n'est perdu) |
| `/reprendre` | Reprendre les alertes |
| `/test` | Recevoir un message de test |
| `/aide` | Afficher l'aide |

## 5. Quelles alertes sont envoyées

Le bot ne notifie que **vos propres recherches** et uniquement les
**changements utiles** :

- une **nouvelle offre** correspondant à l'une de vos recherches ;
- une **baisse de prix** d'au moins le seuil du critère (5 % par défaut) ;
- le **prix cible** atteint.

Ce qui **n'est jamais** envoyé par le bot :

- les **critères recommandés / promos** livrés d'office (Ventes flash, Adidas,
  mode homme…). Ils continuent d'alimenter le tableau de bord, mais ne
  déclenchent aucune alerte Telegram. Pour recevoir des alertes, **créez vos
  propres recherches** dans « Mes critères de recherche » ;
- les retours en stock et les passages en « offre exceptionnelle ».

> Astuce : une recherche créée depuis le tableau de bord est à vous
> (`origin = user`) et notifie ; les critères recommandés seedés ne notifient
> pas. `/mes_recherches` affiche exactement ce qui vous enverra des alertes.

## Fonctionnement et fiabilité

- Chaque bon plan n'est envoyé qu'une fois : une clé d'idempotence unique en
  base empêche les doublons, même après un redémarrage.
- Les alertes sont livrées à **tous les abonnés actifs**. Un abonné qui bloque
  le bot est automatiquement marqué « bloqué » et ignoré, sans gêner les autres.
- Si Telegram est indisponible, le message reste en file et est réessayé
  (30 s, 1 min, 2 min… jusqu'à 1 h, 8 tentatives par défaut).
- Le jeton n'apparaît jamais dans l'interface, les journaux ni les réponses
  d'API (il est masqué dans les messages d'erreur).

### Et l'ancien envoi direct (`TELEGRAM_CHAT_ID`) ?

Si vous renseignez quand même `TELEGRAM_CHAT_ID` **et** que personne n'a fait
`/start`, le worker envoie les alertes à ce chat unique (ancien comportement).
Dès qu'un abonné existe, le bot prend le relais et le worker se tait, pour ne
jamais envoyer deux fois.

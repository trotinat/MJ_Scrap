# Marjane Deals Watcher

Surveillance autonome des promotions de [Marjane Mall](https://www.marjanemall.ma/) :
collecte deux fois par jour (09:00 et 18:00, heure du Maroc), historique des
prix, correspondance avec vos critères de recherche, classement des offres et
alertes Telegram. Interface en français, montants en dirhams (MAD).

> **État de validation** — tout le code est testé (110 tests unitaires et
> d'intégration sur PostgreSQL, parcours de bout en bout de l'interface).
> L'extraction **en direct** sur marjanemall.ma n'a pas pu être vérifiée depuis
> l'environnement de développement (accès réseau refusé) : lancez
> `node dist/cli.js probe` sur le serveur avant de vous y fier
> (voir [docs/DISCOVERY.md](docs/DISCOVERY.md)).

## Architecture

```
apps/web                 Next.js 15 (App Router) + Tailwind + Lucide — tableau de bord protégé
apps/worker              Worker Node.js : planificateur croner (Africa/Casablanca), collecte, envoi Telegram, CLI
packages/shared          Schémas Zod, types, normalisation texte/prix/specs, horaires
packages/database        Drizzle ORM + migrations PostgreSQL, auth, verrous
packages/scraper         Adaptateur Marjane Mall : HTTP + Cheerio, Playwright pour les listes rendues côté client
packages/scoring         Filtres obligatoires/préférences, score 0–100, explications FR, règles d'alerte
packages/notifications   Client Telegram Bot API, mise en forme, file d'envoi idempotente
docker/                  Dockerfile (cibles web / worker), Caddyfile
scripts/                 Sauvegarde, restauration, test de bout en bout
docs/                    Inspection du site, déploiement, Telegram, exploitation
```

```
            ┌────────────┐  09:00 / 18:00   ┌──────────────────┐
            │   worker   │ ───────────────▶ │ marjanemall.ma   │
            │ (croner)   │ ◀─────────────── │ (robots.txt OK)  │
            └─────┬──────┘                   └──────────────────┘
   relevés,       │ verrou PG, transactions
   alertes        ▼
            ┌────────────┐   lecture/écriture  ┌────────────┐   HTTPS   ┌───────┐
            │ PostgreSQL │ ◀─────────────────▶ │    web     │ ◀──────── │ Caddy │ ◀── vous
            └────────────┘                     └────────────┘           └───────┘
                  │ file d'alertes
                  ▼
            Telegram Bot API
```

## Démarrage rapide (production)

```bash
cp .env.example .env && nano .env      # domaine, mots de passe, Telegram
docker compose up -d --build
docker compose run --rm migrate node dist/cli.js probe   # validation en direct
```

Guide complet : [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) ·
Telegram : [docs/TELEGRAM.md](docs/TELEGRAM.md) ·
Règles métier et exploitation : [docs/OPERATIONS.md](docs/OPERATIONS.md)

## Développement

Prérequis : Node 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
export DATABASE_URL=postgres://mdw:mdw@localhost:5432/mdw
pnpm db:migrate                         # migrations
ADMIN_PASSWORD='…' pnpm admin:create vous@exemple.ma
pnpm dev:worker                         # planificateur + /health sur :8081
COOKIE_SECURE=false pnpm dev:web        # http://localhost:3000
```

Tests (la base `TEST_DATABASE_URL` est **effacée** ; sans elle, les tests
PostgreSQL sont ignorés avec un avertissement) :

```bash
TEST_DATABASE_URL=postgres://mdw:mdw@localhost:5432/mdw_test pnpm test
pnpm typecheck && pnpm build
```

Après modification de `packages/database/src/schema.ts` :
`pnpm db:generate` puis committez le fichier SQL généré.

## Couverture des tests

| Domaine | Fichier |
|---|---|
| Prix MAD, texte, specs, schéma des critères, fuseau Africa/Casablanca (heure normale et Ramadan) | `packages/shared/test` |
| Extraction listes / fiches (fixtures), prix, vendeurs, URL et SSRF, robots.txt, politesse et blocages, déduplication et variantes | `packages/scraper/test` |
| Filtres obligatoires vs préférences, critères multiples, score, historique, règles d'alerte | `packages/scoring/test` |
| Format Telegram, erreurs et masquage du jeton, idempotence, reprise avec backoff | `packages/notifications/test` |
| Auth (scrypt, sessions, limitation), CRUD critères, verrou anti-chevauchement | `packages/database/test` |
| Collecte complète, absence d'alertes en double, échec sans perte, politique d'absence, persistance après redémarrage, rattrapage, demandes manuelles | `apps/worker/test` |
| Export CSV/XLSX (injection de formules), filtres d'URL | `apps/web/test` |
| Parcours navigateur : connexion, pages, CRUD critère, exports | `scripts/e2e-smoke.mjs` |

Les fixtures HTML de `packages/scraper/fixtures/synthetic` sont **écrites à la
main** d'après le texte observé sur le site ; elles ne remplacent pas une
validation sur de vraies pages.

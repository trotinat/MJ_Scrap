# Marjane Deals Watcher

Mise à jour précision et interface : [notes du 16 octobre 2026](docs/ACCURACY-UPDATE.md).
Les correspondances personnelles exigent des attributs vérifiables ; les promotions générales restent une sélection à explorer.

Surveillance autonome des promotions de [Marjane Mall](https://www.marjanemall.ma/) :
collecte deux fois par jour (09:00 et 18:00, heure du Maroc), historique des
prix, correspondance avec vos critères de recherche, classement des offres et
alertes Telegram. Interface en français, montants en dirhams (MAD).

> **État de validation** — tests unitaires et d'intégration PostgreSQL, compilation
> optimisée et inspection navigateur sur téléphone et ordinateur. La collecte
> en direct a été exercée le 16 octobre 2026 : certaines pages restent partiellement
> lisibles. La couverture limitée est signalée et ne prouve jamais qu'une offre
> a disparu. Utilisez `probe` pour vérifier les pages depuis votre serveur.

## Ventes flash et critères recommandés

- **Ventes flash** (menu de gauche) : tous les produits affichés sur les pages
  promotionnelles suivies (`/ventes-flash`, `/destockage`… réglables dans
  Paramètres) lors de la dernière collecte réussie, avec la remise annoncée,
  l'évolution observée et les critères auxquels chaque produit correspond.
  Ces pages sont collectées même sans aucun critère.
- **Critères recommandés** : au premier démarrage, cinq critères actifs sont
  ajoutés (Adidas Homme pointure 42, Ventes flash -40 % et plus, Smart TV 55"
  4K, casques & écouteurs, friteuse sans huile). Un bouton sur « Mes critères
  de recherche » rajoute ceux qui manquent.

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

## Tester sur votre ordinateur sans Docker (Windows, macOS, Linux)

Sous Windows, le plus simple : double-cliquez sur `scripts/windows/Installer Marjane Deals Watcher.bat`
(copiez-le sur le Bureau). Il installe, met à jour, compile et démarre la version optimisée.


Prérequis : Node.js 22 LTS et Git. **PostgreSQL n'a pas besoin d'être installé** :
un PostgreSQL embarqué (paquet npm `embedded-postgres`) tourne depuis le dossier
du projet, sans droits administrateur.

```bash
git clone https://github.com/trotinat/MJ_Scrap.git
cd MJ_Scrap
corepack enable          # active pnpm
pnpm install
pnpm setup:browser       # Chromium pour les listes rendues en JavaScript
pnpm start:local         # base embarquée + migrations + tableau de bord + worker (mode développement)
pnpm start:prod          # idem, version compilée et optimisée (recompilée seulement après une mise à jour)
```

Au premier lancement, `start:local` crée `.env` et affiche l'e-mail et le mot de
passe du tableau de bord. Ouvrez http://localhost:3000. `Ctrl+C` arrête tout ;
les données restent dans `.localdb/`. Test réel du scraper :
`pnpm probe` (dans un second terminal, pendant que `start:local` tourne).

Pour utiliser votre propre PostgreSQL, mettez son adresse dans `DATABASE_URL`
(fichier `.env`) : la base embarquée n'est alors pas démarrée.

## Tester sur votre ordinateur (Docker Desktop)

```bash
git clone https://github.com/trotinat/MJ_Scrap.git && cd MJ_Scrap
cp .env.example .env    # DOMAIN=localhost, mots de passe, ADMIN_EMAIL / ADMIN_PASSWORD, Telegram (facultatif)
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
docker compose run --rm migrate node dist/cli.js probe     # test réel du scraper
```

Ouvrez http://localhost:3000. Arrêt : `docker compose down` (les données restent dans le volume).

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

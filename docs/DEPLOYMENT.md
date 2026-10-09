# Déploiement sur un VPS Ubuntu (22.04 / 24.04)

Ressources conseillées : 2 vCPU, 2 Go de RAM minimum (Chromium headless),
20 Go de disque. Tout tourne dans Docker Compose : PostgreSQL, migrations,
worker, application web, Caddy (HTTPS) et sauvegardes.

## 1. DNS

Chez votre registrar, créez un enregistrement **A** (et **AAAA** si IPv6)
`deals.votredomaine.ma → IP du VPS`. Vérifiez : `dig +short deals.votredomaine.ma`.
Caddy n'obtiendra le certificat qu'une fois le DNS propagé.

## 2. Préparer le serveur

```bash
ssh root@IP_DU_VPS
adduser deploy && usermod -aG sudo deploy
# (copiez votre clé SSH dans /home/deploy/.ssh/authorized_keys, puis reconnectez-vous en "deploy")

sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl git ufw unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Pare-feu

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

PostgreSQL, le worker (8081) et l'application web (3000) ne sont **pas**
exposés : seuls 80/443 (Caddy) le sont.

> Docker publie ses ports en contournant UFW ; c'est pourquoi le
> `docker-compose.yml` ne publie que les ports de Caddy.

## 3. Installer Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
newgrp docker
docker compose version
```

## 4. Récupérer le projet et configurer

```bash
git clone https://github.com/trotinat/MJ_Scrap.git ~/marjane-deals-watcher
cd ~/marjane-deals-watcher
cp .env.example .env
chmod 600 .env
nano .env
```

À renseigner : `DOMAIN`, `ACME_EMAIL`, `POSTGRES_PASSWORD`
(`openssl rand -base64 32 | tr -d '/+=' | cut -c1-32`), `ADMIN_EMAIL`,
`ADMIN_PASSWORD` (10 caractères minimum), `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID` (voir [TELEGRAM.md](TELEGRAM.md)).

## 5. Démarrer

```bash
mkdir -p backups
docker compose up -d --build
docker compose ps
```

Ordre de démarrage : `db` (sain) → `migrate` (migrations + création de
l'administrateur, puis s'arrête avec le code 0) → `worker` et `web` → `caddy`.

Vérifications :

```bash
docker compose logs migrate                 # "migrations appliquées", "administrateur initial créé"
docker compose logs worker | tail            # "planificateur démarré" avec nextRunAt
curl -s https://deals.votredomaine.ma/api/health   # {"status":"ok"}
```

Ouvrez `https://deals.votredomaine.ma`, connectez-vous, puis retirez
`ADMIN_PASSWORD` du `.env` (le compte est déjà créé).

## 6. Valider le scraper en conditions réelles (obligatoire)

```bash
docker compose run --rm migrate node dist/cli.js probe
```

La commande lit robots.txt, extrait une page catégorie et une sous-catégorie
(avec Chromium si nécessaire) puis deux ou trois fiches produit, affiche ce
qui a été extrait et **termine en erreur** si quelque chose échoue. Les pages
HTML brutes sont enregistrées dans `packages/scraper/fixtures/live/` (dans le
conteneur ; ajoutez `-v $PWD/fixtures-live:/app/packages/scraper/fixtures/live`
pour les récupérer) et peuvent servir de fixtures de régression.

Ensuite :

1. créez vos critères (ou « Ajouter les exemples » puis adaptez-les et activez-les) ;
2. **Historique des collectes → Lancer une collecte maintenant** ;
3. contrôlez le résultat et les erreurs éventuelles dans la même page ;
4. **Notifications → Envoyer une notification de test**.

Test de bout en bout de l'interface (depuis une machine avec Node 22) :

```bash
pnpm install && BASE_URL=https://deals.votredomaine.ma E2E_EMAIL=… E2E_PASSWORD=… node scripts/e2e-smoke.mjs
```

## 7. Planification

Le worker exécute les collectes à **09:00 et 18:00, heure du Maroc**
(`Africa/Casablanca`, variable `SCRAPE_TIMES`). Le fuseau est passé
explicitement au planificateur (croner) qui s'appuie sur la base IANA
incluse dans Node : le passage à UTC+0 pendant le Ramadan est pris en compte
(vérifié par les tests). L'horloge système du VPS peut rester en UTC.

- Les collectes ne se chevauchent jamais (verrou consultatif PostgreSQL).
- Après un arrêt, si une collecte prévue a été manquée depuis moins de 6 h,
  elle est rattrapée une fois au redémarrage.
- Une collecte interrompue par un redémarrage est marquée « interrompue » ;
  les relevés déjà enregistrés sont conservés.
- Le worker tourne indépendamment du navigateur : fermer votre PC ou vous
  déconnecter n'a aucun effet.

## 8. Mises à jour

```bash
cd ~/marjane-deals-watcher
./scripts/backup.sh               # sauvegarde avant mise à jour
git pull
docker compose up -d --build      # "migrate" applique les nouvelles migrations (additives)
docker image prune -f
```

Les migrations Drizzle sont versionnées dans `packages/database/drizzle/`,
appliquées dans une transaction et protégées par un verrou ; elles ne
suppriment pas de données lors des mises à jour ordinaires.

## 9. Sauvegardes et restauration

**Politique** : le service `backup` exécute `pg_dump` chaque jour à 02:30 UTC
(03:30 au Maroc). Chaque archive est vérifiée (`pg_restore --list`) avant
d'être publiée dans `backups/daily/`. Rétention : 14 sauvegardes quotidiennes
et 8 hebdomadaires (copie du dimanche dans `backups/weekly/`), réglables via
`BACKUP_KEEP_DAILY` / `BACKUP_KEEP_WEEKLY`.

Sauvegarde manuelle : `./scripts/backup.sh`

Restauration (arrête web + worker, restaure en une transaction, redémarre) :

```bash
./scripts/restore.sh backups/daily/mdw-20261009T023000Z.dump
```

**Copie hors serveur** (recommandé) : synchronisez `backups/` vers un autre
stockage, par ex. `rclone sync backups remote:marjane-backups` dans une
crontab de l'hôte.

**Tester la restauration** régulièrement (procédure vérifiée lors du
développement : sauvegarde → restauration dans une base vide → mêmes
volumes de données) :

```bash
docker compose exec -T db createdb -U mdw mdw_verif
docker compose exec -T -e PGDATABASE=mdw_verif backup /bin/sh /scripts/restore-db.sh /backups/daily/<fichier>.dump
docker compose exec -T db dropdb -U mdw mdw_verif
```

## 10. Journaux et santé

- Journaux JSON structurés : `docker compose logs -f worker web caddy`.
- Rotation : 5 fichiers de 10 Mo par service (pilote `json-file`).
- Santé : `docker compose ps` (healthchecks), `GET /api/health` (web, public,
  sans détail), `GET http://worker:8081/health` (réseau interne : base,
  planificateur, prochaine collecte, dernière collecte).
- Page **Administration et santé** du tableau de bord : battement du worker,
  prochaine collecte, volumes, dernières erreurs.

## 11. Sécurité — récapitulatif

- Secrets uniquement dans `.env` (permissions 600, ignoré par Git).
- Tableau de bord entièrement protégé par authentification ; mots de passe
  hachés avec scrypt ; sessions aléatoires stockées hachées, cookie
  `__Host-` `HttpOnly` `Secure` `SameSite=Lax`, expiration 7 jours.
- Limitation des tentatives de connexion (5 échecs / 15 min par IP).
- Actions serveur Next.js : contrôle d'origine intégré (CSRF) ; en-têtes de
  sécurité (CSP `frame-ancestors 'none'`, `X-Frame-Options`, HSTS via Caddy).
- Le scraper ne contacte que `https://www.marjanemall.ma` (liste blanche),
  y compris pour les chemins saisis dans les critères (protection SSRF).
- Contenu extrait affiché comme texte (aucun HTML injecté) ; exports protégés
  contre l'injection de formules.
- Conteneurs non-root (`node`, `pwuser`), limites mémoire/CPU.

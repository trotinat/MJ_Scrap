# GitHub push deployment to the Hetzner VPS

The `Deploy VPS` GitHub Actions workflow deploys pushes to `feat/profil-destockage-ui`, `feat/urban-jungle-connector`, and `main`. It builds the Docker images on the VPS, applies database migrations, and restarts the web and scraping worker. Pull requests do not deploy.

PostgreSQL uses the named Docker volume `pgdata`. Normal deployments do not remove volumes; the deploy script also saves a database dump before applying migrations. The backup service continues writing daily dumps under `backups/daily/`.

## One-time VPS setup

Run these steps after SSH access to the new server is working. Do not put the contents of `.env` or a private SSH key into the repository.

1. Install Docker Engine and the Compose plugin and Git on Ubuntu. Add the `deploy` account to the `docker` group so GitHub Actions can run Compose commands. Docker group access is effectively administrator access, so use a dedicated deploy SSH key and keep it in the repository's Actions secrets.
2. Clone the repository at `/home/deploy/marjane-app`, initially checking out `feat/urban-jungle-connector`:

   ```bash
   git clone --branch feat/urban-jungle-connector https://github.com/trotinat/MJ_Scrap.git /home/deploy/marjane-app
   cd /home/deploy/marjane-app
   ```

3. Create `/home/deploy/marjane-app/.env` from `.env.example`, then set a unique `POSTGRES_PASSWORD`, `DOMAIN=142.132.170.114`, `COOKIE_SECURE=true`, your admin email/password, and any Telegram settings. Keep the file owned by `deploy` with mode `600`. The local `.env` file is ignored by Git and stays on the VPS.
4. Start the stack with Docker Compose. Caddy obtains and renews a short-lived HTTPS certificate for the IP, and the worker stores collected data in PostgreSQL's persistent volume:

   ```bash
   cd /home/deploy/marjane-app
   chmod 600 .env
   docker compose up -d --build db backup worker web caddy
   ```

   Open `https://142.132.170.114` in a browser. Do not open database port 5432 or app port 3000 in the Hetzner firewall.

## Actions secrets

In the GitHub repository, open **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | `142.132.170.114` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | Private half of a dedicated deploy key authorized for the `deploy` account |
| `DEPLOY_KNOWN_HOSTS` | Pinned SSH host-key line for this VPS, obtained after verifying the host key on the first SSH connection |

The workflow uses the pinned host key and refuses to connect if any secret is missing. Keep the private key in Actions secrets only; never commit it or paste it into chat. The public key belongs in the VPS account's `~deploy/.ssh/authorized_keys`.

After the workflow file and secrets are present on GitHub, each push to a supported branch triggers a deployment. The workflow serializes deployments so two pushes cannot build or migrate at the same time.

## Move existing local collection history

The named `pgdata` volume keeps VPS data through app rebuilds and restarts. The local launcher can keep older user and criteria rows in a separate database inside `.localdb`, so a direct database restore may not include all local history. The repo does not yet have a supported local-to-VPS import command. Keep the local app running until we prepare and verify that one-time import; never restore a local snapshot over new server-side collections.

After import, daily backups and a pre-deploy dump protect the VPS database.
## Operations

```bash
cd /home/deploy/marjane-app
docker compose ps
docker compose logs -f worker
docker compose exec -T backup /bin/sh /scripts/backup-db.sh
```

Never use `docker compose down -v` for routine deployments; `-v` deletes the persistent PostgreSQL volume.

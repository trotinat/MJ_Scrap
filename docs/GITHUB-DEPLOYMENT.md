# GitHub push deployment to the Hetzner VPS

The `Deploy VPS` GitHub Actions workflow deploys pushes to `feat/profil-destockage-ui` and `main`. It builds the Docker images on the VPS, applies database migrations, and restarts the web, worker, and Telegram bot containers. Pull requests do not deploy.

PostgreSQL uses the named Docker volume `pgdata`. Normal deployments do not remove volumes; the deploy script also saves a database dump before applying migrations. The backup service continues writing daily dumps under `backups/daily/`.

## One-time VPS setup

Run these steps after SSH access to the new server is working. Do not put the contents of `.env` or a private SSH key into the repository.

1. Install Docker Engine and the Compose plugin, Git, and Tailscale on Ubuntu. Add the `deploy` account to the `docker` group so GitHub Actions can run Compose commands. Docker group access is effectively administrator access, so use a dedicated deploy SSH key and keep it in the repository's Actions secrets.
2. Clone the repository at `/opt/marjane-deals-watcher`, initially checking out `feat/profil-destockage-ui`:

   ```bash
   sudo mkdir -p /opt/marjane-deals-watcher
   sudo chown deploy:deploy /opt/marjane-deals-watcher
   git clone --branch feat/profil-destockage-ui https://github.com/trotinat/MJ_Scrap.git /opt/marjane-deals-watcher
   cd /opt/marjane-deals-watcher
   ```

3. Create `/opt/marjane-deals-watcher/.env` from `.env.example`, then set a unique `POSTGRES_PASSWORD`, `DOMAIN=localhost`, `COOKIE_SECURE=true`, your admin email/password, and any Telegram settings. Keep the file owned by `deploy` with mode `600`. The local `.env` file is ignored by Git and stays on the VPS.
4. Start the stack once with the Tailscale Compose override. `caddy` stays disabled and the web service binds only to `127.0.0.1:3000`:

   ```bash
   cd /opt/marjane-deals-watcher
   chmod 600 .env
   docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d --build
   ```

5. Join this VPS to your Tailscale network, then enable Tailscale Serve for the app:

   ```bash
   sudo tailscale serve --bg --https=443 http://127.0.0.1:3000
   sudo tailscale serve status
   ```

   Open the resulting `https://<machine>.<tailnet>.ts.net` address on a phone signed in to the same tailnet. Do not open database port 5432 or app port 3000 in the Hetzner firewall.

## Actions secrets

In the GitHub repository, open **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | `142.132.170.114` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | Private half of a dedicated deploy key authorized for the `deploy` account |
| `DEPLOY_KNOWN_HOSTS` | Pinned SSH host-key line for this VPS, obtained after verifying the host key on the first SSH connection |

The workflow uses the pinned host key and refuses to connect if any secret is missing. Keep the private key in Actions secrets only; never commit it or paste it into chat. The public key belongs in the VPS account's `~deploy/.ssh/authorized_keys`.

After the workflow file and secrets are present on GitHub, each push to `feat/profil-destockage-ui` or `main` triggers a deployment. The workflow serializes deployments so two pushes cannot build or migrate at the same time. The first deploy can be started from **Actions → Deploy VPS → Run workflow**.

## Move existing local collection history

The named `pgdata` volume keeps VPS data through app rebuilds and restarts. The local launcher can keep older user and criteria rows in a separate database inside `.localdb`, so a direct database restore may not include all local history. The repo does not yet have a supported local-to-VPS import command. Keep the local app running until we prepare and verify that one-time import; never restore a local snapshot over new server-side collections.

After import, daily backups and a pre-deploy dump protect the VPS database.
## Operations

```bash
cd /opt/marjane-deals-watcher
docker compose -f docker-compose.yml -f docker-compose.tailscale.yml ps
docker compose -f docker-compose.yml -f docker-compose.tailscale.yml logs -f worker
docker compose -f docker-compose.yml -f docker-compose.tailscale.yml exec -T backup /bin/sh /scripts/backup-db.sh
```

Never use `docker compose down -v` for routine deployments; `-v` deletes the persistent PostgreSQL volume.

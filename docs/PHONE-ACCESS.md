# Private phone access with Tailscale

1. Keep this PC awake, connected, and running `pnpm start:local`.
2. Sign into Tailscale on the PC and phone using the same account.
3. Build the web app in its isolated `.next-check` directory and start the production web server on `127.0.0.1:3002`. The development server can continue on port 3000.
4. Point Tailscale Serve at the built server: `& 'C:/Program Files/Tailscale/tailscale.exe' serve --bg --https=443 http://127.0.0.1:3002`.
5. Open `https://deals.taile7bea0.ts.net/` in the phone browser, with Tailscale connected. This works over mobile data too.
5. Sign into the app with your existing app account. Initial administrator values are in the local `.env` file (`ADMIN_EMAIL` / `ADMIN_PASSWORD`); do not share that file.

Only Tailscale Serve is configured; public Funnel is not enabled. The backend stays on loopback. Remote/proxy requests must authenticate, even if a proxy rewrites Host to localhost. Remote login cookies use Secure. Direct-local bypass remains subject to the launcher's existing AUTH_DISABLED setting.

Status: `& 'C:/Program Files/Tailscale/tailscale.exe' serve status`
Stop private serving: `& 'C:/Program Files/Tailscale/tailscale.exe' serve --https=443 off`

Serve runs in the background; the app itself still needs to be running. No router port forwarding or public firewall opening is needed. Phone connectivity over mobile data requires a user check on the phone.

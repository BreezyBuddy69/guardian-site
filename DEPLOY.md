# Deploy — Hostinger VPS (halovisionai.cloud)

Same pattern as the other sites in this repo (sable, ai-company, halo4, ...):
shared Traefik reverse proxy on the external `traefik-proxy` Docker network,
TLS via the `letsencrypt` certresolver. See `docker-compose.yml`'s header
for the exact subdomain/port map.

**Not yet done automatically**: this session has no SSH credentials to the
VPS, so nothing below has actually been run against it — the site is only
verified working locally (`node server/index.js`, confirmed 200s on `/`,
`/style.css`, `/healthz`, `/downloads/Guardian-Setup.exe`) and the
Dockerfile/compose file follow the exact proven pattern the other sites
already use in production, but the image itself hasn't been build-tested
(no Docker on this dev machine either). Budget 10 minutes to actually push
this live.

## 1. Prerequisites (should already be true on this VPS)

- Docker + the `traefik-proxy` external network already exist. Verify:
  `docker network ls | grep traefik-proxy`.
- DNS: `guardian.halovisionai.cloud` needs to resolve to the VPS. If you
  already have a wildcard `*.halovisionai.cloud` A record (likely, given
  the other `*.halovisionai.cloud` sites), this just works with no new
  DNS entry.

## 2. Get the code onto the server

```bash
git clone https://github.com/BreezyBuddy69/guardian-site.git
cd guardian-site
```

`public/downloads/*.exe` is gitignored (86MB, same call as `websites/sable`
made for its installer) — copy it up separately before building:

```bash
scp Guardian/release/Guardian-Setup.exe user@vps:guardian-site/public/downloads/
```

## 3. Build and start

No secrets, no `.env` — this is a static marketing page with a public
installer download, nothing to configure.

```bash
docker compose up -d --build
docker compose ps        # "healthy" within ~15s
```

Reachable at:
- `https://guardian.halovisionai.cloud` (Traefik/TLS)
- `http://<VPS_IP>:47850` (direct, no TLS — useful before DNS/Traefik works)

Port `47850` was picked to avoid every other port already in use in this
repo (47821/47831-34/47842, 8082 — see the other sites' `docker-compose*.yml`).

## 4. Updating the installer later

The site serves whatever's at `public/downloads/Guardian-Setup.exe` at
build time — there's no separate upload step. Rebuild `Guardian/` (`npm run
dist` in that folder), copy the new `Guardian/release/Guardian-Setup.exe`
over this one, then `docker compose up -d --build` again.

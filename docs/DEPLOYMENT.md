# Deployment

Target: a single Ubuntu VPS running Docker Compose, per Section 23 of the
build spec. This covers going from a fresh VPS to a running instance —
it does not cover multi-host/Kubernetes setups.

## 1. Prerequisites

- Ubuntu 22.04+ VPS with a public IP
- A domain (or subdomain) pointed at the VPS's IP via an A record
- Docker + Docker Compose plugin installed (this guide assumes
  `docker compose`, not the legacy `docker-compose`)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in for the group change to apply
```

## 2. Clone and configure

```bash
git clone <your-repo-url> video-downloader
cd video-downloader
cp .env.example .env
```

Edit `.env`:

- `POSTGRES_PASSWORD` — generate a real secret (`openssl rand -base64 24`)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — real credentials, not the defaults
- `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` — your real domain, e.g. `https://reel.example.com`
- `MAX_VIDEO_SIZE_MB`, `MAX_PROCESSING_TIME_SECONDS`, `RATE_LIMIT_PER_MINUTE`, `MAX_CONCURRENT_JOBS_PER_IP` — tune to your VPS's bandwidth/CPU
- `JOB_RETRY_ATTEMPTS`, `JOB_RETRY_BACKOFF_MS` — how many times a transient processing failure is retried before giving up (permanent failures like an unsupported source are never retried, regardless of this setting)
- `LOG_LEVEL` — `info` by default; set to `debug` for more verbose logs while diagnosing an issue
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — leave unset to disable error tracking entirely (default); set to enable optional Sentry integration across all three services
- `METRICS_PORT` — the worker's dedicated `/metrics` port (default 9091), reachable within the Docker network for a Prometheus container on the same network — see `apps/worker/README.md` for the caveat on scraping multiple worker replicas
- `RATE_LIMIT_DOWNLOAD_PER_MINUTE`, `RATE_LIMIT_POLLING_PER_MINUTE` — per-endpoint rate-limit tiers alongside `RATE_LIMIT_PER_MINUTE` (Phase 13) — see `apps/api/README.md` for why job-status polling needs its own, much higher limit

**Never commit `.env`.** It's already in `.gitignore`.

## 3. TLS (required for the admin dashboard)

`docker/nginx/nginx.conf` in this repo terminates plain HTTP only. For a
real deployment, put TLS in front of it — the simplest path is
[Caddy](https://caddyserver.com/) as a second reverse proxy in front of
the existing nginx container, or swap nginx for Caddy directly, since
Caddy automates Let's Encrypt certificates with no extra config. If you
keep nginx, use `certbot --nginx` after adjusting `nginx.conf` to listen
on 443 with a certificate.

Do not expose `/api/admin/*` over plain HTTP in production — Basic Auth
credentials are only as safe as the transport they travel over.

## 4. Build and start

```bash
docker compose up -d --build
```

This builds `web`, `api`, and `worker`, and starts `postgres`, `redis`,
and `nginx`. First boot takes a few minutes (installing `yt-dlp` and
`ffmpeg` in the `api`/`worker` images, generating the Prisma client).

## 5. Run migrations

```bash
docker compose exec api npx prisma migrate deploy --schema=/app/packages/database/prisma/schema.prisma
```

(Or run `npm run db:migrate` from a machine with `DATABASE_URL` pointed
at the VPS's Postgres, if you prefer not to exec into the container.)

## 6. Verify

- `https://your-domain/` — homepage loads, hero renders
- `https://your-domain/api/video/analyze` — `POST` a public video URL, get back real metadata
- `https://your-domain/admin` — sign in with `ADMIN_USERNAME`/`ADMIN_PASSWORD`, see live stats

## 7. Scaling workers

Media processing (yt-dlp + FFmpeg) is CPU/bandwidth-bound and runs in
`apps/worker`, independently of `apps/api`:

```bash
docker compose up -d --scale worker=3
```

Each worker picks up jobs from the shared BullMQ queue in Redis — no
other coordination needed. Workers share the `temp_processing` Docker
volume with the API container so completed files are visible for
streaming regardless of which worker produced them.

## 8. Updating

```bash
git pull
docker compose up -d --build
docker compose exec api npx prisma migrate deploy --schema=/app/packages/database/prisma/schema.prisma
```

## 9. Logs / troubleshooting

```bash
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f nginx
```

A job stuck in `processing` for far longer than `MAX_PROCESSING_TIME_SECONDS`
will be caught and failed by the worker's own cleanup sweep within a few
minutes (see `apps/worker/README.md`) — no manual intervention needed.

## What this guide doesn't cover

- Horizontal scaling of `api` or `postgres`/`redis` themselves (this spec
  targets a single VPS)
- Backups — `postgres_data` is a named Docker volume; snapshotting it or
  running `pg_dump` on a schedule is on you
- CDN/edge caching in front of `web`

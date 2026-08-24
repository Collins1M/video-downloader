# apps/api

NestJS + TypeScript + Prisma + BullMQ REST API.

- [x] Phase 2: Prisma schema (`DownloadJob`) — lives in `packages/database`
- [x] Phase 3: REST endpoints — see `src/video/`
- [x] Phase 4: URL validation, SSRF protection, rate limiting — see `src/common/security/`
- [x] Phase 5: BullMQ queue wiring — see `src/queue/`
- [x] Phase 6: Real yt-dlp-backed analyze + file-streaming endpoint
- [x] Phase 8: Admin dashboard (`/admin/*`, Basic Auth) — see `src/admin/`
- [x] Phase 9: `/health` endpoint, multi-stage Dockerfile, CI
- [x] Phase 10: Jest — guard unit tests + full e2e suite
- [x] Phase 11: retry/backoff, anonymous session cookie, graceful degradation — see below
- [x] Phase 12: structured logging, request correlation, optional Sentry, Prometheus `/metrics` — see below
- [x] Phase 13: helmet, split per-endpoint rate limits, CSP (on apps/web) — see below

## Security hardening (Phase 13)

**helmet.** Baseline headers (`X-Content-Type-Options: nosniff`,
`X-DNS-Prefetch-Control: off`, etc.) via `helmet()` in `main.ts`. Two
deliberate deviations from helmet's defaults: `contentSecurityPolicy` is
disabled here (this is a JSON/file API, not an HTML-serving app — CSP
belongs on `apps/web`, see its `next.config.js`), and
`crossOriginResourcePolicy` is explicitly set to `cross-origin` (the
frontend legitimately fetches this API cross-origin — different port in
local dev — and access is already controlled by the CORS allowlist, not
CORP; helmet's stricter default would otherwise block those same
legitimate requests).

**Split rate-limit tiers.** Fixed a real, already-shipped bug in this
pass: a single global limiter (default `RATE_LIMIT_PER_MINUTE=10`)
applied uniformly to every route, including job-status polling — but
the frontend polls `GET /video/jobs/:id` every 1.2s while a download is
active (~50 req/min). Any download running longer than ~12 seconds
would have started failing with 429s mid-progress. Now three
independent named tiers (`src/app.module.ts`): `general`
(`RATE_LIMIT_PER_MINUTE`, applies to `/video/analyze` and file
downloads), `download` (`RATE_LIMIT_DOWNLOAD_PER_MINUTE`, stricter —
the most expensive operation), and `polling`
(`RATE_LIMIT_POLLING_PER_MINUTE`, default 120/min — comfortable
headroom over the frontend's actual polling rate). `VideoController` is
`@SkipThrottle()`'d at the class level and each route explicitly opts
into exactly one tier via `@Throttle({ tierName: {} })`, so there's no
route that's un-throttled or double-throttled by accident.

## Observability (Phase 12)

**Structured logging.** `nestjs-pino` replaces Nest's default console
logger — every `new Logger("X")` call throughout the codebase
automatically becomes structured JSON via `app.useLogger()` in
`main.ts`, no per-file changes needed. Pretty-printed in development,
raw JSON in production. `LOG_LEVEL` controls verbosity (default `info`).
Authorization/Cookie headers are redacted from logs even at debug level.

**Request correlation.** Every request gets an `X-Request-Id` (reused
from an incoming header if present — e.g. set by nginx — otherwise
generated), echoed back in the response and attached to every log line
for that request via pino-http. For `POST /video/download`, this id is
threaded into the BullMQ job payload as `requestId` and persisted on the
`DownloadJob` row, so a single id traces a browser request through api
logs → the queue → worker logs (see `apps/worker` README).

**Sentry (optional).** Set `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` to
enable — unset by default, and the app runs identically either way; no
Sentry account is ever required. Only genuinely unexpected errors are
captured (the `AllExceptionsFilter`'s catch-all branch) — the app's own
`AppException` taxonomy (`INVALID_URL`, `VIDEO_UNAVAILABLE`, etc.)
represents expected, user-facing outcomes, not bugs, and is deliberately
never sent to Sentry.

**Metrics.** `GET /metrics` (not under `/api`, same Basic Auth as
`/admin/*`) exposes Prometheus exposition format: default Node.js
process metrics, `api_http_requests_total`/`api_http_request_duration_seconds`
(tracked in-process via an interceptor), and `download_jobs_by_status`
(a gauge recomputed from Postgres on every scrape, since job completion
happens in the worker — a separate process — not here).

## Reliability (Phase 11)

**Job retries.** `JOB_RETRY_ATTEMPTS`/`JOB_RETRY_BACKOFF_MS` (default 3
attempts, exponential backoff starting at 15s) are set on every enqueued
job. The worker (see `apps/worker` README) classifies failures as
permanent (unsupported source, video unavailable, file too large,
blocked URL, format no longer available — retrying can't change these)
or transient (timeout, ambiguous extraction error) and only lets BullMQ
retry the transient kind.

**No orphaned rows.** `VideoService.createDownload` creates the Postgres
row *then* enqueues the BullMQ job. If enqueueing fails or times out
(5s bound — see `common/with-timeout.ts`; BullMQ's recommended Redis
config would otherwise retry indefinitely rather than fail fast), the
row is immediately marked `failed` instead of sitting as `queued`
forever with nothing to process it.

**Anonymous session cookie.** `common/security/session-id.middleware.ts`
sets an HttpOnly `session_id` cookie (30-day expiry) on first contact,
read via `@SessionId()` on `POST /video/download`, and stored on the
`DownloadJob` row (Section 17: "job tracking"). This is descriptive
only — it does not gate access to anything, and rate limiting /
concurrent-job limits stay IP-based per Section 14. Requires
`credentials: true` on CORS and `credentials: 'include'` on the
frontend's fetches for the cookie to round-trip cross-origin in local
dev.

**Redis observability.** Both the API's queue connection and the
worker's now log `error`/`reconnecting`/`ready` events — a Redis outage
is visible in logs rather than silent while ioredis retries in the
background.

## Testing

Uses **Jest**, not Vitest like the rest of the monorepo — NestJS's DI
relies on `emitDecoratorMetadata`, which Vitest's esbuild transform
doesn't reproduce correctly for constructor injection; `ts-jest` uses
the real TypeScript compiler and gets it right.

- `src/common/security/concurrent-jobs.guard.spec.ts`,
  `src/admin/basic-auth.guard.spec.ts` — pure unit tests, guards
  constructed directly with mocked dependencies, no real DB needed.
- `src/video/video.e2e-spec.ts`, `src/admin/admin.e2e-spec.ts`,
  `src/health/health.e2e-spec.ts` — full HTTP integration tests via
  `supertest` against a really-bootstrapped Nest app. **Require a real
  Postgres and Redis** — `MediaAnalyzer` is stubbed (no yt-dlp needed),
  and `UrlValidatorService` is stubbed for most tests (deterministic, no
  real DNS) except a dedicated SSRF-integration suite that uses the real
  validator end-to-end against `127.0.0.1`/`10.0.0.5`, which needs no
  external network since those are local/private addresses.

```bash
npm test  # guard units + e2e — e2e needs DATABASE_URL/REDIS_URL pointed at real services
```

## Endpoints

All routes are prefixed with `/api`.

| Method | Path | Status |
|---|---|---|
| POST | `/video/analyze` | Live — URL-validated, runs real yt-dlp extraction |
| POST | `/video/download` | Live — validates URL, checks concurrent-job limit, creates a `DownloadJob` row, enqueues a BullMQ job |
| GET | `/video/jobs/:id` | Live — reads job status/progress from Postgres |
| DELETE | `/video/jobs/:id` | Live — marks job cancelled, removes it from the queue if not yet started |
| GET | `/video/jobs/:id/file` | Live (Phase 6) — streams the completed file and deletes it once sent |
| GET | `/video/jobs/:id/events` | Live (Phase 14) — SSE stream of live job progress, replaces client-side polling |
| GET | `/health` *(not under `/api`)* | Live (Phase 9) — checks real Postgres connectivity, used by Docker's `HEALTHCHECK` |
| GET | `/docs` *(not under `/api`)* | Live (Phase 14) — Swagger UI, generated from the controllers' decorators |
| GET | `/docs/json` *(not under `/api`)* | Live (Phase 14) — the same document as raw OpenAPI 3 JSON |

Errors are always shaped as `{ success: false, message, code }` (see
`src/common/exceptions` and `src/common/filters`) — no stack traces, SQL
errors, or ffmpeg/yt-dlp logs ever reach the client (Section 18).

## Phase 6: analyze + file delivery

`src/video/yt-dlp-media-analyzer.ts` implements the `MediaAnalyzer`
interface using `@video-downloader/media-extractor`'s `analyzeUrl`,
translating extraction errors into the app's friendly exception
taxonomy. This is the same yt-dlp wrapper `apps/worker` uses at download
time, so a `formatId` returned by `/analyze` is guaranteed to be
something the worker's format resolver understands later.

`GET /video/jobs/:id/file` exists because of an architecture consequence
of the Phase 5 job-queue split: the worker processes files, but only the
API process holds the user's actual HTTP connection (Section 8's
diagram — `User → Next.js → NestJS API → ... → HTTP stream → User
device` — assumes one process does both). Once the worker marks a job
`completed`, the API locates its deterministic temp-file path (derived
the same way by both processes from `jobId` + `formatId`, no extra
coordination needed), streams it with `Content-Type` /
`Content-Disposition` / `Content-Length` headers, and deletes it as soon
as the response finishes — success or failure — so nothing outlives the
download itself (Section 9).

## Run locally

```bash
npm install
npm run db:generate
npm run db:migrate
npm run build:packages
npm run dev:api      # http://localhost:4000/api
npm run dev:worker    # in another terminal — analyze works without it, download needs it
```

Requires `yt-dlp` on `PATH` for `/video/analyze` to work (the Docker
image installs it; for local dev without Docker, `pip install yt-dlp`).

**Sandbox note:** in a dev environment with no network access to
Prisma's engine binary CDN, `npm run db:generate` (real `prisma
generate`) can't succeed. `./scripts/prisma-sandbox-stub.sh` (repo root)
recreates a hand-written stand-in at `node_modules/.prisma/client/`
matching this schema, so `apps/api`/`apps/worker` still typecheck and
their hermetic tests still run. Run it after every fresh `npm install`
in such an environment; a normal environment with CDN access should use
the real `npm run db:generate` instead and never needs this script.

## Health check

`GET /health` (not under `/api`) runs a real `SELECT 1` against Postgres
and returns 503 if the database is unreachable — this is what the
Docker image's `HEALTHCHECK` polls, and what `docker-compose.yml` uses
for `depends_on: condition: service_healthy` so `web` and `nginx` don't
start serving traffic before the API can actually talk to the database.

## Phase 14: SSE, legal pages, accessibility, Swagger

**Server-Sent Events (`GET /video/jobs/:id/events`).**
`QueueEventsService` wraps a dedicated BullMQ `QueueEvents` connection
(its own Redis subscriber, separate from the `BullModule`-managed
producer connection) and exposes progress/completed/failed as an
Observable, filtered per `jobId`. `JobExistsGuard` 404s before the
`@Sse()` handler opens its response — throwing from inside the
`Promise<Observable<...>>` an `@Sse()` method returns doesn't reliably
route through `AllExceptionsFilter`, because the SSE response has
already committed a 200 with `Content-Type: text/event-stream` by the
time that promise rejects. A guard runs earlier in the pipeline, before
that response opens, so it hits the exception filter correctly. The
frontend's `DownloaderPanel` uses `EventSource` instead of the old
`setInterval` poll — see `apps/web/README.md` for that side.

Because `QueueEventsService` connects to Redis eagerly (in
`onModuleInit`, unlike the lazy BullMQ producer connection), every
`*.e2e-spec.ts` file that bootstraps the full `AppModule` needed its
`afterAll` bumped to a 15s timeout — closing that connection against a
sandbox with no real Redis is slow. All three specs now have this bump.

**Swagger (`GET /docs`, `GET /docs/json`).** `apps/api/src/swagger.ts`
holds one `setupSwagger(app)` function called from both `main.ts` and
every e2e spec's manual app bootstrap — each spec constructs its own
Nest app independently of `main.ts`, so this needed replicating in all
three, the same class of gap that caused the Phase 12 `/metrics`
prefix-exclusion bug. The route was verified empirically, not assumed:
booted the compiled app against real local Postgres/Redis and curled
`/docs` (200), `/api/docs` (404, confirming it's outside the prefix as
intended), and `/docs/json` (valid OpenAPI JSON with `/api`-prefixed
paths for real controllers and un-prefixed `/health`) — see
`video.e2e-spec.ts`'s `describe("Swagger docs (e2e)", ...)` block, which
asserts the same three things as a permanent regression test.
`@nestjs/swagger@8` was used rather than the current v11+ line, since
this project is still on Nest v10 and v8 is the newest major with a
matching peer-dependency range.

**Legal pages and accessibility audit** live in `apps/web` — see
`apps/web/README.md` and `docs/ACCESSIBILITY.md`.

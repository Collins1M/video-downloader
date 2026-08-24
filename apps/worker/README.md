# apps/worker

BullMQ consumer that runs media-processing jobs off the API's
request/response cycle. Plain Node/TypeScript — no NestJS — since its only
job is to pull work off the `video-processing` queue, run yt-dlp + FFmpeg,
and update `DownloadJob` rows via the shared `@video-downloader/database`
client. Scales independently from `apps/api` (see `docker-compose.yml`'s
`worker` service — scale it with `docker compose up --scale worker=3`).

- [x] Phase 5: BullMQ queue consumer skeleton
- [x] Phase 6: yt-dlp extraction, FFmpeg merge/remux, streaming-ready temp files, cleanup
- [x] Phase 9: heartbeat-file health check, multi-stage Dockerfile
- [x] Phase 10: Vitest pipeline tests (mocked yt-dlp/ffmpeg/Prisma)
- [x] Phase 11: retry-aware failure handling, resilient error-path DB writes
- [x] Phase 12: structured logging, request correlation, optional Sentry, Prometheus metrics

## Observability (Phase 12)

**Structured logging** (`src/logger.ts`) via `pino` — every log line
during a job's processing is bound with `downloadJobId` and (if the job
was created via the API, which threads it through) `requestId`, so an
operator can grep one id and see the whole story: the original browser
request in api logs, the BullMQ job, and every step of processing here.
Pretty-printed in development, JSON in production, silent during tests.

**Metrics** (`src/metrics.ts`): since this process has no general HTTP
server by design (see below), a dedicated minimal server exposes exactly
one route, `GET /metrics` on `METRICS_PORT` (default 9091) — Prometheus
exposition format with default Node.js process metrics plus
`worker_jobs_processed_total`, `worker_jobs_failed_total`,
`worker_jobs_retried_total`, and `worker_job_processing_duration_seconds`.

Not exposed on a host port in `docker-compose.yml` — a fixed host port
would conflict across replicas under `docker compose up --scale
worker=3`. It's reachable within the Docker network at `worker:9091`
(a Prometheus container on the same network can reach it directly).
**Caveat, honestly**: Docker Compose's embedded DNS round-robins across
replicas for the plain `worker` hostname, so scraping multiple replicas'
individual metrics needs either static per-container targets (Compose
names scaled replicas `<project>-worker-1`, `-2`, etc., which *are*
individually resolvable) or Prometheus's `dns_sd_configs` — this is
operator-side Prometheus configuration, not something this repo sets up
for you.

**Sentry (optional).** Set `SENTRY_DSN` to enable (unset by default —
never required). Only genuinely unclassified errors are captured (see
`src/sentry.ts`) — the known permanent/transient failure taxonomy
represents expected outcomes, not bugs.

## Reliability (Phase 11)

`processVideoJob`'s catch block now distinguishes **permanent** failures
(`UnsupportedSourceError`, `VideoUnavailableError`, `FormatNotFoundError`,
`FileTooLargeError`, `UnsafeUrlError`) from **transient** ones
(`ExtractionTimeoutError`, ambiguous/unclassified errors):

- Permanent → throws BullMQ's `UnrecoverableError`, which skips
  remaining retry attempts entirely. Retrying a genuinely unsupported
  source or an already-known-oversized file just delays the user's
  (already-determined) result.
- Transient, retries remaining → the DB row goes back to `queued`
  (not `failed`) and this attempt's temp files are cleaned up, so the
  next attempt starts fresh. BullMQ handles the backoff delay.
- Transient, final attempt → marked `failed`, same as before.

Every DB write inside the failure path is now individually
`.catch()`-guarded and logged rather than left to throw — if Postgres is
*also* having a bad moment while a job is failing for an unrelated
reason, that doesn't turn into an unhandled rejection on top of the
original problem.

## Testing

`src/queue-processor.spec.ts` and `src/cleanup.spec.ts` mock every
external boundary — `@video-downloader/media-extractor` (yt-dlp),
`./ffmpeg`, `@video-downloader/security` (URL validation), and `./prisma`
(an in-memory fake store, since a real Prisma client needs network
access this environment doesn't reliably have) — while exercising the
*real* state-transition and cleanup logic against a real scratch temp
directory. Covers: video+audio merge, already-muxed remux, audio-only
extraction, cancelled-job short-circuit, format-not-found failure with
cleanup, and the file-size limit rejection. Fully hermetic — no Docker,
database, or network needed.

```bash
npm test
```

## Pipeline (Phase 6)

`processVideoJob` (`src/queue-processor.ts`), for each job:

1. Re-validates the source URL (`@video-downloader/security`) immediately
   before use — closes the DNS-rebinding gap between when the API first
   validated it and now.
2. Re-runs yt-dlp extraction (`fetchYtDlpInfo`) to get a fresh format list
   and re-resolves the user's chosen `formatId` against it
   (`resolveFormatTarget`) — stream URLs and format availability can
   change between analyze and download.
3. Fetches the resolved format(s) to a per-job temp directory
   (`safeTempJobDir`/`safeTempFilePath` — path-traversal-safe by
   construction).
4. Runs FFmpeg (`src/ffmpeg.ts`) to merge video+audio, remux an
   already-muxed source into a clean MP4, or extract/transcode audio to
   MP3 — `-c:v copy` avoids re-encoding video whenever possible (Section
   12).
5. Enforces `MAX_VIDEO_SIZE_MB` on the finished file and deletes it if
   over budget.
6. Marks the job `completed` with the real file size and a fresh
   `expiresAt`, or `failed` with a friendly, specific error message —
   and cleans up every temp file it wrote either way.

`src/cleanup.ts` runs every 5 minutes: deletes temp files + DB rows for
jobs past `expiresAt`, and fails+cleans up anything stuck in
queued/processing for more than 2x `MAX_PROCESSING_TIME_SECONDS` (a
DB-level backstop alongside BullMQ's own stalled-job recovery).

## What this does *not* do

This wraps [yt-dlp](https://github.com/yt-dlp/yt-dlp) — an external,
actively-maintained, open-source extractor — rather than implementing any
site-specific scraping or signature-cracking logic here. yt-dlp itself
does not circumvent DRM; it only works against publicly accessible,
non-DRM sources. This service inherits that same boundary and makes no
attempt to work around it (Section 27).

## Known limitations (honestly, not fixed in this scaffold)

- **Format-id stability**: the curated `formatId` (e.g. `"1080p-mp4"`) is
  re-derived from a fresh yt-dlp call at download time using the same
  selection logic used at analyze time. If a source's available formats
  materially change in between, the job fails cleanly with "format no
  longer available" rather than silently fetching the wrong thing — but
  it doesn't retry with a substitute quality.
- **Pre-download size checks** rely on yt-dlp reporting `filesize` or
  `filesize_approx` upfront; sources that don't report size are only
  caught by the *post*-download size check, after the bytes are already
  fetched once.
- **Progress reporting** is milestone-based (10% after extraction, 40/60%
  after each fetch, then FFmpeg's own progress within the remaining
  budget) rather than true byte-level progress across the whole pipeline.

## Run locally

```bash
npm install
npm run build:packages   # from repo root
npm run dev:worker       # from repo root
```

Requires `yt-dlp` and `ffmpeg` on `PATH` (the Docker image installs
both), plus `REDIS_URL`, `DATABASE_URL`, and `TEMP_DIR` in the
environment (see root `.env.example`).

## Health check

This process has no HTTP server, so Docker's `HEALTHCHECK` can't poll an
endpoint the way `api`'s does. Instead, `main.ts` writes the current
timestamp to `/tmp/worker-heartbeat` every 15 seconds; the healthcheck
just verifies that file was updated within the last 45 seconds. A
worker whose event loop is deadlocked (or that crashed without Docker
noticing) stops updating it and gets marked unhealthy.

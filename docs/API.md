# API Reference

Base URL: `/api` (behind nginx, the full path is `http://<host>/api`).

This is the hand-written reference — it covers things a generated spec
doesn't, like rate-limit tiers, SSE event shapes, and cross-doc pointers
into `docs/DEPLOYMENT.md`. A live, always-in-sync OpenAPI 3 document
generated straight from the running server's decorators is also
available at `GET /docs` (Swagger UI) and `GET /docs/json` (raw JSON),
both outside the `/api` prefix. Use this doc to understand *why*;
use `/docs` to try a request or get the exact current schema.

All error responses share one shape (Section 18 of the build spec):

```json
{ "success": false, "message": "Human-readable message.", "code": "INVALID_URL" }
```

`code` is one of: `INVALID_URL`, `UNSUPPORTED_SOURCE`, `VIDEO_UNAVAILABLE`,
`PROCESSING_FAILED`, `FILE_TOO_LARGE`, `TIMEOUT`, `RATE_LIMITED`,
`JOB_NOT_READY`, `FILE_EXPIRED`, `INTERNAL_ERROR`.

## Public endpoints

No authentication required. Subject to global rate limiting
(`RATE_LIMIT_PER_MINUTE`) and, for `/video/download`, a per-IP concurrent
job limit (`MAX_CONCURRENT_JOBS_PER_IP`).

Every response sets an HttpOnly `session_id` cookie on first contact
(30-day expiry) if one isn't already present. This is descriptive only —
used for job attribution/tracking (Section 17), not for auth or rate
limiting, which stay IP-based. Requests need `credentials: 'include'`
(browser `fetch`) for the cookie to round-trip cross-origin.

### `POST /video/analyze`

Request:
```json
{ "url": "https://example.com/video" }
```

Response (`200`):
```json
{
  "success": true,
  "video": { "title": "...", "thumbnail": "https://...", "duration": 272, "source": "example.com" },
  "formats": [
    { "id": "1080p-mp4", "type": "video", "container": "mp4", "resolution": "1080p", "estimatedSize": 47185920 },
    { "id": "128kbps-mp3", "type": "audio", "container": "mp3", "bitrateKbps": 128, "estimatedSize": 4350000 }
  ]
}
```

### `POST /video/download`

Request:
```json
{ "url": "https://example.com/video", "formatId": "1080p-mp4" }
```

Response (`201`): `{ "jobId": "clx1a2b3c..." }`

`formatId` must be one returned by a prior `/video/analyze` call for the
same URL — see `apps/worker/README.md`'s "known limitations" for what
happens if the source's formats changed in between.

### `GET /video/jobs/:id`

Response:
```json
{ "id": "clx1a2b3c...", "status": "processing", "progress": 60 }
```

`status` is one of `queued`, `processing`, `completed`, `failed`,
`cancelled`. `error` is present (a friendly message) when `status` is
`failed`.

### `DELETE /video/jobs/:id`

Cancels an active job. Returns the same shape as `GET /video/jobs/:id`
with `status: "cancelled"`.

### `GET /video/jobs/:id/events` (Phase 14)

Server-Sent Events (`text/event-stream`) — the live-progress alternative
to polling `GET /video/jobs/:id`. Emits the job's current status
immediately on connect, then one message per progress update, then a
final message once the job reaches `completed`, `failed`, or
`cancelled`, after which the server closes the stream. Each message's
`data` is JSON shaped like `GET /video/jobs/:id`'s response, plus
`jobId`:

```json
{ "jobId": "clx1a2b3c...", "status": "processing", "progress": 60 }
```

Requires the browser's `EventSource` be constructed with
`withCredentials: true` for the `session_id` cookie to round-trip
cross-origin, same as `fetch`'s `credentials: 'include'` elsewhere on
this API. 404s (via a guard, before the stream opens) if the job id
doesn't exist.

### `GET /video/jobs/:id/file`

Streams the finished file once `status` is `"completed"`. Sets
`Content-Type`, `Content-Disposition: attachment`, and `Content-Length`.
The temp file is deleted immediately after the response completes —
this endpoint can only be called once per job in practice.

Errors specific to this endpoint: `JOB_NOT_READY` (409, still
processing), `FILE_EXPIRED` (410, TTL cleanup already removed it),
`VIDEO_UNAVAILABLE` (404, unknown job id).

## Admin endpoints

`/admin/*` requires HTTP Basic Auth (`ADMIN_USERNAME` / `ADMIN_PASSWORD`).
**Must run behind HTTPS in production** — Basic Auth sends credentials
in cleartext-equivalent (base64) on every request. See
`docs/DEPLOYMENT.md`.

### `GET /admin/stats`

```json
{
  "totalRequests": 1204,
  "activeDownloads": 3,
  "completedDownloads": 1150,
  "failedDownloads": 51,
  "bandwidthBytes": 48318382080,
  "averageProcessingTimeSeconds": 22,
  "activeWorkers": 2
}
```

### `GET /admin/charts`

Last 14 days, one point per day (zero-filled for days with no activity):

```json
{
  "downloadsPerDay": [{ "date": "2026-07-27", "value": 42 }, ...],
  "errorsPerDay": [{ "date": "2026-07-27", "value": 1 }, ...],
  "bandwidthPerDay": [{ "date": "2026-07-27", "value": 3221225472 }, ...]
}
```

## Observability endpoints

### `GET /health` *(not under `/api`)*

No auth. Runs a real `SELECT 1` against Postgres; returns `503` if the
database is unreachable. Used by Docker's `HEALTHCHECK`.

### `GET /metrics` *(not under `/api`)*

Same Basic Auth as `/admin/*`. Prometheus exposition format
(`text/plain`) — default Node.js process metrics, HTTP request
count/duration, and current `DownloadJob` counts by status. Example
Prometheus scrape config:

```yaml
scrape_configs:
  - job_name: video-downloader-api
    basic_auth:
      username: admin
      password: your-admin-password
    static_configs:
      - targets: ["your-host/api"]  # or the internal Docker network address
```

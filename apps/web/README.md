# apps/web

Next.js (App Router) + TypeScript + Tailwind frontend.

- [x] Phase 7: Hero, analyze/format/download flow, homepage sections, SEO metadata
- [x] Phase 10: Vitest component tests + Playwright e2e
- [x] Phase 12: optional Sentry error tracking
- [x] Phase 13: CSP + baseline security headers

## Security (Phase 13)

`security-headers.js` (deliberately factored out of `next.config.js` so
it's unit-testable without a real Next.js server — see
`__tests__/security-headers.spec.ts`) builds a Content-Security-Policy
and a handful of other headers, applied via `next.config.js`'s
`headers()`:

- `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'` —
  a reasonably strict baseline. Not a nonce-based strict CSP (that needs
  per-request nonce generation via middleware — more moving parts than
  this app's risk profile calls for), but `script-src`/`style-src` do
  need `'unsafe-inline'` for Next.js's hydration and Tailwind's runtime;
  `'unsafe-eval'` is added only in development (Fast Refresh needs it,
  production doesn't).
- `img-src 'self' https: data:` — deliberately permissive on images,
  since video thumbnails come from whatever source the person analyzed
  (arbitrary hosts, by nature of what this app does). Still blocks
  `http:` and `javascript:` schemes.
- `connect-src 'self' <api-origin>` — computed from `NEXT_PUBLIC_API_URL`
  at build time; falls back to same-origin-only (not a crash) if that
  env var is malformed.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a
  `Permissions-Policy` disabling camera/microphone/geolocation (none of
  which this app uses).

## Observability (Phase 12)

Sentry is opt-in via `NEXT_PUBLIC_SENTRY_DSN` (unset by default — never
required to run the app). Server-side errors are caught via Next.js's
`instrumentation.ts` hook (`@sentry/node`); client-side, `lib/sentry.ts`
lazy-initializes `@sentry/browser` and is called from
`DownloaderPanel`'s generic error path — specifically only when the
error *isn't* an `ApiError` (which already carries a friendly,
expected, user-facing message from the API) — so Sentry only sees
genuinely unexpected failures (network errors, unparseable responses),
not routine validation messages.

A single DSN value is reused for both client and server since Sentry
DSNs are non-secret by design (they're meant to ship in client bundles).

## Design

Not a generic SaaS template — the visual language is drawn from
broadcast/editing tools (waveforms, timecodes, tabular data readouts)
since the product's actual subject is media streams. See the design
tokens in `tailwind.config.js`:

- **Palette**: near-black (`void`/`surface`), one accent — `amber`
  (tally-light amber, deliberately not the acid-green-on-black or
  vermilion-on-black looks that are the current AI-generated-design
  defaults).
- **Type**: Space Grotesk (display, used sparingly), Inter (body), IBM
  Plex Mono (timecodes, resolution/bitrate labels, progress % — genuinely
  tabular data in this product, not decoration).
- **Signature**: the waveform (`components/waveform.tsx`) does double
  duty — ambient hero texture, and the real animated indicator during the
  Analyzing state.

I named the product **"Reel"** since the build spec didn't include a
name — change it in `components/site-header.tsx`, `components/site-footer.tsx`,
and `app/layout.tsx`'s metadata if you want something else.

## Flow

`components/hero/downloader-panel.tsx` owns the whole interactive flow as
a small state machine: `idle → analyzing → analyzed → downloading →
(idle | download-error)`. It calls the real API (`lib/api.ts`) —
`POST /video/analyze`, `POST /video/download`, polls
`GET /video/jobs/:id` every 1.2s, and once `status === "completed"`,
triggers a real browser download via `GET /video/jobs/:id/file`.

Errors are relayed verbatim from the API's `{ message, code }` shape
(Section 18) — the frontend doesn't invent its own error copy.

## Run locally

```bash
npm install
npm run build:packages   # from repo root
npm run dev:web           # http://localhost:3000
```

Requires `apps/api` running (see its README) and `NEXT_PUBLIC_API_URL`
pointed at it (defaults to `http://localhost:4000/api`).

## Testing

**Component tests** (`components/hero/downloader-panel.spec.tsx`, Vitest
+ Testing Library): the whole `DownloaderPanel` state machine with
`lib/api.ts` mocked — analyze success/failure, format selection,
download progress polling (fake timers, no real 1.2s waits), completion
triggering a real `<a>` click, job failure, and cancel. Fully hermetic,
no backend needed.

**E2E** (`e2e/homepage.spec.ts`, Playwright): happy-path and error-path
through a real browser, with the API mocked entirely via Playwright's
route interception — so it only needs `apps/web` running, not the full
stack. This sandbox has no network access to Playwright's browser-binary
CDN, so this was written and typechecked but **not run here**; it runs
in CI (`.github/workflows/ci.yml`'s `e2e` job).

```bash
npm test                 # component tests
npx playwright install   # one-time, needs network access
npm run e2e               # Playwright
```

## Known gap

`next/font/google` fetches font files from Google Fonts at build time.
This repo's dev sandbox couldn't reach `fonts.googleapis.com` to verify a
full `next build`, so **I verified everything up to that point** — full
`tsc --noEmit` typecheck passed clean, and `next build` got through
module resolution, JSX, and Tailwind compilation before failing on the
font fetch specifically. This will build normally with real internet
access (e.g., in the Docker build, or `npm run dev` locally).

## Phase 14

**Live progress (`DownloaderPanel`).** Replaced the old `setInterval` +
`getJobStatus` poll with the API's SSE endpoint via `EventSource`. See
`apps/api/README.md`'s Phase 14 section for the backend side.
`downloader-panel.spec.tsx` uses a hand-written `MockEventSource` double,
since jsdom has no native `EventSource`.

**`/terms` and `/privacy`.** `components/legal/legal-page.tsx` is the
shared layout; content in both pages is grounded in what the API's
schema and code actually do (session cookie, TTL-based file deletion,
IP-based rate limiting), not generic boilerplate. Linked from the
footer and listed in `app/sitemap.ts`.

**Accessibility audit.** See `docs/ACCESSIBILITY.md` in the repo root
for the full write-up — real computed WCAG contrast ratios for the
palette, five concrete fixes (input labeling, progressbar semantics,
two `aria-live` regions, FAQ trigger/panel linking, a skip-to-content
link), and 12 automated axe-core tests in
`__tests__/accessibility.spec.tsx`. Getting `vitest-axe`'s matcher types
working required a nontrivial fix — documented in `vitest-axe.d.ts` — a
side-effect `import "vitest"` and a real named import (not an inline
`import(...)` type query) turned out to matter for the declaration merge
to actually pick up `toHaveNoViolations` without silently dropping
`@testing-library/jest-dom`'s own matchers.

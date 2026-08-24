"use client";

let initialized = false;

async function ensureInitialized() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || initialized) return;
  initialized = true;

  const Sentry = await import("@sentry/browser");
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
  });
}

/**
 * Reports a genuinely unexpected client-side error (network failure,
 * unparseable response, etc.) — not an ApiError, which is an expected,
 * already-friendly-messaged outcome the person just needs to see, not
 * something to alert on. No-op if SENTRY_DSN isn't configured.
 */
export async function captureClientError(err: unknown, context?: Record<string, unknown>): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  await ensureInitialized();
  const Sentry = await import("@sentry/browser");
  Sentry.captureException(err, { extra: context });
}

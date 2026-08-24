import * as Sentry from "@sentry/node";

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return; // no-op — never require a Sentry account to run this app
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
  });
}

/**
 * Only genuinely unexpected errors are worth alerting on. Called from
 * AllExceptionsFilter's catch-all branch — AppExceptions (INVALID_URL,
 * VIDEO_UNAVAILABLE, etc.) represent expected, user-facing outcomes,
 * not bugs, and are deliberately never sent here.
 */
export function captureUnexpectedError(err: unknown, context?: Record<string, unknown>): void {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err, { extra: context });
  }
}

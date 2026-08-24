import * as Sentry from "@sentry/node";
import { logger } from "./logger";

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info("SENTRY_DSN not set — error tracking disabled");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
  });

  logger.info("Sentry error tracking enabled");
}

/**
 * Only unexpected/unclassified errors are worth alerting on — the
 * well-known permanent failure taxonomy (unsupported source, video
 * unavailable, etc.) represents expected user-driven outcomes, not
 * bugs, and would just be noise in Sentry.
 */
export function captureUnexpectedError(err: unknown, context?: Record<string, unknown>): void {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err, { extra: context });
  }
}

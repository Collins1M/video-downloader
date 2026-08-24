export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0.1,
    });
  }
}

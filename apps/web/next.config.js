const { buildSecurityHeaders } = require("./security-headers");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // instrumentation.ts (optional Sentry server-side init, Phase 12) is
  // stable by default in recent 14.x, but this flag is a safe no-op if
  // already unnecessary — Next.js just warns on unknown experimental
  // keys rather than erroring.
  experimental: {
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

module.exports = nextConfig;

/**
 * Not a nonce-based strict CSP — that needs per-request nonce
 * generation via middleware, which is more moving parts than this
 * app's actual risk profile calls for. This is a solid baseline:
 * same-origin by default, no framing, no plugins, and an explicit
 * (not wildcard) API origin for fetch/XHR.
 */
function buildSecurityHeaders() {
  const isDev = process.env.NODE_ENV !== "production";

  const apiOrigin = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").origin;
    } catch {
      // Malformed env value shouldn't take the whole app down — fall
      // back to same-origin only, which just means cross-origin API
      // calls would be blocked until the env var is fixed (a loud,
      // visible failure in dev tools, not a silent security hole).
      return "'self'";
    }
  })();

  const csp = [
    `default-src 'self'`,
    // Next.js's hydration/runtime needs inline scripts. 'unsafe-eval' is
    // only needed for dev-mode HMR/Fast Refresh, never in production.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind's runtime and Next.js both inject inline styles.
    `style-src 'self' 'unsafe-inline'`,
    // Video thumbnails come from whatever source the person analyzed —
    // arbitrary https hosts, by nature of what this app does. Still
    // blocks http: and javascript: schemes.
    `img-src 'self' https: data:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${apiOrigin}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}

module.exports = { buildSecurityHeaders };

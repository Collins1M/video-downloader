import { describe, it, expect, afterEach, vi } from "vitest";
import { buildSecurityHeaders, type SecurityHeader } from "../security-headers";

describe("buildSecurityHeaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function cspOf(headers: SecurityHeader[]): string {
    return headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
  }

  it("includes a strict default-src and disallows framing/plugins", () => {
    const csp = cspOf(buildSecurityHeaders());
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("includes the configured API origin in connect-src", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com/api");
    const csp = cspOf(buildSecurityHeaders());
    expect(csp).toContain("connect-src 'self' https://api.example.com");
  });

  it("excludes unsafe-eval in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const csp = cspOf(buildSecurityHeaders());
    expect(csp).not.toContain("unsafe-eval");
  });

  it("includes unsafe-eval in development (needed for Fast Refresh)", () => {
    vi.stubEnv("NODE_ENV", "development");
    const csp = cspOf(buildSecurityHeaders());
    expect(csp).toContain("unsafe-eval");
  });

  it("allows https: images (video thumbnails come from arbitrary analyzed sources) but not http:", () => {
    const csp = cspOf(buildSecurityHeaders());
    expect(csp).toContain("img-src 'self' https: data:");
  });

  it("sets X-Frame-Options, nosniff, and a referrer policy", () => {
    const headers = buildSecurityHeaders();
    const map = Object.fromEntries(headers.map((h: SecurityHeader) => [h.key, h.value]));
    expect(map["X-Frame-Options"]).toBe("DENY");
    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("restricts sensitive browser permissions", () => {
    const headers = buildSecurityHeaders();
    const map = Object.fromEntries(headers.map((h: SecurityHeader) => [h.key, h.value]));
    expect(map["Permissions-Policy"]).toContain("camera=()");
    expect(map["Permissions-Policy"]).toContain("microphone=()");
    expect(map["Permissions-Policy"]).toContain("geolocation=()");
  });

  it("falls back to same-origin-only if NEXT_PUBLIC_API_URL is malformed, rather than crashing", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "not a valid url");
    const csp = cspOf(buildSecurityHeaders());
    expect(csp).toContain("connect-src 'self' 'self'");
  });

  it("falls back to localhost:4000 if NEXT_PUBLIC_API_URL is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const csp = cspOf(buildSecurityHeaders());
    expect(csp).toContain("connect-src 'self' http://localhost:4000");
  });
});

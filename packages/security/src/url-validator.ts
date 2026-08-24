import { promises as dns } from "node:dns";
import * as ipaddr from "ipaddr.js";

export class UnsafeUrlError extends Error {
  constructor() {
    super("Please enter a valid video URL.");
    this.name = "UnsafeUrlError";
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

/**
 * Validates that a URL is safe to fetch server-side (Section 13). Blocks
 * everything that could be used to make a service reach internal/private
 * infrastructure:
 *
 *  - non-http(s) schemes (file:, ftp:, gopher:, data:, etc.)
 *  - literal IP hosts in private/loopback/link-local/reserved ranges
 *  - hostnames that *resolve* to any of the above (DNS rebinding)
 *
 * Deliberately throws the SAME generic error for "malformed URL" and
 * "resolves to a blocked range" — a validator that explains *why* a host
 * was rejected is itself useful for probing internal network topology.
 *
 * Both apps/api (at request time) and apps/worker (immediately before
 * the actual fetch) call this. Calling it twice is intentional: a
 * hostname that resolved safely when the API validated it can resolve to
 * a private IP moments later (DNS rebinding), so the worker must
 * re-resolve right before connecting rather than trust the API's earlier
 * check.
 */
export async function validateUrl(rawUrl: string): Promise<URL> {
  const url = parse(rawUrl);
  assertProtocolAllowed(url);
  assertHostnameNotObviouslyBlocked(url);

  const addresses = await resolveHostname(url.hostname);
  if (addresses.length === 0) {
    throw new UnsafeUrlError();
  }

  for (const address of addresses) {
    assertAddressAllowed(address);
  }

  return url;
}

function parse(rawUrl: string): URL {
  try {
    return new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError();
  }
}

function assertProtocolAllowed(url: URL) {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeUrlError();
  }
}

function assertHostnameNotObviouslyBlocked(url: URL) {
  const hostname = url.hostname.toLowerCase();

  if (!hostname) {
    throw new UnsafeUrlError();
  }
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError();
  }

  // IPv6 literals arrive from WHATWG URL wrapped in brackets, e.g.
  // "[2001:4860:4860::8888]" — strip them before any IP-literal check,
  // and check IP-validity BEFORE the hostname-shape heuristics below,
  // since a bracketed IPv6 address legitimately contains no "." and
  // would otherwise be wrongly rejected as a "bare hostname".
  const unbracketed = stripBrackets(hostname);
  if (ipaddr.isValid(unbracketed)) {
    assertAddressAllowed(unbracketed);
    return;
  }

  if (
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    !hostname.includes(".")
  ) {
    throw new UnsafeUrlError();
  }
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

async function resolveHostname(hostname: string): Promise<string[]> {
  const unbracketed = stripBrackets(hostname);
  if (ipaddr.isValid(unbracketed)) {
    return [unbracketed];
  }

  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: false });
    return records.map((r) => r.address);
  } catch {
    throw new UnsafeUrlError();
  }
}

function assertAddressAllowed(address: string) {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.process(address);
  } catch {
    throw new UnsafeUrlError();
  }

  // Explicit allowlist rather than blocklist: only a normal public
  // ("unicast") address passes. Everything ipaddr.js classifies as
  // private/loopback/linkLocal/uniqueLocal/carrierGradeNat/reserved/
  // multicast/etc. is rejected, for both IPv4 and IPv6 (including
  // IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1).
  if (parsed.range() !== "unicast") {
    throw new UnsafeUrlError();
  }
}

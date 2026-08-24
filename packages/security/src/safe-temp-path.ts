import { resolve, sep } from "node:path";

const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

/**
 * Builds a path for a job's temp files that is guaranteed to stay inside
 * `baseDir`, even if `jobId` or `filename` were ever attacker-influenced
 * (Section 13: path traversal protection).
 *
 * Both segments are restricted to a strict allowlist (letters, digits,
 * dash, underscore) — no `.`, `/`, `\`, or null bytes — so `..` traversal,
 * absolute-path injection, and encoded variants are rejected outright
 * rather than "cleaned up". As a second, independent check, the final
 * resolved path is also verified to fall under `baseDir`.
 */
export function safeTempFilePath(baseDir: string, jobId: string, filename: string): string {
  assertSafeSegment(jobId, "jobId");

  const dotIndex = filename.lastIndexOf(".");
  const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const ext = dotIndex > 0 ? filename.slice(dotIndex + 1) : "";

  assertSafeSegment(stem, "filename");
  if (ext) {
    assertSafeSegment(ext, "filename extension");
  }

  const resolvedBase = resolve(baseDir);
  const resolvedPath = resolve(resolvedBase, jobId, filename);

  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(resolvedBase + sep)) {
    throw new Error("Resolved temp path escaped the base directory");
  }

  return resolvedPath;
}

/** The per-job directory itself (jobId only), for mkdir/rm -rf style cleanup. */
export function safeTempJobDir(baseDir: string, jobId: string): string {
  assertSafeSegment(jobId, "jobId");
  const resolvedBase = resolve(baseDir);
  const resolvedPath = resolve(resolvedBase, jobId);

  if (!resolvedPath.startsWith(resolvedBase + sep)) {
    throw new Error("Resolved temp path escaped the base directory");
  }

  return resolvedPath;
}

function assertSafeSegment(segment: string, label: string) {
  if (!segment || !SAFE_SEGMENT.test(segment)) {
    throw new Error(`Unsafe ${label}: only letters, digits, "-" and "_" are allowed`);
  }
}

import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

export const SESSION_COOKIE_NAME = "session_id";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60_000; // 30 days

export interface RequestWithSession extends Request {
  sessionId: string;
}

/**
 * Assigns every visitor a stable anonymous id, purely for job
 * attribution/tracking (Section 17 — "Optionally generate a temporary
 * anonymous session ID for rate limiting and job tracking"). This is
 * NOT an auth mechanism: it doesn't gate access to anything, and
 * enforcement (concurrent-job limits, rate limiting) stays IP-based per
 * Section 14. A cleared cookie just means a new id next time — nothing
 * breaks, no data is lost, it's purely descriptive.
 */
export function sessionIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const existing = req.cookies?.[SESSION_COOKIE_NAME];
  const sessionId = typeof existing === "string" && existing.length > 0 ? existing : randomUUID();

  if (sessionId !== existing) {
    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE_MS,
    });
  }

  (req as RequestWithSession).sessionId = sessionId;
  next();
}

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

/**
 * Minimal auth for the admin dashboard (Section 22: "protected admin
 * dashboard", "separate from the public frontend"). HTTP Basic Auth
 * against two env vars is deliberately simple for this scaffold's
 * scope — see apps/api README for what a production deployment should
 * layer on top (this must run behind HTTPS; nginx.conf doesn't
 * terminate TLS by default — see docs/DEPLOYMENT.md).
 */
@Injectable()
export class AdminBasicAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const expectedUser = this.config.get<string>("ADMIN_USERNAME");
    const expectedPass = this.config.get<string>("ADMIN_PASSWORD");

    if (!expectedUser || !expectedPass) {
      // Fail closed: no credentials configured means the dashboard is
      // unreachable, never that it's open.
      throw new UnauthorizedException("Admin dashboard is not configured.");
    }

    const header = request.headers.authorization;
    const provided = header?.startsWith("Basic ") ? decodeBasicAuth(header) : null;

    if (
      !provided ||
      !safeEqual(provided.username, expectedUser) ||
      !safeEqual(provided.password, expectedPass)
    ) {
      response.setHeader("WWW-Authenticate", 'Basic realm="admin"');
      throw new UnauthorizedException("Invalid admin credentials.");
    }

    return true;
  }
}

function decodeBasicAuth(header: string): { username: string; password: string } | null {
  try {
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return null;
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual requires equal-length buffers; padding one side on a
  // length mismatch still avoids leaking length via early-return timing.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA); // constant-time no-op to keep timing uniform
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  // req.ip honors Express's `trust proxy` setting (enabled in main.ts),
  // so this reads the real client IP from X-Forwarded-For when running
  // behind the nginx reverse proxy, and the socket IP otherwise.
  return request.ip ?? "unknown";
});

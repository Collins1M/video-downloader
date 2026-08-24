import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RequestWithSession } from "./session-id.middleware";

export const SessionId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithSession>();
  return request.sessionId ?? "unknown";
});

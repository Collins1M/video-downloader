import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export const RequestId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
  const request = ctx.switchToHttp().getRequest<Request & { id?: string }>();
  return request.id;
});

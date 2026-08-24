import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { JobNotFoundException } from "../common/exceptions/app-exceptions";

/**
 * Confirms the job in the :id param exists before an @Sse() handler runs.
 *
 * Found during Phase 14: throwing an AppException from inside the
 * Promise<Observable<...>> returned by an @Sse()-decorated method does
 * not reliably reach AllExceptionsFilter — the SSE response pipeline
 * already commits a 200 with `Content-Type: text/event-stream` before
 * the promise rejection is handled, so the client sees an empty 200
 * stream instead of a 404. Guards run in Nest's normal request pipeline
 * *before* that SSE response is opened, so a guard-thrown exception goes
 * through the exception filter correctly. Route existence checks here;
 * the handler itself can assume the job exists.
 */
@Injectable()
export class JobExistsGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const id = request.params.id;

    const job = await this.prisma.downloadJob.findUnique({ where: { id }, select: { id: true } });
    if (!job) {
      throw new JobNotFoundException();
    }

    return true;
  }
}

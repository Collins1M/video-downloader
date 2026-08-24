import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { TooManyConcurrentJobsException } from "./too-many-concurrent-jobs.exception";

@Injectable()
export class ConcurrentJobsGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip ?? "unknown";
    const maxConcurrent = Number(this.config.get("MAX_CONCURRENT_JOBS_PER_IP") ?? 2);

    const activeCount = await this.prisma.downloadJob.count({
      where: {
        ipAddress: ip,
        status: { in: ["queued", "processing"] },
      },
    });

    if (activeCount >= maxConcurrent) {
      throw new TooManyConcurrentJobsException();
    }

    return true;
  }
}

import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { JobNotFoundException } from "../common/exceptions/app-exceptions";


@Injectable()
export class JobExistsGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const id = request.params.id as string;

    const job = await this.prisma.downloadJob.findUnique({ where: { id }, select: { id: true } });
    if (!job) {
      throw new JobNotFoundException();
    }

    return true;
  }
}

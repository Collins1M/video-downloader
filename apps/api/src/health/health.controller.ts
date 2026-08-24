import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: "ok"; database: "ok" }> {
    try {
      // A real query, not just "is the process alive" — catches a
      // dead/unreachable Postgres even though the Node process itself
      // is still running.
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException("Database is unreachable.");
    }

    return { status: "ok", database: "ok" };
  }
}

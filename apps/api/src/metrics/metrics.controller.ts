import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { MetricsService } from "./metrics.service";
import { AdminBasicAuthGuard } from "../admin/basic-auth.guard";

@Controller("metrics")
@UseGuards(AdminBasicAuthGuard)
@SkipThrottle()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header("Content-Type", "text/plain")
  async getMetrics(): Promise<string> {
    return this.metrics.getMetrics();
  }
}

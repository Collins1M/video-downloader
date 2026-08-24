import { Controller, Get, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { AdminStats, AdminChartsResponse } from "@video-downloader/types";
import { AdminService } from "./admin.service";
import { AdminBasicAuthGuard } from "./basic-auth.guard";

@Controller("admin")
@UseGuards(AdminBasicAuthGuard)
@SkipThrottle() // an operator polling their own dashboard shouldn't trip the public rate limiter
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("stats")
  getStats(): Promise<AdminStats> {
    return this.adminService.getStats();
  }

  @Get("charts")
  getCharts(): Promise<AdminChartsResponse> {
    return this.adminService.getCharts();
  }
}

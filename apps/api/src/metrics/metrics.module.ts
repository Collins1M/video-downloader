import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { MetricsService } from "./metrics.service";
import { MetricsController } from "./metrics.controller";
import { MetricsInterceptor } from "./metrics.interceptor";
import { AdminBasicAuthGuard } from "../admin/basic-auth.guard";

@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    AdminBasicAuthGuard,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}

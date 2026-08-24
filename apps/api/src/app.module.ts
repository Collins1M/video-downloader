import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { VideoModule } from "./video/video.module";
import { SecurityModule } from "./common/security/security.module";
import { QueueConnectionModule } from "./queue/queue-connection.module";
import { AdminModule } from "./admin/admin.module";
import { HealthModule } from "./health/health.module";
import { MetricsModule } from "./metrics/metrics.module";
import { AppLoggerModule } from "./common/logging/logger.module";

@Module({
  imports: [
    AppLoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          // Three independent named tiers (Section 14 + Phase 13
          // hardening). Each route opts into exactly ONE of these via
          // @Throttle({ name: {} }) — see VideoController — rather than
          // being checked against all three at once. Without this
          // split, job-status polling (the frontend checks every 1.2s
          // while a download is active — ~50 req/min) would share the
          // same low "general" bucket as expensive operations like
          // /video/download, and legitimate polling during any download
          // longer than ~12 seconds would start failing with 429s.
          {
            name: "general",
            ttl: 60_000,
            limit: Number(config.get("RATE_LIMIT_PER_MINUTE") ?? 10),
          },
          {
            name: "download",
            ttl: 60_000,
            limit: Number(config.get("RATE_LIMIT_DOWNLOAD_PER_MINUTE") ?? 5),
          },
          {
            name: "polling",
            ttl: 60_000,
            limit: Number(config.get("RATE_LIMIT_POLLING_PER_MINUTE") ?? 120),
          },
        ],
      }),
    }),
    PrismaModule,
    SecurityModule,
    QueueConnectionModule,
    VideoModule,
    AdminModule,
    HealthModule,
    MetricsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // applies to every route unless overridden with @SkipThrottle/@Throttle
    },
  ],
})
export class AppModule {}

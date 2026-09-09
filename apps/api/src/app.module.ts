import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD, DiscoveryModule, Reflector } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { AppController } from "./welcome.controller";
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
    DiscoveryModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
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
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, 
    },
  ],
})
export class AppModule {}

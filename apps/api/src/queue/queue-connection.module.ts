import { Module, Logger } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import IORedis from "ioredis";

const logger = new Logger("RedisConnection");

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Constructed explicitly (rather than passing a plain config
        // object) so we can attach observability — a Redis outage
        // should be visible in logs, not silent while ioredis retries
        // in the background.
        const connection = new IORedis(config.getOrThrow<string>("REDIS_URL"), {
          maxRetriesPerRequest: null, // required by BullMQ for its blocking commands
          retryStrategy: (attempt: number) => Math.min(attempt * 500, 5000),
        });

        connection.on("error", (err) => logger.error(`Redis connection error: ${err.message}`));
        connection.on("reconnecting", () => logger.warn("Redis connection lost, reconnecting..."));
        connection.on("ready", () => logger.log("Redis connection ready"));

        return { connection };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueConnectionModule {}

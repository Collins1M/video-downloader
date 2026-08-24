import { Worker } from "bullmq";
import IORedis from "ioredis";
import { writeFileSync } from "node:fs";
import { VIDEO_PROCESSING_QUEUE } from "@video-downloader/types";
import { loadWorkerConfig } from "./config";
import { processVideoJob } from "./queue-processor";
import { cleanupExpiredJobs } from "./cleanup";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { initSentry, captureUnexpectedError } from "./sentry";
import { startMetricsServer } from "./metrics";

const CLEANUP_INTERVAL_MS = 5 * 60_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_PATH = "/tmp/worker-heartbeat";

async function main() {
  initSentry();

  const config = loadWorkerConfig();

  const connection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null, // required by BullMQ for blocking commands
    retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
  });

  connection.on("error", (err) => logger.error({ err }, "Redis connection error"));
  connection.on("reconnecting", () => logger.warn("Redis connection lost, reconnecting..."));
  connection.on("ready", () => logger.info("Redis connection ready"));

  const worker = new Worker(VIDEO_PROCESSING_QUEUE, processVideoJob, {
    connection,
    concurrency: config.concurrency,
    // Belt-and-suspenders alongside the DB-level TEMP_FILE_TTL_MINUTES
    // cleanup: a job stuck well past the max processing time is
    // stalled, not slow — BullMQ reclaims it once the lock expires.
    lockDuration: config.maxProcessingTimeSeconds * 1000,
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Job failed");
    captureUnexpectedError(err, { jobId: job?.id });
  });

  logger.info(
    { queue: VIDEO_PROCESSING_QUEUE, concurrency: config.concurrency },
    "Worker listening",
  );

  startMetricsServer(config.metricsPort);

  cleanupExpiredJobs().catch((err) => logger.error({ err }, "Cleanup sweep error"));
  const cleanupTimer = setInterval(() => {
    cleanupExpiredJobs().catch((err) => logger.error({ err }, "Cleanup sweep error"));
  }, CLEANUP_INTERVAL_MS);

  // No general HTTP server here, so HEALTHCHECK can't curl anything —
  // instead this touches a file on a fixed interval, and the
  // Dockerfile's HEALTHCHECK just checks the file's mtime is recent. A
  // worker that's deadlocked or whose event loop is blocked stops
  // updating it.
  const writeHeartbeat = () => {
    try {
      writeFileSync(HEARTBEAT_PATH, String(Date.now()));
    } catch (err) {
      logger.error({ err }, "Failed to write heartbeat");
    }
  };
  writeHeartbeat();
  const heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);

  const shutdown = async () => {
    logger.info("Shutting down...");
    clearInterval(cleanupTimer);
    clearInterval(heartbeatTimer);
    await worker.close();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal startup error");
  process.exit(1);
});

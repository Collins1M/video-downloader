export interface WorkerConfig {
  redisUrl: string;
  databaseUrl: string;
  concurrency: number;
  maxProcessingTimeSeconds: number;
  maxVideoSizeMb: number;
  tempFileTtlMinutes: number;
  tempDir: string;
  metricsPort: number;
  analyzeTimeoutMs: number;
}

export function loadWorkerConfig(): WorkerConfig {
  const redisUrl = process.env.REDIS_URL;
  const databaseUrl = process.env.DATABASE_URL;

  if (!redisUrl) {
    throw new Error("REDIS_URL is required");
  }
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return {
    redisUrl,
    databaseUrl,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
    maxProcessingTimeSeconds: Number(process.env.MAX_PROCESSING_TIME_SECONDS ?? 900),
    maxVideoSizeMb: Number(process.env.MAX_VIDEO_SIZE_MB ?? 2048),
    tempFileTtlMinutes: Number(process.env.TEMP_FILE_TTL_MINUTES ?? 30),
    tempDir: process.env.TEMP_DIR ?? "/var/tmp/video-downloader",
    metricsPort: Number(process.env.METRICS_PORT ?? 9091),
    analyzeTimeoutMs: Number(process.env.ANALYZE_TIMEOUT_MS ?? 60_000),
  };
}

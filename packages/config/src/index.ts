export { APP_DEFAULTS } from "./defaults";

export interface AppConfig {
  nodeEnv: "development" | "production" | "test";
  port: number;

  databaseUrl: string;
  redisUrl: string;

  maxVideoSizeMb: number;
  maxProcessingTimeSeconds: number;
  maxConcurrentJobsPerIp: number;
  rateLimitPerMinute: number;
  tempFileTtlMinutes: number;
}

export const ENV_KEYS = [
  "NODE_ENV",
  "PORT",
  "DATABASE_URL",
  "REDIS_URL",
  "MAX_VIDEO_SIZE_MB",
  "MAX_PROCESSING_TIME_SECONDS",
  "MAX_CONCURRENT_JOBS_PER_IP",
  "RATE_LIMIT_PER_MINUTE",
  "TEMP_FILE_TTL_MINUTES",
] as const;

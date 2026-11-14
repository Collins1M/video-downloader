export const APP_DEFAULTS = {
  maxVideoSizeMb: 2048,
  maxProcessingTimeSeconds: 900,
  maxConcurrentJobsPerIp: 2,
  rateLimitPerMinute: 10,
  rateLimitDownloadPerMinute: 150,
  rateLimitPollingPerMinute: 120,
  tempFileTtlMinutes: 30,
} as const;

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
const isTest = process.env.NODE_ENV === "test";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? "silent" : "info"),
  transport: isDev
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
    : undefined,
  base: { service: "worker" },
});

/** Binds jobId/requestId so every log line during a job's processing is correlatable across the api → queue → worker boundary. */
export function jobLogger(downloadJobId: string, requestId?: string) {
  return logger.child({ downloadJobId, requestId });
}

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
const isTest = process.env.NODE_ENV === "test";

function getTransport() {
  const usePretty = process.env.LOG_FORMAT === "pretty" || isDev;
  if (!usePretty) return undefined;

  return {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  };
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? "silent" : "info"),
  transport: getTransport(),
  base: { service: "worker" },
});

/** Binds jobId/requestId so every log line during a job's processing is correlatable across the api → queue → worker boundary. */
export function jobLogger(downloadJobId: string, requestId?: string) {
  return logger.child({ downloadJobId, requestId });
}

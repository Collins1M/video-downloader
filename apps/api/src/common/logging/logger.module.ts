import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

export const AppLoggerModule = LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? (isTest ? "silent" : "info"),
    transport: !isProd && !isTest ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } } : undefined,
    base: { service: "api" },
    // Reuse an incoming X-Request-Id (set by nginx/a load balancer, if
    // configured) so a request can be traced across the whole stack,
    // not just within this process; generate one otherwise. Echoed
    // back so the browser/client can also reference it (e.g. when
    // reporting a bug).
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const existing = req.headers["x-request-id"];
      const id = typeof existing === "string" && existing.length > 0 ? existing : randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
    // Never log credentials or session tokens, even at debug level.
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
      censor: "[redacted]",
    },
    autoLogging: {
      // The health check is polled every 30s by Docker — logging every
      // poll would drown out everything else.
      ignore: (req: IncomingMessage) => req.url === "/health",
    },
  },
});

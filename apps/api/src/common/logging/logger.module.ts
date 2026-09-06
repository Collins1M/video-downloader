import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (isTest ? "silent" : "info"),
        transport: !isProd && !isTest ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } } : undefined,
        base: { service: "api" },
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const existing = req.headers["x-request-id"];
          const id = typeof existing === "string" && existing.length > 0 ? existing : randomUUID();
          res.setHeader("X-Request-Id", id);
          return id;
        },
        redact: {
          paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
          censor: "[redacted]",
        },
        autoLogging: {
          ignore: (req: IncomingMessage) => req.url === "/health",
        },
      },
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggerModule {}

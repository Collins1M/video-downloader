import { NestFactory } from "@nestjs/core";
import { RequestMethod, ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/http-exception.filter";
import { sessionIdMiddleware } from "./common/security/session-id.middleware";
import { initSentry } from "./common/logging/sentry";
import { setupSwagger } from "./swagger";

async function bootstrap() {
  initSentry();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  // Required for req.ip / ClientIp decorator / ThrottlerGuard to read the
  // real client address from X-Forwarded-For set by the nginx proxy,
  // instead of nginx's own socket address.
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // This is a JSON/file API, not an HTML-serving app — a CSP header
      // here would be inert on JSON responses and confusing on file
      // downloads. CSP belongs on apps/web instead (see its next.config.js).
      contentSecurityPolicy: false,
      // The frontend fetches this API cross-origin (different port in
      // local dev; same-origin behind nginx in production either way).
      // Access is already controlled by the CORS allowlist below —
      // helmet's stricter default here would block legitimate frontend
      // requests without adding real protection on top of that.
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.setGlobalPrefix("api", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "metrics", method: RequestMethod.GET },
      { path: "api-docs", method: RequestMethod.GET },
      { path: "api-docs/json", method: RequestMethod.GET },
    ],
  });

  // Must come after setGlobalPrefix — see setupSwagger's docstring for
  // why order matters here.
  setupSwagger(app);

  // cookie-parser must run before sessionIdMiddleware, which reads
  // req.cookies to find (or assign) the anonymous session id.
  app.use(cookieParser());
  app.use(sessionIdMiddleware);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields — no arbitrary shell/ffmpeg args sneak through in a body
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // Restrict to the known frontend origin rather than reflecting any
  // Origin header — an open CORS policy on a service that fetches
  // arbitrary URLs and streams files back is an easy abuse vector.
  // credentials: true is required for the session_id cookie to round-trip
  // cross-origin (frontend and API run on different ports in local dev).
  const allowedOrigin = process.env.FRONTEND_URL ?? "http://localhost:3000";
  app.enableCors({ origin: allowedOrigin, credentials: true });

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  logger.log(`API listening on port ${port}`);
}

bootstrap();

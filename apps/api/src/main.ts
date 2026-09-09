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

    app.set("trust proxy", 1);

    app.use(
        helmet({
            contentSecurityPolicy: false,
            crossOriginResourcePolicy: { policy: "cross-origin" },
        }),
    );

    app.setGlobalPrefix("api", {
        exclude: [
            { path: "/", method: RequestMethod.GET },
            { path: "health", method: RequestMethod.GET },
            { path: "metrics", method: RequestMethod.GET },
            { path: "api-docs", method: RequestMethod.GET },
            { path: "api-docs/json", method: RequestMethod.GET },
        ],
    });

    setupSwagger(app);

    app.use(cookieParser());
    app.use(sessionIdMiddleware);

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    app.useGlobalFilters(new AllExceptionsFilter());

    const frontendUrl = process.env.FRONTEND_URL;

    const origins = (frontendUrl ? frontendUrl.split(",") : [])
        .map((o) => o.trim().replace(/\/$/, ""))
        .concat([
            "http://localhost:3000",
            "https://video.fplstocks.com",
        ])
        .filter((o, i, self) => o && self.indexOf(o) === i);

    logger.log(`CORS allowed origins: ${origins.join(", ")}`);

    app.enableCors({
        origin: origins,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Request-Id",
            "X-Forwarded-For",
            "Origin",
            "Accept",
        ],
        exposedHeaders: ["set-cookie"],
    });
    const port = process.env.PORT ? Number(process.env.PORT) : 4000;
    await app.listen(port);
    logger.log(`API listening on port ${port}`);
}

bootstrap();

import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The path Swagger UI/JSON is served at.
 */
export const SWAGGER_PATH = "api-docs";

/**
 * Wires SwaggerModule into an already-constructed Nest app.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("Video Downloader API")
    .setDescription(
      "Self-hosted video downloader API. This is a live reference generated from the running " +
        "server's decorators.",
    )
    .setVersion(process.env.npm_package_version ?? "0.1.0")
    .addTag("video", "Analyze, download, and track video processing jobs")
    .addTag("admin", "Operator-only stats and metrics, protected by HTTP Basic auth")
    .addTag("health", "Liveness/readiness check for orchestrators")
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Generate static OpenAPI file for external tooling/reference
  if (process.env.NODE_ENV !== "production") {
    const outputPath = join(process.cwd(), "openapi.json");
    writeFileSync(outputPath, JSON.stringify(document, null, 2), "utf8");
  }

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}/json`,
  });
}

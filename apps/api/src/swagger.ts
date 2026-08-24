import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

/**
 * The path Swagger UI/JSON is served at. Deliberately outside the /api
 * prefix, consistent with /health and /metrics (Phase 12) — this is
 * operator/developer tooling, not a versioned API route, so it shouldn't
 * move if the API prefix ever changes.
 */
export const SWAGGER_PATH = "docs";

/**
 * Wires SwaggerModule into an already-constructed Nest app. Called from
 * both main.ts and every *.e2e-spec.ts file's manual app bootstrap
 * (video/admin/health), since each spec builds its own app independently
 * of main.ts — the same class of gap that caused the Phase 12 /metrics
 * prefix-exclusion bug if this isn't replicated everywhere the app is
 * assembled by hand.
 *
 * Must be called after `app.setGlobalPrefix(...)` — SwaggerModule reads
 * the already-configured prefix/exclusions to decide the real served
 * path, and calling it before the prefix is set produces a different
 * (and wrong) result. This was confirmed empirically here, not assumed:
 * see video.e2e-spec.ts's "Swagger" describe block, which asserts the
 * doc is actually reachable at exactly `/${SWAGGER_PATH}` — the same
 * "verify the real route, don't assume it" lesson as the Phase 12 fix.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("Video Downloader API")
    .setDescription(
      "Self-hosted video downloader API. This is a live reference generated from the running " +
        "server's decorators — see docs/API.md in the repo for the hand-written reference, which " +
        "covers operational context (rate-limit tiers, SSE event shapes, deployment) this document " +
        "doesn't.",
    )
    .setVersion(process.env.npm_package_version ?? "0.1.0")
    .addTag("video", "Analyze, download, and track video processing jobs")
    .addTag("admin", "Operator-only stats and metrics, protected by HTTP Basic auth")
    .addTag("health", "Liveness/readiness check for orchestrators")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}/json`,
  });
}

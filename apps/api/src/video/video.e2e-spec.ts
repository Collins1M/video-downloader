/**
 * Integration tests against a real bootstrapped Nest app, real Postgres,
 * and real Redis (BullMQ). This sandbox cannot run these — no network
 * access to Prisma's engine binary CDN means `prisma generate` fails
 * here (see repo READMEs for the recurring caveat), so there is no
 * working PrismaClient to connect with. These run in CI
 * (.github/workflows/ci.yml's `test` job), which has full internet
 * access and real Postgres/Redis service containers.
 *
 * MediaAnalyzer is overridden with a stub so these tests don't depend
 * on yt-dlp or real external network access — extraction logic itself
 * is covered separately in packages/media-extractor's unit tests.
 * UrlValidatorService is overridden for most tests (deterministic, no
 * real DNS) except the dedicated SSRF-integration test at the bottom,
 * which deliberately uses the real validator end-to-end.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { getQueueToken } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { MediaAnalyzer } from "./media-analyzer.interface";
import { UrlValidatorService } from "../common/security/url-validator.service";
import { AllExceptionsFilter } from "../common/filters/http-exception.filter";
import { sessionIdMiddleware } from "../common/security/session-id.middleware";
import { VIDEO_PROCESSING_QUEUE } from "@video-downloader/types";
import { setupSwagger } from "../swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "api-e2e-"));

const stubAnalyzeResponse = {
  success: true,
  video: { title: "Test Video", thumbnail: "https://example.com/thumb.jpg", duration: 120, source: "example.com" },
  formats: [
    { id: "1080p-mp4", type: "video", container: "mp4", resolution: "1080p", estimatedSize: 1000 },
    { id: "128kbps-mp3", type: "audio", container: "mp3", bitrateKbps: 128, estimatedSize: 500 },
  ],
};

async function buildApp(overrideUrlValidator: boolean): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MediaAnalyzer)
    .useValue({ analyze: jest.fn().mockResolvedValue(stubAnalyzeResponse) });

  if (overrideUrlValidator) {
    builder.overrideProvider(UrlValidatorService).useValue({
      validate: jest.fn().mockImplementation(async (url: string) => new URL(url)),
    });
  }

  const moduleRef: TestingModule = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.setGlobalPrefix("api", { exclude: ["health", "metrics", "docs", "docs/json"] });
  setupSwagger(app);
  app.use(cookieParser());
  app.use(sessionIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  return { app, prisma: moduleRef.get(PrismaService) };
}

/**
 * Empirical check that the Swagger doc is reachable at the path
 * setupSwagger claims (Phase 14, item 22) — the same "verify, don't
 * assume" lesson as the Phase 12 /metrics prefix-exclusion bug. This
 * was in fact run against a live server in this sandbox (not just
 * asserted via supertest) to confirm the real route before writing this
 * test — see docs/API.md's Swagger section for that empirical trace.
 */
describe("Swagger docs (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const built = await buildApp(true);
    app = built.app;
  });

  afterAll(async () => {
    await app.close();
  }, 15000);

  it("serves the Swagger UI at /docs, outside the /api prefix", async () => {
    const res = await request(app.getHttpServer()).get("/docs");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui");
  });

  it("is not reachable under /api/docs", async () => {
    const res = await request(app.getHttpServer()).get("/api/docs");
    expect(res.status).toBe(404);
  });

  it("serves a valid-looking OpenAPI document at /docs/json", async () => {
    const res = await request(app.getHttpServer()).get("/docs/json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe("Video Downloader API");
    // Spot-check a handful of routes that should be documented,
    // correctly reflecting the /api prefix applied to real controllers.
    expect(res.body.paths).toHaveProperty(["/api/video/analyze"]);
    expect(res.body.paths).toHaveProperty(["/api/video/download"]);
    expect(res.body.paths).toHaveProperty(["/api/video/jobs/{id}"]);
    expect(res.body.paths).toHaveProperty(["/api/video/jobs/{id}/events"]);
    expect(res.body.paths).toHaveProperty(["/api/admin/stats"]);
    // /health is intentionally excluded from the /api prefix — confirms
    // the document reflects the real routing, not a naive assumption.
    expect(res.body.paths).toHaveProperty(["/health"]);
  });
});

describe("Video endpoints (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let queue: Queue;

  beforeAll(async () => {
    process.env.TEMP_DIR = TEMP_DIR;
    const built = await buildApp(true);
    app = built.app;
    prisma = built.prisma;
    queue = app.get(getQueueToken(VIDEO_PROCESSING_QUEUE));
  });

  afterEach(async () => {
    await prisma.downloadJob.deleteMany({});
    await queue.drain();
  });

  afterAll(async () => {
    await app.close();
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }, 15000);

  describe("POST /api/video/analyze", () => {
    it("returns the analyzer's response for a valid URL", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/video/analyze")
        .send({ url: "https://example.com/video" })
        .expect(201);

      expect(res.body).toEqual(stubAnalyzeResponse);
    });

    it("rejects a missing url with a validation error", async () => {
      const res = await request(app.getHttpServer()).post("/api/video/analyze").send({}).expect(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects extra unknown fields (whitelist validation)", async () => {
      await request(app.getHttpServer())
        .post("/api/video/analyze")
        .send({ url: "https://example.com/video", evilField: "rm -rf /" })
        .expect(400);
    });
  });

  describe("POST /api/video/download + job lifecycle", () => {
    it("creates a DownloadJob row and enqueues a matching BullMQ job", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/video/download")
        .send({ url: "https://example.com/video", formatId: "1080p-mp4" })
        .expect(201);

      expect(res.body.jobId).toBeDefined();

      const dbJob = await prisma.downloadJob.findUnique({ where: { id: res.body.jobId } });
      expect(dbJob).not.toBeNull();
      expect(dbJob?.status).toBe("queued");
      expect(dbJob?.format).toBe("1080p-mp4");

      const bullJob = await queue.getJob(res.body.jobId);
      expect(bullJob).toBeDefined();
      expect(bullJob?.data.downloadJobId).toBe(res.body.jobId);
    });

    it("rejects a formatId with unsafe characters", async () => {
      await request(app.getHttpServer())
        .post("/api/video/download")
        .send({ url: "https://example.com/video", formatId: "../../etc/passwd" })
        .expect(400);
    });

    it("GET /api/video/jobs/:id returns the current status", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/video/download")
        .send({ url: "https://example.com/video", formatId: "1080p-mp4" });

      const res = await request(app.getHttpServer()).get(`/api/video/jobs/${created.body.jobId}`).expect(200);

      expect(res.body).toEqual({ id: created.body.jobId, status: "queued", progress: 0 });
    });

    it("GET /api/video/jobs/:id 404s for an unknown id", async () => {
      await request(app.getHttpServer()).get("/api/video/jobs/does-not-exist").expect(404);
    });

    it("DELETE /api/video/jobs/:id cancels an active job", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/video/download")
        .send({ url: "https://example.com/video", formatId: "1080p-mp4" });

      const res = await request(app.getHttpServer()).delete(`/api/video/jobs/${created.body.jobId}`).expect(200);

      expect(res.body.status).toBe("cancelled");

      const dbJob = await prisma.downloadJob.findUnique({ where: { id: created.body.jobId } });
      expect(dbJob?.status).toBe("cancelled");
    });

    it("enforces the per-IP concurrent job limit", async () => {
      const ip = "203.0.113.9";
      // MAX_CONCURRENT_JOBS_PER_IP defaults to 2 — the third request from
      // the same simulated IP should be rejected.
      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer())
          .post("/api/video/download")
          .set("X-Forwarded-For", ip)
          .send({ url: "https://example.com/video", formatId: "1080p-mp4" })
          .expect(201);
      }

      const res = await request(app.getHttpServer())
        .post("/api/video/download")
        .set("X-Forwarded-For", ip)
        .send({ url: "https://example.com/video", formatId: "1080p-mp4" })
        .expect(429);

      expect(res.body.code).toBe("RATE_LIMITED");
    });
  });

  describe("Rate limiting tiers (Phase 13)", () => {
    it("does not rate-limit job-status polling at a realistic 1.2s-interval pace", async () => {
      // Regression test: before the tiers were split, job-status
      // polling shared the same low bucket as /video/analyze and
      // /video/download. With the default RATE_LIMIT_PER_MINUTE=10,
      // the frontend's 1.2s polling interval (~50 req/min) would start
      // failing with 429s partway through any download longer than
      // ~12 seconds. The "polling" tier's default of 120/min must
      // comfortably clear this.
      //
      // Deliberately hits a non-existent job id — the throttler guard
      // runs before the route handler touches the database, so this
      // exercises the actual regression (rate limiting, not job
      // lookup) without needing a real DB write first.
      for (let i = 0; i < 15; i++) {
        const res = await request(app.getHttpServer())
          .get("/api/video/jobs/does-not-exist")
          .set("X-Forwarded-For", "203.0.113.50");
        expect(res.status).not.toBe(429);
      }
    });

    it("still rate-limits /video/download independently at its own (stricter) tier", async () => {
      const ip = "203.0.113.51";
      // RATE_LIMIT_DOWNLOAD_PER_MINUTE defaults to 5.
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/api/video/download")
          .set("X-Forwarded-For", ip)
          .send({ url: "https://example.com/video", formatId: "1080p-mp4" })
          .expect(201);
      }

      await request(app.getHttpServer())
        .post("/api/video/download")
        .set("X-Forwarded-For", ip)
        .send({ url: "https://example.com/video", formatId: "1080p-mp4" })
        .expect(429);
    });

    it("hitting the download limit does not affect the analyze (general) tier for the same IP", async () => {
      const ip = "203.0.113.52";
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/api/video/download")
          .set("X-Forwarded-For", ip)
          .send({ url: "https://example.com/video", formatId: "1080p-mp4" });
      }

      // download tier is now exhausted for this IP, but analyze uses
      // the separate "general" tier and should be unaffected.
      await request(app.getHttpServer())
        .post("/api/video/analyze")
        .set("X-Forwarded-For", ip)
        .send({ url: "https://example.com/video" })
        .expect(201);
    });
  });

  describe("Security headers (Phase 13, helmet)", () => {
    it("sets baseline security headers via helmet", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/video/analyze")
        .send({ url: "https://example.com/video" });

      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-dns-prefetch-control"]).toBe("off");
    });

    it("allows cross-origin resource loading (frontend fetches this API cross-origin)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/video/analyze")
        .send({ url: "https://example.com/video" });

      expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    });

    it("does not set a Content-Security-Policy header (belongs on apps/web, not this JSON/file API)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/video/analyze")
        .send({ url: "https://example.com/video" });

      expect(res.headers["content-security-policy"]).toBeUndefined();
    });
  });

  describe("GET /api/video/jobs/:id/file", () => {
    it("streams a completed job's file with correct headers, then deletes it", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/video/download")
        .send({ url: "https://example.com/video", formatId: "1080p-mp4" });

      const jobDir = join(TEMP_DIR, created.body.jobId);
      require("node:fs").mkdirSync(jobDir, { recursive: true });
      const filePath = join(jobDir, "output.mp4");
      writeFileSync(filePath, "fake mp4 bytes");

      await prisma.downloadJob.update({ where: { id: created.body.jobId }, data: { status: "completed" } });

      const res = await request(app.getHttpServer()).get(`/api/video/jobs/${created.body.jobId}/file`).expect(200);

      expect(res.headers["content-type"]).toBe("video/mp4");
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(require("node:fs").existsSync(filePath)).toBe(false); // deleted after streaming
    });

    it("returns JOB_NOT_READY (409) while a job is still processing", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/video/download")
        .send({ url: "https://example.com/video", formatId: "1080p-mp4" });

      const res = await request(app.getHttpServer()).get(`/api/video/jobs/${created.body.jobId}/file`).expect(409);
      expect(res.body.code).toBe("JOB_NOT_READY");
    });

    it("returns FILE_EXPIRED (410) when marked completed but the file is gone", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/video/download")
        .send({ url: "https://example.com/video", formatId: "1080p-mp4" });

      await prisma.downloadJob.update({ where: { id: created.body.jobId }, data: { status: "completed" } });

      const res = await request(app.getHttpServer()).get(`/api/video/jobs/${created.body.jobId}/file`).expect(410);
      expect(res.body.code).toBe("FILE_EXPIRED");
    });
  });

  describe("Session cookie (Section 17)", () => {
    it("sets an HttpOnly session_id cookie on first request", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/video/analyze")
        .send({ url: "https://example.com/video" })
        .expect(201);

      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const sessionCookie = (Array.isArray(cookies) ? cookies : [cookies]).find((c: string) =>
        c.startsWith("session_id="),
      );
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain("HttpOnly");
    });

    it("reuses the same session_id when the cookie is already present", async () => {
      const first = await request(app.getHttpServer())
        .post("/api/video/analyze")
        .send({ url: "https://example.com/video" });
      const cookie = first.headers["set-cookie"][0].split(";")[0];

      const second = await request(app.getHttpServer())
        .post("/api/video/analyze")
        .set("Cookie", cookie)
        .send({ url: "https://example.com/video" });

      expect(second.headers["set-cookie"]).toBeUndefined();
    });

    it("stores the session id on the created DownloadJob row", async () => {
      const analyzeRes = await request(app.getHttpServer())
        .post("/api/video/analyze")
        .send({ url: "https://example.com/video" });
      const cookie = analyzeRes.headers["set-cookie"][0].split(";")[0];
      const sessionIdFromCookie = decodeURIComponent(cookie.split("=")[1]);

      const downloadRes = await request(app.getHttpServer())
        .post("/api/video/download")
        .set("Cookie", cookie)
        .send({ url: "https://example.com/video", formatId: "1080p-mp4" });

      const dbJob = await prisma.downloadJob.findUnique({ where: { id: downloadRes.body.jobId } });
      expect(dbJob?.sessionId).toBe(sessionIdFromCookie);
    });
  });

  describe("Reliability: orphaned-row prevention on enqueue failure", () => {
    it("marks the job failed rather than leaving it stuck queued if enqueueing fails", async () => {
      const addSpy = jest.spyOn(queue, "add").mockRejectedValueOnce(new Error("Redis unreachable"));

      const res = await request(app.getHttpServer())
        .post("/api/video/download")
        .send({ url: "https://example.com/video", formatId: "1080p-mp4" })
        .expect(500);

      expect(res.body.code).toBe("PROCESSING_FAILED");

      addSpy.mockRestore();
    });
  });
});

describe("SSRF protection (e2e, real validator — no override)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const built = await buildApp(false);
    app = built.app;
    prisma = built.prisma;
  });

  afterEach(async () => {
    await prisma.downloadJob.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
  }, 15000);

  it("blocks a request targeting a loopback address", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/video/analyze")
      .send({ url: "http://127.0.0.1/internal-endpoint" })
      .expect(400);

    expect(res.body.code).toBe("INVALID_URL");
  });

  it("blocks a request targeting a private-range address", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/video/analyze")
      .send({ url: "http://10.0.0.5/internal-endpoint" })
      .expect(400);

    expect(res.body.code).toBe("INVALID_URL");
  });

  it("blocks a non-http(s) scheme", async () => {
    await request(app.getHttpServer()).post("/api/video/analyze").send({ url: "file:///etc/passwd" }).expect(400);
  });
});

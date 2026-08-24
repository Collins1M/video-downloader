/**
 * See video.e2e-spec.ts's top comment — same real-Postgres/Redis
 * requirement, same "CI-only, not sandbox-verified" caveat.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import helmet from "helmet";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { MediaAnalyzer } from "../video/media-analyzer.interface";
import { setupSwagger } from "../swagger";

const ADMIN_USER = "test-admin";
const ADMIN_PASS = "test-admin-password";

function authHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

describe("Admin endpoints (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.ADMIN_USERNAME = ADMIN_USER;
    process.env.ADMIN_PASSWORD = ADMIN_PASS;

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaAnalyzer)
      .useValue({ analyze: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api", { exclude: ["health", "metrics", "docs", "docs/json"] });
    setupSwagger(app);
    app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.downloadJob.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
  }, 15000);

  it("rejects requests with no credentials", async () => {
    await request(app.getHttpServer()).get("/api/admin/stats").expect(401);
  });

  it("rejects requests with wrong credentials", async () => {
    await request(app.getHttpServer())
      .get("/api/admin/stats")
      .set("Authorization", authHeader(ADMIN_USER, "wrong"))
      .expect(401);
  });

  it("returns real stats reflecting seeded DownloadJob rows", async () => {
    await prisma.downloadJob.createMany({
      data: [
        { sourceUrl: "https://example.com/a", format: "1080p-mp4", status: "completed", fileSize: 1_000_000 },
        { sourceUrl: "https://example.com/b", format: "1080p-mp4", status: "completed", fileSize: 2_000_000 },
        { sourceUrl: "https://example.com/c", format: "1080p-mp4", status: "failed" },
        { sourceUrl: "https://example.com/d", format: "1080p-mp4", status: "processing" },
      ],
    });

    const res = await request(app.getHttpServer())
      .get("/api/admin/stats")
      .set("Authorization", authHeader(ADMIN_USER, ADMIN_PASS))
      .expect(200);

    expect(res.body.totalRequests).toBe(4);
    expect(res.body.completedDownloads).toBe(2);
    expect(res.body.failedDownloads).toBe(1);
    expect(res.body.activeDownloads).toBe(1);
    expect(res.body.bandwidthBytes).toBe(3_000_000);
  });

  it("returns 14 days of zero-filled chart data", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/admin/charts")
      .set("Authorization", authHeader(ADMIN_USER, ADMIN_PASS))
      .expect(200);

    expect(res.body.downloadsPerDay.length).toBeGreaterThanOrEqual(14);
    expect(res.body.downloadsPerDay[0]).toHaveProperty("date");
    expect(res.body.downloadsPerDay[0]).toHaveProperty("value");
  });

  describe("GET /metrics (Phase 12, Prometheus)", () => {
    it("rejects requests with no credentials", async () => {
      await request(app.getHttpServer()).get("/metrics").expect(401);
    });

    it("returns Prometheus exposition format with correct credentials", async () => {
      const res = await request(app.getHttpServer())
        .get("/metrics")
        .set("Authorization", authHeader(ADMIN_USER, ADMIN_PASS))
        .expect(200);

      expect(res.text).toContain("api_http_requests_total");
      expect(res.text).toContain("download_jobs_by_status");
    });

    it("is not prefixed under /api", async () => {
      await request(app.getHttpServer())
        .get("/api/metrics")
        .set("Authorization", authHeader(ADMIN_USER, ADMIN_PASS))
        .expect(404);
    });
  });
});

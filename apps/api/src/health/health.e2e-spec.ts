import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { vi } from "vitest";
import request from "supertest";
import helmet from "helmet";
import { AppModule } from "../app.module";
import { MediaAnalyzer } from "../video/media-analyzer.interface";
import { setupSwagger } from "../swagger";
import { AppLoggerModule } from "../common/logging/logger.module";

describe("Health endpoint (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(AppLoggerModule)
      .useModule(
        class {
          static forRoot() {
            return { module: class {} };
          }
        },
      )
      .overrideProvider(MediaAnalyzer)
      .useValue({ analyze: vi.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api", { exclude: ["health", "metrics", "docs", "docs/json"] });
    setupSwagger(app);
    app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
    await app.init();
  });

  afterAll(async () => {
    try {
      if (app) {
        await app.close();
      }
    } catch (e) {
      // Ignore errors during cleanup if the app failed to start
    }
  }, 15000);

  it("GET /health returns ok when the database is reachable", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);
    expect(res.body).toEqual({ status: "ok", database: "ok" });
  });

  it("is not prefixed under /api", async () => {
    await request(app.getHttpServer()).get("/api/health").expect(404);
  });
});

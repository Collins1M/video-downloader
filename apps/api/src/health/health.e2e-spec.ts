import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import helmet from "helmet";
import { AppModule } from "../app.module";
import { MediaAnalyzer } from "../video/media-analyzer.interface";
import { setupSwagger } from "../swagger";

describe("Health endpoint (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaAnalyzer)
      .useValue({ analyze: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api", { exclude: ["health", "metrics", "docs", "docs/json"] });
    setupSwagger(app);
    app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  }, 15000);

  it("GET /health returns ok when the database is reachable", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);
    expect(res.body).toEqual({ status: "ok", database: "ok" });
  });

  it("is not prefixed under /api", async () => {
    await request(app.getHttpServer()).get("/api/health").expect(404);
  });
});

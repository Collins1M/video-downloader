import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "worker-cleanup-test-"));
process.env.REDIS_URL = "redis://localhost:6379";
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
process.env.TEMP_DIR = TEMP_DIR;
process.env.MAX_PROCESSING_TIME_SECONDS = "900";
process.env.TEMP_FILE_TTL_MINUTES = "30";

interface FakeJob {
  id: string;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
}
const store = new Map<string, FakeJob>();

vi.mock("./prisma", () => ({
  prisma: {
    downloadJob: {
      findMany: vi.fn(({ where }: any) => {
        const results = Array.from(store.values()).filter((job) => {
          if (where.status?.in && !where.status.in.includes(job.status)) return false;
          if (where.expiresAt?.lt && !(job.expiresAt && job.expiresAt < where.expiresAt.lt)) return false;
          if (where.createdAt?.lt && !(job.createdAt < where.createdAt.lt)) return false;
          return true;
        });
        return Promise.resolve(results.map((j) => ({ id: j.id })));
      }),
      deleteMany: vi.fn(({ where }: any) => {
        for (const id of where.id.in) store.delete(id);
        return Promise.resolve({ count: where.id.in.length });
      }),
      updateMany: vi.fn(({ where, data }: any) => {
        for (const id of where.id.in) {
          const job = store.get(id);
          if (job) Object.assign(job, data);
        }
        return Promise.resolve({ count: where.id.in.length });
      }),
    },
  },
}));

const { cleanupExpiredJobs } = await import("./cleanup");

function seed(job: FakeJob) {
  store.set(job.id, job);
}

describe("cleanupExpiredJobs", () => {
  beforeEach(() => {
    store.clear();
    for (const entry of readdirSync(TEMP_DIR)) {
      rmSync(join(TEMP_DIR, entry), { recursive: true, force: true });
    }
  });

  it("removes expired completed jobs and their temp directories", async () => {
    seed({ id: "old-completed", status: "completed", expiresAt: new Date(Date.now() - 60_000), createdAt: new Date() });
    mkdirSync(join(TEMP_DIR, "old-completed"));

    await cleanupExpiredJobs();

    expect(store.has("old-completed")).toBe(false);
    expect(existsSync(join(TEMP_DIR, "old-completed"))).toBe(false);
  });

  it("does not touch a completed job that hasn't expired yet", async () => {
    seed({ id: "fresh", status: "completed", expiresAt: new Date(Date.now() + 60_000), createdAt: new Date() });

    await cleanupExpiredJobs();

    expect(store.has("fresh")).toBe(true);
  });

  it("does not touch an active job even if old, unless truly abandoned", async () => {
    seed({ id: "active-recent", status: "processing", expiresAt: null, createdAt: new Date() });

    await cleanupExpiredJobs();

    expect(store.get("active-recent")?.status).toBe("processing");
  });

  it("fails and marks abandoned a job stuck processing for far longer than the processing budget", async () => {
    const wayInThePast = new Date(Date.now() - 900_000 * 2 * 2); // well past 2x MAX_PROCESSING_TIME_SECONDS
    seed({ id: "stuck", status: "processing", expiresAt: null, createdAt: wayInThePast });

    await cleanupExpiredJobs();

    expect(store.get("stuck")?.status).toBe("failed");
  });

  it("leaves queued/cancelled/failed terminal-but-unexpired jobs alone", async () => {
    seed({ id: "queued-recent", status: "queued", expiresAt: null, createdAt: new Date() });
    seed({ id: "failed-unexpired", status: "failed", expiresAt: new Date(Date.now() + 60_000), createdAt: new Date() });

    await cleanupExpiredJobs();

    expect(store.has("queued-recent")).toBe(true);
    expect(store.has("failed-unexpired")).toBe(true);
  });
});

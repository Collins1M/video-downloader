import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// queue-processor.ts reads these at module-load time (loadWorkerConfig()
// runs at the top of the file) — must be set before it's ever imported.
const TEMP_DIR = mkdtempSync(join(tmpdir(), "worker-test-"));
process.env.REDIS_URL = "redis://localhost:6379";
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
process.env.TEMP_DIR = TEMP_DIR;
process.env.MAX_VIDEO_SIZE_MB = "2048";
process.env.MAX_PROCESSING_TIME_SECONDS = "900";
process.env.TEMP_FILE_TTL_MINUTES = "30";

afterAll(() => {
  rmSync(TEMP_DIR, { recursive: true, force: true });
});

// --- In-memory fake Prisma, standing in for a real DB connection this
// sandbox can't provide (no network access to the Prisma engine binary
// CDN — see repo READMEs for the recurring caveat). ---
interface FakeJob {
  id: string;
  status: string;
  sourceUrl: string;
  format: string;
  progress: number;
  error: string | null;
  fileSize: number | null;
  title: string | null;
  duration: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
}
const store = new Map<string, FakeJob>();

vi.mock("./prisma", () => ({
  prisma: {
    downloadJob: {
      findUnique: vi.fn(({ where: { id } }: { where: { id: string } }) => Promise.resolve(store.get(id) ?? null)),
      update: vi.fn(({ where: { id }, data }: { where: { id: string }; data: Partial<FakeJob> }) => {
        const existing = store.get(id);
        if (!existing) throw new Error("not found");
        const updated = { ...existing, ...data };
        store.set(id, updated);
        return Promise.resolve(updated);
      }),
    },
  },
}));

vi.mock("@video-downloader/security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@video-downloader/security")>();
  return {
    ...actual,
    validateUrl: vi.fn().mockResolvedValue(new URL("https://example.com/video")),
  };
});

const fetchYtDlpInfoMock = vi.fn();
const fetchYtDlpFormatMock = vi.fn();
const resolveFormatTargetMock = vi.fn();

vi.mock("@video-downloader/media-extractor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@video-downloader/media-extractor")>();
  return {
    ...actual,
    fetchYtDlpInfo: (...args: unknown[]) => fetchYtDlpInfoMock(...args),
    fetchYtDlpFormat: (...args: unknown[]) => fetchYtDlpFormatMock(...args),
    resolveFormatTarget: (...args: unknown[]) => resolveFormatTargetMock(...args),
  };
});

const mergeVideoAudioMock = vi.fn();
const remuxToMp4Mock = vi.fn();
const extractAudioToMp3Mock = vi.fn();

vi.mock("./ffmpeg", () => ({
  mergeVideoAudio: (...args: unknown[]) => mergeVideoAudioMock(...args),
  remuxToMp4: (...args: unknown[]) => remuxToMp4Mock(...args),
  extractAudioToMp3: (...args: unknown[]) => extractAudioToMp3Mock(...args),
}));

const { processVideoJob } = await import("./queue-processor");

function fakeBullJob(
  data: { downloadJobId: string; sourceUrl: string; formatId: string },
  opts: { attempts?: number; attemptsMade?: number } = {},
) {
  return {
    data,
    opts: { attempts: opts.attempts ?? 1 },
    attemptsMade: opts.attemptsMade ?? 0,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function seedJob(overrides: Partial<FakeJob> = {}): FakeJob {
  const job: FakeJob = {
    id: overrides.id ?? "job1",
    status: "queued",
    sourceUrl: "https://example.com/video",
    format: "1080p-mp4",
    progress: 0,
    error: null,
    fileSize: null,
    title: null,
    duration: null,
    startedAt: null,
    completedAt: null,
    expiresAt: null,
    ...overrides,
  };
  store.set(job.id, job);
  return job;
}

// The ffmpeg mocks stand in for real transcoding — they just need to
// leave a file at the output path so the pipeline's real fs.stat/
// fs.unlink calls have something real to operate on.
function makeFfmpegWriteOutput(mock: ReturnType<typeof vi.fn>) {
  mock.mockImplementation(async (...args: unknown[]) => {
    // mergeVideoAudio(video, audio, output, ...) / remuxToMp4(input, output, ...) /
    // extractAudioToMp3(input, output, ...) — output path is always the
    // second-to-last positional arg before duration/onProgress in our
    // call signatures except remux/extract which put it second.
    const outputPath = args.find((a) => typeof a === "string" && a.includes("output."));
    if (typeof outputPath === "string") writeFileSync(outputPath, "fake media bytes");
  });
}

describe("processVideoJob", () => {
  beforeEach(() => {
    store.clear();
    for (const entry of readdirSync(TEMP_DIR)) {
      rmSync(join(TEMP_DIR, entry), { recursive: true, force: true });
    }
    fetchYtDlpInfoMock.mockReset();
    fetchYtDlpFormatMock.mockReset().mockResolvedValue(undefined);
    resolveFormatTargetMock.mockReset();
    mergeVideoAudioMock.mockReset();
    remuxToMp4Mock.mockReset();
    extractAudioToMp3Mock.mockReset();
    makeFfmpegWriteOutput(mergeVideoAudioMock);
    makeFfmpegWriteOutput(remuxToMp4Mock);
    makeFfmpegWriteOutput(extractAudioToMp3Mock);

    fetchYtDlpInfoMock.mockResolvedValue({ id: "x", title: "Test Video", duration: 120, formats: [] });
  });

  it("returns early without processing an already-cancelled job", async () => {
    seedJob({ id: "job1", status: "cancelled" });
    resolveFormatTargetMock.mockReturnValue({ kind: "video", container: "mp4", videoFormatId: "a", audioFormatId: null });

    await processVideoJob(fakeBullJob({ downloadJobId: "job1", sourceUrl: "https://example.com/video", formatId: "1080p-mp4" }));

    expect(store.get("job1")?.status).toBe("cancelled"); // untouched
    expect(fetchYtDlpInfoMock).not.toHaveBeenCalled();
  });

  it("merges separate video+audio tracks and marks the job completed", async () => {
    seedJob({ id: "job1", format: "1080p-mp4" });
    resolveFormatTargetMock.mockReturnValue({
      kind: "video",
      container: "mp4",
      videoFormatId: "137",
      audioFormatId: "140",
    });

    await processVideoJob(fakeBullJob({ downloadJobId: "job1", sourceUrl: "https://example.com/video", formatId: "1080p-mp4" }));

    expect(mergeVideoAudioMock).toHaveBeenCalledOnce();
    expect(remuxToMp4Mock).not.toHaveBeenCalled();
    expect(fetchYtDlpFormatMock).toHaveBeenCalledTimes(2); // video + audio

    const finalJob = store.get("job1");
    expect(finalJob?.status).toBe("completed");
    expect(finalJob?.progress).toBe(100);
    expect(finalJob?.fileSize).toBeGreaterThan(0);
    expect(finalJob?.title).toBe("Test Video");
  });

  it("remuxes an already-muxed source without a separate audio fetch", async () => {
    seedJob({ id: "job1", format: "360p-mp4" });
    resolveFormatTargetMock.mockReturnValue({
      kind: "video",
      container: "mp4",
      videoFormatId: "18",
      audioFormatId: null,
    });

    await processVideoJob(fakeBullJob({ downloadJobId: "job1", sourceUrl: "https://example.com/video", formatId: "360p-mp4" }));

    expect(remuxToMp4Mock).toHaveBeenCalledOnce();
    expect(mergeVideoAudioMock).not.toHaveBeenCalled();
    expect(fetchYtDlpFormatMock).toHaveBeenCalledTimes(1); // video only
    expect(store.get("job1")?.status).toBe("completed");
  });

  it("extracts audio-only requests to mp3", async () => {
    seedJob({ id: "job1", format: "128kbps-mp3" });
    resolveFormatTargetMock.mockReturnValue({
      kind: "audio",
      container: "mp3",
      audioFormatId: "140",
      bitrateKbps: 128,
    });

    await processVideoJob(fakeBullJob({ downloadJobId: "job1", sourceUrl: "https://example.com/video", formatId: "128kbps-mp3" }));

    expect(extractAudioToMp3Mock).toHaveBeenCalledOnce();
    expect(mergeVideoAudioMock).not.toHaveBeenCalled();
    expect(remuxToMp4Mock).not.toHaveBeenCalled();
    expect(store.get("job1")?.status).toBe("completed");
  });

  it("marks the job failed with a friendly message when the format is no longer available", async () => {
    seedJob({ id: "job1", format: "2160p-mp4" });
    const { FormatNotFoundError } = await import("@video-downloader/media-extractor");
    resolveFormatTargetMock.mockImplementation(() => {
      throw new FormatNotFoundError();
    });

    await expect(
      processVideoJob(fakeBullJob({ downloadJobId: "job1", sourceUrl: "https://example.com/video", formatId: "2160p-mp4" })),
    ).rejects.toThrow();

    const finalJob = store.get("job1");
    expect(finalJob?.status).toBe("failed");
    expect(finalJob?.error).toBe("The requested format is no longer available for this video.");
    // The per-job temp dir should be cleaned up, not left behind.
    expect(existsSync(join(TEMP_DIR, "job1"))).toBe(false);
  });

  it("rejects and cleans up when the finished file exceeds the configured size limit", async () => {
    seedJob({ id: "job2", format: "360p-mp4" });
    resolveFormatTargetMock.mockReturnValue({ kind: "video", container: "mp4", videoFormatId: "18", audioFormatId: null });

    const originalMax = process.env.MAX_VIDEO_SIZE_MB;
    process.env.MAX_VIDEO_SIZE_MB = "0.000001"; // ~1 byte — the dummy fixture file will exceed this

    // loadWorkerConfig() is read once at module-import time in
    // queue-processor.ts, so re-importing with a fresh module registry
    // is the only way to pick up the new env value for this one test.
    vi.resetModules();
    const { processVideoJob: processWithTinyLimit } = await import("./queue-processor");

    await expect(
      processWithTinyLimit(fakeBullJob({ downloadJobId: "job2", sourceUrl: "https://example.com/video", formatId: "360p-mp4" })),
    ).rejects.toThrow();

    expect(store.get("job2")?.status).toBe("failed");
    expect(store.get("job2")?.error).toBe("This video exceeds the maximum supported file size.");

    process.env.MAX_VIDEO_SIZE_MB = originalMax;
  });

  it("does NOT retry a permanent failure even when retry attempts remain", async () => {
    seedJob({ id: "job3", format: "2160p-mp4" });
    const { FormatNotFoundError } = await import("@video-downloader/media-extractor");
    resolveFormatTargetMock.mockImplementation(() => {
      throw new FormatNotFoundError();
    });

    // 3 attempts allowed, but this is the FIRST attempt — a permanent
    // error must still fail immediately, not wait for retries.
    await expect(
      processVideoJob(
        fakeBullJob(
          { downloadJobId: "job3", sourceUrl: "https://example.com/video", formatId: "2160p-mp4" },
          { attempts: 3, attemptsMade: 0 },
        ),
      ),
    ).rejects.toThrow("The requested format is no longer available for this video.");

    expect(store.get("job3")?.status).toBe("failed");
  });

  it("resets to queued (not failed) on a transient error with retries remaining", async () => {
    seedJob({ id: "job4", format: "1080p-mp4" });
    resolveFormatTargetMock.mockReturnValue({ kind: "video", container: "mp4", videoFormatId: "137", audioFormatId: "140" });
    // Simulate a transient failure partway through — the second yt-dlp
    // fetch (audio track) fails.
    fetchYtDlpFormatMock
      .mockResolvedValueOnce(undefined) // video fetch succeeds
      .mockRejectedValueOnce(new Error("ECONNRESET")); // audio fetch fails transiently

    await expect(
      processVideoJob(
        fakeBullJob(
          { downloadJobId: "job4", sourceUrl: "https://example.com/video", formatId: "1080p-mp4" },
          { attempts: 3, attemptsMade: 0 }, // first of 3 attempts — retries remain
        ),
      ),
    ).rejects.toThrow();

    const job = store.get("job4");
    expect(job?.status).toBe("queued"); // not "failed" — will be retried by BullMQ
    expect(job?.progress).toBe(0);
    // Partial files from this attempt are cleaned up so the retry starts fresh.
    expect(existsSync(join(TEMP_DIR, "job4"))).toBe(false);
  });

  it("marks failed (not queued) on a transient error when this was the final attempt", async () => {
    seedJob({ id: "job5", format: "1080p-mp4" });
    resolveFormatTargetMock.mockReturnValue({ kind: "video", container: "mp4", videoFormatId: "137", audioFormatId: "140" });
    fetchYtDlpFormatMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("ECONNRESET"));

    await expect(
      processVideoJob(
        fakeBullJob(
          { downloadJobId: "job5", sourceUrl: "https://example.com/video", formatId: "1080p-mp4" },
          { attempts: 3, attemptsMade: 2 }, // this IS the 3rd/final attempt
        ),
      ),
    ).rejects.toThrow();

    const job = store.get("job5");
    expect(job?.status).toBe("failed");
    expect(job?.error).toBe("Something went wrong while preparing your download. Please try again.");
  });
});

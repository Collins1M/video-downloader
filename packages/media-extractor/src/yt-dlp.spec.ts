import { describe, it, expect, vi, beforeEach } from "vitest";

const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

const { runYtDlp, fetchYtDlpInfo } = await import("./yt-dlp");
const { UnsupportedSourceError, VideoUnavailableError, ExtractionTimeoutError, ExtractionFailedError } =
  await import("./errors");

function mockExecResult(error: (Error & { killed?: boolean; signal?: string }) | null, stdout = "", stderr = "") {
  execFileMock.mockImplementation((_cmd, _args, _opts, callback) => {
    callback(error, stdout, stderr);
  });
}

describe("runYtDlp error classification", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("resolves with stdout on success", async () => {
    mockExecResult(null, '{"title":"ok"}', "");
    await expect(runYtDlp(["--dump-single-json"], { timeoutMs: 1000 })).resolves.toBe('{"title":"ok"}');
  });

  it("classifies a killed/timed-out process as ExtractionTimeoutError", async () => {
    const err = Object.assign(new Error("killed"), { killed: true });
    mockExecResult(err, "", "");
    await expect(runYtDlp(["--dump-single-json"], { timeoutMs: 1000 })).rejects.toThrow(ExtractionTimeoutError);
  });

  it("classifies SIGTERM as ExtractionTimeoutError", async () => {
    const err = Object.assign(new Error("terminated"), { signal: "SIGTERM" });
    mockExecResult(err, "", "");
    await expect(runYtDlp(["--dump-single-json"], { timeoutMs: 1000 })).rejects.toThrow(ExtractionTimeoutError);
  });

  it("classifies 'Unsupported URL' stderr as UnsupportedSourceError", async () => {
    const err = new Error("exit 1");
    mockExecResult(err, "", "ERROR: Unsupported URL: https://example.com/x");
    await expect(runYtDlp(["--dump-single-json"], { timeoutMs: 1000 })).rejects.toThrow(UnsupportedSourceError);
  });

  it("classifies 'Video unavailable' stderr as VideoUnavailableError", async () => {
    const err = new Error("exit 1");
    mockExecResult(err, "", "ERROR: Video unavailable");
    await expect(runYtDlp(["--dump-single-json"], { timeoutMs: 1000 })).rejects.toThrow(VideoUnavailableError);
  });

  it("classifies 'Private video' stderr as VideoUnavailableError", async () => {
    const err = new Error("exit 1");
    mockExecResult(err, "", "ERROR: Private video. Sign in if you've been granted access");
    await expect(runYtDlp(["--dump-single-json"], { timeoutMs: 1000 })).rejects.toThrow(VideoUnavailableError);
  });

  it("falls back to ExtractionFailedError for unrecognized stderr", async () => {
    const err = new Error("exit 1");
    mockExecResult(err, "", "ERROR: something totally unexpected happened");
    await expect(runYtDlp(["--dump-single-json"], { timeoutMs: 1000 })).rejects.toThrow(ExtractionFailedError);
  });

  it("is case-insensitive when matching stderr patterns", async () => {
    const err = new Error("exit 1");
    mockExecResult(err, "", "error: UNSUPPORTED URL provided");
    await expect(runYtDlp(["--dump-single-json"], { timeoutMs: 1000 })).rejects.toThrow(UnsupportedSourceError);
  });
});

describe("fetchYtDlpInfo", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("parses valid JSON output", async () => {
    mockExecResult(null, JSON.stringify({ id: "x", title: "Video", formats: [] }), "");
    const info = await fetchYtDlpInfo("https://example.com/video", 5000);
    expect(info.title).toBe("Video");
  });

  it("throws ExtractionFailedError for non-JSON stdout", async () => {
    mockExecResult(null, "not json at all", "");
    await expect(fetchYtDlpInfo("https://example.com/video", 5000)).rejects.toThrow(ExtractionFailedError);
  });

  it("passes the URL as a single argv element after `--`, never shell-concatenated", async () => {
    mockExecResult(null, JSON.stringify({ id: "x", title: "t", formats: [] }), "");
    await fetchYtDlpInfo("https://example.com/video?x=1&y=2", 5000);

    const [command, args] = execFileMock.mock.calls[0];
    expect(command).toBe("yt-dlp");
    expect(args).toContain("--");
    // The URL is its own argv entry, not merged into another flag —
    // this is what prevents flag/shell injection via a crafted URL.
    expect(args[args.length - 1]).toBe("https://example.com/video?x=1&y=2");
  });
});

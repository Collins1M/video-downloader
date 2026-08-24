import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DownloaderPanel } from "./downloader-panel";

const {
  analyzeVideoMock,
  createDownloadMock,
  cancelJobMock,
  getJobFileUrlMock,
  getJobEventsUrlMock,
  FakeApiError,
} = vi.hoisted(() => {
  class FakeApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    analyzeVideoMock: vi.fn(),
    createDownloadMock: vi.fn(),
    cancelJobMock: vi.fn(),
    getJobFileUrlMock: vi.fn(),
    getJobEventsUrlMock: vi.fn(),
    FakeApiError,
  };
});

vi.mock("@/lib/api", () => ({
  analyzeVideo: (...args: unknown[]) => analyzeVideoMock(...args),
  createDownload: (...args: unknown[]) => createDownloadMock(...args),
  cancelJob: (...args: unknown[]) => cancelJobMock(...args),
  getJobFileUrl: (...args: unknown[]) => getJobFileUrlMock(...args),
  getJobEventsUrl: (...args: unknown[]) => getJobEventsUrlMock(...args),
  ApiError: FakeApiError,
}));

/**
 * jsdom doesn't implement EventSource, so DownloaderPanel's `new
 * EventSource(url, { withCredentials: true })` throws in tests unless
 * something stands in for the global. This double tracks every instance
 * that gets constructed (there's normally exactly one active at a time,
 * but a test may want to assert on the one the component just opened)
 * and gives tests direct control over emitting `message`/`error` events
 * without any real network or timer involved — closer to the actual
 * server push than the old fake-timer + mockResolvedValueOnce polling
 * approach this replaces.
 */
class MockEventSource {
  static instances: MockEventSource[] = [];
  static readonly CLOSED = 2;

  url: string;
  withCredentials: boolean;
  readyState = 0;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string, opts?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = opts?.withCredentials ?? false;
    this.readyState = 1;
    MockEventSource.instances.push(this);
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  emitError() {
    this.readyState = MockEventSource.CLOSED;
    this.onerror?.();
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
    this.closed = true;
  }
}

const analyzeResponse = {
  success: true,
  video: { title: "Test Video", thumbnail: "", duration: 90, source: "example.com" },
  formats: [
    { id: "1080p-mp4", type: "video", container: "mp4", resolution: "1080p", estimatedSize: 1_000_000 },
    { id: "128kbps-mp3", type: "audio", container: "mp3", bitrateKbps: 128, estimatedSize: 500_000 },
  ],
};

describe("DownloaderPanel", () => {
  beforeEach(() => {
    analyzeVideoMock.mockReset();
    createDownloadMock.mockReset();
    cancelJobMock.mockReset();
    getJobFileUrlMock.mockReset().mockReturnValue("http://localhost:4000/api/video/jobs/job1/file");
    getJobEventsUrlMock.mockReset().mockReturnValue("http://localhost:4000/api/video/jobs/job1/events");
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function typeUrlAndAnalyze(user: ReturnType<typeof userEvent.setup>) {
    const input = screen.getByPlaceholderText("Paste video URL here...");
    await user.type(input, "https://example.com/video");
    await user.click(screen.getByRole("button", { name: /analyze video/i }));
  }

  it("renders the URL input initially", () => {
    render(<DownloaderPanel />);
    expect(screen.getByPlaceholderText("Paste video URL here...")).toBeInTheDocument();
  });

  it("shows results after a successful analyze", async () => {
    const user = userEvent.setup();
    analyzeVideoMock.mockResolvedValue(analyzeResponse);

    render(<DownloaderPanel />);
    await typeUrlAndAnalyze(user);

    await waitFor(() => expect(screen.getByText("Test Video")).toBeInTheDocument());
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("1080p")).toBeInTheDocument();
    expect(analyzeVideoMock).toHaveBeenCalledWith("https://example.com/video");
  });

  it("shows the API's friendly error message when analyze fails", async () => {
    const user = userEvent.setup();
    analyzeVideoMock.mockRejectedValue(new FakeApiError("Please enter a valid video URL.", "INVALID_URL"));

    render(<DownloaderPanel />);
    await typeUrlAndAnalyze(user);

    await waitFor(() => expect(screen.getByText("Please enter a valid video URL.")).toBeInTheDocument());
  });

  it("opens an SSE stream on download and updates progress as events arrive", async () => {
    const user = userEvent.setup();
    analyzeVideoMock.mockResolvedValue(analyzeResponse);
    createDownloadMock.mockResolvedValue({ jobId: "job1" });

    render(<DownloaderPanel />);
    await typeUrlAndAnalyze(user);
    await waitFor(() => expect(screen.getByText("Test Video")).toBeInTheDocument());

    const downloadButtons = screen.getAllByRole("button", { name: /download 1080p mp4/i });
    await user.click(downloadButtons[0]);

    await waitFor(() => expect(createDownloadMock).toHaveBeenCalledWith("https://example.com/video", "1080p-mp4"));
    expect(screen.getByText(/preparing your download/i)).toBeInTheDocument();

    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    const source = MockEventSource.instances[0];
    expect(source.url).toBe("http://localhost:4000/api/video/jobs/job1/events");
    expect(source.withCredentials).toBe(true);

    source.emit({ jobId: "job1", status: "processing", progress: 40 });
    await waitFor(() => expect(screen.getByText("40%")).toBeInTheDocument());
  });

  it("triggers a file download and closes the stream when the completed event arrives", async () => {
    const user = userEvent.setup();
    analyzeVideoMock.mockResolvedValue(analyzeResponse);
    createDownloadMock.mockResolvedValue({ jobId: "job1" });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<DownloaderPanel />);
    await typeUrlAndAnalyze(user);
    await waitFor(() => expect(screen.getByText("Test Video")).toBeInTheDocument());

    const downloadButtons = screen.getAllByRole("button", { name: /download 1080p mp4/i });
    await user.click(downloadButtons[0]);
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    const source = MockEventSource.instances[0];

    source.emit({ jobId: "job1", status: "completed", progress: 100 });

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(source.closed).toBe(true);

    clickSpy.mockRestore();
  });

  it("shows a friendly error and closes the stream if a job fails", async () => {
    const user = userEvent.setup();
    analyzeVideoMock.mockResolvedValue(analyzeResponse);
    createDownloadMock.mockResolvedValue({ jobId: "job1" });

    render(<DownloaderPanel />);
    await typeUrlAndAnalyze(user);
    await waitFor(() => expect(screen.getByText("Test Video")).toBeInTheDocument());

    const downloadButtons = screen.getAllByRole("button", { name: /download 1080p mp4/i });
    await user.click(downloadButtons[0]);
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    const source = MockEventSource.instances[0];

    source.emit({
      jobId: "job1",
      status: "failed",
      progress: 20,
      error: "This video exceeds the maximum supported file size.",
    });

    await waitFor(() =>
      expect(screen.getByText("This video exceeds the maximum supported file size.")).toBeInTheDocument(),
    );
    expect(source.closed).toBe(true);
  });

  it("shows a connection error if the stream closes unexpectedly", async () => {
    const user = userEvent.setup();
    analyzeVideoMock.mockResolvedValue(analyzeResponse);
    createDownloadMock.mockResolvedValue({ jobId: "job1" });

    render(<DownloaderPanel />);
    await typeUrlAndAnalyze(user);
    await waitFor(() => expect(screen.getByText("Test Video")).toBeInTheDocument());

    const downloadButtons = screen.getAllByRole("button", { name: /download 1080p mp4/i });
    await user.click(downloadButtons[0]);
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    const source = MockEventSource.instances[0];

    source.emitError();

    await waitFor(() =>
      expect(screen.getByText("Lost connection while downloading. Please try again.")).toBeInTheDocument(),
    );
  });

  it("cancels an in-progress download", async () => {
    const user = userEvent.setup();
    analyzeVideoMock.mockResolvedValue(analyzeResponse);
    createDownloadMock.mockResolvedValue({ jobId: "job1" });
    cancelJobMock.mockResolvedValue({ id: "job1", status: "cancelled", progress: 10 });

    render(<DownloaderPanel />);
    await typeUrlAndAnalyze(user);
    await waitFor(() => expect(screen.getByText("Test Video")).toBeInTheDocument());

    const downloadButtons = screen.getAllByRole("button", { name: /download 1080p mp4/i });
    await user.click(downloadButtons[0]);
    await waitFor(() => expect(screen.getByText(/preparing your download/i)).toBeInTheDocument());
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    const source = MockEventSource.instances[0];

    await user.click(screen.getByRole("button", { name: /cancel download/i }));

    expect(cancelJobMock).toHaveBeenCalledWith("job1");
    expect(source.closed).toBe(true);
    await waitFor(() => expect(screen.getByPlaceholderText("Paste video URL here...")).toBeInTheDocument());
  });
});

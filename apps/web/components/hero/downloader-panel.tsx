"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalyzeResponse, FormatOption, JobStatusResponse } from "@video-downloader/types";
import { analyzeVideo, createDownload, cancelJob, getJobFileUrl, getJobEventsUrl, ApiError } from "@/lib/api";
import { captureClientError } from "@/lib/sentry";
import { UrlInputForm } from "./url-input-form";
import { AnalyzingState } from "./analyzing-state";
import { VideoInfoCard } from "./video-info-card";
import { FormatList } from "./format-list";
import { DownloadProgress } from "./download-progress";

type Flow =
  | { step: "idle" }
  | { step: "analyzing" }
  | { step: "analyzed"; result: AnalyzeResponse }
  | { step: "error"; message: string }
  | { step: "downloading"; jobId: string; progress: number; formatLabel: string }
  | { step: "download-error"; message: string };

export function DownloaderPanel() {
  const [url, setUrl] = useState("");
  const [flow, setFlow] = useState<Flow>({ step: "idle" });
  const eventSourceRef = useRef<EventSource | null>(null);
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => stopStreaming, [stopStreaming]);

  async function handleAnalyze() {
    setFlow({ step: "analyzing" });
    try {
      const result = await analyzeVideo(url.trim());
      setFlow({ step: "analyzed", result });
    } catch (err) {
      setFlow({ step: "error", message: friendlyMessage(err) });
    }
  }

  async function handleSelectFormat(format: FormatOption) {
    const formatLabel =
      format.type === "video" ? `${format.resolution} ${format.container.toUpperCase()}` : `${format.bitrateKbps} kbps ${format.container.toUpperCase()}`;

    try {
      const { jobId } = await createDownload(url.trim(), format.id);
      setFlow({ step: "downloading", jobId, progress: 0, formatLabel });

      // Replaces the old setInterval + getJobStatus poll (Phase 14, item
      // 19): the API pushes progress over SSE instead of the client
      // asking every 1.2s. `withCredentials` is required so the
      // anonymous session_id cookie rides along — EventSource doesn't
      // send cookies cross-origin by default the way fetch's
      // `credentials: "include"` does.
      const source = new EventSource(getJobEventsUrl(jobId), { withCredentials: true });
      eventSourceRef.current = source;

      source.onmessage = (event) => {
        let status: JobStatusResponse;
        try {
          status = JSON.parse(event.data);
        } catch (err) {
          stopStreaming();
          setFlow({ step: "download-error", message: friendlyMessage(err) });
          return;
        }

        if (status.status === "completed") {
          stopStreaming();
          setFlow({ step: "downloading", jobId, progress: 100, formatLabel });
          downloadLinkRef.current?.setAttribute("href", getJobFileUrl(jobId));
          downloadLinkRef.current?.click();
          // Return to idle after a few seconds, giving enough time for the
          // browser's download handoff to feel distinct from the UI reset.
          setTimeout(() => setFlow({ step: "idle" }), 5000);
          return;
        }

        if (status.status === "failed") {
          stopStreaming();
          setFlow({ step: "download-error", message: status.error ?? "This download failed. Please try again." });
          return;
        }

        if (status.status === "cancelled") {
          stopStreaming();
          setFlow({ step: "idle" });
          return;
        }

        setFlow((prev) =>
          prev.step === "downloading" ? { ...prev, progress: status.progress } : prev,
        );
      };

      source.onerror = () => {
        // EventSource retries transparently on transient network errors,
        // but a 404 (job genuinely gone) or a connection the browser has
        // given up on both surface here too — the readyState tells them
        // apart. CLOSED means the browser isn't going to retry itself,
        // so treat it as terminal rather than leaving the UI stuck.
        if (source.readyState === EventSource.CLOSED) {
          stopStreaming();
          setFlow({ step: "download-error", message: "Lost connection while downloading. Please try again." });
        }
      };
    } catch (err) {
      setFlow({ step: "download-error", message: friendlyMessage(err) });
    }
  }

  async function handleCancel() {
    if (flow.step !== "downloading") return;
    stopStreaming();
    try {
      await cancelJob(flow.jobId);
    } catch {
      // Best-effort — the job will still self-expire server-side.
    }
    setFlow({ step: "idle" });
  }

  function handleReset() {
    stopStreaming();
    setFlow({ step: "idle" });
  }

  return (
    <div className="w-full max-w-2xl">
      {/* Hidden anchor used purely to trigger the browser's native download UI once a job completes. */}
      <a ref={downloadLinkRef} className="hidden" download aria-hidden="true" />

      {(flow.step === "idle" || flow.step === "error") && (
        <>
          <UrlInputForm url={url} onUrlChange={setUrl} onSubmit={handleAnalyze} disabled={false} />
          {flow.step === "error" && (
            <p className="mt-3 text-center font-mono text-sm text-amber">{flow.message}</p>
          )}
        </>
      )}

      {flow.step === "analyzing" && <AnalyzingState />}

      {flow.step === "analyzed" && (
        <div className="space-y-6">
          <VideoInfoCard video={flow.result.video} />
          <FormatList formats={flow.result.formats} onSelect={handleSelectFormat} disabled={false} />
          <button
            type="button"
            onClick={handleReset}
            className="mx-auto block font-mono text-xs uppercase tracking-wide text-ink-muted transition-colors hover:text-ink"
          >
            ← Analyze a different video
          </button>
        </div>
      )}

      {flow.step === "downloading" && (
        <DownloadProgress
          progress={flow.progress}
          formatLabel={flow.formatLabel}
          onCancel={handleCancel}
        />
      )}

      {flow.step === "download-error" && (
        <div className="animate-fade-up rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="font-mono text-sm text-amber">{flow.message}</p>
          <button
            type="button"
            onClick={handleReset}
            className="mt-4 font-mono text-xs uppercase tracking-wide text-ink-muted transition-colors hover:text-ink"
          >
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

function friendlyMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  // Not an ApiError means something genuinely unexpected happened
  // (network failure, unparseable response, a code bug) rather than an
  // expected, already-friendly-messaged API failure — worth reporting.
  captureClientError(err);
  return "Something went wrong. Please try again.";
}

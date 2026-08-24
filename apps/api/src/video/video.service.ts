import { Injectable, type MessageEvent } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { Observable } from "rxjs";
import { promises as fs } from "node:fs";
import type {
  AnalyzeResponse,
  CreateDownloadResponse,
  JobStatusResponse,
  VideoProcessingJobData,
} from "@video-downloader/types";
import { VIDEO_PROCESSING_QUEUE } from "@video-downloader/types";
import { safeTempFilePath } from "@video-downloader/security";
import { outputFileName } from "@video-downloader/media-extractor";
import { PrismaService } from "../prisma/prisma.service";
import { MediaAnalyzer } from "./media-analyzer.interface";
import {
  JobNotFoundException,
  JobNotReadyException,
  FileExpiredException,
  ProcessingFailedException,
} from "../common/exceptions/app-exceptions";
import { UrlValidatorService } from "../common/security/url-validator.service";
import { withTimeout } from "../common/with-timeout";
import { QueueEventsService } from "../queue/queue-events.service";

@Injectable()
export class VideoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaAnalyzer: MediaAnalyzer,
    private readonly config: ConfigService,
    private readonly urlValidator: UrlValidatorService,
    private readonly queueEvents: QueueEventsService,
    @InjectQueue(VIDEO_PROCESSING_QUEUE) private readonly queue: Queue<VideoProcessingJobData>,
  ) {}

  async analyze(url: string): Promise<AnalyzeResponse> {
    // Section 13: reject non-http(s) schemes, private/loopback/link-local
    // targets, and hostnames that resolve to them, before anything ever
    // touches the URL.
    await this.urlValidator.validate(url);
    return this.mediaAnalyzer.analyze(url);
  }

  async createDownload(
    url: string,
    formatId: string,
    ipAddress: string,
    sessionId: string,
    requestId?: string,
  ): Promise<CreateDownloadResponse> {
    await this.urlValidator.validate(url);

    const ttlMinutes = Number(this.config.get("TEMP_FILE_TTL_MINUTES") ?? 30);

    const job = await this.prisma.downloadJob.create({
      data: {
        sourceUrl: url,
        format: formatId,
        status: "queued",
        progress: 0,
        ipAddress,
        sessionId,
        requestId,
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      },
    });

    const attempts = Number(this.config.get("JOB_RETRY_ATTEMPTS") ?? 3);
    const backoffMs = Number(this.config.get("JOB_RETRY_BACKOFF_MS") ?? 15_000);

    try {
      // jobId is pinned to the DownloadJob row id so the worker never
      // has to look anything up beyond the id it already receives — one
      // id, one source of truth, in both BullMQ and Postgres. requestId
      // threads the originating HTTP request's correlation id through
      // to the worker's logs (Phase 12).
      //
      // Wrapped in a timeout: BullMQ's recommended Redis client config
      // (maxRetriesPerRequest: null) means a Redis outage would
      // otherwise make this call — and the whole request — hang
      // indefinitely instead of failing with a clear error.
      await withTimeout(
        this.queue.add(
          "process",
          { downloadJobId: job.id, sourceUrl: url, formatId, requestId },
          { jobId: job.id, attempts, backoff: { type: "exponential", delay: backoffMs } },
        ),
        5000,
        "enqueue download job",
      );
    } catch (err) {
      // The DB row already exists but nothing will ever process it —
      // that's an orphaned "queued forever" job, not a graceful
      // failure. Mark it failed immediately rather than let the user
      // (and the abandoned-job cleanup sweep, much later) discover it
      // the hard way.
      await this.prisma.downloadJob
        .update({
          where: { id: job.id },
          data: {
            status: "failed",
            error: "Something went wrong while preparing your download. Please try again.",
            completedAt: new Date(),
          },
        })
        .catch(() => {
          /* best-effort — if this also fails, the DB itself is the problem, not just the queue */
        });

      throw new ProcessingFailedException();
    }

    return { jobId: job.id };
  }

  async getJobStatus(id: string): Promise<JobStatusResponse> {
    const job = await this.prisma.downloadJob.findUnique({ where: { id } });
    if (!job) {
      throw new JobNotFoundException();
    }

    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error ?? undefined,
    };
  }

  async cancelJob(id: string): Promise<JobStatusResponse> {
    const job = await this.prisma.downloadJob.findUnique({ where: { id } });
    if (!job) {
      throw new JobNotFoundException();
    }

    // Already terminal — nothing to cancel, just report current state.
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return {
        id: job.id,
        status: job.status,
        progress: job.progress,
        error: job.error ?? undefined,
      };
    }

    const updated = await this.prisma.downloadJob.update({
      where: { id },
      data: { status: "cancelled" },
    });

    // Best-effort: pull it out of the queue if it hasn't started yet.
    // If it's already active, the worker itself must notice the
    // "cancelled" status mid-run and stop — that cooperative check
    // lands with the real processing loop in Phase 6.
    const bullJob = await this.queue.getJob(id);
    if (bullJob) {
      const state = await bullJob.getState();
      if (state === "waiting" || state === "delayed") {
        await bullJob.remove();
      }
    }

    return {
      id: updated.id,
      status: updated.status,
      progress: updated.progress,
      error: updated.error ?? undefined,
    };
  }

  /**
   * Live progress for a job as Server-Sent Events (Phase 14, item 19).
   * Existence is already verified by JobExistsGuard before this runs, so
   * this only needs the job's current row to seed the first event —
   * the guard's own lookup isn't reused here since a guard and a handler
   * don't share request-scoped state by default in this module's setup,
   * and a second read is cheap next to holding an SSE connection open.
   */
  async streamJobEvents(id: string): Promise<Observable<MessageEvent>> {
    const job = await this.prisma.downloadJob.findUnique({ where: { id } });
    if (!job) {
      throw new JobNotFoundException();
    }

    return this.queueEvents.streamJobEvents(id, {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error ?? undefined,
    });
  }

  /**
   * Resolves the completed output file for a job (Section 8: the API is
   * what actually owns the browser's HTTP connection, so it — not the
   * worker — streams the final bytes). Deterministic path: both the
   * worker (writing it) and the API (reading it) derive the same path
   * from jobId + formatId, no extra state needed.
   */
  async getJobFilePath(id: string): Promise<{ path: string; filename: string }> {
    const job = await this.prisma.downloadJob.findUnique({ where: { id } });
    if (!job) {
      throw new JobNotFoundException();
    }

    if (job.status !== "completed") {
      throw new JobNotReadyException();
    }

    const tempDir = this.config.getOrThrow<string>("TEMP_DIR");
    const filename = outputFileName(job.format);
    const path = safeTempFilePath(tempDir, job.id, filename);

    try {
      await fs.access(path);
    } catch {
      // Completed in the DB but the file's gone — TTL cleanup already
      // ran, or the worker's disk was reset. Same user-facing outcome
      // either way: the download is no longer available.
      throw new FileExpiredException();
    }

    const downloadName = `${sanitizeForFilename(job.title ?? job.id)}.${filename.split(".").pop()}`;
    return { path, filename: downloadName };
  }
}

function sanitizeForFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9 _.-]/g, "").trim().slice(0, 100) || "download";
}

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
    await this.urlValidator.validate(url);

    const timeoutMs = Number(this.config.get("ANALYZE_TIMEOUT_MS") ?? 60_000);
    return this.mediaAnalyzer.analyze(url, timeoutMs);
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
      throw new FileExpiredException();
    }

    const downloadName = `${sanitizeForFilename(job.title ?? job.id)}.${filename.split(".").pop()}`;
    return { path, filename: downloadName };
  }
}

function sanitizeForFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9 _.-]/g, "").trim().slice(0, 100) || "download";
}

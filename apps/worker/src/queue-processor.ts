import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { promises as fs } from "node:fs";
import type { VideoProcessingJobData } from "@video-downloader/types";
import { validateUrl, UnsafeUrlError, safeTempFilePath, safeTempJobDir } from "@video-downloader/security";
import {
  fetchYtDlpInfo,
  fetchYtDlpFormat,
  resolveFormatTarget,
  outputFileName,
  UnsupportedSourceError,
  VideoUnavailableError,
  ExtractionTimeoutError,
  ExtractionFailedError,
  FormatNotFoundError,
  FileTooLargeError,
} from "@video-downloader/media-extractor";
import { mergeVideoAudio, remuxToMp4, extractAudioToMp3 } from "./ffmpeg";
import { loadWorkerConfig } from "./config";
import { prisma } from "./prisma";
import { jobLogger } from "./logger";
import { captureUnexpectedError } from "./sentry";
import { jobsProcessedTotal, jobsFailedTotal, jobsRetriedTotal, jobProcessingDuration } from "./metrics";

const config = loadWorkerConfig();

// Budget the overall MAX_PROCESSING_TIME_SECONDS across extraction and
// each fetch step, leaving room for the ffmpeg step (which has its own
// natural bound via ffmpeg simply finishing or erroring).
const EXTRACT_TIMEOUT_MS = Math.min(30_000, config.maxProcessingTimeSeconds * 1000 * 0.2);
const FETCH_TIMEOUT_MS = config.maxProcessingTimeSeconds * 1000 * 0.6;

export async function processVideoJob(job: Job<VideoProcessingJobData>): Promise<void> {
  const { downloadJobId, requestId } = job.data;
  const log = jobLogger(downloadJobId, requestId);
  const startedAtMs = Date.now();

  const dbJob = await prisma.downloadJob.findUnique({ where: { id: downloadJobId } });
  if (!dbJob || dbJob.status === "cancelled") {
    log.info("Skipping job — missing or already cancelled");
    return;
  }

  log.info({ sourceUrl: dbJob.sourceUrl, format: dbJob.format }, "Starting job processing");

  await prisma.downloadJob.update({
    where: { id: downloadJobId },
    data: { status: "processing", startedAt: new Date() },
  });
  await job.updateProgress(0);

  const jobDir = safeTempJobDir(config.tempDir, downloadJobId);
  const setProgress = async (percent: number) => {
    await job.updateProgress(percent);
    // Progress ticks are informational, not critical — a transient DB
    // hiccup here shouldn't fail the whole job. Best-effort only.
    await prisma.downloadJob
      .update({ where: { id: downloadJobId }, data: { progress: percent } })
      .catch((err) => log.warn({ err }, "Progress update failed"));
  };

  try {
    // Re-resolve and re-validate right before touching the URL — the API
    // validated it at request time, but a hostname that resolved safely
    // then can resolve to a private IP now (DNS rebinding TOCTOU).
    await validateUrl(dbJob.sourceUrl);

    const info = await fetchYtDlpInfo(dbJob.sourceUrl, EXTRACT_TIMEOUT_MS);
    const target = resolveFormatTarget(info, dbJob.format);
    await setProgress(10);

    await fs.mkdir(jobDir, { recursive: true });

    const outputPath = safeTempFilePath(config.tempDir, downloadJobId, outputFileName(dbJob.format));
    const intermediates: string[] = [];

    if (target.kind === "video") {
      const videoTmp = safeTempFilePath(config.tempDir, downloadJobId, "video.tmp");
      intermediates.push(videoTmp);
      await fetchYtDlpFormat(dbJob.sourceUrl, target.videoFormatId, videoTmp, FETCH_TIMEOUT_MS);
      await setProgress(40);

      if (target.audioFormatId) {
        const audioTmp = safeTempFilePath(config.tempDir, downloadJobId, "audio.tmp");
        intermediates.push(audioTmp);
        await fetchYtDlpFormat(dbJob.sourceUrl, target.audioFormatId, audioTmp, FETCH_TIMEOUT_MS);
        await setProgress(60);

        await mergeVideoAudio(videoTmp, audioTmp, outputPath, info.duration, (p) =>
          setProgress(Math.min(99, 60 + Math.round(p * 0.35))),
        );
      } else {
        await remuxToMp4(videoTmp, outputPath, info.duration, (p) =>
          setProgress(Math.min(99, 60 + Math.round(p * 0.35))),
        );
      }
    } else {
      const audioTmp = safeTempFilePath(config.tempDir, downloadJobId, "audio.tmp");
      intermediates.push(audioTmp);
      await fetchYtDlpFormat(dbJob.sourceUrl, target.audioFormatId, audioTmp, FETCH_TIMEOUT_MS);
      await setProgress(50);

      await extractAudioToMp3(audioTmp, outputPath, target.bitrateKbps, info.duration, (p) =>
        setProgress(Math.min(99, 50 + Math.round(p * 0.45))),
      );
    }

    // Post-download size enforcement (Section 13/14). Sources that don't
    // report size upfront (so no earlier check was possible) are caught
    // here, after the fact, before the file ever gets a chance to be
    // downloaded by the user.
    const stat = await fs.stat(outputPath);
    const maxBytes = config.maxVideoSizeMb * 1024 * 1024;
    if (stat.size > maxBytes) {
      await fs.unlink(outputPath).catch(() => {});
      throw new FileTooLargeError();
    }

    await Promise.all(intermediates.map((p) => fs.unlink(p).catch(() => {})));

    await prisma.downloadJob.update({
      where: { id: downloadJobId },
      data: {
        status: "completed",
        progress: 100,
        title: info.title,
        duration: info.duration ?? null,
        fileSize: stat.size,
        completedAt: new Date(),
        // Refresh the TTL from completion time — this is the window the
        // finished file waits in temp storage for the user to click
        // Download, not the window processing itself took.
        expiresAt: new Date(Date.now() + config.tempFileTtlMinutes * 60_000),
      },
    });
    await job.updateProgress(100);

    jobsProcessedTotal.inc();
    jobProcessingDuration.observe((Date.now() - startedAtMs) / 1000);
    log.info({ fileSize: stat.size }, "Job completed successfully");
  } catch (err) {
    const message = friendlyMessage(err);
    const permanent = isUnrecoverable(err);

    if (!isKnownError(err)) {
      // A genuinely unexpected error (not one of our classified failure
      // modes) — worth alerting on, since it likely represents a real
      // bug rather than an expected user-driven outcome.
      captureUnexpectedError(err, { downloadJobId, requestId, sourceUrl: dbJob.sourceUrl });
    }

    // attemptsMade is the count of PRIOR attempts (0 on the first try),
    // so the current attempt number is attemptsMade + 1.
    const attemptsAllowed = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade + 1 >= attemptsAllowed;

    if (permanent || isFinalAttempt) {
      log.error({ err, permanent, attempt: job.attemptsMade + 1, attemptsAllowed }, `Job failed: ${message}`);

      // Best-effort: if Postgres is also having a bad moment, don't let
      // that turn into an unhandled rejection on top of the original
      // failure — log and move on. BullMQ still records the job as
      // failed either way.
      await prisma.downloadJob
        .update({
          where: { id: downloadJobId },
          data: { status: "failed", error: message, completedAt: new Date() },
        })
        .catch((dbErr) => log.error({ err: dbErr }, "Failed to record failure in DB"));

      await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});

      jobsFailedTotal.inc();
      jobProcessingDuration.observe((Date.now() - startedAtMs) / 1000);

      // UnrecoverableError tells BullMQ to stop retrying immediately,
      // regardless of attempts remaining — retrying a permanently
      // invalid format/URL/oversized file wastes time and just delays
      // the user's (already-known) failure.
      throw permanent ? new UnrecoverableError(message) : err instanceof Error ? err : new Error(message);
    }

    // Transient failure with retries remaining: clean up this attempt's
    // partial files (a retry starts fresh) and hand the row back to
    // "queued" rather than leaving it stuck on "processing" during the
    // backoff wait, or marking it "failed" for a problem that hasn't
    // actually failed for good yet.
    log.warn({ err, attempt: job.attemptsMade + 1, attemptsAllowed }, `Job failed, will retry: ${message}`);
    jobsRetriedTotal.inc();

    await prisma.downloadJob
      .update({ where: { id: downloadJobId }, data: { status: "queued", progress: 0 } })
      .catch((dbErr) => log.error({ err: dbErr }, "Failed to reset job for retry"));

    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});

    throw err instanceof Error ? err : new Error(message);
  }
}

function isKnownError(err: unknown): boolean {
  return (
    err instanceof UnsupportedSourceError ||
    err instanceof VideoUnavailableError ||
    err instanceof ExtractionTimeoutError ||
    err instanceof ExtractionFailedError ||
    err instanceof FormatNotFoundError ||
    err instanceof FileTooLargeError ||
    err instanceof UnsafeUrlError
  );
}

function isUnrecoverable(err: unknown): boolean {
  // Permanent failures: retrying with the same URL/format won't change
  // the outcome, so retry attempts/backoff would only delay the user's
  // (already-known) result.
  return (
    err instanceof UnsupportedSourceError ||
    err instanceof VideoUnavailableError ||
    err instanceof FormatNotFoundError ||
    err instanceof FileTooLargeError ||
    err instanceof UnsafeUrlError
  );
  // Deliberately NOT unrecoverable: ExtractionTimeoutError (the source
  // might just be slow this once) and ExtractionFailedError /
  // unclassified errors (ambiguous — could be a transient yt-dlp/ffmpeg
  // hiccup, and BullMQ's attempts cap bounds the cost of being wrong).
}

function friendlyMessage(err: unknown): string {
  if (isKnownError(err)) {
    return (err as Error).message;
  }
  return "Something went wrong while preparing your download. Please try again.";
}

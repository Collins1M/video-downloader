import { promises as fs } from "node:fs";
import { safeTempJobDir } from "@video-downloader/security";
import { loadWorkerConfig } from "./config";
import { prisma } from "./prisma";
import { logger } from "./logger";

const config = loadWorkerConfig();

// A job stuck in queued/processing well past its own processing budget
// is abandoned, not slow — BullMQ's lockDuration should catch most of
// these via stalled-job recovery, but this is a second, DB-level
// backstop in case a worker process died without BullMQ noticing.
const ABANDONED_AFTER_MS = config.maxProcessingTimeSeconds * 1000 * 2;

export async function cleanupExpiredJobs(): Promise<void> {
  const now = new Date();

  // Section 9/16: terminal jobs past their expiresAt — remove the temp
  // file (if any survived) and the DB row so nothing is retained
  // indefinitely.
  const expired = await prisma.downloadJob.findMany({
    where: {
      expiresAt: { lt: now },
      status: { in: ["completed", "failed", "cancelled"] },
    },
    select: { id: true },
  });

  for (const { id } of expired) {
    await fs.rm(safeTempJobDir(config.tempDir, id), { recursive: true, force: true }).catch(() => {});
  }

  if (expired.length > 0) {
    await prisma.downloadJob.deleteMany({ where: { id: { in: expired.map((j: { id: string }) => j.id) } } });
  }

  // Abandoned in-flight jobs — mark failed and clean up so they don't
  // sit as "processing" forever and don't count against a user's
  // concurrent-job limit indefinitely.
  const abandonedCutoff = new Date(Date.now() - ABANDONED_AFTER_MS);
  const abandoned = await prisma.downloadJob.findMany({
    where: {
      status: { in: ["queued", "processing"] },
      createdAt: { lt: abandonedCutoff },
    },
    select: { id: true },
  });

  for (const { id } of abandoned) {
    await fs.rm(safeTempJobDir(config.tempDir, id), { recursive: true, force: true }).catch(() => {});
  }

  if (abandoned.length > 0) {
    await prisma.downloadJob.updateMany({
      where: { id: { in: abandoned.map((j: { id: string }) => j.id) } },
      data: {
        status: "failed",
        error: "This download took too long and was cancelled. Please try again.",
        completedAt: now,
      },
    });
  }

  if (expired.length > 0 || abandoned.length > 0) {
    logger.info(
      { expiredCount: expired.length, abandonedCount: abandoned.length },
      "Cleanup sweep completed",
    );
  }
}

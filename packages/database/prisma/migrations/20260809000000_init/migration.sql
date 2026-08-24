-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "download_jobs" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "format" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "duration" INTEGER,
    "fileSize" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "sessionId" TEXT,

    CONSTRAINT "download_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "download_jobs_status_idx" ON "download_jobs"("status");

-- CreateIndex
CREATE INDEX "download_jobs_expiresAt_idx" ON "download_jobs"("expiresAt");

-- CreateIndex
CREATE INDEX "download_jobs_sessionId_idx" ON "download_jobs"("sessionId");
